/**
 * 清理 05区文件中的无意义碎片 chunk
 * 正确区分 frontmatter 的 --- 和 Q/A 分隔符 ---
 */
const fs = require('fs');
const path = require('path');

const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function cleanFragments(content) {
  const lines = content.split('\n');
  const cleaned = [];
  
  // Phase 1: 处理 frontmatter（保留前7行）
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---' && i > 0) {
      fmEnd = i;
      break;
    }
  }
  if (fmEnd === -1) fmEnd = 0;
  
  // 保留 frontmatter
  for (let i = 0; i <= fmEnd; i++) {
    cleaned.push(lines[i]);
  }
  
  // Phase 2: 处理 frontmatter 之后的内容
  let foundSeparator = false;
  let waitingForContent = false;
  
  for (let i = fmEnd + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 第一个 --- = Q/A 分隔符 → 跳过
    if (line === '---' && !foundSeparator) {
      foundSeparator = true;
      waitingForContent = true;
      continue;
    }
    // 后续的 --- 也跳过
    if (line === '---' && foundSeparator) continue;
    
    // 分隔符后等待有意义内容
    if (waitingForContent) {
      if (line === '') continue;
      if (/^#*\s*答案与解析\s*$/.test(line)) continue;
      if (/^#\s*Part\s*(I{1,3}|IV|V)\b/i.test(line)) continue;
      if (/^注意[:：]此部分试题请在答题卡/.test(line)) continue;
      waitingForContent = false;
    }
    
    // 跳过 "注意" 行
    if (/^注意[:：]此部分试题请在答题卡/.test(line)) continue;
    
    cleaned.push(lines[i]);
  }
  
  // Phase 3: 压缩连续空行（最多1个）
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
  console.log('=== 碎片 chunk 清理 v3 ===\n');

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
        const cleaned = cleanFragments(content);

        if (cleaned !== content) {
          fs.writeFileSync(filePath, cleaned, 'utf-8');
          partFixed++;
          totalFixed++;
        }
        totalFiles++;
      }

      if (partFixed > 0) {
        console.log(`${exam}/${part}: ${partFixed}/${files.length} files cleaned`);
      }
    }
  }

  console.log(`\n总计: ${totalFixed}/${totalFiles} files cleaned`);
}

main();
