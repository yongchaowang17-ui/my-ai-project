/**
 * 文件指纹索引
 *
 * 持久化记录 data/ 下所有文件的 SHA-256 哈希值，
 * 用于增量构建时快速判断文件是否变化。
 *
 * 特性：
 * - 原子写入（先写 tmp 再 rename，防止断电损坏）
 * - 相对路径作为 key（相对于 data/ 目录）
 * - 16 位 SHA-256 前缀作为指纹值
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), 'data');
const FINGERPRINT_FILE = path.join(DATA_ROOT, 'fingerprint.json');
const FINGERPRINT_TMP = path.join(DATA_ROOT, 'fingerprint.tmp.json');

// ===== 核心函数 =====

/** 计算文件内容的 SHA-256 前 16 位哈希 */
export function computeFileHash(absPath: string): string {
  const content = fs.readFileSync(absPath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** 从绝对路径生成相对于 data/ 的 key */
export function toRelativeKey(absPath: string): string {
  return path.relative(DATA_ROOT, absPath).replace(/\\/g, '/');
}

/** 加载指纹表 */
export function loadFingerprint(): Record<string, string> {
  try {
    const raw = fs.readFileSync(FINGERPRINT_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/** 原子保存指纹表（先写 tmp 再 rename） */
export function saveFingerprint(fp: Record<string, string>): void {
  fs.mkdirSync(path.dirname(FINGERPRINT_FILE), { recursive: true });
  fs.writeFileSync(FINGERPRINT_TMP, JSON.stringify(fp, null, 2), 'utf-8');
  fs.renameSync(FINGERPRINT_TMP, FINGERPRINT_FILE);
}

/** 判断文件是否发生变化（不存在或 hash 不一致） */
export function hasChanged(absPath: string, fp: Record<string, string>): boolean {
  const key = toRelativeKey(absPath);
  if (!fs.existsSync(absPath)) return false; // 文件不存在，无需处理
  const currentHash = computeFileHash(absPath);
  return fp[key] !== currentHash;
}

/** 更新单条指纹记录 */
export function updateEntry(absPath: string, fp: Record<string, string>): Record<string, string> {
  const key = toRelativeKey(absPath);
  const hash = computeFileHash(absPath);
  fp[key] = hash;
  return fp;
}

/** 清除指纹表中不存在的文件条目 */
export function pruneFingerprint(fp: Record<string, string>): Record<string, string> {
  const pruned: Record<string, string> = {};
  for (const [key, hash] of Object.entries(fp)) {
    const absPath = path.join(DATA_ROOT, key);
    if (fs.existsSync(absPath)) {
      pruned[key] = hash;
    }
  }
  return pruned;
}
