/**
 * _explore-listening.js
 * 探查 05 区 Listening 文件结构。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Listening');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));

console.log('Total files:', files.length);

// 分类统计
const small = [], medium = [], large = [];
files.forEach(f => {
  const len = fs.readFileSync(path.join(DIR, f), 'utf8').length;
  if (len < 1000) small.push({ f, len });
  else if (len < 20000) medium.push({ f, len });
  else large.push({ f, len });
});

console.log('\nSmall (<1K):', small.length);
small.forEach(s => console.log('  ', s.f, s.len + 'ch'));

console.log('\nMedium (1K-20K):', medium.length);
medium.forEach(s => console.log('  ', s.f, s.len + 'ch'));

console.log('\nLarge (>20K):', large.length);
large.forEach(s => console.log('  ', s.f, s.len + 'ch'));

// 抽样查看结构
console.log('\n=== SAMPLE STRUCTURES ===');
const samples = ['CET4_2015_06_S1_Listening.md', 'CET4_2019_12_S1_Listening.md', 'CET4_2024_06_S1_Listening.md', 'CET4_2018_12_S3_Listening.md', 'CET4_2019_06_S3_Listening.md'];
samples.forEach(f => {
  const fp = path.join(DIR, f);
  if (!fs.existsSync(fp)) return;
  const t = fs.readFileSync(fp, 'utf8');
  console.log('\n--- ' + f + ' (' + t.length + 'ch) ---');
  const lines = t.split('\n');
  lines.forEach((l, i) => {
    if (l.trim().startsWith('#') || l.includes('答案键') || l.trim().startsWith('**答')) {
      console.log('  L' + (i + 1) + ': ' + l.substring(0, 100));
    }
  });
});
