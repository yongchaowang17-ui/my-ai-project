/**
 * 诊断 03区未导入文件的内容质量
 * 检查：换行符、乱码、行数、Part标题
 */
const fs = require('fs');
const path = require('path');

const missing = [
  { id: 'CET4_2022_06_S3', q: 'CET4/Question/CET4_2022.06_Set3_纯真题.md', a: 'CET4/Analysis/CET4_2022.06_Set3_纯解析.md' },
  { id: 'CET4_2022_12_S2', q: null, a: 'CET4/Analysis/CET4_2022.12_Set2_纯解析.md' },
  { id: 'CET4_2023_12_S2', q: 'CET4/Question/CET4_2023.12_Set2_纯真题.md', a: 'CET4/Analysis/CET4_2023.12_Set2_纯解析.md' },
  { id: 'CET4_2023_12_S3', q: 'CET4/Question/CET4_2023.12_Set3_纯真题.md', a: 'CET4/Analysis/CET4_2023.12_Set3_纯解析.md' },
  { id: 'CET4_2024_12_S2', q: 'CET4/Question/2024_12_S2_Q_01.md', a: 'CET4/Analysis/2024_12_S2_A_01.md' },
  { id: 'CET4_2024_12_S3', q: 'CET4/Question/2024_12_S3_Q_01.md', a: null },
  { id: 'CET4_2025_06_S2', q: 'CET4/Question/CET4_2025.06_Set2_纯真题.md', a: 'CET4/Analysis/CET4_2025.06_Set2_纯解析.md' },
  { id: 'CET6_2018_12_S1', q: 'CET6/Question/2018_12_S1_Q_01.md', a: 'CET6/Analysis/2018_12_S1_A_01.md' },
  { id: 'CET6_2018_12_S3', q: 'CET6/Question/2018_12_S3_Q_01.md', a: 'CET6/Analysis/2018_12_S3_A_01.md' },
  { id: 'CET6_2019_06_S3', q: 'CET6/Question/2019_06_S3_Q_01.md', a: 'CET6/Analysis/2019_06_S3_A_01.md' },
  { id: 'CET6_2019_12_S3', q: 'CET6/Question/2019_12_S3_Q_01.md', a: 'CET6/Analysis/2019_12_S3_A_01.md' },
  { id: 'CET6_2020_12_S1', q: 'CET6/Question/2020_12_S1_Q_01.md', a: 'CET6/Analysis/2020_12_S1_A_01.md' },
  { id: 'CET6_2020_12_S3', q: 'CET6/Question/2020_12_S3_Q_01.md', a: 'CET6/Analysis/2020_12_S3_A_01.md' },
  { id: 'CET6_2021_06_S2', q: 'CET6/Question/2021_06_S2_Q_01.md', a: 'CET6/Analysis/2021_06_S2_A_01.md' },
  { id: 'CET6_2021_06_S3', q: 'CET6/Question/2021_06_S3_Q_01.md', a: 'CET6/Analysis/2021_06_S3_A_01.md' },
  { id: 'CET6_2021_12_S2', q: 'CET6/Question/CET6_2021.12_Set2_纯真题.md', a: 'CET6/Analysis/CET6_2021.12_Set2_真题及解析.md' },
  { id: 'CET6_2022_06_S1', q: 'CET6/Question/CET6_2022.06_Set1_纯真题.md', a: 'CET6/Analysis/CET6_2022.06_Set1_纯解析.md' },
  { id: 'CET6_2022_06_S3', q: 'CET6/Question/CET6_2022.06_Set3_纯真题.md', a: 'CET6/Analysis/CET6_2022.06_Set3_纯解析.md' },
  { id: 'CET6_2022_12_S1', q: 'CET6/Question/CET6_2022.12_Set1_纯真题.md', a: 'CET6/Analysis/CET6_2022.12_Set1_纯解析.md' },
  { id: 'CET6_2022_12_S2', q: 'CET6/Question/CET6_2022.12_Set2_纯真题.md', a: 'CET6/Analysis/CET6_2022.12_Set2_纯解析.md' },
  { id: 'CET6_2022_12_S3', q: 'CET6/Question/CET6_2022.12_Set3_纯真题.md', a: 'CET6/Analysis/CET6_2022.12_Set3_纯解析.md' },
  { id: 'CET6_2023_12_S1', q: 'CET6/Question/CET6_2023.12_Set1_纯真题.md', a: 'CET6/Analysis/CET6_2023.12_Set1_纯解析.md' },
  { id: 'CET6_2024_06_S3', q: 'CET6/Question/CET6_2024.06_Set3_纯真题.md', a: null },
  { id: 'CET6_2024_12_S1', q: 'CET6/Question/2024_12_S1_Q_01.md', a: 'CET6/Analysis/2024_12_S1_A_01.md' },
  { id: 'CET6_2024_12_S2', q: 'CET6/Question/2024_12_S2_Q_01.md', a: 'CET6/Analysis/2024_12_S2_A_01.md' },
  { id: 'CET6_2024_12_S3', q: 'CET6/Question/2024_12_S3_Q_01.md', a: 'CET6/Analysis/2024_12_S3_A_01.md' },
  { id: 'CET6_2025_06_S1', q: 'CET6/Question/CET6_2025.06_Set1_纯真题.md', a: 'CET6/Analysis/CET6_2025.06_Set1_纯解析.md' },
  { id: 'CET6_2025_06_S2', q: 'CET6/Question/CET6_2025.06_Set2_纯真题.md', a: 'CET6/Analysis/CET6_2025.06_Set2_纯解析.md' },
  { id: 'CET6_2025_06_S3', q: 'CET6/Question/CET6_2025.06_Set3_纯真题.md', a: 'CET6/Analysis/CET6_2025.06_Set3_纯解析.md' },
];

const BASE = path.join(__dirname, '..', 'data', '03_Exam_Final');

function analyzeFile(relPath) {
  const fp = path.join(BASE, relPath);
  if (!fs.existsSync(fp)) return { exists: false, size: 0 };
  
  const raw = fs.readFileSync(fp);
  const text = raw.toString('utf-8');
  
  // 换行符检测
  const hasLF = text.includes('\n');
  const hasCR = text.includes('\r');
  const crlfCount = (text.match(/\r\n/g) || []).length;
  
  // 真实行数
  const linesByLF = text.split('\n').length;
  const linesByCR = text.split('\r').length;
  
  // Frontmatter 检测
  const hasFrontmatter = text.startsWith('---');
  
  // Part标题检测
  const partMatches = text.match(/^#?\s*Part\s*(I{1,3}|IV|V)\b/gim) || [];
  const sectionMatches = text.match(/Section\s*[A-C]/gi) || [];
  
  // 内容区域（去掉frontmatter）
  let content = text;
  if (hasFrontmatter) {
    const secondDash = text.indexOf('---', 4);
    if (secondDash !== -1) {
      content = text.substring(secondDash + 3).trim();
    }
  }
  
  // 乱码检测 - 替换字符
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  // 其他可疑Unicode
  const suspiciousChars = (text.match(/[\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g) || []).length;
  
  // 内容字符数（去掉frontmatter和空白）
  const contentChars = content.replace(/\s/g, '').length;
  
  return {
    exists: true,
    size: raw.length,
    contentChars,
    hasLF,
    hasCR,
    crlfCount,
    linesLF: linesByLF,
    linesCR: linesByCR,
    hasFrontmatter,
    partCount: partMatches.length,
    sectionCount: sectionMatches.length,
    replacementCount,
    suspiciousChars,
    partTitles: partMatches.slice(0, 5),
  };
}

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║  03区未导入文件 内容质量诊断                     ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

const issues = { noLF: 0, smallContent: 0, noPart: 0, hasMojibake: 0, missingFile: 0, ok: 0 };

for (const m of missing) {
  console.log(`─── ${m.id} ───`);
  
  if (m.q) {
    const r = analyzeFile(m.q);
    if (!r.exists) {
      console.log(`  Q: 文件不存在!`);
      issues.missingFile++;
    } else {
      const flags = [];
      if (!r.hasLF) { flags.push('无换行符!'); issues.noLF++; }
      if (r.contentChars < 5000) { flags.push(`内容过短(${r.contentChars}字)`); issues.smallContent++; }
      if (r.partCount === 0) { flags.push('无Part标题'); issues.noPart++; }
      if (r.replacementCount > 0) { flags.push(`乱码${r.replacementCount}处`); issues.hasMojibake++; }
      if (flags.length === 0) issues.ok++;
      
      console.log(`  Q: ${r.size}字节 | 内容${r.contentChars}字 | 行${r.linesLF} | Part${r.partCount}个 | ${flags.length > 0 ? '⚠ ' + flags.join(', ') : '✅'}`);
    }
  } else {
    console.log(`  Q: 无文件`);
    issues.missingFile++;
  }
  
  if (m.a) {
    const r = analyzeFile(m.a);
    if (!r.exists) {
      console.log(`  A: 文件不存在!`);
      issues.missingFile++;
    } else {
      const flags = [];
      if (!r.hasLF) { flags.push('无换行符!'); issues.noLF++; }
      if (r.contentChars < 5000) { flags.push(`内容过短(${r.contentChars}字)`); issues.smallContent++; }
      if (r.replacementCount > 0) { flags.push(`乱码${r.replacementCount}处`); issues.hasMojibake++; }
      if (flags.length === 0) issues.ok++;
      
      console.log(`  A: ${r.size}字节 | 内容${r.contentChars}字 | 行${r.linesLF} | ${flags.length > 0 ? '⚠ ' + flags.join(', ') : '✅'}`);
    }
  } else {
    console.log(`  A: 无文件`);
    issues.missingFile++;
  }
}

console.log('');
console.log('══════════ 问题汇总 ══════════');
console.log(`  无换行符(需修复): ${issues.noLF} 个文件`);
console.log(`  内容过短(<5000字): ${issues.smallContent} 个文件`);
console.log(`  无Part标题(需检测增强): ${issues.noPart} 个文件`);
console.log(`  含乱码字符: ${issues.hasMojibake} 个文件`);
console.log(`  文件不存在: ${issues.missingFile} 个文件`);
console.log(`  正常: ${issues.ok} 个文件`);
