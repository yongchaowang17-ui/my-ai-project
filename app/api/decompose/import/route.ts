/**
 * POST /api/decompose/import
 *
 * 确认后批量写入 04_Fusion_Area/{examLevel}/{setId}/{type}/
 * Body: { items: ImportItem[] }
 *
 * 支持两种模式：
 * 1. 标准模式：blocks 不带 content → 从源文件按 Part 标题切分
 * 2. 编辑模式：blocks 带 content → 直接使用传入的内容
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { FINAL_ROOT, FUSION_ROOT } from '@/lib/fs-utils';
import { loadFingerprint, saveFingerprint } from '@/lib/fingerprint';
import crypto from 'crypto';
import type { ApiResponse } from '@/lib/types';

interface ImportItem {
  sourcePath: string;
  blocks: Array<{
    partIndex: number;
    partName: string;
    filename: string;
    content?: string;  // 编辑模式：直接传入内容
  }>;
}

interface ImportResult {
  committed: number;
  skipped: number;
  errors: string[];
  files: string[];
}

/** 增强版 Part 编号提取（兼容 Unicode 罗马数字 + OCR 损坏） */
function extractPartNum(line: string): number | null {
  const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };
  const stripped = line.replace(/^#{1,4}\s+/, '').trim();
  // 标准 ASCII 罗马数字
  const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V)\b/i);
  if (romanMatch) {
    const r = romanMatch[1].toUpperCase();
    if (ROMAN_MAP[r]) return ROMAN_MAP[r];
  }
  // 阿拉伯数字
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) {
    const n = parseInt(arabicMatch[1], 10);
    if (n >= 1 && n <= 5) return n === 5 ? 4 : n;
  }
  // Unicode 罗马数字: Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ
  const uniMatch = stripped.match(/Part\s*([\u2160-\u2165])/);
  if (uniMatch) {
    const code = uniMatch[1].charCodeAt(0);
    const uniMap: Record<number, number> = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5, 0x2165: 6 };
    if (uniMap[code]) return uniMap[code];
  }
  // OCR 损坏字符映射
  const ocrMatch = stripped.match(/Part\s*([HhKkNnFfWwIl][\[\]_]*)\b/);
  if (ocrMatch) {
    const ch = ocrMatch[1][0].toUpperCase();
    if ('HK'.includes(ch)) return 2;
    if ('NF'.includes(ch)) return 4;
    if (ch === 'M' || ch === 'I') {
      const rest = ocrMatch[1];
      if (/^[Mm](?![a-zA-Z])/.test(rest) || /^in\b/.test(rest)) return 3;
      return 2;
    }
    if (ch === 'W') return 4;
  }
  if (/Part\s*皿/.test(stripped)) return 4;
  return null;
}

/** OCR损坏字符扩展处理 */
function parseOcrCorruptExtended(text: string): number | null {
  if (/Part\s*\]I/.test(text)) return 3;
  if (/Part\s*:U:/.test(text)) return 2;
  if (/Part\s*N\b/.test(text) && !/Part\s*New/.test(text)) return 4;
  if (/Part\s*IIII/.test(text)) return 4;
  if (/Part\s*皿/.test(text)) return 4;
  return null;
}

/** 上下文修正：Part I + Listening = Part II */
function contextualFixPartNumber(partIndex: number, line: string): number {
  if (partIndex === 1 && /Listening/i.test(line) && !/Reading/i.test(line)) return 2;
  if (partIndex === 2 && /Reading/i.test(line) && !/Listening/i.test(line)) return 3;
  return partIndex;
}

/** 增强版 Part 编号提取（与 preview API 一致） */
function extractPartNumber(headingLine: string): number | null {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();
  // Unicode罗马数字
  const uniMatch = stripped.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
  if (uniMatch) {
    const code = uniMatch[1].charCodeAt(0);
    const map: Record<number, number> = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5 };
    if (map[code]) return map[code];
  }
  // ASCII罗马数字
  const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };
  const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V)(?![\u2160-\u2165\w])\b/i);
  if (romanMatch) {
    const r = romanMatch[1].toUpperCase();
    if (ROMAN_MAP[r]) return ROMAN_MAP[r];
  }
  // 阿拉伯数字
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) {
    const n = parseInt(arabicMatch[1], 10);
    if (n >= 1 && n <= 5) return n === 5 ? 4 : n;
  }
  // OCR损坏
  const ocrExt = parseOcrCorruptExtended(stripped);
  if (ocrExt !== null) return ocrExt;
  const ocrMatch = stripped.match(/Part\s*([HhKkNnFfWwIl][\[\]_]*)\b/);
  if (ocrMatch) {
    const ch = ocrMatch[1][0].toUpperCase();
    if ('HK'.includes(ch)) return 2;
    if ('NF'.includes(ch)) return 4;
    if (ch === 'M' || ch === 'I') {
      const rest = ocrMatch[1];
      if (/^[Mm](?![a-zA-Z])/.test(rest) || /^in\b/.test(rest)) return 3;
      return 2;
    }
    if (ch === 'W') return 4;
  }
  return null;
}

/** 关键词推断缺失Part */
function inferPartsByKeywords(lines: string[], foundParts: Set<number>): Array<{partIndex: number; lineIndex: number}> {
  const result: Array<{partIndex: number; lineIndex: number}> = [];
  if (!foundParts.has(1)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,4}\s+Part\s+I\b/i.test(line) && !/Comprehension|Listening/i.test(line)) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
      if (/^#{1,4}\s+Writing\b/i.test(line)) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
      if (/<td>\s*Part\s+I\s+Writing/i.test(line)) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
      if (/Directions\s*[:：].*(?:write|essay|submission|inviting)/i.test(line) && i < 60) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
    }
  }
  if (!foundParts.has(2)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+(?:Part\s*(?:I{1,2}|Ⅱ)\s+)?Listening/i.test(lines[i])) { result.push({partIndex:2,lineIndex:i}); foundParts.add(2); break; }
      if (/^#{1,4}\s+Listening\b/i.test(lines[i])) { result.push({partIndex:2,lineIndex:i}); foundParts.add(2); break; }
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) {
        const nextFew = lines.slice(i+1, i+5).join(' ');
        if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) { result.push({partIndex:2,lineIndex:i}); foundParts.add(2); break; }
      }
    }
  }
  if (!foundParts.has(3)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Reading\s+Comprehension/i.test(lines[i])) { result.push({partIndex:3,lineIndex:i}); foundParts.add(3); break; }
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i]) && foundParts.has(2)) {
        const p2Line = result.find(r => r.partIndex === 2)?.lineIndex || 0;
        if (i > p2Line + 30) { result.push({partIndex:3,lineIndex:i}); foundParts.add(3); break; }
      }
    }
  }
  if (!foundParts.has(4)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+.*Translation\b/i.test(lines[i]) && !/Comprehension/i.test(lines[i])) { result.push({partIndex:4,lineIndex:i}); foundParts.add(4); break; }
      if (/^#{1,4}\s+Part\s+(?:IV|N|Ⅳ)\b/i.test(lines[i]) && !/Listening|Reading/i.test(lines[i])) { result.push({partIndex:4,lineIndex:i}); foundParts.add(4); break; }
      if (/translate\s+a\s+passage\s+from\s+Chinese/i.test(lines[i])) { result.push({partIndex:4,lineIndex:i}); foundParts.add(4); break; }
    }
  }
  return result;
}

/** 位置推断兜底 */
function inferByPosition(lines: string[], existing: Array<{partIndex: number; lineIndex: number}>): Array<{partIndex: number; lineIndex: number}> {
  const result: Array<{partIndex: number; lineIndex: number}> = [];
  const found = new Set(existing.map(h => h.partIndex));
  const sorted = [...existing].sort((a, b) => a.lineIndex - b.lineIndex);
  if (sorted.length === 0) return result;

  // Part I Writing
  if (!found.has(1)) {
    let writingLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Part\s+I\b/i.test(lines[i]) && !/Comprehension|Listening/i.test(lines[i])) { writingLine = i; break; }
    }
    if (writingLine === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/^#{1,4}\s+Writing\b/i.test(lines[i])) { writingLine = i; break; }
        if (/<td>\s*Part\s+I\s+Writing/i.test(lines[i])) { writingLine = i; break; }
      }
    }
    if (writingLine === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/Directions\s*[:：].*(?:write|essay|submission|inviting)/i.test(lines[i])) { writingLine = i; break; }
      }
    }
    if (writingLine !== -1) result.push({partIndex: 1, lineIndex: writingLine});
  }

  // Part II Listening
  if (!found.has(2)) {
    const sectionALines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) sectionALines.push(i);
    }
    for (const saLine of sectionALines) {
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        result.push({partIndex: 2, lineIndex: saLine});
        break;
      }
    }
  }

  // Part III Reading
  if (!found.has(3)) {
    const sectionALines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) sectionALines.push(i);
    }
    let p3Line = -1;
    if (sectionALines.length >= 2 && found.has(2)) {
      const p2Line = result.find(r => r.partIndex === 2)?.lineIndex || sorted[0]?.lineIndex || 0;
      const secondSectionA = sectionALines.find(l => l > p2Line + 50);
      if (secondSectionA) p3Line = secondSectionA;
    }
    if (p3Line === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) { p3Line = i; break; }
      }
    }
    if (p3Line !== -1) result.push({partIndex: 3, lineIndex: p3Line});
  }

  // Part IV Translation
  if (!found.has(4)) {
    const sorted2 = [...existing, ...result].sort((a, b) => a.lineIndex - b.lineIndex);
    if (sorted2.length > 0) {
      const last = sorted2[sorted2.length - 1];
      if (last.partIndex !== 4) {
        result.push({partIndex: 4, lineIndex: lines.length - 10});
      }
    }
  }

  return result;
}

/** 三层Part检测主入口 */
function detectAllParts(allLines: string[]): Array<{partIndex: number; lineIndex: number}> {
  const headers: Array<{partIndex: number; lineIndex: number}> = [];
  const foundParts = new Set<number>();

  // 第1层：增强正则
  for (let i = 0; i < allLines.length; i++) {
    const pn = extractPartNumber(allLines[i]);
    if (pn !== null && pn >= 1 && pn <= 4) {
      if (!foundParts.has(pn)) {
        headers.push({partIndex: pn, lineIndex: i});
        foundParts.add(pn);
      } else {
        const fixed = contextualFixPartNumber(pn, allLines[i]);
        if (fixed !== pn && !foundParts.has(fixed)) {
          headers.push({partIndex: fixed, lineIndex: i});
          foundParts.add(fixed);
        }
      }
    }
  }

  // 第2层：关键词推断
  const snapBefore = new Set(foundParts); const kwResults = inferPartsByKeywords(allLines, foundParts);
  for (const r of kwResults) {
    if (!foundParts.has(r.partIndex)) {
      headers.push({partIndex: r.partIndex, lineIndex: r.lineIndex});
      foundParts.add(r.partIndex);
    }
  }

  // 第3层：位置推断
  const snapBeforePos = new Set(foundParts); const posResults = inferByPosition(allLines, headers);
  for (const r of posResults) {
    if (!foundParts.has(r.partIndex)) {
      headers.push({partIndex: r.partIndex, lineIndex: r.lineIndex});
      foundParts.add(r.partIndex);
    }
  }

  headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return headers;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少 items 数组' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const fp = loadFingerprint();
    const result: ImportResult = { committed: 0, skipped: 0, errors: [], files: [] };

    for (const item of body.items as ImportItem[]) {
      const fileType = item.sourcePath.includes('Question') ? 'Question' : 'Analysis';

      // 读取源文件，解析 Part 标题用于标准模式切分
      const sourceAbs = path.join(FINAL_ROOT, item.sourcePath);
      let sourceLines: string[] = [];
      let sourceContent = '';
      const partHeaders: Array<{ partIndex: number; lineIndex: number }> = [];

      if (fs.existsSync(sourceAbs)) {
        const raw = fs.readFileSync(sourceAbs, 'utf-8');
        const { content } = matter(raw);
        sourceContent = content;
        sourceLines = content.split('\n');
        // 使用三层检测（与 preview API 一致）
        const detected = detectAllParts(sourceLines);
        for (const h of detected) {
          if (!partHeaders.find(ph => ph.partIndex === h.partIndex)) {
            partHeaders.push({ partIndex: h.partIndex, lineIndex: h.lineIndex });
          }
        }
        partHeaders.sort((a, b) => a.lineIndex - b.lineIndex);
      }

      // 写入每个块
      for (const blockInfo of item.blocks) {
        // 优先使用编辑后的内容（编辑模式），否则从源文件切分（标准模式）
        let blockContent = blockInfo.content ?? '';
        if (!blockContent && partHeaders.length > 0) {
          const idx = partHeaders.findIndex(h => h.partIndex === blockInfo.partIndex);
          if (idx !== -1) {
            const start = partHeaders[idx].lineIndex;
            const end = idx + 1 < partHeaders.length ? partHeaders[idx + 1].lineIndex : sourceLines.length;
            blockContent = sourceLines.slice(start, end).join('\n');
          }
        } else if (!blockContent && partHeaders.length === 0) {
          // 无 Part 标题，整个文件内容作为单个块
          blockContent = sourceContent;
        }

        // 从 filename 提取 setId
        const setIdMatch = blockInfo.filename.match(/^(CET\d_\d{4}_\d{2}_S\d+)_/);
        if (!setIdMatch) {
          result.errors.push('无法从文件名提取 setId: ' + blockInfo.filename);
          continue;
        }
        const fileSetId = setIdMatch[1];
        const examLevel = fileSetId.split('_')[0];

        // 目标路径
        const targetDir = path.join(FUSION_ROOT, examLevel, fileSetId, fileType);
        const targetFile = path.join(targetDir, blockInfo.filename);
        const relativeTarget = '04_Fusion_Area/' + examLevel + '/' + fileSetId + '/' + fileType + '/' + blockInfo.filename;

        // 指纹检查
        const finalHash = crypto.createHash('sha256').update(blockContent).digest('hex').slice(0, 16);
        if (fp[relativeTarget] === finalHash && fs.existsSync(targetFile)) {
          result.skipped++;
          continue;
        }

        try {
          fs.mkdirSync(targetDir, { recursive: true });
          fs.writeFileSync(targetFile, blockContent, 'utf-8');
          fp[relativeTarget] = finalHash;
          result.committed++;
          result.files.push(relativeTarget);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(relativeTarget + ': ' + msg);
        }
      }
    }

    saveFingerprint(fp);

    return NextResponse.json({
      success: true,
      data: result,
    } satisfies ApiResponse<ImportResult>);
  } catch (error) {
    console.error('[DECOMPOSE IMPORT ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
