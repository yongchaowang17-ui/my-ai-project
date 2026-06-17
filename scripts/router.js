// Fixed router.js with more precise classification
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const ROUTING_DIR = path.join(ROOT, 'data', 'routing');

const CATEGORIES = ['multi_set', 'mixed', 'raw_questions', 'raw_analysis', 'uncategorized'];

/**
 * Improved classification:
 *
 * - Question numbers: \d+[.、] followed by letter choices (A/B/C/D) — this is a real question
 * - Analysis sections: 答案/解析/详解 appearing as section headers or in bulk,
 *   NOT just "Answer Sheet" in instructions
 * - Multi-set: 3+ Part headers
 */

function classifyFile(content) {
  // 1. Check for multi-set (3+ Part headers)
  const partMatches = content.match(/^Part\s+(I{1,3}|IV|V|1|2|3|4|5)/gmi) || [];
  if (partMatches.length >= 3) return 'multi_set';

  // 2. Check for real question numbers: digit + dot + letter choice
  //    Pattern: "1.A)" or "1. A）" or "1、A)" etc.
  const questionPattern = /\d+[.、]\s*[A-D][)）]/g;
  const questionMatches = content.match(questionPattern) || [];
  const hasQuestions = questionMatches.length >= 3; // require at least 3 questions

  // 3. Check for analysis/answer sections (not just instruction mentions)
  //    Look for: 答案与详解, 参考答案, 答案及解析, or 答案/解析 appearing as section headers
  //    Also count bulk occurrences of 解析/答案 as standalone words
  const analysisSectionPattern = /[#＃]\s*(答案|解析|详解|参考范文|Answer\s*Key|参考答案|答案与详解|答案及解析)/gi;
  const analysisSections = content.match(analysisSectionPattern) || [];

  // Also check for answer/analysis content appearing in bulk (not just instructions)
  const answerBlockPattern = /(?:^|\n)\s*(?:【?\d+】?\s*)?(?:答案|解析|详解)\s*[：:]/gm;
  const answerBlocks = content.match(answerBlockPattern) || [];

  // Check for "纯解析" style content: analysis sections + answer blocks
  const hasAnalysis = analysisSections.length >= 2 || answerBlocks.length >= 3;

  if (hasQuestions && hasAnalysis) return 'mixed';
  if (hasQuestions) return 'raw_questions';
  if (hasAnalysis) return 'raw_analysis';
  return 'uncategorized';
}

function ensureDirs() {
  for (const cat of CATEGORIES) {
    const dir = path.join(ROUTING_DIR, cat);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function safeMove(src, dest) {
  if (fs.existsSync(dest)) {
    const ext = path.extname(dest);
    const base = path.basename(dest, ext);
    let counter = 1;
    while (fs.existsSync(dest)) {
      dest = path.join(path.dirname(dest), base + '_' + counter + ext);
      counter++;
    }
  }
  fs.renameSync(src, dest);
  return dest;
}

function run(dryRun = false) {
  if (!fs.existsSync(RAW_DIR)) {
    console.error('Error: raw directory not found:', RAW_DIR);
    process.exit(1);
  }

  if (!dryRun) ensureDirs();

  const mdFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.md')).sort();
  if (mdFiles.length === 0) {
    console.log('No .md files found in', RAW_DIR);
    return;
  }

  console.log('Found', mdFiles.length, '.md files in', RAW_DIR);
  console.log('Mode:', dryRun ? 'DRY RUN' : 'LIVE');
  console.log('='.repeat(60));

  const stats = {};
  for (const cat of CATEGORIES) stats[cat] = [];

  for (const filename of mdFiles) {
    const srcPath = path.join(RAW_DIR, filename);
    let content;
    try {
      content = fs.readFileSync(srcPath, 'utf-8');
    } catch (e) {
      console.log('  [ERROR] Cannot read:', filename, e.message);
      stats['uncategorized'].push(filename);
      continue;
    }

    const category = classifyFile(content);
    const destPath = path.join(ROUTING_DIR, category, filename);

    if (dryRun) {
      console.log('  [DRY]', filename, '->', category + '/');
    } else {
      const finalPath = safeMove(srcPath, destPath);
      console.log('  [MOVE]', filename, '->', category + '/' + path.basename(finalPath));
    }

    stats[category].push(filename);
  }

  console.log('='.repeat(60));
  console.log('Classification Summary:');
  console.log('-'.repeat(60));
  let total = 0;
  for (const cat of CATEGORIES) {
    const count = stats[cat].length;
    total += count;
    console.log('  ' + cat.padEnd(20) + ': ' + String(count).padStart(3) + ' files');
  }
  console.log('-'.repeat(60));
  console.log('  ' + 'TOTAL'.padEnd(20) + ': ' + String(total).padStart(3) + ' files');
  console.log('='.repeat(60));
}

const dryRun = process.argv.includes('--dry-run');
run(dryRun);
