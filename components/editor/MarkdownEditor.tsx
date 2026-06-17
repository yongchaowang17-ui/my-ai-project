'use client';

import { useRef, useCallback, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import type * as monaco from 'monaco-editor';
import { Save, RotateCcw, Scissors, Lock, Unlock, FileOutput } from 'lucide-react';

export interface MarkdownEditorHandle {
  getSelectedText: () => string | undefined;
  getEditor: () => monacoEditor.IStandaloneCodeEditor | null;
  getCursorLine: () => number;
  getContentAboveLine: (lineNumber: number) => string;
  getContentBelowLine: (lineNumber: number) => string;
}

interface MarkdownEditorProps {
  content: string;
  readOnly: boolean;
  hasUnsavedChanges: boolean;
  cursorLine?: number;
  cursorColumn?: number;
  onChange?: (value: string) => void;
  onSave?: (content: string) => void;
  onToggleReadOnly?: () => void;
  onCursorChange?: (line: number, column: number) => void;
  onSplitAtLine?: () => void;
  onExtractSelection?: () => void;
}

const SPLIT_CANDIDATE_PATTERNS = [
  /^#{1,4}\s/,
  /(答案|解析|参考范文|Answer|Key|Explanation|Part\s+I{1,3}|Part\s+IV|Part\s+V)/i,
];

function isSplitCandidate(lineContent: string): boolean {
  return SPLIT_CANDIDATE_PATTERNS.some(p => p.test(lineContent));
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    { content, readOnly, hasUnsavedChanges, cursorLine, cursorColumn,
      onChange, onSave, onToggleReadOnly, onCursorChange,
      onSplitAtLine, onExtractSelection },
    ref
  ) {
    const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
    const decorationIds = useRef<string[]>([]);
    const [splitCandidate, setSplitCandidate] = useState(false);

    useImperativeHandle(ref, () => ({
      getSelectedText: () => {
        const editor = editorRef.current;
        if (!editor) return undefined;
        const selection = editor.getSelection();
        if (!selection) return undefined;
        if (selection.isEmpty()) return undefined;
        return editor.getModel()?.getValueInRange(selection);
      },
      getEditor: () => editorRef.current,
      getCursorLine: () => {
        const pos = editorRef.current?.getPosition();
        return pos?.lineNumber || 1;
      },
      getContentAboveLine: (lineNumber: number) => {
        const editor = editorRef.current;
        if (!editor) return '';
        const model = editor.getModel();
        if (!model) return '';
        if (lineNumber <= 1) return '';
        const m = monacoRef.current;
        if (!m) return '';
        const range = new m.Range(1, 1, lineNumber - 1, Number.MAX_SAFE_INTEGER);
        return model.getValueInRange(range);
      },
      getContentBelowLine: (lineNumber: number) => {
        const editor = editorRef.current;
        if (!editor) return '';
        const model = editor.getModel();
        if (!model) return '';
        const m = monacoRef.current;
        if (!m) return '';
        const lineCount = model.getLineCount();
        const range = new m.Range(lineNumber, 1, lineCount, Number.MAX_SAFE_INTEGER);
        return model.getValueInRange(range);
      },
    }));

    const updateSplitDecoration = useCallback((lineNumber: number) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      const m = monacoRef.current;
      if (!editor || !model || !m) return;

      const lineContent = model.getLineContent(lineNumber);
      const isCandidate = isSplitCandidate(lineContent);
      setSplitCandidate(isCandidate);

      const newDecorations: monaco.editor.IModelDeltaDecoration[] = isCandidate ? [{
        range: new m.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
        options: {
          isWholeLine: true,
          className: 'split-candidate-highlight',
          glyphMarginClassName: 'split-candidate-glyph',
          glyphMarginHoverMessage: { value: '**理想分割点** — 点击"在此行分割"' },
        },
      }] : [];

      decorationIds.current = model.deltaDecorations(decorationIds.current, newDecorations);
    }, []);

    const handleMount: OnMount = useCallback((editor, m) => {
      editorRef.current = editor;
      monacoRef.current = m;

      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
        onSave?.(editor.getValue());
      });

      editor.onDidChangeCursorPosition((e) => {
        onCursorChange?.(e.position.lineNumber, e.position.column);
        updateSplitDecoration(e.position.lineNumber);
      });

      editor.onKeyDown((e) => {
        if (e.keyCode === m.KeyCode.Backspace || e.keyCode === m.KeyCode.Delete) {
          console.log('[Editor] KeyDown:', e.keyCode === m.KeyCode.Backspace ? 'Backspace' : 'Delete', '| readOnly:', editor.getOption(m.editor.EditorOption.readOnly));
        }
      });

      const pos = editor.getPosition();
      if (pos) {
        onCursorChange?.(pos.lineNumber, pos.column);
        updateSplitDecoration(pos.lineNumber);
      }
    }, [onSave, onCursorChange, updateSplitDecoration]);

    const handleChange: OnChange = useCallback((value) => {
      if (value !== undefined) {
        onChange?.(value);
      }
    }, [onChange]);

    const handleUndo = useCallback(() => {
      editorRef.current?.trigger('keyboard', 'undo', null);
    }, []);

    useEffect(() => {
      if (editorRef.current) {
        editorRef.current.setPosition({ lineNumber: 1, column: 1 });
        editorRef.current.revealLine(1);
        updateSplitDecoration(1);
      }
    }, [content, updateSplitDecoration]);

    return (
      <div className='flex-1 flex flex-col min-h-0'>
        <div className='h-10 flex items-center gap-2 px-3 border-b shrink-0'>
          <span className='text-xs font-medium truncate max-w-48'>
            {hasUnsavedChanges ? '\u25CF ' : ''}
          </span>

          {splitCandidate && !readOnly && (
            <span className='text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap'>
              {'\u2605'} {'\u5206\u5272\u70B9'}
            </span>
          )}

          <div className='ml-auto flex items-center gap-1'>
            <button
              onClick={onSplitAtLine}
              className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
              title={'\u5728\u5149\u6807\u6240\u5728\u884C\u5206\u5272\u6587\u4EF6'}
            >
              <Scissors className='w-3.5 h-3.5' />
            </button>

            <button
              onClick={onExtractSelection}
              className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
              title={'\u63D0\u53D6\u9009\u4E2D\u5185\u5BB9\u4E3A\u72EC\u7ACB\u6587\u4EF6'}
            >
              <FileOutput className='w-3.5 h-3.5' />
            </button>

            <div className='w-px h-4 bg-border mx-0.5' />

            <button
              onClick={onToggleReadOnly}
              className={
                'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors '
                + (readOnly
                  ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400')
              }
              title={readOnly ? '\u5207\u6362\u5230\u7F16\u8F91\u6A21\u5F0F' : '\u5207\u6362\u5230\u53EA\u8BFB\u6A21\u5F0F'}
            >
              {readOnly ? (
                <><Lock className='w-3 h-3' /><span>{'\u53EA\u8BFB'}</span></>
              ) : (
                <><Unlock className='w-3 h-3' /><span>{'\u7F16\u8F91'}</span></>
              )}
            </button>

            <button
              onClick={() => onSave?.(editorRef.current?.getValue() || '')}
              disabled={readOnly || !hasUnsavedChanges}
              className={
                'p-1.5 rounded transition-colors '
                + (!readOnly && hasUnsavedChanges
                  ? 'text-foreground hover:bg-muted'
                  : 'text-muted-foreground/40 cursor-not-allowed')
              }
              title={'\u4FDD\u5B58 (Ctrl+S)'}
            >
              <Save className='w-3.5 h-3.5' />
            </button>

            <button
              onClick={handleUndo}
              className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
              title={'\u64A4\u9500'}
            >
              <RotateCcw className='w-3.5 h-3.5' />
            </button>
          </div>
        </div>

        <div className='flex-1 min-h-0'>
          <Editor
            language='markdown'
            value={content}
            onChange={handleChange}
            onMount={handleMount}
            theme='vs'
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              renderLineHighlight: 'gutter',
              automaticLayout: true,
              glyphMargin: true,
              selectionClipboard: true,
              copyWithSyntaxHighlighting: true,
            }}
            loading={
              <div className='flex-1 flex items-center justify-center text-muted-foreground text-sm'>
                {'\u7F16\u8F91\u5668\u52A0\u8F7D\u4E2D...'}
              </div>
            }
          />
        </div>

        <div className='h-6 flex items-center px-3 border-t text-[10px] text-muted-foreground shrink-0 gap-4'>
          <span>UTF-8</span>
          {cursorLine !== undefined && cursorColumn !== undefined && (
            <span>{'\u884C'} {cursorLine}, {'\u5217'} {cursorColumn}</span>
          )}
          <span className='ml-auto'>
            {content.split('\n').length} {'\u884C'}
          </span>
          {hasUnsavedChanges && (
            <span className='text-amber-500'>{'\u672A\u4FDD\u5B58'}</span>
          )}
        </div>
      </div>
    );
  }
);