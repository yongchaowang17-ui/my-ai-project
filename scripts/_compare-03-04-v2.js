/**
 * 修正版：03区 vs 04区 精确比对
 * 04区实际文件命名: {setId}_Q_01_{PartName}.md / {setId}_A_01_{PartName}.md
 * 支持两种 PartName: Writing/Listening/Reading/Translation
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AREA03 = path.join(ROOT, 'data', '03_Exam_Final');
const AREA04 = path.join(ROOT, 'data', '04_Fusion_Area');

function scanFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...scanFiles(fp, ext));
    else if (!ext || entry.name.endsWith(ext)) results.push(fp);
  }
  return results;
}

function extractSetId(filePath, examLevel) {
  const filename = path.basename(filePath, '.md');
  // Pattern A: 2015_06_S1_Q_01.md
  const a = filename.match(/^(\d{4}_\d{2}_S\d)/);
  if (a) return `${examLevel}_${a[1]}`;
  // Pattern B: CET4_2021.12_Set1_纯真题.md
  const b = filename.match(/^CET(\d)_(\d{4})\.(\d{2})_Set(\d)/);
  if (b) return `CET${b[1]}_${b[2]}_${b[3]}_S${b[4]}`;
  // Pattern C: CET4_2024_06_Set1_纯真题.md
  const c = filename.match(/^CET(\d)_(\d{4})_(\d{2})_Set(\d)/);
  if (c) return `CET${c[1]}_${c[2]}_${c[3]}_S${c[4]}`;
  return null;
}

// 扫描 03区
const files03 = scanFiles(AREA03, '.md');
const setMap = {};
for (const fp of files03) {
  const rel = path.relative(AREA03, fp);
  const parts = rel.split(path.sep);
  const examLevel = parts[0];
  const type = parts[1];
  const setId = extractSetId(fp, examLevel);
  if (!setId) continue;
  if (!setMap[setId]) setMap[setId] = { question: [], analysis: [] };
  if (type === 'Question') setMap[setId].question.push(path.basename(fp));
  else if (type === 'Analysis') setMap[setId].analysis.push(path.basename(fp));
}

// 扫描 04区 - 改为按目录检测
const files04 = scanFiles(AREA04, '.md');
// 提取所有在04区有文件的setId
const setIdIn04 = new Set();
const partsBySetId = {}; // setId -> { qParts: Set, aParts: Set }

for (const fp of files04) {
  const rel = path.relative(AREA04, fp);
  const parts = rel.split(path.sep);
  if (parts.length < 4) continue; // 需要 CET4/SetId/Question/file.md
  const setId = parts[1]; // 已经是标准格式 CET4_2015_06_S1
  const type = parts[2];  // Question 或 Analysis
  const fname = parts[3];
  
  setIdIn04.add(setId);
  if (!partsBySetId[setId]) partsBySetId[setId] = { qFiles: new Set(), aFiles: new Set() };
  
  if (type === 'Question') partsBySetId[setId].qFiles.add(fname);
  else if (type === 'Analysis') partsBySetId[setId].aFiles.add(fname);
}

// 比对
const allSetIds = Object.keys(setMap).sort();
const missing = [];    // 完全不在 04区
const hasFiles = [];   // 在 04区但可能有问题
const complete = [];   // 完整

for (const setId of allSetIds) {
  const info = setMap[setId];
  if (!setIdIn04.has(setId)) {
    missing.push({ setId, qFiles: info.question, aFiles: info.analysis });
    continue;
  }
  
  const in04 = partsBySetId[setId];
  const qCount03 = info.question.length;
  const aCount03 = info.analysis.length;
  const qCount04 = in04.qFiles.size;
  const aCount04 = in04.aFiles.size;
  
  // 判断是否完整：04区至少有 Q 和 A 各4个Part文件
  const qPartNames = Array.from(in04.qFiles);
  const aPartNames = Array.from(in04.aFiles);
  
  const hasWriting = (n) => n.some(f => /Writing/i.test(f));
  const hasListening = (n) => n.some(f => /Listening/i.test(f));
  const hasReading = (n) => n.some(f => /Reading/i.test(f));
  const hasTranslation = (n) => n.some(f => /Translation/i.test(f));
  
  const qComplete = qPartNames.length > 0 && hasWriting(qPartNames) && hasListening(qPartNames) && hasReading(qPartNames) && hasTranslation(qPartNames);
  const aComplete = aPartNames.length > 0 && hasWriting(aPartNames) && hasListening(aPartNames) && hasReading(aPartNames) && hasTranslation(aPartNames);
  
  if (qComplete && aComplete) {
    complete.push({ setId });
  } else {
    const qMissing = [];
    const aMissing = [];
    if (!hasWriting(qPartNames)) qMissing.push('Writing');
    if (!hasListening(qPartNames)) qMissing.push('Listening');
    if (!hasReading(qPartNames)) qMissing.push('Reading');
    if (!hasTranslation(qPartNames)) qMissing.push('Translation');
    if (!hasWriting(aPartNames)) aMissing.push('Writing');
    if (!hasListening(aPartNames)) aMissing.push('Listening');
    if (!hasReading(aPartNames)) aMissing.push('Reading');
    if (!hasTranslation(aPartNames)) aMissing.push('Translation');
    
    hasFiles.push({
      setId,
      qCount03, aCount03, qCount04, aCount04,
      qFiles04: qPartNames,
      aFiles04: aPartNames,
      qMissing, aMissing,
    });
  }
}

// 输出报告
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   03区 vs 04区 精确比对报告              ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`03区: ${files03.length} 文件, ${allSetIds.length} 个 Set`);
console.log(`04区: ${files04.length} 碎片文件, ${setIdIn04.size} 个 Set`);
console.log('');
console.log(`✅ Q+A 完整(各4 Part): ${complete.length}`);
console.log(`⚠️  部分导入/Part缺失: ${hasFiles.length}`);
console.log(`❌ 完全未导入: ${missing.length}`);

if (missing.length > 0) {
  console.log('');
  console.log('========== ❌ 完全未导入 04区的 Set ==========');
  for (const item of missing) {
    const qStr = item.qFiles.length > 0 ? item.qFiles.join(', ') : '无Q文件';
    const aStr = item.aFiles.length > 0 ? item.aFiles.join(', ') : '无A文件';
    console.log(`  [${item.setId}] Q:${qStr} | A:${aStr}`);
  }
}

if (hasFiles.length > 0) {
  console.log('');
  console.log('========== ⚠️ Part 缺失详情 ==========');
  for (const item of hasFiles) {
    console.log(`  [${item.setId}] 04区: Q${item.qCount04}个 A${item.aCount04}个`);
    if (item.qMissing.length > 0) console.log(`    Q缺: ${item.qMissing.join(', ')}`);
    if (item.aMissing.length > 0) console.log(`    A缺: ${item.aMissing.join(', ')}`);
  }
}

// 保存
const report = {
  stats: { total03: files03.length, total04: files04.length, sets03: allSetIds.length, sets04: setIdIn04.size, complete: complete.length, partial: hasFiles.length, missing: missing.length },
  missing: missing.map(m => m.setId),
  partial: hasFiles.map(h => ({ setId: h.setId, qMissing: h.qMissing, aMissing: h.aMissing })),
};
fs.writeFileSync(path.join(ROOT, 'data', '_03-04-comparison-v2.json'), JSON.stringify(report, null, 2), 'utf-8');
console.log('\n报告已写入 data/_03-04-comparison-v2.json');
