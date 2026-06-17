/**
 * 最终清理：移除重复的 Part 标题
 * 规则：frontmatter 之后第一个 # Part X 标题保留，后续同类型的去掉
 */
const fs = require('fs');
const path = require('path');

const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function removeDuplicatePartHeaders(content) {
  const lines = content.split('\n');
  const cleaned = [];
  let fmEnd = -1;
  let firstPartSeen = false;

  // 找 frontmatter 结束
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---' && i > 0) {
      fmEnd = i;
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (i <= fmEnd) {
      cleaned.push(lines[i]);
      continue;
    }

    // 检测 Part 标题
    if (/^#\s*Part\s*(I{1,3}|IV|V)\s*(Writing|Listening|Translation|Reading|Comprehension)?/i.test(line)) {
      if (!firstPartSeen) {
        firstPartSeen = true;
        cleaned.push(lines[i]);
      }
      // 重复的 Part 标题 → 跳过
      continue;
    }

    cleaned.push(lines[i]);
  }

  // 压缩连续空行
  const compressed = [];
  let prevEmpty = false;
  for (const line of cleaned) {
    if (line.trim() === '') {
      if (!prevEmpty) {
        compressed.push(line);
        prevEmpty = true;
      }
    } else {
      compressed.push(line);
      prevEmpty = false;
    }
  }

  return compressed.join('\n');
}

function main() {
  console.log('=== 移除重复 Part 标题 ===\n');

  let totalFixed = 0;

  for (const exam of ['CET4', 'CET6']) {
    for (const part of ['Writing', 'Listening', 'Translation', 'Reading']) {
      const dir = path.join(SYNTHESIS_DIR, exam, part);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      let partFixed = 0;

      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const cleaned = removeDuplicatePartHeaders(content);

        if (cleaned !== content) {
          fs.writeFileSync(filePath, cleaned, 'utf-8');
          partFixed++;
          totalFixed++;
        }
      }

      if (partFixed > 0) {
        console.log(`${exam}/${part}: ${partFixed} duplicate headers removed`);
      }
    }
  }

  console.log(`\n总计: ${totalFixed} files fixed`);
}

main();
