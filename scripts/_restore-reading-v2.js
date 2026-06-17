/**
 * Reading 恢复 + 按题号范围重组（CET4/CET6 统一4个chunk）
 * 
 * CET4: SectionA(Q26-35) | SectionB(Q36-45) | Passage1(Q46-50) | Passage2(Q51-55)
 * CET6: SectionA(Q36-45) | SectionB(Q46-55) | PassageOne | PassageTwo
 * 
 * 每个chunk内：英文+解析合并，去空行，去内部---
 * chunk之间用 --- 分隔
 * 
 * 用法：node scripts/_restore-reading-v2.js
 */
const fs = require('fs');
const path = require('path');

const BASE = 'D:/my-ai-Project/data/05_Synthesis_Area';
const preview = JSON.parse(fs.readFileSync('D:/my-ai-Project/data/synthesis-preview.json', 'utf-8'));

function isSectionHeader(line) {
  return /^#{1,3}\s*(Section\s*[A-C]|Passage\s*(One|Two|1|2))/i.test(line);
}

function splitBySections(body) {
  if (!body) return [];
  const lines = body.split('\n');
  const sections = [];
  let cur = null;
  for (const line of lines) {
    if (isSectionHeader(line)) {
      if (cur) sections.push(cur);
      cur = { header: line.trim(), lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections.map(s => ({ header: s.header, text: s.lines.join('\n') }));
}

// 兼容无空格标题: # SectionA / # Section A / # sectiona
function tagSection(sec) {
  const h = sec.header.replace(/\s+/g, '').toLowerCase();
  if (h.includes('sectiona') && !h.includes('sectionc')) return 'A';
  if (h.includes('sectionb')) return 'B';
  if (h.includes('passagetwo') || h.includes('passage2')) return 'P2';
  if (h.includes('sectionc') || h.includes('passage')) return 'P1';
  return null;
}

function mergeToChunks(sections) {
  const tagged = sections.map(sec => ({ ...sec, tag: tagSection(sec) }));
  let lastTag = null;
  for (const sec of tagged) {
    if (sec.tag) lastTag = sec.tag;
    else sec.tag = lastTag;
  }

  const buckets = { A: [], B: [], P1: [], P2: [] };
  for (const sec of tagged) {
    const tag = sec.tag || 'A';
    if (buckets[tag]) buckets[tag].push(sec);
    else buckets.A.push(sec);
  }
  return ['A', 'B', 'P1', 'P2']
    .filter(k => buckets[k].length > 0)
    .map(k => buckets[k]);
}

function buildChunk(groupSections) {
  const seenHeaders = new Set();
  const lines = [];
  for (const sec of groupSections) {
    for (const line of sec.text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      if (trimmed === '---') continue;
      if (isSectionHeader(trimmed)) {
        const key = trimmed.toLowerCase().replace(/\s+/g, '');
        if (seenHeaders.has(key)) continue;
        seenHeaders.add(key);
      }
      lines.push(line);
    }
  }
  return lines.join('\n');
}

function buildFrontmatter(examType, setId) {
  return [
    '---',
    `exam: ${examType}`,
    `setId: ${setId}`,
    'partName: Reading',
    'type: synthesized',
    `createdAt: ${new Date().toISOString()}`,
    '---'
  ].join('\n');
}

let total = 0, modified = 0, errors = 0;
const readingPreviews = preview.filter(p => p.partName === 'Reading');

for (const p of readingPreviews) {
  total++;
  const examType = p.examType || (p.setId.startsWith('CET4') ? 'CET4' : 'CET6');
  const fileName = `${p.setId}_Reading.md`;
  const dir = path.join(BASE, examType, 'Reading');
  const filePath = path.join(dir, fileName);

  try {
    fs.mkdirSync(dir, { recursive: true });
    const body = (typeof p.content === 'string') ? p.content : '';
    if (!body) { console.log(`[跳过] ${fileName}`); continue; }

    const sections = splitBySections(body);
    if (sections.length < 2) {
      const cleanBody = body.split('\n').filter(l => l.trim() !== '' && l.trim() !== '---').join('\n');
      fs.writeFileSync(filePath, buildFrontmatter(examType, p.setId) + '\n' + cleanBody, 'utf-8');
      console.log(`[直写] ${fileName}`); modified++; continue;
    }

    const groups = mergeToChunks(sections);
    const chunks = groups.map(g => buildChunk(g));
    const finalBody = chunks.join('\n\n---\n\n');
    const output = buildFrontmatter(examType, p.setId) + '\n' + finalBody;

    fs.writeFileSync(filePath, output, 'utf-8');
    console.log(`[重组] ${fileName} (${chunks.length} chunks)`); modified++;
  } catch (err) {
    errors++;
    console.error(`[错误] ${fileName}:`, err.message);
  }
}

console.log(`\n=== 完成 ===`);
console.log(`总计: ${total} | 已处理: ${modified} | 错误: ${errors}`);
