const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// Fix 1: Remove premature "return result;" in inferByPosition
c = c.replace(
  '}): Array<{ partIndex: number; lineIndex: number }> {\n  return result;\n  const result:',
  '}): Array<{ partIndex: number; lineIndex: number }> {\n  const result:'
);

// Fix 2: Line 289 type error - need to check what's there
// It's likely an optional chain issue. Let me check.
const lines = c.split('\n');
const line289 = lines[288]; // 0-indexed
console.log('Line 289:', line289);

fs.writeFileSync(fp, c, 'utf-8');
console.log('Applied fixes');
