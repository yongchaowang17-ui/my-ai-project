'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Scissors, ArrowDown, ArrowUp } from 'lucide-react';

interface SplitAtLineModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (setId: string, qFilename: string, aFilename: string) => void;
  currentFilePath: string;
  cursorLine: number;
  totalLines: number;
  linePreview: string;
}

/** 从路径推断 SetId */
function extractSetIdFromPath(filePath: string): string | null {
  const waMatch = filePath.match(/02_Working_Area\/([^\/]+)\//);
  if (waMatch) return waMatch[1];
  return null;
}

/** 从 routing 文件名推断 SetId */
function inferSetId(filePath: string): string | null {
  const filename = filePath.split('/').pop() || '';
  const base = filename.replace(/\.md$/i, '');
  let examPrefix = '';
  const examMatch = base.match(/^(CET\d|TEM\d)/i);
  if (examMatch) examPrefix = examMatch[1].toUpperCase();
  const dateMatch = base.match(/(20\d{2})[._-](\d{2})/);
  if (!dateMatch || !examPrefix) return null;
  let setNum = '1';
  const setMatch = base.match(/[Ss]et[_]?(\d+)/);
  if (setMatch) setNum = setMatch[1];
  return examPrefix + '_' + dateMatch[1] + '_' + dateMatch[2] + '_S' + setNum;
}

/** 生成默认文件名 */
function generateDefaultFilenames(setId: string, seq: string = '01') {
  const parts = setId.split('_');
  const year = parts[1] || '0000';
  const month = parts[2] || '01';
  const set = parts[3] || 'S1';
  return {
    q: year + '_' + month + '_' + set + '_Q_' + seq + '.md',
    a: year + '_' + month + '_' + set + '_A_' + seq + '.md',
  };
}

/** 获取 Recents SetId 列表 */
function getRecentSetIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem('split-recent-setids') || '[]');
  } catch { return []; }
}

export function SplitAtLineModal({ open, onClose, onConfirm, currentFilePath, cursorLine, totalLines, linePreview }: SplitAtLineModalProps) {
  const [setId, setSetId] = useState('');
  const [qFilename, setQFilename] = useState('');
  const [aFilename, setAFilename] = useState('');
  const [showRecents, setShowRecents] = useState(false);

  const recents = useMemo(() => getRecentSetIds(), [open]);
  const autoSetId = useMemo(() => {
    return extractSetIdFromPath(currentFilePath) || inferSetId(currentFilePath);
  }, [currentFilePath]);

  // 自动填充
  useEffect(() => {
    if (open) {
      const sid = autoSetId || '';
      setSetId(sid);
      if (sid) {
        const names = generateDefaultFilenames(sid);
        setQFilename(names.q);
        setAFilename(names.a);
      } else {
        setQFilename('');
        setAFilename('');
      }
    }
  }, [open, autoSetId]);

  // SetId 变化时更新文件名
  useEffect(() => {
    if (setId) {
      const names = generateDefaultFilenames(setId);
      setQFilename(names.q);
      setAFilename(names.a);
    }
  }, [setId]);

  if (!open) return null;

  const aboveCount = cursorLine - 1;
  const belowCount = totalLines - cursorLine + 1;
  const preview = linePreview.substring(0, 80);

  const handleSelectRecent = (sid: string) => {
    setSetId(sid);
    setShowRecents(false);
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <div className='absolute inset-0 bg-black/40' onClick={onClose} />
      <div className='relative bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 border'>
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b'>
          <h3 className='text-sm font-semibold flex items-center gap-2'>
            <Scissors className='w-4 h-4 text-primary' />
            在此行分割文件
          </h3>
          <button onClick={onClose} className='p-1 rounded hover:bg-muted transition-colors'>
            <X className='w-4 h-4 text-muted-foreground' />
          </button>
        </div>

        <div className='px-5 py-4 space-y-4'>
          {/* 行信息 */}
          <div className='flex gap-3'>
            <div className='flex-1 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800'>
              <div className='flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400 mb-1'>
                <ArrowUp className='w-3 h-3' />
                真题 (Question)
              </div>
              <p className='text-xs font-medium text-green-800 dark:text-green-300'>行 1 ~ {cursorLine - 1}</p>
              <p className='text-[10px] text-green-600 dark:text-green-500'>共 {aboveCount} 行</p>
            </div>
            <div className='flex-1 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'>
              <div className='flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-400 mb-1'>
                <ArrowDown className='w-3 h-3' />
                解析 (Analysis)
              </div>
              <p className='text-xs font-medium text-blue-800 dark:text-blue-300'>行 {cursorLine} ~ {totalLines}</p>
              <p className='text-[10px] text-blue-600 dark:text-blue-500'>共 {belowCount} 行</p>
            </div>
          </div>

          {/* 分割线预览 */}
          <div className='px-3 py-2 rounded-md bg-muted/50 border-l-2 border-primary'>
            <p className='text-[10px] text-muted-foreground mb-1'>分割行 #{cursorLine}</p>
            <p className='text-xs font-mono text-foreground truncate'>{preview || '(empty line)'}</p>
          </div>

          {/* SetId 输入 */}
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>套卷 ID (SetId)</label>
            <div className='relative'>
              <input
                type='text'
                value={setId}
                onChange={e => setSetId(e.target.value)}
                placeholder='例如 CET4_2024_06_S1'
                className='w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'
              />
              {recents.length > 0 && (
                <button
                  onClick={() => setShowRecents(!showRecents)}
                  className='absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground'
                >
                  最近
                </button>
              )}
              {showRecents && (
                <div className='absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-10 max-h-32 overflow-y-auto'>
                  {recents.map(r => (
                    <button
                      key={r}
                      onClick={() => handleSelectRecent(r)}
                      className='w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors'
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 文件名预览 */}
          <div className='space-y-2'>
            <label className='text-xs font-medium text-muted-foreground'>输出文件名</label>
            <div className='flex gap-2'>
              <div className='flex-1'>
                <p className='text-[10px] text-muted-foreground mb-0.5'>Question</p>
                <input
                  type='text'
                  value={qFilename}
                  onChange={e => setQFilename(e.target.value)}
                  className='w-full px-2 py-1.5 text-xs border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30'
                />
              </div>
              <div className='flex-1'>
                <p className='text-[10px] text-muted-foreground mb-0.5'>Analysis</p>
                <input
                  type='text'
                  value={aFilename}
                  onChange={e => setAFilename(e.target.value)}
                  className='w-full px-2 py-1.5 text-xs border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30'
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className='flex items-center justify-end gap-2 px-5 py-3 border-t'>
          <button onClick={onClose}
            className='px-4 py-2 text-sm rounded-md border hover:bg-muted transition-colors'>
            取消
          </button>
          <button
            onClick={() => onConfirm(setId, qFilename, aFilename)}
            disabled={!setId || !qFilename || !aFilename}
            className='flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <Scissors className='w-3.5 h-3.5' />
            确认分割
          </button>
        </div>
      </div>
    </div>
  );
}