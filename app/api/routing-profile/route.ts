/**
 * GET /api/routing-profile?category=xxx
 *
 * Returns the splitProfile for a given routing category.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ApiResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    if (!category) {
      return NextResponse.json(
        { success: false, error: 'Missing category parameter' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const configPath = join(process.cwd(), 'config', 'routing-rules.json');
    let routingRules: Record<string, { splitProfile?: string; label?: string }>;

    try {
      routingRules = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      return NextResponse.json(
        { success: false, error: 'routing-rules.json not found' } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    const rule = routingRules[category];
    if (!rule) {
      return NextResponse.json(
        { success: false, error: 'Unknown category: ' + category } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        category,
        splitProfile: rule.splitProfile || null,
        label: rule.label || category,
      },
    });
  } catch (error) {
    console.error('Routing profile error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
