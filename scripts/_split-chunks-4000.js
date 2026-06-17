/**
 * 将05区所有文件的chunk切分到4000字符以内
 * 
 * Dify分段最大长度=4000，超过的chunk需要在源文件里预切分
 * 切分策略：按题目编号边界切分，每组题目+解析作为一个chunk
 * 
 * 用法：node scripts/_split-chunks-4000.js
 */
const fs = require('fs');
const path = require('path');

const BASE = 'D:/my-ai-Project/data/05_Synthesis_Area';
const MAX_LEN = 4000;

/**
 * 将一个大chunk按题目编号边界切分为多个 <= MAX_LEN 的子chunk
 */
function splitLargeChunk(text) {
  if (text.length <= MAX_LEN) return [text];
  
  const lines = text.split('\n');
  const result = [];
  let current = [];
  let currentLen = 0;
  
  for (const line of lines) {
    const lineLen = line.length + 1; // +1 for \n
    
    // 检测题目编号边界 (如 "26." "27." "1." "A)" 等)
    const isQuestionStart = /^\s*\d{1,2}\s*[.、．]\s/.test(line);
    const isOptionStart = /^\s*[A-D][)）]\s/.test(line);
    const isSectionHeader = /^#{1,3}\s*(Section|Passage|Part)/i.test(line);
    
    // 如果当前行是题目开头且当前chunk已经有一定长度，切分
    if ((isQuestionStart || isSectionHeader) && currentLen > 500 && currentLen + lineLen > MAX_LEN) {
      if (current.length > 0) {
        result.push(current.join('\n'));
        current = [];
        currentLen = 0;
      }
    }
    
    current.push(line);
    currentLen += lineLen;
    
    // 如果当前chunk超过MAX_LEN，强制切分
    if (currentLen > MAX_LEN) {
      // 找最近的空行或题目边界切分
      let splitIdx = -1;
      for (let i = current.length - 1; i >= Math.max(0, current.length - 20); i--) {
        if (current[i].trim() === '' || /^\s*\d{1,2}\s*[.、．]\s/.test(current[i])) {
          splitIdx = i;
          break;
        }
      }
      
      if (splitIdx > 0) {
        const part1 = current.slice(0, splitIdx);
        const part2 = current.slice(splitIdx);
        if (part1.length > 0) result.push(part1.join('\n'));
        current = part2;
        currentLen = part2.join('\n').length;
      } else {
        // 找不到好的切分点，强制切
        result.push(current.join('\n'));
        current = [];
        currentLen = 0;
      }
    }
  }
  
  if (current.length > 0) {
    result.push(current.join('\n'));
  }
  
  return result.filter(t => t.trim().length > 0);
}

let total = 0, modified = 0, splitCount = 0, errors = 0;

for (const exam of ['CET4', 'CET6']) {
  for (const part of ['Reading', 'Listening', 'Writing', 'Translation']) {
    const dir = path.join(BASE, exam, part);
    if (!fs.existsSync(dir)) continue;
    
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      total++;
      const filePath = path.join(dir, file);
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // 提取frontmatter
        let frontmatterEnd = 0;
        if (content.startsWith('---')) {
          for (let i = 1; i < content.length; i++) {
            if (content[i] === '\n' && content.substring(i, i + 4) === '\n---') {
              frontmatterEnd = i + 4;
              break;
            }
          }
        }
        
        const frontmatter = content.substring(0, frontmatterEnd);
        const body = content.substring(frontmatterEnd);
        
        // 按 --- 分割chunk
        const chunks = body.split('\n\n---\n\n');
        
        // 检查是否有超过4000的chunk
        const hasLarge = chunks.some(ch => ch.trim().length > MAX_LEN);
        if (!hasLarge) continue;
        
        // 切分大chunk
        const newChunks = [];
        for (const ch of chunks) {
          if (ch.trim().length > MAX_LEN) {
            const parts = splitLargeChunk(ch.trim());
            newChunks.push(...parts);
          } else {
            newChunks.push(ch.trim());
          }
        }
        
        const newBody = newChunks.join('\n\n---\n\n');
        const newContent = frontmatter + '\n' + newBody;
        
        fs.writeFileSync(filePath, newContent, 'utf-8');
        modified++;
        splitCount += newChunks.length - chunks.length;
        console.log(`[切分] ${file} (${chunks.length}→${newChunks.length} chunks)`);
      } catch (err) {
        errors++;
        console.error(`[错误] ${file}:`, err.message);
      }
    }
  }
}

console.log(`\n=== 完成 ===`);
console.log(`总计: ${total} | 已切分: ${modified} | 新增chunks: ${splitCount} | 错误: ${errors}`);
