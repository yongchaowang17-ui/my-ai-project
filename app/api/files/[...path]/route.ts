/**
 * /api/files/[...path]
 *
 * File CRUD with naming validation:
 *   GET    -- Read file content
 *   POST   -- Create new file (naming validation + auto-create set dirs)
 *   PUT    -- Update file (optimistic lock + naming validation)
 *   DELETE -- Soft delete
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  readFile, createFile, updateFile, softDeleteFile,
  PathSecurityError, FileNotFoundError, FileExistsError,
  ChecksumConflictError, WORKSPACE_ROOT,
} from '@/lib/fs-utils';
import { validateFileName, buildSetIdFromPath } from '@/lib/naming-validator';
import type { ApiResponse, FileContent, FileWriteRequest } from '@/lib/types';

/** Validate filename for write operations (POST/PUT) */
function validateWriteFilename(filePath: string): { ok: boolean; error?: string } {
  // Only validate files within 02_Working_Area
  if (!filePath.includes('02_Working_Area')) return { ok: true };

  const filename = path.basename(filePath);
  const validation = validateFileName(filename);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  return { ok: true };
}

/** GET: Read file content */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');
    const content = readFile(filePath);
    return NextResponse.json({ success: true, data: content } satisfies ApiResponse<FileContent>);
  } catch (error) {
    return handleError(error);
  }
}

/** POST: Create new file */
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    const body: FileWriteRequest = await request.json();
    if (!body.content && body.content !== '') {
      return NextResponse.json({ success: false, error: "Missing 'content'" } satisfies ApiResponse<null>, { status: 400 });
    }

    // Naming validation
    const namingCheck = validateWriteFilename(filePath);
    if (!namingCheck.ok) {
      return NextResponse.json({ success: false, error: 'Naming error: ' + namingCheck.error } satisfies ApiResponse<null>, { status: 400 });
    }

    // Auto-create exam set directory structure
    const setId = buildSetIdFromPath(filePath);
    if (setId) {
      const qDir = path.join(WORKSPACE_ROOT, setId, 'Question');
      const aDir = path.join(WORKSPACE_ROOT, setId, 'Analysis');
      fs.mkdirSync(qDir, { recursive: true });
      fs.mkdirSync(aDir, { recursive: true });
    }

    const result = createFile(filePath, body.content);
    return NextResponse.json({ success: true, data: result } satisfies ApiResponse<FileContent>, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

/** PUT: Update file (optimistic lock) */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    const body: FileWriteRequest = await request.json();
    if (!body.content && body.content !== '') {
      return NextResponse.json({ success: false, error: "Missing 'content'" } satisfies ApiResponse<null>, { status: 400 });
    }
    if (!body.checksum) {
      return NextResponse.json({ success: false, error: 'PUT requires checksum (optimistic lock)' } satisfies ApiResponse<null>, { status: 400 });
    }

    // Naming validation
    const namingCheck = validateWriteFilename(filePath);
    if (!namingCheck.ok) {
      return NextResponse.json({ success: false, error: 'Naming error: ' + namingCheck.error } satisfies ApiResponse<null>, { status: 400 });
    }

    const result = updateFile(filePath, body.content, body.checksum);
    return NextResponse.json({ success: true, data: result } satisfies ApiResponse<FileContent>);
  } catch (error) {
    return handleError(error);
  }
}

/** DELETE: Soft delete */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');
    softDeleteFile(filePath);
    return NextResponse.json({ success: true, data: { message: 'Deleted: ' + filePath } });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof PathSecurityError) return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse<null>, { status: 400 });
  if (error instanceof FileNotFoundError) return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse<null>, { status: 404 });
  if (error instanceof FileExistsError) return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse<null>, { status: 409 });
  if (error instanceof ChecksumConflictError) return NextResponse.json({ success: false, error: error.message, data: { currentChecksum: error.currentChecksum } } as ApiResponse<{ currentChecksum: string }>, { status: 409 });
  if (error instanceof SyntaxError) return NextResponse.json({ success: false, error: 'Invalid JSON' } satisfies ApiResponse<null>, { status: 400 });
  console.error('File operation error:', error);
  return NextResponse.json({ success: false, error: 'Internal server error' } satisfies ApiResponse<null>, { status: 500 });
}
