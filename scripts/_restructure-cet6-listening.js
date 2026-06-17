/**
 * _restructure-cet6-listening.js
 * 重组 05 区 CET6 Listening 文件为 6 块标准结构。
 *
 * 6 块定义：
 *   Block 1: Section A 题目(Q1-7) + 答案键
 *   Block 2: Section A 听力原文(Conversation One & Two)
 *   Block 3: Section B 题目(Q8-15)
 *   Block 4: Section B 听力原文(Passage One & Two)
 *   Block 5: Section C 题目(Q16-25) 合并
 *   Block 6: Section C 听力原文(Recording One/Two/Three) + 听写
 *
 * 每块 < 4000 字符，标记用 \n\n---CHUNK-SPLIT---\n\n 隔离。
 * 不改变任何原始文字。
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET6', 'Listening');
const LIMIT = 3990;

// === 标记正则 ===
const RE = {
  secAQuest: /^#\s*Section\s*A\s*[-–—]\s*Long\s*Conversations/i,
  secAScript: /^#\s*SectionA\s*$/m,
  secBQuestFull: /^#\s*Section\s*B\s*[-–—]\s*Listening\s*Passages/i,
  secBScript: /^#\s*SectionB\s*$/m,
  secCQuestFull: /^#\s*Section\s*C\s*[-–—]\s*(Lectures|Talks)/i,
  secCSec: /^#\s*SectionC\s*$/m,
  passageOne: /^#\s*Passage\s*One\b/i,
  passageTwo: /^#\s*Passage\s*Two\b/i,
  passageThree: /^#\s*Passage\s*Three\b/i,
  recordingOne: /^#\s*Recording\s*One\b/i,
  recordingTwo: /^#\s*Recording\s*Two\b/i,
  recordingThree: /^#\s*Recording\s*Three\b/i,
  answerKey: /^\*{2}答案键\*{2}\s*$/,
  conversationTwo: /^#\s*Conversation\s*Two\b/i,
  // 用于检测"题目区"和"脚本/分析区"
  questionLine: /^\d{1,2}\.\s*[A-D]/,
  analysisHead: /^#\s*(·?听力原文·?|·?试题精解·?|·?答案详解·?|答案详解|词汇注释|听前猜测|全文翻译|录音分析|一、|二、|三、|\[问题分析\])/,
  // 阅读部分的标记（需要剥离）
  readingSection: /^#\s*(Section\s*[ABC]|Questions\d+to\d+arebasedonthefollowingpassage)/i,
};

/**
 * 扫描文件，返回所有标记行的位置。
 */
function scanMarkers(lines) {
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (RE.secAQuest.test(tr)) markers.push({ type: 'SEC_A_QUEST', line: i });
    else if (RE.secAScript.test(tr)) markers.push({ type: 'SEC_A_SCRIPT', line: i });
    else if (RE.secBQuestFull.test(tr)) markers.push({ type: 'SEC_B_QUEST_FULL', line: i });
    else if (RE.secBScript.test(tr)) markers.push({ type: 'SEC_B_SCRIPT', line: i });
    else if (RE.secCQuestFull.test(tr)) markers.push({ type: 'SEC_C_QUEST_FULL', line: i });
    else if (RE.secCSec.test(tr)) markers.push({ type: 'SEC_C_SEC', line: i });
    else if (RE.passageOne.test(tr)) markers.push({ type: 'PASSAGE_ONE', line: i });
    else if (RE.passageTwo.test(tr)) markers.push({ type: 'PASSAGE_TWO', line: i });
    else if (RE.passageThree.test(tr)) markers.push({ type: 'PASSAGE_THREE', line: i });
    else if (RE.recordingOne.test(tr)) markers.push({ type: 'RECORDING_ONE', line: i });
    else if (RE.recordingTwo.test(tr)) markers.push({ type: 'RECORDING_TWO', line: i });
    else if (RE.recordingThree.test(tr)) markers.push({ type: 'RECORDING_THREE', line: i });
    else if (RE.answerKey.test(tr)) markers.push({ type: 'ANSWER_KEY', line: i });
    else if (RE.conversationTwo.test(tr)) markers.push({ type: 'CONVERSATION_TWO', line: i });
  }
  return markers;
}

/**
 * 提取 lines[start..end) 的内容。
 */
function extract(lines, start, end) {
  return lines.slice(start, end).join('\n');
}

/**
 * 对超长文本递归切分。
 */
function splitTooLong(text) {
  text = text.replace(/^\n+/, '').replace(/\n+$/, '');
  if (text.length <= LIMIT) return [text];

  const lines = text.split('\n');
  // 找空行作为切点
  let bestCut = -1;
  let bestDist = Infinity;
  const mid = text.length / 2;
  let charPos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '' && charPos >= 3000 && charPos <= LIMIT) {
      const dist = Math.abs(charPos - mid);
      if (dist < bestDist) { bestDist = dist; bestCut = i; }
    }
    charPos += lines[i].length + 1;
  }

  if (bestCut === -1) {
    // 找题号行
    charPos = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^\d{1,2}\.\s/.test(lines[i].trim()) && charPos >= 3000 && charPos <= LIMIT) {
        bestCut = i;
        break;
      }
      charPos += lines[i].length + 1;
    }
  }

  if (bestCut === -1) {
    // 强制在 mid 附近切
    charPos = 0;
    for (let i = 0; i < lines.length; i++) {
      charPos += lines[i].length + 1;
      if (charPos >= 3200) { bestCut = i; break; }
    }
  }

  if (bestCut === -1 || bestCut >= lines.length) {
    const mid2 = Math.min(Math.max(3000, Math.floor(text.length / 2)), text.length - 1);
    return [text.substring(0, mid2), text.substring(mid2)];
  }

  const before = lines.slice(0, bestCut).join('\n').replace(/\n+$/, '');
  const after = lines.slice(bestCut).join('\n').replace(/^\n+/, '');
  return [...splitTooLong(before), ...splitTooLong(after)];
}

/**
 * 主处理函数。
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  if (content.length < 200) return { fileName, skip: true };

  const lines = content.split('\n');
  const markers = scanMarkers(lines);

  // === 1. 定位各区域边界 ===

  // Section A 题目区：从 SEC_A_QUEST 开始
  const secAQuest = markers.find(m => m.type === 'SEC_A_QUEST');
  // Section A 脚本区：找 Conversation One/Two 或 SEC_A_SCRIPT
  const convTwo = markers.find(m => m.type === 'CONVERSATION_TWO');
  const secAScript = markers.find(m => m.type === 'SEC_A_SCRIPT');
  // Section B 题目区
  const secBQuestFull = markers.find(m => m.type === 'SEC_B_QUEST_FULL');
  // Section B 脚本区
  const secBScript = markers.find(m => m.type === 'SEC_B_SCRIPT');
  // Section C 题目区
  const secCQuestFull = markers.find(m => m.type === 'SEC_C_QUEST_FULL');
  // Section C 脚本区
  const secCSec = markers.find(m => m.type === 'SEC_C_SEC');
  // Passage/Recording 标记
  const passageOne = markers.find(m => m.type === 'PASSAGE_ONE');
  const passageTwo = markers.find(m => m.type === 'PASSAGE_TWO');
  const passageThree = markers.find(m => m.type === 'PASSAGE_THREE');
  const recordingOne = markers.find(m => m.type === 'RECORDING_ONE');
  const recordingTwo = markers.find(m => m.type === 'RECORDING_TWO');
  const recordingThree = markers.find(m => m.type === 'RECORDING_THREE');
  // 答案键
  const answerKey = markers.find(m => m.type === 'ANSWER_KEY');

  // === 2. 提取各块内容 ===

  const blocks = [];

  // --- Block 1: Section A 题目 + 答案键 ---
  if (secAQuest) {
    let endLine = lines.length;
    // 找 Section A 脚本的起始位置
    if (secAScript) endLine = Math.min(endLine, secAScript.line);
    if (convTwo) endLine = Math.min(endLine, convTwo.line);
    // 也检查是否有 "·听力原文·" 或 "·试题精解·" 标记了脚本区开始
    const firstAnalysisAfterQA = markers.find(m =>
      m.line > secAQuest.line && m.line < endLine &&
      (m.type === 'SEC_B_QUEST_FULL' || m.type === 'SEC_B_SCRIPT')
    );
    if (firstAnalysisAfterQA) endLine = Math.min(endLine, firstAnalysisAfterQA.line);

    // 向前搜索，找到第一个 "·听力原文·" 或 conversation 脚本开始
    for (let i = secAQuest.line + 1; i < endLine; i++) {
      const tr = lines[i].trim();
      if (/^#\s*·?听力原文·?\s*$/.test(tr) || /^#\s*Conversation\s*One\b/i.test(tr)) {
        // 这里开始是脚本区，但需要保留之前的分析
        // 检查这是否在 "·试题精解·" 之后
        let hasAnalysisBefore = false;
        for (let j = secAQuest.line; j < i; j++) {
          if (/^#\s*·?试题精解·?\s*$/.test(lines[j].trim())) { hasAnalysisBefore = true; break; }
        }
        if (!hasAnalysisBefore) {
          // 第一次出现 听力原文 可能是脚本区开始
          // 但如果之前有题目分析，继续往前找
        }
        break;
      }
    }

    let block1 = extract(lines, secAQuest.line, endLine);
    blocks.push({ name: 'Block1_SecA_Questions', content: block1 });
  }

  // --- Block 2: Section A 听力原文 ---
  // 找 Conversation One 的实际脚本开始
  const convOneScript = markers.find(m => m.type === 'CONVERSATION_TWO');
  // 脚本区通常在 "·听力原文·" 标记之后
  let secAScriptStart = null;
  if (secAQuest) {
    // 从 SEC_A_QUEST 之后找第一个 "·听力原文·"
    for (let i = secAQuest.line + 1; i < lines.length; i++) {
      if (/^#\s*·?听力原文·?\s*$/.test(lines[i].trim())) {
        secAScriptStart = i;
        break;
      }
      // 或者找 Conversation One 脚本（不是选项区）
      if (/^#\s*Conversation\s*One\b/i.test(lines[i].trim())) {
        // 检查后面几行是否有对话内容（M: 或 W:）
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (/^[MW]\s*[:：]/.test(lines[j].trim()) || /^M:|^W:/.test(lines[j].trim())) {
            secAScriptStart = i;
            break;
          }
        }
        if (secAScriptStart !== null) break;
      }
    }
  }

  if (secAScriptStart !== null) {
    let endLine = lines.length;
    // Section A 脚本到 Section B 题目之前
    if (secBQuestFull) endLine = Math.min(endLine, secBQuestFull.line);
    // 或到 Section B 脚本之前
    if (secBScript) endLine = Math.min(endLine, secBScript.line);

    let block2 = extract(lines, secAScriptStart, endLine);
    blocks.push({ name: 'Block2_SecA_Scripts', content: block2 });
  }

  // --- Block 3: Section B 题目 ---
  if (secBQuestFull) {
    let endLine = lines.length;
    // 找 Section B 脚本开始
    if (secBScript) endLine = Math.min(endLine, secBScript.line);
    // 或找 Passage One/Two
    if (passageOne) endLine = Math.min(endLine, passageOne.line);

    // 对于没有 secBScript 的文件，在 "·听力原文·" 之前切
    if (!secBScript && !passageOne) {
      for (let i = secBQuestFull.line + 1; i < lines.length; i++) {
        if (/^#\s*·?听力原文·?\s*$/.test(lines[i].trim())) {
          endLine = Math.min(endLine, i);
          break;
        }
      }
    }

    let block3 = extract(lines, secBQuestFull.line, endLine);
    blocks.push({ name: 'Block3_SecB_Questions', content: block3 });
  }

  // --- Block 4: Section B 听力原文 ---
  let secBScriptStart = null;
  if (secBScript) {
    secBScriptStart = secBScript.line;
  } else if (passageOne) {
    secBScriptStart = passageOne.line;
  }

  if (secBScriptStart !== null) {
    let endLine = lines.length;
    // 找 Section C 题目或脚本
    if (secCQuestFull) endLine = Math.min(endLine, secCQuestFull.line);
    if (secCSec) endLine = Math.min(endLine, secCSec.line);
    // 找 Recording One
    if (recordingOne) endLine = Math.min(endLine, recordingOne.line);

    let block4 = extract(lines, secBScriptStart, endLine);
    blocks.push({ name: 'Block4_SecB_Scripts', content: block4 });
  }

  // --- Block 5: Section C 题目(Q16-25) 合并 ---
  if (secCQuestFull) {
    let endLine = lines.length;
    // 找 Section C 脚本/Recording
    if (secCSec) endLine = Math.min(endLine, secCSec.line);
    if (recordingOne) endLine = Math.min(endLine, recordingOne.line);
    // 或找第一个 "·听力原文·"
    for (let i = secCQuestFull.line + 1; i < endLine; i++) {
      if (/^#\s*·?听力原文·?\s*$/.test(lines[i].trim())) {
        endLine = Math.min(endLine, i);
        break;
      }
    }

    let block5 = extract(lines, secCQuestFull.line, endLine);
    blocks.push({ name: 'Block5_SecC_Questions', content: block5 });
  }

  // --- Block 6: Section C 听力原文 ---
  let secCScriptStart = null;
  if (recordingOne) {
    secCScriptStart = recordingOne.line;
  } else if (secCSec) {
    secCScriptStart = secCSec.line;
  } else if (passageOne && secCQuestFull && passageOne.line > secCQuestFull.line) {
    // Passage One 在 Section C 区域内
    secCScriptStart = passageOne.line;
  }

  if (secCScriptStart !== null) {
    let endLine = lines.length;
    // 剥离阅读部分（如果被拼接在后面）
    for (let i = secCScriptStart + 1; i < lines.length; i++) {
      const tr = lines[i].trim();
      // 检测阅读部分的特征标记
      if (/^#\s*Section\s*A\s*$/.test(tr) && i > secCScriptStart + 50) {
        // 可能是阅读 Section A，检查后面是否有 "Questions36to45"
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          if (/Questions\d+to\d+arebasedonthefollowingpassage/i.test(lines[j])) {
            endLine = i;
            break;
          }
        }
      }
      // 检测 "SectionB" + "PlasticSurgery" 等阅读特征
      if (/^#\s*SectionB\s*$/.test(tr) && i > secCScriptStart + 50) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (/PlasticSurgery|Climatechange|EliteMath/i.test(lines[j])) {
            endLine = i;
            break;
          }
        }
      }
    }

    let block6 = extract(lines, secCScriptStart, endLine);
    blocks.push({ name: 'Block6_SecC_Scripts', content: block6 });
  }

  // === 3. 切分超长块 ===
  const finalBlocks = [];
  for (const block of blocks) {
    const trimmed = block.content.replace(/^\n+/, '').replace(/\n+$/, '');
    if (trimmed.length === 0) continue;
    const parts = splitTooLong(trimmed);
    for (const part of parts) {
      finalBlocks.push(part);
    }
  }

  // === 4. 写回文件 ===
  if (finalBlocks.length > 0) {
    const newContent = finalBlocks.join('\n\n---CHUNK-SPLIT---\n\n');
    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  const maxLen = Math.max(...finalBlocks.map(b => b.length));
  return {
    fileName,
    skip: false,
    blocks: finalBlocks.length,
    maxLen,
    totalChars: finalBlocks.reduce((s, b) => s + b.length, 0),
    origLen: content.length,
  };
}

// 主流程
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log('Found ' + files.length + ' files.\n');

let processed = 0, skipped = 0, totalBlocks = 0, violations = 0;
const results = [];

for (const file of files) {
  const result = processFile(path.join(DIR, file));
  if (result.skip) { skipped++; continue; }
  processed++;
  totalBlocks += result.blocks;
  if (result.maxLen >= 4000) violations++;
  results.push(result);
  console.log(result.fileName + ': ' + result.blocks + ' blocks, max ' + result.maxLen + 'ch' +
    (result.maxLen >= 4000 ? ' *** VIOLATION ***' : ''));
}

console.log('\n=== Summary ===');
console.log('Processed: ' + processed + ', Skipped: ' + skipped);
console.log('Total blocks: ' + totalBlocks);
console.log('Violations (>=4000): ' + violations);

// 详细验证
console.log('\n=== DETAILED VERIFICATION ===');
let allViolations = 0;
for (const file of files) {
  const fp = path.join(DIR, file);
  const t = fs.readFileSync(fp, 'utf8');
  const parts = t.split('---CHUNK-SPLIT---');
  parts.forEach((p, i) => {
    if (p.length >= 4000) {
      allViolations++;
      console.log('VIOLATION: ' + file + ' chunk#' + i + ' (' + p.length + 'ch)');
    }
  });
  // 检查隔离格式
  const lines = t.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---CHUNK-SPLIT---') {
      const prevOk = i > 0 && lines[i - 1].trim() === '';
      const nextOk = i < lines.length - 1 && lines[i + 1].trim() === '';
      if (!prevOk || !nextOk) {
        console.log('FORMAT: ' + file + ' marker at L' + (i + 1) + ' not isolated');
      }
    }
  }
}
console.log('Total violations: ' + allViolations);
