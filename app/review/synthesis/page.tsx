'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Merge, Check, AlertTriangle, ChevronDown, ChevronRight,
  Eye, ArrowRight, RotateCcw, Loader2, FileText, CheckSquare, Square,
  Pencil, Save, X, ChevronLeft, Flag, BookOpen, Atom,
} from 'lucide-react';

// ===== 类型 =====

interface SynthItem {
  id: string;
  setId: string;
  examType: string;
  partName: string;
  outputFilename: string;
  outputKey: string;
  sourceQ: string | null;
  sourceA: string | null;
  qChars: number;
  aChars: number;
  synthesizedChars: number;
  synthesizedHash: string;
  status: 'pending' | 'reviewed' | 'imported' | 'flagged';
  content: string;
  reviewedAt?: string;
}

interface ImportResult {
  committed: number;
  skipped: number;
  errors: string[];
  files: string[];
}

interface ReviewState {
  [id: string]: { status: string; reviewedAt?: string };
}

const PART_COLORS: Record<string, string> = {
  Writing: '#2563eb',
  Listening: '#16a34a',
  Reading: '#d97706',
  Translation: '#9333ea',
};

const PART_LABELS: Record<string, string> = {
  Writing: '写作',
  Listening: '听力',
  Reading: '阅读',
  Translation: '翻译',
};

// ===== 主组件 =====

export default function SynthesisPage() {
  const [items, setItems] = useState<SynthItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [filterExam, setFilterExam] = useState('');
  const [filterPart, setFilterPart] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [stats, setStats] = useState({ total: 0, pending: 0, reviewed: 0, imported: 0, flagged: 0 });

  // 加载数据
  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/synthesis/preview');
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items);
        setStats(json.data.stats);
      }
    } catch (e) {
      console.error('加载失败', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  // 筛选逻辑
  const filteredItems = useMemo(() => {
    let result = items;
    if (filterExam) result = result.filter(i => i.examType === filterExam);
    if (filterPart) result = result.filter(i => i.partName === filterPart);
    if (filterStatus === 'pending') result = result.filter(i => i.status === 'pending');
    else if (filterStatus === 'reviewed') result = result.filter(i => i.status === 'reviewed');
    else if (filterStatus === 'imported') result = result.filter(i => i.status === 'imported');
    else if (filterStatus === 'flagged') result = result.filter(i => i.status === 'flagged');
    // 排序：flagged 优先 → pending → reviewed → imported
    const order = { flagged: 0, pending: 1, reviewed: 2, imported: 3 };
    result = [...result].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    return result;
  }, [items, filterExam, filterPart, filterStatus]);

  // 当前查看的文件
  const activeItem = activeIdx !== null ? items.find(i => i.id === filteredItems[activeIdx]?.id) : null;

  // 点击文件
  const handleView = useCallback((idx: number) => {
    setActiveIdx(idx);
    setImportResult(null);
    const item = filteredItems[idx];
    if (item) {
      setEditContent(item.content);
      setIsDirty(false);
    }
  }, [filteredItems]);

  // 保存编辑
  const handleSaveEdit = useCallback(async () => {
    if (activeIdx === null || !activeItem) return;
    try {
      const res = await fetch('/api/synthesis/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-content', id: activeItem.id, content: editContent }),
      });
      const json = await res.json();
      if (json.success) {
        setItems(prev => prev.map(i => i.id === activeItem.id ? { ...i, content: editContent } : i));
        setIsDirty(false);
      }
    } catch (e) {
      console.error('保存失败', e);
    }
  }, [activeIdx, activeItem, editContent]);

  // 标记审查状态
  const markStatus = useCallback(async (id: string, status: string) => {
    try {
      await fetch('/api/synthesis/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-status', id, status }),
      });
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: status as SynthItem['status'] } : i));
    } catch (e) {
      console.error('状态更新失败', e);
    }
  }, []);

  // 批量标记已审
  const batchMarkReviewed = useCallback(async () => {
    const ids = [...selectedIdx].map(i => filteredItems[i]?.id).filter(Boolean);
    if (ids.length === 0) return;
    try {
      await fetch('/api/synthesis/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch-update', ids, status: 'reviewed' }),
      });
      setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, status: 'reviewed' } : i));
    } catch (e) {
      console.error('批量标记失败', e);
    }
  }, [selectedIdx, filteredItems]);

  // 批量导入
  const handleBatchImport = useCallback(async () => {
    const toImport = [...selectedIdx].map(i => filteredItems[i]).filter(Boolean);
    if (toImport.length === 0) { alert('请先选择文件'); return; }
    const confirmed = confirm(`将导入 ${toImport.length} 个合成文件到 05_Synthesis_Area\n确认继续？`);
    if (!confirmed) return;

    setImporting(true);
    setImportResult(null);
    try {
      const importItems = toImport.map(i => ({
        setId: i.setId,
        examType: i.examType,
        partName: i.partName,
        content: i.content,
      }));
      const res = await fetch('/api/synthesis/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importItems }),
      });
      const json = await res.json();
      if (json.success) {
        setImportResult(json.data);
        // 标记已导入
        const importedIds = toImport.map(i => i.id);
        await fetch('/api/synthesis/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'batch-update', ids: importedIds, status: 'imported' }),
        });
        setItems(prev => prev.map(i => importedIds.includes(i.id) ? { ...i, status: 'imported' } : i));
        loadPreview();
      } else {
        alert('导入失败: ' + (json.error || '未知错误'));
      }
    } catch (e) {
      alert('网络错误: ' + (e instanceof Error ? e.message : String(e)));
    }
    setImporting(false);
  }, [selectedIdx, filteredItems, loadPreview]);

  // 导航
  const navigateReview = useCallback((direction: number) => {
    if (activeIdx === null || filteredItems.length === 0) return;
    const next = Math.max(0, Math.min(filteredItems.length - 1, activeIdx + direction));
    handleView(next);
  }, [activeIdx, filteredItems.length, handleView]);

  // 快捷键
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navigateReview(-1); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navigateReview(1); }
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx !== null && activeItem) markStatus(activeItem.id, 'reviewed');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIdx, activeItem, navigateReview, markStatus]);

  // 全选 / 取消
  const selectAll = () => {
    const next = new Set<number>();
    filteredItems.forEach((_, i) => next.add(i));
    setSelectedIdx(next);
  };
  const deselectAll = () => setSelectedIdx(new Set());

  // 进度
  const reviewedCount = items.filter(i => i.status === 'reviewed' || i.status === 'imported').length;
  const progressPercent = items.length > 0 ? Math.round((reviewedCount / items.length) * 100) : 0;

  // 按 Part 统计
  const partStats = useMemo(() => {
    const result: Record<string, number> = {};
    filteredItems.forEach(i => { result[i.partName] = (result[i.partName] || 0) + 1; });
    return result;
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-11 flex items-center justify-between px-4 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Merge className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold">合成审查</span>
          <a href="/" className="text-xs px-2 py-0.5 rounded hover:bg-muted transition-colors">返回手术台</a>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{items.length} 个文件</span>
          <span className="text-green-600">✓ {stats.reviewed} 已审</span>
          <span className="text-blue-600">≡ {stats.imported} 已导入</span>
          <span className="text-amber-600">⏳ {stats.pending} 待审查</span>
          {stats.flagged > 0 && <span className="text-red-600">⚠ {stats.flagged} 异常</span>}
        </div>
      </header>

      <div className="h-1 bg-muted shrink-0">
        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: progressPercent + '%' }} />
      </div>

      <div className="flex h-[calc(100vh-48px)]">
        {/* 左侧：文件列表 */}
        <div className="w-[360px] border-r flex flex-col shrink-0">
          <div className="px-2 py-1.5 border-b space-y-1.5">
            {/* 筛选行 */}
            <div className="flex items-center gap-1">
              <select value={filterExam} onChange={e => setFilterExam(e.target.value)}
                className="text-[10px] px-1.5 py-0.5 rounded border bg-background">
                <option value="">考试</option>
                <option value="CET4">CET-4</option>
                <option value="CET6">CET-6</option>
              </select>
              <select value={filterPart} onChange={e => setFilterPart(e.target.value)}
                className="text-[10px] px-1.5 py-0.5 rounded border bg-background">
                <option value="">题型</option>
                <option value="Writing">写作</option>
                <option value="Listening">听力</option>
                <option value="Reading">阅读</option>
                <option value="Translation">翻译</option>
              </select>
              {/* 状态筛选标签 */}
              <div className="flex items-center gap-0.5 text-[10px]">
                <button onClick={() => setFilterStatus('')}
                  className={"px-2 py-0.5 rounded transition-colors " + (!filterStatus ? "bg-emerald-600 text-white" : "border hover:bg-muted text-muted-foreground")}>
                  全部 <span className="opacity-70">{items.length}</span>
                </button>
                <button onClick={() => setFilterStatus('pending')}
                  className={"px-2 py-0.5 rounded transition-colors " + (filterStatus === "pending" ? "bg-amber-500 text-white" : "border hover:bg-muted text-muted-foreground")}>
                  待审 <span className="opacity-70">{stats.pending}</span>
                </button>
                <button onClick={() => setFilterStatus('reviewed')}
                  className={"px-2 py-0.5 rounded transition-colors " + (filterStatus === "reviewed" ? "bg-green-600 text-white" : "border hover:bg-muted text-muted-foreground")}>
                  已审 <span className="opacity-70">{stats.reviewed}</span>
                </button>
                <button onClick={() => setFilterStatus('imported')}
                  className={"px-2 py-0.5 rounded transition-colors " + (filterStatus === "imported" ? "bg-blue-600 text-white" : "border hover:bg-muted text-muted-foreground")}>
                  已导入 <span className="opacity-70">{stats.imported}</span>
                </button>
              </div>
            </div>

            {/* Part 统计标签 */}
            <div className="flex items-center gap-1 flex-wrap">
              {Object.entries(partStats).map(([part, count]) => (
                <span key={part} className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                  style={{ backgroundColor: PART_COLORS[part] + '15', color: PART_COLORS[part] }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PART_COLORS[part] }} />
                  {PART_LABELS[part] || part} {count}
                </span>
              ))}
            </div>

            {/* 操作按钮行 */}
            <div className="flex items-center gap-1">
              <button onClick={selectAll}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted">
                <CheckSquare className="w-2.5 h-2.5" /> 全选
              </button>
              <button onClick={deselectAll}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted">
                <Square className="w-2.5 h-2.5" /> 取消
              </button>
              <div className="flex-1" />
              <button onClick={loadPreview}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted">
                <RotateCcw className="w-2.5 h-2.5" /> 刷新
              </button>
              <button onClick={batchMarkReviewed}
                disabled={selectedIdx.size === 0}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                <Check className="w-2.5 h-2.5" /> 标记已审
              </button>
              <button onClick={handleBatchImport}
                disabled={selectedIdx.size === 0 || importing}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                {importing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ArrowRight className="w-2.5 h-2.5" />}
                导入
              </button>
            </div>
          </div>

          {/* 文件列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading && <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中...</div>}
            {!loading && filteredItems.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">暂无数据</div>}
            {!loading && filteredItems.map((item, idx) => {
              const isActive = idx === activeIdx;
              const isSelected = selectedIdx.has(idx);
              const color = PART_COLORS[item.partName] || '#666';
              return (
                <div key={item.id}
                  className={"rounded-lg border transition-colors cursor-pointer "
                    + (item.status === "flagged" ? "border-red-200 bg-red-50/50" :
                       isActive ? "border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-200" :
                       isSelected ? "border-emerald-300 bg-emerald-50/30" : "border-border bg-background hover:bg-muted/30")}>
                  <div className="flex items-center gap-2 px-3 py-2" onClick={() => handleView(idx)}>
                    <input type="checkbox" checked={isSelected}
                      onChange={e => { e.stopPropagation(); setSelectedIdx(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; }); }}
                      className="w-3.5 h-3.5 rounded border shrink-0 accent-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs font-medium truncate">{item.setId}</span>
                        <span className={"text-[10px] px-1.5 py-0.5 rounded " + (item.examType === "CET4" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700")}>{item.examType}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: color + "15", color }}>{PART_LABELS[item.partName] || item.partName}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>Q:{(item.qChars / 1024).toFixed(1)}KB</span>
                        <span>A:{(item.aChars / 1024).toFixed(1)}KB</span>
                        <span className="text-emerald-600">合成:{(item.synthesizedChars / 1024).toFixed(1)}KB</span>
                      </div>
                    </div>
                    {item.status === "reviewed" && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    {item.status === "imported" && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                    {item.status === "flagged" && <Flag className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    {item.status === "pending" && <Eye className="w-3 h-3 text-muted-foreground shrink-0" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-2 py-1 border-t text-[10px] text-muted-foreground">
            已选 {selectedIdx.size} 个 / 过滤 {filteredItems.length} 个
          </div>
        </div>

        {/* 右侧：预览面板 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* 导航栏 */}
          {activeItem && filteredItems.length > 0 && (
            <div className="px-4 py-1.5 border-b bg-muted/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button onClick={() => navigateReview(-1)} disabled={activeIdx === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{(activeIdx ?? 0) + 1}</span>
                  / {filteredItems.length}
                </span>
                <button onClick={() => navigateReview(1)} disabled={activeIdx === filteredItems.length - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                <span className="text-muted-foreground ml-2">Alt+←/→ 导航</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-green-600">已审 {reviewedCount}</span>
                <span>/ {items.length}</span>
                <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: progressPercent + '%' }} />
                </div>
              </div>
            </div>
          )}

          {/* 导入结果 */}
          {importResult ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">导入结果</h3>
                <button onClick={() => setImportResult(null)} className="text-xs px-3 py-1 rounded border hover:bg-muted">返回预览</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                  <div className="text-2xl font-bold text-green-700">{importResult.committed}</div>
                  <div className="text-xs text-green-600">已写入</div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                  <div className="text-2xl font-bold text-blue-700">{importResult.skipped}</div>
                  <div className="text-xs text-blue-600">已跳过</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                  <div className="text-2xl font-bold text-red-700">{importResult.errors.length}</div>
                  <div className="text-xs text-red-600">错误</div>
                </div>
              </div>
              {importResult.files.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">写入文件</h4>
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {importResult.files.map((f, fi) => (
                      <div key={fi} className="text-xs font-mono text-green-700 bg-green-50 px-2 py-1 rounded">{f}</div>
                    ))}
                  </div>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">错误</h4>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="text-xs font-mono text-red-700 bg-red-50 px-2 py-1 rounded">{e}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeItem ? (
            <div className="flex flex-col h-full">
              {/* 文件信息头 */}
              <div className="px-4 py-2 border-b bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{activeItem.setId}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: PART_COLORS[activeItem.partName] + '15', color: PART_COLORS[activeItem.partName] }}>
                    {PART_LABELS[activeItem.partName] || activeItem.partName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">|</span>
                  <span className="text-[10px] text-muted-foreground">Q:{(activeItem.qChars / 1024).toFixed(1)}KB A:{(activeItem.aChars / 1024).toFixed(1)}KB</span>
                </div>
                <div className="flex items-center gap-2">
                  {activeItem.status !== "reviewed" && (
                    <button onClick={() => markStatus(activeItem.id, "reviewed")}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50">
                      <Check className="w-3 h-3" /> 标记已审
                    </button>
                  )}
                  {activeItem.status === "reviewed" && (
                    <button onClick={() => markStatus(activeItem.id, "pending")}
                      className="text-[11px] px-2 py-1 rounded border hover:bg-muted text-muted-foreground">
                      撤回审查
                    </button>
                  )}
                  {isDirty && (
                    <button onClick={handleSaveEdit}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                      <Save className="w-3 h-3" /> 保存修改
                    </button>
                  )}
                  <button onClick={() => { setEditContent(activeItem.content); setIsDirty(false); }}
                    className="text-[11px] px-2 py-1 rounded border hover:bg-muted text-muted-foreground">
                    重置
                  </button>
                </div>
              </div>

              {/* Q / A 来源指示条 */}
              <div className="px-4 py-1.5 border-b bg-muted/10 flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Q 来源: {activeItem.sourceQ || '无'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  A 来源: {activeItem.sourceA || '无'}
                </span>
                <span className="text-muted-foreground">Ctrl+Enter 快速标记已审</span>
              </div>

              {/* 内容区 */}
              <div className="flex-1 overflow-hidden p-4">
                {isDirty ? (
                  <textarea
                    value={editContent}
                    onChange={e => { setEditContent(e.target.value); setIsDirty(true); }}
                    className="w-full h-full text-xs font-mono leading-relaxed p-3 border rounded-lg bg-background resize-none focus:outline-none focus:ring-1 focus:ring-emerald-300"
                    spellCheck={false}
                  />
                ) : (
                  <div className="h-full overflow-y-auto border rounded-lg">
                    <div className="sticky top-0 px-3 py-1.5 bg-muted/50 border-b flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">合成预览（{activeItem.content.split('\n').length} 行 / {(activeItem.synthesizedChars / 1024).toFixed(1)} KB）</span>
                      <button onClick={() => setIsDirty(true)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border hover:bg-muted text-muted-foreground">
                        <Pencil className="w-2.5 h-2.5" /> 编辑
                      </button>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {activeItem.content.split('\n').map((line, li) => (
                          <tr key={li} className="hover:bg-muted/30">
                            <td className="text-right pr-3 pl-2 py-0 select-none text-muted-foreground/70 text-[11px] w-12 shrink-0 align-top border-r border-border/30 font-mono">{li + 1}</td>
                            <td className="px-3 py-0 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/80">{line}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <Merge className="w-8 h-8 mx-auto opacity-30" />
                <p className="text-sm">点击左侧文件查看合成预览</p>
                <p className="text-xs opacity-60">Q+A 交叉合成内容实时渲染</p>
                <p className="text-xs opacity-60">Alt+←/→ 快速切换文件</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
