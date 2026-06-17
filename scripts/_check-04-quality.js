/**
 * 修正版：检查 04区 所有文件的质量（含乱码检测）
 */
const fs = require('fs');
const path = require('path');

const base = 'data/04_Fusion_Area';
let total = 0, mojiFiles = 0, thinFiles = 0;

console.log('=== 04区 全量质量扫描 ===');

for (const lv of ['CET4', 'CET6']) {
  const examDir = path.join(base, lv);
  if (!fs.existsSync(examDir)) continue;
  
  for (const setId of fs.readdirSync(examDir)) {
    const setDir = path.join(examDir, setId);
    if (!fs.statSync(setDir).isDirectory()) continue;
    
    for (const tp of ['Question', 'Analysis']) {
      const tpDir = path.join(setDir, tp);
      if (!fs.existsSync(tpDir)) continue;
      
      for (const f of fs.readdirSync(tpDir)) {
        if (!f.endsWith('.md')) continue;
        const fp = path.join(tpDir, f);
        const c = fs.readFileSync(fp, 'utf-8');
        total++;
        
        const mojiCount = (c.match(/\ufffd/g) || []).length;
        const lineCount = c.split('\n').length;
        
        if (mojiCount > 0) {
          mojiFiles++;
          console.log(`[MOJIBAKE] ${lv}/${setId}/${tp}/${f} — ${mojiCount} chars, ${c.length} bytes, ${lineCount} lines`);
          // 显示乱码位置
          const lines = c.split('\n');
          let shown = 0;
          for (let i = 0; i < lines.length && shown < 3; i++) {
            if (lines[i].includes('\ufffd')) {
              console.log(`  L${i + 1}: ${lines[i].replace(/\ufffd/g, '[?]').slice(0, 100)}`);
              shown++;
            }
          }
        }
        
        if (lineCount < 10 && c.length < 200) {
          thinFiles++;
          console.log(`[THIN] ${lv}/${setId}/${tp}/${f} — ${lineCount} lines, ${c.length} bytes`);
        }
      }
    }
  }
}

console.log(`\n=== 统计 ===`);
console.log(`总文件数: ${total}`);
console.log(`有乱码文件: ${mojiFiles}`);
console.log(`过薄文件: ${thinFiles}`);
