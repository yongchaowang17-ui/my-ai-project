/**
 * 扫描 03区 vs 04区，列出所有未导入文件及其检测问题
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const F03 = 'D:/my-ai-Project/data/03_Exam_Final';
const F04 = 'D:/my-ai-Project/data/04_Fusion_Area';
const levels = ['CET4', 'CET6'];
const types = ['Question', 'Analysis'];

// extractSetId from preview/route.ts
function extractSetId(sourcePath, sourceFilename) {
  const examMatch = sourcePath.match(/(?:03_Exam_Final\/)?(CET\d|TEM\d)\//);
  if (!examMatch) return null;
  const exam = examMatch[1].toUpperCase();
  const stdM = sourceFilename.match(/^(\d{4}_\d{2}_S\d+)_/);
  if (stdM) return exam + '_' + stdM[1];
  const yearM = sourceFilename.match(/(20\d{2})[._-](\d{2})/);
  const setM = sourceFilename.match(/[Ss]et[_]?(\d+)/);
  if (yearM) return exam + '_' + yearM[1] + '_' + yearM[2] + '_S' + (setM ? setM[1] : '1');
  return null;
}

const missingFiles = [];
let total = 0, imported = 0;

for (const lv of levels) {
  for (const tp of types) {
    const d03 = path.join(F03, lv, tp);
    if (!fs.existsSync(d03)) continue;
    const files = fs.readdirSync(d03).filter(f => f.endsWith('.md'));
    for (const f of files) {
      total++;
      const sourcePath = lv + '/' + tp + '/' + f;
      const setId = extractSetId(sourcePath, f);
      if (!setId) {
        missingFiles.push({ file: f, level: lv, type: tp, setId: '?', parts: 0, reason: 'setId推断失败', blocks: [] });
        continue;
      }

      // 检查 04区
      const d04 = path.join(F04, lv, setId, tp);
      let existingCount = 0;
      if (fs.existsSync(d04)) {
        existingCount = fs.readdirSync(d04).filter(x => x.endsWith('.md')).length;
      }
      if (existingCount >= 2) {
        imported++;
        continue;
      }

      // 未导入：检测 Part 数量
      const absPath = path.join(d03, f);
      const raw = fs.readFileSync(absPath, 'utf-8');
      const { content } = matter(raw);
      const lines = content.split('\n');

      // 简单 Part 检测（ASCII + Unicode）
      const foundParts = new Set();
      const partHeaders = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        // ASCII
        const rm = l.match(/^#{1,4}\s+Part\s*(I{1,3}|IV|V)\b/i);
        if (rm) { const r = rm[1].toUpperCase(); const map = { I: 1, II: 2, III: 3, IV: 4, V: 5 }; if (map[r] && !foundParts.has(map[r])) { foundParts.add(map[r]); partHeaders.push({ p: map[r], line: i, src: l.substring(0, 60) }); } continue; }
        // Unicode
        const um = l.match(/Part\s*([\u2160-\u2165])/);
        if (um) { const code = um[1].charCodeAt(0); const umap = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5 }; if (umap[code] && !foundParts.has(umap[code])) { foundParts.add(umap[code]); partHeaders.push({ p: umap[code], line: i, src: l.substring(0, 60) }); } continue; }
        // Mixed: Part IⅢ etc
        const mx = l.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
        if (mx) { const code = mx[1].charCodeAt(0); const umap = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5 }; if (umap[code] && !foundParts.has(umap[code])) { foundParts.add(umap[code]); partHeaders.push({ p: umap[code], line: i, src: l.substring(0, 60) }); } }
      }

      // Section A 检测（用于推断 Part II Listening）
      let sectionACount = 0;
      let firstSectionAIsListening = false;
      for (let i = 0; i < lines.length; i++) {
        if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) {
          sectionACount++;
          if (sectionACount === 1) {
            const nf = lines.slice(i + 1, i + 5).join(' ');
            firstSectionAIsListening = /hear|listen|conversation|news report/i.test(nf);
          }
        }
      }

      // HTML Writing 检测
      let hasHtmlWriting = false;
      for (let i = 0; i < lines.length; i++) {
        if (/<td>\s*Part\s+I\s+Writing/i.test(lines[i])) { hasHtmlWriting = true; break; }
      }

      const reason = foundParts.size < 4
        ? `仅检测到 ${foundParts.size} 个Part [${[...foundParts].sort().join(',')}]`
        : 'OK';

      missingFiles.push({
        file: f, level: lv, type: tp, setId,
        parts: foundParts.size,
        detectedParts: [...foundParts].sort(),
        partHeaders,
        sectionACount,
        firstSectionAIsListening,
        hasHtmlWriting,
        existingCount,
        reason,
      });
    }
  }
}

// 输出报告
console.log('========== 扫描报告 ==========');
console.log(`03区总计: ${total} 文件`);
console.log(`已导入04区: ${imported} 文件`);
console.log(`未导入: ${missingFiles.length} 文件`);
console.log();

// 按问题分类
const byIssue = {};
for (const m of missingFiles) {
  const key = m.reason.startsWith('仅检测到') ? m.reason : m.reason;
  if (!byIssue[key]) byIssue[key] = [];
  byIssue[key].push(m);
}

for (const [issue, files] of Object.entries(byIssue)) {
  console.log(`\n--- ${issue} (${files.length} 文件) ---`);
  for (const f of files) {
    const detail = f.partHeaders.length > 0
      ? f.partHeaders.map(h => `P${h.p}@L${h.line + 1}`).join(', ')
      : '无Part标题';
    const extra = [];
    if (f.sectionACount > 0) extra.push(`SectionA×${f.sectionACount}${f.firstSectionAIsListening ? '(听)' : '(读)'}`);
    if (f.hasHtmlWriting) extra.push('HTML写作');
    if (f.existingCount > 0) extra.push(`已有${f.existingCount}文件`);
    console.log(`  ${f.file} (${f.level}/${f.type}) setId=${f.setId}`);
    console.log(`    ${detail}${extra.length ? ' | ' + extra.join(', ') : ''}`);
  }
}
