/**
 * POST /api/synthesis/import
 *
 * 批量写入合成文件到 05_Synthesis_Area/{ExamLevel}/{PartType}/
 * Body: { items: ImportItem[] }
 *
 * 每个 item 包含：setId, examType, partName, content
 * 支持指纹幂等 + Frontmatter 注入
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// gray-matter 不再用于写入（内容含 --- 会误解析），改用手动拼接
import { SYNTHESIS_ROOT } from '@/lib/fs-utils';
import { loadFingerprint, saveFingerprint } from '@/lib/fingerprint';
import crypto from 'crypto';

interface ImportItem {
  setId: string;
  examType: string;   // CET4 / CET6
  partName: string;    // Writing / Listening / Reading / Translation
  content: string;     // 合成后的 Markdown 内容
}

interface ImportResult {
  committed: number;
  skipped: number;
  errors: string[];
  files: string[];
}

/** PartName → 目录名映射 */
const PART_DIR_MAP: Record<string, string> = {
  Writing: 'Writing',
  Listening: 'Listening',
  Reading: 'Reading',
  Translation: 'Translation',
};

/** 校验 setId 格式 */
function isValidSetId(setId: string): boolean {
  return /^CET[46]_\d{4}_\d{2}_S\d+$/.test(setId);
}

/** 校验 examType */
function isValidExamType(examType: string): boolean {
  return examType === 'CET4' || examType === 'CET6';
}

/** 校验 partName */
function isValidPartName(partName: string): boolean {
  return partName in PART_DIR_MAP;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body as { items: ImportItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少 items 数组' },
        { status: 400 }
      );
    }

    const fingerprint = loadFingerprint();
    const result: ImportResult = { committed: 0, skipped: 0, errors: [], files: [] };

    for (const item of items) {
      try {
        // 校验字段
        if (!isValidSetId(item.setId)) {
          result.errors.push(`setId 格式无效: ${item.setId}`);
          continue;
        }
        if (!isValidExamType(item.examType)) {
          result.errors.push(`examType 无效: ${item.examType} (${item.setId})`);
          continue;
        }
        if (!isValidPartName(item.partName)) {
          result.errors.push(`partName 无效: ${item.partName} (${item.setId})`);
          continue;
        }
        if (!item.content || item.content.trim().length === 0) {
          result.errors.push(`content 为空: ${item.setId}_${item.partName}`);
          continue;
        }

        // 构造目标路径
        const partDir = PART_DIR_MAP[item.partName];
        const examDir = item.examType;
        const filename = `${item.setId}_${item.partName}.md`;
        const relDir = path.join('05_Synthesis_Area', examDir, partDir);
        const relPath = path.join(relDir, filename);

        // 确保 SYNTHESIS_ROOT 可达
        const absDir = path.join(SYNTHESIS_ROOT, examDir, partDir);
        const absPath = path.join(absDir, filename);

        // 创建目录
        fs.mkdirSync(absDir, { recursive: true });

        // 手动拼接 frontmatter，避免 gray-matter 把内容中的 --- 误认为 YAML 分隔符
        const frontmatterLines = [
          '---',
          'exam: ' + item.examType,
          'setId: ' + item.setId,
          'partName: ' + item.partName,
          'type: synthesized',
          'createdAt: ' + new Date().toISOString(),
          '---',
          '',
        ];
        const finalContent = frontmatterLines.join('\n') + item.content;

        // 计算内容哈希
        const contentHash = crypto.createHash('sha256').update(finalContent).digest('hex').slice(0, 16);
        const fingerprintKey = relPath.replace(/\\/g, '/');

        // 指纹幂等检查
        if (fingerprint[fingerprintKey] === contentHash) {
          result.skipped++;
          continue;
        }

        // 写入文件
        fs.writeFileSync(absPath, finalContent, 'utf-8');

        // 更新指纹
        fingerprint[fingerprintKey] = contentHash;

        result.committed++;
        result.files.push(relPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`写入失败: ${item.setId}_${item.partName} — ${msg}`);
      }
    }

    // 原子保存指纹
    saveFingerprint(fingerprint);

    console.log(`[SYNTHESIS IMPORT] committed=${result.committed} skipped=${result.skipped} errors=${result.errors.length}`);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[SYNTHESIS IMPORT ERROR]', error);
    return NextResponse.json(
      { success: false, error: '导入失败: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
