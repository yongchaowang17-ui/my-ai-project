/**
 * 比对 03_Exam_Final 与 04_Fusion_Area，找出未导入的文件
 * 支持三种 03区命名格式：
 *   A: 2015_06_S1_Q_01.md (2015-2021)
 *   B: CET4_2021.12_Set1_纯真题.md (2021.12-2025)
 *   C: CET4_2024_06_Set1_纯真题.md (2024+)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AREA03 = path.join(ROOT, 'data', '03_Exam_Final');
const AREA04 = path.join(ROOT, 'data', '04_Fusion_Area');

function scanFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanFiles(fullPath, ext));
    } else if (!ext || entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 从 03区文件路径提取标准 SetId
 * 返回格式: CET4_2015_06_S1
 */
function extractSetId(filePath, examLevel) {
  const filename = path.basename(filePath, '.md');
  
  // Pattern A: 2015_06_S1_Q_01.md
  const matchA = filename.match(/^(\d{4}_\d{2}_S\d)/);
  if (matchA) return `${examLevel}_${matchA[1]}`;
  
  // Pattern B: CET4_2021.12_Set1_纯真题.md (dots in year.month)
  const matchB = filename.match(/^CET(\d)_(\d{4})\.(\d{2})_Set(\d)/);
  if (matchB) return `CET${matchB[1]}_${matchB[2]}_${matchB[3]}_S${matchB[4]}`;
  
  // Pattern C: CET4_2024_06_Set1_纯真题.md (underscores)
  const matchC = filename.match(/^CET(\d)_(\d{4})_(\d{2})_Set(\d)/);
  if (matchC) return `CET${matchC[1]}_${matchC[2]}_${matchC[3]}_S${matchC[4]}`;
  
  return null;
}

// ========== 扫描 03区 ==========
const files03 = scanFiles(AREA03, '.md');
const setMap = {}; // setId -> { question: [], analysis: [] }

for (const filePath of files03) {
  const rel = path.relative(AREA03, filePath);
  const parts = rel.split(path.sep);
  const examLevel = parts[0]; // CET4 or CET6
  const type = parts[1]; // Question or Analysis
  const filename = parts[2];
  
  const setId = extractSetId(filePath, examLevel);
  if (!setId) {
    console.log(`[WARN] 无法提取 SetId: ${rel}`);
    continue;
  }
  
  if (!setMap[setId]) setMap[setId] = { question: [], analysis: [] };
  if (type === 'Question') {
    setMap[setId].question.push({ filename, path: filePath });
  } else if (type === 'Analysis') {
    setMap[setId].analysis.push({ filename, path: filePath });
  }
}

// ========== 扫描 04区 ==========
const files04 = scanFiles(AREA04, '.md');
const files04Map = {}; // setId -> { question: Set, analysis: Set }

for (const filePath of files04) {
  const rel = path.relative(AREA04, filePath);
  const parts = rel.split(path.sep);
  const examLevel = parts[0]; // CET4 or CET6
  const setId = parts[1]; // CET4_2015_06_S1
  const type = parts[2]; // Question or Analysis
  const partFile = parts[3]; // Part1_Writing.md
  
  if (!files04Map[setId]) files04Map[setId] = { question: new Set(), analysis: new Set() };
  if (type === 'Question') files04Map[setId].question.add(partFile);
  else if (type === 'Analysis') files04Map[setId].analysis.add(partFile);
}

const setIds04 = new Set(Object.keys(files04Map));

// ========== 交叉比对 ==========
const allSetIds = Object.keys(setMap).sort();
const missing = [];       // 完全未导入
const incomplete = [];    // Part不完整
const complete = [];      // 完整

const EXPECTED_PARTS = ['Part1_Writing.md', 'Part2_Listening.md', 'Part3_Reading.md', 'Part4_Translation.md'];

for (const setId of allSetIds) {
  const info = setMap[setId];
  const in04 = files04Map[setId];
  
  if (!in04) {
    missing.push({
      setId,
      questionFiles: info.question.map(f => f.filename),
      analysisFiles: info.analysis.map(f => f.filename),
    });
    continue;
  }
  
  // 检查 Part 完整性
  let qMissing = [];
  let aMissing = [];
  
  for (const expected of EXPECTED_PARTS) {
    if (!in04.question.has(expected)) qMissing.push(expected);
    if (!in04.analysis.has(expected)) aMissing.push(expected);
  }
  
  if (qMissing.length > 0 || aMissing.length > 0) {
    incomplete.push({
      setId,
      questionFiles: info.question.map(f => f.filename),
      analysisFiles: info.analysis.map(f => f.filename),
      qParts: Array.from(in04.question).sort(),
      aParts: Array.from(in04.analysis).sort(),
      qMissing,
      aMissing,
    });
  } else {
    complete.push({ setId });
  }
}

// ========== 统计输出 ==========
console.log('');
console.log('╔══════════════════════════════════════╗');
console.log('║   03区 vs 04区 比对报告              ║');
console.log('╚══════════════════════════════════════╝');
console.log(`03区总文件: ${files03.length} 个 (识别SetId: ${allSetIds.length} 个)`);
console.log(`04区总碎片: ${files04.length} 个 (SetId: ${setIds04.size} 个)`);
console.log('');
console.log(`✅ 完整导入: ${complete.length} 个 Set`);
console.log(`⚠️  Part不完整: ${incomplete.length} 个 Set`);
console.log(`❌ 完全未导入: ${missing.length} 个 Set`);

// ========== 未导入文件 ==========
if (missing.length > 0) {
  console.log('');
  console.log('========== ❌ 完全未导入的文件 ==========');
  for (const item of missing) {
    console.log(`\n[${item.setId}]`);
    if (item.questionFiles.length > 0) {
      console.log(`  Q: ${item.questionFiles.join(', ')}`);
    }
    if (item.analysisFiles.length > 0) {
      console.log(`  A: ${item.analysisFiles.join(', ')}`);
    }
  }
}

// ========== Part不完整文件 ==========
if (incomplete.length > 0) {
  console.log('');
  console.log('========== ⚠️ Part 不完整的文件 ==========');
  for (const item of incomplete) {
    console.log(`\n[${item.setId}]`);
    console.log(`  04区已有Q: ${item.qParts.join(', ') || '无'}`);
    console.log(`  04区已有A: ${item.aParts.join(', ') || '无'}`);
    if (item.qMissing.length > 0) {
      console.log(`  ❌ Q缺: ${item.qMissing.join(', ')}`);
    }
    if (item.aMissing.length > 0) {
      console.log(`  ❌ A缺: ${item.aMissing.join(', ')}`);
    }
  }
}

// ========== 问题分类统计 ==========
const issueCategories = {};
for (const item of incomplete) {
  const qMissing = item.qMissing.length;
  const aMissing = item.aMissing.length;
  const key = `Q缺${qMissing} + A缺${aMissing}`;
  if (!issueCategories[key]) issueCategories[key] = [];
  issueCategories[key].push(item.setId);
}

if (Object.keys(issueCategories).length > 0) {
  console.log('');
  console.log('========== 📊 问题分类统计 ==========');
  for (const [cat, sets] of Object.entries(issueCategories).sort()) {
    console.log(`  ${cat}: ${sets.length} 个 → ${sets.join(', ')}`);
  }
}

// ========== 写入 JSON ==========
const report = {
  stats: {
    total03: files03.length,
    total04: files04.length,
    setIds03: allSetIds.length,
    setIds04: setIds04.size,
    complete: complete.length,
    incomplete: incomplete.length,
    missing: missing.length,
  },
  missing,
  incomplete,
  complete,
};
fs.writeFileSync(
  path.join(ROOT, 'data', '_03-04-comparison.json'),
  JSON.stringify(report, null, 2),
  'utf-8'
);
console.log('\n详细报告已写入 data/_03-04-comparison.json');
