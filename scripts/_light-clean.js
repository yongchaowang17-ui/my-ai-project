/**
 * 轻量清理：只移除 --- 分隔符、答案与解析标签、注意行
 * 不动任何题块内容
 */
const fs = require('fs');
const path = require('path');

const DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function lightClean(content) {
  const lines = content.split('\n');
  // 找 frontmatter 结束
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---' && i > 0) { fmEnd = i; break; }
  }
  if (fmEnd === -1) return content;

  const out = [];
  // 保留 frontmatter
  for (let i = 0; i <= fmEnd; i++) out.push(lines[i]);

  let skipNext = false;
  for (let i = fmEnd + 1; i < lines.length; i++) {
    const t = lines[i].trim();

    // 跳过 --- 分隔符
    if (t === '---') { skipNext = true; continue; }

    // --- 后面紧跟的空行/答案标签/注意行也跳过
    if (skipNext) {
      if (t === '') continue;
      if (/答案[与和]?解析/.test(t)) { skipNext = false; continue; }
      if (/注意[:：]此部分试题/.test(t)) { skipNext = false; continue; }
      skipNext = false;
    }

    // 独立的答案与解析标签
    if (/^#*\s*答案[与和]?解析\s*\*{0,2}$/.test(t)) continue;

    // 注意行
    if (/^注意[:：]此部分试题请在答题卡/.test(t)) continue;

    out.push(lines[i]);
  }

  return out.join('\n');
}

let count = 0;
for (const exam of ['CET4', 'CET6']) {
  for (const part of ['Writing', 'Listening', 'Reading', 'Translation']) {
    const dir = path.join(DIR, exam, part);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const fp = path.join(dir, file);
      const c = fs.readFileSync(fp, 'utf-8');
      const r = lightClean(c);
      if (r !== c) { fs.writeFileSync(fp, r, 'utf-8'); count++; }
    }
  }
}
console.log('轻量清理完成:', count, 'files');
