/**
 * POST /api/decompose/sub-question/preview
 *
 * 扫描 04_Fusion_Area，返回每个 Part 的子题拆解预览（不写入磁盘）
 */

import { NextRequest, NextResponse } from 'next/server';
import { previewDecompose } from '@/lib/sub-decomposer';

export async function POST(_request: NextRequest) {
  try {
    const previews = previewDecompose();
    const totalSections = previews.reduce((sum, p) => sum + p.totalSections, 0);

    return NextResponse.json({
      success: true,
      data: {
        previews,
        totalSets: previews.length,
        totalSections,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
