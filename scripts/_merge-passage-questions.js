/**
 * Reading 文件格式优化：每段 Passage + 配套题目合并为一个 chunk
 * 
 * 逻辑：
 * 1. 识别 Section 边界（# SectionA/B/C）
 * 2. 每个 Section 内：合并连续非空行 → Passage + 题目成为一个 chunk
 * 3. Section 之间保留空行 → Dify 按 \n\n 切分时每个 Section 一个 chunk
 */
const fs = require('fs');
const path = require('path');

const DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function reformatReading(content) {
  const lines = content.split('\n');

  // 找 frontmatter 结束
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---' && i > 0) { fmEnd = i; break; }
  }
  if (fmEnd === -1) return content;

  const fm = lines.slice(0, fmEnd + 1);
  const body = lines.slice(fmEnd + 1);

  // 找所有 Section 边界
  const sectionStarts = [];
  for (let i = 0; i < body.length; i++) {
    if (/^#*\s*Section\s*[A-C]/i.test(body[i].trim())) {
      sectionStarts.push(i);
    }
  }

  if (sectionStarts.length === 0) return content;

  // 处理 frontmatter 到第一个 Section 之间的内容（保留原样）
  const pre = body.slice(0, sectionStarts[0]);

  // 处理每个 Section
  const sections = [];
  for (let s = 0; s < sectionStarts.length; s++) {
    const start = sectionStarts[s];
    const end = s + 1 < sectionStarts.length ? sectionStarts[s + 1] : body.length;
    const sectionLines = body.slice(start, end);

    // 在 Section 内：合并连续非空行（去掉空行）
    const merged = [];
    for (const line of sectionLines) {
      if (line.trim() === '') {
        // 跳过空行（合并到上一行）
        continue;
      }
      merged.push(line);
    }

    sections.push(merged);
  }

  // 重组：frontmatter + pre + Section1 \n\n Section2 \n\n Section3
  const result = [...fm];
  if (pre.length > 0) result.push(...pre);

  for (let s = 0; s < sections.length; s++) {
    if (s > 0) result.push(''); // Section 之间加空行（Dify 的 \n\n 分隔符）
    result.push(...sections[s]);
  }

  return result.join('\n');
}

function main() {
  console.log('=== Reading 格式优化：Passage+题目合并 ===\n');

  let count = 0;
  let totalChunksBefore = 0;
  let totalChunksAfter = 0;

  for (const exam of ['CET4', 'CET6']) {
    const dir = path.join(DIR, exam, 'Reading');
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    let examCount = 0;

    for (const file of files) {
      const fp = path.join(dir, file);
      const before = fs.readFileSync(fp, 'utf-8');
      const after = reformatReading(before);

      if (after !== before) {
        fs.writeFileSync(fp, after, 'utf-8');
        examCount++;
        count++;
      }

      // 计算 chunk 数（按 \n\n 分割）
      const beforeChunks = before.split(/\n\n+/).filter(c => c.trim().length > 0).length;
      const afterChunks = after.split(/\n\n+/).filter(c => c.trim().length > 0).length;
      totalChunksBefore += beforeChunks;
      totalChunksAfter += afterChunks;
    }

    console.log(`${exam}: ${examCount}/${files.length} files reformatted`);
  }

  console.log(`\n总计: ${count} files`);
  console.log(`Chunk 数变化: ${totalChunksBefore} → ${totalChunksAfter} (减少 ${totalChunksBefore - totalChunksAfter})`);
}

main();
