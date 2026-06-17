#!/usr/bin/env node
/**
 * 03_Exam_Final → 04_Fusion_Area 原子化拆解脚本
 *
 * 用法: node scripts/decompose-fusion.js [--force]
 *
 * 扫描 03_Exam_Final/ 下所有文件，按 Part 标题拆解为独立文件。
 * 幂等性：指纹一致则跳过。--force 强制重新写入。
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.DATA_ROOT || path.join(PROJECT_ROOT, 'data');
const FINAL_ROOT = path.join(DATA_ROOT, '03_Exam_Final');
const FUSION_ROOT = path.join(DATA_ROOT, '04_Fusion_Area');
const FINGERPRINT_FILE = path.join(DATA_ROOT, 'fingerprint.json');
const FINGERPRINT_TMP = path.join(DATA_ROOT, 'fingerprint.tmp.json');

const FORCE = process.argv.includes('--force');

// ===== 指纹工具 =====

function computeFileHash(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

function toRelativeKey(absPath) {
  return path.relative(DATA_ROOT, absPath).replace(/\\/g, '/');
}

function loadFingerprint() {
  try {
    return JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveFingerprint(fp) {
  fs.writeFileSync(FINGERPRINT_TMP, JSON.stringify(fp, null, 2), 'utf-8');
  fs.renameSync(FINGERPRINT_TMP, FINGERPRINT_FILE);
}

// ===== Part 解析 =====

const ROMAN_MAP = {
  'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
  'I\u2161': '2', 'I\u2162': '3', 'I\u2163': '4', 'I\u2164': '5',
};

function extractPartNumber(headingLine) {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();

  // 罗马数字
  const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V|I?V?|I\u2161|I\u2162|I\u2163|I\u2164)\b/i);
  if (romanMatch) {
    const roman = romanMatch[1].toUpperCase();
    // 归一化 Unicode 罗马数字
    const normalized = roman.replace(/\u2161/g, 'II').replace(/\u2162/g, 'III').replace(/\u2163/g, 'IV').replace(/\u2164/g, 'V');
    if (ROMAN_MAP[normalized]) return parseInt(ROMAN_MAP[normalized], 10);
    for (const [key, val] of Object.entries(ROMAN_MAP)) {
      if (key.toUpperCase() === roman) return parseInt(val, 10);
    }
  }

  // 阿拉伯数字
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) {
    const num = parseInt(arabicMatch[1], 10);
    if (num >= 1 && num <= 5) return num;
  }

  return null;
}

const PART_MAP = {
  '1': { index: 1, name: 'Writing' },
  '2': { index: 2, name: 'Listening' },
  '3': { index: 3, name: 'Reading' },
  '4': { index: 4, name: 'Translation' },
  '5': { index: 5, name: 'Translation' },
};

function getPartFileName(partIndex) {
  const info = PART_MAP[String(partIndex)];
  if (!info) return `Part${partIndex}_Unknown.md`;
  return `Part${info.index}_${info.name}.md`;
}

function extractSetIdFromPath(filePath) {
  const match = filePath.match(/03_Exam_Final\/(CET\d|TEM\d)\/(Question|Analysis)\//);
  if (!match) return null;
  const exam = match[1].toUpperCase();
  const filename = path.basename(filePath, '.md');

  const stdMatch = filename.match(/^(\d{4}_\d{2}_S\d+)_/);
  if (stdMatch) return exam + '_' + stdMatch[1];

  const yearMatch = filename.match(/(20\d{2})[._-](\d{2})/);
  const setMatch = filename.match(/[Ss]et[_]?(\d+)/);
  if (yearMatch) {
    return exam + '_' + yearMatch[1] + '_' + yearMatch[2] + '_S' + (setMatch ? setMatch[1] : '1');
  }

  return null;
}

// ===== 拆解函数 =====

function decomposeAndWrite(sourceRelativePath, fp) {
  const absSource = path.join(FINAL_ROOT, sourceRelativePath.replace(/^03_Exam_Final\//, ''));
  if (!fs.existsSync(absSource)) return { error: '文件不存在' };

  const raw = fs.readFileSync(absSource, 'utf-8');
  const { data: fm, content } = matter(raw);

  const setId = extractSetIdFromPath(sourceRelativePath);
  if (!setId) return { error: '无法提取 setId' };

  const examType = setId.split('_')[0];
  const fileType = fm.type || (sourceRelativePath.includes('Question') ? 'Question' : 'Analysis');

  const allLines = content.split('\n');
  const partHeaders = [];

  for (let i = 0; i < allLines.length; i++) {
    if (/^#{1,4}\s.*Part\s*/i.test(allLines[i])) {
      const partNum = extractPartNumber(allLines[i]);
      if (partNum !== null && !partHeaders.find(h => h.partIndex === partNum)) {
        partHeaders.push({ partIndex: partNum, lineIndex: i });
      }
    }
  }
  partHeaders.sort((a, b) => a.lineIndex - b.lineIndex);

  const blocks = [];
  if (partHeaders.length === 0) {
    blocks.push({ partIndex: 0, content: allLines.join('\n') });
  } else {
    for (let i = 0; i < partHeaders.length; i++) {
      const start = partHeaders[i].lineIndex;
      const end = i + 1 < partHeaders.length ? partHeaders[i + 1].lineIndex : allLines.length;
      blocks.push({ partIndex: partHeaders[i].partIndex, content: allLines.slice(start, end).join('\n') });
    }
  }

  let written = 0;
  let skipped = 0;

  for (const block of blocks) {
    const partFileName = getPartFileName(block.partIndex);
    const relativeTarget = examType + '/' + fileType + '/' + setId + '/' + partFileName;
    const absTarget = path.join(FUSION_ROOT, relativeTarget);
    const targetKey = '04_Fusion_Area/' + relativeTarget;

    const newFm = {
      exam: examType,
      setId,
      type: fileType,
      sourceFile: sourceRelativePath,
      chunkId: setId + '_P' + block.partIndex + '_' + (fileType === 'Question' ? 'Q' : 'A'),
      partIndex: block.partIndex,
      partName: PART_MAP[String(block.partIndex)]?.name || 'Unknown',
    };

    const finalContent = matter.stringify(block.content, newFm);
    const finalHash = computeFileHash(finalContent);

    if (!FORCE && fp[targetKey] === finalHash) {
      skipped++;
      continue;
    }

    fs.mkdirSync(path.dirname(absTarget), { recursive: true });
    fs.writeFileSync(absTarget, finalContent, 'utf-8');
    fp[targetKey] = finalHash;
    written++;
  }

  return { written, skipped, setId, blocks: blocks.length };
}

// ===== 主流程 =====

console.log('=== 03→04 原子化拆解 ===');
if (FORCE) console.log('（强制模式：忽略指纹检查）');
console.log('');

if (!fs.existsSync(FINAL_ROOT)) {
  console.error('错误: 03_Exam_Final/ 不存在');
  process.exit(1);
}

const fp = loadFingerprint();

// 扫描所有文件
let totalFiles = 0;
let totalWritten = 0;
let totalSkipped = 0;
let totalBlocks = 0;
let totalErrors = 0;
const errors = [];

for (const level of ['CET4', 'CET6']) {
  const levelDir = path.join(FINAL_ROOT, level);
  if (!fs.existsSync(levelDir)) continue;

  for (const type of ['Question', 'Analysis']) {
    const typeDir = path.join(levelDir, type);
    if (!fs.existsSync(typeDir)) continue;

    const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const relativePath = level + '/' + type + '/' + file;
      totalFiles++;

      try {
        const result = decomposeAndWrite('03_Exam_Final/' + relativePath, fp);
        if (result.error) {
          errors.push({ file: relativePath, error: result.error });
          totalErrors++;
        } else {
          totalWritten += result.written;
          totalSkipped += result.skipped;
          totalBlocks += result.blocks;
          if (result.written > 0) {
            console.log('  [拆解]', level + '/' + type + '/' + file, '->', result.blocks, '个 Part,', result.written, '写入');
          }
        }
      } catch (err) {
        errors.push({ file: relativePath, error: err.message });
        totalErrors++;
        console.log('  [错误]', file, '-', err.message);
      }
    }
  }
}

// 原子保存指纹表
saveFingerprint(fp);

// 创建目录结构预览
console.log('\n=== 目录结构 ===');
if (fs.existsSync(FUSION_ROOT)) {
  for (const level of fs.readdirSync(FUSION_ROOT)) {
    const lp = path.join(FUSION_ROOT, level);
    if (!fs.statSync(lp).isDirectory()) continue;
    for (const type of fs.readdirSync(lp)) {
      const tp = path.join(lp, type);
      if (!fs.statSync(tp).isDirectory()) continue;
      const setCount = fs.readdirSync(tp).filter(d => fs.statSync(path.join(tp, d)).isDirectory()).length;
      console.log('  ' + level + '/' + type + '/ : ' + setCount + ' 个套卷');
    }
  }
}

console.log('\n=== 完成 ===');
console.log('源文件:', totalFiles);
console.log('总块数:', totalBlocks);
console.log('写入:', totalWritten);
console.log('指纹跳过:', totalSkipped);
console.log('错误:', totalErrors);

if (errors.length > 0) {
  console.log('\n=== 错误详情 ===');
  for (const e of errors) {
    console.log('  ' + e.file + ': ' + e.error);
  }
}
