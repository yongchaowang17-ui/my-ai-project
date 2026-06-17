/**
 * 文本拆解逻辑
 *
 * 两阶段拆解：
 * 1. 规则引擎：基于正则表达式预切分
 * 2. LLM 补全：处理规则无法覆盖的复杂格式
 */

import type { Question, SplitRule } from './types';

// ===== 规则引擎拆解 =====

/** 使用配置的正则规则对文本进行预切分 */
export function splitByRules(text: string, rules: SplitRule[]): SplitSegment[] {
  // 按优先级排序（priority 越小越先匹配）
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const segments: SplitSegment[] = [];
  const lines = text.split('\n');
  let currentSegment: SplitSegment | null = null;

  for (const line of lines) {
    let matched = false;

    for (const rule of sortedRules) {
      const regex = new RegExp(rule.pattern, rule.flags);
      if (regex.test(line)) {
        // 遇到新规则匹配，保存当前段落并开启新段落
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          type: rule.questionType,
          rawText: line,
          lines: [line],
          matchInfo: { rule, matchedText: line },
        };
        matched = true;
        break;
      }
    }

    // 未匹配到规则时，追加到当前段落
    if (!matched && currentSegment) {
      currentSegment.lines.push(line);
      currentSegment.rawText += '\n' + line;
    } else if (!matched && !currentSegment) {
      // 文本开头还没有匹配到任何规则的内容
      currentSegment = {
        type: 'unknown',
        rawText: line,
        lines: [line],
      };
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

// ===== 拆分结果段落类型 =====

export interface SplitSegment {
  type: string;           // 段落类型：section / choice / unknown 等
  rawText: string;        // 原始文本（含多行拼接）
  lines: string[];        // 逐行文本
  matchInfo?: {           // 匹配到的规则信息
    rule: SplitRule;
    matchedText: string;
  };
}

// ===== 转换为题目结构 =====

/** 将拆分段落转换为标准 Question 数组 */
export function segmentsToQuestions(
  segments: SplitSegment[],
  sourceFile: string,
  examType: string
): Question[] {
  return segments
    // 过滤掉章节标记和未知段落
    .filter((seg) => seg.type !== 'section' && seg.type !== 'unknown')
    .map((seg, index) => ({
      id: sourceFile + '#' + (index + 1),
      type: seg.type as Question['type'],
      content: seg.rawText.trim(),
      metadata: {
        sourceFile,
        examType,
        flags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
}
