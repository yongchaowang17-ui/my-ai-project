const fs = require('fs');
const path = require('path');
const preview = JSON.parse(fs.readFileSync('D:/my-ai-Project/data/synthesis-preview.json', 'utf-8'));
const items = Array.isArray(preview) ? preview : (preview.items || []);
const DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

let c = 0;
items.forEach(item => {
  if (!item.id || !item.id.includes('Reading')) return;
  const m = item.id.match(/^(CET[46])_(\d{4})_(\d{2})_S(\d+)_(.+)$/);
  if (!m) return;
  const key = m[1] + '_' + m[2] + '_' + m[3] + '_S' + m[4];
  const dir = path.join(DIR, m[1], m[5]);
  const fp = path.join(dir, item.id + '.md');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fm = '---\nexam: ' + m[1] + '\nsetId: ' + key + '\npartName: Reading\ntype: synthesized\ncreatedAt: ' + (item.createdAt || new Date().toISOString()) + '\n---\n\n';
  fs.writeFileSync(fp, fm + item.content.trim() + '\n', 'utf-8');
  c++;
});
console.log('Restored Reading:', c);
