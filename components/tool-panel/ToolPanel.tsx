'use client';

import { useState, useMemo } from 'react';
import type { FileContent } from '@/lib/types';
import type { MarkdownEditorHandle } from '@/components/editor/MarkdownEditor';
import { Scissors, FileOutput, MessageSquare, ArrowLeftRight, Send } from 'lucide-react';

interface ToolPanelProps {
  file: FileContent | null;
  editorRef?: React.RefObject<MarkdownEditorHandle | null>;
  splitProfile?: string | null;
  onOpenFile?: (path: string) => void;
  onDivert?: () => void;
  onSplitAtLine?: () => void;
  onExtractSelection?: () => void;
}

type TabId = 'split' | 'export' | 'annotation';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'split', label: '拆解', icon: <Scissors className='w-3.5 h-3.5' /> },
  { id: 'export', label: '导出', icon: <FileOutput className='w-3.5 h-3.5' /> },
  { id: 'annotation', label: '批注', icon: <MessageSquare className='w-3.5 h-3.5' /> },
];

const PROFILE_LABELS: Record<string, string> = {
  'questions-only': '快速题型',
  'analysis-only': '答案对齐',
  'anchor-split': '锚点切分',
  'multi-set': '多套卷拆分',
};

function isInWorkingArea(filePath: string): boolean {
  return filePath.includes('02_Working_Area');
}

function getFileSide(filename: string): 'Q' | 'A' | null {
  const match = filename.match(/_([QA])_/);
  return match ? (match[1] as 'Q' | 'A') : null;
}

function buildPairedFilename(filename: string): string | null {
  const side = getFileSide(filename);
  if (!side) return null;
  return filename.replace('_' + side + '_', '_' + (side === 'Q' ? 'A' : 'Q') + '_');
}

function buildPairedPath(filePath: string): string | null {
  const parts = filePath.split('/');
  const paired = buildPairedFilename(parts[parts.length - 1]);
  if (!paired) return null;
  parts[parts.length - 1] = paired;
  return parts.join('/');
}

export function ToolPanel({ file, editorRef, splitProfile, onOpenFile, onDivert, onSplitAtLine, onExtractSelection }: ToolPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('split');

  const pairedInfo = useMemo(() => {
    if (!file || !isInWorkingArea(file.path)) return null;
    const side = getFileSide(file.name);
    const pairedPath = buildPairedPath(file.path);
    const pairedFilename = pairedPath ? pairedPath.split('/').pop() : null;
    return { side, pairedPath, pairedFilename };
  }, [file]);

  return (
    <div className='flex flex-col h-full'>
      {/* Action buttons */}
      {file && (
        <div className='px-3 py-2 border-b shrink-0 space-y-2'>
          {/* Row 1: Split + Extract */}
          <div className='flex gap-2'>
            <button onClick={onSplitAtLine}
              className='flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md border border-dashed border-amber-400/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors font-medium'
              title='在光标所在行将文件分割为真题+解析'>
              <Scissors className='w-3 h-3' />
              行级分割
            </button>
            <button onClick={onExtractSelection}
              className='flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md border border-dashed border-blue-400/60 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors font-medium'
              title='将选中文本提取为独立文件'>
              <FileOutput className='w-3 h-3' />
              提取选区
            </button>
          </div>
          {/* Row 2: Divert (working area only) */}
          {isInWorkingArea(file.path) && (
            <button onClick={onDivert}
              className='w-full flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors font-medium'>
              <Send className='w-3 h-3' />
              导出/分流
            </button>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className='flex border-b shrink-0'>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors border-b-2 '
              + (activeTab === tab.id ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className='flex-1 overflow-y-auto p-3'>
        {pairedInfo && pairedInfo.pairedPath && (
          <button onClick={() => onOpenFile?.(pairedInfo.pairedPath!)}
            className='w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-primary/30 text-xs text-primary hover:bg-primary/5 transition-colors'>
            <ArrowLeftRight className='w-3.5 h-3.5' />
            打开对应{pairedInfo.side === 'Q' ? '解析' : '题目'}
            <span className='text-[10px] text-muted-foreground ml-1'>{pairedInfo.pairedFilename}</span>
          </button>
        )}

        {activeTab === 'split' && <SplitTab file={file} editorRef={editorRef} splitProfile={splitProfile} />}
        {activeTab === 'export' && <ExportTab file={file} />}
        {activeTab === 'annotation' && <AnnotationTab file={file} />}
      </div>
    </div>
  );
}

function SplitTab({ file, editorRef, splitProfile }: { file: FileContent | null; editorRef?: React.RefObject<MarkdownEditorHandle | null>; splitProfile?: string | null }) {
  const [splitResult, setSplitResult] = useState<string | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [selectedExamType, setSelectedExamType] = useState('cet4');
  const profileLabel = splitProfile ? PROFILE_LABELS[splitProfile] || splitProfile : null;

  const handleSplitSelected = async () => {
    const text = editorRef?.current?.getSelectedText();
    if (!text) { setSplitError('请先在编辑器中选中文本'); setSplitResult(null); return; }
    setSplitLoading(true); setSplitError(null); setSplitResult(null);
    try {
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, examType: selectedExamType, filePath: file?.path, splitProfile: splitProfile || undefined }) });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setSplitResult('Mode: ' + (d.splitProfile || 'default') + '\nQuestions: ' + d.questionCount + '\nSegments: ' + d.segmentCount + '\n\n' + JSON.stringify(d.segments || d.questions, null, 2));
      } else setSplitError(json.error || 'Split failed');
    } catch (e) { setSplitError('Network error'); }
    finally { setSplitLoading(false); }
  };

  return (
    <div className='space-y-3'>
      <h3 className='text-xs font-medium'>题目拆解</h3>
      {!file ? <p className='text-xs text-muted-foreground'>请先选择文件</p> : (
        <>
          {profileLabel && (
            <div className='flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20'>
              <span className='text-[10px] text-muted-foreground'>拆解模式:</span>
              <span className='text-xs font-medium text-primary'>{profileLabel}</span>
            </div>
          )}
          <div className='space-y-2'>
            <label className='text-xs text-muted-foreground'>考试类型</label>
            <select value={selectedExamType} onChange={e => setSelectedExamType(e.target.value)}
              className='w-full text-xs border rounded-md px-2 py-1.5 bg-background'>
              <option value='cet4'>CET-4</option><option value='cet6'>CET-6</option><option value='kaoyan-english'>考研英语</option>
            </select>
          </div>
          <button onClick={handleSplitSelected} disabled={splitLoading}
            className={'w-full text-xs py-2 rounded-md font-medium transition-colors '
              + (splitLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
            {splitLoading ? '拆解中...' : '拆解选中文本'}
          </button>
          {splitError && <div className='text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2'>{splitError}</div>}
          {splitResult && (
            <div className='space-y-2'>
              <label className='text-xs text-muted-foreground'>拆解结果</label>
              <pre className='text-[11px] font-mono bg-muted/50 rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap'>{splitResult}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExportTab({ file }: { file: FileContent | null }) {
  return (
    <div className='space-y-3'>
      <h3 className='text-xs font-medium'>格式化导出</h3>
      {!file ? <p className='text-xs text-muted-foreground'>请先选择文件</p> : (
        <>
          <div className='space-y-2'><label className='text-xs text-muted-foreground'>输出模板</label>
            <select className='w-full text-xs border rounded-md px-2 py-1.5 bg-background'>
              <option value='cet-standard'>四六级标准</option><option value='kaoyan-standard'>考研英语</option>
            </select></div>
          <button className='w-full text-xs py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium' disabled>
            导出到 clean/ (开发中)</button>
        </>
      )}
    </div>
  );
}

function AnnotationTab({ file }: { file: FileContent | null }) {
  return (
    <div className='space-y-3'>
      <h3 className='text-xs font-medium'>批注管理</h3>
      {!file ? <p className='text-xs text-muted-foreground'>请先选择文件</p> : (
        <>
          <p className='text-xs text-muted-foreground'>选中文本后添加批注:</p>
          <div className='space-y-1.5'>
            {[{t:'error',l:'错误',c:'bg-red-500'},{t:'warning',l:'待确认',c:'bg-amber-500'},{t:'note',l:'备注',c:'bg-blue-500'},{t:'todo',l:'待处理',c:'bg-purple-500'},{t:'review',l:'待审核',c:'bg-green-500'}].map(f=>(
              <div key={f.t} className='flex items-center gap-2 text-xs px-2 py-1 rounded'><span className={'w-2 h-2 rounded-full '+f.c}/>{f.l}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}