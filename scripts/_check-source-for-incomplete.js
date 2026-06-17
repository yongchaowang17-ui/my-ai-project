/**
 * 检查不完整 SetId 对应的 03 区源文件是否存在、内容是否完整
 */
const fs = require('fs');
const p = require('path');

const ROOT3 = 'data/03_Exam_Final';
const ROOT4 = 'data/04_Fusion_Area';

// 所有不完整的 SetId
const incomplete = [
  { sid: 'CET4_2022_12_S2', exam: 'CET4', missing: ['Q:W','Q:L','Q:R','Q:T'] },
  { sid: 'CET4_2022_12_S3', exam: 'CET4', missing: ['Q:W','Q:L','Q:R','Q:T'] },
  { sid: 'CET4_2024_12_S3', exam: 'CET4', missing: ['Q:W','Q:L','A:W','A:L','A:R','A:T'] },
  { sid: 'CET6_2024_06_S1', exam: 'CET6', missing: ['A:W','A:L','A:R','A:T'] },
  { sid: 'CET6_2024_06_S2', exam: 'CET6', missing: ['A:W','A:L','A:R','A:T'] },
  { sid: 'CET6_2024_06_S3', exam: 'CET6', missing: ['A:W','A:L','A:R','A:T'] },
  { sid: 'CET4_2021_06_S3', exam: 'CET4', missing: ['Q:R'] },
  { sid: 'CET4_2021_12_S2', exam: 'CET4', missing: ['Q:R'] },
  { sid: 'CET6_2015_06_S1', exam: 'CET6', missing: ['Q:R'] },
  { sid: 'CET6_2015_12_S1', exam: 'CET6', missing: ['Q:R'] },
  { sid: 'CET6_2017_06_S2', exam: 'CET6', missing: ['Q:R'] },
  { sid: 'CET6_2025_06_S1', exam: 'CET6', missing: ['Q:W'] },
];

function findSourceFile(exam, ty, sid) {
  const dir = p.join(ROOT3, exam, ty);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  // Extract year_month_set from sid
  const parts = sid.split('_');
  const yearMonth = parts.slice(1, 3).join('_'); // 2022_12
  const setNum = parts[3]; // S2
  for (const f of files) {
    const m = f.match(/^(\d{4}_\d{2}_S(\d+))_/);
    if (m) {
      const fYM = m[1].split('_').slice(0, 2).join('_');
      const fSet = 'S' + m[2];
      if (fYM === yearMonth && fSet === setNum) return p.join(dir, f);
    }
  }
  // Fallback: legacy naming
  const ym = yearMonth.replace('_', '.');
  const setLetter = setNum.replace('S', '');
  for (const f of files) {
    if (f.includes(ym) && f.includes(setLetter)) return p.join(dir, f);
  }
  return null;
}

for (const item of incomplete) {
  console.log(`\n=== ${item.sid} ===`);
  console.log(`  缺失: ${item.missing.join(', ')}`);

  for (const ty of ['Question', 'Analysis']) {
    const src = findSourceFile(item.exam, ty, item.sid);
    if (!src) {
      console.log(`  [${ty}] 源文件: 不存在`);
      continue;
    }
    const raw = fs.readFileSync(src, 'utf-8');
    const lines = raw.split('\n');
    const headings = [];
    lines.forEach((l, i) => {
      if (/^#\s/.test(l) && /(Part|Section|Writing|Listening|Reading|Translation)/i.test(l)) {
        headings.push({ line: i + 1, text: l.substring(0, 80) });
      }
    });
    console.log(`  [${ty}] 源文件: ${p.basename(src)} (${lines.length} lines)`);
    headings.forEach(h => console.log(`    L${h.line}: ${h.text}`));
  }
}
