/**
 * 精确修复 preview/route.ts
 */
const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// 1. 修复 extractPartNumber: 使用 parseOcrCorruptExtended
c = c.replace(
  /return parseOcrCorrupt\(stripped\);\n\}/,
  `return parseOcrCorruptExtended(stripped);\n}`
);

// 2. 在 parseOcrCorruptExtended 函数后面插入 contextualFixPartNumber
const insertAfter = 'function parseOcrCorruptExtended(text: string): number | null {';
const idx = c.indexOf(insertAfter);
if (idx === -1) {
  console.log('ERROR: parseOcrCorruptExtended not found');
  process.exit(1);
}

// 找到这个函数的结束位置（匹配大括号）
let braceCount = 0;
let funcEnd = -1;
let started = false;
for (let i = idx; i < c.length; i++) {
  if (c[i] === '{') { braceCount++; started = true; }
  if (c[i] === '}') { braceCount--; }
  if (started && braceCount === 0) { funcEnd = i + 1; break; }
}

if (funcEnd === -1) {
  console.log('ERROR: could not find function end');
  process.exit(1);
}

const contextFunc = `

/**
 * 鐗规畩澶勭悊锛氬綋 Part I 鍚庤窡 Listening/Comprehension鏃讹紝瀹為檯鏄 Part II
 */
function contextualFixPartNumber(partIndex: number, line: string): number {
  if (partIndex === 1 && /Listening|Comprehension/i.test(line) && !/Reading/i.test(line)) {
    return 2; // Part I + Listening = Part II
  }
  return partIndex;
}
`;

c = c.slice(0, funcEnd) + contextFunc + c.slice(funcEnd);

// 写入
fs.writeFileSync(fp, c, 'utf-8');

// 验证
const verify = fs.readFileSync(fp, 'utf-8');
console.log('parseOcrCorruptExtended 调用:', verify.includes('return parseOcrCorruptExtended(stripped)'));
console.log('contextualFixPartNumber 定义:', verify.includes('function contextualFixPartNumber'));
console.log('contextualFixPartNumber 调用:', verify.includes('contextualFixPartNumber(pn'));
