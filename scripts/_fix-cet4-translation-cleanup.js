/**
 * _fix-cet4-translation-cleanup.js
 * 逆转 DP 分词损坏，只合并非合法短词的碎片。
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Translation');
const MARKER = '---CHUNK-SPLIT---';

// 合法英文短词：不应被合并
const SAFE = new Set([
  'a','an','the','and','or','but','if','so','as','at','by','in','of','on','to','up',
  'is','it','its','he','she','we','they','their','them','his','her','our',
  'be','am','are','was','were','has','had','have','do','does','did','not','no',
  'can','could','will','would','should','may','might','must','shall',
  'for','from','with','that','this','these','those','which','who','whom',
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'very','also','just','only','even','still','already','yet','too',
  'all','each','every','both','few','more','most','other','some','such',
  'than','then','when','where','how','what','why','because','since',
  'about','after','before','between','into','through','during','without',
  'over','under','above','below','near','among','against','along',
  'been','being','get','got','gets','go','goes',
  'make','made','makes','take','took','takes','give','gave','gives',
  'come','came','comes','see','saw','sees','know','knew','knows',
  'think','thought','thinks','say','said','says','tell','told','tells',
  'use','used','uses','find','found','finds','want','wanted','wants',
  'need','needed','needs','try','tried','tries','keep','kept','keeps',
  'let','let','put','put','set','set','run','ran',
  'old','new','big','far','low','how','now','off','own','per','via','ago','nor',
  'may','shall','must','can','will','would','could','should'
]);

function isSafeShort(word) {
  return SAFE.has(word.toLowerCase());
}

function reverseDPDamage(text) {
  for (var round = 0; round < 10; round++) {
    var before = text;
    // "word x y" → 合并两个尾碎片（仅当碎片不是合法短词）
    text = text.replace(/\b([a-zA-Z]{3,})\s+([a-zA-Z]{1,3})\s+([a-zA-Z]{1,3})\b/g, function(m, w1, w2, w3) {
      if (isSafeShort(w2) || isSafeShort(w3)) return m;
      return w1 + w2 + w3;
    });
    // "word x" → 合并尾碎片（仅当碎片不是合法短词）
    text = text.replace(/\b([a-zA-Z]{4,})\s+([a-zA-Z]{1,2})\b/g, function(m, w1, w2) {
      if (isSafeShort(w2)) return m;
      return w1 + w2;
    });
    // "x word" → 合并首碎片（仅当碎片不是合法短词）
    text = text.replace(/\b([a-zA-Z]{1,2})\s+([a-zA-Z]{4,})\b/g, function(m, w1, w2) {
      if (isSafeShort(w1)) return m;
      return w1 + w2;
    });
    // "x y word" → 合并两个首碎片（仅当碎片不是合法短词）
    text = text.replace(/\b([a-zA-Z]{1,2})\s+([a-zA-Z]{1,2})\s+([a-zA-Z]{4,})\b/g, function(m, w1, w2, w3) {
      if (isSafeShort(w1) || isSafeShort(w2)) return m;
      return w1 + w2 + w3;
    });
    if (text === before) break;
  }
  return text;
}

function fixChineseYears(text) {
  text = text.replace(/到\s+年建成/g, '到2020年建成');
  text = text.replace(/\s+年,中国超越/g, '2011年,中国超越');
  text = text.replace(/(\d{4})\s{2,}年/g, '$1年');
  return text;
}

function processFile(filePath) {
  var content = fs.readFileSync(filePath, 'utf8');
  var text = content;

  text = text.replace(/^[ \t]*---CHUNK-SPLIT---[ \t]*$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = reverseDPDamage(text);
  text = fixChineseYears(text);

  text = text.trimStart() + '\n\n' + MARKER + '\n';
  text = MARKER + '\n\n' + text.trimEnd() + '\n';

  fs.writeFileSync(filePath, text, 'utf8');
  return path.basename(filePath);
}

var files = fs.readdirSync(DIR).filter(function(f) { return f.endsWith('.md'); });
console.log('Files: ' + files.length);
files.forEach(function(file) {
  console.log('  ' + processFile(path.join(DIR, file)));
});
console.log('Done.');
