'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, FileOutput, Plus, ArrowRight } from 'lucide-react';

interface ExtractSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (type: 'question' | 'analysis', filename: string, append: boolean, zone: 'working' | 'fusion') => void;
  currentFilePath: string;
  selectedText: string;
}

/** 从路径推断 SetId */
function extractSetIdFromPath(filePath: string): string | null {
  // 02_Working_Area/{setId}/...
  const waMatch = filePath.match(/02_Working_Area\/([^\/]+)\//);
  if (waMatch) return waMatch[1];

  // 04_Fusion_Area/{exam}/{type}/{setId}/...
  const fusionMatch = filePath.match(/04_Fusion_Area\/([^\/]+)\/[^\/]+\/([^\/]+)\//);
  if (fusionMatch) return fusionMatch[1] + '_' + fusionMatch[2];

  // 03_Exam_Final/{exam}/{type}/{filename} — 从文件名推断
  const finalMatch = filePath.match(/03_Exam_Final\/([^\/]+)\/[^\/]+\/([^\/]+)\.md$/);
  if (finalMatch) {
    const exam = finalMatch[1].toUpperCase();
    const fname = finalMatch[2];
    // 标准格式：2015_06_S1_Q_01
    const stdM = fname.match(/^(\d{4}_\d{2}_S\d+)_/);
    if (stdM) return exam + '_' + stdM[1];
    // routing 格式：CET4_2015.06_Set1_纯真题
    const yearM = fname.match(/(20\d{2})[._-](\d{2})/);
    const setM = fname.match(/[Ss]et[_]?(\d+)/);
    if (yearM) return exam + '_' + yearM[1] + '_' + yearM[2] + '_S' + (setM ? setM[1] : '1');
  }

  // routing/{category}/{filename}
  const routingMatch = filePath.match(/routing\/([^\/]+)\/([^\/]+)\//);
  if (routingMatch) {
    const filename = routingMatch[2];
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
  return null;
}

/** 生成默认文件名 */
function generateFilename(setId: string, type: 'question' | 'analysis'): string {
  const parts = setId.split('_');
  const year = parts[1] || '0000';
  const month = parts[2] || '01';
  const set = parts[3] || 'S1';
  const side = type === 'question' ? 'Q' : 'A';
  return year + '_' + month + '_' + set + '_' + side + '_01.md';
}

/** 获取 Recents SetId 列表 */
function getRecentSetIds(): string[] {
  try { return JSON.parse(localStorage.getItem('split-recent-setids') || '[]'); }
  catch { return []; }
}

export function ExtractSelectionModal({ open, onClose, onConfirm, currentFilePath, selectedText }: ExtractSelectionModalProps) {
  const [type, setType] = useState<'question' | 'analysis'>('question');
  const [filename, setFilename] = useState('');
  const [append, setAppend] = useState(false);
  const [zone, setZone] = useState<'working' | 'fusion'>('working');
  const [showRecents, setShowRecents] = useState(false);

  const setId = useMemo(() => extractSetIdFromPath(currentFilePath), [currentFilePath]);
  const recents = useMemo(() => getRecentSetIds(), [open]);

  useEffect(() => {
    if (open && setId) {
      setType('question');
      setFilename(generateFilename(setId, 'question'));
      setAppend(false);
    }
  }, [open, setId]);

  useEffect(() => {
    if (setId && open) {
      setFilename(generateFilename(setId, type));
    }
  }, [type, setId, open]);

  if (!open) return null;

  const targetPath = setId ? (zone === 'fusion' ? '04_Fusion_Area/' : '02_Working_Area/') + setId : '';
  const targetDir = type === 'question' ? 'Question' : 'Analysis';
  const previewPath = targetPath ? targetPath + '/' + targetDir + '/' + filename : '.../' + targetDir + '/' + filename;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <div className='absolute inset-0 bg-black/40' onClick={onClose} />
      <div className='relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 border'>
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b'>
          <h3 className='text-sm font-semibold flex items-center gap-2'>
            <FileOutput className='w-4 h-4 text-primary' />
            提取选区内容
          </h3>
          <button onClick={onClose} className='p-1 rounded hover:bg-muted transition-colors'>
            <X className='w-4 h-4 text-muted-foreground' />
          </button>
        </div>

        <div className='px-5 py-4 space-y-4'>
          {/* 目标类型 */}
          <div className='space-y-2'>
            <label className='text-xs font-medium text-muted-foreground'>目标类型</label>
            <div className='flex gap-3'>
              <label className={'flex-1 flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors '
                + (type === 'question' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30')}>
                <input type='radio' name='extractType' value='question'
                  checked={type === 'question'} onChange={() => setType('question')} className='sr-only' />
                <span className='text-lg'>{'\uD83D\uDCDD'}</span>
                <div>
                  <span className='text-sm font-medium'>真题</span>
                  <p className='text-[11px] text-muted-foreground'>Question</p>
                </div>
              </label>
              <label className={'flex-1 flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors '
                + (type === 'analysis' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30')}>
                <input type='radio' name='extractType' value='analysis'
                  checked={type === 'analysis'} onChange={() => setType('analysis')} className='sr-only' />
                <span className='text-lg'>{'\uD83D\uDCD6'}</span>
                <div>
                  <span className='text-sm font-medium'>解析</span>
                  <p className='text-[11px] text-muted-foreground'>Analysis</p>
                </div>
              </label>
            </div>
          </div>

          {/* 写入模式 */}
          <div className='space-y-2'>
            <label className='text-xs font-medium text-muted-foreground'>写入模式</label>
            <div className='flex gap-2'>
              <button
                onClick={() => setAppend(false)}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-colors '
                  + (!append ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/30')}
              >
                <Plus className='w-3 h-3' />
                创建新文件
              </button>
              <button
                onClick={() => setAppend(true)}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-colors '
                  + (append ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/30')}
              >
                <ArrowRight className='w-3 h-3' />
                追加到已有文件
              </button>
            </div>
          </div>

          
          {/* 目标区域 */}
          <div className='space-y-2'>
            <label className='text-xs font-medium text-muted-foreground'>目标区域</label>
            <div className='flex gap-2'>
              <button
                onClick={() => setZone('working')}
                className={'flex-1 px-3 py-2 rounded-md border text-xs transition-colors text-left '
                  + (zone === 'working' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-700' : 'border-border text-muted-foreground hover:border-muted-foreground/30')}
              >
                <span className='font-medium'>合成区</span>
                <span className='block text-[10px] opacity-60'>02_Working_Area</span>
              </button>
              <button
                onClick={() => setZone('fusion')}
                className={'flex-1 px-3 py-2 rounded-md border text-xs transition-colors text-left '
                  + (zone === 'fusion' ? 'border-cyan-500 bg-cyan-500/5 text-cyan-700' : 'border-border text-muted-foreground hover:border-muted-foreground/30')}
              >
                <span className='font-medium'>融合区</span>
                <span className='block text-[10px] opacity-60'>04_Fusion_Area</span>
              </button>
            </div>
          </div>

          {/* 文件名 */}
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>文件名</label>
            <div className='relative'>
              <input
                type='text'
                value={filename}
                onChange={e => setFilename(e.target.value)}
                className='w-full px-3 py-2 text-sm border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'
              />
              {recents.length > 0 && !append && (
                <button
                  onClick={() => setShowRecents(!showRecents)}
                  className='absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground'
                >
                  最近
                </button>
              )}
              {showRecents && !append && (
                <div className='absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-10 max-h-32 overflow-y-auto'>
                  {recents.map(r => {
                    const names = { q: generateFilename(r, 'question'), a: generateFilename(r, 'analysis') };
                    return (
                      <button key={r} onClick={() => { setShowRecents(false); }}
                        className='w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors'>
                        {type === 'question' ? names.q : names.a}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 路径预览 */}
          <div className='px-3 py-2 rounded-md bg-muted/50 text-xs text-muted-foreground font-mono break-all'>
            {previewPath}
          </div>

          {/* 选区预览 */}
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
          <button
            onClick={() => onConfirm(type, filename, append, zone)}
            disabled={!filename}
            className='flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <FileOutput className='w-3.5 h-3.5' />
            {append ? '追加导出' : '确认提取'}
          </button>
        </div>
      </div>
    </div>
  );
}