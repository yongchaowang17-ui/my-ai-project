/**
 * 检查缺失Part的源文件，判断是真缺失还是检测遗漏
 */
const fs = require('fs');
const path = require('path');

const ROOT3 = path.join(process.cwd(), 'data', '03_Exam_Final');

// 所有缺失Part的文件
const missingParts = [
  // 缺Reading的Question
  { sid: 'CET4_2021_06_S3', ty: 'Question', yearMonth: '2021_06', set: 'S3' },
  { sid: 'CET4_2021_12_S2', ty: 'Question', yearMonth: '2021_12', set: 'S2' },
  { sid: 'CET6_2015_06_S1', ty: 'Question', yearMonth: '2015_06', set: 'S1' },
  { sid: 'CET6_2015_12_S1', ty: 'Question', yearMonth: '2015_12', set: 'S1' },
  { sid: 'CET6_2017_06_S2', ty: 'Question', yearMonth: '2017_06', set: 'S2' },
  { sid: 'CET6_2017_12_S3', ty: 'Question', yearMonth: '2017_12', set: 'S3' },
  { sid: 'CET6_2018_06_S3', ty: 'Question', yearMonth: '2018_06', set: 'S3' },
  // 缺Writing的Question
  { sid: 'CET4_2024_12_S2', ty: 'Question', yearMonth: '2024_12', set: 'S2' },
  { sid: 'CET4_2024_12_S3', ty: 'Question', yearMonth: '2024_12', set: 'S3' },
  { sid: 'CET6_2025_06_S1', ty: 'Question', yearMonth: '2025_06', set: 'S1' },
  // 缺Listening的Question
  { sid: 'CET4_2022_06_S3', ty: 'Question', yearMonth: '2022_06', set: 'S3' },
  { sid: 'CET6_2022_06_S3', ty: 'Question', yearMonth: '2022_06', set: 'S3' },
  { sid: 'CET6_2024_12_S3', ty: 'Question', yearMonth: '2024_12', set: 'S3' },
  { sid: 'CET6_2025_06_S3', ty: 'Question', yearMonth: '2025_06', set: 'S3' },
  // 缺Listening的Analysis（取几个典型）
  { sid: 'CET4_2018_12_S3', ty: 'Analysis', yearMonth: '2018_12', set: 'S3' },
  { sid: 'CET6_2018_12_S3', ty: 'Analysis', yearMonth: '2018_12', set: 'S3' },
];

function findSourceFile(exam, ty, yearMonth, set) {
  const dir = path.join(ROOT3, exam, ty);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  
  // Match by standard naming: {year}_{month}_{set}_...
  const setLetter = set.replace('S', '');
  for (const f of files) {
    const m = f.match(/^(\d{4}_\d{2}_S(\d+))_/);
    if (m) {
      const fYearMonth = m[1].split('_').slice(0, 2).join('_');
      const fSet = 'S' + m[2];
      if (fYearMonth === yearMonth && fSet === set) return path.join(dir, f);
    }
  }
  // Fallback: match by year.month pattern
  const ym = yearMonth.replace('_', '.');
  for (const f of files) {
    if (f.includes(ym) && f.includes(setLetter)) return path.join(dir, f);
  }
  return null;
}

function analyzeFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  
  // Find all Part-related and Section headings
  const relevantHeadings = [];
  lines.forEach((l, i) => {
    if (/^#\s*(Part\s*(I{1,3}|IV|V|\d|[Ⅰ-Ⅴ]|H|K|N|F|W)|Section\s+[A-C]|Writing|Listening|Reading|Translation|Comprehension)/i.test(l)) {
      relevantHeadings.push({ line: i + 1, text: l.substring(0, 80) });
    }
  });
  
  // Check for key content indicators
  const hasListeningContent = /(?:hear|listen|conversation|passage.*heard|news report|Section\s*A[\s\S]{0,200}(?:hear|listen))/i.test(raw);
  const hasReadingContent = /(?:Reading\s+Comprehension|passage.*ten\s+blanks|Section\s+A[\s\S]{0,200}(?:blanks|passage))/i.test(raw);
  const hasWritingContent = /(?:Directions.*write|essay|submission|inviting|proposal)/i.test(raw);
  const hasTranslationContent = /(?:translate.*passage.*Chinese|Translation)/i.test(raw);
  
  return {
    lines: lines.length,
    headings: relevantHeadings,
    contentIndicators: {
      listening: hasListeningContent,
      reading: hasReadingContent,
      writing: hasWritingContent,
      translation: hasTranslationContent,
    },
  };
}

// 主逻辑
const exam = 'CET4';
console.log('=== 检查缺失Part的源文件 ===\n');

for (const item of missingParts) {
  const exam = item.sid.startsWith('CET4') ? 'CET4' : 'CET6';
  const src = findSourceFile(exam, item.ty, item.yearMonth, item.set);
  if (!src) {
    console.log(`[NOT FOUND] ${item.sid} / ${item.ty}`);
    continue;
  }
  
  const info = analyzeFile(src, item.sid);
  const missing = [];
  if (!info.contentIndicators.writing) missing.push('Writing');
  if (!info.contentIndicators.listening) missing.push('Listening');
  if (!info.contentIndicators.reading) missing.push('Reading');
  if (!info.contentIndicators.translation) missing.push('Translation');
  
  const status = missing.length === 0 ? 'OK' : 'MISSING';
  console.log(`[${status}] ${item.sid} [${item.ty}] (${info.lines} lines)`);
  console.log(`  文件: ${path.basename(src)}`);
  console.log(`  内容指标: W=${info.contentIndicators.writing} L=${info.contentIndicators.listening} R=${info.contentIndicators.reading} T=${info.contentIndicators.translation}`);
  if (missing.length > 0) console.log(`  缺失: ${missing.join(', ')}`);
  console.log(`  关键标题:`);
  info.headings.forEach(h => console.log(`    L${h.line}: ${h.text}`));
  console.log('');
}
