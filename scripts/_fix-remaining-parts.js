/**
 * Step 1: Fix 20 detection-failure SetIds using enhanced detection
 * Output: data/fix-report-step1.json
 */
const fs = require('fs');
const p = require('path');
const { detectAllParts } = require('../lib/part-detector');

const ROOT3 = p.join(process.cwd(), 'data', '03_Exam_Final');
const ROOT4 = p.join(process.cwd(), 'data', '04_Fusion_Area');
const PART_NAMES = { 1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation' };

const gapList = [
  { sid: 'CET6_2015_06_S1', exam: 'CET6', ty: 'Question', yearMonth: '2015_06', set: 'S1', missingParts: [3] },
  { sid: 'CET6_2015_12_S1', exam: 'CET6', ty: 'Question', yearMonth: '2015_12', set: 'S1', missingParts: [3] },
  { sid: 'CET6_2017_06_S2', exam: 'CET6', ty: 'Question', yearMonth: '2017_06', set: 'S2', missingParts: [3] },
  { sid: 'CET4_2021_06_S3', exam: 'CET4', ty: 'Question', yearMonth: '2021_06', set: 'S3', missingParts: [3] },
  { sid: 'CET4_2021_12_S2', exam: 'CET4', ty: 'Question', yearMonth: '2021_12', set: 'S2', missingParts: [3] },
  { sid: 'CET4_2022_12_S2', exam: 'CET4', ty: 'Question', yearMonth: '2022_12', set: 'S2', missingParts: [1, 2, 3, 4] },
  { sid: 'CET4_2024_12_S2', exam: 'CET4', ty: 'Question', yearMonth: '2024_12', set: 'S2', missingParts: [1] },
  { sid: 'CET4_2018_12_S2', exam: 'CET4', ty: 'Analysis', yearMonth: '2018_12', set: 'S2', missingParts: [1] },
  { sid: 'CET6_2020_12_S2', exam: 'CET6', ty: 'Analysis', yearMonth: '2020_12', set: 'S2', missingParts: [3] },
  { sid: 'CET6_2021_12_S2', exam: 'CET6', ty: 'Analysis', yearMonth: '2021_12', set: 'S2', missingParts: [3] },
  { sid: 'CET6_2025_06_S1', exam: 'CET6', ty: 'Question', yearMonth: '2025_06', set: 'S1', missingParts: [1] },
  { sid: 'CET6_2024_12_S3', exam: 'CET6', ty: 'Question', yearMonth: '2024_12', set: 'S3', missingParts: [1, 2, 3] },
  { sid: 'CET4_2018_12_S3', exam: 'CET4', ty: 'Analysis', yearMonth: '2018_12', set: 'S3', missingParts: [1] },
  { sid: 'CET6_2018_12_S3', exam: 'CET6', ty: 'Analysis', yearMonth: '2018_12', set: 'S3', missingParts: [2] },
];

function findSourceFile(exam, ty, yearMonth, set) {
  const dir = p.join(ROOT3, exam, ty);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const m = f.match(/^(\d{4}_\d{2}_S(\d+))_/);
    if (m) {
      const fYM = m[1].split('_').slice(0, 2).join('_');
      const fSet = 'S' + m[2];
      if (fYM === yearMonth && fSet === set) return p.join(dir, f);
    }
  }
  const ym = yearMonth.replace('_', '.');
  const setLetter = set.replace('S', '');
  for (const f of files) {
    if (f.includes(ym) && f.includes(setLetter)) return p.join(dir, f);
  }
  return null;
}

function stripFrontmatter(content) {
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) return content.substring(endIdx + 3).trim();
  }
  return content;
}

function main() {
  console.log('=== Step 1: Fix detection failures ===\n');
  const report = { step: 1, timestamp: new Date().toISOString(), fixed: [], skipped: [] };
  let totalWritten = 0;

  for (const item of gapList) {
    const srcPath = findSourceFile(item.exam, item.ty, item.yearMonth, item.set);
    if (!srcPath) {
      report.skipped.push({ sid: item.sid, ty: item.ty, reason: 'source not found' });
      console.log('[SKIP] ' + item.sid + ' [' + item.ty + '] - source not found');
      continue;
    }

    const raw = fs.readFileSync(srcPath, 'utf-8');
    const content = stripFrontmatter(raw);
    const lines = content.split('\n');

    const headers = detectAllParts(lines);
    const side = item.ty === 'Question' ? 'Q' : 'A';
    const targetDir = p.join(ROOT4, item.exam, item.sid, item.ty);
    fs.mkdirSync(targetDir, { recursive: true });

    const written = [];
    for (const h of headers) {
      if (!item.missingParts.includes(h.partIndex)) continue;
      const idx = headers.indexOf(h);
      const start = h.lineIndex;
      const end = idx + 1 < headers.length ? headers[idx + 1].lineIndex : lines.length;
      const blockContent = lines.slice(start, end).join('\n');
      if (blockContent.trim().length === 0) continue;

      const partName = PART_NAMES[h.partIndex] || 'Part' + h.partIndex;
      const filename = item.sid + '_' + side + '_01_' + partName + '.md';
      fs.writeFileSync(p.join(targetDir, filename), blockContent, 'utf-8');
      written.push({ partIndex: h.partIndex, partName, filename, lineCount: end - start, byteLength: Buffer.byteLength(blockContent, 'utf-8') });
      totalWritten++;
    }

    if (written.length > 0) {
      report.fixed.push({ sid: item.sid, exam: item.exam, ty: item.ty, source: p.basename(srcPath), written });
      console.log('[OK] ' + item.sid + ' [' + item.ty + '] - wrote ' + written.length + ' files');
      written.forEach(w => console.log('  ' + w.filename + ' (' + w.lineCount + ' lines)'));
    } else {
      report.skipped.push({ sid: item.sid, ty: item.ty, reason: 'enhanced detection still failed' });
      console.log('[SKIP] ' + item.sid + ' [' + item.ty + '] - detection still failed');
    }
  }

  const reportPath = p.join(process.cwd(), 'data', 'fix-report-step1.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n=== Done ===');
  console.log('Fixed: ' + report.fixed.length + ' SetIds, ' + totalWritten + ' files');
  console.log('Skipped: ' + report.skipped.length);
  console.log('Report: ' + reportPath);
}

main();
