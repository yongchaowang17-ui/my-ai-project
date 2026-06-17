#!/usr/bin/env node
/**
 * 标准化资产库 CLI 脚本
 *
 * 用法: node scripts/finalize-assets.js
 *
 * 将 02_Working_Area/ 的文件复制到 03_Exam_Final/
 * 注入 YAML Frontmatter 元数据（gray-matter）
 * 集成指纹索引实现增量构建
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.DATA_ROOT || path.join(PROJECT_ROOT, 'data');
const WORKSPACE_ROOT = path.join(DATA_ROOT, '02_Working_Area');
const FINAL_ROOT = path.join(DATA_ROOT, '03_Exam_Final');

// ===== 指纹索引 =====

function computeFileHash(absPath) {
  const content = fs.readFileSync(absPath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function toRelativeKey(absPath) {
  return path.relative(DATA_ROOT, absPath).replace(/\\/g, '/');
}

function loadFingerprint() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_ROOT, 'fingerprint.json'), 'utf-8'));
  } catch {
    return {};
  }
}

function saveFingerprint(fp) {
  const target = path.join(DATA_ROOT, 'fingerprint.json');
  const tmp = path.join(DATA_ROOT, 'fingerprint.tmp.json');
  fs.writeFileSync(tmp, JSON.stringify(fp, null, 2), 'utf-8');
  fs.renameSync(tmp, target);
}

function hasChanged(absPath, fp) {
  if (!fs.existsSync(absPath)) return false;
  const key = toRelativeKey(absPath);
  const currentHash = computeFileHash(absPath);
  return fp[key] !== currentHash;
}

// ===== 主逻辑 =====

console.log('=== 标准化资产库 (gray-matter + fingerprint) ===\n');

if (!fs.existsSync(WORKSPACE_ROOT)) {
  console.error('错误: 02_Working_Area/ 不存在');
  process.exit(1);
}

const fp = loadFingerprint();
let fpChanged = false;

const setDirs = fs.readdirSync(WORKSPACE_ROOT).filter(d => {
  const p = path.join(WORKSPACE_ROOT, d);
  return fs.statSync(p).isDirectory() && !d.startsWith('.');
});

let totalCopied = 0;
let totalUpdated = 0;
let totalSkipped = 0;
let totalFpSkipped = 0;
let totalErrors = 0;

for (const setId of setDirs) {
  const exam = setId.split('_')[0] || 'unknown';

  for (const type of ['Question', 'Analysis']) {
    const sourceDir = path.join(WORKSPACE_ROOT, setId, type);
    if (!fs.existsSync(sourceDir)) continue;

    const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));
    if (files.length === 0) continue;

    for (const file of files) {
      const src = path.join(sourceDir, file);
      const dest = path.join(FINAL_ROOT, exam, type, file);

      // 指纹快速检查
      if (!hasChanged(src, fp) && fs.existsSync(dest)) {
        totalFpSkipped++;
        continue;
      }

      try {
        const originalContent = fs.readFileSync(src, 'utf-8');
        const originalHash = crypto.createHash('sha256').update(originalContent).digest('hex').slice(0, 16);

        // 使用 gray-matter 注入 Frontmatter
        const fmData = {
          exam,
          setId,
          type,
          sourceFile: setId + '/' + type + '/' + file,
          checksum: originalHash,
          standardizedAt: new Date().toISOString(),
        };
        const finalContent = matter.stringify(originalContent, fmData);
        const finalHash = crypto.createHash('sha256').update(finalContent).digest('hex').slice(0, 16);

        // 幂等检查（使用 finalContent 的 hash）
        if (fs.existsSync(dest)) {
          const existing = fs.readFileSync(dest, 'utf-8');
          if (crypto.createHash('sha256').update(existing).digest('hex').slice(0, 16) === finalHash) {
            totalSkipped++;
            // 同步指纹
            fp[toRelativeKey(src)] = originalHash;
            fp[toRelativeKey(dest)] = finalHash;
            fpChanged = true;
            continue;
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, finalContent, 'utf-8');
          totalUpdated++;
          console.log('  [updated]', exam + '/' + type + '/' + file);
        } else {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, finalContent, 'utf-8');
          totalCopied++;
          console.log('  [copied]', exam + '/' + type + '/' + file);
        }

        // 更新指纹
        fp[toRelativeKey(src)] = originalHash;
        fp[toRelativeKey(dest)] = finalHash;
        fpChanged = true;
      } catch (err) {
        totalErrors++;
        console.log('  [error]', file, '-', err.message);
      }
    }
  }
}

// 原子保存指纹表
if (fpChanged) {
  saveFingerprint(fp);
}

console.log('\n=== 完成 ===');
console.log('新增:', totalCopied);
console.log('更新:', totalUpdated);
console.log('幂等跳过:', totalSkipped);
console.log('指纹跳过:', totalFpSkipped);
console.log('错误:', totalErrors);
console.log('目标:', FINAL_ROOT);
