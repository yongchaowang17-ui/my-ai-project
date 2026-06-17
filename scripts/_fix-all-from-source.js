/**
 * 从新建文件夹全面修复 05区所有损坏文件（Reading + Listening + Writing + Translation）
 * 用 MinerU 干净源替换 OCR 损坏的内容
 */
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = 'D:/my-ai-Project/data/新建文件夹';
const SYNTHESIS_DIR = 'D:/my-ai-Project/data/05_Synthesis_Area';

function parseSourceFile(filename) {
  const m = filename.match(/^(CET[46])_(\d{4})\.(\d{2})_Set(\d+)_(.+)\.md$/);
  if (!m) return null;
  const label = m[5];
  const isAnalysis = label.includes('解析');
  const isCombined = label.includes('真题及解析');
  return {
    exam: m[1], year: m[2], month: m[3], setNum: m[4],
    type: isAnalysis ? 'analysis' : isCombined ? 'combined' : 'question',
  };
}

function extractSection(content, partRegex) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (partRegex.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#\s*Part\s*IV/i.test(lines[i]) || /^Part\s*IV/i.test(lines[i])) {
      end = i; break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function extractSectionFromToEnd(content, partRegex) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (partRegex.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  return lines.slice(start).join('\n');
}

function countBad(content) {
  const lines = content.split('\n');
  let bad = 0;
  for (const l of lines) {
    if (l.length > 50 && /[a-zA-Z]{5,}/.test(l) && !l.includes(' ') && !l.startsWith('!') && !l.startsWith('<')) bad++;
  }
  return bad;
}

function main() {
  console.log('=== 新建文件夹全面修复 05区 ===\n');

  // 建立索引
  const sourceFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.md'));
  const srcIdx = {};
  for (const file of sourceFiles) {
    const info = parseSourceFile(file);
    if (!info) continue;
    const key = `${info.exam}_${info.year}_${info.month}_S${info.setNum}`;
    if (!srcIdx[key]) srcIdx[key] = {};
    srcIdx[key][info.type] = path.join(SOURCE_DIR, file);
  }

  console.log(`源文件索引: ${Object.keys(srcIdx).length} 套卷\n`);

  let totalFixed = 0;
  let totalSkipped = 0;
  const fixedDetails = [];

  // Part 映射
  const partMap = {
    Writing: { regex: /^#\s*Part\s*I\b(?!I|V)/i, name: 'Writing', partName: 'Writing' },
    Listening: { regex: /^#\s*Part\s*II\b/i, name: 'Listening', partName: 'Listening' },
    Reading: { regex: /^#\s*Part\s*III\b/i, name: 'Reading', partName: 'Reading' },
    Translation: { regex: /^#\s*Part\s*IV\b/i, name: 'Translation', partName: 'Translation' },
  };

  for (const exam of ['CET4', 'CET6']) {
    for (const [part, cfg] of Object.entries(partMap)) {
      const partDir = path.join(SYNTHESIS_DIR, exam, part);
      if (!fs.existsSync(partDir)) continue;

      const files = fs.readdirSync(partDir).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const m = file.match(/^(CET[46])_(\d{4})_(\d{2})_S(\d+)_(.+)\.md$/);
        if (!m) continue;

        const key = `${m[1]}_${m[2]}_${m[3]}_S${m[4]}`;
        const currentPath = path.join(partDir, file);
        const currentContent = fs.readFileSync(currentPath, 'utf-8');
        const currentBad = countBad(currentContent);

        if (currentBad === 0) { totalSkipped++; continue; }

        const src = srcIdx[key];
        if (!src) continue;

        // 从源文件提取内容
        let qContent = null;
        let aContent = null;

        if (src.combined) {
          const raw = fs.readFileSync(src.combined, 'utf-8');
          qContent = extractSection(raw, cfg.regex);
        }
        if (!qContent && src.question) {
          const raw = fs.readFileSync(src.question, 'utf-8');
          qContent = extractSection(raw, cfg.regex);
        }
        if (src.analysis) {
          const raw = fs.readFileSync(src.analysis, 'utf-8');
          if (part === 'Reading') {
            aContent = extractSection(raw, cfg.regex);
          } else {
            aContent = extractSectionFromToEnd(raw, cfg.regex);
          }
        }

        if (!qContent && !aContent) continue;

        // 构建新文件
        const frontmatter = [
          '---',
          `exam: ${m[1]}`,
          `setId: ${key}`,
          `partName: ${cfg.partName}`,
          `type: synthesized`,
          `createdAt: ${new Date().toISOString()}`,
          `sourceFixed: true`,
          '---',
        ].join('\n');

        const parts = [frontmatter, ''];
        if (qContent) parts.push(qContent.trim());
        if (aContent && part === 'Reading') {
          parts.push('');
          parts.push('---');
          parts.push('');
          parts.push(aContent.trim());
        } else if (aContent) {
          parts.push('');
          parts.push('---');
          parts.push('');
          parts.push(aContent.trim());
        }

        const newContent = parts.join('\n');
        const newBad = countBad(newContent);

        if (newBad < currentBad) {
          fs.writeFileSync(currentPath, newContent, 'utf-8');
          totalFixed++;
          fixedDetails.push({ file: exam + '/' + part + '/' + file, oldBad: currentBad, newBad });
        } else {
          totalSkipped++;
        }
      }
    }
  }

  console.log(`已修复: ${totalFixed}`);
  console.log(`跳过: ${totalSkipped}`);

  if (fixedDetails.length > 0) {
    console.log('\n修复详情:');
    fixedDetails.forEach(d => console.log(`  ✅ ${d.file} (${d.oldBad}→${d.newBad})`));
  }

  // 最终验证
  console.log('\n=== 最终验证 ===');
  let remainBad = 0;
  let totalFiles = 0;
  for (const exam of ['CET4', 'CET6']) {
    for (const part of Object.keys(partMap)) {
      const dir = path.join(SYNTHESIS_DIR, exam, part);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      files.forEach(f => {
        totalFiles++;
        const c = fs.readFileSync(path.join(dir, f), 'utf-8');
        remainBad += countBad(c);
      });
    }
  }
  console.log(`总文件: ${totalFiles}`);
  console.log(`残留英文问题行: ${remainBad}`);
}

main();
