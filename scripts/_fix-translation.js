/**
 * 修复 05_Synthesis_Area Translation 文件：
 * 1. 合并碎片标题（PartIV / Translation / (30minutes) → 一行）
 * 2. 从知识库提取干净的参考译文替换 OCR 损坏的英文
 * 3. 移除无用的 --- 分隔符碎片
 */
const fs = require('fs');
const path = require('path');

const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';
const KNOWLEDGE_BASE = 'D:/知识库';

function parseSetId(filename) {
  const m = filename.match(/^(CET[46])_(\d{4})_(\d{2})_S(\d+)_(.+)\.md$/);
  if (!m) return null;
  return { exam: m[1], year: m[2], month: m[3], setNum: m[4], partName: m[5] };
}

function parseKnowledgeDir(dirName, examType) {
  const isAnalysis = /解析|详解|答案/.test(dirName);
  const type = isAnalysis ? 'analysis' : 'question';

  let m = dirName.match(/(\d{4})\.(\d{2})[月]?[英]?[语]?[四六]级(?:真题|考试)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type };
  }
  m = dirName.match(/(\d{4})年(\d{2})月[英]?[语]?[四六]级(?:解析|详解|答案)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type };
  }
  m = dirName.match(/(\d{4})\.(\d{2})[英]?[语]?[四六]级(?:解析|详解|答案|考试解析)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type };
  }
  m = dirName.match(/(\d{4})\.(\d{2})[英]?[语]?[四六]级(?:真题)?[第]?(\d|[一二三])[套]?(?:答案及详解)/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type: 'analysis' };
  }
  m = dirName.match(/(\d{4})年(\d{2})月[英]?[语]?[四六]级(?:真题)[第]?(\d|[一二三])[套]?/);
  if (m) {
    const setMap = { '一': '1', '二': '2', '三': '3' };
    return { year: m[1], month: m[2], setNum: setMap[m[3]] || m[3], type: 'question' };
  }
  return null;
}

function extractTranslationSection(content) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s*Part\s*IV/i.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  // Translation is the last part, goes to end of file
  return lines.slice(start).join('\n');
}

function extractReferenceTranslation(content) {
  // 从解析文件中提取【参考译文】部分
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/【参考译文】|#\s*参考译文|Reference\s*Translation/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  // 读取到下一个 Part 或文件结尾
  const result = [];
  for (let i = start; i < lines.length; i++) {
    if (i > start && /^#\s*Part/i.test(lines[i])) break;
    result.push(lines[i]);
  }
  return result.join('\n').trim();
}

function findHybridMD(dirPath) {
  if (!fs.existsSync(dirPath)) return null;
  const hybridDir = path.join(dirPath, 'hybrid_auto');
  if (!fs.existsSync(hybridDir)) return null;
  const mdFiles = fs.readdirSync(hybridDir).filter(f => f.endsWith('.md') && !f.startsWith('Dify'));
  return mdFiles.length > 0 ? path.join(hybridDir, mdFiles[0]) : null;
}

function hasSpaceIssues(content) {
  const lines = content.split('\n');
  let bad = 0;
  for (const l of lines) {
    if (l.length > 50 && /[a-zA-Z]{5,}/.test(l) && !l.includes(' ') && !l.startsWith('!') && !l.startsWith('<')) {
      bad++;
    }
  }
  return bad;
}

function compactTranslationFile(content) {
  // 合并碎片标题为一行
  let result = content;
  // "# PartIV\n\n# Translation\n\n# (30minutes)" → "# Part IV Translation (30 minutes)"
  result = result.replace(/#\s*PartIV\s*\n\s*#\s*Translation\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part IV Translation ($1 minutes)');
  result = result.replace(/#\s*Part\s*IV\s*\n\s*#\s*Translation\s*\n\s*#\s*\((\d+)\s*minutes?\)/gi,
    '# Part IV Translation ($1 minutes)');
  
  // "# PartIV Translation" → "# Part IV Translation" (already one line)
  result = result.replace(/#\s*PartIV\s+Translation/gi, '# Part IV Translation');
  
  // 移除孤立的 "---" 行（在 frontmatter 之后的）
  const lines = result.split('\n');
  const cleaned = [];
  let inFrontmatter = true;
  let frontmatterEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if (inFrontmatter && lines[i].trim() === '---' && i > 0) {
      inFrontmatter = false;
      frontmatterEnd = i;
    }
  }
  
  // 从 frontmatter 之后开始清理
  for (let i = 0; i < lines.length; i++) {
    if (i <= frontmatterEnd) {
      cleaned.push(lines[i]);
      continue;
    }
    // 跳过孤立的 ---
    if (lines[i].trim() === '---' && i > frontmatterEnd) {
      // 保留作为 Q/A 分隔符，但不保留连续的 ---
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '---') continue;
      cleaned.push(lines[i]);
      continue;
    }
    cleaned.push(lines[i]);
  }
  
  return cleaned.join('\n');
}

function main() {
  console.log('=== Translation 文件修复脚本 ===\n');

  // 构建知识库索引
  const kbIndex = {};
  for (const examType of ['CET4', 'CET6']) {
    const kbSubDir = path.join(KNOWLEDGE_BASE, examType === 'CET4' ? 'cet-4' : 'cet-6');
    if (!fs.existsSync(kbSubDir)) continue;
    const dirs = fs.readdirSync(kbSubDir).filter(d => fs.statSync(path.join(kbSubDir, d)).isDirectory());
    for (const dirName of dirs) {
      const parsed = parseKnowledgeDir(dirName, examType);
      if (!parsed) continue;
      const key = `${examType}_${parsed.year}_${parsed.month}_S${parsed.setNum}`;
      if (!kbIndex[key]) kbIndex[key] = {};
      const mdPath = findHybridMD(path.join(kbSubDir, dirName));
      if (mdPath) kbIndex[key][parsed.type] = mdPath;
    }
  }

  console.log(`知识库索引: ${Object.keys(kbIndex).length} 个套卷\n`);

  let fixedCount = 0;
  let compactedCount = 0;
  const results = [];

  for (const examType of ['CET4', 'CET6']) {
    const transDir = path.join(SYNTHESIS_DIR, examType, 'Translation');
    if (!fs.existsSync(transDir)) continue;

    const files = fs.readdirSync(transDir).filter(f => f.endsWith('.md'));
    console.log(`--- ${examType} Translation: ${files.length} 个文件 ---`);

    for (const file of files) {
      const info = parseSetId(file);
      if (!info) continue;

      const filePath = path.join(transDir, file);
      let content = fs.readFileSync(filePath, 'utf-8');
      const originalIssues = hasSpaceIssues(content);

      // Step 1: 紧凑化标题
      const compacted = compactTranslationFile(content);
      const afterCompact = compacted !== content;
      if (afterCompact) compactedCount++;

      // Step 2: 尝试从知识库提取干净的参考译文
      const key = `${info.exam}_${info.year}_${info.month}_S${info.setNum}`;
      const kbEntry = kbIndex[key];

      let finalContent = compacted;
      if (kbEntry) {
        // 从解析文件提取参考译文
        if (kbEntry.analysis) {
          const aRaw = fs.readFileSync(kbEntry.analysis, 'utf-8');
          const refTrans = extractReferenceTranslation(aRaw);
          if (refTrans) {
            // 替换 Q 部分的英文译文（在 --- 之前的部分不动，替换 --- 之后的英文译文）
            const parts = finalContent.split(/\n---\n/);
            if (parts.length >= 2) {
              // Q 部分保持不变，A 部分用干净的参考译文
              const qPart = parts[0];
              // 重新组装 A 部分
              const aPart = '\n\n## 答案与解析\n\n' + refTrans.replace(/^#+\s*Part\s*IV\s+Translation\s*\n*/i, '').trim();
              finalContent = qPart + '\n\n---\n' + aPart;
            }
          }
        }
      }

      const newIssues = hasSpaceIssues(finalContent);

      if (finalContent !== content) {
        fs.writeFileSync(filePath, finalContent, 'utf-8');
        fixedCount++;
        results.push({
          file,
          compacted: afterCompact,
          oldIssues: originalIssues,
          newIssues,
          hasKBSource: !!kbEntry,
        });
      } else if (originalIssues > 0) {
        results.push({
          file,
          compacted: afterCompact,
          oldIssues: originalIssues,
          newIssues: originalIssues,
          hasKBSource: !!kbEntry,
          note: 'no_clean_source',
        });
      }
    }
  }

  console.log(`\n=== 修复报告 ===`);
  console.log(`紧凑化标题: ${compactedCount}`);
  console.log(`内容修复: ${fixedCount}`);
  console.log(`有残留问题: ${results.filter(r => r.newIssues > 0).length}`);

  const problematic = results.filter(r => r.newIssues > 0);
  if (problematic.length > 0) {
    console.log('\n仍有问题的文件:');
    problematic.forEach(r => {
      console.log(`  ${r.file}: ${r.oldIssues}→${r.newIssues} issues (KB: ${r.hasKBSource})`);
    });
  }

  // 保存报告
  fs.writeFileSync(
    path.join('D:/my-ai-Project/data', 'translation-fix-report.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), fixed: fixedCount, compacted: compactedCount, details: results }, null, 2),
    'utf-8'
  );
  console.log('\n报告已保存: data/translation-fix-report.json');
}

main();
