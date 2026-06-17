/**
 * 修复 HTML 正则：\u003c 在正则中不工作，直接用 <td> 字面量
 */
const fs = require('fs');

// 修复 preview/route.ts
const f1 = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c1 = fs.readFileSync(f1, 'utf-8');

const old1 = '/\\u003ctd\\u003e\\s*Part\\s+I\\s+Writing/i';
const new1 = '/<td>\\s*Part\\s+I\\s+Writing/i';
if (c1.includes(old1)) {
  c1 = c1.replace(new1 ? old1 : 'NEVER_MATCH', new1);
  // 直接替换所有出现的 \u003ctd\u003e
  c1 = c1.split('/\\u003ctd\\u003e').join('/<td>');
  fs.writeFileSync(f1, c1, 'utf-8');
  console.log('1. preview: HTML entity 正则已修复');
} else {
  // 尝试直接替换
  const count1 = (c1.match(/\\u003c/g) || []).length;
  c1 = c1.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
  if (count1 > 0) {
    fs.writeFileSync(f1, c1, 'utf-8');
    console.log('1. preview: 全局替换 \\u003c → < (' + count1 + '处)');
  } else {
    console.log('1. preview: 未找到 \\u003c');
  }
}

// 修复 page.tsx
const f2 = 'D:/my-ai-Project/app/review/decompose/page.tsx';
let c2 = fs.readFileSync(f2, 'utf-8');
const count2 = (c2.match(/\\u003c/g) || []).length;
c2 = c2.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
if (count2 > 0) {
  fs.writeFileSync(f2, c2, 'utf-8');
  console.log('2. page: 全局替换 \\u003c → < (' + count2 + '处)');
} else {
  console.log('2. page: 未找到 \\u003c');
}

console.log('\nDone!');
