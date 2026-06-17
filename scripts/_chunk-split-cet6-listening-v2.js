/**
 * _chunk-split-cet6-listening-v2.js
 * 为 05 区 CET6 Listening 文件插入精确的 ---CHUNK-SPLIT--- 切分标记。
 *
 * 5 个切分点：
 *   1. Section A 题目 → 录音原文
 *   2. Section A → Section B 题目
 *   3. Section B 题目 → 听力原文与问句
 *   4. Section B → Section C 题目
 *   5. Section C 题目 → 复合听写
 *
 * 生成 6 个语义完整的物理块。
 * 不改变任何原始文字。
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET6', 'Listening');
const MIN_SIZE = 300;
const SPLIT_MARKER = '---CHUNK-SPLIT---';

// ─── 工具函数 ───

/** 清除所有已有标记行，并将标记产生的连续空行压缩 */
function stripOldSplits(lines) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === SPLIT_MARKER) continue;
    result.push(lines[i]);
  }
  // 压缩连续 2+ 空行为 1 个空行
  const out = [];
  let lastEmpty = false;
  for (const line of result) {
    if (line.trim() === '') {
      if (!lastEmpty) out.push(line);
      lastEmpty = true;
    } else {
      out.push(line);
      lastEmpty = false;
    }
  }
  return out;
}

/** 在 lines[idx] 之前插入 \n\n---CHUNK-SPLIT---\n\n（即 marker 独占一行，前后各一个空行） */
function insertSplitBefore(lines, idx) {
  // 确保 idx 前面有一个空行（如果不是文件开头且前面不是空行）
  let insertions = [];
  // 在 idx 位置插入 marker + 空行
  insertions.push({ at: idx, content: [SPLIT_MARKER, ''] });
  // 确保 marker 前有一个空行
  if (idx > 0 && lines[idx - 1].trim() !== '') {
    insertions.push({ at: idx, content: [''] }); // 在 marker 前插入空行
  }
  // 按 at 降序插入
  insertions.sort((a, b) => b.at - a.at);
  for (const ins of insertions) {
    lines.splice(ins.at, 0, ...ins.content);
  }
  return lines;
}

// ─── 切分点定位函数 ───

/** 找到第一个以 1.W / 1. W / 1.M / 1. M 开头的行号 */
function findFirstTranscript(lines, startAfter) {
  for (let i = startAfter; i < lines.length; i++) {
    const tr = lines[i].trim();
    // 录音原文起始：数字序号 + 对话人标签
    if (/^1\s*[.．]\s*[WM]\s*[.:：]/.test(tr)) return i;
    // 有时没有空格：1.W: 或 1.M:
    if (/^1\.W/.test(tr) || /^1\.M/.test(tr)) return i;
  }
  return null;
}

/** 找到 `# Section B` 标题行 */
function findSectionBHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (/^#{1,2}\s*Section\s*B\s*[-–—]?\s*Listening\s*Passages/i.test(tr)) return i;
    if (/^#{1,2}\s*Section\s*B\s*$/i.test(tr) && i + 1 < lines.length &&
        /Directions|Questions?\s+\d/i.test(lines[i + 1].trim())) return i;
  }
  return null;
}

/** 找到 `# Section C - Lectures/Talks` 标题行 */
function findSectionCFullHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (/^#{1,2}\s*Section\s*C\s*[-–—]?\s*(Lectures|Talks)/i.test(tr)) return i;
  }
  return null;
}

/** 找到 `# SectionC` 或 `# Section C`（短标题，脚本部分） */
function findSectionCScriptHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (/^#{1,2}\s*SectionC\s*$/i.test(tr)) return i;
    if (/^#{1,2}\s*Section\s*C\s*$/i.test(tr)) {
      // 验证下一行是 Directions（复合听写方向）或录音标题
      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (/Directions|录音|Recording|Passage|翻译/i.test(next)) return i;
      }
    }
  }
  return null;
}

/** 找到第 15 题最后一个选项行（D/D）行） */
function findQ15LastOption(lines) {
  let lastQ15 = -1;
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    // 15 题选项行：15.A) / 15. A) / 15．A）
    if (/^15\s*[.．]\s*[A-D]/.test(tr)) lastQ15 = i;
    // 也匹配纯选项字母行（紧跟在 15 题其他选项之后的 D) / D） 行）
    if (lastQ15 > 0 && /^[A-D]\s*[)）]\s/.test(tr)) {
      // 检查这是否还在 15 题范围内（下一个题号还没出现）
      let inQ15 = true;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/^\d{1,2}\s*[.．]\s*[A-D]/.test(lines[j].trim()) && !/^15\s/.test(lines[j].trim())) {
          inQ15 = false;
          break;
        }
        if (/^#\s*Section|Directions|Questions?\s+\d|^#/i.test(lines[j].trim())) {
          inQ15 = false;
          break;
        }
      }
      if (inQ15) lastQ15 = i;
    }
  }
  return lastQ15 > 0 ? lastQ15 : null;
}

/** 找到第 25 题最后一个选项行 */
function findQ25LastOption(lines) {
  let lastQ25 = -1;
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (/^25\s*[.．．]\s*[A-D）)]/.test(tr)) lastQ25 = i;
    if (/^25\s*[.．]\s*[A-D]/.test(tr)) lastQ25 = i;
    // 也匹配纯选项字母行
    if (lastQ25 > 0 && /^[A-D]\s*[)）]\s/.test(tr)) {
      let inQ25 = true;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/^\d{1,2}\s*[.．]\s*[A-D]/.test(lines[j].trim()) && !/^25\s/.test(lines[j].trim())) {
          inQ25 = false;
          break;
        }
        if (/^#\s*Section|Directions|^#/i.test(lines[j].trim())) {
          inQ25 = false;
          break;
        }
      }
      if (inQ25) lastQ25 = i;
    }
  }
  return lastQ25 > 0 ? lastQ25 : null;
}

/** 找到答案键行（在 Section A 题目区域内） */
function findAnswerKey(lines) {
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (/^\*{2}答案键\*{2}/.test(tr)) return i;
    if (/^[1-7]～[5-7]\s*[：:]/.test(tr)) return i; // 1～5：DABDC
    if (/^[1-7]～[5-7]\s*[：:]/.test(tr)) return i;
    // 6～10 :CAADB
    if (/^[6-9]～\d+\s*[：:]/.test(tr)) return i;
    if (/^11～15/.test(tr)) return i;
    if (/^16～20/.test(tr)) return i;
  }
  return null;
}

/** 找到 Section B 录音原文中的 Q13-15 相关问答结束后，# Section C 之前的位置 */
function findBetweenBandC(lines, secBQuest, secCHeader) {
  if (secBQuest === null || secCHeader === null) return null;
  // 从 secCHeader 往前找最近的内容行
  for (let i = secCHeader - 1; i > secBQuest; i--) {
    if (lines[i].trim() !== '') return i;
  }
  return secCHeader - 1;
}

// ─── 主切分逻辑 ───

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  if (content.length < MIN_SIZE) {
    return { fileName, skip: true, reason: 'stub', size: content.length };
  }

  let lines = stripOldSplits(content.split('\n'));

  // 标记类型 A: 标准 Section A 标题
  const secAFull = findSectionBHeader(lines); // 先找 Section B

  let splits = [];

  if (secAFull !== null) {
    // ─── 模式 A：标准结构 ───

    // 切分点 2: Section A → Section B 题目
    // 在 # Section B 标题行之前插入
    splits.push({ point: 2, line: secAFull });

    // 切分点 1: Section A 题目 → 录音原文
    // 找答案键或第一个录音行
    const ansKey = findAnswerKey(lines);
    const firstTranscript = findFirstTranscript(lines, 0);
    if (firstTranscript !== null && firstTranscript < secAFull) {
      splits.push({ point: 1, line: firstTranscript });
    } else if (ansKey !== null && ansKey < secAFull) {
      // 答案键之后找下一个非空行
      for (let i = ansKey + 1; i < secAFull; i++) {
        if (lines[i].trim() !== '') {
          splits.push({ point: 1, line: i });
          break;
        }
      }
    }

    // 切分点 3: Section B 题目 → 听力原文与问句
    // 找到 15 题最后一个选项行，之后找下一个特征行
    const q15Last = findQ15LastOption(lines);
    if (q15Last !== null && q15Last < secAFull) {
      // q15 选项在 Section A 之前——说明 Section B 题目在文件前部（文件结构特殊）
      // 不太可能，跳过
    }
    // 更通用：在 Section B 区域内找 15 题之后的切分
    // Section B 区域 = secAFull 到 secCFull 之间
    const secCFull = findSectionCFullHeader(lines);
    if (secCFull !== null && secCFull > secAFull) {
      // 在 Section B 区域内找 15 题
      let q15InB = -1;
      for (let i = secAFull; i < secCFull; i++) {
        if (/^15\s*[.．]\s*[A-D]/.test(lines[i].trim())) {
          q15InB = i;
        }
      }
      if (q15InB > 0) {
        // 找到 15 题最后一个选项行
        let lastOpt = q15InB;
        for (let i = q15InB + 1; i < secCFull; i++) {
          const tr = lines[i].trim();
          if (/^[A-D]\s*[)）]/.test(tr)) {
            lastOpt = i;
          } else if (tr !== '' && !/^[A-D]\s*[)）]/.test(tr)) {
            break;
          }
        }
        // 在 lastOpt 之后找到下一个特征行（Directions / # SectionB / 录音）
        for (let i = lastOpt + 1; i < secCFull; i++) {
          const tr = lines[i].trim();
          if (tr === '') continue;
          if (/^Directions|^#\s*Section|^#\s*Passage|^#\s*Questions?|^#\s*Now/i.test(tr)) {
            splits.push({ point: 3, line: i });
            break;
          }
          // 已经到了录音内容区域（非标题行，非空行）
          if (!/^[A-D]\s*[)）]/.test(tr) && !/^\d{1,2}\s*[.．]/.test(tr)) {
            splits.push({ point: 3, line: i });
            break;
          }
          break;
        }
      }
    }

    // 切分点 4: Section B → Section C 题目
    if (secCFull !== null) {
      splits.push({ point: 4, line: secCFull });
    }

    // 切分点 5: Section C 题目 → 复合听写
    // 找 # SectionC（短标题）或复合听写 Directions
    const secCScript = findSectionCScriptHeader(lines);
    if (secCScript !== null && secCScript > (secCFull || 0)) {
      splits.push({ point: 5, line: secCScript });
    } else {
      // 找 25 题之后的内容
      const q25Last = findQ25LastOption(lines);
      if (q25Last !== null) {
        // 找下一个特征行
        for (let i = q25Last + 1; i < lines.length; i++) {
          const tr = lines[i].trim();
          if (tr === '') continue;
          if (/^#{1,2}\s*SectionC|^#{1,2}\s*Section\s*C\s*$|Directions.*first\s*time|^#{1,2}\s*Passage|^#{1,2}\s*Recording/i.test(tr)) {
            splits.push({ point: 5, line: i });
            break;
          }
          break;
        }
      }
    }
  } else {
    // ─── 模式 B：非标准结构 ───

    // 尝试找 Section B 和 Section C 标题
    let secBShort = null, secCShort = null;
    for (let i = 0; i < lines.length; i++) {
      const tr = lines[i].trim();
      if (secBShort === null && /^#{1,2}\s*SectionB\s*$/i.test(tr)) secBShort = i;
      if (secCShort === null && /^#{1,2}\s*SectionC\s*$/i.test(tr)) secCShort = i;
    }

    // 切分点 4: Section B → Section C
    if (secBShort !== null && secCShort !== null && secCShort > secBShort) {
      splits.push({ point: 4, line: secCShort });
    }

    // 切分点 5: Section C 题目 → 复合听写
    // 找 25 题之后的特征行
    const q25Last = findQ25LastOption(lines);
    if (q25Last !== null) {
      for (let i = q25Last + 1; i < lines.length; i++) {
        const tr = lines[i].trim();
        if (tr === '') continue;
        if (/^#{1,2}\s*SectionC|^#{1,2}\s*Passage|^#{1,2}\s*Recording|Directions.*first\s*time/i.test(tr)) {
          splits.push({ point: 5, line: i });
          break;
        }
        break;
      }
    }

    // 段落间分割：找 # Passage One / # Recording One 等连续标题
    const passageHeaders = [];
    for (let i = 0; i < lines.length; i++) {
      const tr = lines[i].trim();
      if (/^#{1,2}\s*(Passage|Recording)\s*(One|Two|Three|Four|五|六)\b/i.test(tr)) {
        passageHeaders.push(i);
      }
    }
    // 在连续段落标题之间插入分割
    if (passageHeaders.length >= 2 && splits.length === 0) {
      // 不在已有的 Section 分割点处重复插入
      for (let j = 1; j < passageHeaders.length; j++) {
        const before = passageHeaders[j];
        const alreadySplit = splits.some(s => Math.abs(s.line - before) < 3);
        if (!alreadySplit) {
          splits.push({ point: 99, line: before });
        }
      }
    }
  }

  // 去重和排序：按行号降序排列，避免插入时偏移
  const uniqueSplits = [];
  const seen = new Set();
  for (const s of splits.sort((a, b) => a.line - b.line)) {
    const key = s.line;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSplits.push(s);
    }
  }

  // 从后往前插入（避免行号偏移）
  let insertCount = 0;
  for (const s of uniqueSplits.reverse()) {
    lines = insertSplitBefore(lines, s.line);
    insertCount++;
  }

  const output = lines.join('\n');
  fs.writeFileSync(filePath, output, 'utf8');

  return {
    fileName,
    skip: false,
    splitCount: insertCount,
    splits: uniqueSplits.map(s => `P${s.point}@line${s.line}`),
    size: content.length,
  };
}

// ─── 执行 ───

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log(`扫描到 ${files.length} 个文件\n`);

let total = 0, processed = 0, skipped = 0, warnings = 0;
const results = [];

for (const file of files) {
  total++;
  const result = processFile(path.join(DIR, file));
  results.push(result);
  if (result.skip) {
    skipped++;
    console.log(`  SKIP  ${result.fileName} (${result.size}B, ${result.reason})`);
  } else {
    processed++;
    if (result.splitCount === 0) {
      warnings++;
      console.log(`  WARN  ${result.fileName} — 0 个切分点`);
    } else {
      console.log(`  OK    ${result.fileName} — ${result.splitCount} 个切分点 [${result.splits.join(', ')}]`);
    }
  }
}

console.log(`\n════════════════════════════════`);
console.log(`总计: ${total} | 处理: ${processed} | 跳过: ${skipped} | 警告(0切分): ${warnings}`);
console.log(`════════════════════════════════`);
