const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// 在 detectAllParts 的 headers.sort 之前插入后处理
const detectFuncStart = c.indexOf('function detectAllParts(');
const sortInDetect = c.indexOf('headers.sort((a, b) => a.lineIndex - b.lineIndex);', detectFuncStart);

if (sortInDetect === -1) {
  console.log('ERROR: sort not found');
  process.exit(1);
}

const postProcess = [
  '  // 后处理: 检查 Part 2 是否实际是 Reading (解析文件中 Part II 常指 Reading)',
  '  const p2 = headers.find(h => h.partIndex === 2);',
  '  if (p2) {',
  '    const line2 = allLines[p2.lineIndex + 2] || allLines[p2.lineIndex] || "";',
  '    if (/Reading|Comprehension/i.test(line2) && !/Listening/i.test(line2)) {',
  '      p2.partIndex = 3;',
  '      foundParts.delete(2);',
  '      foundParts.add(3);',
  '    }',
  '  }',
  '',
].join('\n');

c = c.substring(0, sortInDetect) + postProcess + c.substring(sortInDetect);
fs.writeFileSync(fp, c, 'utf-8');
console.log('Added post-processing for Part II Reading detection');
