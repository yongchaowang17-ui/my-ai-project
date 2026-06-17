/**
 * 修复 Part V → Part IV 映射（CET6 翻译标记为 Part V 应归为 Part 4）
 * + 修复 Section A 关联推断
 */
const fs = require('fs');

// ===== 1. preview/route.ts: ROMAN_MAP V→4 =====
const f1 = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c1 = fs.readFileSync(f1, 'utf-8');

// 修复 ROMAN_MAP
c1 = c1.replace(
  "const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5 };",
  "const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };  // CET6 翻译标记为 Part V，归为 Part 4"
);
console.log('1. preview ROMAN_MAP V→4');

// 修复 extractPartNumber 中阿拉伯数字 Part 5→4
c1 = c1.replace(
  /if \(n >= 1 && n <= 5\) return n;/g,
  'if (n >= 1 && n <= 5) return n === 5 ? 4 : n;  // Part 5 → Part 4 (Translation)'
);
console.log('2. preview Arabic Part 5→4');

// 修复 inferByPosition 中的 Section A 检测：验证是否为听力
const oldListenCheck = `  // Part II Listening: 第一个 Section A 的位置（需验证是听力还是阅读）
  if (!found.has(2)) {
    let listeningLine = -1;
    for (const saLine of sectionALines) {
      // 检查 Section A 的 Directions 是否包含听力关键词
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        listeningLine = saLine;
        break;
      }
    }
    if (listeningLine !== -1) {
      result.push({ partIndex: 2, lineIndex: listeningLine });
    } else if (sorted.length >= 2) {
      result.push({ partIndex: 2, lineIndex: sorted[0].lineIndex });
    }
  }`;

const newListenCheck = `  // Part II Listening: 第一个 Section A（验证 Directions 含听力关键词）
  if (!found.has(2)) {
    for (const saLine of sectionALines) {
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        result.push({ partIndex: 2, lineIndex: saLine });
        break;
      }
    }
  }`;

if (c1.includes(oldListenCheck)) {
  c1 = c1.replace(oldListenCheck, newListenCheck);
  console.log('3. preview Section A Listening validation tightened');
} else {
  console.log('3. preview Section A: old code not found (checking alternative)');
}

// 修复 inferByPosition 中的 Part III Reading：也检查 Section A
const oldReadFallback = `    // Part III Reading: 在 Part IV 之前但未被标记
    if (!found.has(3) && sorted.length >= 1) {
      const last = sorted[sorted.length - 1];
      if (last.partIndex === 4 && last.lineIndex > 50) {
        const prev = sorted.length >= 2 ? sorted[sorted.length - 2].lineIndex : 0;
        const mid = Math.floor((prev + last.lineIndex) / 2);
        result.push({ partIndex: 3, lineIndex: mid });
      }
    }`;

const newReadFallback = `    // Part III Reading: 找第二个 Section A 或 Reading Comprehension 标题
    if (!found.has(3)) {
      let p3Line = -1;
      // 找 Reading Comprehension 标题
      for (let i = 0; i < lines.length; i++) {
        if (/Reading\\s+Comprehension/i.test(lines[i]) && /^#{1,4}\\s/.test(lines[i])) {
          p3Line = i; break;
        }
      }
      // 找第二个 Section A（跳过已被标记为 Part II 的 Section A）
      if (p3Line === -1) {
        const p2Line = result.find(r => r.partIndex === 2)?.lineIndex ?? -1;
        for (const saLine of sectionALines) {
          if (saLine > p2Line + 30) { p3Line = saLine; break; }
        }
      }
      // 兜底：在已知 Part 之间的中间点
      if (p3Line === -1 && sorted.length >= 1) {
        const last = sorted[sorted.length - 1];
        if (last.partIndex === 4 && last.lineIndex > 50) {
          const prev = sorted.length >= 2 ? sorted[sorted.length - 2].lineIndex : 0;
          p3Line = Math.floor((prev + last.lineIndex) / 2);
        }
      }
      if (p3Line !== -1) result.push({ partIndex: 3, lineIndex: p3Line });
    }`;

if (c1.includes(oldReadFallback)) {
  c1 = c1.replace(oldReadFallback, newReadFallback);
  console.log('4. preview Part III Reading fallback enhanced');
} else {
  console.log('4. preview Part III: old code not found');
}

fs.writeFileSync(f1, c1, 'utf-8');

// ===== 2. import/route.ts: ROMAN_MAP V→4 =====
const f2 = 'D:/my-ai-Project/app/api/decompose/import/route.ts';
let c2 = fs.readFileSync(f2, 'utf-8');
c2 = c2.replace(
  "const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5 };",
  "const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };"
);
c2 = c2.replace(
  /if \(n >= 1 && n <= 5\) return n;/g,
  'if (n >= 1 && n <= 5) return n === 5 ? 4 : n;'
);
fs.writeFileSync(f2, c2, 'utf-8');
console.log('5. import ROMAN_MAP V→4');

// ===== 3. page.tsx: ROMAN_MAP V→4 =====
const f3 = 'D:/my-ai-Project/app/review/decompose/page.tsx';
let c3 = fs.readFileSync(f3, 'utf-8');
c3 = c3.replace(
  "const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5 };",
  "const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };"
);
// 也修复 page.tsx 中的位置推断 Section A 检测
const oldPageSectionA = `        // 验证第一个 Section A 是否是听力（检查 Directions 内容）
        let listenLine = -1;
        for (let i = 0; i < lines.length; i++) {
          if (/^#{1,4}\\s+Section\\s+A\\b/i.test(lines[i])) {
            const nf = lines.slice(i+1, i+5).join(' ');
            if (/hear|listen|conversation|passage.*heard|news report/i.test(nf)) {
              listenLine = i; break;
            }
          }
        }
        if (listenLine !== -1) {
          partHeaders.push({ partIndex: 2, lineIndex: listenLine });
        } else {
          partHeaders.push({ partIndex: 2, lineIndex: partHeaders[0].lineIndex });
        }`;

const newPageSectionA = `        // 验证第一个 Section A 是否是听力
        for (let i = 0; i < lines.length; i++) {
          if (/^#{1,4}\\s+Section\\s+A\\b/i.test(lines[i])) {
            const nf = lines.slice(i+1, i+5).join(' ');
            if (/hear|listen|conversation|passage.*heard|news report/i.test(nf)) {
              partHeaders.push({ partIndex: 2, lineIndex: i });
              break;
            }
          }
        }
        if (!foundParts.has(2)) {
          partHeaders.push({ partIndex: 2, lineIndex: partHeaders[0].lineIndex });
        }`;

if (c3.includes(oldPageSectionA)) {
  c3 = c3.replace(oldPageSectionA, newPageSectionA);
  console.log('6. page Section A validation tightened');
} else {
  console.log('6. page Section A: old code not found');
}

fs.writeFileSync(f3, c3, 'utf-8');
console.log('\nDone!');
