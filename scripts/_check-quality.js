/**
 * 质量检查脚本：检查 03区 和 04区 的文件内容质量
 */
const fs = require('fs');
const path = require('path');

// 检查 03区 文件
console.log('=== 03区 质量检查 ===');
const issues03 = [];
for (const lv of ['CET4', 'CET6']) {
  for (const tp of ['Question', 'Analysis']) {
    const dir = path.join('data/03_Exam_Final', lv, tp);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const fp = path.join(dir, f);
      const c = fs.readFileSync(fp, 'utf-8');
      const lines = c.split('\n');
      
      // 检查乱码（U+FFFD 替换字符）
      const mojiCount = (c.match(/\ufffd/g) || []).length;
      if (mojiCount > 0) {
        issues03.push({ path: path.relative('.', fp), chars: c.length, issue: 'MOJIBAKE', count: mojiCount });
      }
      
      // 检查空文件或过小
      if (c.trim().length < 100) {
        issues03.push({ path: path.relative('.', fp), chars: c.length, issue: 'TOO_SMALL' });
      }
      
      // 检查是否有实际中文内容
      const cnMatch = c.match(/[\u4e00-\u9fff]/g);
      if (!cnMatch || cnMatch.length < 10) {
        issues03.push({ path: path.relative('.', fp), chars: c.length, issue: 'NO_CHINESE', preview: c.slice(0, 100).replace(/\n/g, ' ') });
      }
    }
  }
}
console.log('03区 问题文件数:', issues03.length);
issues03.forEach(i => console.log(`  [${i.issue}] ${i.path} (${i.chars} chars${i.count ? ', ' + i.count + ' mojibake' : ''})${i.preview ? '\n    Preview: ' + i.preview : ''}`));

// 检查 04区 文件
console.log('\n=== 04区 质量检查 ===');
const issues04 = [];
for (const lv of ['CET4', 'CET6']) {
  for (const tp of ['Question', 'Analysis']) {
    const dir = path.join('data/04_Fusion_Area', lv, tp);
    if (!fs.existsSync(dir)) continue;
    for (const set of fs.readdirSync(dir)) {
      const sd = path.join(dir, set);
      if (!fs.statSync(sd).isDirectory()) continue;
      
      const files = fs.readdirSync(sd).filter(f => f.endsWith('.md'));
      
      // 检查 Part 完整性
      if (files.length < 4) {
        const partNames = files.map(f => f.replace(/\.md$/, ''));
        const expected = ['Part1_Writing', 'Part2_Listening', 'Part3_Reading', 'Part4_Translation'];
        const missing = expected.filter(e => !partNames.some(pn => pn.includes(e.split('_')[1])));
        issues04.push({ path: `${lv}/${tp}/${set}`, issue: 'INCOMPLETE', count: files.length, missing });
      }
      
      for (const f of files) {
        const fp = path.join(sd, f);
        const c = fs.readFileSync(fp, 'utf-8');
        
        // 检查乱码
        const mojiCount = (c.match(/\ufffd/g) || []).length;
        if (mojiCount > 0) {
          issues04.push({ path: path.relative('.', fp), chars: c.length, issue: 'MOJIBAKE', count: mojiCount });
        }
        
        // 检查内容是否太短（Part文件通常应有100+行）
        const lineCount = c.split('\n').length;
        if (lineCount < 10) {
          issues04.push({ path: path.relative('.', fp), chars: c.length, issue: 'THIN', lines: lineCount });
        }
      }
    }
  }
}
console.log('04区 问题文件数:', issues04.length);
issues04.forEach(i => {
  if (i.issue === 'INCOMPLETE') {
    console.log(`  [${i.issue}] ${i.path}: ${i.count} files, missing: ${i.missing.join(', ')}`);
  } else {
    console.log(`  [${i.issue}] ${i.path} (${i.chars} chars, ${i.lines || ''} lines${i.count ? ', ' + i.count + ' mojibake' : ''})`);
  }
});

// 统计
console.log('\n=== 统计摘要 ===');
console.log('03区 问题:', issues03.length);
console.log('04区 问题:', issues04.length);

// 列出 04区 缺少 Part 的完整清单
const incompleteList = issues04.filter(i => i.issue === 'INCOMPLETE');
if (incompleteList.length > 0) {
  console.log('\n=== 缺少 Part 的 SetId ===');
  incompleteList.forEach(i => console.log(`  ${i.path}: ${i.count} files, missing ${i.missing.join(', ')}`));
}
