/**
 * GET /api/assets/fusion/[...path]
 *
 * 融合区只读 API（04_Fusion_Area）
 * - 路径为空 -> 返回 04_Fusion_Area/ 目录树
 * - 路径指向目录 -> 返回子目录/文件列表
 * - 路径指向文件 -> 返回文件内容
 *
 * 安全：统一使用 safePath 校验路径，URL 编码自动解码
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { safePath, FUSION_ROOT, computeChecksum, PathSecurityError } from '@/lib/fs-utils';
import type { ApiResponse, FileContent, FileTreeNode } from '@/lib/types';

// ===== 工具函数 =====

/** 将绝对路径转为相对于 data/ 的路径（FileTreeNode.path 格式） */
function toRelativeDataPath(absPath: string): string {
  const dataRoot = path.dirname(FUSION_ROOT); // data/
  return path.relative(dataRoot, absPath).replace(/\\/g, '/');
}

/** 构建目录树节点 */
function toTreeNode(absPath: string): FileTreeNode | null {
  try {
    const stat = fs.statSync(absPath);
    const name = path.basename(absPath);
    const relativePath = toRelativeDataPath(absPath);

    if (stat.isDirectory()) {
      const children = fs.readdirSync(absPath)
        .filter(e => !e.startsWith('.'))
        .map(e => toTreeNode(path.join(absPath, e)))
        .filter((n): n is FileTreeNode => n !== null);
      return { name, path: relativePath, type: 'directory', children };
    }

    return {
      name,
      path: relativePath,
      type: 'file',
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
      extension: path.extname(name),
    };
  } catch {
    return null;
  }
}

// ===== 路由处理 =====

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: urlPath } = await params;

    // 空路径 -> 返回 04_Fusion_Area/ 目录树
    if (!urlPath || urlPath.length === 0) {
      if (!fs.existsSync(FUSION_ROOT)) {
        return NextResponse.json({ success: true, data: [] } satisfies ApiResponse<FileTreeNode[]>);
      }
      const tree = toTreeNode(FUSION_ROOT);
      return NextResponse.json({
        success: true,
        data: tree?.children || [],
      } satisfies ApiResponse<FileTreeNode[]>);
    }

    // 1. 解码 URL 编码的路径段
    const relPath = urlPath.map(decodeURIComponent).join('/');

    // 2. 路径规范化（防穿透）
    const normalizedRel = path.normalize(relPath).replace(/\\/g, '/');

    // 3. 构造相对于 data/ 的路径，由 safePath 统一校验
    const subPath = normalizedRel.startsWith('04_Fusion_Area/')
      ? normalizedRel.slice('04_Fusion_Area/'.length)
      : normalizedRel;
    const relativeToData = '04_Fusion_Area/' + subPath;
    const absPath = safePath(relativeToData);

    // 4. 调试日志
    console.log(`[FUSION API DEBUG] relPath: ${relPath}`);
    console.log(`[FUSION API DEBUG] absolutePath: ${absPath}`);

    // 5. 存在性检查
    if (!fs.existsSync(absPath)) {
      return NextResponse.json(
        {
          success: false,
          error: '文件不存在: ' + relPath,
          debug: { absPath, cwd: process.cwd(), normalizedRel },
        },
        { status: 404 }
      );
    }

    const stat = fs.statSync(absPath);

    // 6. 目录 -> 返回子列表
    if (stat.isDirectory()) {
      const children = fs.readdirSync(absPath)
        .filter(e => !e.startsWith('.'))
        .map(e => toTreeNode(path.join(absPath, e)))
        .filter((n): n is FileTreeNode => n !== null);
      return NextResponse.json({ success: true, data: children } satisfies ApiResponse<FileTreeNode[]>);
    }

    // 7. 防御式 IO
    if (!stat.isFile()) {
      return NextResponse.json(
        { success: false, error: '路径指向非文件类型' } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 8. 文件 -> 返回内容
    const content = fs.readFileSync(absPath, 'utf-8');
    const checksum = computeChecksum(content);
    const fileData: FileContent = {
      path: toRelativeDataPath(absPath),
      name: path.basename(absPath),
      content,
      encoding: 'utf-8',
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
      checksum,
    };

    return NextResponse.json({ success: true, data: fileData } satisfies ApiResponse<FileContent>);
  } catch (error) {
    if (error instanceof PathSecurityError) {
      return NextResponse.json(
        {
          success: false,
          error: '路径越界: ' + error.message,
          debug: { attempted: error.message, cwd: process.cwd() },
        },
        { status: 403 }
      );
    }
    console.error('[FUSION API ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
