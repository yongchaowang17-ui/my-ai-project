const fs = require('fs');
const path = require('path');
const DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function isChinese(text) {
  return /[\u4e00-\u9fff]{10,}/.test(text);
}

function restructure(content) {
  const lines = content.split('\n');
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---' && i > 0) { fmEnd = i; break; }
  }
  if (fmEnd === -1) return content;
  const fm = lines.slice(0, fmEnd + 1);
  const body = lines.slice(fmEnd + 1);

  // Step 1: Remove --- separators, 注意, 答案与解析
  const step1 = [];
  let wait = false;
  for (const line of body) {
    const t = line.trim();
    if (t === '---') { wait = true; continue; }
    if (wait) {
      if (t === '') continue;
      if (/答案[与和]?解析/.test(t) || /注意[:：]此部分试题/.test(t)) { wait = false; continue; }
      wait = false;
    }
    if (/^#*\s*答案[与和]?解析/.test(t)) continue;
    if (/^注意[:：]此部分试题请在答题卡/.test(t)) continue;
    step1.push(line);
  }

  // Step 2: Remove Chinese section headers
  const headers = [];
  for (let i = 0; i < step1.length; i++) {
    const t = step1[i].trim();
    if (/^#\s*(Section\s*[A-C]|Passage\s*(One|Two))/i.test(t)) {
      let nextLine = '';
      for (let j = i + 1; j < Math.min(i + 5, step1.length); j++) {
        if (step1[j].trim() !== '') { nextLine = step1[j]; break; }
      }
      headers.push({ index: i, isChinese: isChinese(nextLine) });
    }
  }

  const removeSet = new Set();
  for (const h of headers) {
    if (h.isChinese) removeSet.add(h.index);
  }

  const result = [...fm];
  for (let i = 0; i < step1.length; i++) {
    if (removeSet.has(i)) continue;
    result.push(step1[i]);
  }
  return result.join('\n');
}

let count = 0;
for (const exam of ['CET4', 'CET6']) {
  const dir = path.join(DIR, exam, 'Reading');
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  let n = 0;
  for (const file of files) {
    const fp = path.join(dir, file);
    const before = fs.readFileSync(fp, 'utf-8');
    const after = restructure(before);
    if (after !== before) { fs.writeFileSync(fp, after, 'utf-8'); n++; count++; }
  }
  console.log(exam + ': ' + n + '/' + files.length);
}
console.log('Total: ' + count);
