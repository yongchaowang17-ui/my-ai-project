#!/usr/bin/env node
/**
 * Scanner CLI 脚本
 *
 * 用法: node scripts/scanner.js
 *
 * 扫描 data/routing/mixed/ 下所有 .md 文件
 * 输出 data/tasks/{filename}.json 任务清单
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const MIXED_DIR = path.join(DATA_ROOT, 'routing', 'mixed');
const TASKS_DIR = path.join(DATA_ROOT, 'tasks');

// ===== 复用 scanner.ts 的核心逻辑（纯 JS 版本）=====

const QA_BOUNDARY_PATTERN = /^#\s+.*(?:答案|解析|参考|Answer|Key|Explanation)/i;
const SECTION_PATTERN = /^#{1,4}\s+(?:Part\s+|Section\s+)/i;

function inferExamType(filename) {
  const base = filename.replace(/\.md$/i, '');
  if (/^CET4/i.test(base)) return 'cet4';
  if (/^CET6/i.test(base)) return 'cet6';
  if (/考研/i.test(base)) return 'kaoyan-english';
  return 'unknown';
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const filename = path.basename(filePath);
  const sourcePath = 'routing/mixed/' + filename;
  const examType = inferExamType(filename);
  const id = filename.replace(/\.md$/i, '');

  // 找标题锚点
  const anchorLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s+/.test(lines[i])) {
      anchorLines.push(i + 1);
    }
  }

  // 找 Q/A 分界线
  let boundaryLine = -1;
  for (const lineNum of anchorLines) {
    if (QA_BOUNDARY_PATTERN.test(lines[lineNum - 1])) {
      boundaryLine = lineNum;
      break;
    }
  }

  const blocks = [];

  if (boundaryLine > 0) {
    // 按 Part/Section 细分 Question 区域
    const qBlocks = splitBySections(lines, 1, boundaryLine - 1, 'Question');
    blocks.push(...qBlocks);

    // 按 Part/Section 细分 Analysis 区域
    const aBlocks = splitBySections(lines, boundaryLine, lines.length, 'Analysis');
    blocks.push(...aBlocks);
  } else {
    blocks.push({
      id: 'scan_' + Math.random().toString(36).substring(2, 9),
      type: 'Question',
      lineRange: [1, lines.length],
      title: (lines[0] || '').substring(0, 100),
      content: content.trim(),
      confidence: 0,
    });
  }

  const hasBoundary = boundaryLine > 0;
  const allHighConfidence = blocks.every(b => b.confidence > 0);

  return {
    id,
    sourcePath,
    examType,
    proposedBlocks: blocks,
    scanMethod: 'regex',
    status: hasBoundary && allHighConfidence ? 'pending' : 'flagged',
    createdAt: new Date().toISOString(),
  };
}

function splitBySections(allLines, startLine, endLine, defaultType) {
  const blocks = [];
  const sectionStarts = [startLine];

  for (let i = startLine; i <= endLine; i++) {
    if (SECTION_PATTERN.test(allLines[i - 1])) {
      sectionStarts.push(i);
    }
  }

  for (let j = 0; j < sectionStarts.length; j++) {
    const s = sectionStarts[j];
    const e = j + 1 < sectionStarts.length ? sectionStarts[j + 1] - 1 : endLine;
    const blockLines = allLines.slice(s - 1, e);
    const content = blockLines.join('\n').trim();
    if (!content) continue;

    blocks.push({
      id: 'scan_' + Math.random().toString(36).substring(2, 9),
      type: defaultType,
      lineRange: [s, e],
      title: (allLines[s - 1] || '').substring(0, 100),
      content,
      confidence: 1.0,
    });
  }

  return blocks;
}

// ===== 主逻辑 =====

console.log('=== Scanner CLI ===');
console.log('扫描目录:', MIXED_DIR);

if (!fs.existsSync(MIXED_DIR)) {
  console.error('错误: 目录不存在', MIXED_DIR);
  process.exit(1);
}

const files = fs.readdirSync(MIXED_DIR).filter(f => f.endsWith('.md'));
console.log('找到', files.length, '个 .md 文件\n');

fs.mkdirSync(TASKS_DIR, { recursive: true });

let total = 0;
let regexOk = 0;
let flagged = 0;

for (const file of files) {
  const filePath = path.join(MIXED_DIR, file);
  try {
    const task = scanFile(filePath);
    const taskPath = path.join(TASKS_DIR, task.id + '.json');
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');

    total++;
    if (task.status === 'pending') {
      regexOk++;
      console.log('  ✅', file, '—', task.proposedBlocks.length, '个块');
    } else {
      flagged++;
      console.log('  ⚠️', file, '— 需人工审查');
    }
  } catch (err) {
    console.error('  ❌', file, '—', err.message);
  }
}

console.log('\n=== 扫描完成 ===');
console.log('总计:', total, '个文件');
console.log('正则成功:', regexOk);
console.log('需审查:', flagged);
console.log('任务目录:', TASKS_DIR);
