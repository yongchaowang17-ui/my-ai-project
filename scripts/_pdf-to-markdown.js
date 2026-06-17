/**
 * Step 2: Convert 8 text-based PDFs to Markdown using pdf-parse
 * Write to 03区 + split to 04区
 */
const fs = require('fs');
const p = require('path');
const { PDFParse } = require('pdf-parse');
const { detectAllParts } = require('../lib/part-detector');

const ROOT3 = p.join(process.cwd(), 'data', '03_Exam_Final');
const ROOT4 = p.join(process.cwd(), 'data', '04_Fusion_Area');
const DATA_DIR = p.join(process.cwd(), 'data');
const PART_NAMES = { 1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation' };

const pdfMap = [
  { pdf: '2022.06四级真题第3套.pdf', target03: 'CET4/Question/CET4_2022.06_Set3_纯真题.md', type: 'Question', exam: 'CET4', setId: 'CET4_2022_06_S3' },
  { pdf: '2022.06四级解析第3套.pdf', target03: 'CET4/Analysis/CET4_2022.06_Set3_纯解析.md', type: 'Analysis', exam: 'CET4', setId: 'CET4_2022_06_S3' },
  { pdf: '2022.06六级真题第3套.pdf', target03: 'CET6/Question/CET6_2022.06_Set3_纯真题.md', type: 'Question', exam: 'CET6', setId: 'CET6_2022_06_S3' },
  { pdf: '2022.06六级解析第3套.pdf', target03: 'CET6/Analysis/CET6_2022.06_Set3_纯解析.md', type: 'Analysis', exam: 'CET6', setId: 'CET6_2022_06_S3' },
  { pdf: '2022年12月4级真题 (3).pdf', target03: 'CET4/Question/CET4_2022.12_Set3_纯真题.md', type: 'Question', exam: 'CET4', setId: 'CET4_2022_12_S3' },
  { pdf: '2024年06月六级考试真题答案速查（第1套）.pdf', target03: 'CET6/Analysis/CET6_2024.06_Set1_纯解析.md', type: 'Analysis', exam: 'CET6', setId: 'CET6_2024_06_S1' },
  { pdf: '2024年06月六级考试真题答案速查（第2套）.pdf', target03: 'CET6/Analysis/CET6_2024.06_Set2_纯解析.md', type: 'Analysis', exam: 'CET6', setId: 'CET6_2024_06_S2' },
  { pdf: '2024年06月六级考试真题答案速查（第3套）.pdf', target03: 'CET6/Analysis/CET6_2024.06_Set3_纯解析.md', type: 'Analysis', exam: 'CET6', setId: 'CET6_2024_06_S3' },
];

async function extractPdfText(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  return result.text;
}

function cleanPdfText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

function addFrontmatter(content, exam, setId, type, sourceFile) {
  return `---\nexam: ${exam}\nsetId: ${setId}\ntype: ${type}\nsourceFile: ${sourceFile}\nconvertedAt: '${new Date().toISOString()}'\n---\n\n${content}`;
}

function splitTo04(exam, setId, type, content) {
  const lines = content.split('\n');
  const headers = detectAllParts(lines);
  const side = type === 'Question' ? 'Q' : 'A';
  const targetDir = p.join(ROOT4, exam, setId, type);
  fs.mkdirSync(targetDir, { recursive: true });
  let written = 0;
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].lineIndex;
    const end = i + 1 < headers.length ? headers[i + 1].lineIndex : lines.length;
    const blockContent = lines.slice(start, end).join('\n');
    if (blockContent.trim().length === 0) continue;
    const partIndex = headers[i].partIndex;
    const partName = PART_NAMES[partIndex] || 'Part' + partIndex;
    const filename = `${setId}_${side}_01_${partName}.md`;
    fs.writeFileSync(p.join(targetDir, filename), blockContent, 'utf-8');
    written++;
  }
  return { parts: headers.length, written };
}

async function main() {
  console.log('=== Step 2: PDF to Markdown + Import ===\n');
  const report = { step: 2, timestamp: new Date().toISOString(), converted: [], skipped: [], errors: [] };

  for (const item of pdfMap) {
    const pdfPath = p.join(DATA_DIR, item.pdf);
    if (!fs.existsSync(pdfPath)) { report.skipped.push({ pdf: item.pdf, reason: 'not found' }); continue; }

    try {
      console.log('[CONVERT] ' + item.pdf);
      const text = await extractPdfText(pdfPath);
      if (text.length < 200) {
        report.skipped.push({ pdf: item.pdf, reason: 'too short: ' + text.length + ' chars' });
        console.log('  [WARN] Only ' + text.length + ' chars');
        continue;
      }
      console.log('  Extracted: ' + text.length + ' chars');

      const cleaned = cleanPdfText(text);
      const mdWithFm = addFrontmatter(cleaned, item.exam, item.setId, item.type, item.pdf);

      const target03Abs = p.join(ROOT3, item.target03);
      fs.mkdirSync(p.dirname(target03Abs), { recursive: true });
      fs.writeFileSync(target03Abs, mdWithFm, 'utf-8');
      console.log('  -> 03区: ' + item.target03);

      const splitResult = splitTo04(item.exam, item.setId, item.type, cleaned);
      console.log('  -> 04区: ' + splitResult.written + ' files (' + splitResult.parts + ' parts)');

      report.converted.push({ pdf: item.pdf, target03: item.target03, chars: text.length, parts: splitResult.parts, files04: splitResult.written });
    } catch (err) {
      report.errors.push({ pdf: item.pdf, error: err.message });
      console.log('  [ERROR] ' + err.message);
    }
  }

  const reportPath = p.join(process.cwd(), 'data', 'fix-report-step2.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n=== Done ===');
  console.log('Converted: ' + report.converted.length + ', Skipped: ' + report.skipped.length + ', Errors: ' + report.errors.length);
  console.log('Report: ' + reportPath);
}

main().catch(console.error);
