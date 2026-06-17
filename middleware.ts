/**
 * Next.js 中间件
 *
 * 权限分级：
 * - /api/assets/final/** → 仅允许 GET（只读），其他方法返回 403
 * - /api/assets/fusion/** → 仅允许 GET（只读），其他方法返回 403
 * - /api/assets/synthesis/** → 仅允许 GET（只读），其他方法返回 403
 * - 其他路由 → 放行
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 标准资产库 API 只允许 GET
  if (pathname.startsWith('/api/assets/final')) {
    if (request.method !== 'GET') {
      return NextResponse.json(
        { success: false, error: 'Standard asset library is read-only' },
        { status: 403 }
      );
    }
  }

  // 融合区 API 只允许 GET
  if (pathname.startsWith('/api/assets/fusion')) {
    if (request.method !== 'GET') {
      return NextResponse.json(
        { success: false, error: 'Fusion area is read-only' },
        { status: 403 }
      );
    }
  }

  // 合成区 API 只允许 GET
  if (pathname.startsWith('/api/assets/synthesis')) {
    if (request.method !== 'GET') {
      return NextResponse.json(
        { success: false, error: 'Synthesis area is read-only' },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/assets/final/:path*', '/api/assets/fusion/:path*', '/api/assets/synthesis/:path*'],
};
