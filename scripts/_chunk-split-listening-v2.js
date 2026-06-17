/**
 * _chunk-split-listening-v2.js
 * 为 05 区 CET4 Listening 文件插入 ---CHUNK-SPLIT--- 粗切分标记。
 *
 * 策略：
 *   优先用完整标题（# Section B - Long Conversations）做切分；
 *   有 # SectionA/# SectionB/# SectionC 时额外切分；
 *   无脚本标记时，在 section 标题处切分（Section B 题 → Section C 题）。
 *   跳过 <1000 字符的空壳文件。
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Listening');

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  if (content.length < 1000) return { fileName, skip: true, len: content.length };

  const lines = content.split('\n');
  const found = {};

  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (!found.answerKey && /^\*{2}答案键\*{2}\s*$/.test(tr)) found.answerKey = i;
    if (!found.secAQuest && /^#\s*Section\s*A\s*[-–—]\s*Short\s*News/i.test(tr)) found.secAQuest = i;
    if (!found.secAScript && /^#\s*SectionA\s*$/.test(tr)) found.secAScript = i;
    if (!found.secBQuestFull && /^#\s*Section\s*B\s*[-–—]\s*Long\s*Conversations/i.test(tr)) found.secBQuestFull = i;
    if (!found.secBScript && /^#\s*SectionB\s*$/.test(tr)) found.secBScript = i;
    if (!found.secCQuestFull && /^#\s*Section\s*C\s*[-–—]\s*Listening\s*Passages/i.test(tr)) found.secCQuestFull = i;
    if (!found.secCScript && /^#\s*SectionC\s*$/.test(tr)) found.secCScript = i;
    if (!found.passageOne && /^#\s*Passage\s*One\s*$/i.test(tr)) found.passageOne = i;
    if (!found.passageTwo && /^#\s*Passage\s*Two\s*$/i.test(tr)) found.passageTwo = i;
    if (!found.passageThree && /^#\s*Passage\s*Three\s*$/i.test(tr)) found.passageThree = i;
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

  // === 切分点 1: Section A 题目 → 答案键 ===
  addSplit(findSplit(found.secAQuest, found.answerKey));

  // === 切分点 2: 答案键 → Section A 脚本 ===
  addSplit(findSplit(found.answerKey, found.secAScript));

  // === 切分点 3: Section A 脚本 → Section B 题目 ===
  addSplit(findSplit(found.secAScript, found.secBQuestFull));

  // === 切分点 4: Section B 题目 → Section B 脚本 ===
  addSplit(findSplit(found.secBQuestFull, found.secBScript));

  // === 切分点 5: Section B 脚本 → Section C 题目 ===
  addSplit(findSplit(found.secBScript, found.secCQuestFull));

  // === 对于没有 secBScript 的文件，在 secBQuestFull → secCQuestFull 之间切 ===
  // （这些文件的 Section B 题目和脚本混在一起，只能在 Section C 标题前切一刀）
  if (!found.secBScript && found.secBQuestFull && found.secCQuestFull) {
    addSplit(findSplit(found.secBQuestFull, found.secCQuestFull));
  }

  // === 切分点 6a: Passage One → Passage Two ===
  addSplit(findSplit(found.passageOne, found.passageTwo));
  // === 切分点 6b: Passage Two → Passage Three ===
  addSplit(findSplit(found.passageTwo, found.passageThree));
  // === 切分点 6c: Passage Three → Section C 脚本/听写 ===
  addSplit(findSplit(found.passageThree, found.secCScript));

  if (splitCount > 0) {
    const newLines = lines.map((line, i) => splitLines.has(i) ? '---CHUNK-SPLIT---' : line);
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
  }

  return {
    fileName, splitCount, len: content.length, skip: false,
    found: Object.entries(found).map(([k, v]) => k + '@L' + (v + 1)).join(', '),
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
