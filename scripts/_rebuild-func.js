/**
 * 重建 inferPartsByKeywords 函数体
 */
const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// 找到 inferPartsByKeywords 函数签名的结束位置
const sigStart = c.indexOf('function inferPartsByKeywords(');
const sigEnd = c.indexOf('{', sigStart);

// 找到 inferByPosition 函数的开始
const nextFunc = c.indexOf('\nfunction inferByPosition(');

// 替换从函数签名到下一个函数之间的所有内容
const cleanBody = `{
  const result: Array<{ partIndex: number; lineIndex: number }> = [];

  // Part I Writing
  if (!foundParts.has(1)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,4}\\s+Part\\s+I\\b/i.test(line) && !/Comprehension|Listening/i.test(line)) {
        result.push({ partIndex: 1, lineIndex: i }); foundParts.add(1); break;
      }
      if (/^#{1,4}\\s+Writing\\b/i.test(line)) {
        result.push({ partIndex: 1, lineIndex: i }); foundParts.add(1); break;
      }
      if (/Directions\\s*[:：].*(?:write|essay|submission|inviting)/i.test(line) && i < 60) {
        result.push({ partIndex: 1, lineIndex: i }); foundParts.add(1); break;
      }
    }
  }

  // Part II Listening
  if (!foundParts.has(2)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\\s+(?:Part\\s+II\\s+)?Listening/i.test(lines[i])) {
        result.push({ partIndex: 2, lineIndex: i }); foundParts.add(2); break;
      }
      if (/^#{1,4}\\s+Section\\s+A\\b/i.test(lines[i])) {
        const nextFew = lines.slice(i + 1, i + 5).join(' ');
        if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
          result.push({ partIndex: 2, lineIndex: i }); foundParts.add(2); break;
        }
      }
    }
  }

  // Part III Reading Comprehension
  if (!foundParts.has(3)) {
    for (let i = 0; i < lines.length; i++) {
      if (/Reading\\s+Comprehension/i.test(lines[i]) && /^#{1,4}\\s/.test(lines[i])) {
        result.push({ partIndex: 3, lineIndex: i }); foundParts.add(3); break;
      }
      if (/^#{1,4}\\s+Section\\s+A\\b/i.test(lines[i]) && foundParts.has(2)) {
        const p2Line = result.find(r => r.partIndex === 2)?.lineIndex || 0;
        if (i > p2Line + 30) {
          result.push({ partIndex: 3, lineIndex: i }); foundParts.add(3); break;
        }
      }
    }
  }

  // Part IV Translation
  if (!foundParts.has(4)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\\s+.*Translation\\b/i.test(lines[i]) && !/Comprehension/i.test(lines[i])) {
        result.push({ partIndex: 4, lineIndex: i }); foundParts.add(4); break;
      }
      if (/translate\\s+a\\s+passage\\s+from\\s+Chinese/i.test(lines[i])) {
        result.push({ partIndex: 4, lineIndex: i }); foundParts.add(4); break;
      }
    }
  }

  return result;
}`;

c = c.substring(0, sigEnd) + cleanBody + c.substring(nextFunc);

fs.writeFileSync(fp, c, 'utf-8');

// 验证
const verify = fs.readFileSync(fp, 'utf-8');
console.log('文件行数:', verify.split('\n').length);
console.log('inferPartsByKeywords 定义:', (verify.match(/function inferPartsByKeywords/g) || []).length);
console.log('inferByPosition 定义:', (verify.match(/function inferByPosition/g) || []).length);
console.log('detectAllParts 定义:', (verify.match(/function detectAllParts/g) || []).length);
