/**
 * 修复 decompose/preview/route.ts 的 Part 检测逻辑
 * 1. 增强 OCR 损坏字符映射
 * 2. 重复 Part I 上下文修正
 * 3. 关键词推断增强
 */
const fs = require('fs');
const filePath = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// ===== 修复1: 增强 parseOcrCorruptExtended 函数 =====
// 在 parseOcrCorrupt 函数后面添加扩展版本
const ocrOld = `  if (ch === 'W') return 4;
  return null;
}`;

const ocrNew = `  if (ch === 'W') return 4;
  return null;
}

/** 扩展OCR损坏处理：覆盖更多变体 */
function parseOcrCorruptExtended(text: string): number | null {
  // ]I 鈫 III(3), :U: 鈫 II(2), N 鈫 IV(4)
  if (/Part\\s*\\]I/.test(text)) return 3;  // # Part ]I Reading
  if (/Part\\s*:U:/.test(text)) return 2;  // # Part :U: Listening
  if (/Part\\s*N\\b/.test(text) && !/Part\\s*New/.test(text)) return 4;  // # Part N Translation
  if (/Part\\s*IIII/.test(text)) return 4; // # Part IIII
  if (/Part\\s*\\u516c/.test(text)) return 4; // Part 鍏? (OCR of 鍏? IV)
  return parseOcrCorrupt(text);
}`;
content = content.replace(ocrOld, ocrNew);

// ===== 修复2: 修改 extractPartNumber 使用扩展OCR + 上下文修正 =====
const extractOld = `  // (d) OCR鎹熷洿瀛楃
  return parseOcrCorruptExtended(stripped);
}`;

const extractNew = `  // (d) OCR鎹熷洿瀛楃
  return parseOcrCorruptExtended(stripped);
}

/**
 * 鐗规畩澶勭悊锛氬綋 Part I 鍚庤窡 Listening/Comprehension鏃讹紝瀹為檯鏄 Part II
 * 鐢ㄤ簬 detectAllParts 绗竴灞傛妫€娴嬪悗鐨勪簩娆″鏍?*/
function contextualFixPartNumber(partIndex: number, line: string): number {
  if (partIndex === 1 && /Listening|Comprehension/i.test(line) && !/Reading/i.test(line)) {
    return 2; // Part I + Listening = Part II
  }
  return partIndex;
}`;
content = content.replace(extractOld, extractNew);

// ===== 修复3: detectAllParts 检测循环增加上下文修正 =====
const detectLoopOld = `    const pn = extractPartNumber(allLines[i]);
    if (pn !== null && pn >= 1 && pn <= 4 && !foundParts.has(pn)) {
      headers.push({ partIndex: pn, lineIndex: i, source: 'title' });
      foundParts.add(pn);
    }
  }`;

const detectLoopNew = `    const pn = extractPartNumber(allLines[i]);
    if (pn !== null && pn >= 1 && pn <= 4) {
      if (!foundParts.has(pn)) {
        headers.push({ partIndex: pn, lineIndex: i, source: 'title' });
        foundParts.add(pn);
      } else {
        // 閲嶅 Part 鍙凤細涓婁笅鏂囦慨姝?
        const fixed = contextualFixPartNumber(pn, allLines[i]);
        if (fixed !== pn && !foundParts.has(fixed)) {
          headers.push({ partIndex: fixed, lineIndex: i, source: 'title' });
          foundParts.add(fixed);
        }
      }
    }
  }`;
content = content.replace(detectLoopOld, detectLoopNew);

// ===== 修复4: 关键词推断增强 Listening 检测 =====
// 在 inferPartsByKeywords 的 Part II Listening 检测中，增加更宽松的匹配
const listenOld = `  // Part II Listening
  if (!foundParts.has(2)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\\s+Section\\s+A\\b/i.test(lines[i]) && /Directions.*hear/i.test(lines[i + 1] || '')) {
        result.push({ partIndex: 2, lineIndex: i });
        foundParts.add(2);
        break;`;

const listenNew = `  // Part II Listening
  if (!foundParts.has(2)) {
    for (let i = 0; i < lines.length; i++) {
      // 瀹芥硷細Section A + 涓嬩竴琛孌irections 鍚 hearing 鍏抽敭璇?      if (/^#{1,4}\\s+Section\\s+A\\b/i.test(lines[i])) {
        const nextFew = lines.slice(i + 1, i + 5).join(' ');
        if (/Directions.*hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) {
          result.push({ partIndex: 2, lineIndex: i });
          foundParts.add(2);
          break;
        }
      }
      // 鐩存帴鍖归厤 Listening 涓洪儴鏍囧?      if (/^#{1,4}\\s+(?:Part\\s+II\\s+)?Listening/i.test(lines[i]) && !foundParts.has(2)) {
        result.push({ partIndex: 2, lineIndex: i });
        foundParts.add(2);
        break;`;
content = content.replace(listenOld, listenNew);

// ===== 修复5: 关键词推断增强 Reading 检测（第二个 Section A）=====
const readOld = `    // 鎵剧簩涓?Section A锛圧eading 鐨?Section A锛?
    if (sectionALines.length >= 2 && found.has(2)) {
      const secondSectionA = sectionALines.find(l => l > (result.find(r => r.partIndex === 2)?.lineIndex || 0) + 50);
      if (secondSectionA) p3Line = secondSectionA;
    }`;

const readNew = `    // 鎵剧簩涓?Section A锛堥槄璇荤殑 Section A锛?    if (sectionALines.length >= 2 && found.has(2)) {
      const p2Line = result.find(r => r.partIndex === 2)?.lineIndex || 0;
      // 绗簩涓 Section A 涓?Reading    const secondSA = sectionALines.find(l => l > p2Line + 30);
      if (secondSA) p3Line = secondSA;
    }
    // 涓撳矚CET6锛氭棤Part II鏃讹紝绗竴涓?Section A + hearing = Part II锛涚簩涓?Section A = Part III    if (p3Line === -1 && sectionALines.length >= 2) {
      const firstSA = sectionALines[0];
      const secondSA = sectionALines[1];
      // 绗竴涓绗竴涓椂鍚彂鍏抽敭璇?      const firstDirs = lines.slice(firstSA + 1, firstSA + 5).join(' ');
      if (/hear|listen/i.test(firstDirs)) {
        // 绗竴涓槸 Listening锛岀簩涓槸 Reading        p3Line = secondSA;
      }
    }`;
content = content.replace(readOld, readNew);

// 写入文件
fs.writeFileSync(filePath, content, 'utf-8');
console.log('修复完成！');

// 验证
const verify = fs.readFileSync(filePath, 'utf-8');
console.log('parseOcrCorruptExtended 存在:', verify.includes('function parseOcrCorruptExtended'));
console.log('contextualFixPartNumber 存在:', verify.includes('function contextualFixPartNumber'));
console.log('上下文修正逻辑存在:', verify.includes('contextualFixPartNumber(pn'));
console.log('Listening 宽松匹配存在:', verify.includes('listen|conversation'));
