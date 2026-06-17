/**
 * 检查特定文件的 Part 标题和关键词位置
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const base = path.join(__dirname, '..', 'data', '03_Exam_Final');

const cases = [
  // 缺 Part 2: Writing OK, Reading OK, Translation OK, 但 Listening 缺失
  { rel: 'CET4/Question/2020_12_S3_Q_01.md', label: '缺P2 CET4' },
  { rel: 'CET4/Question/2021_06_S3_Q_01.md', label: '缺P2 CET4' },
  // 缺 Part 1: Listening OK, Reading OK, Translation OK, 但 Writing 缺失
  { rel: 'CET6/Question/2018_12_S1_Q_01.md', label: '缺P1 CET6' },
  { rel: 'CET6/Question/2019_06_S1_Q_01.md', label: '缺P1 CET6' },
  // 缺 Part 3: Writing OK, Listening OK, Translation OK, 但 Reading 缺失
  { rel: 'CET4/Question/2015_06_S1_Q_01.md', label: '缺P3 CET4' },
  { rel: 'CET6/Question/2015_06_S1_Q_01.md', label: '缺P3 CET6' },
  // 缺 P1+P2
  { rel: 'CET6/Question/2019_06_S3_Q_01.md', label: '缺P1+P2 CET6' },
];

for (const { rel, label } of cases) {
  const fp = path.join(base, rel);
  const raw = fs.readFileSync(fp, 'utf-8');
  const { content } = matter(raw);
  const lines = content.split('\n');
  
  console.log(`=== ${label} | ${path.basename(rel)} (${lines.length}行) ===`);
  
  // 找所有标题行和关键词
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const isHeader = /^#{1,4}\s/.test(l);
    const isPart = /Part\s*(I{1,3}|IV|V|\d)/i.test(l);
    const isSection = /Section\s*[A-C]/i.test(l);
    const isDirections = /Directions/i.test(l);
    const isWriting = /Writing/i.test(l);
    const isReading = /Reading/i.test(l);
    const isTranslation = /Translation/i.test(l);
    const isListening = /Listening/i.test(l);
    
    if (isHeader || isPart || isSection || isDirections || isWriting || isReading || isTranslation || isListening) {
      const tags = [];
      if (isPart) tags.push('PART');
      if (isSection) tags.push('SECTION');
      if (isWriting) tags.push('WRITING');
      if (isListening) tags.push('LISTENING');
      if (isReading) tags.push('READING');
      if (isTranslation) tags.push('TRANSLATION');
      if (isDirections) tags.push('DIRECTIONS');
      console.log(`  L${String(i+1).padStart(3)} [${tags.join(',')}] ${l.substring(0, 90)}`);
    }
  }
  console.log('');
}
