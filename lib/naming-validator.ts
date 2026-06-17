/**
 * 命名校验器
 *
 * 强制文件命名规范：{year}_{month}_{set}_{Q|A}_{sequence}.md
 * 示例：2024_06_S1_Q_01-10.md, 2024_12_S2_A_05.md
 */

import type { NamingValidation, PairedFileInfo } from './types';
import path from 'path';

// ===== 正则模式 =====

// 文件名匹配：year_month_set_side_sequence.md
// year: 4位数字, month: 01-12, set: S+1-2位数字, side: Q/A, sequence: 数字或范围
const FILENAME_PATTERN = /^(\d{4})_(\d{2})_(S\d+)_([QA])_(\d{1,3}(?:-\d{1,3})?)\.md$/;

// 从路径中提取套卷ID（格式：xxx/CET4_2024_06_S1/Question/...）
const SET_ID_PATTERN = /([A-Z]+\d+_\d{4}_\d{2}_S\d+)\//;

// ===== 核心函数 =====

/** 校验文件名并解析各字段 */
export function validateFileName(filename: string): NamingValidation {
  const match = filename.match(FILENAME_PATTERN);
  if (!match) {
    return {
      valid: false,
      error: '文件名必须符合 {year}_{month}_{set}_{Q|A}_{sequence}.md 格式，例如 2024_06_S1_Q_01-10.md',
    };
  }

  const [, year, month, set, side, sequence] = match;

  // 校验 month 范围
  const monthNum = parseInt(month, 10);
  if (monthNum < 1 || monthNum > 12) {
    return { valid: false, error: '月份必须在 01-12 之间，当前: ' + month };
  }

  // 校验 sequence 范围
  if (sequence.includes('-')) {
    const [start, end] = sequence.split('-').map(Number);
    if (start > end || start < 1 || end > 999) {
      return { valid: false, error: '序号范围无效: ' + sequence };
    }
  }

  return {
    valid: true,
    parsed: { year, month, set, side: side as 'Q' | 'A', sequence },
  };
}

/** 将 Q 文件名转为对应 A 文件名，反之亦然 */
export function buildPairedFileName(filename: string): string | null {
  const validation = validateFileName(filename);
  if (!validation.valid || !validation.parsed) return null;

  const { year, month, set, side, sequence } = validation.parsed;
  const newSide = side === 'Q' ? 'A' : 'Q';
  return year + '_' + month + '_' + set + '_' + newSide + '_' + sequence + '.md';
}

/** 从文件路径中提取套卷ID */
export function buildSetIdFromPath(filePath: string): string | null {
  const match = filePath.match(SET_ID_PATTERN);
  return match ? match[1] : null;
}

/** 提取配对键（去掉 Q/A 标记后的前缀） */
export function extractPairKey(filename: string): string | null {
  const validation = validateFileName(filename);
  if (!validation.valid || !validation.parsed) return null;

  const { year, month, set, sequence } = validation.parsed;
  return year + '_' + month + '_' + set + '_' + sequence;
}

/** 根据当前文件路径推断配对文件信息 */
export function findPairedFileInfo(
  currentFilePath: string,
  fileExists: (p: string) => boolean
): PairedFileInfo {
  const filename = path.basename(currentFilePath);
  const pairedFilename = buildPairedFileName(filename);

  if (!pairedFilename) {
    return { currentFile: filename, pairedFile: null, pairedPath: null, exists: false };
  }

  // 替换路径中的文件名
  const pairedPath = currentFilePath.replace(filename, pairedFilename);
  const exists = fileExists(pairedPath);

  return { currentFile: filename, pairedFile: pairedFilename, pairedPath, exists };
}

// ===== Pipeline 工具函数 =====

/**
 * 从 routing 目录下的文件名推断 SetId
 * 示例：CET4_2015.06_Set1_纯真题.md -> CET4_2015_06_S1
 */
export function inferSetIdFromFilename(filename: string): string | null {
  const base = filename.replace(/\.md$/i, '');

  let examPrefix = '';
  const examMatch = base.match(/^(CET\d|TEM\d)/i);
  if (examMatch) {
    examPrefix = examMatch[1].toUpperCase();
  }

  const dateMatch = base.match(/(20\d{2})[._-](\d{2})/);
  let year = '';
  let month = '';
  if (dateMatch) {
    year = dateMatch[1];
    month = dateMatch[2];
  }

  let setNum = '1';
  const setMatch = base.match(/[Ss]et[_]?(\d+)/);
  if (setMatch) {
    setNum = setMatch[1];
  }

  if (!year || !examPrefix) return null;

  return examPrefix + '_' + year + '_' + month + '_S' + setNum;
}

/**
 * Pipeline 预检查：判断文件来源并确定目标
 */
export function validatePipeline(sourcePath: string): {
  mode: 'TRANSFER' | 'UPDATE';
  targetBase: string | null;
  setId: string | null;
} {
  if (sourcePath.includes('routing/')) {
    const filename = path.basename(sourcePath);
    const setId = inferSetIdFromFilename(filename);
    if (!setId) {
      return { mode: 'TRANSFER', targetBase: null, setId: null };
    }
    return { mode: 'TRANSFER', targetBase: '02_Working_Area/' + setId, setId };
  }

  if (sourcePath.includes('02_Working_Area/')) {
    const setId = buildSetIdFromPath(sourcePath);
    return { mode: 'UPDATE', targetBase: null, setId };
  }

  return { mode: 'TRANSFER', targetBase: null, setId: null };
}

/**
 * 生成分割后的 Question 和 Analysis 文件名
 */
export function generateSplitFilenames(
  setId: string,
  seq: string = '01'
): { questionFilename: string; analysisFilename: string } {
  const parts = setId.split('_');
  const year = parts[1] || '0000';
  const month = parts[2] || '01';
  const set = parts[3] || 'S1';
  return {
    questionFilename: year + '_' + month + '_' + set + '_Q_' + seq + '.md',
    analysisFilename: year + '_' + month + '_' + set + '_A_' + seq + '.md',
  };
}
