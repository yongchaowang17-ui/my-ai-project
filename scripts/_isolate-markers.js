/**
 * _isolate-markers.js
 * 为目录下所有 Reading/Listening MD 文件的 ---CHUNK-SPLIT--- 标记添加空行隔离。
 * 格式：\n\n---CHUNK-SPLIT---\n\n
 * 已有隔离的标记不会重复处理。
 */
const fs = require('fs');
const path = require('path');

const DIRS = [
  process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Reading'),
  process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Listening'),
  path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET6', 'Reading'),
];

let totalFiles = 0, fixed = 0, alreadyOk = 0;

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const fp = path.join(dir, file);
    let t = fs.readFileSync(fp, 'utf8');
    const count = (t.match(/---CHUNK-SPLIT---/g) || []).length;
    if (count === 0) continue;
    totalFiles++;

    // 检查是否已经全部隔离
    const allIsolated = t.split('\n').every(l => {
      if (l.trim() !== '---CHUNK-SPLIT---') return true;
      return true; // 需要更精确的检查
    });

    // 更精确：检查每个 marker 是否被空行包围
    const lines = t.split('\n');
    let needsFix = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---CHUNK-SPLIT---') {
        const prevEmpty = i > 0 && lines[i - 1].trim() === '';
        const nextEmpty = i < lines.length - 1 && lines[i + 1].trim() === '';
        if (!prevEmpty || !nextEmpty) { needsFix = true; break; }
      }
    }

    if (!needsFix) { alreadyOk++; continue; }

    // 重建：确保每个 marker 前后有空行
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---CHUNK-SPLIT---') {
        // 确保前一行是空行
        if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
          newLines.push('');
        }
        newLines.push('---CHUNK-SPLIT---');
        // 确保后一行是空行
        if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
          newLines.push('');
        }
      } else {
        newLines.push(lines[i]);
      }
    }

    // 去掉文件开头可能产生的多余空行
    while (newLines.length > 0 && newLines[0].trim() === '' && newLines[1] && newLines[1].trim() === '---CHUNK-SPLIT---') {
      newLines.shift();
    }

    fs.writeFileSync(fp, newLines.join('\n'), 'utf8');
    fixed++;
    console.log(path.basename(dir) + '/' + file + ': fixed (' + count + ' markers)');
  }
}

console.log('\nTotal: ' + totalFiles + ' files with markers, Fixed: ' + fixed + ', Already OK: ' + alreadyOk);
