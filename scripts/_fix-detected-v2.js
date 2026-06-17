/**
 * 修复 CET6 文件 SectionA/SectionB/SectionC 无空格的检测问题
 * 同时修复其他遗漏的 Part
 */
const fs = require('fs');
const path = require('path');

const ROOT4 = path.join(process.cwd(), 'data', '04_Fusion_Area');
const ROOT3 = path.join(process.cwd(), 'data', '03_Exam_Final');
const PART_NAMES = { 1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation' };
const ROMAN_MAP = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };

function extractPartNumber(headingLine) {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();
  const uniMatch = stripped.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
  if (uniMatch) {
    const code = uniMatch[1].charCodeAt(0);
    const map = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5 };
    if (map[code]) return map[code];
  }
  const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V)(?![\u2160-\u2165\w])\b/i);
  if (romanMatch) { const r = romanMatch[1].toUpperCase(); if (ROMAN_MAP[r]) return ROMAN_MAP[r]; }
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) { const n = parseInt(arabicMatch[1], 10); if (n >= 1 && n <= 5) return n === 5 ? 4 : n; }
  if (/Part\s*\]I/.test(stripped)) return 3;
  if (/Part\s*:U:/.test(stripped)) return 2;
  if (/Part\s*N\b/.test(stripped) && !/Part\s*New/.test(stripped)) return 4;
  if (/Part\s*IIII/.test(stripped)) return 4;
  if (/Part\s*皿/.test(stripped)) return 4;
  const ocrMatch = stripped.match(/Part\s*([HhKkNnFfWwIl][\[\]_]*)\b/);
  if (ocrMatch) {
    const ch = ocrMatch[1][0].toUpperCase();
    if ('HK'.includes(ch)) return 2;
    if ('NF'.includes(ch)) return 4;
    if (ch === 'M' || ch === 'I') { const rest = ocrMatch[1]; if (/^[Mm](?![a-zA-Z])/.test(rest) || /^in\b/.test(rest)) return 3; return 2; }
    if (ch === 'W') return 4;
  }
  return null;
}

function contextualFixPartNumber(partIndex, line) {
  if (partIndex === 1 && /Listening/i.test(line) && !/Reading/i.test(line)) return 2;
  if (partIndex === 2 && /Reading/i.test(line) && !/Listening/i.test(line)) return 3;
  return partIndex;
}

// 增强版：兼容无空格的 Section 标题
function isSectionA(lines, i) {
  const l = lines[i];
  // 匹配 "# Section A" 和 "# SectionA"（无空格）
  return /^#{1,4}\s+Section\s*A\b/i.test(l) || /^#{1,4}\s+SectionA\b/i.test(l);
}

function detectParts(lines) {
  const headers = [];
  const found = new Set();

  // 第1层：标题检测
  for (let i = 0; i < lines.length; i++) {
    const pn = extractPartNumber(lines[i]);
    if (pn !== null && pn >= 1 && pn <= 4) {
      if (!found.has(pn)) {
        headers.push({ partIndex: pn, lineIndex: i });
        found.add(pn);
      } else {
        const fixed = contextualFixPartNumber(pn, lines[i]);
        if (fixed !== pn && !found.has(fixed)) {
          headers.push({ partIndex: fixed, lineIndex: i });
          found.add(fixed);
        }
      }
    }
  }

  // 第2层：关键词 + 位置推断（一次性完成）
  // Part I Writing
  if (!found.has(1)) {
    // 从文件末尾往前找（某些文件 Writing 在末尾）
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
      if (/^#{1,4}\s+Part\s+I\b/i.test(lines[i]) && !/Comprehension|Listening/i.test(lines[i])) {
        headers.push({ partIndex: 1, lineIndex: i }); found.add(1); break;
      }
      if (/^#{1,4}\s+Writing\b/i.test(lines[i])) {
        headers.push({ partIndex: 1, lineIndex: i }); found.add(1); break;
      }
    }
    if (!found.has(1)) {
      for (let i = 0; i < Math.min(lines.length, 60); i++) {
        if (/Directions\s*[:：].*(?:write|essay|submission|inviting|proposal)/i.test(lines[i])) {
          headers.push({ partIndex: 1, lineIndex: i }); found.add(1); break;
        }
      }
    }
  }

  // Part II Listening: 第一个 Section A + hear/listen 关键词
  const sectionALines = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSectionA(lines, i)) sectionALines.push(i);
  }

  if (!found.has(2)) {
    for (const saLine of sectionALines) {
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        headers.push({ partIndex: 2, lineIndex: saLine });
        found.add(2);
        break;
      }
    }
  }

  // Part III Reading: 第二个 Section A 或 Reading Comprehension
  if (!found.has(3)) {
    const p2Line = headers.find(h => h.partIndex === 2)?.lineIndex ?? -1;
    if (p2Line >= 0 && sectionALines.length >= 2) {
      const readingSA = sectionALines.find(l => l > p2Line + 50);
      if (readingSA) {
        headers.push({ partIndex: 3, lineIndex: readingSA });
        found.add(3);
      }
    }
    if (!found.has(3)) {
      for (let i = 0; i < lines.length; i++) {
        if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) {
          headers.push({ partIndex: 3, lineIndex: i }); found.add(3); break;
        }
      }
    }
  }

  // Part IV Translation
  if (!found.has(4)) {
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
      if (/Translation/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) {
        headers.push({ partIndex: 4, lineIndex: i }); found.add(4); break;
      }
    }
    if (!found.has(4)) {
      headers.push({ partIndex: 4, lineIndex: Math.max(0, lines.length - 15) });
      found.add(4);
    }
  }

  headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return headers;
}

// ===== 修复列表 =====
const filesToFix = [
  { sid: 'CET6_2017_12_S3', ty: 'Question', yearMonth: '2017_12', set: 'S3', exam: 'CET6' },
  { sid: 'CET6_2018_06_S3', ty: 'Question', yearMonth: '2018_06', set: 'S3', exam: 'CET6' },
  { sid: 'CET4_2024_12_S2', ty: 'Question', yearMonth: '2024_12', set: 'S2', exam: 'CET4' },
  { sid: 'CET6_2024_12_S3', ty: 'Question', yearMonth: '2024_12', set: 'S3', exam: 'CET6' },
  { sid: 'CET4_2018_12_S3', ty: 'Analysis', yearMonth: '2018_12', set: 'S3', exam: 'CET4' },
  { sid: 'CET6_2018_12_S3', ty: 'Analysis', yearMonth: '2018_12', set: 'S3', exam: 'CET6' },
];

function findSourceFile(exam, ty, yearMonth, set) {
  const dir = path.join(ROOT3, exam, ty);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const setLetter = set.replace('S', '');
  for (const f of files) {
    const m = f.match(/^(\d{4}_\d{2}_S(\d+))_/);
    if (m) {
      const fYM = m[1].split('_').slice(0, 2).join('_');
      const fSet = 'S' + m[2];
      if (fYM === yearMonth && fSet === set) return path.join(dir, f);
    }
  }
  const ym = yearMonth.replace('_', '.');
  for (const f of files) {
    if (f.includes(ym) && f.includes(setLetter)) return path.join(dir, f);
  }
  return null;
}

function main() {
  console.log('=== 修复检测遗漏（增强版：兼容无空格Section标题）===\n');
  let totalFixed = 0;

  for (const item of filesToFix) {
    console.log(`--- ${item.sid} [${item.ty}] ---`);
    const srcPath = findSourceFile(item.exam, item.ty, item.yearMonth, item.set);
    if (!srcPath) { console.log('  源文件未找到\n'); continue; }

    const raw = fs.readFileSync(srcPath, 'utf-8');
    let content = raw;
    if (raw.startsWith('---')) {
      const endIdx = raw.indexOf('---', 3);
      if (endIdx !== -1) content = raw.substring(endIdx + 3).trim();
    }
    const lines = content.split('\n');
    console.log(`  源文件: ${path.basename(srcPath)} (${lines.length} lines)`);

    const headers = detectParts(lines);
    console.log(`  检测到 ${headers.length} 个Part:`);
    headers.forEach(h => console.log(`    Part ${h.partIndex} (${PART_NAMES[h.partIndex]}) @ L${h.lineIndex + 1}`));

    // 删除旧文件
    const targetDir = path.join(ROOT4, item.exam, item.sid, item.ty);
    if (fs.existsSync(targetDir)) {
      fs.readdirSync(targetDir).filter(f => f.endsWith('.md')).forEach(f => fs.unlinkSync(path.join(targetDir, f)));
    }

    const side = item.ty === 'Question' ? 'Q' : 'A';
    let written = 0;
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].lineIndex;
      const end = i + 1 < headers.length ? headers[i + 1].lineIndex : lines.length;
      const blockContent = lines.slice(start, end).join('\n');
      if (blockContent.trim().length === 0) continue;

      const partIndex = headers[i].partIndex;
      const partName = PART_NAMES[partIndex] || 'Part' + partIndex;
      const filename = `${item.sid}_${side}_01_${partName}.md`;

      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, filename), blockContent, 'utf-8');
      written++;
      totalFixed++;
      console.log(`  写入: ${filename} (${blockContent.length} bytes)`);
    }
    console.log(`  结果: ${written} 个文件\n`);
  }

  console.log(`=== 总计修复: ${totalFixed} 个文件 ===`);
}

main();
