/**
 * GET /api/alignment
 *
 * Alignment detection for exam sets.
 *
 * Query params:
 *   setId  -- Check alignment for a specific set (e.g., CET4_2024_06_S1)
 *   all    -- If "true", return alignment status for all sets
 */

import { NextRequest, NextResponse } from 'next/server';
import { listExamSets, getExamSetStructure } from '@/lib/fs-utils';
import { validateFileName, extractPairKey } from '@/lib/naming-validator';
import type { ApiResponse, AlignmentStatus } from '@/lib/types';

/** Compute alignment status for a single exam set */
function computeAlignment(setId: string): AlignmentStatus {
  const { questionFiles, analysisFiles } = getExamSetStructure(setId);

  // Extract pairKeys from each side
  const qMap = new Map<string, string>(); // pairKey -> filename
  for (const f of questionFiles) {
    const key = extractPairKey(f);
    if (key) qMap.set(key, f);
  }

  const aMap = new Map<string, string>();
  for (const f of analysisFiles) {
    const key = extractPairKey(f);
    if (key) aMap.set(key, f);
  }

  // Find matched pairs
  const matched: AlignmentStatus['matched'] = [];
  const matchedKeys = new Set<string>();

  for (const [key, qFile] of qMap) {
    if (aMap.has(key)) {
      matched.push({ questionFile: qFile, analysisFile: aMap.get(key)!, pairKey: key });
      matchedKeys.add(key);
    }
  }

  // Find unmatched files
  const unmatched: AlignmentStatus['unmatched'] = [];
  for (const [key, qFile] of qMap) {
    if (!matchedKeys.has(key)) {
      unmatched.push({ file: qFile, side: 'question' });
    }
  }
  for (const [key, aFile] of aMap) {
    if (!matchedKeys.has(key)) {
      unmatched.push({ file: aFile, side: 'analysis' });
    }
  }

  return {
    setId,
    questionFiles,
    analysisFiles,
    matched,
    unmatched,
    isFullyAligned: unmatched.length === 0 && questionFiles.length > 0 && analysisFiles.length > 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const setId = searchParams.get('setId');
    const all = searchParams.get('all') === 'true';

    if (all) {
      // Return alignment for all sets
      const setIds = listExamSets();
      const results: Record<string, AlignmentStatus> = {};
      for (const id of setIds) {
        results[id] = computeAlignment(id);
      }

      const totalSets = setIds.length;
      const alignedCount = Object.values(results).filter(r => r.isFullyAligned).length;

      return NextResponse.json({
        success: true,
        data: {
          sets: results,
          summary: { totalSets, alignedCount, pendingCount: totalSets - alignedCount },
        },
      });
    }

    if (!setId) {
      return NextResponse.json(
        { success: false, error: 'Missing setId or all parameter' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const status = computeAlignment(setId);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('Alignment error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
