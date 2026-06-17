/**
 * POST /api/export/batch-split
 *
 * 原子提交：将 reviewed 的任务批量写入 02_Working_Area/
 *
 * Body: { tasks: SplitTask[] }  — 仅处理 status === 'reviewed' 的任务
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DATA_ROOT, WORKSPACE_ROOT } from '@/lib/fs-utils';
import { inferSetIdFromFilename, generateSplitFilenames, validateFileName } from '@/lib/naming-validator';
import type { ApiResponse, SplitTask, ProposedBlock } from '@/lib/types';

const TASKS_DIR = path.join(DATA_ROOT, 'tasks');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.tasks || !Array.isArray(body.tasks)) {
      return NextResponse.json(
        { success: false, error: 'Missing tasks array' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 只处理 reviewed 状态的任务
    const reviewableTasks = body.tasks.filter((t: SplitTask) => t.status === 'reviewed');

    if (reviewableTasks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No reviewed tasks to commit' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const committedFiles: string[] = [];
    const errors: string[] = [];

    for (const task of reviewableTasks) {
      // 推断 SetId
      const setId = inferSetIdFromFilename(task.sourcePath.split('/').pop() || '');
      if (!setId) {
        errors.push(task.id + ': cannot infer SetId from filename');
        continue;
      }

      // 分离 Question 和 Analysis 块
      const qBlocks = task.proposedBlocks.filter((b: ProposedBlock) => b.type === 'Question');
      const aBlocks = task.proposedBlocks.filter((b: ProposedBlock) => b.type === 'Analysis');

      // 生成文件名
      const filenames = generateSplitFilenames(setId);
      const qFilename = filenames.questionFilename;
      const aFilename = filenames.analysisFilename;

      // 校验文件名
      const qVal = validateFileName(qFilename);
      const aVal = validateFileName(aFilename);
      if (!qVal.valid) {
        errors.push(task.id + ': invalid Q filename: ' + qVal.error);
        continue;
      }
      if (!aVal.valid) {
        errors.push(task.id + ': invalid A filename: ' + aVal.error);
        continue;
      }

      // 拼接内容
      const qContent = qBlocks.map((b: ProposedBlock) => b.content).join('\n\n');
      const aContent = aBlocks.map((b: ProposedBlock) => b.content).join('\n\n');

      // 写入文件
      const qDir = path.join(WORKSPACE_ROOT, setId, 'Question');
      const aDir = path.join(WORKSPACE_ROOT, setId, 'Analysis');
      fs.mkdirSync(qDir, { recursive: true });
      fs.mkdirSync(aDir, { recursive: true });

      if (qContent.trim()) {
        const qPath = path.join(qDir, qFilename);
        fs.writeFileSync(qPath, qContent, 'utf-8');
        committedFiles.push(path.relative(DATA_ROOT, qPath).replace(/\\/g, '/'));
      }

      if (aContent.trim()) {
        const aPath = path.join(aDir, aFilename);
        fs.writeFileSync(aPath, aContent, 'utf-8');
        committedFiles.push(path.relative(DATA_ROOT, aPath).replace(/\\/g, '/'));
      }

      // 更新任务状态为 committed
      const taskPath = path.join(TASKS_DIR, task.id + '.json');
      if (fs.existsSync(taskPath)) {
        const savedTask = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
        savedTask.status = 'committed';
        fs.writeFileSync(taskPath, JSON.stringify(savedTask, null, 2), 'utf-8');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        committed: committedFiles.length,
        files: committedFiles,
        errors,
        skipped: reviewableTasks.length - committedFiles.length / 2,
      },
    });
  } catch (error) {
    console.error('Batch split error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
