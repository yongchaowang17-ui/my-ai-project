#!/usr/bin/env node
/**
 * 04_Fusion_Area → 05_Synthesis_Area 合成脚本
 *
 * 用法: node scripts/synthesize-05.js [--force]
 *
 * 交叉策略：
 * - Writing/Translation: 整块拼接 Q + A
 * - Listening: 按题目编号范围切分 Q1-7 / Q8-15 / Q16-25，逐段 Q→A 交叉
 * - Reading: 按 Section/Passage 标题切分，逐段 Q→A 交叉
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_ROOT = path.resolve(__dirname, '..', 'data');
const FUSION_ROOT = path.join(DATA_ROOT, '04_Fusion_Area');
const PREVIEW_FILE = path.join(DATA_ROOT, 'synthesis-preview.json');
const FINGERPRINT_FILE = path.join(DATA_ROOT, 'fingerprint.json');
const FORCE = process.argv.includes('--force');

function computeHash(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

function loadFingerprint() {
  try { return JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf-8')); } catch { return {}; }
}

// ===== 答案键提取（A 文件开头） =====

function extractAnswerKey(content) {
  const lines = content.split('\n');
  const keyLines = [];
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    if (/^\s*\d+\s*[～~\-]\s*\d+\s*[:：]/.test(lines[i])) {
      keyLines.push(lines[i].trim());
    }
  }
  return keyLines.length > 0 ? [...new Set(keyLines)].join('\n') : null;
}

// ===== 按题目编号范围切分（听力专用） =====

function getListeningRanges(examLevel) {
  if (examLevel === 'CET6') {
    return [
      { key: 'SectionA', start: 1, end: 7, label: 'Section A - Long Conversations (Q1-7)' },
      { key: 'SectionB', start: 8, end: 15, label: 'Section B - Listening Passages (Q8-15)' },
      { key: 'SectionC', start: 16, end: 25, label: 'Section C - Lectures/Talks (Q16-25)' },
    ];
  }
  // CET4
  return [
    { key: 'SectionA', start: 1, end: 7, label: 'Section A - Short News (Q1-7)' },
    { key: 'SectionB', start: 8, end: 15, label: 'Section B - Long Conversations (Q8-15)' },
    { key: 'SectionC', start: 16, end: 25, label: 'Section C - Listening Passages (Q16-25)' },
  ];
}

/** 将内容按题号范围切分为 Map<key, content> */
function splitByQuestionNumbers(content, ranges) {
  const lines = content.split('\n');

  // 扫描所有题号出现位置
  const qPositions = []; // { lineIndex, qNum, rangeKey }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(\d{1,2})\s*[.、．\s]/);
    if (m) {
      const qNum = parseInt(m[1], 10);
      const range = ranges.find(r => qNum >= r.start && qNum <= r.end);
      if (range) {
        qPositions.push({ lineIndex: i, qNum, rangeKey: range.key });
      }
    }
  }

  if (qPositions.length === 0) {
    // 未检测到题号，退化为整体
    const result = new Map();
    result.set('_full', content);
    return result;
  }

  // 按 rangeKey 分组，取每个范围的起止行
  const rangeBounds = new Map();
  for (const r of ranges) {
    const positions = qPositions.filter(p => p.rangeKey === r.key);
    if (positions.length > 0) {
      rangeBounds.set(r.key, {
        startLine: positions[0].lineIndex,
        // endLine 由下一个范围的第一个题号决定
      });
    }
  }

  // 确定每个范围的结束行
  const sortedRanges = ranges.filter(r => rangeBounds.has(r.key));
  for (let i = 0; i < sortedRanges.length; i++) {
    const current = rangeBounds.get(sortedRanges[i].key);
    if (i + 1 < sortedRanges.length) {
      const next = rangeBounds.get(sortedRanges[i + 1].key);
      current.endLine = next.startLine;
    } else {
      current.endLine = lines.length;
    }
  }

  // 提取每个范围的内容
  const result = new Map();
  for (const r of sortedRanges) {
    const bounds = rangeBounds.get(r.key);
    const sectionLines = lines.slice(bounds.startLine, bounds.endLine);
    result.set(r.key, sectionLines.join('\n'));
  }

  return result;
}

// ===== 标题规范化（Reading 用） =====

function normalizeHeading(line) {
  const stripped = line.replace(/^#{1,3}\s+/, '').trim();
  if (/^Section\s*A/i.test(stripped)) return 'SectionA';
  if (/^Section\s*B/i.test(stripped)) return 'SectionB';
  if (/^Section\s*C/i.test(stripped)) return 'SectionC';
  if (/^Passage\s*One/i.test(stripped) || /^PassageOne/i.test(stripped)) return 'PassageOne';
  if (/^Passage\s*Two/i.test(stripped) || /^PassageTwo/i.test(stripped)) return 'PassageTwo';
  if (/^Part\s*(I{1,3}|IV|V)\b/i.test(stripped)) return 'PartHeader';
  if (/^Questions?\s*\d/i.test(stripped)) return 'SubHeading';
  if (/^#/.test(line)) return 'OtherHeading';
  return null;
}

/** 按 Section 标题切分（Reading 用） */
function splitByMainSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentKey = '_header';
  let currentLines = [];

  for (const line of lines) {
    const key = normalizeHeading(line);
    if (key && ['SectionA', 'SectionB', 'SectionC', 'PassageOne', 'PassageTwo'].includes(key)) {
      if (currentLines.length > 0) {
        sections.push({ key: currentKey, content: currentLines.join('\n') });
      }
      currentKey = key;
      currentLines = [line];
    } else if (key && key === 'PartHeader') {
      if (currentLines.length > 0) {
        sections.push({ key: currentKey, content: currentLines.join('\n') });
      }
      currentKey = '_header';
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ key: currentKey, content: currentLines.join('\n') });
  }
  return sections;
}

// ===== 交叉合成 =====

/** 规范化题目间距：确保题号开头的行前有双换行，选项之间保持单换行 */
function normalizeQuestionSpacing(content) {
  const lines = content.split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isQuestionStart = /^\s*\d{1,2}\s*[.、．]/.test(line);
    const isSectionHeader = /^#{1,3}\s/.test(line);
    const isOption = /^[A-D][)）]/.test(line.trim());
    const isEmpty = line.trim() === '';

    // 去掉选项之间的空行（让同一道题的选项紧凑）
    if (isEmpty && result.length > 0 && i + 1 < lines.length) {
      const prevLine = result[result.length - 1];
      const nextLine = lines[i + 1];
      const prevIsOption = /^[A-D][)）]/.test(prevLine.trim());
      const prevIsQuestion = /^\s*\d{1,2}\s*[.、．]/.test(prevLine);
      const nextIsOption = /^[A-D][)）]/.test(nextLine.trim());
      const nextIsQuestion = /^\s*\d{1,2}\s*[.、．]/.test(nextLine);
      if ((prevIsOption || prevIsQuestion) && (nextIsOption || nextIsQuestion)) {
        continue; // 跳过选项间的空行
      }
    }

    if (isQuestionStart || isSectionHeader) {
      while (result.length > 0 && result[result.length - 1] === '') {
        result.pop();
      }
      result.push('');
      result.push('');
    }

    result.push(line);
  }
  return result.join('\n');
}

function simpleConcat(qContent, aContent) {
  return qContent.trimEnd() + '\n\n---\n\n## 答案与解析\n\n' + aContent.trimEnd();
}

/** 听力：按题目编号范围切分后交叉 */
function crossListeningByQuestionNumbers(qContent, aContent, examLevel) {
  const ranges = getListeningRanges(examLevel);
  const qSegs = splitByQuestionNumbers(qContent, ranges);
  const aSegs = splitByQuestionNumbers(aContent, ranges);
  const answerKey = extractAnswerKey(aContent);

  // 退化检查
  if (qSegs.size === 0 && aSegs.size === 0) {
    return simpleConcat(qContent, aContent);
  }

  let result = '';
  for (const range of ranges) {
    const qSeg = qSegs.get(range.key);
    const aSeg = aSegs.get(range.key);

    if (qSeg) {
      result += '# ' + range.label + '\n\n' + qSeg.trimEnd() + '\n\n';
    }
    if (aSeg) {
      let aContent = aSeg.trimEnd();
      // Section A 开头插入答案键
      if (range.key === 'SectionA' && answerKey) {
        aContent = '**答案键**\n\n' + answerKey + '\n\n' + aContent;
      }
      result += '---\n\n' + aContent + '\n\n';
    }
  }

  return normalizeQuestionSpacing(result.trimEnd()) || simpleConcat(qContent, aContent);
}

/** Reading：按 Section 标题切分后交叉 */
function crossReadingBySections(qContent, aContent) {
  const qSegs = splitByMainSections(qContent);
  const aSegs = splitByMainSections(aContent);

  const qMap = new Map();
  const aMap = new Map();
  for (const s of qSegs) {
    if (s.key !== '_header') qMap.set(s.key, s.content);
  }
  for (const s of aSegs) {
    if (s.key !== '_header') aMap.set(s.key, s.content);
  }

  if (qMap.size === 0 && aMap.size === 0) {
    return simpleConcat(qContent, aContent);
  }

  const sectionOrder = ['SectionA', 'SectionB', 'SectionC', 'PassageOne', 'PassageTwo'];
  const allKeys = new Set([...qMap.keys(), ...aMap.keys()]);
  const orderedKeys = sectionOrder.filter(k => allKeys.has(k));
  for (const k of allKeys) {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  }

  if (orderedKeys.length === 0) {
    return simpleConcat(qContent, aContent);
  }

  let result = '';
  for (const key of orderedKeys) {
    const qSeg = qMap.get(key);
    const aSeg = aMap.get(key);
    if (qSeg) result += qSeg.trimEnd() + '\n\n';
    if (aSeg) result += '---\n\n' + aSeg.trimEnd() + '\n\n';
  }

  return normalizeQuestionSpacing(result.trimEnd()) || simpleConcat(qContent, aContent);
}

// ===== 主逻辑 =====

const PART_NAMES = ['Writing', 'Listening', 'Reading', 'Translation'];

function main() {
  console.log('=== 04→05 合成预览 (题目编号精确配对版) ===\n');

  const fp = loadFingerprint();
  const previews = [];

  for (const examLevel of ['CET4', 'CET6']) {
    for (const partName of PART_NAMES) {
      const examDir = path.join(FUSION_ROOT, examLevel);
      if (!fs.existsSync(examDir)) continue;

      const setDirs = fs.readdirSync(examDir).filter(d =>
        d.startsWith(examLevel + '_') && fs.statSync(path.join(examDir, d)).isDirectory()
      );

      for (const setId of setDirs) {
        const qPattern = `${setId}_Q_01_${partName}.md`;
        const aPattern = `${setId}_A_01_${partName}.md`;
        const qDir = path.join(examDir, setId, 'Question');
        const aDir = path.join(examDir, setId, 'Analysis');

        const qFile = fs.existsSync(qDir) ? fs.readdirSync(qDir).find(f => f === qPattern) : null;
        const aFile = fs.existsSync(aDir) ? fs.readdirSync(aDir).find(f => f === aPattern) : null;

        if (!qFile && !aFile) continue;

        const qContent = qFile ? fs.readFileSync(path.join(qDir, qFile), 'utf-8') : '';
        const aContent = aFile ? fs.readFileSync(path.join(aDir, aFile), 'utf-8') : '';

        let synthesized;
        if (qContent && aContent) {
          if (partName === 'Writing' || partName === 'Translation') {
            synthesized = simpleConcat(qContent, aContent);
          } else if (partName === 'Listening') {
            synthesized = crossListeningByQuestionNumbers(qContent, aContent, examLevel);
          } else {
            synthesized = crossReadingBySections(qContent, aContent);
          }
        } else if (qContent) {
          synthesized = qContent.trimEnd();
        } else {
          synthesized = aContent.trimEnd();
        }

        const synHash = computeHash(synthesized);
        const outputFilename = `${setId}_${partName}.md`;
        const outputKey = `05_Synthesis_Area/${examLevel}/${partName}/${outputFilename}`;
        const exists05 = fs.existsSync(path.join(DATA_ROOT, outputKey));

        let status = 'pending';
        if (exists05 && !FORCE) {
          if ((fp[outputKey] || '') === synHash) status = 'exists';
        }
        if (!qFile || !aFile) status = 'flagged';

        previews.push({
          id: `${setId}_${partName}`,
          setId, examType: examLevel, partName,
          outputFilename, outputKey,
          sourceQ: qFile ? `04_Fusion_Area/${examLevel}/${setId}/Question/${qFile}` : null,
          sourceA: aFile ? `04_Fusion_Area/${examLevel}/${setId}/Analysis/${aFile}` : null,
          qChars: qContent.length, aChars: aContent.length,
          synthesizedChars: synthesized.length,
          synthesizedHash: synHash,
          status, content: synthesized,
        });
      }
    }
  }

  previews.sort((a, b) => a.setId.localeCompare(b.setId) || a.partName.localeCompare(b.partName));
  fs.writeFileSync(PREVIEW_FILE, JSON.stringify(previews, null, 2), 'utf-8');

  const byExam = { CET4: 0, CET6: 0 };
  const byPart = {};
  previews.forEach(p => { byExam[p.examType]++; byPart[p.partName] = (byPart[p.partName] || 0) + 1; });

  console.log(`总配对数: ${previews.length}`);
  console.log(`  CET4: ${byExam.CET4}, CET6: ${byExam.CET6}`);
  Object.entries(byPart).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`待审查: ${previews.filter(p => p.status === 'pending').length}`);
  console.log(`已存在: ${previews.filter(p => p.status === 'exists').length}`);
  console.log(`有标记: ${previews.filter(p => p.status === 'flagged').length}`);
  console.log(`\n预览文件: ${PREVIEW_FILE}`);
}

main();
