/**
 * 检查来自乱码03区文件的04区文件
 */
const fs = require('fs');
const path = require('path');

// 已知有问题的03区文件对应的setId
const problemSets = [
  // CET4 2020_12
  'CET4_2020_12_S1', 'CET4_2020_12_S2',
  // CET4 2021.12
  'CET4_2021_12_S1', 'CET4_2021_12_S2', 'CET4_2021_12_S3',
  // CET4 2022.06 Set3
  'CET4_2022_06_S3',
  // CET6 2021_06
  'CET6_2021_06_S1', 'CET6_2021_06_S2', 'CET6_2021_06_S3',
  // CET6 2022.06 Set3
  'CET6_2022_06_S3',
];

console.log('=== 04区 派生文件质量检查 ===');
let totalChecked = 0;
let mojiFound = 0;

for (const setId of problemSets) {
  // 确定目录路径
  const isCET6 = setId.startsWith('CET6');
  const exam = isCET6 ? 'CET6' : 'CET4';
  
  for (const tp of ['Question', 'Analysis']) {
    const dir = path.join('data/04_Fusion_Area', exam, tp, setId);
    if (!fs.existsSync(dir)) {
      console.log(`  [MISSING DIR] ${exam}/${tp}/${setId}`);
      continue;
    }
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const fp = path.join(dir, f);
      const c = fs.readFileSync(fp, 'utf-8');
      totalChecked++;
      
      const mojiCount = (c.match(/\ufffd/g) || []).length;
      const lineCount = c.split('\n').length;
      
      if (mojiCount > 0) {
        mojiFound++;
        console.log(`  [MOJIBAKE] ${exam}/${tp}/${setId}/${f} — ${mojiCount} replacement chars, ${lineCount} lines, ${c.length} chars`);
        // 显示乱码周围的内容
        const lines = c.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('\ufffd')) {
            console.log(`    Line ${i + 1}: ${lines[i].slice(0, 100)}`);
          }
        }
      }
    }
  }
}

console.log(`\n总计检查: ${totalChecked} 个文件, ${mojiFound} 个有乱码`);

// 额外：抽样检查 CET4_2021_12 的文件内容
console.log('\n=== 抽样: CET4_2021_12_S1 Question Reading ===');
const samplePath = path.join('data/04_Fusion_Area/CET4/Question/CET4_2021_12_S1');
if (fs.existsSync(samplePath)) {
  for (const f of fs.readdirSync(samplePath)) {
    const fp = path.join(samplePath, f);
    const c = fs.readFileSync(fp, 'utf-8');
    const lines = c.split('\n');
    console.log(`  ${f}: ${lines.length} lines, ${c.length} chars`);
    console.log(`  First 5 lines:`);
    lines.slice(0, 5).forEach((l, i) => console.log(`    ${i + 1}: ${l.slice(0, 80)}`));
  }
}
