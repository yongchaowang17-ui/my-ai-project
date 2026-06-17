/**
 * _chunk-split-all.js
 * 批量为 05 工作区 CET4 Reading 文件插入 ---CHUNK-SPLIT--- 标记。
 * 切分 4 个专项题块：Section A / Section B / Section C(Passage One) / Passage Two
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Reading');

// 匹配段落标题行（支持 # / ##，有无空格，大小写）
const SECTION_RE = /^(#{1,2})\s*(Section\s+A|SectionA)\b/i;
const SECTION_B_RE = /^(#{1,2})\s*(Section\s+B|SectionB)\b/i;
const SECTION_C_RE = /^(#{1,2})\s*(Section\s+C|SectionC)\b/i;
const PASSAGE_ONE_RE = /^(#{1,2})\s*(Passage\s*One|PassageOne)\b/i;
const PASSAGE_TWO_RE = /^(#{1,2})\s*(Passage\s*Two|PassageTwo)\b/i;

const DASH_RE = /^---$/;

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fileName = path.basename(filePath);

  // 收集段落标题行号 (0-based)
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (SECTION_RE.test(tr))      markers.push({ type: 'A', line: i });
    else if (SECTION_B_RE.test(tr))  markers.push({ type: 'B', line: i });
    else if (SECTION_C_RE.test(tr))  markers.push({ type: 'C', line: i });
    else if (PASSAGE_ONE_RE.test(tr)) markers.push({ type: 'PO', line: i });
    else if (PASSAGE_TWO_RE.test(tr)) markers.push({ type: 'PT', line: i });
  }

  // 收集所有 --- 行号 (0-based)
  const dashLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (DASH_RE.test(lines[i].trim())) {
      dashLines.push(i);
    }
  }

  // 找切分点：在每对相邻段落标记之间，取最后一个 ---
  function findLastDashBetween(startLine, endLine) {
    // 找在 (startLine, endLine) 开区间内的最后一个 ---
    const candidates = dashLines.filter(d => d > startLine && d < endLine);
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }

  // 构建需要替换的行号集合（0-based）
  const splitLineSet = new Set();
  let splitCount = 0;

  // 切分点 1: Section A → Section B
  const secA = markers.find(m => m.type === 'A');
  const secB = markers.find(m => m.type === 'B');
  if (secA && secB) {
    const dashLine = findLastDashBetween(secA.line, secB.line);
    if (dashLine !== null) {
      splitLineSet.add(dashLine);
      splitCount++;
    }
  }

  // 切分点 2: Section B → Section C / Passage One
  const secC = markers.find(m => m.type === 'C');
  const passageOne = markers.find(m => m.type === 'PO');
  const nextAfterB = secC || passageOne;
  if (secB && nextAfterB) {
    const dashLine = findLastDashBetween(secB.line, nextAfterB.line);
    if (dashLine !== null) {
      splitLineSet.add(dashLine);
      splitCount++;
    }
  }

  // 切分点 3: Section C / Passage One → Passage Two
  const passageTwo = markers.find(m => m.type === 'PT');
  const prevBeforePT = passageOne || secC;
  if (prevBeforePT && passageTwo) {
    const dashLine = findLastDashBetween(prevBeforePT.line, passageTwo.line);
    if (dashLine !== null) {
      splitLineSet.add(dashLine);
      splitCount++;
    }
  }

  // 执行替换
  if (splitCount > 0) {
    const newLines = lines.map((line, i) => {
      if (splitLineSet.has(i)) {
        return '---CHUNK-SPLIT---';
      }
      return line;
    });
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
  }

  return { fileName, splitCount, markerCount: markers.length };
}

// 主流程
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log(`Found ${files.length} files to process.\n`);

let totalSplits = 0;
let normalFiles = 0;
let specialFiles = 0;

for (const file of files) {
  const filePath = path.join(DIR, file);
  const result = processFile(filePath);
  totalSplits += result.splitCount;

  const tag = result.splitCount < 3 ? ' [SPECIAL]' : '';
  console.log(`${result.fileName}: ${result.splitCount} splits, ${result.markerCount} markers${tag}`);

  if (result.splitCount < 3) specialFiles++;
  else normalFiles++;
}

console.log(`\n=== Summary ===`);
console.log(`Total files: ${files.length}`);
console.log(`Normal (3 splits): ${normalFiles}`);
console.log(`Special (<3 splits): ${specialFiles}`);
console.log(`Total CHUNK-SPLIT markers inserted: ${totalSplits}`);
