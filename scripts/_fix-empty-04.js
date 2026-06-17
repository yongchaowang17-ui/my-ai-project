/**
 * 修复 04 区空文件：使用三层检测逻辑直接从 03 区源文件重新切分
 * 不依赖 API 服务器
 */
const fs = require('fs');
const path = require('path');

const ROOT4 = path.join(process.cwd(), 'data', '04_Fusion_Area');
const ROOT3 = path.join(process.cwd(), 'data', '03_Exam_Final');

// ===== 三层检测逻辑（复制自 preview route.ts） =====

const ROMAN_MAP = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };

function extractPartNumber(headingLine) {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();
  // Unicode罗马数字
  const uniMatch = stripped.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
  if (uniMatch) {
    const code = uniMatch[1].charCodeAt(0);
    const map = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5 };
    if (map[code]) return map[code];
  }
  // ASCII罗马数字
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
  // OCR损坏扩展
  if (/Part\s*\]I/.test(stripped)) return 3;
  if (/Part\s*:U:/.test(stripped)) return 2;
  if (/Part\s*N\b/.test(stripped) && !/Part\s*New/.test(stripped)) return 4;
  if (/Part\s*IIII/.test(stripped)) return 4;
  if (/Part\s*皿/.test(stripped)) return 4;
  // OCR基础
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

function contextualFixPartNumber(partIndex, line) {
  if (partIndex === 1 && /Listening/i.test(line) && !/Reading/i.test(line)) return 2;
  if (partIndex === 2 && /Reading/i.test(line) && !/Listening/i.test(line)) return 3;
  return partIndex;
}

function inferPartsByKeywords(lines, foundParts) {
  const result = [];
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

function inferByPosition(lines, existing) {
  const result = [];
  const found = new Set(existing.map(h => h.partIndex));
  const sorted = [...existing].sort((a, b) => a.lineIndex - b.lineIndex);
  if (sorted.length === 0) return result;

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

  if (!found.has(2)) {
    const sectionALines = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) sectionALines.push(i);
    }
    for (const saLine of sectionALines) {
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        result.push({partIndex: 2, lineIndex: saLine}); break;
      }
    }
  }

  if (!found.has(3)) {
    const sectionALines = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) sectionALines.push(i);
    }
    let p3Line = -1;
    if (sectionALines.length >= 2 && found.has(2)) {
      const p2Line = result.find(r => r.partIndex === 2)?.lineIndex || sorted[0]?.lineIndex || 0;
      const secondSA = sectionALines.find(l => l > p2Line + 50);
      if (secondSA) p3Line = secondSA;
    }
    if (p3Line === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) { p3Line = i; break; }
      }
    }
    if (p3Line !== -1) result.push({partIndex: 3, lineIndex: p3Line});
  }

  if (!found.has(4)) {
    const allSorted = [...existing, ...result].sort((a, b) => a.lineIndex - b.lineIndex);
    if (allSorted.length > 0) {
      const last = allSorted[allSorted.length - 1];
      if (last.partIndex !== 4) {
        result.push({partIndex: 4, lineIndex: lines.length - 10});
      }
    }
  }

  return result;
}

function detectAllParts(allLines) {
  const headers = [];
  const foundParts = new Set();

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

  const kwResults = inferPartsByKeywords(allLines, foundParts);
  for (const r of kwResults) {
    if (!foundParts.has(r.partIndex)) {
      headers.push({partIndex: r.partIndex, lineIndex: r.lineIndex});
      foundParts.add(r.partIndex);
    }
  }

  const posResults = inferByPosition(allLines, headers);
  for (const r of posResults) {
    if (!foundParts.has(r.partIndex)) {
      headers.push({partIndex: r.partIndex, lineIndex: r.lineIndex});
      foundParts.add(r.partIndex);
    }
  }

  headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return headers;
}

// ===== 主逻辑 =====

const PART_NAMES = { 1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation' };

function extractSetIdFromFilename(filename, sourcePath) {
  const examMatch = sourcePath.match(/(CET\d)\//);
  if (!examMatch) return null;
  const exam = examMatch[1];
  const stdM = filename.match(/^(\d{4}_\d{2}_S\d+)_/);
  if (stdM) return exam + '_' + stdM[1];
  const yearM = filename.match(/(20\d{2})[._-](\d{2})/);
  const setM = filename.match(/[Ss]et[_]?(\d+)/);
  if (yearM) return exam + '_' + yearM[1] + '_' + yearM[2] + '_S' + (setM ? setM[1] : '1');
  return null;
}

function findEmptyFiles() {
  const empty = [];
  for (const lv of ['CET4', 'CET6']) {
    const lp = path.join(ROOT4, lv);
    if (!fs.existsSync(lp)) continue;
    for (const sid of fs.readdirSync(lp)) {
      const sp = path.join(lp, sid);
      if (!fs.statSync(sp).isDirectory() || !sid.startsWith('CET')) continue;
      for (const ty of ['Question', 'Analysis']) {
        const td = path.join(sp, ty);
        if (!fs.existsSync(td)) continue;
        for (const f of fs.readdirSync(td).filter(f => f.endsWith('.md'))) {
          const fp = path.join(td, f);
          const raw = fs.readFileSync(fp, 'utf-8');
          if (Buffer.byteLength(raw, 'utf-8') === 0) {
            empty.push({ lv, sid, ty, f, fp });
          }
        }
      }
    }
  }
  return empty;
}

function main() {
  console.log('=== 扫描 04 区空文件 ===');
  const emptyFiles = findEmptyFiles();
  console.log(`找到 ${emptyFiles.length} 个空文件\n`);

  if (emptyFiles.length === 0) {
    console.log('没有空文件需要修复');
    return;
  }

  // Delete all empty files first
  console.log('=== 删除空文件 ===');
  for (const ef of emptyFiles) {
    fs.unlinkSync(ef.fp);
    console.log(`  删除: ${ef.lv}/${ef.sid}/${ef.ty}/${ef.f}`);
  }

  // Group by source: need to find which 03 source file maps to each empty file
  // Group by (sid, ty) since multiple empty files can come from one source
  const bySource = {};
  for (const ef of emptyFiles) {
    const key = ef.sid + '|' + ef.ty;
    if (!bySource[key]) bySource[key] = { sid: ef.sid, ty: ef.ty, lv: ef.lv, missing: [] };
    bySource[key].missing.push(ef.f);
  }

  console.log(`\n=== 重新切分 ${Object.keys(bySource).length} 个源文件 ===`);

  let totalWritten = 0;
  let totalSkipped = 0;

  for (const key of Object.keys(bySource)) {
    const { sid, ty, lv } = bySource[key];

    // Find source file in 03区
    const levelDir = path.join(ROOT3, lv, ty);
    if (!fs.existsSync(levelDir)) {
      console.log(`  [跳过] 源目录不存在: ${lv}/${ty}`);
      continue;
    }

    const files = fs.readdirSync(levelDir).filter(f => f.endsWith('.md'));
    let sourceFile = null;
    for (const f of files) {
      const stdM = f.match(/^(\d{4}_\d{2}_S\d+)_/);
      if (stdM && lv + '_' + stdM[1] === sid) {
        sourceFile = f;
        break;
      }
    }
    if (!sourceFile) {
      // Try legacy naming
      const sidParts = sid.split('_');
      const yearMonth = sidParts.slice(1, 3).join('.');
      for (const f of files) {
        if (f.includes(yearMonth)) {
          sourceFile = f;
          break;
        }
      }
    }

    if (!sourceFile) {
      console.log(`  [跳过] 找不到源文件: ${sid}/${ty}`);
      continue;
    }

    const sourceAbs = path.join(levelDir, sourceFile);
    const raw = fs.readFileSync(sourceAbs, 'utf-8');
    // Parse frontmatter
    let content = raw;
    if (raw.startsWith('---')) {
      const endIdx = raw.indexOf('---', 3);
      if (endIdx !== -1) {
        content = raw.substring(endIdx + 3).trim();
      }
    }
    const lines = content.split('\n');

    // Detect parts
    const partHeaders = detectAllParts(lines);
    
    const side = ty === 'Question' ? 'Q' : 'A';
    let written = 0;

    for (let i = 0; i < partHeaders.length; i++) {
      const start = partHeaders[i].lineIndex;
      const end = i + 1 < partHeaders.length ? partHeaders[i + 1].lineIndex : lines.length;
      const blockContent = lines.slice(start, end).join('\n');
      if (blockContent.trim().length === 0) continue;

      const partIndex = partHeaders[i].partIndex;
      const partName = PART_NAMES[partIndex] || 'Part' + partIndex;
      const filename = `${sid}_${side}_01_${partName}.md`;

      const targetDir = path.join(ROOT4, lv, sid, ty);
      const targetFile = path.join(targetDir, filename);

      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetFile, blockContent, 'utf-8');
      written++;
      totalWritten++;
    }

    console.log(`  [OK] ${sid}/${ty}: ${sourceFile} -> ${partHeaders.length} parts (${written} written)`);
  }

  console.log(`\n=== 完成 ===`);
  console.log(`写入: ${totalWritten} 个文件`);

  // Verify remaining empty files
  const remaining = findEmptyFiles();
  console.log(`剩余空文件: ${remaining.length} 个`);
  if (remaining.length > 0) {
    remaining.forEach(f => console.log(`  ${f.lv}/${f.sid}/${f.ty}/${f.f}`));
  }

  // Count total files
  let total = 0;
  for (const lv of ['CET4', 'CET6']) {
    const lp = path.join(ROOT4, lv);
    if (!fs.existsSync(lp)) continue;
    for (const sid of fs.readdirSync(lp)) {
      const sp = path.join(lp, sid);
      if (!fs.statSync(sp).isDirectory() || !sid.startsWith('CET')) continue;
      for (const ty of ['Question', 'Analysis']) {
        const td = path.join(sp, ty);
        if (!fs.existsSync(td)) continue;
        total += fs.readdirSync(td).filter(f => f.endsWith('.md') && fs.statSync(path.join(td, f)).size > 0).length;
      }
    }
  }
  console.log(`04区有效文件总数: ${total}`);
}

main();
