/**
 * 精确扫描乱码文件 — 检测真正的 OCR 编码损坏
 * 排除正常字符：★☆·&#x27;《》（）等
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'data', '03_Exam_Final');

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  lines.forEach(function (line, idx) {
    if (!line || line.trim().length === 0) return;

    // 1. Unicode 替换字符 U+FFFD
    if (line.includes('\ufffd')) {
      issues.push({ lineNum: idx + 1, type: 'U+FFFD', preview: line.substring(0, 120) });
      return;
    }

    // 2. 连续重音拉丁字母 (GBK 双编码特征，4个以上连续)
    var latinRuns = line.match(/[\u00C0-\u00FF\u0100-\u024F]{4,}/g);
    if (latinRuns) {
      issues.push({ lineNum: idx + 1, type: 'latin-garble', preview: line.substring(0, 120) });
      return;
    }

    // 3. 纯问号标题 (# ??????????)
    if (/^#\s*\?{3,}/.test(line)) {
      issues.push({ lineNum: idx + 1, type: 'question-marks', preview: line.substring(0, 120) });
      return;
    }

    // 4. 连续的非 CJK 非 ASCII 不可识别字符（排除常见标点和符号）
    var cleanLine = line
      .replace(/[\u4e00-\u9fff]/g, '')   // 中文
      .replace(/[a-zA-Z0-9]/g, '')       // 英文数字
      .replace(/[\s\.\,\;\:\!\?\-\(\)\"\'\/\\\[\]\{\}\<\>\#\*\_\~\`\=\+\|\@\&\^\%\$\!\?]/g, '') // 常见符号
      .replace(/[\u3000-\u303F\uFF00-\uFFEF]/g, '')  // 全角标点
      .replace(/[\u2000-\u206F]/g, '');   // 空格符号
    // 如果剩余字符中有 3 个以上的非常见字符
    if (cleanLine.length >= 3) {
      issues.push({ lineNum: idx + 1, type: 'mixed-garble', preview: line.substring(0, 120) });
    }
  });
  return issues;
}

var results = [];
for (var level of ['CET4', 'CET6']) {
  for (var type of ['Question', 'Analysis']) {
    var dir = path.join(ROOT, level, type);
    if (!fs.existsSync(dir)) continue;
    var files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.md'); });
    for (var f of files) {
      var issues = scanFile(path.join(dir, f));
      if (issues.length > 0) {
        results.push({ file: f, level: level, type: type, issues: issues });
      }
    }
  }
}

console.log('=== 精确乱码扫描报告 ===');
console.log('共 ' + results.length + ' 个文件\n');
for (var r of results) {
  console.log('[' + r.level + '/' + r.type + '] ' + r.file + ' (' + r.issues.length + '行)');
  for (var i of r.issues.slice(0, 3)) {
    console.log('  行' + i.lineNum + ' [' + i.type + ']: ' + i.preview);
  }
  console.log('');
}
