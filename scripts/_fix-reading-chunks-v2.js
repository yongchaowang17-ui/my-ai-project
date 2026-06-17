/**
 * Reading 文件重组 v2：按题号范围切分为4个chunk
 * 
 * CET4 Reading结构：
 *   Chunk1: SectionA (Q26-35) = 选词填空
 *   Chunk2: SectionB (Q36-45) = 信息匹配
 *   Chunk3: SectionC PassageOne (Q46-50) = 仔细阅读
 *   Chunk4: SectionC PassageTwo (Q51-55) = 仔细阅读
 * 
 * CET6 Reading结构：
 *   Chunk1: SectionA (Q36-45) = 选词填空
 *   Chunk2: SectionB (Q46-55) = 信息匹配 + 仔细阅读
 * 
 * 每个chunk内：英文题目+中文解析合并，无空行
 * Chunk之间用 --- 分隔
 * 
 * 用法：node scripts/_fix-reading-chunks-v2.js
 */
const fs = require('fs');
const path = require('path');

const BASE = 'D:/my-ai-Project/data/05_Synthesis_Area';

/**
 * 从文件内容中提取frontmatter和正文
 */
function extractFrontmatter(content) {
  const lines = content.split('\n');
  let end = 0;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') { end = i + 1; break; }
    }
  }
  return {
    frontmatter: lines.slice(0, end).join('\n'),
    body: lines.slice(end).join('\n')
  };
}

/**
 * 按Section标题切分为逻辑块
 * 返回 [{header, content}]
 */
function splitBySections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;
  
  for (const line of lines) {
    const isHeader = /^#{1,3}\s*(Section\s*[A-C]|Passage\s*(One|Two|1|2))/i.test(line);
    
    if (isHeader) {
      if (current) sections.push(current);
      current = { header: line.trim(), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  
  return sections.map(s => ({
    header: s.header,
    content: s.lines.join('\n')
  }));
}

/**
 * 将Section块按题号范围合并为4个chunk
 */
function mergeIntoChunks(sections, examType) {
  if (examType === 'CET4') {
    // CET4: SectionA(Q26-35) + SectionB(Q36-45) + SectionC_Passage1(Q46-50) + SectionC_Passage2(Q51-55)
    const result = [];
    let sectionC = [];
    
    for (const sec of sections) {
      const h = sec.header.toLowerCase();
      if (h.includes('section a') && !h.includes('section c')) {
        // SectionA -> 单独chunk
        result.push(sec);
      } else if (h.includes('section b')) {
        // SectionB -> 单独chunk
        result.push(sec);
      } else if (h.includes('section c') || h.includes('passage')) {
        // SectionC和Passage归入一组
        sectionC.push(sec);
      }
    }
    
    // SectionC按Passage拆分为2个chunk
    if (sectionC.length > 0) {
      let passage1 = [], passage2 = [];
      let inPassage2 = false;
      
      for (const sec of sectionC) {
        const h = sec.header.toLowerCase();
        if (h.includes('passage two') || h.includes('passage 2')) {
          inPassage2 = true;
        }
        
        if (inPassage2) {
          passage2.push(sec);
        } else {
          passage1.push(sec);
        }
      }
      
      if (passage1.length > 0) {
        result.push({
          header: passage1[0].header,
          content: passage1.map(p => p.content).join('\n')
        });
      }
      if (passage2.length > 0) {
        result.push({
          header: passage2[0].header,
          content: passage2.map(p => p.content).join('\n')
        });
      }
    }
    
    return result;
    
  } else {
    // CET6: SectionA(Q36-45) + SectionB(Q46-55)
    const result = [];
    for (const sec of sections) {
      const h = sec.header.toLowerCase();
      if (h.includes('section a') && !h.includes('section c')) {
        result.push(sec);
      } else if (h.includes('section b') || h.includes('section c') || h.includes('passage')) {
        result.push(sec);
      }
    }
    return result;
  }
}

/**
 * 清理chunk内容：去掉空行，合并英文+中文解析
 */
function cleanChunk(chunk) {
  const lines = chunk.content.split('\n');
  // 去掉所有空行
  const cleaned = lines.filter(l => l.trim() !== '');
  return {
    header: chunk.header,
    content: cleaned.join('\n')
  };
}

// 主处理
let total = 0, modified = 0, errors = 0;

for (const exam of ['CET4', 'CET6']) {
  const readingDir = path.join(BASE, exam, 'Reading');
  if (!fs.existsSync(readingDir)) continue;
  
  const files = fs.readdirSync(readingDir).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    total++;
    const filePath = path.join(readingDir, file);
    
    try {
      const original = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = extractFrontmatter(original);
      
      // Step1: 按Section标题切分
      const sections = splitBySections(body);
      
      // Step2: 按题号范围合并为chunk
      const chunks = mergeIntoChunks(sections, exam);
      
      // Step3: 每个chunk内清理空行
      const cleanedChunks = chunks.map(cleanChunk);
      
      // Step4: 重组文件
      const result = frontmatter + '\n' + cleanedChunks.map(c => c.content).join('\n\n---\n\n');
      
      if (result === original) {
        console.log(`[跳过] ${file} (无变化)`);
        continue;
      }
      
      fs.writeFileSync(filePath, result, 'utf-8');
      console.log(`[重组] ${file} (${cleanedChunks.length} chunks)`);
      modified++;
      
    } catch (err) {
      errors++;
      console.error(`[错误] ${file}:`, err.message);
    }
  }
}

console.log(`\n=== Reading重组完成 v2 ===`);
console.log(`总计: ${total} 文件`);
console.log(`已修改: ${modified}`);
console.log(`错误: ${errors}`);
