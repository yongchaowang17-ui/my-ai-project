/**
 * _fix-remaining-violations.js
 * 将所有 >= 4000 的块重新切分，使用 3990 的安全上限。
 */
const fs = require('fs');
const path = require('path');

const DIRS = [
  'D:/my-ai-Project/data/05_Synthesis_Area/CET4/Reading',
  'D:/my-ai-Project/data/05_Synthesis_Area/CET4/Listening',
  'D:/my-ai-Project/data/05_Synthesis_Area/CET6/Reading',
];

const HARD_LIMIT = 4000;
const SAFE_LIMIT = 3990;
const SAFE_LO = 3200;
const SAFE_HI = 3990;

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
  if (text.length <= SAFE_LIMIT) return [text];
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

let fixedCount = 0;
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const fp = path.join(dir, file);
    const content = fs.readFileSync(fp, 'utf8');
    const parts = content.split('---CHUNK-SPLIT---');
    const needsFix = parts.some(p => p.length >= HARD_LIMIT);
    if (!needsFix) continue;

    const fineParts = [];
    for (const part of parts) fineParts.push(...splitChunk(part));
    const newContent = fineParts.join('\n\n---CHUNK-SPLIT---\n\n');
    fs.writeFileSync(fp, newContent, 'utf8');
    fixedCount++;
    const maxLen = Math.max(...fineParts.map(p => p.length));
    const added = fineParts.length - parts.length;
    console.log(file + ': ' + parts.length + ' -> ' + fineParts.length + ' chunks, max ' + maxLen + 'ch' + (added > 0 ? ' (+' + added + ')' : ''));
  }
}

console.log('\nFixed ' + fixedCount + ' files.');

// Final verification
console.log('\n=== FINAL VERIFICATION ===');
let totalChunks = 0, violations = 0, maxLen = 0;
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    const parts = t.split('---CHUNK-SPLIT---');
    totalChunks += parts.length;
    parts.forEach(p => { if (p.length > maxLen) maxLen = p.length; if (p.length >= HARD_LIMIT) violations++; });
  });
}
console.log('Total chunks: ' + totalChunks);
console.log('Violations (>=4000): ' + violations);
console.log('Max chunk: ' + maxLen);
console.log('Result: ' + (violations === 0 ? 'PASS' : 'FAIL'));
