/**
 * GET /api/synthesis/preview — 返回合成预览数据
 * POST /api/synthesis/preview — 保存审查状态
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { ApiResponse } from '@/lib/types';

const DATA_ROOT = path.join(process.cwd(), 'data');
const PREVIEW_FILE = path.join(DATA_ROOT, 'synthesis-preview.json');
const STATE_FILE = path.join(DATA_ROOT, 'synthesis-review-state.json');

interface SynthPreview {
  id: string;
  setId: string;
  examType: string;
  partName: string;
  outputFilename: string;
  outputKey: string;
  sourceQ: string | null;
  sourceA: string | null;
  qChars: number;
  aChars: number;
  synthesizedChars: number;
  synthesizedHash: string;
  status: string;
  content: string;
}

function loadPreview(): SynthPreview[] {
  try { return JSON.parse(fs.readFileSync(PREVIEW_FILE, 'utf-8')); } catch { return []; }
}

function loadState(): Record<string, { status: string; reviewedAt?: string }> {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return {}; }
}

function saveState(state: Record<string, unknown>) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const previews = loadPreview();
    const state = loadState();

    // 合并审查状态
    const enriched = previews.map(p => ({
      ...p,
      status: state[p.id]?.status || (p.status === 'exists' ? 'imported' : 'pending'),
      reviewedAt: state[p.id]?.reviewedAt,
    }));

    const stats = {
      total: enriched.length,
      pending: enriched.filter(p => p.status === 'pending').length,
      reviewed: enriched.filter(p => p.status === 'reviewed').length,
      imported: enriched.filter(p => p.status === 'imported').length,
      flagged: enriched.filter(p => p.status === 'flagged').length,
    };

    return NextResponse.json({ success: true, data: { items: enriched, stats } });
  } catch (error) {
    console.error('[SYNTHESIS PREVIEW ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load preview' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ids, id, status: newStatus, content } = body;

    const state = loadState();

    if (action === 'update-status' && id && newStatus) {
      state[id] = { status: newStatus, reviewedAt: new Date().toISOString() };
    } else if (action === 'batch-update' && Array.isArray(ids) && newStatus) {
      for (const itemId of ids) {
        state[itemId] = { status: newStatus, reviewedAt: new Date().toISOString() };
      }
    } else if (action === 'update-content' && id && content !== undefined) {
      // 更新预览文件中的内容
      const previews = loadPreview();
      const idx = previews.findIndex(p => p.id === id);
      if (idx >= 0) {
        previews[idx].content = content;
        fs.writeFileSync(PREVIEW_FILE, JSON.stringify(previews, null, 2), 'utf-8');
      }
      state[id] = { status: state[id]?.status || 'pending', reviewedAt: new Date().toISOString() };
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    saveState(state);
    return NextResponse.json({ success: true, data: { updated: true } });
  } catch (error) {
    console.error('[SYNTHESIS STATE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to update state' }, { status: 500 });
  }
}
