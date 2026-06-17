/**
 * Reading 文件重组：Section内英文+解析合并为一个chunk
 *
 * Section内去掉所有空行，英文+解析连成一块连续文本。
 * Section之间用 --- 分隔，每个Section作为Dify的独立chunk。
 *
 * 用法：node scripts/_fix-reading-chunks.js
 */
const fs = require('fs');
const path = require('path');

const BASE = 'D:/my-ai-Project/data/05_Synthesis_Area';

const SECTION_HEADER_RE = /^#{1,3}\s*(Section\s*[A-C]|Passage\s*(One|Two|1|2))/i;

function restructureReading(content) {
  const lines = content.split('\n');

  // 提取frontmatter
  let frontmatterEnd = 0;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        frontmatterEnd = i + 1;
        break;
      }
    }
  }

  const frontmatter = lines.slice(0, frontmatterEnd).join('\n');
  const bodyLines = lines.slice(frontmatterEnd);

  // 找到所有Section标题的位置
  const sectionBreaks = [];
  for (let i = 0; i < bodyLines.length; i++) {
    if (SECTION_HEADER_RE.test(bodyLines[i])) {
      sectionBreaks.push(i);
    }
  }

  if (sectionBreaks.length < 2) {
    // Section太少，兜底：连续空行压缩为单个
    return content.replace(/\n{3,}/g, '\n\n');
  }

  // 按Section标题切分为块
  const sections = [];
  for (let s = 0; s < sectionBreaks.length; s++) {
    const start = sectionBreaks[s];
    const end = s + 1 < sectionBreaks.length ? sectionBreaks[s + 1] : bodyLines.length;
    sections.push(bodyLines.slice(start, end));
  }

  // 每个Section块内：去掉所有空行（英文+解析连成一块）
  const processedSections = sections.map(sectionLines => {
    return sectionLines.filter(l => l.trim() !== '');
  });

  // Section之间用 --- 分隔
  const result = [];
  for (let s = 0; s < processedSections.length; s++) {
    if (s > 0) {
      result.push('');
      result.push('---');
      result.push('');
    }
    result.push(...processedSections[s]);
  }

  return frontmatter + '\n' + result.join('\n');
}

// 统计
let total = 0, modified = 0, skipped = 0, errors = 0;

for (const exam of ['CET4', 'CET6']) {
  const readingDir = path.join(BASE, exam, 'Reading');
  if (!fs.existsSync(readingDir)) continue;

  const files = fs.readdirSync(readingDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    total++;
    const filePath = path.join(readingDir, file);

    try {
      const original = fs.readFileSync(filePath, 'utf-8');
      const restructured = restructureReading(original);

      if (restructured === original) {
        skipped++;
        continue;
      }

      fs.writeFileSync(filePath, restructured, 'utf-8');
      modified++;
      console.log(`[重组] ${file}`);
    } catch (err) {
      errors++;
      console.error(`[错误] ${file}:`, err.message);
    }
  }
}

console.log(`\n=== Reading重组完成 ===`);
console.log(`总计: ${total} 文件`);
console.log(`已修改: ${modified}`);
console.log(`无变化跳过: ${skipped}`);
console.log(`错误: ${errors}`);
