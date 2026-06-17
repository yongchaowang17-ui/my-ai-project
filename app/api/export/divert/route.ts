/**
 * POST /api/export/divert
 *
 * Divert selected text to Question or Analysis file within an exam set.
 * Uses append mode: if file exists, content is appended with \n\n separator.
 *
 * Body: { text, type, targetPath, filename }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { safePath, DATA_ROOT } from '@/lib/fs-utils';
import type { ApiResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
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
    if (!body.targetPath || !body.filename) {
      return NextResponse.json(
        { success: false, error: 'Missing targetPath or filename' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // Build full path: targetPath/Question|Analysis/filename
    const subDir = body.type === 'question' ? 'Question' : 'Analysis';
    const relativePath = body.targetPath + '/' + subDir + '/' + body.filename;

    // Security: must be within 02_Working_Area
    const absolutePath = path.resolve(DATA_ROOT, relativePath);
    if (!absolutePath.includes('02_Working_Area')) {
      return NextResponse.json(
        { success: false, error: 'Path outside working area' } satisfies ApiResponse<null>,
        { status: 403 }
      );
    }

    // Ensure parent directory exists
    const dirPath = path.dirname(absolutePath);
    fs.mkdirSync(dirPath, { recursive: true });

    // Append or create
    const fileExists = fs.existsSync(absolutePath);
    if (fileExists) {
      fs.appendFileSync(absolutePath, '\n\n' + body.text, 'utf-8');
    } else {
      fs.writeFileSync(absolutePath, body.text, 'utf-8');
    }

    const stat = fs.statSync(absolutePath);
    const byteLength = Buffer.byteLength(fs.readFileSync(absolutePath, 'utf-8'), 'utf-8');

    return NextResponse.json({
      success: true,
      data: {
        filePath: relativePath,
        appended: fileExists,
        byteLength,
      },
    });
  } catch (error) {
    console.error('Divert error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
