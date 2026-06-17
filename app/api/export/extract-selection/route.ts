/**
 * POST /api/export/extract-selection
 *
 * 选区提取：将选中文本保存为独立 MD 文件
 * 支持创建新文件或追加到已有文件
 *
 * Body: { text, type, targetPath, filename?, append?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { safePath, DATA_ROOT } from '@/lib/fs-utils';
import type { ApiResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 校验必填字段
    if (!body.text) {
      return NextResponse.json(
        { success: false, error: 'Missing text field' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }
    if (!body.type || !['question', 'analysis'].includes(body.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type: must be "question" or "analysis"' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }
    if (!body.targetPath) {
      return NextResponse.json(
        { success: false, error: 'Missing targetPath' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 如果没有指定文件名，基于时间戳生成
    const filename = body.filename || ('extracted_' + Date.now() + '.md');

    // 拼接完整路径
    const subDir = body.type === 'question' ? 'Question' : 'Analysis';
    const relativePath = body.targetPath + '/' + subDir + '/' + filename;

    // 安全校验
    let absolutePath: string;
    try {
      absolutePath = safePath(relativePath);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Path security error' } satisfies ApiResponse<null>,
        { status: 403 }
      );
    }

    // 确保父目录存在
    const dirPath = path.dirname(absolutePath);
    fs.mkdirSync(dirPath, { recursive: true });

    // 检查文件是否存在
    const fileExists = fs.existsSync(absolutePath);

    if (fileExists && !body.append) {
      return NextResponse.json(
        { success: false, error: 'File already exists: ' + filename + '. Use append mode to add content.' } satisfies ApiResponse<null>,
        { status: 409 }
      );
    }

    // 写入或追加
    if (fileExists && body.append) {
      fs.appendFileSync(absolutePath, '\n\n' + body.text, 'utf-8');
    } else {
      fs.writeFileSync(absolutePath, body.text, 'utf-8');
    }

    const stat = fs.statSync(absolutePath);
    const byteLength = Buffer.byteLength(fs.readFileSync(absolutePath, 'utf-8'), 'utf-8');

    const label = body.type === 'question' ? 'Question' : 'Analysis';

    return NextResponse.json({
      success: true,
      data: {
        filePath: relativePath,
        targetDir: subDir,
        filename,
        appended: fileExists && body.append,
        created: !fileExists,
        byteLength,
        label,
      },
    });
  } catch (error) {
    console.error('Extract selection error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
