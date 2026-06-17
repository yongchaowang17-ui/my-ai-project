'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Send } from 'lucide-react';

interface DivertModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (type: 'question' | 'analysis', filename: string) => void;
  currentFilePath: string;
  selectedText: string;
}

/** Extract setId from path like "02_Working_Area/CET4_2024_06_S1/Question/xxx.md" */
function extractSetId(filePath: string): string | null {
  const match = filePath.match(/02_Working_Area\/([^\/]+)\//);
  return match ? match[1] : null;
}

/** Generate default filename from setId and type */
function generateFilename(setId: string, type: 'question' | 'analysis'): string {
  // setId format: CET4_2024_06_S1
  // Extract year_month_set from setId
  const parts = setId.split('_');
  // parts: [CET4, 2024, 06, S1]
  if (parts.length < 4) return setId + '_' + (type === 'question' ? 'Q' : 'A') + '_01.md';
  const year = parts[1];
  const month = parts[2];
  const set = parts[3];
  const side = type === 'question' ? 'Q' : 'A';
  return year + '_' + month + '_' + set + '_' + side + '_01.md';
}

export function DivertModal({ open, onClose, onConfirm, currentFilePath, selectedText }: DivertModalProps) {
  const [type, setType] = useState<'question' | 'analysis'>('question');
  const [filename, setFilename] = useState('');

  const setId = useMemo(() => extractSetId(currentFilePath), [currentFilePath]);

  // Auto-generate filename when type changes
  useEffect(() => {
    if (setId) {
      setFilename(generateFilename(setId, type));
    }
  }, [setId, type]);

  // Reset on open
  useEffect(() => {
    if (open && setId) {
      setType('question');
      setFilename(generateFilename(setId, 'question'));
    }
  }, [open, setId]);

  if (!open) return null;

  const targetPath = setId ? '02_Working_Area/' + setId : '';
  const targetDir = type === 'question' ? 'Question' : 'Analysis';
  const previewPath = targetPath + '/' + targetDir + '/' + filename;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      {/* Backdrop */}
      <div className='absolute inset-0 bg-black/40' onClick={onClose} />

      {/* Modal card */}
      <div className='relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 border'>
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b'>
          <h3 className='text-sm font-semibold'>导出选区内容</h3>
          <button onClick={onClose} className='p-1 rounded hover:bg-muted transition-colors'>
            <X className='w-4 h-4 text-muted-foreground' />
          </button>
        </div>

        {/* Body */}
        <div className='px-5 py-4 space-y-4'>
          {/* Type selection */}
          <div className='space-y-2'>
            <label className='text-xs font-medium text-muted-foreground'>目标类型</label>
            <div className='flex gap-3'>
              <label className={'flex-1 flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors '
                + (type === 'question' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30')}>
                <input type='radio' name='divertType' value='question'
                  checked={type === 'question'} onChange={() => setType('question')}
                  className='sr-only' />
                <span className='text-lg'>📝</span>
                <div>
                  <span className='text-sm font-medium'>真题</span>
                  <p className='text-[11px] text-muted-foreground'>Question</p>
                </div>
              </label>
              <label className={'flex-1 flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors '
                + (type === 'analysis' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30')}>
                <input type='radio' name='divertType' value='analysis'
                  checked={type === 'analysis'} onChange={() => setType('analysis')}
                  className='sr-only' />
                <span className='text-lg'>📖</span>
                <div>
                  <span className='text-sm font-medium'>解析</span>
                  <p className='text-[11px] text-muted-foreground'>Analysis</p>
                </div>
              </label>
            </div>
          </div>

          {/* Filename input */}
          <div className='space-y-2'>
            <label className='text-xs font-medium text-muted-foreground'>文件名</label>
            <input
              type='text'
              value={filename}
              onChange={e => setFilename(e.target.value)}
              className='w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'
            />
          </div>

          {/* Preview path */}
          <div className='px-3 py-2 rounded-md bg-muted/50 text-xs text-muted-foreground font-mono break-all'>
            {previewPath}
          </div>

          {/* Selected text preview */}
          {selectedText && (
            <div className='space-y-1'>
              <label className='text-xs font-medium text-muted-foreground'>选区预览</label>
              <div className='px-3 py-2 rounded-md bg-muted/30 text-xs text-muted-foreground max-h-20 overflow-auto whitespace-pre-wrap'>
                {selectedText.substring(0, 200)}{selectedText.length > 200 ? '...' : ''}
              </div>
              <p className='text-[10px] text-muted-foreground'>共 {selectedText.length} 字符</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='flex items-center justify-end gap-2 px-5 py-3 border-t'>
          <button onClick={onClose}
            className='px-4 py-2 text-sm rounded-md border hover:bg-muted transition-colors'>
            取消
          </button>
          <button onClick={() => onConfirm(type, filename)}
            disabled={!filename || !setId}
            className='flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
            <Send className='w-3.5 h-3.5' />
            确认导出
          </button>
        </div>
      </div>
    </div>
  );
}
