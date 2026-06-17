/**
 * POST /api/split
 *
 * Question splitting with routing-aware rule selection.
 *
 * Body: {
 *   text: string,
 *   examType: string,
 *   filePath?: string,       // File path for auto-detecting splitProfile
 *   splitProfile?: string    // Explicit splitProfile override
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { splitByRules, segmentsToQuestions } from '@/lib/splitter';
import type { ApiResponse, SplitRule } from '@/lib/types';

/** Load JSON config file */
function loadConfig(filename: string): Record<string, unknown> {
  const configPath = join(process.cwd(), 'config', filename);
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

/** Extract routing category from file path like "routing/mixed/xxx.md" */
function extractCategoryFromPath(filePath: string): string | null {
  const match = filePath.match(/routing\/([^\/]+)\//);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.text) {
      return NextResponse.json(
        { success: false, error: "Missing 'text' field" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // Determine splitProfile
    let splitProfile = body.splitProfile || null;

    if (!splitProfile && body.filePath) {
      // Auto-detect from file path
      const category = extractCategoryFromPath(body.filePath);
      if (category) {
        const routingRules = loadConfig('routing-rules.json') as Record<string, { splitProfile?: string }>;
        const rule = routingRules[category];
        if (rule?.splitProfile) {
          splitProfile = rule.splitProfile;
        }
      }
    }

    // Fall back to examType if no splitProfile
    if (!splitProfile) {
      splitProfile = body.examType || 'cet4';
    }

    // Load split rules for this profile
    const allRules = loadConfig('split-rules.json') as Record<string, SplitRule[]>;
    const rules = allRules[splitProfile] || allRules['cet4'] || [];

    // Execute splitting
    const segments = splitByRules(body.text, rules);
    const questions = segmentsToQuestions(segments, body.filePath || 'unknown', body.examType || 'unknown');

    const response = {
      success: true,
      data: {
        splitProfile,
        questionCount: questions.length,
        segmentCount: segments.length,
        questions,
        segments: segments.map(s => ({
          type: s.type,
          lineCount: s.lines.length,
          preview: s.rawText.substring(0, 80) + (s.rawText.length > 80 ? '...' : ''),
        })),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Split error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
