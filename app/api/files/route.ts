/**
 * GET /api/files
 *
 * Scan data/ directory and return file tree.
 *
 * Query params:
 *   root      -- Path relative to data/, empty string for combined view (default: '02_Working_Area')
 *   recursive -- Whether to recurse (default: 'true')
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  scanDirectory,
  PathSecurityError,
  FileNotFoundError,
} from '@/lib/fs-utils';
import type { ApiResponse, FileTreeNode } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Use empty string for combined view, default to '02_Working_Area' if not provided
    const rootParam = searchParams.get('root');
    const root = rootParam !== null ? rootParam : '02_Working_Area';
    const recursive = searchParams.get('recursive') !== 'false';

    let tree: FileTreeNode[];
    if (recursive) {
      tree = scanDirectory(root);
    } else {
      tree = scanDirectory(root).map((node) => ({
        ...node,
        children: undefined,
      }));
    }

    return NextResponse.json({ success: true, data: tree } satisfies ApiResponse<FileTreeNode[]>);
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof PathSecurityError) {
    return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse<null>, { status: 400 });
  }
  if (error instanceof FileNotFoundError) {
    return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse<null>, { status: 404 });
  }
  console.error('Directory scan error:', error);
  return NextResponse.json({ success: false, error: 'Internal server error' } satisfies ApiResponse<null>, { status: 500 });
}
