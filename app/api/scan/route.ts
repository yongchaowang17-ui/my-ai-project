/**
 * POST /api/scan
 *
 * 扫描 routing/mixed/ 下的文件，生成任务清单
 *
 * Body: { filePath?: string }  — 传入单个文件路径扫描，不传则扫描全部
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { DATA_ROOT } from '@/lib/fs-utils';
import { scanFile, scanDirectory, saveTask, loadAllTasks } from '@/lib/scanner';
import type { ApiResponse, SplitTask } from '@/lib/types';

const MIXED_DIR = path.join(DATA_ROOT, 'routing', 'mixed');
const TASKS_DIR = path.join(DATA_ROOT, 'tasks');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    let tasks: SplitTask[] = [];

    if (body.filePath) {
      // 扫描单个文件
      const absolutePath = body.filePath.includes('data/')
        ? path.join(process.cwd(), body.filePath)
        : path.join(MIXED_DIR, path.basename(body.filePath));
      try {
        const task = scanFile(absolutePath);
        saveTask(task, TASKS_DIR);
        tasks = [task];
      } catch (err) {
        return NextResponse.json(
          { success: false, error: 'Failed to scan file: ' + body.filePath } satisfies ApiResponse<null>,
          { status: 400 }
        );
      }
    } else {
      // 扫描全部
      tasks = scanDirectory(MIXED_DIR);
      // 保存每个任务
      for (const task of tasks) {
        saveTask(task, TASKS_DIR);
      }
    }

    const stats = {
      total: tasks.length,
      regexOk: tasks.filter(t => t.status === 'pending').length,
      flagged: tasks.filter(t => t.status === 'flagged').length,
    };

    return NextResponse.json({
      success: true,
      data: { tasks, stats },
    });
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}

/** GET /api/scan — 获取已保存的任务列表 */
export async function GET() {
  try {
    const tasks = loadAllTasks(TASKS_DIR);
    const stats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      reviewed: tasks.filter(t => t.status === 'reviewed').length,
      flagged: tasks.filter(t => t.status === 'flagged').length,
      committed: tasks.filter(t => t.status === 'committed').length,
    };

    return NextResponse.json({
      success: true,
      data: { tasks, stats },
    });
  } catch (error) {
    console.error('Load tasks error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
