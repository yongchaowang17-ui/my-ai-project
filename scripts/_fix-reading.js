const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// 找到 contextualFixPartNumber 函数
const funcSig = 'function contextualFixPartNumber(partIndex: number, line: string): number {';
const idx = c.indexOf(funcSig);
if (idx === -1) { console.log('ERROR: not found'); process.exit(1); }

// 找到函数体结束
let depth = 0, started = false, funcEnd = -1;
const bodyStart = c.indexOf('{', idx);
for (let i = bodyStart; i < c.length; i++) {
  if (c[i] === '{') { depth++; started = true; }
  if (c[i] === '}') { depth--; }
  if (started && depth === 0) { funcEnd = i + 1; break; }
}

const newFunc = [
  'function contextualFixPartNumber(partIndex: number, line: string): number {',
  '  // Part I + Listening = Part II',
  '  if (partIndex === 1 && /Listening|Comprehension/i.test(line) && !/Reading/i.test(line)) {',
  '    return 2;',
  '  }',
  '  // Part II + Reading = Part III (解析文件中 Part II 常指 Reading)',
  '  if (partIndex === 2 && /Reading|Comprehension/i.test(line) && !/Listening/i.test(line)) {',
  '    return 3;',
  '  }',
  '  return partIndex;',
  '}',
].join('\n');

c = c.substring(0, idx) + newFunc + c.substring(funcEnd);
fs.writeFileSync(fp, c, 'utf-8');
console.log('Fixed: contextualFixPartNumber now handles Part II + Reading = Part III');
