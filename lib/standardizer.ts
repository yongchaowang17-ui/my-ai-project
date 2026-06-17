/**
 * 标准化资产库引擎
 *
 * 将 02_Working_Area/ 的文件复制到 03_Exam_Final/
 * 过程中注入 YAML Frontmatter 元数据（使用 gray-matter）
 *
 * 特性：
 * - 原子复制（不移动源文件）
 * - 元数据植入（exam, setId, type, checksum, standardizedAt）
 * - 幂等性（内容 hash 不变则跳过）
 * - 指纹索引追踪（增量构建）
 * - 异常管理（失败保留源文件，记录错误）
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { WORKSPACE_ROOT, FINAL_ROOT } from './fs-utils';
import { loadFingerprint, saveFingerprint, hasChanged, updateEntry } from './fingerprint';

// ===== 工具函数 =====

/** 从 setId 提取考试级别 */
function extractExamLevel(setId: string): string {
  const parts = setId.split('_');
  return parts[0] || 'unknown';
}

// ===== 核心函数 =====

export interface StandardizeResult {
  sourcePath: string;
  targetPath: string;
  exam: string;
  setId: string;
  type: string;
  action: 'copied' | 'updated' | 'skipped' | 'error';
  checksum: string;
  error?: string;
}

/**
 * 原子复制 + 元数据植入（使用 gray-matter）
 */
export function copyAndStandardize(
  src: string,
  dest: string,
  meta: { exam: string; setId: string; type: string; sourceFile: string }
): StandardizeResult {
  const relativeSrc = src.replace(/\\/g, '/');
  const relativeDest = dest.replace(/\\/g, '/');

  try {
    // 1. 读取源内容
    const originalContent = fs.readFileSync(src, 'utf-8');
    const originalHash = contentHash(originalContent);

    // 2. 使用 gray-matter 注入 Frontmatter
    const frontmatterData: Record<string, string> = {
      exam: meta.exam,
      setId: meta.setId,
      type: meta.type,
      sourceFile: meta.sourceFile,
      checksum: originalHash,
      standardizedAt: new Date().toISOString(),
    };
    const finalContent = matter.stringify(originalContent, frontmatterData);
    const finalHash = contentHash(finalContent);

    // 3. 幂等检查：目标已存在且内容 hash 一致则跳过
    if (fs.existsSync(dest)) {
      const existingContent = fs.readFileSync(dest, 'utf-8');
      const existingHash = contentHash(existingContent);
      if (existingHash === finalHash) {
        return {
          sourcePath: relativeSrc,
          targetPath: relativeDest,
          ...meta,
          action: 'skipped',
          checksum: originalHash,
        };
      }
      // 内容不一致，更新
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, finalContent, 'utf-8');
      return {
        sourcePath: relativeSrc,
        targetPath: relativeDest,
        ...meta,
        action: 'updated',
        checksum: originalHash,
      };
    }

    // 4. 新文件，创建并写入
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, finalContent, 'utf-8');

    return {
      sourcePath: relativeSrc,
      targetPath: relativeDest,
      ...meta,
      action: 'copied',
      checksum: originalHash,
    };
  } catch (err) {
    return {
      sourcePath: relativeSrc,
      targetPath: relativeDest,
      ...meta,
      action: 'error',
      checksum: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 计算内容 SHA-256 前 16 位 */
function contentHash(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * 标准化整个 02_Working_Area 目录（带指纹索引增量追踪）
 */
export function standardizeAll(): StandardizeResult[] {
  const results: StandardizeResult[] = [];
  const fp = loadFingerprint();
  let fpChanged = false;

  if (!fs.existsSync(WORKSPACE_ROOT)) return results;

  // 遍历所有 setId 目录
  const setDirs = fs.readdirSync(WORKSPACE_ROOT).filter(d => {
    const p = path.join(WORKSPACE_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });

  for (const setId of setDirs) {
    const exam = extractExamLevel(setId);

    for (const type of ['Question', 'Analysis'] as const) {
      const sourceDir = path.join(WORKSPACE_ROOT, setId, type);
      if (!fs.existsSync(sourceDir)) continue;

      const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const src = path.join(sourceDir, file);
        const dest = path.join(FINAL_ROOT, exam, type, file);

        // 指纹检查：跳过未变化的文件
        if (!hasChanged(src, fp) && fs.existsSync(dest)) {
          results.push({
            sourcePath: src.replace(/\\/g, '/'),
            targetPath: dest.replace(/\\/g, '/'),
            exam,
            setId,
            type,
            action: 'skipped',
            checksum: fp[src.replace(/\\/g, '/')] || '',
          });
          continue;
        }

        const result = copyAndStandardize(src, dest, {
          exam,
          setId,
          type,
          sourceFile: setId + '/' + type + '/' + file,
        });

        results.push(result);

        // 更新指纹
        if (result.action !== 'error') {
          updateEntry(src, fp);
          updateEntry(dest, fp);
          fpChanged = true;
        }
      }
    }
  }

  // 原子保存指纹表
  if (fpChanged) {
    saveFingerprint(fp);
  }

  return results;
}
