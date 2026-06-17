#!/usr/bin/env node
/**
 * 资产库自诊断脚本
 *
 * 用法: node scripts/diagnose.js
 *
 * 检查项：
 * 1. 遗漏碎片：routing/ 下未归档到 02_Working_Area 的文件
 * 2. 对齐缺口：02_Working_Area 中 Q/A 文件数不匹配的套卷
 * 3. 无效元数据：03_Exam_Final 下缺少 Frontmatter 的文件
 * 4. 指纹一致性：fingerprint.json 与实际 hash 的差异
 * 5. 重复文件：同一 setId 在不同位置出现
 *
 * 输出: data/integrity-report.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.DATA_ROOT || path.join(PROJECT_ROOT, 'data');
const ROUTING_ROOT = path.join(DATA_ROOT, 'routing');
const WORKSPACE_ROOT = path.join(DATA_ROOT, '02_Working_Area');
const FINAL_ROOT = path.join(DATA_ROOT, '03_Exam_Final');
const FUSION_ROOT = path.join(DATA_ROOT, '04_Fusion_Area');
const REPORT_PATH = path.join(DATA_ROOT, 'integrity-report.md');

// ===== 指纹工具 =====

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

// ===== 诊断逻辑 =====

const results = {
  orphanedFragments: [],    // 遗漏碎片
  alignmentGaps: [],        // 对齐缺口
  missingFrontmatter: [],   // 缺少 Frontmatter
  fingerprintMismatch: [],  // 指纹不一致
  duplicateSets: [],        // 重复文件
  fusionPartGaps: [],        // 04区 Part 缺失
  fusionMetaErrors: [],       // 04区 元数据错误
  fusionCountMismatch: [],    // 04区 数量不匹配
  timestamp: new Date().toISOString(),
};

// 1. 检查遗漏碎片
function checkOrphanedFragments() {
  if (!fs.existsSync(ROUTING_ROOT)) return;

  const categories = ['raw_questions', 'raw_analysis', 'mixed', 'uncategorized', 'multi_set'];
  for (const cat of categories) {
    const dir = path.join(ROUTING_ROOT, cat);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      results.orphanedFragments.push({
        category: cat,
        file,
        path: path.relative(DATA_ROOT, path.join(dir, file)).replace(/\\/g, '/'),
      });
    }
  }
}

// 2. 检查对齐缺口
function checkAlignmentGaps() {
  if (!fs.existsSync(WORKSPACE_ROOT)) return;

  const setDirs = fs.readdirSync(WORKSPACE_ROOT).filter(d => {
    const p = path.join(WORKSPACE_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });

  for (const setId of setDirs) {
    const qDir = path.join(WORKSPACE_ROOT, setId, 'Question');
    const aDir = path.join(WORKSPACE_ROOT, setId, 'Analysis');
    const qFiles = fs.existsSync(qDir) ? fs.readdirSync(qDir).filter(f => f.endsWith('.md')) : [];
    const aFiles = fs.existsSync(aDir) ? fs.readdirSync(aDir).filter(f => f.endsWith('.md')) : [];

    if (qFiles.length !== aFiles.length) {
      results.alignmentGaps.push({
        setId,
        questionCount: qFiles.length,
        analysisCount: aFiles.length,
        diff: qFiles.length - aFiles.length,
      });
    }
  }
}

// 3. 检查 Frontmatter 完整性
function checkFrontmatter() {
  if (!fs.existsSync(FINAL_ROOT)) return;

  const levels = fs.readdirSync(FINAL_ROOT).filter(d => {
    const p = path.join(FINAL_ROOT, d);
    return fs.statSync(p).isDirectory();
  });

  for (const level of levels) {
    for (const type of ['Question', 'Analysis']) {
      const dir = path.join(FINAL_ROOT, level, type);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const hasFrontmatter = content.startsWith('---') && content.indexOf('---', 3) > 0;
        const hasExam = content.includes('exam:');
        const hasSetId = content.includes('setId:');

        if (!hasFrontmatter || !hasExam || !hasSetId) {
          results.missingFrontmatter.push({
            path: path.relative(DATA_ROOT, filePath).replace(/\\/g, '/'),
            hasFrontmatter,
            hasExam,
            hasSetId,
          });
        }
      }
    }
  }
}

// 4. 检查指纹一致性
function checkFingerprint() {
  const fp = loadFingerprint();
  if (Object.keys(fp).length === 0) return;

  for (const [key, expectedHash] of Object.entries(fp)) {
    const absPath = path.join(DATA_ROOT, key);
    if (!fs.existsSync(absPath)) {
      results.fingerprintMismatch.push({ key, status: 'file_missing' });
      continue;
    }
    const actualHash = computeFileHash(absPath);
    if (actualHash !== expectedHash) {
      results.fingerprintMismatch.push({ key, status: 'hash_mismatch', expected: expectedHash, actual: actualHash });
    }
  }
}

// 5. 检查重复文件（基于文件名）
function checkDuplicates() {
  if (!fs.existsSync(WORKSPACE_ROOT)) return;

  const fileMap = new Map(); // filename -> [{setId, type}]

  const setDirs = fs.readdirSync(WORKSPACE_ROOT).filter(d => {
    const p = path.join(WORKSPACE_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });

  for (const setId of setDirs) {
    for (const type of ['Question', 'Analysis']) {
      const dir = path.join(WORKSPACE_ROOT, setId, type);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        if (!fileMap.has(file)) {
          fileMap.set(file, []);
        }
        fileMap.get(file).push({ setId, type });
      }
    }
  }

  for (const [filename, locations] of fileMap) {
    if (locations.length > 1) {
      results.duplicateSets.push({ filename, locations });
    }
  }
}


// 6. 检查 04_Fusion_Area Part 完整性
function checkFusionPartGaps() {
  if (!fs.existsSync(FUSION_ROOT)) return;

  const levels = fs.readdirSync(FUSION_ROOT).filter(d => {
    const p = path.join(FUSION_ROOT, d);
    return fs.statSync(p).isDirectory();
  });

  for (const level of levels) {
    for (const type of ['Question', 'Analysis']) {
      const typeDir = path.join(FUSION_ROOT, level, type);
      if (!fs.existsSync(typeDir)) continue;

      const setDirs = fs.readdirSync(typeDir).filter(d => {
        const p = path.join(typeDir, d);
        return fs.statSync(p).isDirectory();
      });

      for (const setId of setDirs) {
        const setPath = path.join(typeDir, setId);
        const files = fs.readdirSync(setPath).filter(f => f.endsWith('.md'));
        const partIndices = files.map(f => {
          const m = f.match(/Part(\d+)/);
          return m ? parseInt(m[1]) : -1;
        }).filter(n => n >= 0).sort((a, b) => a - b);

        const expected = level.startsWith('CET6') ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
        const missing = expected.filter(n => !partIndices.includes(n));

        if (missing.length > 0) {
          results.fusionPartGaps.push({
            exam: level, type, setId,
            files: files.length,
            parts: partIndices,
            missing,
          });
        }
      }
    }
  }
}

// 7. 检查 04_Fusion_Area 元数据一致性
function checkFusionMetadata() {
  if (!fs.existsSync(FUSION_ROOT)) return;

  const levels = fs.readdirSync(FUSION_ROOT).filter(d => {
    const p = path.join(FUSION_ROOT, d);
    return fs.statSync(p).isDirectory();
  });

  for (const level of levels) {
    for (const type of ['Question', 'Analysis']) {
      const typeDir = path.join(FUSION_ROOT, level, type);
      if (!fs.existsSync(typeDir)) continue;

      const setDirs = fs.readdirSync(typeDir).filter(d => {
        const p = path.join(typeDir, d);
        return fs.statSync(p).isDirectory();
      });

      for (const setId of setDirs) {
        const setPath = path.join(typeDir, setId);
        const files = fs.readdirSync(setPath).filter(f => f.endsWith('.md'));

        for (const file of files) {
          const filePath = path.join(setPath, file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const hasFrontmatter = fileContent.startsWith('---') && fileContent.indexOf('---', 3) > 0;

          if (!hasFrontmatter) {
            results.fusionMetaErrors.push({
              path: path.relative(DATA_ROOT, filePath).replace(/\\/g, '/'),
              error: '缺少 Frontmatter',
            });
            continue;
          }

          const hasExam = fileContent.includes('exam:');
          const hasSetId = fileContent.includes('setId:');
          const hasPartIndex = fileContent.includes('partIndex:');

          if (!hasExam || !hasSetId || !hasPartIndex) {
            const missing = [];
            if (!hasExam) missing.push('exam');
            if (!hasSetId) missing.push('setId');
            if (!hasPartIndex) missing.push('partIndex');
            results.fusionMetaErrors.push({
              path: path.relative(DATA_ROOT, filePath).replace(/\\/g, '/'),
              error: '缺少字段: ' + missing.join(', '),
            });
          }
        }
      }
    }
  }
}

// 8. 检查 03→04 数量对齐
function checkFusionCountAlignment() {
  if (!fs.existsSync(FINAL_ROOT) || !fs.existsSync(FUSION_ROOT)) return;

  for (const level of ['CET4', 'CET6']) {
    for (const type of ['Question', 'Analysis']) {
      const srcDir = path.join(FINAL_ROOT, level, type);
      const tgtDir = path.join(FUSION_ROOT, level, type);

      if (!fs.existsSync(srcDir) || !fs.existsSync(tgtDir)) continue;

      const srcFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.md'));

      const setDirs = fs.readdirSync(tgtDir).filter(d => {
        const p = path.join(tgtDir, d);
        return fs.statSync(p).isDirectory();
      });

      let totalParts = 0;
      for (const setId of setDirs) {
        const sp = path.join(tgtDir, setId);
        totalParts += fs.readdirSync(sp).filter(f => f.endsWith('.md')).length;
      }

      if (totalParts < srcFiles.length) {
        results.fusionCountMismatch.push({
          exam: level, type,
          sourceCount: srcFiles.length,
          fusionPartCount: totalParts,
          diff: srcFiles.length - totalParts,
        });
      }
    }
  }
}

// ===== 报告生成 =====

function generateReport() {
  const lines = [];
  lines.push('# 资产库完整性报告');
  lines.push('');
  lines.push('> 生成时间: ' + results.timestamp);
  lines.push('');

  // 概要
  lines.push('## 概要');
  lines.push('');
  lines.push('| 检查项 | 结果 |');
  lines.push('|--------|------|');
  lines.push('| 遗漏碎片 | ' + results.orphanedFragments.length + ' 个 |');
  lines.push('| 对齐缺口 | ' + results.alignmentGaps.length + ' 个 |');
  lines.push('| 缺 Frontmatter | ' + results.missingFrontmatter.length + ' 个 |');
  lines.push('| 指纹不一致 | ' + results.fingerprintMismatch.length + ' 个 |');
  lines.push('| 重复文件 | ' + results.duplicateSets.length + ' 个 |');
  lines.push('');

  // 遗漏碎片
  lines.push('## 遗漏碎片');
  lines.push('');
  if (results.orphanedFragments.length === 0) {
    lines.push('（无）');
  } else {
    lines.push('| 分类 | 文件 | 路径 |');
    lines.push('|------|------|------|');
    for (const item of results.orphanedFragments) {
      lines.push('| ' + item.category + ' | ' + item.file + ' | ' + item.path + ' |');
    }
  }
  lines.push('');

  // 对齐缺口
  lines.push('## 对齐缺口');
  lines.push('');
  if (results.alignmentGaps.length === 0) {
    lines.push('（无）');
  } else {
    lines.push('| 套卷 | Question | Analysis | 差值 |');
    lines.push('|------|----------|----------|------|');
    for (const item of results.alignmentGaps) {
      lines.push('| ' + item.setId + ' | ' + item.questionCount + ' | ' + item.analysisCount + ' | ' + item.diff + ' |');
    }
  }
  lines.push('');

  // Frontmatter
  lines.push('## 缺少 Frontmatter 的文件');
  lines.push('');
  if (results.missingFrontmatter.length === 0) {
    lines.push('（无）');
  } else {
    lines.push('| 路径 | frontmatter | exam | setId |');
    lines.push('|------|-------------|------|-------|');
    for (const item of results.missingFrontmatter) {
      lines.push('| ' + item.path + ' | ' + (item.hasFrontmatter ? 'Y' : 'N') + ' | ' + (item.hasExam ? 'Y' : 'N') + ' | ' + (item.hasSetId ? 'Y' : 'N') + ' |');
    }
  }
  lines.push('');

  // 指纹不一致
  lines.push('## 指纹不一致');
  lines.push('');
  if (results.fingerprintMismatch.length === 0) {
    lines.push('（无）');
  } else {
    lines.push('| 文件 | 状态 |');
    lines.push('|------|------|');
    for (const item of results.fingerprintMismatch) {
      lines.push('| ' + item.key + ' | ' + item.status + (item.expected ? ' (期望: ' + item.expected + ', 实际: ' + item.actual + ')' : '') + ' |');
    }
  }
  lines.push('');

  // 重复文件
  lines.push('## 重复文件');
  lines.push('');
  if (results.duplicateSets.length === 0) {
    lines.push('（无）');
  } else {
    lines.push('| 文件名 | 位置 |');
    lines.push('|--------|------|');
    for (const item of results.duplicateSets) {
      const locs = item.locations.map(l => l.setId + '/' + l.type).join(', ');
      lines.push('| ' + item.filename + ' | ' + locs + ' |');
    }
  }
  lines.push('');

  
// 04区 Part 缺失
lines.push('## 04区 Part 缺失');
lines.push('');
if (results.fusionPartGaps.length === 0) {
  lines.push('（无）');
} else {
  lines.push('| 考试 | 类型 | 套卷 | 文件数 | 已有 Parts | 缺失 |');
  lines.push('|------|------|------|--------|------------|------|');
  for (const item of results.fusionPartGaps) {
    lines.push('| ' + item.exam + ' | ' + item.type + ' | ' + item.setId + ' | ' + item.files + ' | ' + item.parts.join(',') + ' | ' + item.missing.join(',') + ' |');
  }
}
lines.push('');

// 04区 元数据错误
lines.push('## 04区 元数据错误');
lines.push('');
if (results.fusionMetaErrors.length === 0) {
  lines.push('（无）');
} else {
  lines.push('| 路径 | 错误 |');
  lines.push('|------|------|');
  for (const item of results.fusionMetaErrors) {
    lines.push('| ' + item.path + ' | ' + item.error + ' |');
  }
}
lines.push('');

// 04区 数量不匹配
lines.push('## 04区 数量不匹配');
lines.push('');
if (results.fusionCountMismatch.length === 0) {
  lines.push('（无）');
} else {
  lines.push('| 考试 | 类型 | 03区文件数 | 04区块数 | 差值 |');
  lines.push('|------|------|-----------|---------|------|');
  for (const item of results.fusionCountMismatch) {
    lines.push('| ' + item.exam + ' | ' + item.type + ' | ' + item.sourceCount + ' | ' + item.fusionPartCount + ' | ' + item.diff + ' |');
  }
}
lines.push('');

return lines.join('\n');
}

// ===== 执行 =====

console.log('=== 资产库自诊断 ===\n');

checkOrphanedFragments();
checkAlignmentGaps();
checkFrontmatter();
checkFingerprint();
checkDuplicates();
checkFusionPartGaps();
checkFusionMetadata();
checkFusionCountAlignment();

const report = generateReport();
fs.writeFileSync(REPORT_PATH, report, 'utf-8');

console.log('检查完成:');
console.log('  遗漏碎片:', results.orphanedFragments.length);
console.log('  对齐缺口:', results.alignmentGaps.length);
console.log('  Frontmatter:', results.missingFrontmatter.length);
console.log('  指纹不一致:', results.fingerprintMismatch.length);
console.log('  重复文件:', results.duplicateSets.length);
console.log('  04区 Part 缺失:', results.fusionPartGaps.length);
console.log('  04区 元数据错误:', results.fusionMetaErrors.length);
console.log('  04区 数量不匹配:', results.fusionCountMismatch.length);
console.log('\n报告已生成:', REPORT_PATH);
