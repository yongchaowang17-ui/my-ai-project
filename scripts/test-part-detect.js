var fs = require('fs');
var p = require('path');

function extractPartNumber(h) {
  var s = h.replace(/^#{1,4}\s+/, '').trim();
  var rm = s.match(/^Part\s*(I{1,3}|IV|V|I?V?)\b/i);
  if (rm) {
    var romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
    var r = rm[1].toUpperCase();
    if (romanMap[r]) return romanMap[r];
  }
  return null;
}

var fp = p.join(process.cwd(), 'data', '03_Exam_Final', 'CET6', 'Analysis', '2016_12_S2_A_01.md');
var raw = fs.readFileSync(fp, 'utf-8');
var lines = raw.split('\n');

console.log('=== Part detection test ===');
var found = [];
for (var i = 0; i < lines.length; i++) {
  var l = lines[i];
  if (/^#{1,4}\s.*Part\s*/i.test(l)) {
    var pn = extractPartNumber(l);
    console.log('L' + (i+1) + ' matches regex: "' + l.substring(0, 60) + '" → Part ' + pn);
    if (pn !== null) {
      if (!found.find(function(h) { return h.partIndex === pn; })) {
        found.push({ partIndex: pn, lineIndex: i });
      } else {
        console.log('  SKIPPED (duplicate Part ' + pn + ')');
      }
    } else {
      console.log('  WARNING: regex matched but extractPartNumber returned null');
    }
  }
}
console.log('\nDetected parts:', found.map(function(h) { return 'Part ' + h.partIndex + ' at L' + (h.lineIndex+1); }).join(', '));
console.log('Total:', found.length);

// 也检查其他可能的 Part 标题格式
console.log('\n=== All lines containing "Part" (case insensitive) ===');
for (var j = 0; j < lines.length; j++) {
  if (lines[j] && /^#{1,4}/.test(lines[j]) && /part/i.test(lines[j])) {
    console.log('L' + (j+1) + ': ' + lines[j].substring(0, 80));
  }
}
