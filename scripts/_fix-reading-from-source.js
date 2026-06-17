/**
 * 从知识库干净源文件修复 05_Synthesis_Area 中损坏的 Reading 文件
 * 
 * 逻辑：
 * 1. 扫描 05区 所有 Reading.md 文件
 * 2. 解析 setId → 映射到知识库目录
 * 3. 从真题源提取 Q 内容，从解析源提取 A 内容
 * 4. 合成新的 Reading 文件并替换
 */
const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE = 'D:/知识库';
const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';
const FUSION_DIR = 'D:/my-ai-Project/data/04_Fusion_Area';

// ===== 工具函数 =====

/**
 * 从 05区文件名解析 setId 信息
 * CET4_2021_06_S1_Reading.md → { exam: 'CET4', year: '2021', month: '06', setNum: '1' }
 */
function parseSetId(filename) {
  const m = filename.match(/^(CET[46])_(\d{4})_(\d{2})_S(\d+)_(.+)\.md$/);
  if (!m) return null;
  return { exam: m[1], year: m[2], month: m[3], setNum: m[4], partName: m[5] };
}

/**
 * 从知识库目录名解析年月和套数
 * "2021.06四级真题第1套" → { year: '2021', month: '06', setNum: '1', type: 'question' }
 * "2020.12月四级真题第1套" → { year: '2020', month: '12', setNum: '1', type: 'question' }
 * "2021年6月英语四级解析第一套" → { year: '2021', month: '06', setNum: '1', type: 'analysis' }
 */
function parseKnowledgeDir(dirName, examType) {
  const level = examType === 'CET4' ? '四级' : '六级';
  const isAnalysis = /解析|详解|答案/.test(dirName);
  const type = isAnalysis ? 'analysis' : 'question';

  // 模式1: 2021.06四级真题第1套
  let m = dirName.match(/(\d{4})\.(\d{2})[月]?[英]?[语]?[四六]级(?:真题|考试)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type };
  }

  // 模式2: 2021年6月英语四级解析第一套
  m = dirName.match(/(\d{4})年(\d{2})月[英]?[语]?[四六]级(?:解析|详解|答案)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type };
  }

  // 模式3: 2022.06六级解析第3套
  m = dirName.match(/(\d{4})\.(\d{2})[英]?[语]?[四六]级(?:解析|详解|答案|考试解析)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type };
  }

  // 模式4: 2022.12六级真题第1套答案及详解
  m = dirName.match(/(\d{4})\.(\d{2})[英]?[语]?[四六]级(?:真题)?[第]?(\d|[一二三])[套]?(?:答案及详解)/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type: 'analysis' };
  }

  // 模式5: 2022年12月英语六级真题第1套
  m = dirName.match(/(\d{4})年(\d{2})月[英]?[语]?[四六]级(?:真题)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type: 'question' };
  }

  return null;
}

/**
 * 从 Markdown 内容中提取 Part III Reading 部分
 */
function extractReadingSection(content) {
  const lines = content.split('\n');

  // 找 Part III 起始
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s*Part\s*III/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  // 找 Part IV 起始（Reading 的结束）
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#\s*Part\s*IV/i.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

/**
 * 查找知识库中的 hybrid_auto MD 文件
 */
function findHybridMD(dirPath) {
  if (!fs.existsSync(dirPath)) return null;
  const hybridDir = path.join(dirPath, 'hybrid_auto');
  if (!fs.existsSync(hybridDir)) return null;
  const mdFiles = fs.readdirSync(hybridDir).filter(f => f.endsWith('.md') && !f.startsWith('Dify'));
  return mdFiles.length > 0 ? path.join(hybridDir, mdFiles[0]) : null;
}

/**
 * 检查 Reading 内容是否有空格丢失问题
 */
function hasSpaceIssues(content) {
  const lines = content.split('\n');
  let badCount = 0;
  for (const line of lines) {
    if (line.length > 60 && !line.includes(' ') && !line.startsWith('!') && !line.startsWith('<')) {
      badCount++;
    }
  }
  return badCount;
}

// ===== 主逻辑 =====

function main() {
  console.log('=== Reading 文件修复脚本 ===\n');

  // 1. 构建知识库索引
  const kbIndex = {}; // key: "CET4_2021_06_S1" → { question: path, analysis: path }

  for (const examType of ['CET4', 'CET6']) {
    const kbSubDir = path.join(KNOWLEDGE_BASE, examType === 'CET4' ? 'cet-4' : 'cet-6');
    if (!fs.existsSync(kbSubDir)) {
      console.log(`知识库目录不存在: ${kbSubDir}`);
      continue;
    }

    const dirs = fs.readdirSync(kbSubDir).filter(d => {
      const full = path.join(kbSubDir, d);
      return fs.statSync(full).isDirectory();
    });

    for (const dirName of dirs) {
      const parsed = parseKnowledgeDir(dirName, examType);
      if (!parsed) continue;

      const key = `${examType}_${parsed.year}_${parsed.month}_S${parsed.setNum}`;
      if (!kbIndex[key]) kbIndex[key] = {};

      const mdPath = findHybridMD(path.join(kbSubDir, dirName));
      if (mdPath) {
        kbIndex[key][parsed.type] = mdPath;
      }
    }
  }

  const kbKeys = Object.keys(kbIndex);
  console.log(`知识库索引: ${kbKeys.length} 个套卷\n`);

  // 2. 扫描 05区 Reading 文件
  let fixedCount = 0;
  let skippedCount = 0;
  let notFoundCount = 0;
  const results = [];

  for (const examType of ['CET4', 'CET6']) {
    const readingDir = path.join(SYNTHESIS_DIR, examType, 'Reading');
    if (!fs.existsSync(readingDir)) continue;

    const files = fs.readdirSync(readingDir).filter(f => f.endsWith('.md'));
    console.log(`\n--- ${examType} Reading: ${files.length} 个文件 ---`);

    for (const file of files) {
      const info = parseSetId(file);
      if (!info) continue;

      const key = `${info.exam}_${info.year}_${info.month}_S${info.setNum}`;
      const kbEntry = kbIndex[key];

      if (!kbEntry) {
        notFoundCount++;
        results.push({ file, status: 'no_source', reason: '知识库无匹配源文件' });
        continue;
      }

      // 检查当前文件是否有问题
      const currentContent = fs.readFileSync(path.join(readingDir, file), 'utf-8');
      const currentIssues = hasSpaceIssues(currentContent);

      if (currentIssues === 0) {
        skippedCount++;
        continue; // 已经没问题，跳过
      }

      // 提取 Q 内容（从真题）
      let qContent = null;
      if (kbEntry.question) {
        const qRaw = fs.readFileSync(kbEntry.question, 'utf-8');
        qContent = extractReadingSection(qRaw);
      }

      // 提取 A 内容（从解析）
      let aContent = null;
      if (kbEntry.analysis) {
        const aRaw = fs.readFileSync(kbEntry.analysis, 'utf-8');
        aContent = extractReadingSection(aRaw);
      }

      if (!qContent && !aContent) {
        notFoundCount++;
        results.push({ file, status: 'no_reading', reason: '源文件无 Reading 部分' });
        continue;
      }

      // 构建新的 Reading 文件
      const frontmatter = [
        '---',
        `exam: ${info.exam}`,
        `setId: ${key}`,
        `partName: Reading`,
        `type: synthesized`,
        `createdAt: ${new Date().toISOString()}`,
        `sourceFixed: true`,
        '---',
      ].join('\n');

      const parts = [frontmatter, ''];
      if (qContent) parts.push(qContent.trim());
      if (aContent) {
        parts.push('');
        parts.push('---');
        parts.push('');
        parts.push(aContent.trim());
      }

      const newContent = parts.join('\n');
      const newIssues = hasSpaceIssues(newContent);

      // 写入
      fs.writeFileSync(path.join(readingDir, file), newContent, 'utf-8');
      fixedCount++;

      results.push({
        file,
        status: 'fixed',
        oldIssues: currentIssues,
        newIssues,
        qSource: kbEntry.question ? path.basename(path.dirname(path.dirname(kbEntry.question))) : null,
        aSource: kbEntry.analysis ? path.basename(path.dirname(path.dirname(kbEntry.analysis))) : null,
      });

      if (fixedCount % 10 === 0) {
        console.log(`  已修复 ${fixedCount} 个文件...`);
      }
    }
  }

  // 3. 输出报告
  console.log('\n=== 修复报告 ===');
  console.log(`已修复: ${fixedCount}`);
  console.log(`无需修复: ${skippedCount}`);
  console.log(`无源文件: ${notFoundCount}`);

  const fixed = results.filter(r => r.status === 'fixed');
  const noSource = results.filter(r => r.status === 'no_source');
  const noReading = results.filter(r => r.status === 'no_reading');

  if (fixed.length > 0) {
    console.log('\n已修复文件:');
    fixed.forEach(r => {
      console.log(`  ✅ ${r.file} (旧问题行: ${r.oldIssues} → 新问题行: ${r.newIssues})`);
    });
  }

  if (noSource.length > 0) {
    console.log('\n无源文件匹配:');
    noSource.forEach(r => console.log(`  ❌ ${r.file}: ${r.reason}`));
  }

  if (noReading.length > 0) {
    console.log('\n源文件无 Reading 部分:');
    noReading.forEach(r => console.log(`  ⚠️ ${r.file}: ${r.reason}`));
  }

  // 保存报告
  const report = {
    timestamp: new Date().toISOString(),
    summary: { fixed: fixedCount, skipped: skippedCount, noSource: notFoundCount },
    details: results,
  };
  fs.writeFileSync(
    path.join('D:/my-ai-Project/data', 'reading-fix-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );
  console.log('\n报告已保存: data/reading-fix-report.json');
}

main();
