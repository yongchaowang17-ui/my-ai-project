/**
 * POST /api/decompose/preview
 *
 * 扫描 03_Exam_Final，返回每个文件的拆解预览（不写入磁盘）
 * 用于可视化预处理界面
 *
 * 三层检测策略：
 *   1. 增强正则（Unicode罗马数字 + OCR损坏 + 无空格）
 *   2. 关键词推断（Section A、Reading Comprehension、Translation等锚点）
 *   3. 位置推断兜底（基于已确定Part推断缺失Part的行号范围）
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { FINAL_ROOT } from '@/lib/fs-utils';
import type { ApiResponse } from '@/lib/types';

// ===== 类型 =====

interface BlockPreview {
  partIndex: number;
  partName: string;
  filename: string;
  lineCount: number;
  byteLength: number;
  preview: string;
  partCompleteness: 'complete' | 'incomplete' | 'none';
}

interface FilePreview {
  sourcePath: string;
  sourceFilename: string;
  setId: string;
  examType: string;
  fileType: string;
  blocks: BlockPreview[];
  totalPartsDetected: number;
  status: 'ready' | 'exists' | 'partial' | 'flagged' | 'error';
  errorMsg?: string;
}

// ===== 常量 =====

const PART_NAMES: Record<number, string> = {
  1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation',
};

// ===== 工具函数 =====

/** 从 03 区路径推断 setId */
function extractSetId(sourcePath: string, sourceFilename: string): string | null {
  const examMatch = sourcePath.match(/(?:03_Exam_Final\/)?(CET\d|TEM\d)\//);
  if (!examMatch) return null;
  const exam = examMatch[1].toUpperCase();

  const stdM = sourceFilename.match(/^(\d{4}_\d{2}_S\d+)_/);
  if (stdM) return exam + '_' + stdM[1];

  const yearM = sourceFilename.match(/(20\d{2})[._-](\d{2})/);
  const setM = sourceFilename.match(/[Ss]et[_]?(\d+)/);
  if (yearM) return exam + '_' + yearM[1] + '_' + yearM[2] + '_S' + (setM ? setM[1] : '1');

  return null;
}

// ===== 第1层：增强正则检测 =====
      const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };  // CET6 翻译标记为 Part V，归为 Part 4

/** Unicode罗马数字 → Part编号 */
function parseUnicodeRoman(ch: string): number | null {
  const code = ch.charCodeAt(0);
  const map: Record<number, number> = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5, 0x2165: 6 };
  return map[code] ?? null;
}

/** OCR损坏字符 → Part编号 */
function parseOcrCorrupt(text: string): number | null {
  // 匹配 "Part" 后跟空格（可选）+ 损坏字符
      const ocrMatch = text.match(/Part\s*([HhKkNnFfWwIl][\[\]_]*)\b/);
  if (!ocrMatch) {
    // 特殊字符：皿
    if (/Part\s*皿/.test(text)) return 4;
    return null;
  }
  const ch = ocrMatch[1][0].toUpperCase();
  // H/K/Il/ll → II(2), N/F → IV(4), m/in → III(3), W → IV(4)
      if ('HK'.includes(ch)) return 2;
  if ('NF'.includes(ch)) return 4;
  if (ch === 'M' || ch === 'I') {
    // Part m / Part in → III(3), Part Il → II(2)
      const rest = ocrMatch[1];
    if (/^[Mm](?![a-zA-Z])/.test(rest) || /^in\b/.test(rest)) return 3;
    return 2; // Il, ll
  }
  if (ch === 'W') return 4;
  return null;
}

/** 扩展OCR损坏处理：覆盖更多变体 */
function parseOcrCorruptExtended(text: string): number | null {
  // ]I 鈫 III(3), :U: 鈫 II(2), N 鈫 IV(4)
      if (/Part\s*\]I/.test(text)) return 3;  // # Part ]I Reading
  if (/Part\s*:U:/.test(text)) return 2;  // # Part :U: Listening
      if (/Part\s*N\b/.test(text) && !/Part\s*New/.test(text)) return 4;  // # Part N Translation
      if (/Part\s*IIII/.test(text)) return 4; // # Part IIII
  if (/Part\s*\u516c/.test(text)) return 4; // Part 鍏? (OCR of 鍏? IV)
      return parseOcrCorrupt(text);
}

/**
 * 鐗规畩澶勭悊锛氬綋 Part I 鍚庤窡 Listening/Comprehension鏃讹紝瀹為檯鏄 Part II
 */
function contextualFixPartNumber(partIndex: number, line: string): number {
  // Part I + Listening = Part II
  if (partIndex === 1 && /Listening/i.test(line) && !/Reading/i.test(line)) {
    return 2;
  }
  // Part II + Reading = Part III (解析文件中 Part II 常指 Reading)
  if (partIndex === 2 && /Reading|Comprehension/i.test(line) && !/Listening/i.test(line)) {
    return 3;
  }
  return partIndex;
}


/** 第1层：从标题行提取Part编号 */
function extractPartNumber(headingLine: string): number | null {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();

  // (a) Unicode罗马数字（含混合情况如 "IⅢ" = ASCII I + Unicode Ⅲ）
  // 匹配 Part 后跟任意可选 ASCII 前缀 + Unicode 罗马数字
      const uniMatch = stripped.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
  if (uniMatch) {
    const r = parseUnicodeRoman(uniMatch[1]);
    if (r !== null) return r;
  }

  // (b) 标准ASCII罗马数字（排除后面紧跟 Unicode 的情况）
      const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V)(?![\u2160-\u2165\w])\b/i);
  if (romanMatch) {
    const r = romanMatch[1].toUpperCase();
    if (ROMAN_MAP[r]) return ROMAN_MAP[r];
  }

  // (c) 阿拉伯数字 Part 1-5
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) {
    const n = parseInt(arabicMatch[1], 10);
    if (n >= 1 && n <= 5) return n === 5 ? 4 : n;  // Part 5 → Part 4 (Translation)
  }

  // (d) OCR损坏字符
  return parseOcrCorruptExtended(stripped);
}

// ===== 第2层：关键词推断 =====

/** 第2层：根据全文关键词锚点推断缺失的Part */
function inferPartsByKeywords(
  lines: string[], foundParts: Set<number>
): Array<{ partIndex: number; lineIndex: number }> {
  const result: Array<{ partIndex: number; lineIndex: number }> = [];

  // Part I Writing
  if (!foundParts.has(1)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,4}\s+Part\s+I\b/i.test(line) && !/Comprehension|Listening/i.test(line)) {
        result.push({ partIndex: 1, lineIndex: i }); foundParts.add(1); break;
      }
      if (/^#{1,4}\s+Writing\b/i.test(line)) {
        result.push({ partIndex: 1, lineIndex: i }); foundParts.add(1); break;
      }
      if (/Directions\s*[:：].*(?:write|essay|submission|inviting)/i.test(line) && i < 60) {
        result.push({ partIndex: 1, lineIndex: i }); foundParts.add(1); break;
      }
    }
  }

  // Part II Listening
  if (!foundParts.has(2)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+(?:Part\s+II\s+)?Listening/i.test(lines[i])) {
        result.push({ partIndex: 2, lineIndex: i }); foundParts.add(2); break;
      }
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) {
        const nextFew = lines.slice(i + 1, i + 5).join(' ');
        if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
          result.push({ partIndex: 2, lineIndex: i }); foundParts.add(2); break;
        }
      }
    }
  }

  // Part III Reading Comprehension
  if (!foundParts.has(3)) {
    for (let i = 0; i < lines.length; i++) {
      if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) {
        result.push({ partIndex: 3, lineIndex: i }); foundParts.add(3); break;
      }
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i]) && foundParts.has(2)) {
        const p2Line = result.find(r => r.partIndex === 2)?.lineIndex || 0;
        if (i > p2Line + 30) {
          result.push({ partIndex: 3, lineIndex: i }); foundParts.add(3); break;
        }
      }
    }
  }

  // Part IV Translation
  if (!foundParts.has(4)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+.*Translation\b/i.test(lines[i]) && !/Comprehension/i.test(lines[i])) {
        result.push({ partIndex: 4, lineIndex: i }); foundParts.add(4); break;
      }
      if (/translate\s+a\s+passage\s+from\s+Chinese/i.test(lines[i])) {
        result.push({ partIndex: 4, lineIndex: i }); foundParts.add(4); break;
      }
    }
  }

  return result;
}
function inferByPosition(
  lines: string[], existing: Array<{ partIndex: number; lineIndex: number }>
): Array<{ partIndex: number; lineIndex: number }> {
  const result: Array<{ partIndex: number; lineIndex: number }> = [];
  const found = new Set(existing.map(h => h.partIndex));
  const sorted = [...existing].sort((a, b) => a.lineIndex - b.lineIndex);

  if (sorted.length === 0) return result;

  // Part I Writing: 全文扫描 Writing 关键词，而非默认文件开头
      if (!found.has(1)) {
    let writingLine = -1;
    // 优先找 "Part I" 标题
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Part\s+I\b/i.test(lines[i]) && !/Comprehension|Listening/i.test(lines[i])) {
        writingLine = i; break;
      }
    }
    // 找 Writing 关键词（含 HTML 表格）
      if (writingLine === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/^#{1,4}\s+Writing\b/i.test(lines[i])) { writingLine = i; break; }
        if (/<td>\s*Part\s+I\s+Writing/i.test(lines[i])) { writingLine = i; break; }
      }
    }
    // 找 Writing Directions（扩展匹配）
      if (writingLine === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/Directions\s*[:：].*(?:write|essay|submission|inviting)/i.test(lines[i])) { writingLine = i; break; }
      }
    }
    // 兜底：如果找不到 Writing 关键词，只有在文件开头有内容时才推断
      if (writingLine === -1 && sorted.length > 0 && sorted[0].lineIndex > 30) {
      // 检查开头是否像前言（含 "考生"、"考试"、"TEST" 等）
      const preamble = lines.slice(0, sorted[0].lineIndex).join(' ');
      const isPreamble = /考生|考试|TEST|答题卡|试题册/.test(preamble);
      if (!isPreamble) {
        writingLine = 0; // 开头不是前言，可能是 Writing
      }
    }
    if (writingLine !== -1) result.push({ partIndex: 1, lineIndex: writingLine });
  }

  // 缺口推断：在已知 Part 之间找缺失的 Part
  // 先找文件中所有 Section A 的位置（用于定位 Listening/Reading 边界）
      const sectionALines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) sectionALines.push(i);
  }

  // Part II Listening: 第一个 Section A（验证 Directions 含听力关键词）
      if (!found.has(2)) {
    for (const saLine of sectionALines) {
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        result.push({ partIndex: 2, lineIndex: saLine });
        break;
      }
    }
  }

  // Part III Reading: 第二个 Section A 的位置（CET4）或 Reading Comprehension 关键词
      if (!found.has(3)) {
    let p3Line = -1;
    // 找第二个 Section A（Reading 的 Section A）
      if (sectionALines.length >= 2 && found.has(2)) {
      const secondSectionA = sectionALines.find(l => l > (result.find(r => r.partIndex === 2)?.lineIndex || 0) + 50);
      if (secondSectionA) p3Line = secondSectionA;
    }
    // 找 Reading Comprehension 关键词
      if (p3Line === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) {
          p3Line = i; break;
        }
      }
    }
    // 兜底：在 P2 和 P4 之间的 55% 处
      if (p3Line === -1 && sorted.length >= 1) {
      const p2Info = result.find(r => r.partIndex === 2) || sorted[0];
      const last = sorted[sorted.length - 1];
      if (last.partIndex === 4 && last.lineIndex > 50) {
        p3Line = p2Info.lineIndex + Math.floor((last.lineIndex - p2Info.lineIndex) * 0.55);
      }
    }
    if (p3Line !== -1) result.push({ partIndex: 3, lineIndex: p3Line });
  }

  // Part IV Translation: 文件末尾（仅在 P4 缺失时）
      if (!found.has(4) && sorted.length > 0) {
    result.push({ partIndex: 4, lineIndex: lines.length - 10 });
  }

  return result;
}

// ===== 主检测流程 =====

interface PartHeader {
  partIndex: number;
  lineIndex: number;
  source: 'title' | 'keyword' | 'position';
}

/** 三层Part检测主入口 */
function detectAllParts(allLines: string[]): PartHeader[] {
  const headers: PartHeader[] = [];
  const foundParts = new Set<number>();

  // 第1层：增强正则
  for (let i = 0; i < allLines.length; i++) {
    const pn = extractPartNumber(allLines[i]);
    if (pn !== null && pn >= 1 && pn <= 4) {
      if (!foundParts.has(pn)) {
        headers.push({ partIndex: pn, lineIndex: i, source: 'title' });
        foundParts.add(pn);
      } else {
        // 閲嶅 Part 鍙凤細涓婁笅鏂囦慨姝?
      const fixed = contextualFixPartNumber(pn, allLines[i]);
        if (fixed !== pn && !foundParts.has(fixed)) {
          headers.push({ partIndex: fixed, lineIndex: i, source: 'title' });
          foundParts.add(fixed);
        }
      }
    }
  }

  // 第2层：关键词推断
  const snapBefore = new Set(foundParts); const kwResults = inferPartsByKeywords(allLines, foundParts);
  for (const r of kwResults) {
    if (!foundParts.has(r.partIndex)) {
      headers.push({ partIndex: r.partIndex, lineIndex: r.lineIndex, source: 'keyword' });
      foundParts.add(r.partIndex);
    }
  }

  // 第3层：位置推断
  const snapBeforePos = new Set(foundParts); const posResults = inferByPosition(allLines, headers);
  for (const r of posResults) {
    if (!foundParts.has(r.partIndex)) {
      headers.push({ partIndex: r.partIndex, lineIndex: r.lineIndex, source: 'position' });
      foundParts.add(r.partIndex);
    }
  }

    // 后处理: 检查 Part 2 是否实际是 Reading (解析文件中 Part II 常指 Reading)
  const p2 = headers.find(h => h.partIndex === 2);
  if (p2) {
    const line2 = allLines[p2.lineIndex + 2] || allLines[p2.lineIndex] || "";
    if (/Reading/i.test(line2) && !/Listening/i.test(line2)) {
      p2.partIndex = 3;
      foundParts.delete(2);
      foundParts.add(3);
    }
  }
headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return headers;
}

// ===== API 路由 =====

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const filterExam = body.exam as string | undefined;
    const filterType = body.type as string | undefined;

    if (!fs.existsSync(FINAL_ROOT)) {
      return NextResponse.json({ success: true, data: [] } satisfies ApiResponse<FilePreview[]>);
    }

    const previews: FilePreview[] = [];
    const FUSION_ROOT = path.join(path.dirname(FINAL_ROOT), '04_Fusion_Area');

    for (const level of ['CET4', 'CET6']) {
      if (filterExam && filterExam !== level) continue;
      const levelDir = path.join(FINAL_ROOT, level);
      if (!fs.existsSync(levelDir)) continue;

      for (const type of ['Question', 'Analysis']) {
        if (filterType && filterType !== type) continue;
        const typeDir = path.join(levelDir, type);
        if (!fs.existsSync(typeDir)) continue;

        const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const sourcePath = level + '/' + type + '/' + file;
          const setId = extractSetId(sourcePath, file);
          if (!setId) {
            previews.push({
              sourcePath, sourceFilename: file,
              setId: '?', examType: level, fileType: type,
              blocks: [], totalPartsDetected: 0,
              status: 'error', errorMsg: '无法推断 setId',
            });
            continue;
          }

          try {
            const absPath = path.join(typeDir, file);
            const raw = fs.readFileSync(absPath, 'utf-8');
            const { content } = matter(raw);
            const allLines = content.split('\n');

            // 三层检测
            const partHeaders = detectAllParts(allLines);
            const totalPartsDetected = partHeaders.length;
            const partCompleteness: BlockPreview['partCompleteness'] =
              totalPartsDetected >= 4 ? 'complete' : totalPartsDetected > 0 ? 'incomplete' : 'none';

            // 构建块
            const blocks: BlockPreview[] = [];
            const side = type === 'Question' ? 'Q' : 'A';

            if (partHeaders.length === 0) {
              const partName = 'Writing';
              const filename = setId + '_' + side + '_01_' + partName + '.md';
              blocks.push({
                partIndex: 1, partName, filename,
                lineCount: allLines.length,
                byteLength: Buffer.byteLength(content, 'utf-8'),
                preview: allLines.slice(0, 10).join('\n'),
                partCompleteness,
              });
            } else {
              for (let i = 0; i < partHeaders.length; i++) {
                const start = partHeaders[i].lineIndex;
                const end = i + 1 < partHeaders.length ? partHeaders[i + 1].lineIndex : allLines.length;
                const blockLines = allLines.slice(start, end);
                if (blockLines.length === 0) continue; // 跳过空块
                const blockContent = blockLines.join('\n');
                const partIndex = partHeaders[i].partIndex;
                const partName = PART_NAMES[partIndex] || 'Part' + partIndex;
                const filename = setId + '_' + side + '_01_' + partName + '.md';

                blocks.push({
                  partIndex, partName, filename,
                  lineCount: blockLines.length,
                  byteLength: Buffer.byteLength(blockContent, 'utf-8'),
                  preview: blockLines.slice(0, 10).join('\n'),
                  partCompleteness,
                });
              }
            }

            // 检查目标是否已存在
            const examLevelDir = path.join(FUSION_ROOT, level);
            const targetDir = path.join(examLevelDir, setId, type);
            const existCount = blocks.filter(b => fs.existsSync(path.join(targetDir, b.filename))).length;
            let status: FilePreview['status'] = existCount === blocks.length ? 'exists' : existCount > 0 ? 'partial' : 'ready';
            // Part 标题不完整的文件标记为 flagged
      if (partCompleteness !== 'complete' && status === 'ready') { status = 'flagged'; }

            previews.push({
              sourcePath, sourceFilename: file,
              setId, examType: level, fileType: type,
              blocks, totalPartsDetected, status,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            previews.push({
              sourcePath, sourceFilename: file,
              setId: '?', examType: level, fileType: type,
              blocks: [], totalPartsDetected: 0,
              status: 'error', errorMsg: msg,
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, data: previews } satisfies ApiResponse<FilePreview[]>);
  } catch (error) {
    console.error('[DECOMPOSE PREVIEW ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
