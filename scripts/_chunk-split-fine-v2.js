/**
 * _chunk-split-fine-v2.js
 * 在现有粗切分基础上递归细分，确保任意两 ---CHUNK-SPLIT--- 之间 < 4000 字符。
 * 所有新插入的标记使用隔离格式：\n\n---CHUNK-SPLIT---\n\n
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Reading');
const LIMIT = 4000;
const SAFE_LO = 3200;
const SAFE_HI = 4000;

const ZH_TITLE_RE = /^##?\s*[·•]*\s*[\u4e00-\u9fa5]{2,20}[·•]*\s*$/;
const BLANK_RE = /^\s*$/;
const PARA_RE = /^[A-O][）)]\s/;
const QNUM_RE = /^##?\s*\d+[\s\.]/;

function findBestSplitLine(text, priority) {
  const lines = text.split('\n');
  let charPos = 0;
  const lineStarts = [];
  for (let i = 0; i < lines.length; i++) {
    lineStarts.push({ start: charPos, idx: i });
    charPos += lines[i].length + 1;
  }
  const totalLen = text.length;
  const candidates = [];
  for (const ls of lineStarts) {
    if (ls.start < SAFE_LO || ls.start > SAFE_HI) continue;
    const line = lines[ls.idx];
    let match = false;
    if (priority === 1) match = ZH_TITLE_RE.test(line);
    else if (priority === 2) match = BLANK_RE.test(line);
    else if (priority === 3) match = PARA_RE.test(line) || QNUM_RE.test(line);
    if (match) candidates.push(ls);
  }
  if (candidates.length > 0) {
    const mid = totalLen / 2;
    candidates.sort((a, b) => Math.abs(a.start - mid) - Math.abs(b.start - mid));
    return candidates[0].idx;
  }
  if (priority === 4) {
    const SENT_RE = /[。！？.!?]/g;
    let bestIdx = null, bestDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      const ls = lineStarts[i].start;
      if (ls < SAFE_LO || ls > SAFE_HI) continue;
      SENT_RE.lastIndex = 0;
      let m;
      while ((m = SENT_RE.exec(lines[i])) !== null) {
        const pos = ls + m.index + 1;
        if (pos < SAFE_LO || pos > SAFE_HI) continue;
        const dist = Math.abs(pos - totalLen / 2);
        if (dist < bestDist) { bestDist = dist; bestIdx = i + 1; }
      }
    }
    if (bestIdx !== null && bestIdx < lines.length) return bestIdx;
  }
  return null;
}

function splitChunk(text) {
  text = text.replace(/^\n+/, '');
  if (text.length <= LIMIT) return [text];
  let splitLine = null;
  for (let prio = 1; prio <= 4; prio++) {
    splitLine = findBestSplitLine(text, prio);
    if (splitLine !== null) break;
  }
  if (splitLine === null) {
    const lines = text.split('\n');
    let charPos = 0;
    for (let i = 0; i < lines.length; i++) {
      charPos += lines[i].length + 1;
      if (charPos >= SAFE_LO) { splitLine = i + 1; break; }
    }
    if (splitLine === null || splitLine >= lines.length) {
      const mid = Math.min(Math.max(SAFE_LO, Math.floor(text.length / 2)), text.length - 1);
      return [text.substring(0, mid), text.substring(mid)];
    }
  }
  const lines = text.split('\n');
  const before = lines.slice(0, splitLine).join('\n').replace(/\n+$/, '');
  const after = lines.slice(splitLine).join('\n').replace(/^\n+/, '');
  return [...splitChunk(before), ...splitChunk(after)];
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log('Processing ' + files.length + ' files...\n');

let totalBefore = 0, totalAfter = 0, totalExceed = 0, maxBefore = 0;

for (const file of files) {
  const filePath = path.join(DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // 以现有标记为粗边界拆块（标记本身不计入块内容）
  const coarseParts = content.split('---CHUNK-SPLIT---');
  totalBefore += coarseParts.length;
  for (const p of coarseParts) {
    if (p.length > maxBefore) maxBefore = p.length;
    if (p.length >= LIMIT) totalExceed++;
  }

  // 细切分
  const fineParts = [];
  for (const part of coarseParts) fineParts.push(...splitChunk(part));
  totalAfter += fineParts.length;

  // 用隔离格式写回
  const newContent = fineParts.join('\n\n---CHUNK-SPLIT---\n\n');
  fs.writeFileSync(filePath, newContent, 'utf8');

  const added = fineParts.length - coarseParts.length;
  const maxLen = Math.max(...fineParts.map(p => p.length));
  const tag = added > 0 ? ' (+' + added + ')' : '';
  console.log(file + ': ' + coarseParts.length + ' -> ' + fineParts.length + ' chunks, max ' + maxLen + 'ch' + tag);
}

console.log('\n=== Summary ===');
console.log('Before: ' + totalBefore + ' chunks (' + totalExceed + ' >= ' + LIMIT + 'ch, max ' + maxBefore + 'ch)');
console.log('After:  ' + totalAfter + ' chunks (+' + (totalAfter - totalBefore) + ' new splits)');
