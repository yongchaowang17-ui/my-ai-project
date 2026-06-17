const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// Fix: replace broken return type "Array<{" with correct one
c = c.replace(
  '): Array<{\n  const result:',
  '): Array<{ partIndex: number; lineIndex: number }> {\n  const result:'
);

fs.writeFileSync(fp, c, 'utf-8');
console.log('Fixed return type');

// Verify
const v = fs.readFileSync(fp, 'utf-8');
const lines = v.split('\n');
console.log('Line 156:', lines[155]);
console.log('Line 157:', lines[156]);
