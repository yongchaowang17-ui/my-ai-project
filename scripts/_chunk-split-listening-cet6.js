/**
 * _chunk-split-listening-cet6.js
 * 为 05 区 CET6 Listening 文件插入 ---CHUNK-SPLIT--- 粗切分标记。
 *
 * CET6 Listening 结构：
 *   Section A - Long Conversations (Q1-7)  ← 题目
 *   Section B - Listening Passages (Q8-15) ← 题目
 *   Section C - Lectures/Talks (Q16-25)    ← 题目
 *   # SectionB                              ← 脚本
 *   # SectionC                              ← 脚本/听写
 *   # Passage One/Two/Three                 ← Section C 内部
 *   # Recording One/Two/Three               ← 新格式 Section C 内部
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET6', 'Listening');

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  if (content.length < 1000) return { fileName, skip: true, len: content.length };

  const lines = content.split('\n');
  const found = {};

  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    // Section A 题目
    if (!found.secAQuest && /^#\s*Section\s*A\s*[-–—]\s*Long\s*Conversations/i.test(tr)) found.secAQuest = i;
    // Section A 脚本（简写）
    if (!found.secAScript && /^#\s*SectionA\s*$/.test(tr)) found.secAScript = i;
    // Section B 完整题目标题
    if (!found.secBQuestFull && /^#\s*Section\s*B\s*[-–—]\s*Listening\s*Passages/i.test(tr)) found.secBQuestFull = i;
    // Section B 脚本（简写）
    if (!found.secBScript && /^#\s*SectionB\s*$/.test(tr)) found.secBScript = i;
    // Section C 完整题目标题
    if (!found.secCQuestFull && /^#\s*Section\s*C\s*[-–—]\s*Lectures/i.test(tr)) found.secCQuestFull = i;
    // Section C 脚本/听写（简写）
    if (!found.secCScript && /^#\s*SectionC\s*$/.test(tr)) found.secCScript = i;
    // Passage 标题
    if (!found.passageOne && /^#\s*Passage\s*One\s*$/i.test(tr)) found.passageOne = i;
    if (!found.passageTwo && /^#\s*Passage\s*Two\s*$/i.test(tr)) found.passageTwo = i;
    if (!found.passageThree && /^#\s*Passage\s*Three\s*$/i.test(tr)) found.passageThree = i;
    // Recording 标题（新格式）
    if (!found.recordingOne && /^#\s*Recording\s*One\b/i.test(tr)) found.recordingOne = i;
    if (!found.recordingTwo && /^#\s*Recording\s*Two\b/i.test(tr)) found.recordingTwo = i;
    if (!found.recordingThree && /^#\s*Recording\s*Three\b/i.test(tr)) found.recordingThree = i;
  }

  const dashLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i].trim())) dashLines.push(i);
  }

  function findLastDash(start, end) {
    const c = dashLines.filter(d => d > start && d < end);
    return c.length > 0 ? c[c.length - 1] : null;
  }
  function findLastNonEmpty(start, end) {
    for (let i = end - 1; i > start; i--) {
      if (lines[i].trim() !== '') return i;
    }
    return null;
  }
  function findSplit(start, end) {
    if (start === undefined || end === undefined || start >= end) return null;
    return findLastDash(start, end) ?? findLastNonEmpty(start, end);
  }

  const splitLines = new Set();
  let splitCount = 0;
  function addSplit(lineIdx) {
    if (lineIdx !== null && lineIdx !== undefined) { splitLines.add(lineIdx); splitCount++; }
  }

  // 切分点 1: Section A 题目 → Section B 题目
  addSplit(findSplit(found.secAQuest, found.secBQuestFull));

  // 切分点 2: Section B 题目 → Section B 脚本
  addSplit(findSplit(found.secBQuestFull, found.secBScript));

  // 切分点 3: Section B 脚本 → Section C 题目
  addSplit(findSplit(found.secBScript, found.secCQuestFull));

  // 对于没有 secBScript 的文件，在 secBQuestFull → secCQuestFull 之间切
  if (!found.secBScript && found.secBQuestFull && found.secCQuestFull) {
    addSplit(findSplit(found.secBQuestFull, found.secCQuestFull));
  }

  // 切分点 4a: Section C 内部 — Passage One → Passage Two
  const p1 = found.passageOne || found.recordingOne;
  const p2 = found.passageTwo || found.recordingTwo;
  const p3 = found.passageThree || found.recordingThree;
  addSplit(findSplit(p1, p2));

  // 切分点 4b: Passage Two → Passage Three
  addSplit(findSplit(p2, p3));

  // 切分点 4c: Passage Three → Section C 脚本/听写
  addSplit(findSplit(p3, found.secCScript));

  if (splitCount > 0) {
    const newLines = lines.map((line, i) => splitLines.has(i) ? '---CHUNK-SPLIT---' : line);
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
  }

  return {
    fileName, splitCount, len: content.length, skip: false,
  };
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log('Found ' + files.length + ' files.\n');
let totalSplits = 0, processed = 0, skipped = 0;
for (const file of files) {
  const result = processFile(path.join(DIR, file));
  if (result.skip) { skipped++; console.log(result.fileName + ': SKIPPED'); continue; }
  processed++;
  totalSplits += result.splitCount;
  console.log(result.fileName + ': ' + result.splitCount + ' splits (' + result.len + 'ch)');
}
console.log('\nProcessed: ' + processed + ', Skipped: ' + skipped);
console.log('Total CHUNK-SPLIT markers: ' + totalSplits);
