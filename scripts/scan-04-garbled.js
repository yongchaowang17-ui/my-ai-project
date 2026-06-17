/**
 * 扫描 04区乱码文件
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'data', '04_Fusion_Area');

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];
  
  lines.forEach(function (line, idx) {
    if (!line || line.trim().length === 0) return;
    // Unicode 替换字符
    if (line.includes('\ufffd')) {
      issues.push({ lineNum: idx + 1, type: 'U+FFFD', preview: line.substring(0, 120) });
      return;
    }
    // 连续重音拉丁字母
    var latinRuns = line.match(/[\u00C0-\u00FF\u0100-\u024F]{4,}/g);
    if (latinRuns) {
      issues.push({ lineNum: idx + 1, type: 'latin-garble', preview: line.substring(0, 120) });
      return;
    }
    // 纯问号标题
    if (/^#\s*\?{3,}/.test(line)) {
      issues.push({ lineNum: idx + 1, type: 'question-marks', preview: line.substring(0, 120) });
      return;
    }
  });
  return issues;
}

// 递归扫描
function scanDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath));
    } else if (entry.name.endsWith('.md')) {
      const issues = scanFile(fullPath);
      if (issues.length > 0) {
        results.push({
          file: path.relative(ROOT, fullPath),
          issues: issues
        });
      }
    }
  }
  return results;
}

console.log('=== 04区乱码扫描 ===\n');
const results = scanDir(ROOT);

console.log('共 ' + results.length + ' 个含乱码的文件\n');
for (const r of results) {
  console.log('[' + r.file + '] (' + r.issues.length + '行)');
  for (const i of r.issues.slice(0, 3)) {
    console.log('  行' + i.lineNum + ' [' + i.type + ']: ' + i.preview);
  }
  console.log('');
}
