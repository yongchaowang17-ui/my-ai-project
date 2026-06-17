/**
 * 统一分拣引擎
 *
 * 将 routing/ 下零散的真题碎片分拣到 02_Working_Area/ 标准资产库
 *
 * 流程：
 * 1. 从文件名解析 examLevel 和 setId
 * 2. 构造目标路径 02_Working_Area/{setId}/Question|Analysis/
 * 3. 原子移动（幂等：已存在则跳过）
 * 4. 源目录为空时自动清理
 */

import fs from 'fs';
import path from 'path';
import { inferSetIdFromFilename } from './naming-validator';
import { WORKSPACE_ROOT } from './fs-utils';

// ===== 元数据解析 =====

/** 从文件名推断考试级别 */
export function inferExamLevel(filename: string): string | null {
  const base = filename.replace(/\.md$/i, '');
  if (/^CET4/i.test(base)) return 'CET4';
  if (/^CET6/i.test(base)) return 'CET6';
  if (/^TEM4/i.test(base)) return 'TEM4';
  if (/^TEM8/i.test(base)) return 'TEM8';
  return null;
}

/** 从文件名推断题目类型 */
export function inferFileType(filename: string): 'Question' | 'Analysis' | null {
  const base = filename.replace(/\.md$/i, '');
  if (/真题|题目|Question/.test(base)) return 'Question';
  if (/解析|答案|Analysis|Answer/.test(base)) return 'Analysis';
  return null;
}

// ===== 分拣核心 =====

export interface OrganizeResult {
  sourcePath: string;
  targetPath: string;
  examLevel: string;
  setId: string;
  fileType: string;
  action: 'moved' | 'skipped' | 'error';
  error?: string;
}

/**
 * 分拣单个文件到标准资产库
 * @param filePath 源文件绝对路径
 * @param type 指定类型（可选，优先于文件名推断）
 */
export function organizeFile(
  filePath: string,
  type?: 'Question' | 'Analysis'
): OrganizeResult {
  const filename = path.basename(filePath);
  const relativePath = filePath.replace(/\\/g, '/');

  // 1. 元数据提取
  const examLevel = inferExamLevel(filename);
  const setIdRaw = inferSetIdFromFilename(filename);
  const fileType = type || inferFileType(filename);

  if (!setIdRaw) {
    return {
      sourcePath: relativePath,
      targetPath: '',
      examLevel: examLevel || 'unknown',
      setId: '',
      fileType: fileType || 'unknown',
      action: 'error',
      error: 'Cannot infer SetId from filename: ' + filename,
    };
  }

  if (!fileType) {
    return {
      sourcePath: relativePath,
      targetPath: '',
      examLevel: examLevel || 'unknown',
      setId: setIdRaw,
      fileType: 'unknown',
      action: 'error',
      error: 'Cannot infer file type (Question/Analysis): ' + filename,
    };
  }

  // 2. 构造目标路径
  const targetDir = path.join(WORKSPACE_ROOT, setIdRaw, fileType);
  const targetPath = path.join(targetDir, filename);
  const targetRelative = path.relative(path.join(WORKSPACE_ROOT, '..'), targetPath).replace(/\\/g, '/');

  // 3. 幂等检查：目标已存在则跳过
  if (fs.existsSync(targetPath)) {
    return {
      sourcePath: relativePath,
      targetPath: targetRelative,
      examLevel: examLevel || 'unknown',
      setId: setIdRaw,
      fileType,
      action: 'skipped',
    };
  }

  // 4. 原子移动
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(filePath, targetPath);
    fs.unlinkSync(filePath);

    return {
      sourcePath: relativePath,
      targetPath: targetRelative,
      examLevel: examLevel || 'unknown',
      setId: setIdRaw,
      fileType,
      action: 'moved',
    };
  } catch (err) {
    return {
      sourcePath: relativePath,
      targetPath: targetRelative,
      examLevel: examLevel || 'unknown',
      setId: setIdRaw,
      fileType,
      action: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 分拣整个目录
 * @param dirPath 源目录路径
 * @param type 强制指定类型（可选）
 */
export function organizeDirectory(
  dirPath: string,
  type?: 'Question' | 'Analysis'
): OrganizeResult[] {
  if (!fs.existsSync(dirPath)) return [];

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  const results: OrganizeResult[] = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    results.push(organizeFile(filePath, type));
  }

  // 清理空源目录
  const remaining = fs.readdirSync(dirPath).filter(f => !f.startsWith('.'));
  if (remaining.length === 0) {
    try {
      fs.rmdirSync(dirPath);
    } catch { /* 目录非空，忽略 */ }
  }

  return results;
}

// ===== 分拣清单追踪 =====

const MANIFEST_PATH = path.join(process.cwd(), 'data', 'organize-manifest.json');

/** 加载已分拣文件清单 */
function loadManifest(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/** 保存分拣清单 */
function saveManifest(manifest: Record<string, string>): void {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * 判断文件是否需要分拣（新增或重命名）
 * 检查条件：
 * 1. 目标文件不存在 → 新文件
 * 2. 源文件不在清单中 → 重命名文件
 * 3. 源文件在清单中但清单中的目标不存在 → 目标被删除，需重新分拣
 */
export function needsOrganize(filePath: string): boolean {
  const filename = path.basename(filePath);
  const manifest = loadManifest();

  // 目标路径
  const setId = inferSetIdFromFilename(filename);
  const fileType = inferFileType(filename);
  if (!setId || !fileType) return false;

  const targetPath = path.join(WORKSPACE_ROOT, setId, fileType, filename);

  // 1. 目标不存在 → 需要
  if (!fs.existsSync(targetPath)) return true;

  // 2. 源文件不在清单中 → 可能是重命名文件
  if (!manifest[filename]) return true;

  // 3. 清单中的目标不存在 → 需要重新分拣
  const recordedTarget = manifest[filename];
  if (!fs.existsSync(recordedTarget)) return true;

  return false;
}

/**
 * 分拣单个文件（带清单追踪 + 幂等）
 * 仅在 needsOrganize 返回 true 时执行
 */
export function organizeFileTracked(
  filePath: string,
  type?: 'Question' | 'Analysis'
): OrganizeResult {
  if (!needsOrganize(filePath)) {
    return {
      sourcePath: filePath.replace(/\\/g, '/'),
      targetPath: '',
      examLevel: '',
      setId: '',
      fileType: type || '',
      action: 'skipped',
    };
  }

  const result = organizeFile(filePath, type);

  // 成功移动后更新清单
  if (result.action === 'moved') {
    const manifest = loadManifest();
    const filename = path.basename(filePath);
    manifest[filename] = result.targetPath;
    saveManifest(manifest);
  }

  return result;
}

/**
 * 分拣整个目录（仅处理新文件和重命名文件）
 */
export function organizeDirectoryTracked(
  dirPath: string,
  type?: 'Question' | 'Analysis'
): OrganizeResult[] {
  if (!fs.existsSync(dirPath)) return [];

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  const results: OrganizeResult[] = [];

  for (const file of files) {
    results.push(organizeFileTracked(path.join(dirPath, file), type));
  }

  // 清理空源目录
  const remaining = fs.readdirSync(dirPath).filter(f => !f.startsWith('.'));
  if (remaining.length === 0) {
    try { fs.rmdirSync(dirPath); } catch { /* ignore */ }
  }

  return results;
}