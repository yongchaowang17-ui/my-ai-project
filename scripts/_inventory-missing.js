/**
 * 精确盘点 04 区缺失情况
 * 区分：乱码文件 / 源文件不存在 / 检测遗漏 / 合理缺失
 */
const fs = require('fs');
const p = require('path');

const ROOT3 = 'data/03_Exam_Final';
const ROOT4 = 'data/04_Fusion_Area';

// 扫描04区所有不完整的SetId
const expected = ['Question:Writing','Question:Listening','Question:Reading','Question:Translation',
                  'Analysis:Writing','Analysis:Listening','Analysis:Reading','Analysis:Translation'];

const incomplete = [];
for (const lv of ['CET4','CET6']) {
  const lp = p.join(ROOT4, lv);
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
    if (missing.length > 0) incomplete.push({ sid, lv: lv, missing });
  }
}

// 检查03区源文件是否存在
function findSourceFile(exam, ty, sid) {
  const dir = p.join(ROOT3, exam, ty);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const parts = sid.split('_');
  const yearMonth = parts.slice(1, 3).join('_');
  const setNum = parts[3];
  for (const f of files) {
    const m = f.match(/^(\d{4}_\d{2}_S(\d+))_/);
    if (m) {
      const fYM = m[1].split('_').slice(0, 2).join('_');
      const fSet = 'S' + m[2];
      if (fYM === yearMonth && fSet === setNum) return p.join(dir, f);
    }
  }
  const ym = yearMonth.replace('_', '.');
  const setLetter = setNum.replace('S', '');
  for (const f of files) {
    if (f.includes(ym) && f.includes(setLetter)) return p.join(dir, f);
  }
  return null;
}

// 检查乱码
function hasGarbled(content) {
  const garbled = (content.match(/\uFFFD/g) || []).length;
  return garbled;
}

// 分类
const noSource = [];      // 源文件不存在
const truncated = [];     // 源文件截断（内容不全）
const garbled = [];       // 源文件有乱码
const detectFail = [];    // 检测遗漏（可修复）
const legitimate = [];    // 合理缺失

for (const item of incomplete) {
  for (const miss of item.missing) {
    const [ty, part] = miss.split(':');
    const exam = item.lv;
    
    // Analysis缺Listening 是合理缺失
    if (ty === 'Analysis' && part === 'Listening') {
      legitimate.push({ ...item, part: miss, reason: '解析文件不含听力原文' });
      continue;
    }
    
    // 检查源文件
    const src = findSourceFile(exam, ty, item.sid);
    if (!src) {
      noSource.push({ ...item, part: miss, exam, ty });
      continue;
    }
    
    const raw = fs.readFileSync(src, 'utf-8');
    const garbledCount = hasGarbled(raw);
    const lines = raw.split('\n');
    
    // 检查源文件是否真的包含该Part的内容
    let hasContent = false;
    if (part === 'Writing') hasContent = /Directions.*write|essay|submission|inviting|proposal/i.test(raw) || /Writing/i.test(raw);
    if (part === 'Listening') hasContent = /hear|listen|conversation|news report|Listening/i.test(raw);
    if (part === 'Reading') hasContent = /Reading|Comprehension|passage.*blanks/i.test(raw);
    if (part === 'Translation') hasContent = /Translation|translate.*Chinese/i.test(raw);
    
    if (garbledCount > 100) {
      garbled.push({ ...item, part: miss, src: p.basename(src), garbledCount, lines: lines.length });
    } else if (!hasContent) {
      truncated.push({ ...item, part: miss, src: p.basename(src), lines: lines.length });
    } else {
      detectFail.push({ ...item, part: miss, src: p.basename(src), lines: lines.length });
    }
  }
}

console.log('========================================');
console.log('04 区缺失内容精确盘点');
console.log('========================================\n');

console.log('【需要提供源文件才能修复】');
console.log('  03区源文件不存在：', noSource.length, '个');
noSource.forEach(n => console.log(`    ${n.sid} [${n.ty}] 缺${n.part}`));
console.log('');

console.log('【源文件截断/内容不全】');
console.log('  源文件不含该Part内容：', truncated.length, '个');
truncated.forEach(t => console.log(`    ${t.sid} [${t.ty}] 缺${t.part} (源文件${t.lines}行, ${t.src})`));
console.log('');

console.log('【源文件有严重乱码】');
console.log('  OCR损坏字符>100处：', garbled.length, '个');
garbled.forEach(g => console.log(`    ${g.sid} [${g.ty}] 缺${g.part} (${g.garbledCount}处乱码, ${g.lines}行, ${g.src})`));
console.log('');

console.log('【检测遗漏/可自动修复】');
console.log('  源文件有内容但没检测到：', detectFail.length, '个');
detectFail.forEach(d => console.log(`    ${d.sid} [${d.ty}] 缺${d.part} (源文件${d.lines}行, ${d.src})`));
console.log('');

console.log('【合理缺失】');
console.log('  源文件本身不含该Part：', legitimate.length, '个');
console.log('');

console.log('========================================');
console.log('总结');
console.log('========================================');
console.log(`需要提供源文件: ${noSource.length} 个`);
console.log(`需要提供原件修复乱码: ${garbled.length} 个`);
console.log(`自动可修复: ${detectFail.length} 个`);
console.log(`合理缺失(无需修复): ${legitimate.length} 个`);
console.log(`源文件截断(可能需要原件): ${truncated.length} 个`);
