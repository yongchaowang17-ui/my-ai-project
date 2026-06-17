'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SplitTask, ProposedBlock } from '@/lib/types';
import {
  mergeBlocks, deleteBlocks, splitBlock,
  ensureBlockIds, handleCrossContainerDrag,
  validateBlockIntegrity, canMerge,
} from '@/lib/block-utils';
import {
  CheckCircle, AlertTriangle, Clock, Send,
  ChevronDown, ChevronRight, FileText, Layers, Bot,
  Scan, RefreshCw, Merge, Trash2, Scissors, Save, GripVertical,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '待审查', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: <Clock className='w-3 h-3' /> },
  reviewed: { label: '已审查', color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle className='w-3 h-3' /> },
  flagged: { label: '需审查', color: 'bg-red-100 text-red-700 border-red-200', icon: <AlertTriangle className='w-3 h-3' /> },
  committed: { label: '已提交', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Send className='w-3 h-3' /> },
};

// ===== DroppableContainer =====

function DroppableColumn({ id, label, color, count, children }: {
  id: string; label: string; color: string; count: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div>
      <h4 className={'text-xs font-medium mb-2 flex items-center gap-1 ' + color}>
        <Layers className='w-3 h-3' /> {label} ({count})
      </h4>
      <div ref={setNodeRef}
        className={'min-h-[80px] rounded-md transition-colors ' + (isOver ? 'bg-primary/10 ring-1 ring-primary/30' : '')}>
        {children}
      </div>
    </div>
  );
}

// ===== SortableBlock =====

function SortableBlock({ block, checked, onCheck }: {
  block: ProposedBlock; checked: boolean; onCheck: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 0,
  };

  const previewLines = block.content.split('\n').slice(0, 5).join('\n');
  const isQ = block.type === 'Question';

  return (
    <div ref={setNodeRef} style={style}
      className={'mb-2 p-2 rounded text-xs border-l-2 transition-colors relative '
        + (isQ ? 'border-blue-400 bg-blue-50/50' : 'border-green-400 bg-green-50/50')
        + (checked ? ' ring-2 ring-primary' : '')
        + (isDragging ? ' shadow-lg' : '')}
      onClick={onCheck}>
      <div className='flex items-center justify-between mb-1'>
        <div className='flex items-center gap-1.5'>
          <div {...attributes} {...listeners}
            className='cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted/50 text-muted-foreground'
            onClick={e => e.stopPropagation()}>
            <GripVertical className='w-3 h-3' />
          </div>
          <input type='checkbox' checked={checked} onChange={onCheck} onClick={e => e.stopPropagation()}
            className='w-3 h-3 rounded' />
          <span className='font-medium text-[10px]'>L{block.lineRange[0]}-{block.lineRange[1]}</span>
        </div>
        <span className='text-[10px] text-muted-foreground truncate max-w-[50%]'>{block.title}</span>
      </div>
      <pre className='text-[10px] text-muted-foreground whitespace-pre-wrap font-mono max-h-16 overflow-hidden'>{previewLines}</pre>
    </div>
  );
}

// ===== Main Panel =====

export function BulkReviewPanel() {
  const [tasks, setTasks] = useState<SplitTask[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, reviewed: 0, flagged: 0, committed: 0 });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scan');
      const json = await res.json();
      if (json.success) { setTasks(json.data.tasks); setStats(json.data.stats); }
    } catch { setError('加载任务失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleScan = useCallback(async () => {
    setScanning(true); setError(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const json = await res.json();
      if (json.success) { setTasks(json.data.tasks); setStats(json.data.stats); }
      else setError(json.error || '扫描失败');
    } catch { setError('网络错误'); }
    finally { setScanning(false); }
  }, []);

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string, newBlocks?: ProposedBlock[]) => {
    try {
      const body: Record<string, unknown> = { taskId, status: newStatus };
      if (newBlocks) body.proposedBlocks = newBlocks;
      const res = await fetch('/api/scan/tasks', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, ...(newBlocks ? { proposedBlocks: newBlocks } : {}) } : t));
        loadTasks();
      }
    } catch { setError('更新失败'); }
  }, [loadTasks]);

  const handleBatchCommit = useCallback(async () => {
    const reviewedTasks = tasks.filter(t => t.status === 'reviewed');
    if (reviewedTasks.length === 0) { setError('没有已审查的任务可提交'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/export/batch-split', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: reviewedTasks }),
      });
      const json = await res.json();
      if (json.success) { alert('提交完成！写入 ' + json.data.committed + ' 个文件'); loadTasks(); }
      else setError(json.error || '提交失败');
    } catch { setError('网络错误'); }
    finally { setLoading(false); }
  }, [tasks, loadTasks]);

  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  return (
    <div className='flex flex-col h-full'>
      <div className='px-6 py-4 border-b bg-muted/30 shrink-0'>
        <div className='flex items-center justify-between mb-3'>
          <h1 className='text-lg font-semibold'>{'\u6279\u91CF\u5BA1\u67E5'}</h1>
          <div className='flex gap-2'>
            <button onClick={handleScan} disabled={scanning}
              className={'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors '
                + (scanning ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
              {scanning ? <RefreshCw className='w-3.5 h-3.5 animate-spin' /> : <Scan className='w-3.5 h-3.5' />}
              {scanning ? '\u626B\u63CF\u4E2D...' : '\u5F00\u59CB\u626B\u63CF'}
            </button>
            <button onClick={handleBatchCommit} disabled={loading || stats.reviewed === 0}
              className={'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors '
                + (stats.reviewed > 0 && !loading ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
              <Send className='w-3.5 h-3.5' />{'\u63D0\u4EA4\u5DF2\u5BA1\u67E5 ('}{stats.reviewed}{')'}
            </button>
          </div>
        </div>
        <div className='flex gap-4 text-xs'>
          <span className='flex items-center gap-1'><FileText className='w-3 h-3 text-muted-foreground' /> {stats.total} {'\u4E2A\u6587\u4EF6'}</span>
          <span className='flex items-center gap-1'><CheckCircle className='w-3 h-3 text-green-500' /> {stats.reviewed} {'\u5DF2\u5BA1\u67E5'}</span>
          <span className='flex items-center gap-1'><Clock className='w-3 h-3 text-gray-400' /> {stats.pending} {'\u5F85\u5BA1\u67E5'}</span>
          <span className='flex items-center gap-1'><AlertTriangle className='w-3 h-3 text-red-500' /> {stats.flagged} {'\u9700\u5BA1\u67E5'}</span>
        </div>
        <div className='flex gap-1.5 mt-3'>
          {['all', 'pending', 'reviewed', 'flagged', 'committed'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={'px-2.5 py-1 text-[11px] rounded-md transition-colors '
                + (filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {f === 'all' ? '\u5168\u90E8' : STATUS_CONFIG[f]?.label || f}
            </button>
          ))}
        </div>
      </div>
      {error && <div className='px-6 py-2 bg-destructive/10 text-destructive text-xs'>{error}</div>}
      <div className='flex-1 overflow-y-auto p-6'>
        {loading ? (
          <div className='text-center text-muted-foreground py-12'>{'\u52A0\u8F7D\u4E2D...'}</div>
        ) : filteredTasks.length === 0 ? (
          <div className='text-center text-muted-foreground py-12'>
            <p>{'\u6682\u65E0\u4EFB\u52A1'}</p>
            <p className='text-xs mt-1'>{'\u70B9\u51FB\u300C\u5F00\u59CB\u626B\u63CF\u300D\u751F\u6210\u4EFB\u52A1\u6E05\u5355'}</p>
          </div>
        ) : (
          <div className='space-y-3'>
            {filteredTasks.map(task => (
              <TaskCard key={task.id} task={task} expanded={expandedId === task.id}
                onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                onStatusChange={updateTaskStatus} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== TaskCard =====

function TaskCard({ task, expanded, onToggle, onStatusChange }: {
  task: SplitTask; expanded: boolean; onToggle: () => void;
  onStatusChange: (id: string, status: string, blocks?: ProposedBlock[]) => void;
}) {
  const [localBlocks, setLocalBlocks] = useState<ProposedBlock[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [splitTarget, setSplitTarget] = useState<string | null>(null);
  const [splitLine, setSplitLine] = useState('');
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);

  // 初始化：确保所有 block 都有 id
  useEffect(() => {
    setLocalBlocks(ensureBlockIds(task.proposedBlocks));
    setSelected(new Set());
    setDirty(false);
  }, [task.proposedBlocks]);

  // 视图分流（只读渲染）
  const questionBlocks = useMemo(() => localBlocks.filter(b => b.type === 'Question'), [localBlocks]);
  const analysisBlocks = useMemo(() => localBlocks.filter(b => b.type === 'Analysis'), [localBlocks]);

  const qLines = questionBlocks.reduce((sum, b) => sum + (b.lineRange[1] - b.lineRange[0] + 1), 0);
  const aLines = analysisBlocks.reduce((sum, b) => sum + (b.lineRange[1] - b.lineRange[0] + 1), 0);
  const totalLines = qLines + aLines;
  const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;

  const selectedArr = useMemo(() => Array.from(selected), [selected]);
  // 找到选中块在 localBlocks 中的全局索引
  const selectedGlobalIndices = useMemo(() =>
    selectedArr.map(id => localBlocks.findIndex(b => b.id === id)).filter(i => i >= 0),
    [selectedArr, localBlocks]
  );
  const mergeEnabled = canMerge(selectedGlobalIndices);
  const deleteEnabled = selectedGlobalIndices.length > 0;
  const splitEnabled = selectedGlobalIndices.length === 1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleSelect = (blockId: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(blockId)) next.delete(blockId); else next.add(blockId); return next; });
  };

  // 获取所有块的 id 列表（用于 SortableContext）
  const allBlockIds = useMemo(() => localBlocks.map(b => b.id), [localBlocks]);

  // 跨容器拖拽
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    const activeIdx = localBlocks.findIndex(b => b.id === activeId);
    const overIdx = localBlocks.findIndex(b => b.id === overId);

    if (activeIdx === -1) return;

    // 判断目标容器类型
    let targetType: string | undefined;
    if (overId.startsWith('droppable-')) {
      // 放在了空容器上
      targetType = overId === 'droppable-question' ? 'Question' : 'Analysis';
    } else {
      // 放在了某个块上，取该块的类型
      const overBlock = localBlocks.find(b => b.id === overId);
      if (overBlock) targetType = overBlock.type;
    }

    // 如果 overIdx 是 -1（放在空容器上），放到末尾
    const targetIdx = overIdx >= 0 ? overIdx : localBlocks.length - 1;

    setLocalBlocks(handleCrossContainerDrag(localBlocks, activeIdx, targetIdx, targetType));
    setDirty(true);
  };

  const handleMerge = () => {
    if (!mergeEnabled) return;
    try {
      setLocalBlocks(mergeBlocks(localBlocks, selectedGlobalIndices));
      setSelected(new Set());
      setDirty(true);
    } catch (e) { alert(e instanceof Error ? e.message : '合并失败'); }
  };

  const handleDelete = () => {
    if (!deleteEnabled) return;
    setLocalBlocks(deleteBlocks(localBlocks, selectedGlobalIndices));
    setSelected(new Set());
    setDirty(true);
  };

  const handleSplit = () => {
    if (!splitEnabled || splitTarget === null) return;
    const lineNum = parseInt(splitLine, 10);
    if (isNaN(lineNum) || lineNum < 1) { alert('请输入有效行号'); return; }
    const globalIdx = localBlocks.findIndex(b => b.id === splitTarget);
    if (globalIdx === -1) return;
    try {
      const block = localBlocks[globalIdx];
      const contentLines = block.content.split('\n');
      const splitIdx = Math.min(lineNum, contentLines.length - 1);
      setLocalBlocks(splitBlock(localBlocks, globalIdx, splitIdx));
      setSelected(new Set()); setSplitTarget(null); setSplitLine(''); setDirty(true);
    } catch (e) { alert(e instanceof Error ? e.message : '拆分失败'); }
  };

  const handleSave = async () => {
    const validation = validateBlockIntegrity(localBlocks);
    if (!validation.valid) { alert('数据校验失败:\n' + validation.errors.join('\n')); return; }
    await onStatusChange(task.id, 'pending', localBlocks);
    setDirty(false);
  };

  const handleAiAudit = async () => {
    setAuditing(true); setAuditResult(null);
    try {
      const validation = validateBlockIntegrity(localBlocks);
      setAuditResult(validation.valid
        ? '\u2705 \u6570\u636E\u5B8C\u6574\u6027\u6821\u9A8C\u901A\u8FC7\uFF1A\u884C\u53F7\u8FDE\u7EED\uFF0C\u65E0\u7A7A\u5757\uFF0C\u65E0\u91CD\u53E0'
        : '\u26A0\uFE0F \u53D1\u73B0\u95EE\u9898\uFF1A' + validation.errors.join('; '));
    } catch { setAuditResult('\u5BA1\u8BA1\u5931\u8D25'); }
    finally { setAuditing(false); }
  };

  return (
    <div className='border rounded-lg overflow-hidden bg-background'>
      <div className='flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors' onClick={onToggle}>
        {expanded ? <ChevronDown className='w-4 h-4 text-muted-foreground shrink-0' /> : <ChevronRight className='w-4 h-4 text-muted-foreground shrink-0' />}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium truncate'>{task.id}</span>
            <span className='text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground'>{task.examType}</span>
            {dirty && <span className='text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700'>{'\u5DF2\u4FEE\u6539'}</span>}
          </div>
          <div className='flex items-center gap-3 mt-1'>
            <div className='flex gap-0.5 h-1.5 rounded overflow-hidden flex-1 max-w-xs'>
              {totalLines > 0 && <>
                <div className='bg-blue-400 rounded-l' style={{ width: (qLines / totalLines * 100) + '%' }} />
                <div className='bg-green-400 rounded-r' style={{ width: (aLines / totalLines * 100) + '%' }} />
              </>}
            </div>
            <span className='text-[10px] text-muted-foreground'>Q:{qLines} A:{aLines}</span>
            <span className='text-[10px] text-muted-foreground'>{localBlocks.length} {'\u5757'}</span>
          </div>
        </div>
        <span className={'flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border ' + statusConf.color}>
          {statusConf.icon}{statusConf.label}
        </span>
      </div>

      {expanded && (
        <div className='border-t px-4 py-3 space-y-3 bg-muted/10'>
          {selectedArr.length > 0 && (
            <div className='flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20'>
              <span className='text-[11px] text-primary font-medium'>{'\u5DF2\u9009 '}{selectedArr.length} {'\u4E2A\u5757'}</span>
              <button onClick={handleMerge} disabled={!mergeEnabled}
                className={'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors '
                  + (mergeEnabled ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'text-muted-foreground cursor-not-allowed')}>
                <Merge className='w-3 h-3' />{'\u5408\u5E76'}
              </button>
              <button onClick={handleDelete} disabled={!deleteEnabled}
                className={'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors '
                  + (deleteEnabled ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'text-muted-foreground cursor-not-allowed')}>
                <Trash2 className='w-3 h-3' />{'\u5220\u9664'}
              </button>
              <button onClick={() => { if (splitEnabled) { setSplitTarget(selectedArr[0]); setSplitLine(''); } }}
                disabled={!splitEnabled}
                className={'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors '
                  + (splitEnabled ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'text-muted-foreground cursor-not-allowed')}>
                <Scissors className='w-3 h-3' />{'\u62C6\u5206'}
              </button>
              <div className='flex-1' />
              <button onClick={handleAiAudit} disabled={auditing}
                className='flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors'>
                <Bot className='w-3 h-3' />{auditing ? 'AI...' : 'AI \u6821\u9A8C'}
              </button>
            </div>
          )}

          {splitTarget && (
            <div className='flex items-center gap-2 p-2 rounded-md bg-amber-50 border border-amber-200'>
              <span className='text-[11px] text-amber-700'>{'\u62C6\u5206\u5757'}</span>
              <span className='text-[10px] text-muted-foreground'>{'\u5728\u7B2C'}</span>
              <input type='number' value={splitLine} onChange={e => setSplitLine(e.target.value)}
                className='w-16 px-1.5 py-0.5 text-[11px] border rounded bg-background' placeholder='\u884C\u53F7' />
              <span className='text-[10px] text-muted-foreground'>{'\u884C\u5904\u62C6\u5206'}</span>
              <button onClick={handleSplit} className='px-2 py-0.5 text-[10px] rounded bg-amber-600 text-white hover:bg-amber-700'>{'\u786E\u8BA4'}</button>
              <button onClick={() => { setSplitTarget(null); setSplitLine(''); }} className='px-2 py-0.5 text-[10px] rounded border hover:bg-muted'>{'\u53D6\u6D88'}</button>
            </div>
          )}

          {auditResult && <div className='text-xs p-2 rounded bg-muted/50 text-muted-foreground'>{auditResult}</div>}

          {/* Single DndContext for cross-container drag */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className='grid grid-cols-2 gap-3'>
              <DroppableColumn id='droppable-question' label='Question' color='text-blue-600' count={questionBlocks.length}>
                <SortableContext items={questionBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  {questionBlocks.map(block => (
                    <SortableBlock key={block.id} block={block}
                      checked={selected.has(block.id)} onCheck={() => toggleSelect(block.id)} />
                  ))}
                </SortableContext>
              </DroppableColumn>

              <DroppableColumn id='droppable-analysis' label='Analysis' color='text-green-600' count={analysisBlocks.length}>
                <SortableContext items={analysisBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  {analysisBlocks.map(block => (
                    <SortableBlock key={block.id} block={block}
                      checked={selected.has(block.id)} onCheck={() => toggleSelect(block.id)} />
                  ))}
                </SortableContext>
              </DroppableColumn>
            </div>
          </DndContext>

          <div className='flex gap-2 pt-2 border-t'>
            {dirty && (
              <button onClick={handleSave}
                className='flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'>
                <Save className='w-3 h-3' />{'\u4FDD\u5B58\u4FEE\u6539'}
              </button>
            )}
            {task.status !== 'reviewed' && (
              <button onClick={() => onStatusChange(task.id, 'reviewed')}
                className='flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors'>
                <CheckCircle className='w-3 h-3' /> {'\u6807\u8BB0\u5DF2\u5BA1\u67E5'}
              </button>
            )}
            {task.status !== 'flagged' && (
              <button onClick={() => onStatusChange(task.id, 'flagged')}
                className='flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors'>
                <AlertTriangle className='w-3 h-3' /> {'\u6807\u8BB0\u5F02\u5E38'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}