/**
 * 逐文件诊断：运行三层检测，输出每个文件的检测详情
 * 找出哪些文件检测失败、为什么失败
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const FINAL_ROOT = path.join(__dirname, '..', 'data', '03_Exam_Final');

// ===== 复制 API 中的检测逻辑（简化版）=====
const ROMAN_MAP = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };

function parseUnicodeRoman(ch) {
  const code = ch.charCodeAt(0);
  const map = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5, 0x2165: 6 };
  return map[code] ?? null;
}

function parseOcrCorrupt(text) {
  const ocrMatch = text.match(/Part\s*([HhKkNnFfWwIl][\[\]_]*)\b/);
  if (!ocrMatch) {
    if (/Part\s*皿/.test(text)) return 4;
    return null;
  }
  const ch = ocrMatch[1][0].toUpperCase();
  if ('HK'.includes(ch)) return 2;
  if ('NF'.includes(ch)) return 4;
  if (ch === 'M' || ch === 'I') {
    const rest = ocrMatch[1];
    if (/^[Mm](?![a-zA-Z])/.test(rest) || /^in\b/.test(rest)) return 3;
    return 2;
  }
  if (ch === 'W') return 4;
  return null;
}

function extractPartNumber(headingLine) {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();
  const uniMatch = stripped.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
  if (uniMatch) {
    const r = parseUnicodeRoman(uniMatch[1]);
    if (r !== null) return r;
  }
  const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V)(?![\u2160-\u2165\w])\b/i);
  if (romanMatch) {
    const r = romanMatch[1].toUpperCase();
    if (ROMAN_MAP[r]) return ROMAN_MAP[r];
  }
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) {
    const n = parseInt(arabicMatch[1], 10);
    if (n >= 1 && n <= 5) return n === 5 ? 4 : n;
  }
  return parseOcrCorrupt(stripped);
}

function detectAllParts(allLines) {
  const headers = [];
  const foundParts = new Set();
  
  // 第1层：标题正则
  for (let i = 0; i < allLines.length; i++) {
    const pn = extractPartNumber(allLines[i]);
    if (pn !== null && pn >= 1 && pn <= 4 && !foundParts.has(pn)) {
      headers.push({ partIndex: pn, lineIndex: i, source: 'title' });
      foundParts.add(pn);
    }
  }
  
  // 第2层：关键词推断
  if (!foundParts.has(1)) {
    for (let i = 0; i < Math.min(allLines.length, 80); i++) {
      if (/^#{1,4}\s+Part\s+I\b/i.test(allLines[i]) && !/Comprehension|Listening/i.test(allLines[i])) {
        headers.push({ partIndex: 1, lineIndex: i, source: 'keyword' });
        foundParts.add(1); break;
      }
      if (/Directions\s*[:：].*(?:write|essay|submission|inviting)/i.test(allLines[i])) {
        headers.push({ partIndex: 1, lineIndex: i, source: 'keyword' });
        foundParts.add(1); break;
      }
    }
  }
  
  if (!foundParts.has(2)) {
    const sectionALines = [];
    for (let i = 0; i < allLines.length; i++) {
      if (/^#{1,4}\s+Section\s+A\b/i.test(allLines[i])) sectionALines.push(i);
    }
    for (const saLine of sectionALines) {
      const nextFew = allLines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        headers.push({ partIndex: 2, lineIndex: saLine, source: 'keyword' });
        foundParts.add(2); break;
      }
    }
  }
  
  if (!foundParts.has(3)) {
    for (let i = 0; i < allLines.length; i++) {
      if (/Reading\s+Comprehension/i.test(allLines[i]) && /^#{1,4}\s/.test(allLines[i])) {
        headers.push({ partIndex: 3, lineIndex: i, source: 'keyword' });
        foundParts.add(3); break;
      }
    }
    // 第二个 Section A
    if (!foundParts.has(3)) {
      const sectionALines = [];
      for (let i = 0; i < allLines.length; i++) {
        if (/^#{1,4}\s+Section\s+A\b/i.test(allLines[i])) sectionALines.push(i);
      }
      if (sectionALines.length >= 2 && foundParts.has(2)) {
        const p2Line = headers.find(h => h.partIndex === 2)?.lineIndex || 0;
        const secondSA = sectionALines.find(l => l > p2Line + 50);
        if (secondSA) {
          headers.push({ partIndex: 3, lineIndex: secondSA, source: 'keyword' });
          foundParts.add(3);
        }
      }
    }
  }
  
  if (!foundParts.has(4)) {
    for (let i = 0; i < allLines.length; i++) {
      if (/Translation/i.test(allLines[i]) && /^#{1,4}\s/.test(allLines[i]) && !/Comprehension/i.test(allLines[i])) {
        headers.push({ partIndex: 4, lineIndex: i, source: 'keyword' });
        foundParts.add(4); break;
      }
    }
  }
  
  // 第3层：位置推断兜底
  if (headers.length > 0) {
    const sorted = [...headers].sort((a, b) => a.lineIndex - b.lineIndex);
    if (!foundParts.has(4)) {
      headers.push({ partIndex: 4, lineIndex: allLines.length - 10, source: 'position' });
      foundParts.add(4);
    }
  }
  
  headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return { headers, foundParts };
}

// ===== 扫描所有文件 =====
const results = { complete: [], incomplete: [], errors: [] };

for (const level of ['CET4', 'CET6']) {
  for (const type of ['Question', 'Analysis']) {
    const typeDir = path.join(FINAL_ROOT, level, type);
    if (!fs.existsSync(typeDir)) continue;
    
    const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const fp = path.join(typeDir, file);
        const raw = fs.readFileSync(fp, 'utf-8');
        const { content } = matter(raw);
        const lines = content.split('\n');
        
        const { headers, foundParts } = detectAllParts(lines);
        const partCount = foundParts.size;
        const missing = [1, 2, 3, 4].filter(p => !foundParts.has(p));
        
        const entry = {
          file: `${level}/${type}/${file}`,
          lines: lines.length,
          partCount,
          missing: missing.length > 0 ? missing : null,
          headers: headers.map(h => `P${h.partIndex}@L${h.lineIndex}(${h.source})`),
        };
        
        if (partCount >= 4) {
          results.complete.push(entry);
        } else {
          results.incomplete.push(entry);
        }
      } catch (err) {
        results.errors.push({ file: `${level}/${type}/${file}`, error: err.message });
      }
    }
  }
}

// 输出
console.log('');
console.log('=== 检测结果 ===');
console.log(`完整(4 Part): ${results.complete.length}`);
console.log(`不完整(<4 Part): ${results.incomplete.length}`);
console.log(`错误: ${results.errors.length}`);

if (results.incomplete.length > 0) {
  console.log('');
  console.log('=== 不完整文件详情 ===');
  // 按缺失类型分组
  const groups = {};
  for (const item of results.incomplete) {
    const key = item.missing ? item.missing.join(',') : 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  for (const [missing, items] of Object.entries(groups).sort()) {
    console.log(`\n[缺 Part ${missing}] (${items.length}个)`);
    for (const item of items) {
      console.log(`  ${item.file} — ${item.partCount}个Part 检测到: ${item.headers.join(', ') || '无'}`);
    }
  }
}

if (results.errors.length > 0) {
  console.log('\n=== 错误文件 ===');
  for (const e of results.errors) {
    console.log(`  ${e.file}: ${e.error}`);
  }
}
