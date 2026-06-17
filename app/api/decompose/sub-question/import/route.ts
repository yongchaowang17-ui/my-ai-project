/**
 * POST /api/decompose/sub-question/import
 *
 * 将审批通过的子题写入 04.5_Decomposed
 * Body: { items: SubSection[] }  (仅包含 status='approved' 的项)
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeDecomposed } from '@/lib/sub-decomposer';
import type { SubSection } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: SubSection[] = body.items;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { success: false, error: 'items array is required' },
        { status: 400 }
      );
    }

    const result = writeDecomposed(items);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
