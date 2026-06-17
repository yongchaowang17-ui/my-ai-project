/**
 * _explore-listening-3.js
 * 统计 Listening 文件中需要切分的数量和结构。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Listening');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));

let needSplit = 0, noNeed = 0, tiny = 0;
const patterns = { hasAnswerKey: 0, hasSectionA: 0, hasSectionB: 0, hasSectionC: 0 };

files.forEach(f => {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (t.length < 1000) { tiny++; return; }
  if (t.length >= 4000) needSplit++;
  else noNeed++;
  if (t.includes('**答案键**')) patterns.hasAnswerKey++;
  if (/\n# SectionA\b/.test(t)) patterns.hasSectionA++;
  if (/\n# SectionB\b/.test(t)) patterns.hasSectionB++;
  if (/\n# SectionC\b/.test(t)) patterns.hasSectionC++;
});

console.log('Total files:', files.length);
console.log('Tiny (<1K, skip):', tiny);
console.log('Need split (>=4K):', needSplit);
console.log('No need (<4K):', noNeed);
console.log('\nPattern counts:');
console.log('  has **答案键**:', patterns.hasAnswerKey);
console.log('  has # SectionA:', patterns.hasSectionA);
console.log('  has # SectionB:', patterns.hasSectionB);
console.log('  has # SectionC:', patterns.hasSectionC);

// 检查所有文件的 section 标题变体
console.log('\n=== Section header variants ===');
const headerVariants = new Map();
files.forEach(f => {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  const lines = t.split('\n');
  lines.forEach(l => {
    const tr = l.trim();
    if (/^#\s*Section/i.test(tr) && tr.length < 80) {
      const key = tr.substring(0, 60);
      headerVariants.set(key, (headerVariants.get(key) || 0) + 1);
    }
  });
});
[...headerVariants.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log('  ' + v + 'x: ' + k);
});
