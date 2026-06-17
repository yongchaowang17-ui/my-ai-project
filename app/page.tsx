'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileTreeNode, FileContent } from '@/lib/types';
import { FileBrowser } from '@/components/file-browser/FileTree';
import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/editor/MarkdownEditor';
import { ToolPanel } from '@/components/tool-panel/ToolPanel';
import { DivertModal } from '@/components/divert/DivertModal';
import { SplitAtLineModal } from '@/components/divert/SplitAtLineModal';
import { ExtractSelectionModal } from '@/components/divert/ExtractSelectionModal';
import { Toast } from '@/components/ui/Toast';
import { buildSetIdFromPath } from '@/lib/naming-validator';

function extractRoutingCategory(filePath: string): string | null {
  const match = filePath.match(/routing\/([^\/]+)\//);
  return match ? match[1] : null;
}

function storeRecentSetId(setId: string) {
  try {
    const recents = JSON.parse(localStorage.getItem('split-recent-setids') || '[]');
    const updated = [setId, ...recents.filter((r: string) => r !== setId)].slice(0, 5);
    localStorage.setItem('split-recent-setids', JSON.stringify(updated));
  } catch { /* ignore */ }
}

export default function Home() {
  // File state
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editorContent, setEditorContent] = useState<string>('');
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [splitProfile, setSplitProfile] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Divert state
  const [divertModalOpen, setDivertModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [divertedDecorations, setDivertedDecorations] = useState<string[]>([]);

  // Split at line state
  const [splitLineModalOpen, setSplitLineModalOpen] = useState(false);

  // Extract selection state
  const [extractModalOpen, setExtractModalOpen] = useState(false);

  // Auto-refresh state
  const [refreshKey, setRefreshKey] = useState(0);
  const [newFileHighlight, setNewFileHighlight] = useState<string | null>(null);

  const hasUnsavedChanges = selectedFile !== null && editorContent !== selectedFile.content;

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  /** Load combined directory tree */
  const loadTree = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/files?root=');
      const json = await res.json();
      if (json.success) setFileTree(json.data);
      else setError(json.error || 'Failed to load');
    } catch (e) { setError('Network error'); }
    finally { setLoading(false); }
  }, []);

  /** Load file content */
  const loadFile = useCallback(async (filePath: string, force: boolean = false) => {
    if (hasUnsavedChanges && !force) {
      if (!window.confirm('当前有未保存的修改，是否丢弃？')) return;
    }
    setLoading(true); setError(null);
    try {
      const isFinalAsset = filePath.startsWith('03_Exam_Final/');
      const isFusionAsset = filePath.startsWith('04_Fusion_Area/');
      const segments = filePath.split('/').map(encodeURIComponent);
      const apiUrl = isFinalAsset ? '/api/assets/final/' + segments.join('/')
        : isFusionAsset ? '/api/assets/fusion/' + segments.join('/')
        : '/api/files/' + segments.join('/');
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (json.success) {
        setSelectedFile(json.data);
        setEditorContent(json.data.content);
        setIsReadOnly(true);
        setDivertedDecorations([]);
        const category = extractRoutingCategory(filePath);
        if (category) {
          const rp = await fetch('/api/routing-profile?category=' + encodeURIComponent(category));
          const rpJson = await rp.json();
          setSplitProfile(rpJson.success ? rpJson.data?.splitProfile : null);
        } else setSplitProfile(null);
      } else setError(json.error || 'Failed to load');
    } catch (e) { setError('Network error'); }
    finally { setLoading(false); }
  }, [hasUnsavedChanges]);

  /** Save file */
  const handleSave = useCallback(async (content: string) => {
    if (!selectedFile) return;
    setLoading(true); setError(null);
    try {
      const segments = selectedFile.path.split('/').map(encodeURIComponent);
      const res = await fetch('/api/files/' + segments.join('/'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, checksum: selectedFile.checksum }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedFile(prev => prev ? { ...prev, checksum: json.data.checksum, content } : null);
        setEditorContent(content);
      } else if (res.status === 409) setError('File modified by others.');
      else setError(json.error || 'Save failed');
    } catch (e) { setError('Network error'); }
    finally { setLoading(false); }
  }, [selectedFile]);

  const handleToggleReadOnly = useCallback(() => {
    if (!isReadOnly) {
      if (hasUnsavedChanges) {
        if (!window.confirm('Discard unsaved changes?')) return;
        setEditorContent(selectedFile?.content || '');
      }
    }
    setIsReadOnly(!isReadOnly);
  }, [isReadOnly, hasUnsavedChanges, selectedFile]);

  const handleOpenFile = useCallback(async (filePath: string) => {
    await loadFile(filePath, true);
  }, [loadFile]);

  /** Divert selected text */
  const handleDivert = useCallback(async (type: 'question' | 'analysis', filename: string) => {
    const text = editorRef.current?.getSelectedText();
    if (!text) {
      showToast('请先选中要导出的文本', 'error');
      setDivertModalOpen(false);
      return;
    }

    const setId = selectedFile ? buildSetIdFromPath(selectedFile.path) : null;
    if (!setId) {
      showToast('无法识别套卷ID', 'error');
      setDivertModalOpen(false);
      return;
    }

    try {
      const res = await fetch('/api/export/divert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type, targetPath: '02_Working_Area/' + setId, filename }),
      });
      const json = await res.json();
      if (json.success) {
        const label = type === 'question' ? '真题' : '解析';
        showToast('已成功将选区发送至 ' + label + ' -> ' + filename, 'success');

        if (type === 'question') {
          const editor = editorRef.current?.getEditor();
          if (editor) {
            const selection = editor.getSelection();
            if (selection && !selection.isEmpty()) {
              const model = editor.getModel();
              if (model) {
                const ids = model.deltaDecorations([], [{
                  range: selection,
                  options: {
                    isWholeLine: true,
                    className: 'diverted-highlight',
                    minimap: { color: '#22c55e', position: 1 },
                    overviewRuler: { color: '#22c55e', position: 1 },
                  },
                }]);
                setDivertedDecorations(prev => [...prev, ...ids]);
              }
            }
          }
        }
      } else {
        showToast(json.error || '导出失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    }
    setDivertModalOpen(false);
  }, [selectedFile, showToast]);

  /** Split at line handler */
  const handleSplitAtLine = useCallback(async (setId: string, qFilename: string, aFilename: string) => {
    if (!selectedFile) return;
    const lineNumber = editorRef.current?.getCursorLine();
    if (!lineNumber) return;

    try {
      const res = await fetch('/api/export/split-at-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: selectedFile.path,
          lineNumber,
          setId,
          targetQFilename: qFilename,
          targetAFilename: aFilename,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        showToast(
          '分割完成：Q ' + d.questionLines + ' 行 | A ' + d.analysisLines + ' 行',
          'success'
        );
        // 存储 Recents
        storeRecentSetId(setId);
        // 刷新 FileTree
        setRefreshKey(k => k + 1);
        // 高亮新文件
        setNewFileHighlight(d.questionPath);
        setTimeout(() => setNewFileHighlight(null), 3000);
      } else {
        showToast(json.error || '分割失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    }
    setSplitLineModalOpen(false);
  }, [selectedFile, showToast]);

  /** Extract selection handler */
  const handleExtractSelection = useCallback(async (type: 'question' | 'analysis', filename: string, append: boolean, zone: 'working' | 'fusion' = 'working') => {
    const text = editorRef.current?.getSelectedText();
    if (!text) {
      showToast('请先选中要提取的文本', 'error');
      setExtractModalOpen(false);
      return;
    }

    const setId = selectedFile ? (() => {
      // 1. 02_Working_Area/{setId}/...
      const waMatch = selectedFile.path.match(/02_Working_Area\/([^\/]+)\//);
      if (waMatch) return waMatch[1];

      // 2. 03_Exam_Final/{exam}/{type}/{filename}.md
      const finalMatch = selectedFile.path.match(/03_Exam_Final\/([^\/]+)\/[^\/]+\/([^\/]+)\.md$/);
      if (finalMatch) {
        const exam = finalMatch[1].toUpperCase();
        const fname = finalMatch[2];
        const stdM = fname.match(/^(\d{4}_\d{2}_S\d+)_/);
        if (stdM) return exam + '_' + stdM[1];
        const yearM = fname.match(/(20\d{2})[._-](\d{2})/);
        const setM = fname.match(/[Ss]et[_]?(\d+)/);
        if (yearM) return exam + '_' + yearM[1] + '_' + yearM[2] + '_S' + (setM ? setM[1] : '1');
      }

      // 3. 04_Fusion_Area/{exam}/{type}/{setId}/...
      const fusionMatch = selectedFile.path.match(/04_Fusion_Area\/([^\/]+)\/[^\/]+\/([^\/]+)\//);
      if (fusionMatch) return fusionMatch[1] + '_' + fusionMatch[2];

      // 4. routing/{category}/{filename}
      const rFilename = selectedFile.path.split('/').pop() || '';
      const rBase = rFilename.replace(/\.md$/i, '');
      let rExam = '';
      const rExamM = rBase.match(/^(CET\d|TEM\d)/i);
      if (rExamM) rExam = rExamM[1].toUpperCase();
      const rDateM = rBase.match(/(20\d{2})[._-](\d{2})/);
      if (rDateM && rExam) {
        let rSet = '1';
        const rSetM = rBase.match(/[Ss]et[_]?(\d+)/);
        if (rSetM) rSet = rSetM[1];
        return rExam + '_' + rDateM[1] + '_' + rDateM[2] + '_S' + rSet;
      }

      return null;
    })() : null;

    if (!setId) {
      showToast('无法识别套卷ID', 'error');
      setExtractModalOpen(false);
      return;
    }

    const targetPath = zone === 'fusion' ? '04_Fusion_Area/' + setId : '02_Working_Area/' + setId;

    try {
      const res = await fetch('/api/export/extract-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type, targetPath, filename, append }),
      });
      const json = await res.json();
      if (json.success) {
        const label = type === 'question' ? '真题' : '解析';
        const action = json.data.appended ? '追加至' : '写入';
        showToast(action + ' ' + label + ' -> ' + filename + ' (' + json.data.byteLength + ' bytes)', 'success');
        storeRecentSetId(setId);
        setRefreshKey(k => k + 1);
        setNewFileHighlight(json.data.filePath);
        setTimeout(() => setNewFileHighlight(null), 3000);
      } else {
        showToast(json.error || '提取失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    }
    setExtractModalOpen(false);
  }, [selectedFile, showToast]);

  useEffect(() => { loadTree(); }, [loadTree]);

  // Auto-refresh tree when refreshKey changes
  useEffect(() => { loadTree(); }, [refreshKey, loadTree]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isReadOnly) handleToggleReadOnly(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isReadOnly, handleToggleReadOnly]);

  return (
    <div className='h-screen flex flex-col bg-background text-foreground'>
      <header className='h-11 flex items-center justify-between px-4 border-b bg-muted/30 shrink-0'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-semibold tracking-tight'>{'\u9898\u5E93\u6E05\u6D17\u624B\u672F\u53F0'}</span>
          <a href='/review' className='text-xs px-2 py-0.5 rounded hover:bg-muted transition-colors'>\u6279\u91CF\u5BA1\u67E5</a>
          <a href='/review/decompose' className='text-xs px-2 py-0.5 rounded hover:bg-muted transition-colors'>\u62C6\u89E3\u9884\u89C8</a>
          <a href='/review/synthesis' className='text-xs px-2 py-0.5 rounded hover:bg-muted transition-colors'>合成审查</a>
        </div>
        <div className='flex items-center gap-3 text-xs text-muted-foreground'>
          {splitProfile && <span className='px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]'>{splitProfile}</span>}
          {loading && <span className='animate-pulse'>{'\u52A0\u8F7D\u4E2D...'}</span>}
          {error && <span className='text-destructive'>{error}</span>}
        </div>
      </header>
      <div className='flex flex-1 min-h-0'>
        <aside className='w-64 border-r flex flex-col shrink-0'>
          <div className='px-3 py-2 border-b'>
            <h2 className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>{'\u6587\u4EF6\u6D4F\u89C8\u5668'}</h2>
          </div>
          <div className='flex-1 overflow-y-auto p-2'>
            <FileBrowser tree={fileTree} onSelect={p => loadFile(p)} selectedPath={selectedFile?.path} highlightPath={newFileHighlight} />
          </div>
        </aside>
        <main className='flex-1 flex flex-col min-w-0'>
          {selectedFile ? (
            <MarkdownEditor ref={editorRef} content={editorContent} readOnly={isReadOnly}
              hasUnsavedChanges={hasUnsavedChanges} cursorLine={cursorPosition.line} cursorColumn={cursorPosition.column}
              onChange={setEditorContent} onSave={handleSave} onToggleReadOnly={handleToggleReadOnly}
              onCursorChange={(l, c) => setCursorPosition({ line: l, column: c })}
              onSplitAtLine={() => setSplitLineModalOpen(true)}
              onExtractSelection={() => setExtractModalOpen(true)} />
          ) : (
            <div className='flex-1 flex items-center justify-center text-muted-foreground'>
              <div className='text-center space-y-2'>
                <div className='text-4xl'>{'\uD83D\uDCDD'}</div>
                <p className='text-sm'>{'\u9009\u62E9\u5DE6\u4FA7\u6587\u4EF6\u5F00\u59CB\u7F16\u8F91'}</p>
                <p className='text-xs text-muted-foreground/60'>{'\u5206\u89E3\u533A\u67E5\u770B\u5206\u7C7B\u6587\u4EF6 | \u5408\u6210\u533A\u7BA1\u7406\u5957\u5377'}</p>
              </div>
            </div>
          )}
        </main>
        <aside className='w-80 border-l flex flex-col shrink-0'>
          <ToolPanel file={selectedFile} editorRef={editorRef} splitProfile={splitProfile}
            onOpenFile={handleOpenFile} onDivert={() => setDivertModalOpen(true)}
            onSplitAtLine={() => setSplitLineModalOpen(true)}
            onExtractSelection={() => setExtractModalOpen(true)} />
        </aside>
      </div>

      {/* Divert Modal */}
      <DivertModal
        open={divertModalOpen}
        onClose={() => setDivertModalOpen(false)}
        onConfirm={handleDivert}
        currentFilePath={selectedFile?.path || ''}
        selectedText={editorRef.current?.getSelectedText() || ''}
      />

      {/* Split at Line Modal */}
      <SplitAtLineModal
        open={splitLineModalOpen}
        onClose={() => setSplitLineModalOpen(false)}
        onConfirm={handleSplitAtLine}
        currentFilePath={selectedFile?.path || ''}
        cursorLine={cursorPosition.line}
        totalLines={editorContent.split('\n').length}
        linePreview={editorContent.split('\n')[cursorPosition.line - 1] || ''}
      />

      {/* Extract Selection Modal */}
      <ExtractSelectionModal
        open={extractModalOpen}
        onClose={() => setExtractModalOpen(false)}
        onConfirm={handleExtractSelection}
        currentFilePath={selectedFile?.path || ''}
        selectedText={editorRef.current?.getSelectedText() || ''}
      />

      {/* Toast */}
      <Toast message={toast?.message || null} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}