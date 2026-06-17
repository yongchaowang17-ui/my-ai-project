/**
 * POST /api/export/split-at-line
 *
 * 行级分割：在光标所在行将文件一分为二
 * 行号之上 -> Question 文件
 * 行号及之下 -> Analysis 文件
 * 写入 02_Working_Area/{setId}/Question|Analysis/
 * 不修改源文件
 *
 * Body: { sourcePath, lineNumber, setId?, targetQFilename?, targetAFilename? }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { safePath, DATA_ROOT, WORKSPACE_ROOT } from '@/lib/fs-utils';
import { validatePipeline, generateSplitFilenames, validateFileName } from '@/lib/naming-validator';
import type { ApiResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 校验必填字段
    if (!body.sourcePath) {
      return NextResponse.json(
        { success: false, error: 'Missing sourcePath' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }
    if (!body.lineNumber || typeof body.lineNumber !== 'number' || body.lineNumber < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid lineNumber: must be a positive integer' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 读取源文件
    let sourceContent: string;
    try {
      const absolutePath = safePath(body.sourcePath);
      if (!fs.existsSync(absolutePath)) {
        return NextResponse.json(
          { success: false, error: 'Source file not found: ' + body.sourcePath } satisfies ApiResponse<null>,
          { status: 404 }
        );
      }
      sourceContent = fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      return NextResponse.json(
        { success: false, error: 'Path security error' } satisfies ApiResponse<null>,
        { status: 403 }
      );
    }

    // Pipeline 预检查
    const pipeline = validatePipeline(body.sourcePath);

    // 确定目标 setId
    let setId = body.setId || pipeline.setId;
    if (!setId) {
      return NextResponse.json(
        { success: false, error: 'Cannot determine setId. Please provide setId manually.' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 按行号分割
    const lines = sourceContent.split('\n');
    const splitLine = body.lineNumber; // 1-based
    const aboveLines = lines.slice(0, splitLine - 1); // 行号之上（不含该行）
    const belowLines = lines.slice(splitLine - 1);     // 该行及之下

    const aboveContent = aboveLines.join('\n');
    const belowContent = belowLines.join('\n');

    if (!aboveContent.trim()) {
      return NextResponse.json(
        { success: false, error: 'Split line is at the beginning of the file, nothing above to extract as Question' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }
    if (!belowContent.trim()) {
      return NextResponse.json(
        { success: false, error: 'Split line is at the end of the file, nothing below to extract as Analysis' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 生成文件名
    let qFilename = body.targetQFilename;
    let aFilename = body.targetAFilename;

    if (!qFilename || !aFilename) {
      const generated = generateSplitFilenames(setId);
      qFilename = qFilename || generated.questionFilename;
      aFilename = aFilename || generated.analysisFilename;
    }

    // 校验生成的文件名
    const qValidation = validateFileName(qFilename);
    const aValidation = validateFileName(aFilename);
    if (!qValidation.valid) {
      return NextResponse.json(
        { success: false, error: 'Question filename invalid: ' + qValidation.error } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }
    if (!aValidation.valid) {
      return NextResponse.json(
        { success: false, error: 'Analysis filename invalid: ' + aValidation.error } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 构建目标路径
    const targetBase = path.join(WORKSPACE_ROOT, setId);
    const qPath = path.join(targetBase, 'Question', qFilename);
    const aPath = path.join(targetBase, 'Analysis', aFilename);

    // 安全校验
    const qRelative = path.relative(DATA_ROOT, qPath).replace(/\\/g, '/');
    const aRelative = path.relative(DATA_ROOT, aPath).replace(/\\/g, '/');
    try {
      safePath(qRelative);
      safePath(aRelative);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Path security error for target files' } satisfies ApiResponse<null>,
        { status: 403 }
      );
    }

    // 检查文件是否已存在（乐观提示，不阻止写入）
    const qExists = fs.existsSync(qPath);
    const aExists = fs.existsSync(aPath);

    // 创建目录并写入
    fs.mkdirSync(path.dirname(qPath), { recursive: true });
    fs.mkdirSync(path.dirname(aPath), { recursive: true });
    fs.writeFileSync(qPath, aboveContent, 'utf-8');
    fs.writeFileSync(aPath, belowContent, 'utf-8');

    const qStat = fs.statSync(qPath);
    const aStat = fs.statSync(aPath);

    return NextResponse.json({
      success: true,
      data: {
        setId,
        questionPath: qRelative,
        analysisPath: aRelative,
        questionFilename: qFilename,
        analysisFilename: aFilename,
        questionLines: aboveLines.length,
        analysisLines: belowLines.length,
        questionBytes: qStat.size,
        analysisBytes: aStat.size,
        overwritten: { question: qExists, analysis: aExists },
      },
    });
  } catch (error) {
    console.error('Split at line error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
