/**
 * POST /api/organize
 *
 * 分拣 routing/ 下的文件到 02_Working_Area/
 *
 * Body: { directory?: string, type?: 'Question' | 'Analysis' }
 * 不传 directory 则分拣 raw_questions + raw_analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { DATA_ROOT } from '@/lib/fs-utils';
import { organizeDirectoryTracked, type OrganizeResult } from '@/lib/organizer';
import type { ApiResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    let results: OrganizeResult[] = [];

    if (body.directory) {
      // 分拣指定目录
      const dirPath = path.isAbsolute(body.directory)
        ? body.directory
        : path.join(DATA_ROOT, body.directory);
      results = organizeDirectoryTracked(dirPath, body.type);
    } else {
      // 分拣默认目录
      const sources = [
        { dir: path.join(DATA_ROOT, 'routing', 'raw_questions'), type: 'Question' as const },
        { dir: path.join(DATA_ROOT, 'routing', 'raw_analysis'), type: 'Analysis' as const },
      ];
      for (const source of sources) {
        results.push(...organizeDirectoryTracked(source.dir, source.type));
      }
    }

    const stats = {
      total: results.length,
      moved: results.filter(r => r.action === 'moved').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      errors: results.filter(r => r.action === 'error').length,
    };

    return NextResponse.json({
      success: true,
      data: { results, stats },
    });
  } catch (error) {
    console.error('Organize error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
