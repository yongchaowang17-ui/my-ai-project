/**
 * _fix-4-violations.js
 * 修复因空行隔离导致的 4 个超限块。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', '05_Synthesis_Area');

const VIOLATIONS = [
  { dir: 'CET4/Reading', file: 'CET4_2018_06_S3_Reading.md' },
  { dir: 'CET4/Reading', file: 'CET4_2024_06_S1_Reading.md' },
  { dir: 'CET4/Listening', file: 'CET4_2021_06_S1_Listening.md' },
  { dir: 'CET6/Reading', file: 'CET6_2022_06_S2_Reading.md' },
];

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

for (const v of VIOLATIONS) {
  const fp = path.join(DIR, v.dir, v.file);
  const content = fs.readFileSync(fp, 'utf8');
  const parts = content.split('---CHUNK-SPLIT---');
  const fineParts = [];
  for (const part of parts) fineParts.push(...splitChunk(part));
  const newContent = fineParts.join('\n\n---CHUNK-SPLIT---\n\n');
  fs.writeFileSync(fp, newContent, 'utf8');
  const maxLen = Math.max(...fineParts.map(p => p.length));
  console.log(v.file + ': ' + parts.length + ' -> ' + fineParts.length + ' chunks, max ' + maxLen + 'ch');
}

// 验证
console.log('\n=== RE-VERIFICATION ===');
let total = 0, violations = 0, maxLen = 0;
for (const v of VIOLATIONS) {
  const fp = path.join(DIR, v.dir, v.file);
  const t = fs.readFileSync(fp, 'utf8');
  const parts = t.split('---CHUNK-SPLIT---');
  total += parts.length;
  parts.forEach(p => { if (p.length > maxLen) maxLen = p.length; if (p.length >= LIMIT) violations++; });
}
console.log('Fixed chunks:', total, 'Max:', maxLen, 'Violations:', violations, violations === 0 ? 'PASS' : 'FAIL');
