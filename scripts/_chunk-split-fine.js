/**
 * _chunk-split-fine.js
 * 在现有粗切分基础上递归细分，确保任意两 ---CHUNK-SPLIT--- 之间 < 4000 字符。
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Reading');
const LIMIT = 4000;
const SAFE_LO = 3200;
const SAFE_HI = 4000;

// 优先级 1：中文标题行（通杀所有格式变体）
const ZH_TITLE_RE = /^##?\s*[·•]*\s*[\u4e00-\u9fa5]{2,20}[·•]*\s*$/;

// 优先级 2：空行
const BLANK_RE = /^\s*$/;

// 优先级 3：段落标签行 / 题号行
const PARA_RE = /^[A-O][）)]\s/;
const QNUM_RE = /^##?\s*\d+[\s\.]/;

/**
 * 在 text 中找最佳切点行号（0-based），要求切点之前的内容在 [SAFE_LO, SAFE_HI] 范围。
 * 返回切点行号（切点之后开始新的一块），或 null。
 */
function findBestSplitLine(text, priority) {
  const lines = text.split('\n');
  let charPos = 0;
  const lineStarts = []; // [{start, end, idx}]
  for (let i = 0; i < lines.length; i++) {
    const end = charPos + lines[i].length + 1; // +1 for \n
    lineStarts.push({ start: charPos, end, idx: i });
    charPos = end;
  }
  const totalLen = text.length;

  // 收集候选切点：在 SAFE_LO ~ SAFE_HI 范围内匹配优先级正则的行
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
    // 选最接近中点的候选（使两块尽量均匀）
    const mid = totalLen / 2;
    candidates.sort((a, b) => Math.abs(a.start - mid) - Math.abs(b.start - mid));
    return candidates[0].idx;
  }

  // 优先级 4：句子边界（3200-4000 范围内最近的句号/问号/感叹号）
  if (priority === 4) {
    const SENT_RE = /[。！？.!?]/g;
    let bestIdx = null;
    let bestDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      const lineStart = lineStarts[i].start;
      if (lineStart < SAFE_LO || lineStart > SAFE_HI) continue;
      SENT_RE.lastIndex = 0;
      let m;
      while ((m = SENT_RE.exec(lines[i])) !== null) {
        const pos = lineStart + m.index + 1; // 切在句号之后
        if (pos < SAFE_LO || pos > SAFE_HI) continue;
        const dist = Math.abs(pos - totalLen / 2);
        if (dist < bestDist) { bestDist = dist; bestIdx = i + 1; } // 切在下一行开头
      }
    }
    if (bestIdx !== null && bestIdx < lines.length) return bestIdx;
  }

  return null;
}

/**
 * 递归细分：返回子块数组，每块 < LIMIT 字符。
 */
function splitChunk(text) {
  text = text.replace(/^\n+/, ''); // 去掉前导空行
  if (text.length <= LIMIT) return [text];

  // 按优先级 1-4 尝试
  let splitLine = null;
  for (let prio = 1; prio <= 4; prio++) {
    splitLine = findBestSplitLine(text, prio);
    if (splitLine !== null) break;
  }

  // 最后兜底：在 SAFE_LO 附近按行切
  if (splitLine === null) {
    const lines = text.split('\n');
    let charPos = 0;
    for (let i = 0; i < lines.length; i++) {
      charPos += lines[i].length + 1;
      if (charPos >= SAFE_LO) { splitLine = i + 1; break; }
    }
    if (splitLine === null || splitLine >= lines.length) {
      // 极端情况：整块是一行超长文本，按字符切
      const mid = Math.min(Math.max(SAFE_LO, Math.floor(text.length / 2)), text.length - 1);
      return [text.substring(0, mid), text.substring(mid)];
    }
  }

  const lines = text.split('\n');
  const before = lines.slice(0, splitLine).join('\n').replace(/\n+$/, '');
  const after = lines.slice(splitLine).join('\n').replace(/^\n+/, '');

  // 递归：对两个子块分别细分
  return [...splitChunk(before), ...splitChunk(after)];
}

// 主流程
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log(`Processing ${files.length} files...\n`);

let totalChunksBefore = 0;
let totalChunksAfter = 0;
let totalExceedBefore = 0;
let maxChunkBefore = 0;

for (const file of files) {
  const filePath = path.join(DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // 粗切分
  const coarseParts = content.split('---CHUNK-SPLIT---');
  totalChunksBefore += coarseParts.length;
  for (const p of coarseParts) {
    if (p.length > maxChunkBefore) maxChunkBefore = p.length;
    if (p.length >= LIMIT) totalExceedBefore++;
  }

  // 细切分
  const fineParts = [];
  for (const part of coarseParts) {
    fineParts.push(...splitChunk(part));
  }
  totalChunksAfter += fineParts.length;

  // 写回
  const newContent = fineParts.join('\n---CHUNK-SPLIT---\n');
  fs.writeFileSync(filePath, newContent, 'utf8');

  const added = fineParts.length - coarseParts.length;
  const maxLen = Math.max(...fineParts.map(p => p.length));
  const tag = added > 0 ? ` (+${added})` : '';
  console.log(`${file}: ${coarseParts.length} → ${fineParts.length} chunks, max ${maxLen}ch${tag}`);
}

console.log(`\n=== Summary ===`);
console.log(`Before: ${totalChunksBefore} chunks (${totalExceedBefore} ≥ ${LIMIT}ch, max ${maxChunkBefore}ch)`);
console.log(`After:  ${totalChunksAfter} chunks (+${totalChunksAfter - totalChunksBefore} new splits)`);
