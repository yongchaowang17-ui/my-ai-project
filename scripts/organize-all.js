#!/usr/bin/env node
/**
 * 分拣引擎 CLI 脚本（带指纹索引）
 *
 * 用法: node scripts/organize-all.js
 *
 * 扫描 routing/ 下 raw_questions 和 raw_analysis 目录
 * 将文件分拣到 02_Working_Area/{setId}/Question|Analysis/
 * 集成指纹索引实现增量分拣 + 清单追踪
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.DATA_ROOT || path.join(PROJECT_ROOT, 'data');
const ROUTING_ROOT = path.join(DATA_ROOT, 'routing');
const WORKSPACE_ROOT = path.join(DATA_ROOT, '02_Working_Area');

// ===== 指纹索引 =====

function computeFileHash(absPath) {
  const content = fs.readFileSync(absPath, 'utf-8');
  return require('crypto').createHash('sha256').update(content).digest('hex').slice(0, 16);
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

// ===== 清单追踪 =====

const MANIFEST_PATH = path.join(DATA_ROOT, 'organize-manifest.json');

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); }
  catch { return {}; }
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

// ===== 推断逻辑 =====

function inferSetIdFromFilename(filename) {
  const base = filename.replace(/\.md$/i, '');
  let examPrefix = '';
  const examMatch = base.match(/^(CET\d|TEM\d)/i);
  if (examMatch) examPrefix = examMatch[1].toUpperCase();
  const dateMatch = base.match(/(20\d{2})[._-](\d{2})/);
  if (!dateMatch || !examPrefix) return null;
  let setNum = '1';
  const setMatch = base.match(/[Ss]et[_]?(\d+)/);
  if (setMatch) setNum = setMatch[1];
  return examPrefix + '_' + dateMatch[1] + '_' + dateMatch[2] + '_S' + setNum;
}

function inferFileType(filename) {
  const base = filename.replace(/\.md$/i, '');
  if (/真题|题目|Question/.test(base)) return 'Question';
  if (/解析|答案|Analysis|Answer/.test(base)) return 'Analysis';
  return null;
}

// ===== 分拣逻辑 =====

function needsOrganize(filePath) {
  const filename = path.basename(filePath);
  const setId = inferSetIdFromFilename(filename);
  const fileType = inferFileType(filename);
  if (!setId || !fileType) return false;

  const targetPath = path.join(WORKSPACE_ROOT, setId, fileType, filename);
  if (!fs.existsSync(targetPath)) return true;

  const manifest = loadManifest();
  if (!manifest[filename]) return true;
  if (!fs.existsSync(manifest[filename])) return true;

  return false;
}

function organizeFileTracked(filePath, forcedType) {
  const filename = path.basename(filePath);
  if (!needsOrganize(filePath)) {
    return { file: filename, action: 'skipped', target: '(already organized)' };
  }

  const setId = inferSetIdFromFilename(filename);
  const fileType = forcedType || inferFileType(filename);
  if (!setId) return { file: filename, action: 'error', error: 'No SetId' };
  if (!fileType) return { file: filename, action: 'error', error: 'No type' };

  const targetDir = path.join(WORKSPACE_ROOT, setId, fileType);
  const targetPath = path.join(targetDir, filename);

  if (fs.existsSync(targetPath)) {
    return { file: filename, action: 'skipped', target: setId + '/' + fileType };
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(filePath, targetPath);
    fs.unlinkSync(filePath);

    // 更新清单
    const manifest = loadManifest();
    manifest[filename] = setId + '/' + fileType + '/' + filename;
    saveManifest(manifest);

    return { file: filename, action: 'moved', target: setId + '/' + fileType };
  } catch (err) {
    return { file: filename, action: 'error', error: err.message };
  }
}

// ===== 主逻辑 =====

console.log('=== 分拣引擎 (fingerprint + manifest) ===\n');

const fp = loadFingerprint();
let fpChanged = false;

const sources = [
  { dir: path.join(ROUTING_ROOT, 'raw_questions'), type: 'Question', label: 'raw_questions' },
  { dir: path.join(ROUTING_ROOT, 'raw_analysis'), type: 'Analysis', label: 'raw_analysis' },
];

let totalMoved = 0;
let totalSkipped = 0;
let totalErrors = 0;

for (const source of sources) {
  if (!fs.existsSync(source.dir)) {
    console.log('跳过不存在的目录:', source.label);
    continue;
  }

  const files = fs.readdirSync(source.dir).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    console.log(source.label + ': 无文件');
    continue;
  }

  console.log(source.label + ': ' + files.length + ' 个文件');

  for (const file of files) {
    const filePath = path.join(source.dir, file);

    // 指纹检查
    if (!hasChanged(filePath, fp)) {
      totalSkipped++;
      continue;
    }

    const result = organizeFileTracked(filePath, source.type);
    if (result.action === 'moved') {
      totalMoved++;
      console.log('  [moved]', result.file, '->', result.target);

      // 更新指纹
      const targetPath = path.join(WORKSPACE_ROOT, result.target, result.file);
      fp[toRelativeKey(targetPath)] = computeFileHash(targetPath);
      fpChanged = true;
    } else if (result.action === 'skipped') {
      totalSkipped++;
      console.log('  [skipped]', result.file);
    } else {
      totalErrors++;
      console.log('  [error]', result.file, '-', result.error);
    }
  }

  // 清理空目录
  const remaining = fs.readdirSync(source.dir).filter(f => !f.startsWith('.'));
  if (remaining.length === 0) {
    fs.rmdirSync(source.dir);
    console.log('  [cleaned]', source.label);
  }
}

// 原子保存指纹表
if (fpChanged) {
  saveFingerprint(fp);
}

console.log('\n=== 分拣完成 ===');
console.log('移动:', totalMoved);
console.log('跳过:', totalSkipped);
console.log('错误:', totalErrors);
