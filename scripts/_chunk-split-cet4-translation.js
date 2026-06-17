/**
 * _chunk-split-cet4-translation.js
 * CET-4 翻译文件：英文粘连修复 + 中文年份修复 + CHUNK-SPLIT 包裹
 *
 * 流程：清除旧标记 → 提取自定义词典 → DP 分词修复粘连 → 中文年份修复 → 首尾包裹
 * 不改变任何原始句意和核心内容。
 */

const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, '..', 'data', '05_Synthesis_Area', 'CET4', 'Translation');
const SPLIT_MARKER = '---CHUNK-SPLIT---';
const MAX_WORD_LEN = 25;
const STICK_THRESHOLD = 12; // 连续 12+ 字母无空格判定为粘连

// ─── 基础词典：CET-4 核心高频词 ───
// 功能词 + 常见实词，覆盖粘连中最常出现的单词
const BASE_DICT = new Set(`
a about above across act add afraid after afternoon again against age ago agree ahead air alive all allow almost alone along already also always am among ancient and anger animal another answer any anybody anyone anything anyway appear area arm around arrive art as ask at attack attempt attention August aunt autumn avoid away baby back bad bag ball bank base basket battle be beach bear beat beautiful become bed before began begin behind believe below beside best better between beyond big bill birth bit black blind block blood blow board boat body bone book both bottle bottom box boy brain branch bread break breakfast bridge bright bring brother brown build burn bus business busy but buy by cake call came can car card care careful carry case catch cause cell center certainly chain chair challenge chance change charge cheap check child choose church circle citizen city claim class clean clear climb close clothes cloud club coach coffee cold collect college colour come common company compare complete computer condition connect consider continue control cook cool copy corner cost could count country course cover create cross cry cultural culture cup current customer cut dance danger dangerous daughter day dead deal dear December deep degree deliver demand department depend describe design desire desk develop development dictionary die difference different difficult dinner direct direction discover discussion dish do doctor dollar domestic doubt down draw dream dress drink drive drop dry during each ear early earn earth east easy eat education effect effort eight either else employ encourage enemy energy engineer enjoy enough enter entire environment especially establish even evening ever every everybody everyone everything example except excite expect experience experiment explain explore express expression extreme face facility fact fair faith fall false familiar family famous far farm fashion fast fat father fear feel few field fight fill final find fine finger finish fire first fish fit five fix floor flower fly follow food foot for force foreign forest forget form former forward four free fresh friend from front fruit full fun funny future gain gas gate general generation get girl give glad glass go god gold golden gone good govern govern grass gray great green ground group grow growth guess gun hair half hall hand handle happen happy hard hat hate have he head health hear heart heat heavy help her here herself high hill him himself his history hit hold hole holiday home hope horse hospital hot hotel hour house how however huge human hunger hurry husband ice idea identify if image imagine impact important improve in include income increase indeed independent industry influence inform information initial instead interest internal international interview into introduce invasion invest investigate iron island itself item its jacket jail January job join journey joy judge jump just keep key kill kind king kiss kitchen knee knew knife knock know knowledge lack lady lake land landscape language large last late lately later laugh law lawyer lay lead leader leaf learn least leave left lend length less lesson let letter level library lie life lift light like likely limit line lion lip list listen literature little live local locate lock long look lord lose loss lot loud love lovely low lower luck machine magazine mail main major make male man manage manner many map mark market marriage marry mass master match material matter may maybe me meal mean measure meat medical medicine meet member memory mental mention merely message metal method middle might military million mind mine minute miss mistake mix model modern moment money month more morning most mother mountain mouth move much murder music must my name narrow nation nature near nearby nearly necessary neck need neighbor neither net network never new news newspaper next nice night nine no nobody noise none nor north northern nose not nothing notice novel now number nurse obey ocean occur odd of off offer office often oh oil old on once one only onto open operate opinion opposite or orange order ordinary organization organize other otherwise ought our out outside over own page pain pair palace pan paper parent park part particular pass passage past path pattern pay peace people per percent perfect perhaps period permit personal phone pick picture piece place plan plane plant plate play player please poem poet poetry point police polite politics poor popular position positive possible power practical practice praise pray prefer prepare present president press pretty prevent price prince princess principle private prize probably problem produce product production progress project promise proper protect prove provide public pull punish purpose push put quality quarter queen question quick quickly quiet quite race radio rain raise range rapid reach read ready real realize reason receive recent recently recognize record recover red reduce refer reflection refuse regard region relate relationship religion remain remember remove repeat replace report represent republic request require research resource respect respond response rest restaurant result return reveal rich ride right ring rise river road rock role roll roof room root rope row rule ruler run rush sad safe sail salt same sand satisfy save say scene school science scientific scientist score screen sea search season seat second secret section see seek seem sell send senior sense sentence separate series serious serve service set settle seven several shake shall shape share sharp she sheet shelf shift shine ship shirt shock shoot shop shore short should shoulder shout show shut side sight sign silence silent silver similar simple simply since sing sir sister sit situation six size skill skin skirt sky sleep slide slight slowly small smile smoke smooth snow so social society soft soil soldier solid solution solve some somebody someone something sometimes somewhere son soon sorry sort soul sound source south southern space spare speak special speech speed spend spirit split sport spread spring square stage stand standard star stare start state statement station stay steal steam steel step still stomach stone stop store storm story straight strange stranger street strength strike string strong structure student study stupid subject substance succeed success successful such suddenly suffer sugar suggest suggestion suit summer sun supply support suppose sure surprise surprising survive swim symbol system table tail take tale talk tall task taste tax tea teach team tear tell ten tend tent term terrible test text than thank that the their them then there therefore these they thick thin thing think third thirty this those though thought thousand three through throw thus ticket tidy tie till time tiny tire to today together tomorrow tonight too tool top total touch toward tower town track trade tradition traditional traffic train training travel treat treatment tree trend trip trouble true trust try turn twice type typical uncle under understand union unit university unless unlike until up upon upper urban use used useful user usual usually valley value variety various very village violence virtual visit visitor voice volume vote wage wait wake walk wall want war warm wash waste watch wave way we weak wealth weapon wear weather web website wedding week weekend weigh welcome well west western what whatever wheat wheel when whenever where wherever whether which while whisper white who whole whom whose why wide wife wild will win wind window wing winter wire wisdom wise wish with within without woman wonder wonderful wood wooden wool word work worker world worry worse worst worth would wound write writer wrong yard yeah year yell yellow yes yesterday yet you young your youth
`.trim().split(/\s+/).map(w => w.toLowerCase()).filter(w => w.length >= 2));

// ─── 从文件干净段落提取自定义词典 ───

function extractDictFromFiles(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const extraWords = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    // 从词汇注释、参考译文的干净段落中提取英文单词
    const lines = content.split('\n');
    for (const line of lines) {
      const tr = line.trim();
      // 词汇注释行：英文单词/短语 + 中文释义
      if (/[a-zA-Z]{3,}/.test(tr) && /[\u4e00-\u9fff]/.test(tr)) {
        const engWords = tr.match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g) || [];
        for (const w of engWords) {
          if (w.length >= 3 && w.length <= 25) extraWords.add(w.toLowerCase());
        }
      }
      // 参考译文行中的独立英文单词（非粘连的）
      if (/^[A-Z]/.test(tr) && /[a-z]/.test(tr) && !/[^\x00-\x7F]/.test(tr)) {
        const words = tr.match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g) || [];
        if (words.length >= 3) { // 至少 3 个独立单词才算干净行
          for (const w of words) {
            if (w.length >= 3 && w.length <= 25) extraWords.add(w.toLowerCase());
          }
        }
      }
    }
  }
  return extraWords;
}

// ─── 动态规划分词算法 ───

function segmentText(text, dict) {
  const combined = new Set([...dict, ...BASE_DICT]);

  // 分段处理：按非字母字符分割，保留分隔符
  const tokens = text.split(/([^a-zA-Z]+)/);

  const result = [];
  for (const token of tokens) {
    if (/^[^a-zA-Z]+$/.test(token) || token.length === 0) {
      result.push(token);
      continue;
    }
    // 检测是否为粘连：连续字母长度 >= STICK_THRESHOLD
    if (token.length < STICK_THRESHOLD) {
      result.push(token);
      continue;
    }
    // DP 分词
    const segmented = dpSegment(token, combined);
    result.push(segmented);
  }
  return result.join('');
}

function dpSegment(s, dict) {
  const n = s.length;
  // dp[i] = { cost, words } 表示 s[0..i-1] 的最优分词
  const dp = new Array(n + 1).fill(null);
  dp[0] = { cost: 0, words: [] };

  for (let i = 1; i <= n; i++) {
    const start = Math.max(0, i - MAX_WORD_LEN);
    for (let j = start; j < i; j++) {
      if (!dp[j]) continue;
      const word = s.substring(j, i).toLowerCase();
      if (dict.has(word)) {
        const cost = dp[j].cost + 1;
        if (!dp[i] || cost < dp[i].cost) {
          dp[i] = { cost, words: [...dp[j].words, s.substring(j, i)] };
        }
      }
    }
  }

  // 回溯构建结果
  if (!dp[n]) {
    // 无法完全分词，尝试贪心：找最长可匹配前缀
    return greedySegment(s, dict);
  }

  // 检查分词质量：如果单词数太多（平均每个词太短），可能误切
  const avgLen = n / dp[n].words.length;
  if (avgLen < 3 && dp[n].words.length > 3) {
    return greedySegment(s, dict);
  }

  return dp[n].words.join(' ');
}

function greedySegment(s, dict) {
  const result = [];
  let pos = 0;
  while (pos < s.length) {
    let found = false;
    // 尝试从长到短匹配
    const maxLen = Math.min(MAX_WORD_LEN, s.length - pos);
    for (let len = maxLen; len >= 3; len--) {
      const word = s.substring(pos, pos + len).toLowerCase();
      if (dict.has(word)) {
        result.push(s.substring(pos, pos + len));
        pos += len;
        found = true;
        break;
      }
    }
    if (!found) {
      // 无法匹配，逐字符输出直到遇到可能的单词边界
      let unmatch = '';
      while (pos < s.length) {
        const ch = s[pos];
        // 如果下一个字符开始能匹配一个单词，停下
        if (pos + 3 <= s.length) {
          const next3 = s.substring(pos, pos + 3).toLowerCase();
          // 简单启发：如果当前位置后面能匹配常见短词，停下
          if (dict.has(next3) || (pos + 4 <= s.length && dict.has(s.substring(pos, pos + 4).toLowerCase()))) {
            break;
          }
        }
        unmatch += ch;
        pos++;
        // 最多保留 5 个未匹配字符
        if (unmatch.length >= 5) break;
      }
      result.push(unmatch);
    }
  }
  return result.join(' ');
}

// ─── 粘连检测 ───

function hasStickyWords(line) {
  // 检测连续 12+ 字母无空格的片段
  return /[a-zA-Z]{12,}/.test(line);
}

// ─── 中文年份修复 ───

function fixChineseYears(content) {
  // "到 年" → "到2020年"（CET-4 2015_06_S1 特定）
  content = content.replace(/到\s+年建成/g, '到2020年建成');
  // " 年,中国" → "2011年,中国"
  content = content.replace(/\s+年,中国超越/g, '2011年,中国超越');
  // 其他年份模式：数字后跟多余空格
  content = content.replace(/(\d{4})\s{2,}年/g, '$1年');
  return content;
}

// ─── 文件处理 ───

function processFile(filePath, customDict) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  // 清除旧标记
  let text = content.replace(/^[ \t]*---CHUNK-SPLIT---[ \t]*$/gm, '');
  // 压缩多余空行
  text = text.replace(/\n{3,}/g, '\n\n');

  // 中文年份修复
  text = fixChineseYears(text);

  // 英文粘连修复
  const lines = text.split('\n');
  let fixedLines = 0;
  let fixedFragments = 0;

  for (let i = 0; i < lines.length; i++) {
    if (hasStickyWords(lines[i])) {
      const before = lines[i];
      lines[i] = segmentText(lines[i], customDict);
      if (lines[i] !== before) {
        fixedLines++;
        // 统计修复的片段数
        const beforeFragments = (before.match(/[a-zA-Z]{12,}/g) || []).length;
        fixedFragments += beforeFragments;
      }
    }
  }

  text = lines.join('\n');

  // 首尾包裹标记
  text = text.trimStart() + '\n\n' + SPLIT_MARKER + '\n';
  text = SPLIT_MARKER + '\n\n' + text.trimEnd() + '\n';

  fs.writeFileSync(filePath, text, 'utf8');

  return { fileName, fixedLines, fixedFragments, size: content.length };
}

// ─── 主流程 ───

console.log('构建词典...');
const extraDict = extractDictFromFiles(DIR);
console.log(`  文件自提取词: ${extraDict.size} 个`);
console.log(`  基础词典: ${BASE_DICT.size} 个`);
const combinedDict = new Set([...BASE_DICT, ...extraDict]);
console.log(`  合并词典: ${combinedDict.size} 个\n`);

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
console.log(`扫描到 ${files.length} 个文件\n`);

let total = 0, processed = 0, totalFixed = 0, totalFragments = 0;
for (const file of files) {
  total++;
  const result = processFile(path.join(DIR, file), combinedDict);
  processed++;
  totalFixed += result.fixedLines;
  totalFragments += result.fixedFragments;
  if (result.fixedLines > 0) {
    console.log(`  FIX   ${result.fileName} — ${result.fixedLines} 行, ${result.fixedFragments} 个粘连片段`);
  } else {
    console.log(`  OK    ${result.fileName} — 无需修复`);
  }
}

console.log(`\n════════════════════════════════`);
console.log(`总计: ${total} 个文件 | 处理: ${processed} | 修复行: ${totalFixed} | 粘连片段: ${totalFragments}`);
console.log(`════════════════════════════════`);
