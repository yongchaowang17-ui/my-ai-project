/**
 * Block Utils — 块级操作工具函数
 *
 * 纯函数，无副作用，所有操作返回新数组
 */

import type { ProposedBlock } from './types';

// ===== 合并 =====

/**
 * 合并指定索引的连续块
 * 规则：仅支持索引相邻的块合并
 * type 取 Analysis 优先（如果任一块是 Analysis，则合并后为 Analysis）
 */
export function mergeBlocks(
  blocks: ProposedBlock[],
  indices: number[]
): ProposedBlock[] {
  if (indices.length < 2) return [...blocks];

  // 校验索引连续性
  const sorted = [...indices].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] !== 1) {
      throw new Error('只能合并相邻的块');
    }
  }

  const mergedBlocks: ProposedBlock[] = [];
  let mergeStart = sorted[0];
  let mergeEnd = sorted[sorted.length - 1];
  let inserted = false;

  for (let i = 0; i < blocks.length; i++) {
    if (i === mergeStart && !inserted) {
      // 合并这些块
      const toMerge = blocks.slice(mergeStart, mergeEnd + 1);
      const content = toMerge.map(b => b.content).join('\n\n');
      const hasAnalysis = toMerge.some(b => b.type === 'Analysis');
      const title = toMerge[0].title;

      mergedBlocks.push({
        id: generateBlockId(),
        type: hasAnalysis ? 'Analysis' : 'Question',
        lineRange: [toMerge[0].lineRange[0], toMerge[toMerge.length - 1].lineRange[1]],
        title,
        content,
        confidence: Math.min(...toMerge.map(b => b.confidence)),
      });
      inserted = true;
      i = mergeEnd; // 跳过已合并的块
    } else {
      mergedBlocks.push({ ...blocks[i] });
    }
  }

  return recalcLineRanges(mergedBlocks);
}

// ===== 删除 =====

/** 删除指定索引的块 */
export function deleteBlocks(
  blocks: ProposedBlock[],
  indices: number[]
): ProposedBlock[] {
  const indexSet = new Set(indices);
  const remaining = blocks.filter((_, i) => !indexSet.has(i));
  return recalcLineRanges(remaining);
}

// ===== 拆分 =====

/**
 * 在指定内容行号拆分单个块
 * @param splitContentLine 块内容内的行号（0-based，相对于块内容）
 * @returns 拆分后的两个块
 */
export function splitBlock(
  blocks: ProposedBlock[],
  blockIndex: number,
  splitContentLine: number
): ProposedBlock[] {
  if (blockIndex < 0 || blockIndex >= blocks.length) {
    throw new Error('无效的块索引');
  }

  const block = blocks[blockIndex];
  const lines = block.content.split('\n');

  if (splitContentLine <= 0 || splitContentLine >= lines.length) {
    throw new Error('拆分行号必须在块内容范围内（1-' + (lines.length - 1) + '）');
  }

  const aboveLines = lines.slice(0, splitContentLine);
  const belowLines = lines.slice(splitContentLine);

  const aboveLineCount = aboveLines.length;
  const belowLineCount = belowLines.length;

  const newBlocks: ProposedBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i === blockIndex) {
      newBlocks.push({
        id: generateBlockId(),
        type: block.type,
        lineRange: [block.lineRange[0], block.lineRange[0] + aboveLineCount - 1],
        title: block.title,
        content: aboveLines.join('\n'),
        confidence: block.confidence,
      });
      newBlocks.push({
        id: generateBlockId(),
        type: block.type,
        lineRange: [block.lineRange[0] + aboveLineCount, block.lineRange[1]],
        title: aboveLines[aboveLines.length - 1] || block.title,
        content: belowLines.join('\n'),
        confidence: block.confidence,
      });
    } else {
      newBlocks.push({ ...blocks[i] });
    }
  }

  return recalcLineRanges(newBlocks);
}

// ===== 行号重算 =====

/**
 * 重新计算所有块的 lineRange，确保连续无缝
 * 基于第一个块的起始行号，后续块依次排列
 */
export function recalcLineRanges(blocks: ProposedBlock[]): ProposedBlock[] {
  if (blocks.length === 0) return [];

  const result: ProposedBlock[] = [];
  let currentLine = blocks[0].lineRange[0];

  for (const block of blocks) {
    const lineCount = block.content.split('\n').length;
    result.push({
      ...block,
      lineRange: [currentLine, currentLine + lineCount - 1],
    });
    currentLine += lineCount;
  }

  return result;
}

// ===== 完整性校验 =====

/**
 * 校验块数组的数据完整性
 * - 行号连续无重叠
 * - 无空块
 * - 无交叉
 */
export function validateBlockIntegrity(blocks: ProposedBlock[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (blocks.length === 0) {
    errors.push('块数组为空');
    return { valid: false, errors };
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.content.trim()) {
      errors.push('块 #' + (i + 1) + ' 内容为空');
    }
    if (b.lineRange[0] > b.lineRange[1]) {
      errors.push('块 #' + (i + 1) + ' 行号范围无效: ' + b.lineRange[0] + '-' + b.lineRange[1]);
    }
  }

  // 检查连续性
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const curr = blocks[i];
    if (curr.lineRange[0] <= prev.lineRange[1]) {
      errors.push('块 #' + i + ' 和 #' + (i + 1) + ' 行号重叠');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ===== 选择校验 =====

/** 校验选中的索引是否可用于合并（必须连续） */
export function canMerge(indices: number[]): boolean {
  if (indices.length < 2) return false;
  const sorted = [...indices].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] !== 1) return false;
  }
  return true;
}

// ===== 拖拽移动 =====

/**
 * 移动块到新位置（拖拽排序）
 * fromIndex: 源索引, toIndex: 目标索引
 */
export function moveBlocks(
  blocks: ProposedBlock[],
  fromIndex: number,
  toIndex: number
): ProposedBlock[] {
  if (fromIndex === toIndex) return [...blocks];
  if (fromIndex < 0 || fromIndex >= blocks.length) return [...blocks];
  if (toIndex < 0 || toIndex >= blocks.length) return [...blocks];

  const result = [...blocks];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return recalcLineRanges(result);
}
// ===== ID 生成 =====

let idCounter = 0;
/** 为 ProposedBlock 生成唯一 ID */
export function generateBlockId(): string {
  return 'blk_' + Date.now().toString(36) + '_' + (++idCounter);
}

/** 确保所有 block 都有 id（兼容旧数据） */
export function ensureBlockIds(blocks: ProposedBlock[]): ProposedBlock[] {
  return blocks.map((b, i) => ({
    ...b,
    id: b.id || generateBlockId() + '_' + i,
  }));
}

// ===== 跨容器拖拽 =====

/**
 * 跨容器拖拽处理
 * 当块从 Question 拖到 Analysis（或反向）时，自动切换 type
 * 然后重排序 + 重算行号
 */
export function handleCrossContainerDrag(
  blocks: ProposedBlock[],
  activeGlobalIndex: number,
  overGlobalIndex: number,
  targetType?: string  // 目标容器类型，不传则保持原类型
): ProposedBlock[] {
  if (activeGlobalIndex === overGlobalIndex) return blocks;
  if (activeGlobalIndex < 0 || activeGlobalIndex >= blocks.length) return blocks;
  if (overGlobalIndex < 0 || overGlobalIndex >= blocks.length) return blocks;

  const result = [...blocks];
  const moved = { ...result[activeGlobalIndex] };

  // 如果跨容器，切换 type
  if (targetType && moved.type !== targetType) {
    moved.type = targetType;
  }

  result.splice(activeGlobalIndex, 1);
  result.splice(overGlobalIndex, 0, moved);

  return recalcLineRanges(result);
}
// ===== 全局物理行号重校准 =====

/**
 * finalizeBlocksOrder — 拖拽结算动作
 *
 * 1. 按 lineRange[0] 全局排序（恢复文档物理顺序）
 * 2. 从第 1 行开始逐块累加行号，确保无缝衔接
 * 3. 不修改 type 和 content
 * 4. 末尾行号 = 总行数
 */
export function finalizeBlocksOrder(blocks: ProposedBlock[]): ProposedBlock[] {
  if (blocks.length === 0) return [];

  // 1. 按原始行号排序（恢复文档物理顺序）
  const sorted = [...blocks].sort((a, b) => a.lineRange[0] - b.lineRange[0]);

  // 2. 物理重建行号
  let currentLine = 1;
  return sorted.map(block => {
    const lineCount = block.content.split('\n').length;
    const newBlock = {
      ...block,
      lineRange: [currentLine, currentLine + lineCount - 1] as [number, number],
    };
    currentLine += lineCount;
    return newBlock;
  });
}

// ===== 行号连续性校验 =====

/**
 * 校验 blocks 数组行号是否严格连续
 * block[i].lineRange[1] === block[i+1].lineRange[0] - 1
 */
export function validateLineContinuity(blocks: ProposedBlock[]): {
  valid: boolean;
  gaps: Array<{ after: number; expected: number; actual: number }>;
} {
  const gaps: Array<{ after: number; expected: number; actual: number }> = [];
  const sorted = [...blocks].sort((a, b) => a.lineRange[0] - b.lineRange[0]);

  for (let i = 0; i < sorted.length - 1; i++) {
    const expected = sorted[i].lineRange[1] + 1;
    const actual = sorted[i + 1].lineRange[0];
    if (actual !== expected) {
      gaps.push({ after: i, expected, actual });
    }
  }

  return { valid: gaps.length === 0, gaps };
}