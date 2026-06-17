/**
 * Scanner 核心逻辑
 *
 * 正则优先的文件扫描器，将 routing/mixed/ 下的 MD 文件
 * 按标题锚点拆分为 Question 和 Analysis 两大块。
 *
 * 策略：
 * 1. 用 ^#{1,4}\s+ 锚点按标题行分割
 * 2. 找到 Q/A 分界线（标题含答案/解析关键字的一级标题）
 * 3. 分界线之前 → Question，之后 → Analysis
 * 4. 每个大块内部按 Part/Section 细分为子块
 */

import type { SplitTask, ProposedBlock } from './types';
import fs from 'fs';
import path from 'path';

// ===== 常量 =====

const QA_BOUNDARY_PATTERN = /^#\s+.*(?:答案|解析|参考|Answer|Key|Explanation)/i;
const SECTION_PATTERN = /^#{1,4}\s+(?:Part\s+|Section\s+)/i;
const ANCHOR_PATTERN = /^(?=#{1,4}\s+)/m;

// ===== 文件名推断 =====

/** 从文件名推断考试类型 */
export function inferExamType(filename: string): string {
  const base = filename.replace(/\.md$/i, '');
  if (/^CET4/i.test(base)) return 'cet4';
  if (/^CET6/i.test(base)) return 'cet6';
  if (/考研/i.test(base)) return 'kaoyan-english';
  if (/^TEM4/i.test(base)) return 'tem4';
  if (/^TEM8/i.test(base)) return 'tem8';
  return 'unknown';
}

// ===== 核心扫描函数 =====

/**
 * 扫描单个文件，返回 SplitTask
 * 纯正则实现，不调用 LLM
 */
export function scanFile(filePath: string, fileContent?: string): SplitTask {
  const content = fileContent || fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const filename = path.basename(filePath);
  const relativePath = filePath.replace(/\\/g, '/');

  // 匹配 data/ 前缀之后的相对路径
  const dataIdx = relativePath.indexOf('data/');
  const sourcePath = dataIdx >= 0 ? relativePath.substring(dataIdx + 5) : relativePath;

  const examType = inferExamType(filename);
  const id = filename.replace(/\.md$/i, '');

  // 步骤 1：找到所有标题锚点行号（1-based）
  const anchorLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s+/.test(lines[i])) {
      anchorLines.push(i + 1); // 转为 1-based
    }
  }

  // 步骤 2：找到 Q/A 分界线
  let boundaryLine = -1;
  for (const lineNum of anchorLines) {
    const lineContent = lines[lineNum - 1]; // 转回 0-based 索引
    if (QA_BOUNDARY_PATTERN.test(lineContent)) {
      boundaryLine = lineNum;
      break;
    }
  }

  // 步骤 3：构建 ProposedBlocks
  const blocks: ProposedBlock[] = [];

  if (boundaryLine > 0) {
    // 有明确分界线 — 高置信度
    // Question 块：行 1 到 boundaryLine-1
    const qContent = lines.slice(0, boundaryLine - 1).join('\n').trim();
    if (qContent) {
      // 在 Question 区域内找子块
      const qBlocks = splitBySections(lines, 1, boundaryLine - 1, 'Question');
      blocks.push(...qBlocks);
    }

    // Analysis 块：行 boundaryLine 到末尾
    const aContent = lines.slice(boundaryLine - 1).join('\n').trim();
    if (aContent) {
      const aBlocks = splitBySections(lines, boundaryLine, lines.length, 'Analysis');
      blocks.push(...aBlocks);
    }
  } else {
    // 没有找到分界线 — 整个文件作为一个块，标记为低置信度
    blocks.push({
      id: 'scan_' + Math.random().toString(36).substring(2, 9),
      type: 'Question',
      lineRange: [1, lines.length],
      title: lines[0] || '(empty)',
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

/**
 * 在指定行范围内按 Part/Section 标题细分子块
 */
function splitBySections(
  allLines: string[],
  startLine: number,   // 1-based inclusive
  endLine: number,     // 1-based inclusive
  defaultType: string
): ProposedBlock[] {
  const blocks: ProposedBlock[] = [];
  const sectionStarts: number[] = [startLine];

  // 找范围内的 Part/Section 锚点
  for (let i = startLine; i <= endLine; i++) {
    const lineContent = allLines[i - 1]; // 转 0-based
    if (SECTION_PATTERN.test(lineContent)) {
      sectionStarts.push(i);
    }
  }

  // 生成子块
  for (let j = 0; j < sectionStarts.length; j++) {
    const s = sectionStarts[j];
    const e = j + 1 < sectionStarts.length ? sectionStarts[j + 1] - 1 : endLine;
    const blockLines = allLines.slice(s - 1, e); // slice 是 0-based, 含头不含尾
    const content = blockLines.join('\n').trim();
    if (!content) continue;

    // 第一行作为标题
    const title = allLines[s - 1] || '';

    blocks.push({
      id: 'block-' + Math.random().toString(36).substring(2, 9),
      type: defaultType,
      lineRange: [s, e],
      title: title.substring(0, 100),
      content,
      confidence: 1.0,
    });
  }

  return blocks;
}

// ===== CLI 入口 =====

/** 扫描目录下所有 MD 文件 */
export function scanDirectory(dirPath: string): SplitTask[] {
  const tasks: SplitTask[] = [];
  if (!fs.existsSync(dirPath)) return tasks;

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      tasks.push(scanFile(filePath));
    } catch (err) {
      console.error('Failed to scan:', file, err);
    }
  }

  return tasks;
}

/** 保存任务到 data/tasks/ 目录 */
export function saveTask(task: SplitTask, tasksDir: string): void {
  fs.mkdirSync(tasksDir, { recursive: true });
  const filename = task.id + '.json';
  fs.writeFileSync(path.join(tasksDir, filename), JSON.stringify(task, null, 2), 'utf-8');
}

/** 加载所有已保存的任务 */
export function loadAllTasks(tasksDir: string): SplitTask[] {
  if (!fs.existsSync(tasksDir)) return [];
  const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(tasksDir, f), 'utf-8')) as SplitTask;
    } catch {
      return null;
    }
  }).filter((t): t is SplitTask => t !== null);
}
