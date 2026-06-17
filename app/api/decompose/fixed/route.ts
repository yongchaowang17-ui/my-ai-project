/**
 * GET /api/decompose/fixed
 * Returns fix report data from fix-report-step1.json and fix-report-step2.json
 */
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface FixedItem {
  sid: string;
  exam: string;
  ty: string;
  source: string;
  written: Array<{ partIndex: number; partName: string; filename: string; lineCount: number; byteLength: number }>;
  step: number;
  status: 'fixed' | 'converted' | 'pending_ocr';
}

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const items: FixedItem[] = [];

    // Step 1 report
    const step1Path = path.join(dataDir, 'fix-report-step1.json');
    if (fs.existsSync(step1Path)) {
      const step1 = JSON.parse(fs.readFileSync(step1Path, 'utf-8'));
      for (const f of (step1.fixed || [])) {
        items.push({ sid: f.sid, exam: f.exam, ty: f.ty, source: f.source, written: f.written, step: 1, status: 'fixed' });
      }
      for (const s of (step1.skipped || [])) {
        items.push({ sid: s.sid || '?', exam: '', ty: s.ty || '', source: '', written: [], step: 1, status: 'pending_ocr' });
      }
    }

    // Step 2 report
    const step2Path = path.join(dataDir, 'fix-report-step2.json');
    if (fs.existsSync(step2Path)) {
      const step2 = JSON.parse(fs.readFileSync(step2Path, 'utf-8'));
      for (const c of (step2.converted || [])) {
        const setId = c.target03.match(/(CET\d_\d{4}_\d{2}_S\d+)/)?.[1] || '?';
        const exam = c.target03.startsWith('CET4') ? 'CET4' : 'CET6';
        const ty = c.target03.includes('Question') ? 'Question' : 'Analysis';
        items.push({ sid: setId, exam, ty, source: c.pdf, written: [{ partIndex: 0, partName: 'PDF Convert', filename: c.target03, lineCount: 0, byteLength: c.chars }], step: 2, status: 'converted' });
      }
    }

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('[FIXED API ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
