/**
 * 三层 Part Detection Engine (shared library)
 * Used by preview API, import API, and fix scripts.
 */

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
  if (romanMatch) { const r = romanMatch[1].toUpperCase(); if (ROMAN_MAP[r]) return ROMAN_MAP[r]; }
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) { const n = parseInt(arabicMatch[1], 10); if (n >= 1 && n <= 5) return n === 5 ? 4 : n; }
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
    if (ch === 'M' || ch === 'I') { const rest = ocrMatch[1]; if (/^[Mm](?![a-zA-Z])/.test(rest) || /^in\b/.test(rest)) return 3; return 2; }
    if (ch === 'W') return 4;
  }
  return null;
}

function contextualFixPartNumber(partIndex, line) {
  if (partIndex === 1 && /Listening/i.test(line) && !/Reading/i.test(line)) return 2;
  if (partIndex === 2 && /Reading/i.test(line) && !/Listening/i.test(line)) return 3;
  return partIndex;
}

function isSectionALine(line) {
  return /^#{1,4}\s+Section\s*A\b/i.test(line) || /^#{1,4}\s+SectionA\b/i.test(line);
}

function inferPartsByKeywords(lines, foundParts, existingHeaders) {
  const result = [];
  // Part I Writing
  if (!foundParts.has(1)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,4}\s+Part\s+I\b/i.test(line) && !/Comprehension|Listening/i.test(line)) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
      if (/^#{1,4}\s+Writing\b/i.test(line)) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
      if (/<td>\s*Part\s+I\s+Writing/i.test(line)) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
      if (/Directions\s*[:：].*(?:write|essay|submission|inviting|proposal)/i.test(line) && i < 60) { result.push({partIndex:1,lineIndex:i}); foundParts.add(1); break; }
    }
  }
  // Part II Listening
  if (!foundParts.has(2)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+(?:Part\s*(?:I{1,2}|\u2161)\s+)?Listening/i.test(lines[i])) { result.push({partIndex:2,lineIndex:i}); foundParts.add(2); break; }
      if (/^#{1,4}\s+Listening\b/i.test(lines[i])) { result.push({partIndex:2,lineIndex:i}); foundParts.add(2); break; }
      if (isSectionALine(lines[i])) {
        const nextFew = lines.slice(i+1, i+5).join(' ');
        if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) { result.push({partIndex:2,lineIndex:i}); foundParts.add(2); break; }
      }
    }
  }
  // Part III Reading
  if (!foundParts.has(3)) {
    let p2Line = -1;
    const fromResult = result.find(r => r.partIndex === 2);
    if (fromResult) p2Line = fromResult.lineIndex;
    else if (existingHeaders) { const h = existingHeaders.find(h => h.partIndex === 2); if (h) p2Line = h.lineIndex; }
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+Reading\s+Comprehension/i.test(lines[i])) { result.push({partIndex:3,lineIndex:i}); foundParts.add(3); break; }
      if (isSectionALine(lines[i]) && p2Line >= 0) {
        if (i > p2Line + 30) { result.push({partIndex:3,lineIndex:i}); foundParts.add(3); break; }
      }
    }
  }
  // Part IV Translation
  if (!foundParts.has(4)) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+.*Translation\b/i.test(lines[i]) && !/Comprehension/i.test(lines[i])) { result.push({partIndex:4,lineIndex:i}); foundParts.add(4); break; }
      if (/^#{1,4}\s+Part\s+(?:IV|N|\u2163)\b/i.test(lines[i]) && !/Listening|Reading/i.test(lines[i])) { result.push({partIndex:4,lineIndex:i}); foundParts.add(4); break; }
      if (/translate\s+a\s+passage\s+from\s+Chinese/i.test(lines[i])) { result.push({partIndex:4,lineIndex:i}); foundParts.add(4); break; }
    }
  }
  return result;
}

function inferByPosition(lines, existing) {
  const result = [];
  const found = new Set(existing.map(h => h.partIndex));
  const sorted = [...existing].sort((a, b) => a.lineIndex - b.lineIndex);
  if (sorted.length === 0) return result;

  if (!found.has(1)) {
    let writingLine = -1;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
      if (/^#{1,4}\s+Part\s+I\b/i.test(lines[i]) && !/Comprehension|Listening/i.test(lines[i])) { writingLine = i; break; }
      if (/^#{1,4}\s+Writing\b/i.test(lines[i])) { writingLine = i; break; }
      if (/<td>\s*Part\s+I\s+Writing/i.test(lines[i])) { writingLine = i; break; }
    }
    if (writingLine === -1) {
      for (let i = 0; i < Math.min(lines.length, 60); i++) {
        if (/Directions\s*[:：].*(?:write|essay|submission|inviting|proposal)/i.test(lines[i])) { writingLine = i; break; }
      }
    }
    if (writingLine !== -1) result.push({partIndex: 1, lineIndex: writingLine});
  }

  const sectionALines = [];
  for (let i = 0; i < lines.length; i++) { if (isSectionALine(lines[i])) sectionALines.push(i); }
  if (!found.has(2)) {
    for (const saLine of sectionALines) {
      const nextFew = lines.slice(saLine + 1, saLine + 5).join(' ');
      if (/hear|listen|conversation|passage.*heard|news report/i.test(nextFew)) { result.push({partIndex: 2, lineIndex: saLine}); break; }
    }
  }

  if (!found.has(3)) {
    let p2Line = -1;
    const r2 = result.find(r => r.partIndex === 2);
    if (r2) p2Line = r2.lineIndex;
    else { const h2 = existing.find(h => h.partIndex === 2); if (h2) p2Line = h2.lineIndex; }
    if (p2Line >= 0 && sectionALines.length >= 2) {
      const secondSA = sectionALines.find(l => l > p2Line + 50);
      if (secondSA) result.push({partIndex: 3, lineIndex: secondSA});
    }
    if (!result.find(r => r.partIndex === 3)) {
      for (let i = 0; i < lines.length; i++) {
        if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) { result.push({partIndex: 3, lineIndex: i}); break; }
      }
    }
  }

  if (!found.has(4)) {
    const allSorted = [...existing, ...result].sort((a, b) => a.lineIndex - b.lineIndex);
    if (allSorted.length > 0 && allSorted[allSorted.length - 1].partIndex !== 4) {
      result.push({partIndex: 4, lineIndex: lines.length - 15});
    }
  }

  return result;
}

function detectAllParts(allLines) {
  const headers = [];
  const foundParts = new Set();
  // Layer 1: enhanced regex
  for (let i = 0; i < allLines.length; i++) {
    const pn = extractPartNumber(allLines[i]);
    if (pn !== null && pn >= 1 && pn <= 4) {
      if (!foundParts.has(pn)) { headers.push({partIndex: pn, lineIndex: i, source: 'title'}); foundParts.add(pn); }
      else { const fixed = contextualFixPartNumber(pn, allLines[i]); if (fixed !== pn && !foundParts.has(fixed)) { headers.push({partIndex: fixed, lineIndex: i, source: 'title'}); foundParts.add(fixed); } }
    }
  }
  // Layer 2: keyword inference (snapshot before to avoid double-counting)
  const snapBefore = new Set(foundParts);
  const kwResults = inferPartsByKeywords(allLines, foundParts, headers);
  for (const r of kwResults) { if (!snapBefore.has(r.partIndex)) { headers.push({partIndex: r.partIndex, lineIndex: r.lineIndex, source: 'keyword'}); } }
  // Layer 3: position inference
  const snapBeforePos = new Set(foundParts);
  const posResults = inferByPosition(allLines, headers);
  for (const r of posResults) { if (!snapBeforePos.has(r.partIndex)) { headers.push({partIndex: r.partIndex, lineIndex: r.lineIndex, source: 'position'}); } }
  headers.sort((a, b) => a.lineIndex - b.lineIndex);
  return headers;
}

module.exports = { extractPartNumber, contextualFixPartNumber, isSectionALine, inferPartsByKeywords, inferByPosition, detectAllParts, ROMAN_MAP };
