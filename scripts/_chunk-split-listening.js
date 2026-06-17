/**
 * _chunk-split-listening.js
 * 专用脚本：为 05 区 CET4 Listening 文件插入 ---CHUNK-SPLIT--- 粗切分标记。
 *
 * 策略：优先匹配完整标题（如 # Section B - Long Conversations），
 * 退而求其次用简写标题（# SectionB）。
 * 跳过 <1000 字符的空壳文件。
 * 不改变任何原始文字。
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Listening');

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  if (content.length < 1000) return { fileName, skip: true, len: content.length };

  const lines = content.split('\n');

  // === 收集标记 ===
  // 用"首次出现"策略：每个类型只取第一个匹配
  const found = {};

  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();

    // 答案键（仅旧格式有）
    if (!found.answerKey && /^\*{2}答案键\*{2}\s*$/.test(tr)) {
      found.answerKey = i;
    }

    // Section A 题目区标题
    if (!found.secAQuest && /^#\s*Section\s*A\s*[-–—]\s*Short\s*News/i.test(tr)) {
      found.secAQuest = i;
    }

    // Section A 脚本区（旧格式 # SectionA，新格式有时也有）
    if (!found.secAScript && /^#\s*SectionA\s*$/.test(tr)) {
      found.secAScript = i;
    }

    // Section B 完整题目标题（最可靠）
    if (!found.secBQuestFull && /^#\s*Section\s*B\s*[-–—]\s*Long\s*Conversations/i.test(tr)) {
      found.secBQuestFull = i;
    }

    // Section B 脚本区（旧格式 # SectionB）
    if (!found.secBScript && /^#\s*SectionB\s*$/.test(tr)) {
      found.secBScript = i;
    }

    // Section C 完整题目标题（最可靠）
    if (!found.secCQuestFull && /^#\s*Section\s*C\s*[-–—]\s*Listening\s*Passages/i.test(tr)) {
      found.secCQuestFull = i;
    }

    // Section C 脚本/听写区（旧格式 # SectionC）
    if (!found.secCScript && /^#\s*SectionC\s*$/.test(tr)) {
      found.secCScript = i;
    }

    // Passage 标题（Section C 内部）
    if (!found.passageOne && /^#\s*Passage\s*One\s*$/i.test(tr)) {
      found.passageOne = i;
    }
    if (!found.passageTwo && /^#\s*Passage\s*Two\s*$/i.test(tr)) {
      found.passageTwo = i;
    }
    if (!found.passageThree && /^#\s*Passage\s*Three\s*$/i.test(tr)) {
      found.passageThree = i;
    }
  }

  // 收集所有 --- 行
  const dashLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i].trim())) dashLines.push(i);
  }

  // 找在 (start, end) 之间最后一个 --- 作为切点
  function findLastDash(start, end) {
    const candidates = dashLines.filter(d => d > start && d < end);
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }

  // 找在 (start, end) 之间最后一个非空行（无 --- 时兜底）
  function findLastNonEmpty(start, end) {
    for (let i = end - 1; i > start; i--) {
      if (lines[i].trim() !== '') return i;
    }
    return null;
  }

  // 在 start 和 end 之间找切点（先试 ---，再试非空行）
  function findSplit(start, end) {
    if (start === undefined || end === undefined || start >= end) return null;
    return findLastDash(start, end) ?? findLastNonEmpty(start, end);
  }

  const splitLines = new Set();
  let splitCount = 0;

  function addSplit(lineIdx) {
    if (lineIdx !== null && lineIdx !== undefined) {
      splitLines.add(lineIdx);
      splitCount++;
    }
  }

  // === 切分点 1: Section A 题目 → 答案键 ===
  addSplit(findSplit(found.secAQuest, found.answerKey));

  // === 切分点 2: 答案键 → Section A 脚本 ===
  addSplit(findSplit(found.answerKey, found.secAScript));

  // === 切分点 3: Section A 脚本 → Section B 题目 ===
  // 优先用完整标题
  const secBQuest = found.secBQuestFull;
  addSplit(findSplit(found.secAScript, secBQuest));

  // === 切分点 4: Section B 题目 → Section B 脚本 ===
  // 对于有完整标题的文件，找完整标题之后、# SectionB 之前的切点
  addSplit(findSplit(secBQuest, found.secBScript));

  // === 切分点 5: Section B 脚本 → Section C 题目 ===
  const secCQuest = found.secCQuestFull;
  addSplit(findSplit(found.secBScript, secCQuest));

  // === 切分点 6a: Passage One → Passage Two ===
  addSplit(findSplit(found.passageOne, found.passageTwo));

  // === 切分点 6b: Passage Two → Passage Three ===
  addSplit(findSplit(found.passageTwo, found.passageThree));

  // === 切分点 6c: Passage Three → Section C 脚本/听写 ===
  addSplit(findSplit(found.passageThree, found.secCScript));

  // 执行替换
  if (splitCount > 0) {
    const newLines = lines.map((line, i) => splitLines.has(i) ? '---CHUNK-SPLIT---' : line);
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
  }

  return {
    fileName,
    splitCount,
    len: content.length,
    skip: false,
    found: Object.entries(found).map(([k, v]) => k + '@L' + (v + 1)).join(', '),
  };
}

// 主流程
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log('Found ' + files.length + ' files.\n');

let totalSplits = 0, processed = 0, skipped = 0;

for (const file of files) {
  const result = processFile(path.join(DIR, file));
  if (result.skip) { skipped++; console.log(result.fileName + ': SKIPPED (' + result.len + 'ch)'); continue; }
  processed++;
  totalSplits += result.splitCount;
  console.log(result.fileName + ': ' + result.splitCount + ' splits (' + result.len + 'ch) | ' + result.found);
}

console.log('\n=== Summary ===');
console.log('Processed: ' + processed + ', Skipped: ' + skipped);
console.log('Total CHUNK-SPLIT markers inserted: ' + totalSplits);
