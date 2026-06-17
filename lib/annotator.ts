/**
 * 批注管理逻辑
 *
 * 提供批注的 CRUD 操作，以及与题目的绑定关系管理
 */

import type { AnnotationFlag, Question } from './types';

/** 生成唯一 ID */
function generateId(): string {
  return 'ann_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/** 创建批注 */
export function createAnnotation(
  type: AnnotationFlag['type'],
  label: string,
  content: string,
  position: { start: number; end: number }
): AnnotationFlag {
  return {
    id: generateId(),
    type,
    label,
    content,
    position,
    createdAt: new Date().toISOString(),
  };
}

/** 将批注绑定到题目 */
export function attachAnnotation(
  question: Question,
  annotation: AnnotationFlag
): Question {
  return {
    ...question,
    metadata: {
      ...question.metadata,
      flags: [...question.metadata.flags, annotation],
      updatedAt: new Date().toISOString(),
    },
  };
}

/** 移除指定 ID 的批注 */
export function removeAnnotation(
  question: Question,
  annotationId: string
): Question {
  return {
    ...question,
    metadata: {
      ...question.metadata,
      flags: question.metadata.flags.filter((f) => f.id !== annotationId),
      updatedAt: new Date().toISOString(),
    },
  };
}

/** 按批注类型筛选题目 */
export function filterByFlagType(
  questions: Question[],
  flagType: AnnotationFlag['type']
): Question[] {
  return questions.filter((q) =>
    q.metadata.flags.some((f) => f.type === flagType)
  );
}

/** 统计各类型批注数量 */
export function countAnnotations(questions: Question[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of questions) {
    for (const flag of q.metadata.flags) {
      counts[flag.type] = (counts[flag.type] || 0) + 1;
    }
  }
  return counts;
}
