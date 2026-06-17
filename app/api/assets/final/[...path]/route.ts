/**
 * GET /api/assets/final/[...path]
 *
 * 标准资产库只读 API
 * - 路径为空 -> 返回 03_Exam_Final/ 目录树
 * - 路径指向目录 -> 返回子目录/文件列表
 * - 路径指向文件 -> 返回文件内容
 *
 * 安全：统一使用 safePath 校验路径，URL 编码自动解码
 * 加固：调试日志 + 防御式 IO + 路径规范化 + 错误反馈增强
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { safePath, FINAL_ROOT, computeChecksum, PathSecurityError } from '@/lib/fs-utils';
import type { ApiResponse, FileContent, FileTreeNode } from '@/lib/types';

// ===== 工具函数 =====

/** 将绝对路径转为相对于 data/ 的路径（FileTreeNode.path 格式） */
function toRelativeDataPath(absPath: string): string {
  const dataRoot = path.dirname(FINAL_ROOT); // data/
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

    // 空路径 -> 返回 03_Exam_Final/ 目录树
    if (!urlPath || urlPath.length === 0) {
      if (!fs.existsSync(FINAL_ROOT)) {
        return NextResponse.json({ success: true, data: [] } satisfies ApiResponse<FileTreeNode[]>);
      }
      const tree = toTreeNode(FINAL_ROOT);
      return NextResponse.json({
        success: true,
        data: tree?.children || [],
      } satisfies ApiResponse<FileTreeNode[]>);
    }

    // 1. 解码 URL 编码的路径段
    const relPath = urlPath.map(decodeURIComponent).join('/');

    // 2. 路径规范化（防穿透：清除 .. 和 .）
    const normalizedRel = path.normalize(relPath).replace(/\\/g, '/');

    // 3. 构造相对于 data/ 的路径，由 safePath 统一校验
    // 注意：safePath 内部已用 path.resolve(DATA_ROOT, ...) 解析
    // 所以这里直接传 '03_Exam_Final/' + normalizedRel，不能外层再包 'data/'
    const subPath = normalizedRel.startsWith('03_Exam_Final/') ? normalizedRel.slice('03_Exam_Final/'.length) : normalizedRel;
    const relativeToData = '03_Exam_Final/' + subPath;
    const absPath = safePath(relativeToData);

    // 4. 调试日志
    console.log(`[API DEBUG] relPath: ${relPath}`);
    console.log(`[API DEBUG] normalizedRel: ${normalizedRel}`);
    console.log(`[API DEBUG] absolutePath: ${absPath}`);
    console.log(`[API DEBUG] cwd: ${process.cwd()}`);

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

    // 7. 防御式 IO：确认是文件再读取
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
    // 路径安全拦截 -> 403
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
    console.error('[API ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
