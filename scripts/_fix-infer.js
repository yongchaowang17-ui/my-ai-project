/**
 * 清理 inferPartsByKeywords 中的重复代码块
 * 策略：找到函数起止位置，用干净的版本替换
 */
const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// 找到 inferPartsByKeywords 函数的起止
const funcStart = c.indexOf('function inferPartsByKeywords(');
const funcBodyStart = c.indexOf('{', funcStart);

// 找到函数结束（匹配大括号）
let depth = 0;
let funcEnd = -1;
let started = false;
for (let i = funcBodyStart; i < c.length; i++) {
  if (c[i] === '{') { depth++; started = true; }
  if (c[i] === '}') { depth--; }
  if (started && depth === 0) { funcEnd = i + 1; break; }
}

if (funcEnd === -1) {
  console.log('ERROR: could not find inferPartsByKeywords function end');
  process.exit(1);
}

const oldFunc = c.substring(funcStart, funcEnd);
console.log('Found inferPartsByKeywords: lines', c.substring(0, funcStart).split('\n').length, 'to', c.substring(0, funcEnd).split('\n').length);

// 构建干净的函数
const newFunc = `function inferPartsByKeywords(
  lines: string[], foundParts: Set<number>
): Array<{ partIndex: number; lineIndex: number }> {
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
      // 方式1: # Listening 标题
      if (/^#{1,4}\\s+(?:Part\\s+II\\s+)?Listening/i.test(lines[i])) {
        result.push({ partIndex: 2, lineIndex: i }); foundParts.add(2); break;
      }
      // 方式2: Section A + Directions 含听力关键词
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
      // 方式1: Reading Comprehension 标题
      if (/Reading\\s+Comprehension/i.test(lines[i]) && /^#{1,4}\\s/.test(lines[i])) {
        result.push({ partIndex: 3, lineIndex: i }); foundParts.add(3); break;
      }
      // 方式2: 第二个 Section A（Reading 的 Section A）
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

c = c.substring(0, funcStart) + newFunc + c.substring(funcEnd);

fs.writeFileSync(fp, c, 'utf-8');

// 验证
const verify = fs.readFileSync(fp, 'utf-8');
const newFuncEnd = verify.indexOf('function inferPartsByKeywords(');
const newBodyStart = verify.indexOf('{', newFuncEnd);
let d2 = 0, s2 = false, fe2 = -1;
for (let i = newBodyStart; i < verify.length; i++) {
  if (verify[i] === '{') { d2++; s2 = true; }
  if (verify[i] === '}') { d2--; }
  if (s2 && d2 === 0) { fe2 = i + 1; break; }
}
const newLines = verify.substring(0, fe2).split('\n').length;
console.log('New function ends at line', newLines);
console.log('Section A occurrences in new function:', (verify.substring(newFuncStart, fe2).match(/Section\\s*A/g) || []).length);
console.log('Total file lines:', verify.split('\n').length);
