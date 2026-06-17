/**
 * _fix-cet6-remaining.js
 * 修复未被正确处理的 CET6 Listening 文件。
 * 对仍超标的手动修复。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET6', 'Listening');
const LIMIT = 3990;

// 仍需要处理的文件（结构特殊）
const SPECIAL_FILES = [
  'CET6_2020_12_S2_Listening.md',  // # Section A (简写)
  'CET6_2021_06_S2_Listening.md',  // ## Section A (##格式)
];

for (const file of SPECIAL_FILES) {
  const fp = path.join(DIR, file);
  const content = fs.readFileSync(fp, 'utf8');
  const lines = content.split('\n');

  // 找 section 标题行
  const secMarkers = [];
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (/^#{1,2}\s*Section\s*A\s*$/i.test(tr)) secMarkers.push({ type: 'A', line: i });
    if (/^#{1,2}\s*Section\s*B\s*$/i.test(tr)) secMarkers.push({ type: 'B', line: i });
    if (/^#{1,2}\s*Section\s*C\s*$/i.test(tr)) secMarkers.push({ type: 'C', line: i });
  }

  // 简单三段切分
  const blocks = [];
  if (secMarkers.length >= 3) {
    // Section A: lines[secA.line .. secB.line)
    blocks.push(lines.slice(secMarkers[0].line, secMarkers[1].line).join('\n').replace(/\n+$/, ''));
    // Section B: lines[secB.line .. secC.line)
    blocks.push(lines.slice(secMarkers[1].line, secMarkers[2].line).join('\n').replace(/\n+$/, ''));
    // Section C: lines[secC.line .. end)
    blocks.push(lines.slice(secMarkers[2].line).join('\n').replace(/\n+$/, '').replace(/\n+$/, ''));
  }

  // 递归切分超长块
  function splitChunk(text) {
    text = text.replace(/^\n+/, '');
    if (text.length <= LIMIT) return [text];
    const ls = text.split('\n');
    let charPos = 0, cut = -1, bestDist = Infinity;
    const mid = text.length / 2;
    for (let i = 0; i < ls.length; i++) {
      if (ls[i].trim() === '' && charPos >= 3000 && charPos <= LIMIT) {
        const d = Math.abs(charPos - mid);
        if (d < bestDist) { bestDist = d; cut = i; }
      }
      charPos += ls[i].length + 1;
    }
    if (cut === -1) {
      charPos = 0;
      for (let i = 0; i < ls.length; i++) {
        if (/^\d{1,2}\.\s/.test(ls[i].trim()) && charPos >= 3000 && charPos <= LIMIT) { cut = i; break; }
        charPos += ls[i].length + 1;
      }
    }
    if (cut === -1) {
      charPos = 0;
      for (let i = 0; i < ls.length; i++) { charPos += ls[i].length + 1; if (charPos >= 3200) { cut = i; break; } }
    }
    if (cut === -1 || cut >= ls.length) {
      const m = Math.min(Math.max(3000, Math.floor(text.length / 2)), text.length - 1);
      return [text.substring(0, m), text.substring(m)];
    }
    const b = ls.slice(0, cut).join('\n').replace(/\n+$/, '');
    const a = ls.slice(cut).join('\n').replace(/^\n+/, '');
    return [...splitChunk(b), ...splitChunk(a)];
  }

  const finalBlocks = [];
  for (const b of blocks) {
    const trimmed = b.replace(/^\n+/, '').replace(/\n+$/, '');
    if (trimmed.length > 0) finalBlocks.push(...splitChunk(trimmed));
  }

  if (finalBlocks.length > 0) {
    fs.writeFileSync(fp, finalBlocks.join('\n\n---CHUNK-SPLIT---\n\n'), 'utf8');
    const maxLen = Math.max(...finalBlocks.map(b => b.length));
    console.log(file + ': ' + finalBlocks.length + ' blocks, max ' + maxLen + 'ch');
  }
}

// 验证所有文件
console.log('\n=== FULL VERIFICATION ===');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
let totalChunks = 0, violations = 0, maxLen = 0;
for (const f of files) {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  const parts = t.split('---CHUNK-SPLIT---');
  totalChunks += parts.length;
  parts.forEach(p => {
    if (p.length > maxLen) maxLen = p.length;
    if (p.length >= 4000) { violations++; console.log('VIOLATION: ' + f + ' (' + p.length + 'ch)'); }
  });
  // 检查隔离格式
  const ls = t.split('\n');
  for (let i = 0; i < ls.length; i++) {
    if (ls[i].trim() === '---CHUNK-SPLIT---') {
      if ((i === 0 || ls[i-1].trim() !== '') || (i >= ls.length-1 || ls[i+1].trim() !== '')) {
        console.log('FORMAT: ' + f + ' L' + (i+1) + ' not isolated');
      }
    }
  }
}
console.log('Total chunks: ' + totalChunks + ', Max: ' + maxLen + ', Violations: ' + violations);
console.log('Result: ' + (violations === 0 ? 'PASS' : 'FAIL'));
