/**
 * _patch-dir-arg.js
 * 一次性脚本：为 _chunk-split-all.js 和 _chunk-split-fine.js 添加目录参数支持。
 */
const fs = require('fs');
const path = require('path');

const scripts = [
  path.join(__dirname, '_chunk-split-all.js'),
  path.join(__dirname, '_chunk-split-fine.js'),
];

const OLD = "const DIR = path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Reading');";
const NEW = "const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Reading');";

for (const f of scripts) {
  let t = fs.readFileSync(f, 'utf8');
  if (t.includes(NEW)) {
    console.log(path.basename(f) + ': already patched, skipping');
    continue;
  }
  if (!t.includes(OLD)) {
    console.error(path.basename(f) + ': DIR line not found, aborting');
    process.exit(1);
  }
  t = t.replace(OLD, NEW);
  fs.writeFileSync(f, t, 'utf8');
  console.log(path.basename(f) + ': patched ✓');
}
