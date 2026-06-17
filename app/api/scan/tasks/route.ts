/**
 * PUT /api/scan/tasks
 *
 * 更新单个任务状态（标记 reviewed/flagged/committed）
 *
 * Body: { taskId: string, status: string, proposedBlocks?: ProposedBlock[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DATA_ROOT } from '@/lib/fs-utils';
import type { ApiResponse, SplitTask } from '@/lib/types';

const TASKS_DIR = path.join(DATA_ROOT, 'tasks');

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.taskId) {
      return NextResponse.json(
        { success: false, error: 'Missing taskId' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const taskPath = path.join(TASKS_DIR, body.taskId + '.json');
    if (!fs.existsSync(taskPath)) {
      return NextResponse.json(
        { success: false, error: 'Task not found: ' + body.taskId } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    const task: SplitTask = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

    // 更新状态
    if (body.status) {
      task.status = body.status;
    }

    // 更新 blocks（如果提供）
    if (body.proposedBlocks) {
      task.proposedBlocks = body.proposedBlocks;
    }

    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
