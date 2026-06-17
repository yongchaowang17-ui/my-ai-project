/**
 * 扫描 04 区不完整的 SetId，输出缺失清单
 */
const fs = require('fs');
const p = require('path');

const root4 = 'data/04_Fusion_Area';
const expected = ['Question:Writing','Question:Listening','Question:Reading','Question:Translation','Analysis:Writing','Analysis:Listening','Analysis:Reading','Analysis:Translation'];

const incomplete = [];
let complete = 0;

for (const lv of ['CET4','CET6']) {
  const lp = p.join(root4, lv);
  if (!fs.existsSync(lp)) continue;
  for (const sid of fs.readdirSync(lp)) {
    const sp = p.join(lp, sid);
    if (!fs.statSync(sp).isDirectory() || !sid.startsWith('CET')) continue;
    const parts = new Map();
    for (const ty of ['Question','Analysis']) {
      const tdp = p.join(sp, ty);
      if (!fs.existsSync(tdp)) continue;
      for (const f of fs.readdirSync(tdp).filter(f => f.endsWith('.md'))) {
        const m = f.match(/(Writing|Listening|Reading|Translation)/);
        if (m) parts.set(ty + ':' + m[1], f);
      }
    }
    const missing = expected.filter(e => !parts.has(e));
    if (missing.length > 0) incomplete.push({ sid, missing });
    else complete++;
  }
}

console.log('完整 SetId:', complete);
console.log('不完整 SetId:', incomplete.length);
console.log(JSON.stringify(incomplete, null, 2));
