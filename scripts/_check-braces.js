const fs = require('fs');
const c = fs.readFileSync('D:/my-ai-Project/app/api/decompose/preview/route.ts', 'utf-8');
let depth = 0;
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth < 0) {
    console.log('Brace underflow at line ' + (i + 1) + ': depth=' + depth);
    console.log('  Line: ' + lines[i].substring(0, 80));
    break;
  }
}
console.log('Final depth:', depth);
