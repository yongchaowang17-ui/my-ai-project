/**
 * 从 data/新建文件夹 的干净 MinerU MD 文件修复 05区 所有损坏的 Reading 文件
 * 覆盖 2015-2025 全部年份
 */
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = 'D:/my-ai-Project/data/新建文件夹';
const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

/**
 * 从新建文件夹文件名解析信息
 * CET4_2015.06_Set1_纯真题.md → { exam: 'CET4', year: '2015', month: '06', setNum: '1', type: 'question' }
 * CET4_2020.12_Set1_纯解析.md → { exam: 'CET4', year: '2020', month: '12', setNum: '1', type: 'analysis' }
 */
function parseSourceFile(filename) {
  const m = filename.match(/^(CET[46])_(\d{4})\.(\d{2})_Set(\d+)_(.+)\.md$/);
  if (!m) return null;
  const isAnalysis = m[5].includes('解析');
  const isCombined = m[5].includes('真题及解析');
  return {
    exam: m[1], year: m[2], month: m[3], setNum: m[4],
    type: isAnalysis ? 'analysis' : isCombined ? 'combined' : 'question',
    filename,
  };
}

/**
 * 从 Markdown 内容中提取 Part III Reading 部分
 */
function extractReadingSection(content) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s*Part\s*III/i.test(lines[i]) || /^Part\s*III/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#\s*Part\s*IV/i.test(lines[i]) || /^Part\s*IV/i.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

/**
 * 从解析文件中提取 Reading 的解析部分
 */
function extractReadingAnalysis(content) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s*Part\s*III/i.test(lines[i]) || /^Part\s*III/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#\s*Part\s*IV/i.test(lines[i]) || /^Part\s*IV/i.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

/**
 * 检查英文空格丢失
 */
function countBadLines(content) {
  const lines = content.split('\n');
  let bad = 0;
  for (const l of lines) {
    if (l.length > 50 && /[a-zA-Z]{5,}/.test(l) && !l.includes(' ') && !l.startsWith('!') && !l.startsWith('<')) {
      bad++;
    }
  }
  return bad;
}

function main() {
  console.log('=== 从新建文件夹修复 Reading ===\n');

  // 1. 扫描新建文件夹，建立索引
  const sourceFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.md'));
  const sourceIndex = {}; // key: "CET4_2015_06_S1" → { question: path, analysis: path, combined: path }

  for (const file of sourceFiles) {
    const info = parseSourceFile(file);
    if (!info) continue;
    const key = `${info.exam}_${info.year}_${info.month}_S${info.setNum}`;
    if (!sourceIndex[key]) sourceIndex[key] = {};
    sourceIndex[key][info.type] = path.join(SOURCE_DIR, file);
  }

  console.log(`新建文件夹索引: ${Object.keys(sourceIndex).length} 个套卷\n`);

  // 2. 扫描 05区 Reading 文件
  let fixedCount = 0;
  let improvedCount = 0;
  let skippedCount = 0;
  let notFoundCount = 0;
  const results = [];

  for (const exam of ['CET4', 'CET6']) {
    const readingDir = path.join(SYNTHESIS_DIR, exam, 'Reading');
    if (!fs.existsSync(readingDir)) continue;

    const files = fs.readdirSync(readingDir).filter(f => f.endsWith('.md'));
    console.log(`--- ${exam} Reading: ${files.length} files ---`);

    for (const file of files) {
      const m = file.match(/^(CET[46])_(\d{4})_(\d{2})_S(\d+)_Reading\.md$/);
      if (!m) continue;

      const key = `${m[1]}_${m[2]}_${m[3]}_S${m[4]}`;
      const currentPath = path.join(readingDir, file);
      const currentContent = fs.readFileSync(currentPath, 'utf-8');
      const currentBad = countBadLines(currentContent);

      const src = sourceIndex[key];
      if (!src) {
        notFoundCount++;
        continue;
      }

      // 提取 Reading 内容
      let qContent = null;
      let aContent = null;

      // 从 combined 文件提取
      if (src.combined) {
        const raw = fs.readFileSync(src.combined, 'utf-8');
        qContent = extractReadingSection(raw);
      }
      // 从 question 文件提取
      if (!qContent && src.question) {
        const raw = fs.readFileSync(src.question, 'utf-8');
        qContent = extractReadingSection(raw);
      }
      // 从 analysis 文件提取
      if (src.analysis) {
        const raw = fs.readFileSync(src.analysis, 'utf-8');
        aContent = extractReadingAnalysis(raw);
      }

      if (!qContent && !aContent) {
        notFoundCount++;
        results.push({ file, status: 'no_reading' });
        continue;
      }

      // 构建新的 Reading 文件
      const frontmatter = [
        '---',
        `exam: ${m[1]}`,
        `setId: ${key}`,
        `partName: Reading`,
        `type: synthesized`,
        `createdAt: ${new Date().toISOString()}`,
        `sourceFixed: true`,
        '---',
      ].join('\n');

      const parts = [frontmatter, ''];
      if (qContent) parts.push(qContent.trim());
      if (aContent) {
        parts.push('');
        parts.push('---');
        parts.push('');
        parts.push(aContent.trim());
      }

      const newContent = parts.join('\n');
      const newBad = countBadLines(newContent);

      // 只在新文件更好时替换
      if (newBad < currentBad) {
        fs.writeFileSync(currentPath, newContent, 'utf-8');
        fixedCount++;
        results.push({ file, status: 'fixed', oldBad: currentBad, newBad });
      } else if (newBad === 0 && currentBad > 0) {
        fs.writeFileSync(currentPath, newContent, 'utf-8');
        fixedCount++;
        results.push({ file, status: 'fixed', oldBad: currentBad, newBad: 0 });
      } else {
        skippedCount++;
      }
    }
  }

  console.log(`\n=== 修复报告 ===`);
  console.log(`已修复: ${fixedCount}`);
  console.log(`跳过（已更好）: ${skippedCount}`);
  console.log(`无源文件: ${notFoundCount}`);

  const fixed = results.filter(r => r.status === 'fixed');
  if (fixed.length > 0) {
    console.log('\n已修复文件:');
    fixed.forEach(r => console.log(`  ✅ ${r.file} (${r.oldBad}→${r.newBad} bad lines)`));
  }

  fs.writeFileSync(
    path.join('D:/my-ai-Project/data', 'reading-fix-v2-report.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), fixed: fixedCount, skipped: skippedCount, noSource: notFoundCount, details: results }, null, 2),
    'utf-8'
  );
  console.log('\n报告已保存: data/reading-fix-v2-report.json');
}

main();
