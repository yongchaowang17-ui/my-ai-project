/**
 * _explore-listening-2.js
 * 深入探查 Listening 文件的结构标记。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Listening');

const samples = [
  'CET4_2015_06_S1_Listening.md',
  'CET4_2018_12_S1_Listening.md',
  'CET4_2019_12_S1_Listening.md',
  'CET4_2024_06_S1_Listening.md',
  'CET4_2025_06_S1_Listening.md',
  'CET4_2024_12_S2_Listening.md',
  'CET4_2019_06_S1_Listening.md',
];

samples.forEach(f => {
  const fp = path.join(DIR, f);
  if (!fs.existsSync(fp)) return;
  const t = fs.readFileSync(fp, 'utf8');
  const lines = t.split('\n');
  console.log('\n=== ' + f + ' (' + t.length + 'ch, ' + lines.length + ' lines) ===');
  lines.forEach((l, i) => {
    const tr = l.trim();
    if (tr.startsWith('#') || tr.includes('答案键') || tr.startsWith('**答') || tr.startsWith('1.') || tr.startsWith('A)') || tr.startsWith('A．')) {
      console.log('  L' + String(i + 1).padStart(3) + ': ' + l.substring(0, 100));
    }
  });
});
