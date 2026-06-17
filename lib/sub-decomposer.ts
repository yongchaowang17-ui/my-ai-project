/**
 * 04_Fusion_Area -> 04.5_Decomposed 子题拆解引擎
 *
 * 将 Part 级文件按 Section/Passage 边界拆解为子题型文件。
 * 支持 CET4/CET6 听力(3类)和阅读(3类)的拆解。
 */

import fs from 'fs';
import path from 'path';
import { FUSION_ROOT, DECOMPOSED_ROOT } from './fs-utils';
import type { SubSection, SubDecomposePreview } from './types';

// ===== 常量 =====

const RULES_PATH = path.join(process.cwd(), 'config', 'sub-decompose-rules.json');

interface DecomposeRule {
  label: string;
  subType: string;
  boundaries: string[];
  count: number;
}

interface DecomposeRules {
  listening: Record<string, DecomposeRule>;
  reading: Record<string, DecomposeRule>;
  writing: Record<string, DecomposeRule>;
  translation: Record<string, DecomposeRule>;
}

// Part 名称 -> 科目映射
const PART_TO_SUBJECT: Record<number, string> = {
  1: '写作',
  2: '听力',
  3: '阅读',
  4: '翻译',
};

const SUBJECT_TO_DIR: Record<string, string> = {
  '听力': '听力',
  '阅读': '阅读',
  '写作': '写作',
  '翻译': '翻译',
};

// ===== 规则加载 =====

function loadRules(): DecomposeRules {
  const raw = fs.readFileSync(RULES_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ===== 边界检测 =====

/**
 * 在文本行中检测 Section 边界，返回每个边界的行索引
 */
function detectBoundaries(lines: string[], patterns: string[]): number[] {
  const regexes = patterns.map(p => new RegExp(p, 'mi'));
  const boundaries: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (const regex of regexes) {
      if (regex.test(lines[i])) {
        boundaries.push(i);
        break;
      }
    }
  }

  return boundaries;
}

/**
 * 将文本按边界行切分为多个块
 */
function splitByBoundaries(lines: string[], boundaries: number[]): string[] {
  if (boundaries.length === 0) return [lines.join('\n')];

  const chunks: string[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
    chunks.push(lines.slice(start, end).join('\n'));
  }

  return chunks;
}

// ===== 文件扫描 =====

interface PartFiles {
  setId: string;
  examType: string;
  partIndex: number;
  partName: string;
  questionPath: string | null;
  analysisPath: string | null;
  questionContent: string | null;
  analysisContent: string | null;
}

/**
 * 扫描 04_Fusion_Area 下所有套卷的 Part 文件
 */
function scanAllParts(): PartFiles[] {
  const results: PartFiles[] = [];
  const examLevels = ['CET4', 'CET6'];

  for (const level of examLevels) {
    const levelDir = path.join(FUSION_ROOT, level);
    if (!fs.existsSync(levelDir)) continue;

    for (const side of ['Question', 'Analysis'] as const) {
      const sideDir = path.join(levelDir, side);
      if (!fs.existsSync(sideDir)) continue;

      const setDirs = fs.readdirSync(sideDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const setId of setDirs) {
        const setDir = path.join(sideDir, setId);
        const files = fs.readdirSync(setDir).filter(f => f.endsWith('.md'));

        for (const file of files) {
          const partMatch = file.match(/Part(\d+)/i);
          if (!partMatch) continue;

          const partIndex = parseInt(partMatch[1], 10);
          const partNames: Record<number, string> = {
            1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation',
          };
          const partName = partNames[partIndex] || `Part${partIndex}`;

          let entry = results.find(r => r.setId === setId && r.partIndex === partIndex);
          if (!entry) {
            entry = {
              setId, examType: level, partIndex, partName,
              questionPath: null, analysisPath: null,
              questionContent: null, analysisContent: null,
            };
            results.push(entry);
          }

          const filePath = path.join(setDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          if (side === 'Question') {
            entry.questionPath = filePath;
            entry.questionContent = content;
          } else {
            entry.analysisPath = filePath;
            entry.analysisContent = content;
          }
        }
      }
    }
  }

  return results;
}

// ===== 拆解逻辑 =====

/**
 * 从 Analysis 内容中提取指定 Section 范围
 */
function extractAnalysisSection(
  analysisContent: string,
  sectionIndex: string,
  nextSectionIndex: string | null
): string {
  if (!analysisContent) return '';
  const aLines = analysisContent.split('\n');
  const sectionPatterns = [
    `^#+\\s*Section\\s*${sectionIndex}\\b`,
    `^Section\\s*${sectionIndex}\\b`,
  ];

  let aStart = -1;
  for (let i = 0; i < aLines.length; i++) {
    for (const pattern of sectionPatterns) {
      if (new RegExp(pattern, 'mi').test(aLines[i])) {
        aStart = i;
        break;
      }
    }
    if (aStart >= 0) break;
  }
  if (aStart < 0) return '';

  let aEnd = aLines.length;
  if (nextSectionIndex) {
    for (let i = aStart + 1; i < aLines.length; i++) {
      if (new RegExp(`^#+\\s*Section\\s*${nextSectionIndex}\\b`, 'mi').test(aLines[i])) {
        aEnd = i;
        break;
      }
    }
  }

  return aLines.slice(aStart, aEnd).join('\n');
}

/**
 * 从 Analysis 内容中提取子块（Passage/News/Conversation）
 */
function extractAnalysisSubChunk(
  analysisSectionContent: string,
  subBoundaries: string[],
  subIndex: number
): string {
  if (!analysisSectionContent || subBoundaries.length <= 1) return '';
  const aLines = analysisSectionContent.split('\n');
  // 跳过 Section 标题行，从下一行开始检测子边界
  const subBounds = detectBoundaries(aLines.slice(1), subBoundaries);
  if (subBounds.length === 0) return '';
  const chunks = splitByBoundaries(aLines.slice(1), subBounds);
  return chunks[subIndex] || '';
}

/**
 * 对单个 Part 进行子题拆解
 */
function decomposePart(part: PartFiles, rules: DecomposeRules): SubSection[] {
  const subject = PART_TO_SUBJECT[part.partIndex];
  if (!subject) return [];

  const subjectKey = subject === '听力' ? 'listening'
    : subject === '阅读' ? 'reading'
    : subject === '写作' ? 'writing'
    : 'translation';

  const subjectRules = rules[subjectKey];
  if (!subjectRules) return [];

  // 写作和翻译：整段提取
  if (subjectKey === 'writing' || subjectKey === 'translation') {
    const content = part.questionContent || part.analysisContent || '';
    if (!content.trim()) return [];

    const subType = subjectKey === 'writing' ? 'writing' : 'translation';
    const filename = `${part.setId}_${subject === '写作' ? 'Writing' : 'Translation'}.md`;

    return [{
      id: `${part.setId}_${subType}`,
      subject,
      sectionFolder: '',
      filename,
      setId: part.setId,
      examType: part.examType,
      partIndex: part.partIndex,
      partName: part.partName,
      subType,
      subIndex: 1,
      content,
      sourceQuestionPath: part.questionPath || '',
      sourceAnalysisPath: part.analysisPath,
      status: 'pending',
    }];
  }

  // 听力和阅读：按 Section 边界拆分
  const sections: SubSection[] = [];
  const sectionKeys = Object.keys(subjectRules).filter(k => k !== '_default');

  for (const sectionKey of sectionKeys) {
    const rule = subjectRules[sectionKey];
    const sectionIndex = sectionKey.replace('Section', '');

    const questionContent = part.questionContent || '';
    const qLines = questionContent.split('\n');

    // 找到当前 Section 起始位置
    const sectionBoundaryPatterns = [
      `^#+\\s*Section\\s*${sectionIndex}\\b`,
      `^Section\\s*${sectionIndex}\\b`,
    ];

    let sectionStart = -1;
    for (let i = 0; i < qLines.length; i++) {
      for (const pattern of sectionBoundaryPatterns) {
        if (new RegExp(pattern, 'mi').test(qLines[i])) {
          sectionStart = i;
          break;
        }
      }
      if (sectionStart >= 0) break;
    }
    if (sectionStart < 0) continue;

    // 找到下一个 Section 起始位置
    const nextSectionNum = parseInt(sectionIndex, 10) + 1;
    let sectionEnd = qLines.length;
    for (let i = sectionStart + 1; i < qLines.length; i++) {
      if (new RegExp(`^#+\\s*Section\\s*${nextSectionNum}\\b`, 'mi').test(qLines[i])) {
        sectionEnd = i;
        break;
      }
    }

    const sectionQContent = qLines.slice(sectionStart, sectionEnd).join('\n');
    const sectionAContent = extractAnalysisSection(
      part.analysisContent || '', sectionIndex, String(nextSectionNum)
    );

    // 子块边界（排除 Section 级别的 pattern）
    const subBoundaries = rule.boundaries.filter(b => !b.includes('Section'));

    // 有子边界 -> 进一步拆分
    if (subBoundaries.length > 0) {
      const subBoundIndices = detectBoundaries(sectionQContent.split('\n'), subBoundaries);

      if (subBoundIndices.length > 0) {
        const subChunks = splitByBoundaries(sectionQContent.split('\n'), subBoundIndices);

        for (let si = 0; si < subChunks.length; si++) {
          const subIndex = si + 1;
          const typePrefix = rule.subType === 'news' ? 'News'
            : rule.subType === 'conversation' ? 'Conv'
            : 'Psg';

          // 阅读 SectionC 用 P1/P2 命名
          const filename = subjectKey === 'reading' && sectionIndex === 'C'
            ? `${part.setId}_P${subIndex}.md`
            : `${part.setId}_${typePrefix}${subIndex}.md`;

          const subAContent = extractAnalysisSubChunk(sectionAContent, subBoundaries, si);
          const content = subChunks[si]
            + (subAContent ? '\n\n---\n\n# 解析\n\n' + subAContent : '');

          sections.push({
            id: `${part.setId}_Sc${sectionIndex}_${typePrefix}${subIndex}`,
            subject,
            sectionFolder: `Section${sectionIndex}`,
            filename,
            setId: part.setId,
            examType: part.examType,
            partIndex: part.partIndex,
            partName: part.partName,
            sectionIndex,
            sectionName: rule.label,
            subType: rule.subType,
            subIndex,
            content,
            sourceQuestionPath: part.questionPath || '',
            sourceAnalysisPath: part.analysisPath,
            status: 'pending',
          });
        }
        continue;
      }
    }

    // 无子边界，整个 Section 作为一个文件
    const filename = `${part.setId}_${rule.subType.charAt(0).toUpperCase() + rule.subType.slice(1)}.md`;
    const mergedContent = sectionQContent
      + (sectionAContent ? '\n\n---\n\n# 解析\n\n' + sectionAContent : '');

    sections.push({
      id: `${part.setId}_Sc${sectionIndex}`,
      subject,
      sectionFolder: `Section${sectionIndex}`,
      filename,
      setId: part.setId,
      examType: part.examType,
      partIndex: part.partIndex,
      partName: part.partName,
      sectionIndex,
      sectionName: rule.label,
      subType: rule.subType,
      subIndex: 1,
      content: mergedContent,
      sourceQuestionPath: part.questionPath || '',
      sourceAnalysisPath: part.analysisPath,
      status: 'pending',
    });
  }

  return sections;
}

// ===== 公开 API =====

/**
 * 扫描所有 Part 并返回拆解预览（不写入磁盘）
 */
export function previewDecompose(): SubDecomposePreview[] {
  const rules = loadRules();
  const allParts = scanAllParts();
  const previews: SubDecomposePreview[] = [];

  for (const part of allParts) {
    try {
      const sections = decomposePart(part, rules);
      previews.push({
        setId: part.setId,
        examType: part.examType,
        sections,
        totalSections: sections.length,
        status: sections.length > 0 ? 'ready' : 'partial',
      });
    } catch (err: any) {
      previews.push({
        setId: part.setId,
        examType: part.examType,
        sections: [],
        totalSections: 0,
        status: 'error',
        errorMsg: err.message,
      });
    }
  }

  return previews;
}

/**
 * 将审批通过的子题写入 04.5_Decomposed
 */
export function writeDecomposed(items: SubSection[]): {
  committed: number; skipped: number; errors: string[]; files: string[];
} {
  const result = { committed: 0, skipped: 0, errors: [] as string[], files: [] as string[] };

  for (const item of items) {
    if (item.status !== 'approved') {
      result.skipped++;
      continue;
    }

    try {
      const subjectDir = path.join(DECOMPOSED_ROOT, SUBJECT_TO_DIR[item.subject] || item.subject);
      const sectionDir = item.sectionFolder
        ? path.join(subjectDir, item.sectionFolder)
        : subjectDir;

      fs.mkdirSync(sectionDir, { recursive: true });

      const filePath = path.join(sectionDir, item.filename);

      const frontmatter = [
        '---',
        `exam: ${item.examType}`,
        `setId: ${item.setId}`,
        `partIndex: ${item.partIndex}`,
        `partName: ${item.partName}`,
        item.sectionIndex ? `sectionIndex: ${item.sectionIndex}` : '',
        item.sectionName ? `sectionName: ${item.sectionName}` : '',
        `subType: ${item.subType}`,
        `subIndex: ${item.subIndex}`,
        `sourceQuestionPath: ${item.sourceQuestionPath}`,
        item.sourceAnalysisPath ? `sourceAnalysisPath: ${item.sourceAnalysisPath}` : '',
        `status: approved`,
        `decomposedAt: ${new Date().toISOString()}`,
        '---',
        '',
      ].filter(Boolean).join('\n');

      fs.writeFileSync(filePath, frontmatter + item.content, 'utf-8');
      result.committed++;
      result.files.push(filePath);
    } catch (err: any) {
      result.errors.push(`${item.id}: ${err.message}`);
    }
  }

  return result;
}
