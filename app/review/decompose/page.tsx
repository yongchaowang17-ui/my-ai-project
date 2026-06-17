'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Atom, Check, AlertTriangle, ChevronDown, ChevronRight,
  Eye, ArrowRight, RotateCcw, Loader2, FileText, CheckSquare, Square,
  GripVertical, Merge, Trash2, ArrowUp, ArrowDown, Pencil, Save, X, Scissors,
  ChevronLeft, Flag, Clock, Zap,
} from 'lucide-react';

// ===== 类型 =====

interface BlockPreview {
  partIndex: number;
  partName: string;
  filename: string;
  lineCount: number;
  byteLength: number;
  preview: string;
  partCompleteness: 'complete' | 'incomplete' | 'none';
}

interface FilePreview {
  sourcePath: string;
  sourceFilename: string;
  setId: string;
  examType: string;
  fileType: string;
  blocks: BlockPreview[];
  totalPartsDetected: number;
  status: 'ready' | 'exists' | 'partial' | 'flagged' | 'error';
  errorMsg?: string;
}

interface ImportResult {
  committed: number;
  skipped: number;
  errors: string[];
  files: string[];
}

interface EditableBlock {
  partIndex: number;
  partName: string;
  filename: string;
  content: string;
  dirty: boolean;
}

const PART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626'];
const STORAGE_KEY = 'decompose-reviewed-ids';
const PART_NAMES_MAP: Record<number, string> = { 1: 'Writing', 2: 'Listening', 3: 'Reading', 4: 'Translation' };

// ===== 增强 Part 检测（客户端版，与 preview API 一致） =====
const ROMAN_MAP: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 4 };

function clientExtractPartNumber(headingLine: string): number | null {
  const stripped = headingLine.replace(/^#{1,4}\s+/, '').trim();
  // (a) Unicode罗马数字（含混合情况如 "IⅢ"）
  const uniMatch = stripped.match(/Part\s*(?:[IVX]*)?([\u2160-\u2165])/i);
  if (uniMatch) { const code = uniMatch[1].charCodeAt(0); const m: Record<number, number> = {0x2160:1,0x2161:2,0x2162:3,0x2163:4,0x2164:5}; if (m[code]) return m[code]; }
  // (b) ASCII罗马数字（排除后面紧跟Unicode的情况）
  const romanMatch = stripped.match(/^Part\s*(I{1,3}|IV|V)(?![\u2160-\u2165\w])\b/i);
  if (romanMatch) { const r = romanMatch[1].toUpperCase(); if (ROMAN_MAP[r]) return ROMAN_MAP[r]; }
  const arabicMatch = stripped.match(/^Part\s*(\d+)\b/i);
  if (arabicMatch) { const n = parseInt(arabicMatch[1], 10); if (n >= 1 && n <= 5) return n; }
  const ocrMatch = stripped.match(/Part\s*([HhKkNnFfWwIl][\[\]_]*)\b/);
  if (ocrMatch) { const ch = ocrMatch[1][0].toUpperCase(); if ('HK'.includes(ch)) return 2; if ('NF'.includes(ch)) return 4; if (ch==='W') return 4; if (ch==='M'||ch==='I') { const rest=ocrMatch[1]; if (/^[Mm](?![a-zA-Z])/.test(rest)||/^in\b/.test(rest)) return 3; return 2; } }
  if (/Part\s*皿/.test(stripped)) return 4;
  return null;
}

function clientInferPartsByKeywords(lines: string[], found: Set<number>): Array<{partIndex:number;lineIndex:number}> {
  const r: Array<{partIndex:number;lineIndex:number}> = [];
  if (!found.has(1)) { for (let i=0;i<lines.length;i++) { const ln=lines[i]; if (/^#{1,4}\s+Part\s+I\b/i.test(ln) && !/Comprehension|Listening/i.test(ln)) { r.push({partIndex:1,lineIndex:i}); found.add(1); break; } if (/<td>\s*Part\s+I\s+Writing/i.test(ln)) { r.push({partIndex:1,lineIndex:i}); found.add(1); break; } if (/Directions\s*[:：].*(?:write|essay|submission|inviting)/i.test(ln) && i<50) { r.push({partIndex:1,lineIndex:i}); found.add(1); break; } } }
  if (!found.has(2)) { for (let i=0;i<lines.length;i++) { if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) { const nf=lines.slice(i+1,i+4).join(' '); if (/hear|listen/i.test(nf)) { r.push({partIndex:2,lineIndex:i}); found.add(2); break; } } } }
  if (!found.has(3)) { for (let i=0;i<lines.length;i++) { if (/Reading\s+Comprehension/i.test(lines[i]) && /^#{1,4}\s/.test(lines[i])) { r.push({partIndex:3,lineIndex:i}); found.add(3); break; } if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i]) && found.has(2)) { const nf=lines.slice(i+1,i+4).join(' '); if (/blanks|passage|select/i.test(nf)) { r.push({partIndex:3,lineIndex:i}); found.add(3); break; } } } }
  if (!found.has(4)) { for (let i=0;i<lines.length;i++) { if (/^#{1,4}\s+.*Translation\b/i.test(lines[i]) && !/Comprehension/i.test(lines[i])) { r.push({partIndex:4,lineIndex:i}); found.add(4); break; } if (/translate\s+a\s+passage\s+from\s+Chinese/i.test(lines[i])) { r.push({partIndex:4,lineIndex:i}); found.add(4); break; } } }
  return r;
}

// ===== 主组件 =====

export default function DecomposePage() {
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [filterExam, setFilterExam] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [fixedItems, setFixedItems] = useState<any[]>([]);
  const [showFixed, setShowFixed] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [activeContent, setActiveContent] = useState<string | null>(null);
  const [editBlocks, setEditBlocks] = useState<EditableBlock[]>([]);
  const [editingBlock, setEditingBlock] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'name' | null>(null);
  const [splittingBlock, setSplittingBlock] = useState<number | null>(null);
  const [splitLine, setSplitLine] = useState<string>('');
  const [selectedBlocks, setSelectedBlocks] = useState<Set<number>>(new Set());
  // 审查状态
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [currentReviewPos, setCurrentReviewPos] = useState<number>(0);

  // 初始化审查记录
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setReviewedIds(new Set(JSON.parse(saved)));
    } catch { /* ignore */ }
  }, []);

  // 审查队列：flagged 优先，然后 ready，然后 exists/partial
  const reviewQueue = useMemo(() => {
    const sorted = [...previews.keys()].sort((a, b) => {
      const pa = previews[a], pb = previews[b];
      const sa = pa.status === 'flagged' ? 0 : pa.status === 'ready' ? 1 : pa.status === 'partial' ? 2 : 3;
      const sb = pb.status === 'flagged' ? 0 : pb.status === 'ready' ? 1 : pb.status === 'partial' ? 2 : 3;
      return sa - sb;
    });
    return sorted;
  }, [previews]);

  // 按导入状态过滤
  const filteredQueue = useMemo(() => {
    if (!filterStatus) return reviewQueue;
    return reviewQueue.filter(i => {
      const s = previews[i].status;
      if (filterStatus === "reviewed") return s === "exists" || s === "partial";
      if (filterStatus === "needs_review") return s === "flagged" || s === "ready";
      return true;
    });
  }, [reviewQueue, filterStatus, previews]);

  const totalReviewed = reviewedIds.size;
  const totalFiles = previews.length;
  const progressPercent = totalFiles > 0 ? Math.round((totalReviewed / totalFiles) * 100) : 0;

  // 标记为已审查
  const markReviewed = useCallback((sourcePath: string) => {
    setReviewedIds(prev => {
      const next = new Set(prev);
      next.add(sourcePath);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/decompose/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam: filterExam || undefined, type: filterType || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setPreviews(json.data);
        const readyIdx = new Set<number>();
        json.data.forEach((p: FilePreview, i: number) => { if (p.status === 'ready') readyIdx.add(i); });
        setSelectedIdx(readyIdx);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterExam, filterType]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  // Load fix reports
  useEffect(() => {
    fetch('/api/decompose/fixed').then(r => r.json()).then(json => {
      if (json.success) setFixedItems(json.data);
    }).catch(() => {});
  }, []);

  // 导航
  const navigateReview = useCallback((direction: 1 | -1) => {
    if (filteredQueue.length === 0) return;
    const nextPos = Math.max(0, Math.min(filteredQueue.length - 1, currentReviewPos + direction));
    setCurrentReviewPos(nextPos);
    const idx = filteredQueue[nextPos];
    if (idx !== undefined) {
      handleViewFile(idx);
    }
  }, [filteredQueue, currentReviewPos]);

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navigateReview(-1); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navigateReview(1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateReview]);

  const handleViewFile = async (idx: number) => {
    const p = previews[idx];
    setActiveIdx(idx);
    markReviewed(p.sourcePath);
    try {
      const segments = p.sourcePath.split('/').map(encodeURIComponent);
      const res = await fetch('/api/assets/final/' + segments.join('/'));
      const json = await res.json();
      if (json.success) {
        const content: string = json.data.content;
        setActiveContent(content);
        initEditBlocks(content, p);
      }
    } catch { setActiveContent(null); setEditBlocks([]); }
  };

  const initEditBlocks = (content: string, p: FilePreview) => {
    const lines = content.split('\n');
    const blocks: EditableBlock[] = [];
    // 使用增强三层检测（与 preview API 一致）
    const partHeaders: Array<{ partIndex: number; lineIndex: number }> = [];
    const foundParts = new Set<number>();
    // 第1层：增强正则
    for (let i = 0; i < lines.length; i++) {
      const pn = clientExtractPartNumber(lines[i]);
      if (pn !== null && pn >= 1 && pn <= 4 && !foundParts.has(pn)) {
        partHeaders.push({ partIndex: pn, lineIndex: i });
        foundParts.add(pn);
      }
    }
    // 第2层：关键词推断
    const kwResults = clientInferPartsByKeywords(lines, foundParts);
    for (const r of kwResults) {
      if (!foundParts.has(r.partIndex)) {
        partHeaders.push({ partIndex: r.partIndex, lineIndex: r.lineIndex });
        foundParts.add(r.partIndex);
      }
    }
    // 第3层：位置推断
    if (!foundParts.has(1) && partHeaders.length > 0 && partHeaders[0].lineIndex > 2) {
      partHeaders.push({ partIndex: 1, lineIndex: 0 });
      foundParts.add(1);
    }
    // 特殊：只有 P1 和 P4 时，同时推断 P2 和 P3
    if (!foundParts.has(2) && !foundParts.has(3) && foundParts.has(1) && foundParts.has(4)) {
      const p1h = partHeaders.find(h => h.partIndex === 1);
      const p4h = partHeaders.find(h => h.partIndex === 4);
      if (p1h && p4h) {
        const gap = p4h.lineIndex - p1h.lineIndex;
        if (gap > 100) {
          partHeaders.push({ partIndex: 2, lineIndex: p1h.lineIndex + Math.floor(gap * 0.4) });
          partHeaders.push({ partIndex: 3, lineIndex: p1h.lineIndex + Math.floor(gap * 0.65) });
          foundParts.add(2); foundParts.add(3);
        }
      }
    } else {
      if (!foundParts.has(2) && partHeaders.length >= 2) {
        // 验证第一个 Section A 是否是听力
        for (let i = 0; i < lines.length; i++) {
          if (/^#{1,4}\s+Section\s+A\b/i.test(lines[i])) {
            const nf = lines.slice(i+1, i+5).join(' ');
            if (/hear|listen|conversation|passage.*heard|news report/i.test(nf)) {
              partHeaders.push({ partIndex: 2, lineIndex: i });
              break;
            }
          }
        }
        if (!foundParts.has(2)) {
          partHeaders.push({ partIndex: 2, lineIndex: partHeaders[0].lineIndex });
        }
        foundParts.add(2);
      }
      if (!foundParts.has(3) && partHeaders.length >= 1) {
        const last = partHeaders[partHeaders.length - 1];
        if (last.partIndex === 4 && last.lineIndex > 50) {
          const prev = partHeaders.length >= 2 ? partHeaders[partHeaders.length - 2].lineIndex : 0;
          partHeaders.push({ partIndex: 3, lineIndex: Math.floor((prev + last.lineIndex) / 2) });
          foundParts.add(3);
        }
      }
    }
    if (!foundParts.has(4)) {
      partHeaders.push({ partIndex: 4, lineIndex: lines.length - 10 });
      foundParts.add(4);
    }
    partHeaders.sort((a, b) => a.lineIndex - b.lineIndex);

    if (partHeaders.length === 0) {
      blocks.push({ partIndex: 1, partName: 'Writing', filename: p.blocks[0]?.filename || 'unknown.md', content, dirty: false });
    } else {
      for (let i = 0; i < partHeaders.length; i++) {
        const start = partHeaders[i].lineIndex;
        const end = i + 1 < partHeaders.length ? partHeaders[i + 1].lineIndex : lines.length;
        const blockContent = lines.slice(start, end).join('\n');
        const info = p.blocks.find(b => b.partIndex === partHeaders[i].partIndex);
        const partIndex = partHeaders[i].partIndex;
        const partName = info?.partName || PART_NAMES_MAP[partIndex] || 'Part' + partIndex;
        // 生成文件名：优先用服务端的，否则用 setId 自生成
        let filename = info?.filename;
        if (!filename || filename === 'unknown.md' || !filename.startsWith('CET')) {
          const side = p.fileType === 'Question' ? 'Q' : 'A';
          filename = p.setId + '_' + side + '_01_' + partName + '.md';
        }
        blocks.push({
          partIndex, partName,
          filename,
          content: blockContent,
          dirty: false,
        });
      }
    }
    setEditBlocks(blocks);
    setSelectedBlocks(new Set());
    setEditingBlock(null);
    setEditingField(null);
  };

  const refreshEditBlocks = () => {
    if (!activeContent || activeIdx === null) return;
    initEditBlocks(activeContent, previews[activeIdx]);
  };

  // ===== 批量导入（修复：已审查文件发送 editBlocks） =====
  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const items: Array<{ sourcePath: string; blocks: Array<{ partIndex: number; partName: string; filename: string; content?: string }> }> = [];
      let reviewedCount = 0;
      let standardCount = 0;

      for (const i of selectedIdx) {
        const p = previews[i];
        const isReviewed = reviewedIds.has(p.sourcePath);
        if (isReviewed && i === activeIdx && editBlocks.length > 0) {
          // 已审查且当前正在编辑：发送编辑后的内容
          items.push({
            sourcePath: p.sourcePath,
            blocks: editBlocks.map(b => ({ partIndex: b.partIndex, partName: b.partName, filename: b.filename, content: b.content })),
          });
          reviewedCount++;
        } else {
          // 未审查或非当前文件：标准模式（不传 content，API 从源文件切分）
          items.push({
            sourcePath: p.sourcePath,
            blocks: p.blocks.map(b => ({ partIndex: b.partIndex, partName: b.partName, filename: b.filename })),
          });
          standardCount++;
        }
      }

      if (items.length === 0) { alert('请先选择文件'); setImporting(false); return; }

      const confirmed = confirm(`将导入 ${items.length} 个文件\n  已审查（编辑内容）: ${reviewedCount}\n  标准切分: ${standardCount}\n\n确认继续？`);
      if (!confirmed) { setImporting(false); return; }

      const res = await fetch('/api/decompose/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.success) {
        setImportResult(json.data);
        loadPreview();
      } else {
        alert('导入失败: ' + (json.error || '未知错误'));
      }
    } catch (e) {
      console.error(e);
      alert('网络错误: ' + (e instanceof Error ? e.message : String(e)));
    }
    setImporting(false);
  };

  const readyCount = previews.filter(p => p.status === 'ready').length;
  const existsCount = previews.filter(p => p.status === 'exists').length;
  const partialCount = previews.filter(p => p.status === 'partial').length;
  const flaggedCount = previews.filter(p => p.status === 'flagged').length;
  const errorCount = previews.filter(p => p.status === 'error').length;
  const totalBlocks = Array.from(selectedIdx).reduce((sum, i) => sum + previews[i].blocks.length, 0);

  const selectAll = () => {
    const next = new Set<number>();
    previews.forEach((p, i) => { if (p.status !== 'error') next.add(i); });
    setSelectedIdx(next);
  };
  const deselectAll = () => setSelectedIdx(new Set());

  const activeFile = activeIdx !== null ? previews[activeIdx] : null;

  // ===== 块操作 =====

  // 批量合并选中的连续块
  const mergeSelectedBlocks = () => {
    if (selectedBlocks.size < 2) return;
    const indices = [...selectedBlocks].sort((a, b) => a - b);
    // 检查是否连续
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) { alert('只能合并连续的块'); return; }
    }
    const mergedContent = indices.map(i => editBlocks[i].content).join('\n\n');
    const firstBlock = editBlocks[indices[0]];
    const merged: EditableBlock = {
      partIndex: firstBlock.partIndex,
      partName: firstBlock.partName,
      filename: firstBlock.filename,
      content: mergedContent,
      dirty: true,
    };
    const next = [...editBlocks];
    // 从后往前删除，避免索引偏移
    for (let i = indices.length - 1; i >= 0; i--) next.splice(indices[i], 1);
    next.splice(indices[0], 0, merged);
    next.forEach((b, i) => { b.partIndex = i + 1; });
    setEditBlocks(next);
    setSelectedBlocks(new Set());
  };

  const mergeBlocks = (idx: number) => {
    if (idx >= editBlocks.length - 1) return;
    const a = editBlocks[idx];
    const b = editBlocks[idx + 1];
    const merged: EditableBlock = {
      partIndex: a.partIndex, partName: a.partName, filename: a.filename,
      content: a.content + '\n\n' + b.content, dirty: true,
    };
    const next = [...editBlocks];
    next.splice(idx, 2, merged);
    setEditBlocks(next);
  };

  const deleteBlock = (idx: number) => {
    if (editBlocks.length <= 1) return;
    const next = [...editBlocks];
    next.splice(idx, 1);
    next.forEach((b, i) => { b.partIndex = i + 1; });
    setEditBlocks(next);
  };

  const moveBlockUp = (idx: number) => {
    if (idx <= 0) return;
    const next = [...editBlocks];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    next.forEach((b, i) => { b.partIndex = i + 1; });
    setEditBlocks(next);
  };

  const moveBlockDown = (idx: number) => {
    if (idx >= editBlocks.length - 1) return;
    const next = [...editBlocks];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    next.forEach((b, i) => { b.partIndex = i + 1; });
    setEditBlocks(next);
  };

  const splitBlockAtLine = (idx: number) => {
    const line = parseInt(splitLine, 10);
    if (isNaN(line) || line < 1 || line >= editBlocks[idx].content.split('\n').length) return;
    const lines = editBlocks[idx].content.split('\n');
    const upper = lines.slice(0, line).join('\n');
    const lower = lines.slice(line).join('\n');
    const a = editBlocks[idx];
    const newA: EditableBlock = { ...a, content: upper, dirty: true };
    const newB: EditableBlock = {
      partIndex: a.partIndex + 1, partName: 'Part' + (a.partIndex + 1),
      filename: a.filename.replace(/_(Writing|Listening|Reading|Translation)\.md/, '_Part' + (a.partIndex + 1) + '.md'),
      content: lower, dirty: true,
    };
    const next = [...editBlocks];
    next.splice(idx, 1, newA, newB);
    next.forEach((b, i) => { b.partIndex = i + 1; });
    setEditBlocks(next);
    setSplittingBlock(null);
    setSplitLine('');
  };

  const updateBlockContent = (idx: number, content: string) => {
    setEditBlocks(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], content, dirty: true };
      return next;
    });
  };

  const updateBlockName = (idx: number, name: string) => {
    setEditBlocks(prev => {
      const next = [...prev];
      const oldFilename = next[idx].filename;
      const setId = oldFilename.match(/^(CET\d_\d{4}_\d{2}_S\d+)_/)?.[1] || '';
      const side = oldFilename.includes('_Q_') ? 'Q' : 'A';
      const seq = oldFilename.match(/_(?:Q|A)_(\d+)_/)?.[1] || '01';
      next[idx] = { ...next[idx], partName: name, filename: `${setId}_${side}_${seq}_${name}.md`, dirty: true };
      return next;
    });
  };

  // 单文件导入（编辑后）
  const handleImportEdited = async () => {
    if (activeIdx === null || !activeFile) return;
    if (editBlocks.length === 0) { alert('没有可导入的块'); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const items = [{
        sourcePath: activeFile.sourcePath,
        blocks: editBlocks.map(b => ({ partIndex: b.partIndex, partName: b.partName, filename: b.filename, content: b.content })),
      }];
      const res = await fetch('/api/decompose/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.success) {
        setImportResult(json.data);
        setActiveIdx(null);
        setActiveContent(null);
        setEditBlocks([]);
        loadPreview();
      } else {
        alert('导入失败: ' + (json.error || '未知错误'));
      }
    } catch (e) {
      console.error(e);
      alert('网络错误: ' + (e instanceof Error ? e.message : String(e)));
    }
    setImporting(false);
  };

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <header className='h-11 flex items-center justify-between px-4 border-b bg-muted/30 shrink-0'>
        <div className='flex items-center gap-2'>
          <Atom className='w-4 h-4 text-cyan-500' />
          <span className='text-sm font-semibold'>拆解预览</span>
          <a href='/' className='text-xs px-2 py-0.5 rounded hover:bg-muted transition-colors'>返回手术台</a>
        </div>
        <div className='flex items-center gap-3 text-xs text-muted-foreground'>
          <span>{previews.length} 个文件</span>
          <span className='text-green-600'>{'\u2713'} {readyCount} 待导入</span>
          <span className='text-blue-600'>{'\u2261'} {existsCount} 已存在</span>
          {partialCount > 0 ? <span className='text-amber-600'>⚡ {partialCount} 部分</span> : null}
          {flaggedCount > 0 ? <span className='text-red-600'>⚠ {flaggedCount} 需审查</span> : null}
          {errorCount > 0 ? <span className='text-red-600'>{'\u2717'} {errorCount} 异常</span> : null}
        </div>
      </header>

      {/* 进度条 */}
      <div className='h-1 bg-muted shrink-0'>
        <div className='h-full bg-cyan-500 transition-all duration-300' style={{ width: progressPercent + '%' }} />
      </div>

      <div className='flex h-[calc(100vh-48px)]'>
        {/* 左侧：文件列表 */}
        <div className='w-[360px] border-r flex flex-col shrink-0'>
          <div className='px-2 py-1.5 border-b space-y-1.5'>
            <div className='flex items-center gap-1'>
              <select value={filterExam} onChange={e => setFilterExam(e.target.value)}
                className='text-[10px] px-1.5 py-0.5 rounded border bg-background'>
                <option value=''>考试</option>
                <option value='CET4'>CET-4</option>
                <option value='CET6'>CET-6</option>
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className='text-[10px] px-1.5 py-0.5 rounded border bg-background'>
                <option value=''>类型</option>
                <option value='Question'>真题</option>
                <option value='Analysis'>解析</option>
              </select>
              <div className='flex items-center gap-0.5 text-[10px]'>
                <button onClick={() => setFilterStatus('')}
                  className={'px-2 py-0.5 rounded transition-colors ' + (!filterStatus ? 'bg-cyan-600 text-white' : 'border hover:bg-muted text-muted-foreground')}>
                  全部 <span className='opacity-70'>{previews.length}</span>
                </button>
                <button onClick={() => setFilterStatus('needs_review')}
                  className={'px-2 py-0.5 rounded transition-colors ' + (filterStatus === 'needs_review' ? 'bg-amber-500 text-white' : 'border hover:bg-muted text-muted-foreground')}>
                  需审查 <span className='opacity-70'>{previews.filter(p => p.status === 'flagged' || p.status === 'ready').length}</span>
                </button>
                <button onClick={() => setFilterStatus('reviewed')}
                  className={'px-2 py-0.5 rounded transition-colors ' + (filterStatus === 'reviewed' ? 'bg-green-600 text-white' : 'border hover:bg-muted text-muted-foreground')}>
                  不需审查 <span className='opacity-70'>{previews.filter(p => p.status === 'exists' || p.status === 'partial').length}</span>
                </button>
              </div>
              <div className='flex-1' />
              <span className='text-[10px] text-muted-foreground'>{totalReviewed}/{totalFiles}</span>
            </div>
            <div className='flex items-center gap-1'>
              <button onClick={selectAll}
                className='flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted'>
                <CheckSquare className='w-2.5 h-2.5' /> 全选
              </button>
              <button onClick={deselectAll}
                className='flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted'>
                <Square className='w-2.5 h-2.5' /> 取消
              </button>
              <div className='flex-1' />
              <button onClick={loadPreview}
                className='flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted'>
                <RotateCcw className='w-2.5 h-2.5' /> 刷新
              </button>
              <button onClick={handleImport}
                disabled={selectedIdx.size === 0 || importing}
                className='flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50'>
                {importing ? <Loader2 className='w-2.5 h-2.5 animate-spin' /> : <ArrowRight className='w-2.5 h-2.5' />}
                导入
              </button>
            </div>
          </div>

          <div className='flex-1 overflow-y-auto p-2 space-y-1'>
            {loading && <div className='flex items-center justify-center py-12 text-muted-foreground'><Loader2 className='w-4 h-4 animate-spin mr-2' /> 扫描中...</div>}
            {!loading && previews.length === 0 && <div className='text-center py-12 text-muted-foreground text-sm'>暂无数据</div>}
            {!loading && filteredQueue.map((idx) => {
              const p = previews[idx];
              const isReviewed = reviewedIds.has(p.sourcePath);
              return (
                <div key={p.sourcePath}
                  className={'rounded-lg border transition-colors cursor-pointer '
                    + (p.status === 'error' ? 'border-red-200 bg-red-50/50' :
                       idx === activeIdx ? 'border-cyan-400 bg-cyan-50/50 ring-1 ring-cyan-200' :
                       selectedIdx.has(idx) ? 'border-cyan-300 bg-cyan-50/30' : 'border-border bg-background hover:bg-muted/30')}>
                  <div className='flex items-center gap-2 px-3 py-2' onClick={() => handleViewFile(idx)}>
                    <input type='checkbox' checked={selectedIdx.has(idx)}
                      onChange={e => { e.stopPropagation(); setSelectedIdx(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; }); }}
                      disabled={p.status === 'error'}
                      className='w-3.5 h-3.5 rounded border shrink-0 accent-cyan-500' />
                    <button onClick={e => { e.stopPropagation(); setExpandedIdx(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; }); }} className='shrink-0'>
                      {expandedIdx.has(idx) ? <ChevronDown className='w-3 h-3 text-muted-foreground' /> : <ChevronRight className='w-3 h-3 text-muted-foreground' />}
                    </button>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-1.5'>
                        <span className='text-xs font-medium truncate'>{p.sourceFilename}</span>
                        <span className={'text-[10px] px-1.5 py-0.5 rounded ' + (p.examType === 'CET4' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>{p.examType}</span>
                        <span className={'text-[10px] px-1.5 py-0.5 rounded ' + (p.fileType === 'Question' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')}>{p.fileType === 'Question' ? '真题' : '解析'}</span>
                        {p.status === 'flagged' && <span className='text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-0.5'><Flag className='w-2.5 h-2.5' /> 需审查</span>}
                      </div>
                      <div className='text-[10px] text-muted-foreground mt-0.5'>
                        {p.setId} {'\u2192'} {p.blocks.length} 个 Part {p.totalPartsDetected > 0 && `(${p.totalPartsDetected} 标题)`}
                      </div>
                    </div>
                    {isReviewed && <span title='已审查'><Check className='w-3.5 h-3.5 text-cyan-500 shrink-0' /></span>}
                    {!isReviewed && p.status === 'exists' && <Check className='w-3.5 h-3.5 text-blue-500 shrink-0' />}
                    {!isReviewed && p.status === 'partial' && <Check className='w-3.5 h-3.5 text-amber-500 shrink-0' />}
                    {p.status === 'error' && <AlertTriangle className='w-3.5 h-3.5 text-red-500 shrink-0' />}
                    {!isReviewed && p.status === 'ready' && <Eye className='w-3 h-3 text-muted-foreground shrink-0' />}
                  </div>
                  {expandedIdx.has(idx) && p.blocks.length > 0 && (
                    <div className='px-3 pb-2 border-t'>
                      {p.blocks.map((b, bi) => (
                        <div key={bi} className='flex items-center gap-2 py-1.5 text-[11px] border-b border-dashed border-border/50 last:border-0'>
                          <span className='w-6 h-6 rounded bg-cyan-100 text-cyan-700 flex items-center justify-center text-[10px] font-bold shrink-0'>P{b.partIndex}</span>
                          <div className='flex-1 min-w-0'>
                            <div className='font-medium text-foreground'>{b.partName}</div>
                            <div className='text-[10px] text-muted-foreground font-mono truncate'>{b.filename}</div>
                          </div>
                          <span className='text-[10px] text-muted-foreground shrink-0'>{b.lineCount}行 / {(b.byteLength / 1024).toFixed(1)}KB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className='px-2 py-1 border-t text-[10px] text-muted-foreground'>
            已选 {selectedIdx.size} 个文件，{totalBlocks} 个块
          </div>
        </div>

        {/* 右侧：切分预览 + 编辑面板 */}
        <div className='flex-1 flex flex-col min-w-0 overflow-hidden'>
          {/* 导航栏 */}
          {activeFile && filteredQueue.length > 0 && (
            <div className='px-4 py-1.5 border-b bg-muted/20 flex items-center justify-between text-xs'>
              <div className='flex items-center gap-2'>
                <button onClick={() => navigateReview(-1)} disabled={currentReviewPos === 0}
                  className='p-1 rounded hover:bg-muted disabled:opacity-30'><ChevronLeft className='w-3.5 h-3.5' /></button>
                <span className='text-muted-foreground'>
                  <span className='font-medium text-foreground'>{currentReviewPos + 1}</span>
                  / {filteredQueue.length}
                </span>
                <button onClick={() => navigateReview(1)} disabled={currentReviewPos >= filteredQueue.length - 1}
                  className='p-1 rounded hover:bg-muted disabled:opacity-30'><ChevronRight className='w-3.5 h-3.5' /></button>
                <span className='text-muted-foreground ml-2'>Alt+←/→ 导航</span>
              </div>
              <div className='flex items-center gap-2 text-muted-foreground'>
                <span className='text-green-600'>已审 {totalReviewed}</span>
                <span>/ {totalFiles}</span>
                <div className='w-20 h-1.5 bg-muted rounded-full overflow-hidden'>
                  <div className='h-full bg-cyan-500 rounded-full transition-all' style={{ width: progressPercent + '%' }} />
                </div>
              </div>
            </div>
          )}

          {importResult ? (
            <div className='p-6 space-y-4'>
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">导入结果</h3><button onClick={() => setImportResult(null)} className="text-xs px-3 py-1 rounded border hover:bg-muted">返回预览</button></div>
              <div className='grid grid-cols-3 gap-3'>
                <div className='p-3 rounded-lg bg-green-50 border border-green-200 text-center'>
                  <div className='text-2xl font-bold text-green-700'>{importResult.committed}</div>
                  <div className='text-xs text-green-600'>已写入</div>
                </div>
                <div className='p-3 rounded-lg bg-blue-50 border border-blue-200 text-center'>
                  <div className='text-2xl font-bold text-blue-700'>{importResult.skipped}</div>
                  <div className='text-xs text-blue-600'>已跳过</div>
                </div>
                <div className='p-3 rounded-lg bg-red-50 border border-red-200 text-center'>
                  <div className='text-2xl font-bold text-red-700'>{importResult.errors.length}</div>
                  <div className='text-xs text-red-600'>错误</div>
                </div>
              </div>
              {importResult.files.length > 0 && (
                <div>
                  <h4 className='text-xs font-medium text-muted-foreground mb-1'>写入文件</h4>
                  <div className='max-h-60 overflow-y-auto space-y-0.5'>
                    {importResult.files.map((f, fi) => (
                      <div key={fi} className='text-xs font-mono text-green-700 bg-green-50 px-2 py-1 rounded'>{f}</div>
                    ))}
                  </div>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div>
                  <h4 className='text-xs font-medium text-muted-foreground mb-1'>错误</h4>
                  <div className='max-h-40 overflow-y-auto space-y-0.5'>
                    {importResult.errors.map((e, i) => (
                      <div key={i} className='text-xs font-mono text-red-700 bg-red-50 px-2 py-1 rounded'>{e}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeFile && editBlocks.length > 0 ? (
            <div className='flex flex-col h-full'>
              <div className='px-4 py-2 border-b bg-muted/20 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <FileText className='w-3.5 h-3.5 text-muted-foreground' />
                  <span className='text-xs font-medium'>{activeFile.sourceFilename}</span>
                  <span className='text-[10px] text-muted-foreground'>{'\u2192'} {activeFile.setId}</span>
                  <span className='text-[10px] text-muted-foreground'>|</span>
                  <span className='text-[10px] text-muted-foreground'>{editBlocks.length} 个块</span>
                  {activeFile.status === 'flagged' && <span className='text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-0.5'><Flag className='w-2.5 h-2.5' /> Part 标题不完整</span>}
                </div>
                <div className='flex items-center gap-2'>
                  <button onClick={refreshEditBlocks}
                    className='text-[11px] px-2 py-1 rounded border hover:bg-muted text-muted-foreground'>
                    重置切分
                  </button>
                  <button onClick={handleImportEdited}
                    disabled={importing}
                    className='flex items-center gap-1 text-[11px] px-3 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50'>
                    {importing ? <Loader2 className='w-3 h-3 animate-spin' /> : <ArrowRight className='w-3 h-3' />}
                    导入此文件
                  </button>
                </div>
              </div>

              {/* 批量操作栏：选中 2+ 块时显示 */}
              {selectedBlocks.size >= 2 && (
                <div className='px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-3'>
                  <span className='text-[11px] text-amber-700 font-medium'>已选 {selectedBlocks.size} 个块</span>
                  <button onClick={mergeSelectedBlocks}
                    className='flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-amber-600 text-white hover:bg-amber-700'>
                    <Merge className='w-3 h-3' /> 合并为一块
                  </button>
                  <button onClick={() => setSelectedBlocks(new Set())}
                    className='text-[11px] px-2 py-1 rounded border hover:bg-muted text-muted-foreground'>
                    取消选择
                  </button>
                </div>
              )}

              <div className='flex-1 overflow-y-auto'>
                {editBlocks.map((block, idx) => {
                  const color = PART_COLORS[idx % PART_COLORS.length];
                  const isEditing = editingBlock === idx;
                  const isEditingName = editingField === 'name' && editingBlock === idx;
                  const lineCount = block.content.split('\n').length;
                  const byteLen = new TextEncoder().encode(block.content).length;
                  const hasPartIssue = activeFile?.status === 'flagged' && idx === editBlocks.length - 1 && editBlocks.length < 4;

                  return (
                    <div key={idx} className='border-b border-border/50'>
                      <div className='flex items-center gap-2 px-4 py-2 sticky top-0 z-10'
                        style={{ backgroundColor: hasPartIssue ? '#fef3c7' : color + '10' }}>
                        <input type='checkbox'
                          checked={selectedBlocks.has(idx)}
                          onChange={e => { e.stopPropagation(); setSelectedBlocks(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; }); }}
                          className='w-3.5 h-3.5 rounded border shrink-0 accent-amber-500' />
                        <span className='w-7 h-7 rounded flex items-center justify-center text-[11px] font-bold text-white shrink-0'
                          style={{ backgroundColor: color }}>P{block.partIndex}</span>

                        {isEditingName ? (
                          <input autoFocus value={block.partName}
                            onChange={e => updateBlockName(idx, e.target.value)}
                            onBlur={() => { setEditingBlock(null); setEditingField(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') { setEditingBlock(null); setEditingField(null); } }}
                            className='text-xs font-medium px-1 py-0.5 border rounded bg-background w-28' />
                        ) : (
                          <button onClick={() => { setEditingBlock(idx); setEditingField('name'); }}
                            className='text-xs font-medium hover:underline flex items-center gap-1' style={{ color }}>
                            {block.partName} <Pencil className='w-2.5 h-2.5 opacity-50' />
                          </button>
                        )}

                        <span className='text-[10px] text-muted-foreground font-mono truncate flex-1'>{block.filename}</span>
                        <span className='text-[10px] text-muted-foreground shrink-0'>{lineCount}行 / {(byteLen / 1024).toFixed(1)}KB</span>
                        {block.dirty ? <span className='text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0'>已修改</span> : null}

                        <div className='flex items-center gap-0.5 shrink-0'>
                          <button onClick={() => moveBlockUp(idx)} disabled={idx === 0}
                            className='p-1 rounded hover:bg-muted disabled:opacity-30' title='上移'>
                            <ArrowUp className='w-3 h-3' />
                          </button>
                          <button onClick={() => moveBlockDown(idx)} disabled={idx === editBlocks.length - 1}
                            className='p-1 rounded hover:bg-muted disabled:opacity-30' title='下移'>
                            <ArrowDown className='w-3 h-3' />
                          </button>
                          <button onClick={() => mergeBlocks(idx)} disabled={idx === editBlocks.length - 1}
                            className='p-1 rounded hover:bg-muted disabled:opacity-30' title='合并下一块'>
                            <Merge className='w-3 h-3' />
                          </button>
                          <button onClick={() => { setSplittingBlock(splittingBlock === idx ? null : idx); setSplitLine(''); }}
                            title='在此行拆分' className='p-1 rounded hover:bg-muted'>
                            <Scissors className='w-3 h-3' />
                          </button>
                          <button onClick={() => deleteBlock(idx)} disabled={editBlocks.length <= 1}
                            className='p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-30' title='删除'>
                            <Trash2 className='w-3 h-3' />
                          </button>
                          <button onClick={() => setEditingBlock(isEditing ? null : idx)}
                            className={'p-1 rounded transition-colors ' + (isEditing ? 'bg-cyan-100 text-cyan-700' : 'hover:bg-muted')}
                            title={isEditing ? '收起编辑' : '展开编辑'}>
                            {isEditing ? <X className='w-3 h-3' /> : <Pencil className='w-3 h-3' />}
                          </button>
                        </div>
                      </div>

                      {hasPartIssue && (
                        <div className='px-4 py-1 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-700'>
                          此块可能包含多个 Part，建议手动拆分
                        </div>
                      )}

                      {splittingBlock === idx && (
                        <div className='px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2'>
                          <Scissors className='w-3 h-3 text-amber-600 shrink-0' />
                          <span className='text-[11px] text-amber-700'>在第</span>
                          <input type='number' value={splitLine}
                            onChange={e => setSplitLine(e.target.value)}
                            placeholder='行号'
                            min={1} max={lineCount - 1}
                            className='w-16 px-2 py-1 text-xs border rounded bg-background text-center font-mono focus:outline-none focus:ring-1 focus:ring-amber-300' />
                          <span className='text-[11px] text-amber-700'>行拆分（共 {lineCount} 行）</span>
                          <button onClick={() => splitBlockAtLine(idx)}
                            className='text-[11px] px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 ml-1'>
                            拆分
                          </button>
                          <button onClick={() => { setSplittingBlock(null); setSplitLine(''); }}
                            className='text-[11px] px-2 py-1 rounded border hover:bg-muted ml-1'>
                            取消
                          </button>
                        </div>
                      )}

                      {isEditing ? (
                        <div className='px-4 py-2'>
                          <textarea
                            value={block.content}
                            onChange={e => updateBlockContent(idx, e.target.value)}
                            className='w-full min-h-[200px] max-h-[500px] text-xs font-mono leading-relaxed p-3 border rounded-lg bg-background resize-y focus:outline-none focus:ring-1 focus:ring-cyan-300'
                            spellCheck={false}
                          />
                        </div>
                      ) : (
                        <div className='max-h-[220px] overflow-y-auto border-l-2' style={{ borderColor: color }}>
                          <table className='w-full'>
                            <tbody>
                              {block.content.split('\n').map((line, li) => (
                                <tr key={li} className='hover:bg-muted/30'>
                                  <td className='text-right pr-3 pl-2 py-0 select-none text-muted-foreground/70 text-[11px] w-12 shrink-0 align-top border-r border-border/30 font-mono'>{li + 1}</td>
                                  <td className='px-3 py-0 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/80 w-full'>{line}</td>
                                </tr>
                              ))}
                              
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeFile ? (
            <div className='flex-1 flex items-center justify-center text-muted-foreground'>
              <div className='text-center space-y-2'>
                <Loader2 className='w-6 h-6 mx-auto animate-spin opacity-30' />
                <p className='text-sm'>加载中...</p>
              </div>
            </div>
          ) : (
            <div className='flex-1 flex items-center justify-center text-muted-foreground'>
              <div className='text-center space-y-2'>
                <Atom className='w-8 h-8 mx-auto opacity-30' />
                <p className='text-sm'>点击左侧文件查看切分预览</p>
                <p className='text-xs opacity-60'>红色标签文件需要手动审查切分点</p>
                <p className='text-xs opacity-60'>Alt+←/→ 快速切换文件</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
