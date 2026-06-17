'use client';

import type { FileContent } from '@/lib/types';
import { Save, Scissors, RotateCcw } from 'lucide-react';

/**
 * 编辑器占位组件
 * 下一阶段替换为 Monaco Editor
 */
interface EditorPlaceholderProps {
  file: FileContent | null;
}

export function EditorPlaceholder({ file }: EditorPlaceholderProps) {
  /** 未选择文件时的空状态 */
  if (!file) {
    return (
      <div className='flex-1 flex items-center justify-center text-muted-foreground'>
        <div className='text-center space-y-2'>
          <div className='text-4xl'>📝</div>
          <p className='text-sm'>选择左侧文件开始编辑</p>
          <p className='text-xs text-muted-foreground/60'>
            支持 .md 文件的可视化拆解与清洗
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex-1 flex flex-col min-h-0'>
      {/* 工具栏 */}
      <div className='h-10 flex items-center gap-2 px-3 border-b shrink-0'>
        <span className='text-xs font-medium truncate max-w-48'>
          {file.name}
        </span>
        <span className='text-[10px] text-muted-foreground'>
          {formatSize(file.size)}
        </span>
        <div className='ml-auto flex items-center gap-1'>
          <button
            className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
            title='保存'
          >
            <Save className='w-3.5 h-3.5' />
          </button>
          <button
            className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
            title='撤销'
          >
            <RotateCcw className='w-3.5 h-3.5' />
          </button>
          <button
            className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
            title='AI 拆解选中文本'
          >
            <Scissors className='w-3.5 h-3.5' />
          </button>
        </div>
      </div>

      {/* 编辑器内容区（临时 pre 标签，后续替换为 Monaco Editor） */}
      <div className='flex-1 overflow-auto p-4 bg-muted/10'>
        <pre className='text-xs font-mono whitespace-pre-wrap leading-relaxed'>
          {file.content}
        </pre>
      </div>

      {/* 底部状态栏 */}
      <div className='h-6 flex items-center px-3 border-t text-[10px] text-muted-foreground shrink-0 gap-4'>
        <span>SHA: {file.checksum}</span>
        <span>UTF-8</span>
        <span>{file.encoding}</span>
        <span className='ml-auto'>
          {file.content.split('\n').length} 行
        </span>
      </div>
    </div>
  );
}

/** 格式化文件大小显示 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}
