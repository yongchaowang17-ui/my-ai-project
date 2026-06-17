/**
 * LLM 审计模块
 *
 * 仅当正则扫描置信度低或 flagged 时调用
 * 校验 proposedBlocks 是否正确，给出修正建议
 */

import { createProvider } from './index';
import type { LLMProvider } from './provider';
import type { SplitTask, ProposedBlock } from '../types';

export interface AuditResult {
  isCorrect: boolean;
  suggestedBlocks?: ProposedBlock[];
  reasoning: string;
}

/**
 * 审计单个任务的拆分结果
 * 仅在有 LLM Provider 时执行，否则返回默认审计结果
 */
export async function auditBlocks(task: SplitTask): Promise<AuditResult> {
  const provider = createProvider();

  if (!provider) {
    return {
      isCorrect: false,
      reasoning: 'LLM Provider 未配置（需要 LLM_PROVIDER=openai 环境变量），请人工审查',
    };
  }

  // 构建审计 Prompt
  const taskSummary = task.proposedBlocks.map((b, i) =>
    'Block ' + (i + 1) + ': type=' + b.type +
    ', lines=' + b.lineRange[0] + '-' + b.lineRange[1] +
    ', title="' + b.title.substring(0, 60) + '"' +
    ', preview="' + b.content.substring(0, 100).replace(/\n/g, ' ') + '"'
  ).join('\n');

  const systemPrompt = `你是数据清洗审计员。校验人工预览的拆分结果是否正确。

检查要点：
1. proposedBlocks 是否存在题目截断或解析混入
2. lineRange 是否在文档中存在逻辑断层（如 Q 块末尾行号 > A 块起始行号）
3. Question 和 Analysis 块是否正确分类

如果当前拆分有误，请给出修正建议。

返回 JSON 格式：
{
  "isCorrect": true/false,
  "reasoning": "判断理由",
  "suggestedBlocks": null 或修正后的块数组
}`;

  const userPrompt = '请审计以下拆分结果：\n\n文件: ' + task.sourcePath +
    '\n考试类型: ' + task.examType +
    '\n块数量: ' + task.proposedBlocks.length +
    '\n\n' + taskSummary;

  try {
    const response = await provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.1, responseFormat: 'json' });

    // 解析 JSON 响应
    const parsed = JSON.parse(response.content);
    return {
      isCorrect: Boolean(parsed.isCorrect),
      suggestedBlocks: parsed.suggestedBlocks || undefined,
      reasoning: String(parsed.reasoning || '无理由'),
    };
  } catch (err) {
    return {
      isCorrect: false,
      reasoning: 'LLM 审计失败: ' + (err instanceof Error ? err.message : String(err)),
    };
  }
}

// ===== 块操作审计 =====

/** 块操作审计结果 */
export interface BlockManipulationResult {
  updatedBlocks: ProposedBlock[];
  isValid: boolean;
  reasoning: string;
}

/** 校正结果 */
export interface CorrectionResult {
  correctedContent: string;
  correctedRange: [number, number];
  reasoning: string;
}

/**
 * 审计块合并/删除操作后的数据完整性
 */
export async function auditBlockManipulation(
  action: string,
  affectedIndices: number[],
  previousBlocks: ProposedBlock[],
  updatedBlocks: ProposedBlock[]
): Promise<BlockManipulationResult> {
  const provider = createProvider();

  if (!provider) {
    return { updatedBlocks, isValid: true, reasoning: 'LLM 未配置，跳过校验' };
  }

  const prevSummary = previousBlocks.map((b, i) =>
    '#' + (i + 1) + ' ' + b.type + ' L' + b.lineRange[0] + '-' + b.lineRange[1] +
    ' "' + b.title.substring(0, 40) + '"'
  ).join('\n');

  const updatedSummary = updatedBlocks.map((b, i) =>
    '#' + (i + 1) + ' ' + b.type + ' L' + b.lineRange[0] + '-' + b.lineRange[1] +
    ' "' + b.title.substring(0, 40) + '"'
  ).join('\n');

  const systemPrompt = `你是 Markdown 流水线审计专家。
校验一组 Markdown 块操作后的数据完整性。

检查要点：
1. 行号平滑：合并或删除后，剩余块的 lineRange 是否连续且无缝
2. 完整性：合并内容是否用 \n\n 正确分隔，符合 Markdown 标准
3. 元数据：type 分类是否合理

返回 JSON：
{ "isValid": true/false, "reasoning": "..." }`;

  const userPrompt = '操作类型: ' + action +
    '\n影响块索引: ' + affectedIndices.join(',') +
    '\n\n操作前 (' + previousBlocks.length + ' 块):\n' + prevSummary +
    '\n\n操作后 (' + updatedBlocks.length + ' 块):\n' + updatedSummary;

  try {
    const response = await provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.1, responseFormat: 'json' });

    const parsed = JSON.parse(response.content);
    return {
      updatedBlocks,
      isValid: Boolean(parsed.isValid),
      reasoning: String(parsed.reasoning || '无理由'),
    };
  } catch (err) {
    return {
      updatedBlocks,
      isValid: false,
      reasoning: 'LLM 审计失败: ' + (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * 校正合并/拆分后的内容格式
 */
export async function auditCorrection(
  content: string,
  range: [number, number]
): Promise<CorrectionResult> {
  const provider = createProvider();

  if (!provider) {
    return { correctedContent: content, correctedRange: range, reasoning: 'LLM 未配置，跳过校正' };
  }

  const systemPrompt = `你是数据清洗助手。
修正 Markdown 块的格式问题。

检查要点：
1. Markdown 标题层级是否混乱（如 # 嵌套在 # 中）
2. 内容是否完整无截断

返回 JSON：
{ "correctedContent": "...", "correctedRange": [start, end], "reasoning": "..." }`;

  const preview = content.substring(0, 500).replace(/\n/g, '\\n');
  const userPrompt = '请校正以下内容（行范围 ' + range[0] + '-' + range[1] + '）:\n\n' + preview;

  try {
    const response = await provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.1, responseFormat: 'json' });

    const parsed = JSON.parse(response.content);
    return {
      correctedContent: String(parsed.correctedContent || content),
      correctedRange: Array.isArray(parsed.correctedRange) ? parsed.correctedRange : range,
      reasoning: String(parsed.reasoning || '无理由'),
    };
  } catch (err) {
    return {
      correctedContent: content,
      correctedRange: range,
      reasoning: 'LLM 校正失败: ' + (err instanceof Error ? err.message : String(err)),
    };
  }
}