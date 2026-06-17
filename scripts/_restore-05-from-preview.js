/**
 * 从 synthesis-preview.json 恢复 05区 所有文件
 * 恢复用户仔细分开的题块内容
 */
const fs = require('fs');
const path = require('path');

const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';
const PREVIEW_FILE = 'D:/my-ai-Project/data/synthesis-preview.json';

function main() {
  console.log('=== 从 synthesis-preview.json 恢复 05区 ===\n');

  const preview = JSON.parse(fs.readFileSync(PREVIEW_FILE, 'utf-8'));
  const items = Array.isArray(preview) ? preview : preview.items || [];
  console.log(`Preview 中有 ${items.length} 个文件\n`);

  let restored = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of items) {
    if (!item.id || !item.content) {
      skipped++;
      continue;
    }

    // 解析 id: CET4_2015_06_S1_Reading
    const m = item.id.match(/^(CET[46])_(\d{4})_(\d{2})_S(\d+)_(.+)$/);
    if (!m) {
      skipped++;
      continue;
    }

    const exam = m[1];
    const year = m[2];
    const month = m[3];
    const setNum = m[4];
    const partName = m[5];
    const key = `${exam}_${year}_${month}_S${setNum}`;

    const partDir = path.join(SYNTHESIS_DIR, exam, partName);
    if (!fs.existsSync(partDir)) {
      fs.mkdirSync(partDir, { recursive: true });
    }

    const filename = `${key}_${partName}.md`;
    const filePath = path.join(partDir, filename);

    // 构建 frontmatter
    const frontmatter = [
      '---',
      `exam: ${exam}`,
      `setId: ${key}`,
      `partName: ${partName}`,
      `type: synthesized`,
      `createdAt: ${item.createdAt || new Date().toISOString()}`,
      '---',
    ].join('\n');

    // 合并 frontmatter + 原始内容
    const content = item.content.trim();
    const fullContent = frontmatter + '\n\n' + content + '\n';

    try {
      fs.writeFileSync(filePath, fullContent, 'utf-8');
      restored++;
    } catch (e) {
      console.error(`  ❌ ${filename}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n恢复完成:`);
  console.log(`  已恢复: ${restored}`);
  console.log(`  跳过: ${skipped}`);
  console.log(`  错误: ${errors}`);

  // 验证
  console.log('\n=== 验证 ===');
  let totalFiles = 0;
  let totalLines = 0;
  for (const exam of ['CET4', 'CET6']) {
    for (const part of ['Writing', 'Listening', 'Reading', 'Translation']) {
      const dir = path.join(SYNTHESIS_DIR, exam, part);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      totalFiles += files.length;
      files.forEach(f => {
        const c = fs.readFileSync(path.join(dir, f), 'utf-8');
        totalLines += c.split('\n').length;
      });
    }
  }
  console.log(`总文件: ${totalFiles}`);
  console.log(`总行数: ${totalLines}`);
}

main();
