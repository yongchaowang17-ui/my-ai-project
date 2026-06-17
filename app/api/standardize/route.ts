/**
 * POST /api/standardize
 *
 * 标准化：将 02_Working_Area/ 的文件复制到 03_Exam_Final/
 * 注入 YAML Frontmatter 元数据，幂等执行
 */

import { NextRequest, NextResponse } from 'next/server';
import { standardizeAll } from '@/lib/standardizer';
import type { ApiResponse } from '@/lib/types';

export async function POST() {
  try {
    const results = standardizeAll();

    const stats = {
      total: results.length,
      copied: results.filter(r => r.action === 'copied').length,
      updated: results.filter(r => r.action === 'updated').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      errors: results.filter(r => r.action === 'error').length,
    };

    return NextResponse.json({
      success: true,
      data: { results, stats },
    });
  } catch (error) {
    console.error('Standardize error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
