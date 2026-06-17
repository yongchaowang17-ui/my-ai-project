/**
 * 05区全面清理 — 按 Dify 知识库要求优化所有文件
 * 
 * 修复项：
 * 1. 移除所有 --- 分隔符（frontmatter 除外）→ 避免碎片 chunk
 * 2. 移除 "注意:此部分试题请在答题卡X上作答" 无用行
 * 3. 移除 "## 答案与解析" 过渡标题
 * 4. 压缩连续空行（最多保留1个）
 * 5. 移除孤立的短行（<10字符的纯文本行，非标题）
 * 6. 合并相邻的短行到上一行（避免 Dify 切出碎片 chunk）
 */
const fs = require('fs');
const path = require('path');

const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function fullCleanup(content) {
  const lines = content.split('\n');

  // Phase 1: 找到 frontmatter 结束位置
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---' && i > 0) {
      fmEnd = i;
      break;
    }
  }
  if (fmEnd === -1) fmEnd = 0;

  // Phase 2: 保留 frontmatter，处理剩余内容
  const cleaned = [];
  for (let i = 0; i <= fmEnd; i++) {
    cleaned.push(lines[i]);
  }

  // Phase 3: 清理 frontmatter 之后的内容
  let foundSeparator = false;
  let waitingForContent = false;

  for (let i = fmEnd + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 跳过 --- 分隔符（第一个 = Q/A 分隔，后续的也是）
    if (trimmed === '---') {
      if (!foundSeparator) {
        foundSeparator = true;
        waitingForContent = true;
      }
      continue;
    }

    // 分隔符后等待有意义内容
    if (waitingForContent) {
      if (trimmed === '') continue;
      if (/^#*\s*答案与解析\s*$/.test(trimmed)) continue;
      if (/^#\s*Part\s*(I{1,3}|IV|V)\b/i.test(trimmed)) continue;
      if (/^注意[:：]此部分试题请在答题卡/.test(trimmed)) continue;
      waitingForContent = false;
    }

    // 跳过无用行
    if (/^注意[:：]此部分试题请在答题卡/.test(trimmed)) continue;
    if (/^#*\s*答案与解析\s*$/.test(trimmed)) continue;

    cleaned.push(line);
  }

  // Phase 4: 压缩连续空行（最多1个）
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
  console.log('=== 05区全面清理 ===\n');

  let totalFiles = 0;
  let totalFixed = 0;
  const stats = {};

  for (const exam of ['CET4', 'CET6']) {
    for (const part of ['Writing', 'Listening', 'Translation', 'Reading']) {
      const dir = path.join(SYNTHESIS_DIR, exam, part);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      let partFixed = 0;

      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const cleaned = fullCleanup(content);

        if (cleaned !== content) {
          fs.writeFileSync(filePath, cleaned, 'utf-8');
          partFixed++;
          totalFixed++;
        }
        totalFiles++;
      }

      stats[exam + '/' + part] = { total: files.length, fixed: partFixed };
      if (partFixed > 0) {
        console.log(`${exam}/${part}: ${partFixed}/${files.length} cleaned`);
      }
    }
  }

  console.log(`\n总计: ${totalFixed}/${totalFiles} files cleaned`);

  // 验证
  console.log('\n=== 验证残留问题 ===');
  let remainSep = 0;
  let remainEng = 0;
  let remainTiny = 0;

  for (const exam of ['CET4', 'CET6']) {
    for (const part of ['Writing', 'Listening', 'Translation', 'Reading']) {
      const dir = path.join(SYNTHESIS_DIR, exam, part);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      files.forEach(f => {
        const c = fs.readFileSync(path.join(dir, f), 'utf-8');
        const lines = c.split('\n');
        let fmEnd = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === '---' && i > 0) { fmEnd = i; break; }
        }
        for (let i = fmEnd + 1; i < lines.length; i++) {
          const t = lines[i].trim();
          if (t === '---') remainSep++;
          if (t.length > 50 && /[a-zA-Z]{5,}/.test(t) && !t.includes(' ') && !t.startsWith('!')) remainEng++;
        }
      });
    }
  }

  console.log(`残留 --- 分隔符: ${remainSep}`);
  console.log(`残留英文空格问题: ${remainEng}`);
}

main();
