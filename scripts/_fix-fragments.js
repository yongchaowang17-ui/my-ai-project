/**
 * 统一修复 05_Synthesis_Area 中 Writing/Listening/Translation 的碎片标题
 * 
 * 问题：# Part I / # Writing / # (30minutes) 被 \n\n 切成多个无意义 chunk
 * 修复：合并为 # Part I Writing (30 minutes) 一行
 */
const fs = require('fs');
const path = require('path');

const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function compactHeaders(content) {
  let result = content;

  // === Part I Writing (有空格和无空格两种变体) ===
  // # Part I\n\n# Writing\n\n# (30 minutes)
  result = result.replace(/#\s*Part\s+I\s*\n\s*#\s*Writing\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part I Writing ($1 minutes)');
  result = result.replace(/#\s*PartI\s*\n\s*#\s*Writing\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part I Writing ($1 minutes)');
  // # Part I\n\n# Writing (30 minutes)
  result = result.replace(/#\s*Part\s+I\s*\n\s*#\s*Writing\s*\((\d+)\s*minutes?\)/gi,
    '# Part I Writing ($1 minutes)');
  result = result.replace(/#\s*PartI\s*\n\s*#\s*Writing\s*\((\d+)\s*minutes?\)/gi,
    '# Part I Writing ($1 minutes)');
  // # Part I\n\n# Writing
  result = result.replace(/#\s*Part\s+I\s*\n\s*#\s*Writing\b/gi,
    '# Part I Writing');
  result = result.replace(/#\s*PartI\s*\n\s*#\s*Writing\b/gi,
    '# Part I Writing');
  // # Part I Writing\n\n# (30 minutes)
  result = result.replace(/#\s*Part\s+I\s+Writing\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part I Writing ($1 minutes)');

  // === Part IV Translation ===
  result = result.replace(/#\s*Part\s+IV\s*\n\s*#\s*Translation\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part IV Translation ($1 minutes)');
  result = result.replace(/#\s*PartIV\s*\n\s*#\s*Translation\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part IV Translation ($1 minutes)');
  result = result.replace(/#\s*Part\s+IV\s*\n\s*#\s*Translation\s*\((\d+)\s*minutes?\)/gi,
    '# Part IV Translation ($1 minutes)');
  result = result.replace(/#\s*PartIV\s*\n\s*#\s*Translation\s*\((\d+)\s*minutes?\)/gi,
    '# Part IV Translation ($1 minutes)');
  result = result.replace(/#\s*Part\s+IV\s*\n\s*#\s*Translation\b/gi,
    '# Part IV Translation');
  result = result.replace(/#\s*PartIV\s*\n\s*#\s*Translation\b/gi,
    '# Part IV Translation');
  // Part IV Translation\n\n# 【参考译文】
  result = result.replace(/#\s*Part\s*IV\s+Translation\s*\n\s*#\s*【参考译文】/gi,
    '# Part IV Translation — 参考译文');

  // === Part II Listening Comprehension ===
  result = result.replace(/#\s*Part\s+II\s*\n\s*#\s*Listening\s*Comprehension\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part II Listening Comprehension ($1 minutes)');
  result = result.replace(/#\s*PartII\s*\n\s*#\s*Listening\s*Comprehension\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part II Listening Comprehension ($1 minutes)');
  result = result.replace(/#\s*Part\s+II\s*\n\s*#\s*Listening\s*Comprehension\b/gi,
    '# Part II Listening Comprehension');
  result = result.replace(/#\s*PartII\s*\n\s*#\s*Listening\s*Comprehension\b/gi,
    '# Part II Listening Comprehension');
  // # Part II Listening\n\n# Comprehension
  result = result.replace(/#\s*Part\s+II\s+Listening\s*\n\s*#\s*Comprehension\b/gi,
    '# Part II Listening Comprehension');
  result = result.replace(/#\s*PartII\s+Listening\s*\n\s*#\s*Comprehension\b/gi,
    '# Part II Listening Comprehension');
  // # Part II Listening Comprehension\n\n# (25 minutes)
  result = result.replace(/#\s*Part\s+II\s+Listening\s+Comprehension\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part II Listening Comprehension ($1 minutes)');

  // === Part III Reading Comprehension ===
  result = result.replace(/#\s*Part\s+III\s*\n\s*#\s*Reading\s*Comprehension\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part III Reading Comprehension ($1 minutes)');
  result = result.replace(/#\s*PartIII\s*\n\s*#\s*Reading\s*Comprehension\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part III Reading Comprehension ($1 minutes)');
  result = result.replace(/#\s*Part\s+III\s*\n\s*#\s*Reading\s*Comprehension\b/gi,
    '# Part III Reading Comprehension');
  result = result.replace(/#\s*PartIII\s*\n\s*#\s*Reading\s*Comprehension\b/gi,
    '# Part III Reading Comprehension');

  // === Standalone Part headers ===
  result = result.replace(/#\s*PartI\b/gm, '# Part I');
  result = result.replace(/#\s*PartII\b/gm, '# Part II');
  result = result.replace(/#\s*PartIII\b/gm, '# Part III');
  result = result.replace(/#\s*PartIV\b/gm, '# Part IV');

  // === Remove standalone --- (except Q/A separator) ===
  const lines = result.split('\n');
  const cleaned = [];
  let pastFrontmatter = false;
  let foundSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!pastFrontmatter && line === '---' && i > 0) {
      pastFrontmatter = true;
      cleaned.push(lines[i]);
      continue;
    }

    if (!pastFrontmatter) {
      cleaned.push(lines[i]);
      continue;
    }

    // Keep only the first --- after frontmatter (Q/A separator)
    if (line === '---') {
      if (!foundSeparator) {
        foundSeparator = true;
        cleaned.push(lines[i]);
      }
      continue;
    }

    cleaned.push(lines[i]);
  }

  return cleaned.join('\n');
}

function main() {
  console.log('=== 碎片标题统一修复 v2 ===\n');

  let totalFixed = 0;
  let totalFiles = 0;

  for (const exam of ['CET4', 'CET6']) {
    for (const part of ['Writing', 'Listening', 'Translation', 'Reading']) {
      const dir = path.join(SYNTHESIS_DIR, exam, part);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      let partFixed = 0;

      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fixed = compactHeaders(content);

        if (fixed !== content) {
          fs.writeFileSync(filePath, fixed, 'utf-8');
          partFixed++;
          totalFixed++;
        }
        totalFiles++;
      }

      if (partFixed > 0) {
        console.log(`${exam}/${part}: ${partFixed}/${files.length} files compacted`);
      }
    }
  }

  console.log(`\n总计: ${totalFixed}/${totalFiles} files fixed`);
}

main();
