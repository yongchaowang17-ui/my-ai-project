/**
 * 用知识库的干净MD文件替换03区乱码文件，然后重新拆解到04区
 */
const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..');
const FINAL_ROOT = path.join(DATA_ROOT, '03_Exam_Final');

// 映射：干净源文件 → 03区目标路径
const replacements = [
  // CET4 2020.12 Analysis
  {
    src: 'data/2020.12英语四级解析第1套.md',
    dst: '03_Exam_Final/CET4/Analysis/2020_12_S1_A_01.md',
    setId: 'CET4_2020_12_S1',
  },
  {
    src: 'data/2020.12英语四级解析第2套.md',
    dst: '03_Exam_Final/CET4/Analysis/2020_12_S2_A_01.md',
    setId: 'CET4_2020_12_S2',
  },
  {
    src: 'data/2020.12英语四级解析第3套.md',
    dst: '03_Exam_Final/CET4/Analysis/2020_12_S3_A_01.md',
    setId: 'CET4_2020_12_S3',
  },
  // CET6 2021.06 Analysis (合订本拆分)
  {
    src: 'data/2021.06英语六级答案解析第1套.md',
    dst: '03_Exam_Final/CET6/Analysis/CET6_2021.06_Set1_纯解析.md',
    setId: 'CET6_2021_06_S1',
  },
  {
    src: 'data/2021.06英语六级答案解析第2套.md',
    dst: '03_Exam_Final/CET6/Analysis/CET6_2021.06_Set2_纯解析.md',
    setId: 'CET6_2021_06_S2',
  },
  {
    src: 'data/2021.06英语六级答案解析第3套.md',
    dst: '03_Exam_Final/CET6/Analysis/CET6_2021.06_Set3_纯解析.md',
    setId: 'CET6_2021_06_S3',
  },
  // CET6 2021.06 Question
  {
    src: 'data/2021.06六级真题第1套.md',
    dst: '03_Exam_Final/CET6/Question/CET6_2021.06_Set1_纯真题.md',
    setId: 'CET6_2021_06_S1',
  },
  {
    src: 'data/2021.06六级真题第2套.md',
    dst: '03_Exam_Final/CET6/Question/CET6_2021.06_Set2_纯真题.md',
    setId: 'CET6_2021_06_S2',
  },
  {
    src: 'data/2021.06六级真题第3套.md',
    dst: '03_Exam_Final/CET6/Question/CET6_2021.06_Set3_纯真题.md',
    setId: 'CET6_2021_06_S3',
  },
  // CET6 2022.06 Question
  {
    src: 'data/2022.06六级真题第3套.md',
    dst: '03_Exam_Final/CET6/Question/CET6_2022.06_Set3_纯真题.md',
    setId: 'CET6_2022_06_S3',
  },
];

let success = 0;
let skipped = 0;

for (const r of replacements) {
  const srcPath = path.join(DATA_ROOT, r.src);
  const dstPath = path.join(DATA_ROOT, r.dst);

  if (!fs.existsSync(srcPath)) {
    console.log(`[SKIP] 源文件不存在: ${r.src}`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(srcPath, 'utf-8');

  // 修复行尾：有些文件是单行（\r\n连在一起），需要保留原始换行
  // 检查是否有 \r\n 或 \n
  const lineCount = content.split('\n').length;
  if (lineCount <= 2 && content.length > 1000) {
    // 可能是单行文件，检查是否有 \r\n 被吃掉
    // 用正则恢复段落分隔
    console.log(`[WARN] ${r.src} 只有 ${lineCount} 行，检查换行...`);
  }

  const mojiCount = (content.match(/\ufffd/g) || []).length;
  const charCount = content.length;

  // 写入03区
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.writeFileSync(dstPath, content, 'utf-8');

  console.log(`[OK] ${path.basename(dstPath)} ← ${path.basename(r.src)} (${charCount} chars, ${mojiCount} moji)`);
  success++;
}

console.log(`\n完成: ${success} 个文件已替换, ${skipped} 个跳过`);
