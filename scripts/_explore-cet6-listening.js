/**
 * _explore-cet6-listening.js
 * 深度探查 CET6 Listening 文件结构，识别错位模式。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET6', 'Listening');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));

// 分类
const tiny = [], small = [], medium = [], large = [];
files.forEach(f => {
  const len = fs.readFileSync(path.join(DIR, f), 'utf8').length;
  if (len < 200) tiny.push(f);
  else if (len < 6000) small.push(f);
  else if (len < 25000) medium.push(f);
  else large.push(f);
});

console.log('Tiny (<200):', tiny.length);
console.log('Small (200-6K):', small.length);
console.log('Medium (6K-25K):', medium.length);
console.log('Large (>25K):', large.length);

// 抽样大文件结构
console.log('\n=== LARGE FILE STRUCTURES ===');
large.slice(0, 5).forEach(f => {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  const lines = t.split('\n');
  console.log('\n--- ' + f + ' (' + t.length + 'ch, ' + lines.length + ' lines) ---');
  lines.forEach((l, i) => {
    const tr = l.trim();
    if (tr.startsWith('#') && tr.length < 100) {
      console.log('  L' + String(i + 1).padStart(3) + ': ' + tr.substring(0, 90));
    }
  });
});

// 检查是否有已有的 CHUNK-SPLIT 标记
let withMarkers = 0;
files.forEach(f => {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (t.includes('CHUNK-SPLIT')) withMarkers++;
});
console.log('\nFiles with existing CHUNK-SPLIT markers:', withMarkers);
