/**
 * 03_Exam_Final → 04_Fusion_Area 原子化拆解引擎
 *
 * 将标准化资产库中的套卷文件按 Part 标题锚点拆解为独立文件。
 * 支持 CET4（4 Parts）和 CET6（4-5 Parts）格式。
 *
 * Part 标题变体兼容：
 * - # PartI / # Part I / ## Part I Writing / # Part I ➤ Writing
 * - 大小写不敏感
 * - CET6 特殊的 Part V（替代 Part IV）
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { computeFileHash, toRelativeKey, loadFingerprint, saveFingerprint, hasChanged, updateEntry } from './fingerprint';

// ===== 常量 =====

const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), 'data');
const FUSION_ROOT = path.join(DATA_ROOT, '04_Fusion_Area');

// Part 名称映射
const PART_MAP: Record<string, { index: number; name: string }> = {
  '1': { index: 1, name: 'Writing' },
  '2': { index: 2, name: 'Listening' },
  '3': { index: 3, name: 'Reading' },
  '4': { index: 4, name: 'Translation' },
  '5': { index: 5, name: 'Translation' }, // CET6 有时用 PartV
};

// 罗马数字 → 阿拉伯数字映射
const ROMAN_MAP: Record<string, string> = {
  'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
  'IⅡ': '2', 'IⅢ': '3', 'IⅣ': '4', 'IⅤ': '5',
};

// ===== 拆解逻辑 =====

/**
 * 从 Part 标题行中提取 Part 编号
 *
 * 匹配规则（大小写不敏感）：
 * - `# PartI` / `# Part II` / `## Part III Reading`
 * - `# Part I ➤ Writing` / `# PartI ListeningComprehension`
 * - `# Part IⅢ` / `# Part IV`
 *
 * 返回 Part 编号（1-5），无法识别返回 null
 */
function extractPartNumber(headingLine: string): number | null {
  // 移除 markdown 标题标记
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();

  // 尝试匹配 "Part" 后跟罗马数字或阿拉伯数字
  // 先尝试罗马数字（最长匹配优先）
  const romanPattern = /^Part\s*(I{1,3}|IV|V|I?V?|IⅡ|IⅢ|IⅣ|IⅤ)\b/i;
  const romanMatch = stripped.match(romanPattern);
  if (romanMatch) {
    const roman = romanMatch[1].toUpperCase();
    // 处理 Unicode 变体 Ⅱ Ⅲ Ⅳ Ⅴ
    const normalized = roman.replace(/Ⅱ/g, 'II').replace(/Ⅲ/g, 'III').replace(/Ⅳ/g, 'IV').replace(/Ⅴ/g, 'V');
    if (ROMAN_MAP[normalized]) {
      return parseInt(ROMAN_MAP[normalized], 10);
    }
    // 直接查找
    for (const [key, val] of Object.entries(ROMAN_MAP)) {
      if (key.toUpperCase() === roman) return parseInt(val, 10);
    }
  }

  // 尝试阿拉伯数字
  const arabicPattern = /^Part\s*(\d+)\b/i;
  const arabicMatch = stripped.match(arabicPattern);
  if (arabicMatch) {
    const num = parseInt(arabicMatch[1], 10);
    if (num >= 1 && num <= 5) return num;
  }

  return null;
}

/**
 * 根据 Part 编号确定文件名
 */
function getPartFileName(partIndex: number, examType: string): string {
  const info = PART_MAP[String(partIndex)];
  if (!info) return `Part${partIndex}_Unknown.md`;
  return `Part${info.index}_${info.name}.md`;
}

/**
 * 从文件路径提取 setId
 * 例：03_Exam_Final/CET4/Question/2015_06_S1_Q_01.md → CET4_2015_06_S1
 * 例：03_Exam_Final/CET4/Analysis/CET4_2023.06_Set1_纯解析.md → CET4_2023_06_S1
 */
function extractSetIdFromPath(filePath: string): string | null {
  // 从路径提取 exam 级别和文件名
  const match = filePath.match(/03_Exam_Final\/(CET\d|TEM\d)\/(Question|Analysis)\//);
  if (!match) return null;
  const exam = match[1].toUpperCase();
  const filename = path.basename(filePath, '.md');

  // 尝试匹配标准格式：2015_06_S1_Q_01.md
  const stdMatch = filename.match(/^(\d{4}_\d{2}_S\d+)_/);
  if (stdMatch) return exam + '_' + stdMatch[1];

  // 尝试匹配 routing 格式：CET4_2015.06_Set1_纯真题
  const yearMatch = filename.match(/(20\d{2})[._-](\d{2})/);
  const setMatch = filename.match(/[Ss]et[_]?(\d+)/);
  if (yearMatch) {
    const year = yearMatch[1];
    const month = yearMatch[2];
    const setNum = setMatch ? setMatch[1] : '1';
    return exam + '_' + year + '_' + month + '_S' + setNum;
  }

  return null;
}

export interface DecomposeResult {
  sourcePath: string;
  setId: string;
  examType: string;
  parts: PartFile[];
  warnings: string[];
}

export interface PartFile {
  partIndex: number;
  partName: string;
  targetPath: string; // 相对于 04_Fusion_Area 的路径
  lineCount: number;
  byteLength: number;
}

/**
 * 拆解单个 03_Exam_Final 文件为 Part 块
 *
 * @param sourcePath - 03_Exam_Final 下的相对路径（如 CET4/Question/2015_06_S1_Q_01.md）
 * @returns 拆解结果，包含各 Part 的元信息
 */
export function decomposeFile(sourcePath: string): DecomposeResult {
  const absSource = path.join(FUSION_ROOT, '..', '03_Exam_Final', sourcePath);
  // 但 FUSION_ROOT 是 data/04_Fusion_Area，所以需要往上两级到 data/
  const dataRoot = path.join(FUSION_ROOT, '..');
  const absSourcePath = path.join(dataRoot, '03_Exam_Final', sourcePath);

  if (!fs.existsSync(absSourcePath)) {
    throw new Error('源文件不存在: ' + absSourcePath);
  }

  const raw = fs.readFileSync(absSourcePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);

  // 提取 setId
  const setId = extractSetIdFromPath(sourcePath);
  if (!setId) {
    throw new Error('无法从路径提取 setId: ' + sourcePath);
  }

  // 提取 examType
  const examType = setId.split('_')[0]; // CET4 / CET6
  const fileType = frontmatter.type as string || (sourcePath.includes('Question') ? 'Question' : 'Analysis');

  // 按行分割
  const allLines = content.split('\n');

  // 找到所有 Part 标题行
  const partHeaders: Array<{ partIndex: number; lineIndex: number; headingLine: string }> = [];

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    // 只匹配 h1-h4 级别的 Part 标题
    if (/^#{1,4}\s.*Part\s*/i.test(line)) {
      const partNum = extractPartNumber(line);
      if (partNum !== null) {
        // 去重：同一 Part 编号只取第一次出现
        if (!partHeaders.find(h => h.partIndex === partNum)) {
          partHeaders.push({ partIndex: partNum, lineIndex: i, headingLine: line });
        }
      }
    }
  }

  const warnings: string[] = [];

  if (partHeaders.length === 0) {
    warnings.push('未找到任何 Part 标题，整个文件作为 Part0_Whole');
    // 整个文件作为一个块
    const wholeContent = allLines.join('\n');
    const partFileName = 'Part0_Whole.md';
    const relativeTarget = examType + '/' + fileType + '/' + setId + '/' + partFileName;

    return {
      sourcePath,
      setId,
      examType,
      parts: [{
        partIndex: 0,
        partName: 'Whole',
        targetPath: relativeTarget,
        lineCount: allLines.length,
        byteLength: Buffer.byteLength(wholeContent, 'utf-8'),
      }],
      warnings,
    };
  }

  // 按 lineIndex 排序
  partHeaders.sort((a, b) => a.lineIndex - b.lineIndex);

  // 构建各 Part 块
  const parts: PartFile[] = [];

  for (let i = 0; i < partHeaders.length; i++) {
    const start = partHeaders[i].lineIndex;
    const end = i + 1 < partHeaders.length ? partHeaders[i + 1].lineIndex : allLines.length;
    const blockLines = allLines.slice(start, end);
    const blockContent = blockLines.join('\n');
    const partIndex = partHeaders[i].partIndex;
    const partFileName = getPartFileName(partIndex, examType);
    const relativeTarget = examType + '/' + fileType + '/' + setId + '/' + partFileName;

    parts.push({
      partIndex,
      partName: PART_MAP[String(partIndex)]?.name || 'Unknown',
      targetPath: relativeTarget,
      lineCount: blockLines.length,
      byteLength: Buffer.byteLength(blockContent, 'utf-8'),
    });
  }

  return { sourcePath, setId, examType, parts, warnings };
}

/**
 * 执行拆解并写入 04_Fusion_Area
 *
 * @param sourcePath - 03_Exam_Final 下的相对路径
 * @param fp - 指纹表（会原地修改）
 * @param force - 强制重新写入（忽略指纹检查）
 * @returns 拆解结果 + 写入的文件列表
 */
export function decomposeAndWrite(
  sourcePath: string,
  fp: Record<string, string>,
  force: boolean = false,
): DecomposeResult & { written: string[]; skipped: string[] } {
  const absSourcePath = path.join(path.dirname(FUSION_ROOT), '03_Exam_Final', sourcePath);
  const result = decomposeFile(sourcePath);
  const written: string[] = [];
  const skipped: string[] = [];

  const raw = fs.readFileSync(absSourcePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);

  // 按行分割（重新计算块内容）
  const allLines = content.split('\n');

  // 找到 Part 标题行
  const partHeaders: Array<{ partIndex: number; lineIndex: number }> = [];
  for (let i = 0; i < allLines.length; i++) {
    if (/^#{1,4}\s.*Part\s*/i.test(allLines[i])) {
      const partNum = extractPartNumber(allLines[i]);
      if (partNum !== null && !partHeaders.find(h => h.partIndex === partNum)) {
        partHeaders.push({ partIndex: partNum, lineIndex: i });
      }
    }
  }
  partHeaders.sort((a, b) => a.lineIndex - b.lineIndex);

  // 确定要写入的块
  const blocks: Array<{ partIndex: number; content: string }> = [];
  if (partHeaders.length === 0) {
    blocks.push({ partIndex: 0, content: allLines.join('\n') });
  } else {
    for (let i = 0; i < partHeaders.length; i++) {
      const start = partHeaders[i].lineIndex;
      const end = i + 1 < partHeaders.length ? partHeaders[i + 1].lineIndex : allLines.length;
      blocks.push({ partIndex: partHeaders[i].partIndex, content: allLines.slice(start, end).join('\n') });
    }
  }

  // 写入每个块
  for (const block of blocks) {
    const partFileName = getPartFileName(block.partIndex, result.examType);
    const fileType = frontmatter.type as string || 'Question';
    const relativeTarget = result.examType + '/' + fileType + '/' + result.setId + '/' + partFileName;
    const absTarget = path.join(FUSION_ROOT, relativeTarget);

    // 构建新 Frontmatter
    const newFrontmatter = {
      exam: result.examType,
      setId: result.setId,
      type: fileType,
      sourceFile: '03_Exam_Final/' + sourcePath,
      chunkId: result.setId + '_P' + block.partIndex + '_' + (fileType === 'Question' ? 'Q' : 'A'),
      partIndex: block.partIndex,
      partName: PART_MAP[String(block.partIndex)]?.name || 'Unknown',
    };

    const finalContent = matter.stringify(block.content, newFrontmatter);
    const finalHash = computeFileHash(finalContent);

    // 指纹检查
    const targetKey = '04_Fusion_Area/' + relativeTarget;
    if (!force && fp[targetKey] === finalHash) {
      skipped.push(relativeTarget);
      continue;
    }

    // 确保目录存在
    fs.mkdirSync(path.dirname(absTarget), { recursive: true });

    // 写入文件
    fs.writeFileSync(absTarget, finalContent, 'utf-8');
    fp[targetKey] = finalHash;
    written.push(relativeTarget);
  }

  return { ...result, written, skipped };
}
