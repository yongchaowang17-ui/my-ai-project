/**
 * _restructure-cet6-v2.js
 * 重组 CET6 Listening 为 6 个黄金 Chunk。
 *
 * Chunk-1: Section A 题目(Q1-7) + 答案键(全部答案)
 * Chunk-2: Section A 听力原文(对话脚本)
 * Chunk-3: Section B 题目(Q8-15)
 * Chunk-4: Section B 听力原文(短文脚本)
 * Chunk-5: Section C 题目(Q16-25) 合并
 * Chunk-6: Section C 听力原文 + 听写键
 *
 * 策略：
 *   1. 先把文件按行扫描，标记每行属于哪个逻辑区域
 *   2. 按区域提取内容，组装成 6 个 chunk
 *   3. 超长 chunk 递归切分
 *   4. 输出隔离格式
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET6', 'Listening');
const LIMIT = 3990;

/**
 * 标记每行的区域归属。
 * 返回 lineRegions[i] = region名
 */
function classifyLines(lines) {
  const regions = new Array(lines.length).fill('unknown');

  // 扫描关键标记
  const secAQuestStart = []; // Section A 题目开始
  const secBQuestStart = []; // Section B 题目开始
  const secCQuestStart = []; // Section C 题目开始（完整标题）
  const secCSimpleStart = []; // # Section C（简写）
  const answerKeyLines = []; // 答案键
  const scriptStarts = []; // 脚本区开始（听力原文、Conversation/Passage/Recording 标题）
  const analysisStarts = []; // 中文分析区开始
  const questionLines = []; // 题目行（1. A) ...）
  const readingMarkers = []; // 阅读内容标记

  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();

    // Section A 题目标题
    if (/^#\s*Section\s*A\s*[-–—]\s*Long\s*Conversations/i.test(tr)) secAQuestStart.push(i);
    // Section B 题目标题
    if (/^#\s*Section\s*B\s*[-–—]\s*Listening\s*Passages/i.test(tr)) secBQuestStart.push(i);
    // Section C 题目标题（完整）
    if (/^#\s*Section\s*C\s*[-–—]\s*(Lectures|Talks)/i.test(tr)) secCQuestStart.push(i);
    // Section C 简写
    if (/^#\s*SectionC\s*$/i.test(tr)) secCSimpleStart.push(i);
    // Section B 简写（可能是脚本区）
    if (/^#\s*SectionB\s*$/i.test(tr)) scriptStarts.push(i);

    // 答案键
    if (/^\*{2}答案键\*{2}\s*$/.test(tr)) answerKeyLines.push(i);
    if (/^答案键\s*$/.test(tr) && !/详解|精解/.test(tr)) answerKeyLines.push(i);

    // 脚本区标记
    if (/^#\s*·?听力原文·?\s*$/.test(tr)) scriptStarts.push(i);
    if (/^#\s*Conversation\s*(One|Two)\b/i.test(tr)) scriptStarts.push(i);
    if (/^#\s*Passage\s*(One|Two|Three)\b/i.test(tr)) scriptStarts.push(i);
    if (/^#\s*Recording\s*(One|Two|Three)\b/i.test(tr)) scriptStarts.push(i);
    if (/^#\s*Now\s+(you'?ll|listen)/i.test(tr)) scriptStarts.push(i);

    // 中文分析标记
    if (/^#\s*(·?试题精解·?|·?答案详解·?|答案详解|词汇注释|听前猜测|录音分析|一、|二、|三、|\[问题分析\]|·概览·)/.test(tr)) analysisStarts.push(i);

    // 题目行（英文选项）
    if (/^\d{1,2}\.\s*[A-D][\s.)]/.test(tr)) questionLines.push(i);

    // 阅读内容标记
    if (/Questions\d+to\d+arebasedonthefollowingpassage/i.test(tr)) readingMarkers.push(i);
    if (/^#\s*Section\s*[ABC]\s*$/i.test(tr) && i > 200) {
      // 后面的 Section 标记可能是阅读
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (/Questions\d+to\d+arebasedonthefollowingpassage/i.test(lines[j])) {
          readingMarkers.push(i);
          break;
        }
      }
    }
  }

  // === 区域划分逻辑 ===

  // 找阅读部分的起始行（剥离用）
  let readingStart = lines.length;
  if (readingMarkers.length > 0) {
    readingStart = Math.min(readingStart, ...readingMarkers);
  }

  // Section A 题目区：从 secAQuestStart[0] 到第一个脚本/分析标记
  const secAQuestLine = secAQuestStart.length > 0 ? secAQuestStart[0] : -1;
  // Section B 题目区
  const secBQuestLine = secBQuestStart.length > 0 ? secBQuestStart[0] : -1;
  // Section C 题目区（完整标题）
  const secCQuestLine = secCQuestStart.length > 0 ? secCQuestStart[0] : -1;

  // === 标记每行的区域 ===

  for (let i = 0; i < lines.length; i++) {
    if (i >= readingStart) { regions[i] = 'reading'; continue; }

    const tr = lines[i].trim();

    // 答案键行
    if (answerKeyLines.includes(i)) { regions[i] = 'answerKey'; continue; }
    // 答案键后续行（答案列表）
    if (answerKeyLines.length > 0) {
      const lastAK = Math.max(...answerKeyLines);
      if (i > lastAK && i < lastAK + 30) {
        // 检查是否是答案列表行
        if (/^\d{1,2}[.．]\s*[A-D]/.test(tr) || /^[A-D]{4,}/.test(tr) || /^Q?\d+[～~\-]\d+[：:]/.test(tr) || /^[12]\d[.．]\s*[A-D]/.test(tr)) {
          regions[i] = 'answerKey';
          continue;
        }
        // 空行或短行可能是答案键的一部分
        if (tr === '' || tr.length < 20) {
          // 检查前后是否都是答案键
          let prevIsAK = false, nextIsAK = false;
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (regions[j] === 'answerKey') { prevIsAK = true; break; }
          }
          for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
            if (regions[j] === 'answerKey' || /^\d{1,2}[.．]\s*[A-D]/.test(lines[j].trim())) { nextIsAK = true; break; }
          }
          if (prevIsAK && nextIsAK) { regions[i] = 'answerKey'; continue; }
        }
      }
    }

    // Section A 题目区（英文题目 + 中文分析）
    if (secAQuestLine >= 0) {
      // 从 secAQuestLine 到 secBQuestLine 之前，都是 Section A 区域
      const endA = secBQuestLine > 0 ? secBQuestLine : (secCQuestLine > 0 ? secCQuestLine : readingStart);
      if (i >= secAQuestLine && i < endA) {
        // 区分英文题目、中文分析、脚本
        const isScript = scriptStarts.includes(i) || 
          (i > secAQuestLine + 5 && /^M\s*[:：]|^W\s*[:：]|^M:|^W:/.test(tr));
        const isAnalysis = analysisStarts.includes(i);

        if (isScript && !isAnalysis) {
          regions[i] = 'secAScript';
        } else if (isAnalysis) {
          regions[i] = 'secAAnalysis';
        } else {
          regions[i] = 'secAQuest';
        }
        continue;
      }
    }

    // Section B 区域
    if (secBQuestLine >= 0 && i >= secBQuestLine) {
      const endB = secCQuestLine > 0 ? secCQuestLine : readingStart;
      if (i < endB) {
        const isScript = scriptStarts.includes(i) ||
          (i > secBQuestLine + 5 && /^M\s*[:：]|^W\s*[:：]|^M:|^W:/.test(tr));
        const isAnalysis = analysisStarts.includes(i);

        if (isScript && !isAnalysis) {
          regions[i] = 'secBScript';
        } else if (isAnalysis) {
          regions[i] = 'secBAnalysis';
        } else {
          regions[i] = 'secBQuest';
        }
        continue;
      }
    }

    // Section C 区域
    if (secCQuestLine >= 0 && i >= secCQuestLine) {
      const isScript = scriptStarts.includes(i) ||
        (i > secCQuestLine + 5 && /^M\s*[:：]|^W\s*[:：]|^M:|^W:/.test(tr));
      const isAnalysis = analysisStarts.includes(i);

      if (isScript && !isAnalysis) {
        regions[i] = 'secCScript';
      } else if (isAnalysis) {
        regions[i] = 'secCAnalysis';
      } else {
        regions[i] = 'secCQuest';
      }
      continue;
    }

    // 其他（可能是独立的答案键、对话开头等）
    if (secAQuestLine < 0 && i < readingStart) {
      // 没有 Section A 标题的文件
      regions[i] = 'other';
    }
  }

  return regions;
}

/**
 * 从 lines 中提取指定区域的内容。
 */
function extractRegion(lines, regions, ...regionNames) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (regionNames.includes(regions[i])) {
      result.push(lines[i]);
    }
  }
  return result.join('\n');
}

/**
 * 按连续段提取区域内容（只取连续块）。
 */
function extractRegionBlocks(lines, regions, ...regionNames) {
  const blocks = [];
  let currentBlock = [];
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (regionNames.includes(regions[i])) {
      if (!inBlock) {
        inBlock = true;
        currentBlock = [];
      }
      currentBlock.push(lines[i]);
    } else {
      if (inBlock && currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inBlock = false;
      }
    }
  }
  if (inBlock && currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }
  return blocks;
}

/**
 * 递归切分超长文本。
 */
function splitTooLong(text) {
  text = text.replace(/^\n+/, '').replace(/\n+$/, '');
  if (text.length <= LIMIT) return [text];

  const lines = text.split('\n');
  let bestCut = -1, bestDist = Infinity;
  const mid = text.length / 2;

  // 优先找空行
  let charPos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '' && charPos >= 2800 && charPos <= LIMIT) {
      const d = Math.abs(charPos - mid);
      if (d < bestDist) { bestDist = d; bestCut = i; }
    }
    charPos += lines[i].length + 1;
  }

  // 找题号行
  if (bestCut === -1) {
    charPos = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^\d{1,2}\.\s/.test(lines[i].trim()) && charPos >= 2800 && charPos <= LIMIT) {
        bestCut = i;
        break;
      }
      charPos += lines[i].length + 1;
    }
  }

  // 强制切
  if (bestCut === -1) {
    charPos = 0;
    for (let i = 0; i < lines.length; i++) {
      charPos += lines[i].length + 1;
      if (charPos >= 3000) { bestCut = i; break; }
    }
  }

  if (bestCut === -1 || bestCut >= lines.length) {
    const m = Math.min(Math.max(2800, Math.floor(text.length / 2)), text.length - 1);
    return [text.substring(0, m), text.substring(m)];
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
  const regions = classifyLines(lines);

  // === 组装 6 个 Chunk ===
  const chunks = [];

  // Chunk-1: Section A 题目 + 答案键
  const secAQuestContent = extractRegion(lines, regions, 'secAQuest');
  const answerKeyContent = extractRegion(lines, regions, 'answerKey');
  let chunk1 = secAQuestContent;
  if (answerKeyContent.trim()) {
    chunk1 = chunk1 + '\n\n' + answerKeyContent;
  }
  chunk1 = chunk1.replace(/^\n+/, '').replace(/\n+$/, '');
  if (chunk1.trim()) chunks.push(chunk1);

  // Chunk-2: Section A 听力原文
  let chunk2 = extractRegion(lines, regions, 'secAScript');
  chunk2 = chunk2.replace(/^\n+/, '').replace(/\n+$/, '');
  if (chunk2.trim()) chunks.push(chunk2);

  // Chunk-3: Section B 题目
  let chunk3 = extractRegion(lines, regions, 'secBQuest');
  chunk3 = chunk3.replace(/^\n+/, '').replace(/\n+$/, '');
  if (chunk3.trim()) chunks.push(chunk3);

  // Chunk-4: Section B 听力原文 + 分析
  const secBScriptBlocks = extractRegionBlocks(lines, regions, 'secBScript', 'secBAnalysis');
  let chunk4 = secBScriptBlocks.join('\n\n');
  chunk4 = chunk4.replace(/^\n+/, '').replace(/\n+$/, '');
  if (chunk4.trim()) chunks.push(chunk4);

  // Chunk-5: Section C 题目(Q16-25) 合并
  let chunk5 = extractRegion(lines, regions, 'secCQuest');
  chunk5 = chunk5.replace(/^\n+/, '').replace(/\n+$/, '');
  if (chunk5.trim()) chunks.push(chunk5);

  // Chunk-6: Section C 听力原文 + 分析
  const secCScriptBlocks = extractRegionBlocks(lines, regions, 'secCScript', 'secCAnalysis');
  let chunk6 = secCScriptBlocks.join('\n\n');
  chunk6 = chunk6.replace(/^\n+/, '').replace(/\n+$/, '');
  if (chunk6.trim()) chunks.push(chunk6);

  // === 递归切分超长 chunk ===
  const finalChunks = [];
  for (const chunk of chunks) {
    finalChunks.push(...splitTooLong(chunk));
  }

  // === 写回 ===
  if (finalChunks.length > 0) {
    fs.writeFileSync(filePath, finalChunks.join('\n\n---CHUNK-SPLIT---\n\n'), 'utf8');
  }

  const maxLen = Math.max(...finalChunks.map(c => c.length));
  return { fileName, skip: false, chunks: finalChunks.length, maxLen, origLen: content.length };
}

// 主流程
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log('Found ' + files.length + ' files.\n');

let processed = 0, skipped = 0, totalChunks = 0;
for (const file of files) {
  const result = processFile(path.join(DIR, file));
  if (result.skip) { skipped++; continue; }
  processed++;
  totalChunks += result.chunks;
  console.log(result.fileName + ': ' + result.chunks + ' chunks, max ' + result.maxLen + 'ch' +
    (result.maxLen >= 4000 ? ' ***VIOLATION***' : ''));
}

console.log('\nProcessed: ' + processed + ', Skipped: ' + skipped + ', Total chunks: ' + totalChunks);

// 全面验证
console.log('\n=== FULL VERIFICATION ===');
let violations = 0, formatErrors = 0, maxLen = 0;
for (const file of files) {
  const fp = path.join(DIR, file);
  const t = fs.readFileSync(fp, 'utf8');
  if (t.length < 200) continue;
  const parts = t.split('---CHUNK-SPLIT---');
  parts.forEach(p => { if (p.length > maxLen) maxLen = p.length; if (p.length >= 4000) violations++; });
  const ls = t.split('\n');
  for (let i = 0; i < ls.length; i++) {
    if (ls[i].trim() === '---CHUNK-SPLIT---') {
      if ((i === 0 || ls[i-1].trim() !== '') || (i >= ls.length-1 || ls[i+1].trim() !== '')) formatErrors++;
    }
  }
}
console.log('Max chunk: ' + maxLen);
console.log('Violations (>=4000): ' + violations);
console.log('Format errors: ' + formatErrors);
console.log('Result: ' + (violations === 0 && formatErrors === 0 ? 'PASS' : 'FAIL'));
