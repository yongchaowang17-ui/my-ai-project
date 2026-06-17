/**
 * 修复 _fix-detection.js 引入的行合并问题
 * 将被合并到注释行的代码拆分回独立行
 */
const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let content = fs.readFileSync(fp, 'utf-8');

// 模式：注释行末尾紧跟代码（没有换行）
// 例如: "// some comment      if (/..." -> "// some comment\n      if (/..."

// 修复所有 "注释后紧跟 if/const/for/return/break 等关键字" 的情况
// 用正则匹配: // ...  followed by code keywords without newline
const fixes = [
  // Part I Writing 注释后跟 if
  [/(\/\/\s*Part\s+I\s+Writing[^\n]*?\?)\s+(if\s*\()/g, '$1\n  $2'],
  // Markdown 标题注释后跟 if  
  [/(\/\/\s*Markdown[^\n]*?\?)\s+(if\s*\()/g, '$1\n      $2'],
  // Writing Directions 注释后跟 if
  [/(\/\/\s*Writing\s+Directions[^\n]*?\?)\s+(if\s*\()/g, '$1\n      $2'],
  // Section A 注释后跟 if
  [/(\/\/\s*[^\n]*?Section\s+A[^\n]*?\?)\s+(if\s*\()/g, '$1\n      $2'],
  // Listening 注释后跟 if
  [/(\/\/\s*[^\n]*?Listening[^\n]*?\?)\s+(if\s*\()/g, '$1\n      $2'],
  // hear/Listen 注释后跟 if
  [/(\/\/\s*[^\n]*?hear\/Listen[^\n]*?\?)\s+(if\s*\()/g, '$1\n      $2'],
  // 通用：注释行末尾直接跟 if/const/for 且中间没有换行
  [/(\/\/[^\n]{20,}?)\s+(if\s*\(|const\s+|for\s*\(|return\s)/g, '$1\n      $2'],
];

let count = 0;
for (const [pattern, replacement] of fixes) {
  const before = content;
  content = content.replace(pattern, replacement);
  if (content !== before) count++;
}

fs.writeFileSync(fp, content, 'utf-8');

// 验证
const verify = fs.readFileSync(fp, 'utf-8');
const lines = verify.split('\n');
console.log('修复了', count, '处行合并');
console.log('总行数:', lines.length);

// 检查是否还有注释行末尾跟代码的情况
let remaining = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // 如果一行中有 // 注释后紧跟 if/const/for 等
  if (/\/\/[^\n]{20,}?\b(if|const|for|return|break)\s*[\(=]/.test(line)) {
    console.log('  仍有问题 L' + (i + 1) + ': ' + line.substring(0, 100));
    remaining++;
  }
}
console.log('剩余问题:', remaining);
