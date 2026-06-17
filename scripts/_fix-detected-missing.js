/**
 * 修复检测遗漏的 Part：对有内容但检测失败的源文件重新切分
 * 
 * 策略：对每个问题文件，先用三层检测，如果检测不到某个Part，
 * 则用位置推断兜底（基于已知Part和文件总行数）
 */
const fs = require('fs');
const path = require('path');

const ROOT4 = path.join(process.cwd(), 'data', '04_Fusion_Area');
const ROOT3 = path.join(process.cwd(), 'data', '03_Exam_Final');
const PART_NAMES = { 1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation' };

// ===== 增强检测（含更激进的位置推断） =====

const ROMAN_MAP = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };

function extractPartNumber(headingLine) {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();
  const uniMatch = stripped.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
  if (uniMatch) {
    const code = uniMatch[1].charCodeAt(0);
    const map = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5 };
    if (map[code]) return map[code];
  }
  const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V)(?![\u2160-\u2165\w])\b/i);
  if (romanMatch) {
    const r = romanMatch[1].toUpperCase();
    if (ROMAN_MAP[r]) return ROMAN_MAP[r];
  }
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) {
    const n = parseInt(arabicMatch[1], 10);
    if (n >= 1 && n <= 5) return n === 5 ? 4 : n;
  }
  if (/Part\s*\]I/.test(stripped)) return 3;
  if (/Part\s*:U:/.test(stripped)) return 2;
  if (/Part\s*N\b/.test(stripped) && !/Part\s*New/.test(stripped)) return 4;
  if (/Part\s*IIII/.test(stripped)) return 4;
  if (/Part\s*皿/.test(stripped)) return 4;
  const ocrMatch = stripped.match(/Part\s*([HhKkNnFfWwIl][\[\]_]*)\b/);
  if (ocrMatch) {
    const ch = ocrMatch[1][0].toUpperCase();
    if ('HK'.includes(ch)) return 2;
    if ('NF'.includes(ch)) return 4;
    if (ch === 'M' || ch === 'I') {
      const rest = ocrMatch[1];
      if (/^[Mm](?![a-zA-Z])/.test(rest) || /^in\b/.test(rest)) return 3;
      return 2;
    }
    if (ch === 'W') return 4;
  }
  return null;
}

function contextualFixPartNumber(partIndex, line) {
  if (partIndex === 1 && /Listening/i.test(line) && !/Reading/i.test(line)) return 2;
  if (partIndex === 2 && /Reading/i.test(line) && !/Listening/i.test(line)) return 3;
  return partIndex;
}

function detectPartsBasic(lines) {
  const headers = [];
  const found = new Set();
  for (let i = 0; i < lines.length; i++) {
    const pn = extractPartNumber(lines[i]);
    if (pn !== null && pn >= 1 && pn <= 4) {
      if (!found.has(pn)) {
        headers.push({ partIndex: pn, lineIndex: i });
        found.add(pn);
      } else {
        const fixed = contextualFixPartNumber(pn, lines[i]);
        if (fixed !== pn && !found.has(fixed)) {
          headers.push({ partIndex: fixed, lineIndex: i });
          found.add(fixed);
        }
      }
    }
  }
  headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return { headers, found };
}

function aggressiveInferMissing(lines, headers, found) {
  // 找所有 Section A 位置
  const sectionALines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) sectionALines.push(i);
  }

  // Part I Writing: 文件开头或 Writing 标题
  if (!found.has(1)) {
    // 检查文件最后100行是否有 Part I / Writing（某些文件 Writing 在末尾）
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
      if (/^#{1,4}\s+Part\s+I\b/i.test(lines[i]) && !/Comprehension|Listening/i.test(lines[i])) {
        headers.push({ partIndex: 1, lineIndex: i });
        found.add(1);
        break;
      }
      if (/^#{1,4}\s+Writing\b/i.test(lines[i])) {
        headers.push({ partIndex: 1, lineIndex: i });
        found.add(1);
        break;
      }
    }
    // 如果还没找到，找文件开头的 Writing Directions
    if (!found.has(1)) {
      for (let i = 0; i < Math.min(lines.length, 60); i++) {
        if (/Directions\s*[:：].*(?:write|essay|submission|inviting|proposal)/i.test(lines[i])) {
          headers.push({ partIndex: 1, lineIndex: i });
          found.add(1);
          break;
        }
      }
    }
  }

  // Part II Listening: 第一个 Section A + hear/listen 关键词
  if (!found.has(2)) {
    for (const saLine of sectionALines) {
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
        headers.push({ partIndex: 2, lineIndex: saLine });
        found.add(2);
        break;
      }
    }
  }

  // Part III Reading: 第二个 Section A（Reading 的 Section A）
  if (!found.has(3)) {
    const p2Line = headers.find(h => h.partIndex === 2)?.lineIndex ?? -1;
    if (p2Line >= 0 && sectionALines.length >= 2) {
      // 找 Part II 之后的第一个 Section A（但跳过 Part II 自己的 Section A）
      const readingSA = sectionALines.find(l => l > p2Line + 50);
      if (readingSA) {
        headers.push({ partIndex: 3, lineIndex: readingSA });
        found.add(3);
      }
    }
    // 备用：Reading Comprehension 关键词
    if (!found.has(3)) {
      for (let i = 0; i < lines.length; i++) {
        if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) {
          if (!found.has(3)) {
            headers.push({ partIndex: 3, lineIndex: i });
            found.add(3);
            break;
          }
        }
      }
    }
  }

  // Part IV Translation: 文件末尾
  if (!found.has(4)) {
    // 从后往前找 Translation 标题
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
      if (/Translation/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) {
        headers.push({ partIndex: 4, lineIndex: i });
        found.add(4);
        break;
      }
    }
    // 兜底：文件末尾
    if (!found.has(4)) {
      headers.push({ partIndex: 4, lineIndex: Math.max(0, lines.length - 15) });
      found.add(4);
    }
  }

  headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return headers;
}

function detectAll(lines) {
  const { headers, found } = detectPartsBasic(lines);
  return aggressiveInferMissing(lines, headers, found);
}

// ===== 需要修复的文件列表 =====

const filesToFix = [
  // 检测遗漏：源文件有内容但没被正确识别
  { sid: 'CET6_2017_12_S3', ty: 'Question', yearMonth: '2017_12', set: 'S3', exam: 'CET6', issue: '缺Reading' },
  { sid: 'CET6_2018_06_S3', ty: 'Question', yearMonth: '2018_06', set: 'S3', exam: 'CET6', issue: '缺Reading' },
  { sid: 'CET4_2024_12_S2', ty: 'Question', yearMonth: '2024_12', set: 'S2', exam: 'CET4', issue: '缺Writing(在文件末尾)' },
  { sid: 'CET6_2024_12_S3', ty: 'Question', yearMonth: '2024_12', set: 'S3', exam: 'CET6', issue: '无Part标题' },
  { sid: 'CET4_2018_12_S3', ty: 'Analysis', yearMonth: '2018_12', set: 'S3', exam: 'CET4', issue: '缺Writing' },
  { sid: 'CET6_2018_12_S3', ty: 'Analysis', yearMonth: '2018_12', set: 'S3', exam: 'CET6', issue: '缺Writing+Listening' },
];

function findSourceFile(exam, ty, yearMonth, set) {
  const dir = path.join(ROOT3, exam, ty);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const setLetter = set.replace('S', '');
  for (const f of files) {
    const m = f.match(/^(\d{4}_\d{2}_S(\d+))_/);
    if (m) {
      const fYM = m[1].split('_').slice(0, 2).join('_');
      const fSet = 'S' + m[2];
      if (fYM === yearMonth && fSet === set) return path.join(dir, f);
    }
  }
  const ym = yearMonth.replace('_', '.');
  for (const f of files) {
    if (f.includes(ym) && f.includes(setLetter)) return path.join(dir, f);
  }
  return null;
}

function main() {
  console.log('=== 修复检测遗漏的文件 ===\n');
  
  let totalFixed = 0;
  
  for (const item of filesToFix) {
    console.log(`--- ${item.sid} [${item.ty}] (${item.issue}) ---`);
    
    const srcPath = findSourceFile(item.exam, item.ty, item.yearMonth, item.set);
    if (!srcPath) {
      console.log('  源文件未找到，跳过\n');
      continue;
    }
    
    const raw = fs.readFileSync(srcPath, 'utf-8');
    let content = raw;
    if (raw.startsWith('---')) {
      const endIdx = raw.indexOf('---', 3);
      if (endIdx !== -1) content = raw.substring(endIdx + 3).trim();
    }
    const lines = content.split('\n');
    console.log(`  源文件: ${path.basename(srcPath)} (${lines.length} lines)`);
    
    const headers = detectAll(lines);
    console.log(`  检测到 ${headers.length} 个Part:`);
    headers.forEach(h => console.log(`    Part ${h.partIndex} (${PART_NAMES[h.partIndex]}) @ L${h.lineIndex + 1}`));
    
    // 删除旧文件
    const targetDir = path.join(ROOT4, item.exam, item.sid, item.ty);
    if (fs.existsSync(targetDir)) {
      const oldFiles = fs.readdirSync(targetDir).filter(f => f.endsWith('.md'));
      for (const f of oldFiles) {
        fs.unlinkSync(path.join(targetDir, f));
      }
    }
    
    // 写入新文件
    const side = item.ty === 'Question' ? 'Q' : 'A';
    let written = 0;
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].lineIndex;
      const end = i + 1 < headers.length ? headers[i + 1].lineIndex : lines.length;
      const blockContent = lines.slice(start, end).join('\n');
      if (blockContent.trim().length === 0) continue;
      
      const partIndex = headers[i].partIndex;
      const partName = PART_NAMES[partIndex] || 'Part' + partIndex;
      const filename = `${item.sid}_${side}_01_${partName}.md`;
      
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, filename), blockContent, 'utf-8');
      written++;
      totalFixed++;
      console.log(`  写入: ${filename} (${blockContent.length} bytes)`);
    }
    
    console.log(`  结果: ${written} 个文件\n`);
  }
  
  console.log(`=== 总计修复: ${totalFixed} 个文件 ===`);
  
  // 最终统计
  let total = 0, empty = 0;
  for (const lv of ['CET4', 'CET6']) {
    const lp = path.join(ROOT4, lv);
    if (!fs.existsSync(lp)) continue;
    for (const sid of fs.readdirSync(lp)) {
      const sp = path.join(lp, sid);
      if (!fs.statSync(sp).isDirectory() || !sid.startsWith('CET')) continue;
      for (const ty of ['Question', 'Analysis']) {
        const td = path.join(sp, ty);
        if (!fs.existsSync(td)) continue;
        for (const f of fs.readdirSync(td).filter(f => f.endsWith('.md'))) {
          const sz = fs.statSync(path.join(td, f)).size;
          total++;
          if (sz === 0) empty++;
        }
      }
    }
  }
  console.log(`\n04区最终统计: ${total} 个文件, ${empty} 个空文件`);
}

main();
