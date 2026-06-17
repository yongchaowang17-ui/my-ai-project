'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Check, ChevronDown, ChevronRight, Eye, Loader2, FileText,
  CheckSquare, Square, CheckCircle, XCircle, Clock, BarChart3,
  Volume2, BookOpen, PenTool, Languages, Send,
} from 'lucide-react';

// ===== Types =====

interface SubSection {
  id: string;
  subject: string;
  sectionFolder: string;
  filename: string;
  setId: string;
  examType: string;
  partIndex: number;
  partName: string;
  sectionIndex?: string;
  sectionName?: string;
  subType: string;
  subIndex: number;
  content: string;
  sourceQuestionPath: string;
  sourceAnalysisPath: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

interface PreviewData {
  setId: string;
  examType: string;
  sections: SubSection[];
  totalSections: number;
  status: string;
}

interface ImportResult {
  committed: number;
  skipped: number;
  errors: string[];
  files: string[];
}

// ===== Constants =====

const SUBJECT_ICONS: Record<string, typeof Volume2> = {
  '听力': Volume2,
  '阅读': BookOpen,
  '写作': PenTool,
  '翻译': Languages,
};

const SUBJECT_COLORS: Record<string, string> = {
  '听力': '#16a34a',
  '阅读': '#d97706',
  '写作': '#2563eb',
  '翻译': '#9333ea',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Check }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
  approved: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle },
};

// ===== Tree Node =====

interface TreeNode {
  id: string;
  label: string;
  type: 'subject' | 'section' | 'file';
  children?: TreeNode[];
  item?: SubSection;
  color?: string;
}

// ===== Main Component =====

export default function SubDecomposeReviewPage() {
  const [previews, setPreviews] = useState<PreviewData[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Fetch previews
  const fetchPreviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/decompose/sub-question/preview', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPreviews(data.data.previews);
        // Auto-expand all subjects
        const subjects = new Set<string>();
        data.data.previews.forEach((p: PreviewData) =>
          p.sections.forEach((s: SubSection) => subjects.add(s.subject))
        );
        setExpandedSubjects(subjects);
      }
    } catch (err) {
      console.error('Failed to fetch previews:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPreviews(); }, [fetchPreviews]);

  // Build tree
  const tree = useMemo((): TreeNode[] => {
    const subjectMap = new Map<string, Map<string, TreeNode>>();

    for (const preview of previews) {
      for (const section of preview.sections) {
        const subjectKey = section.subject;
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, new Map());
        }
        const sectionMap = subjectMap.get(subjectKey)!;
        const sectionKey = section.sectionFolder || '_root';

        if (!sectionMap.has(sectionKey)) {
          sectionMap.set(sectionKey, {
            id: `${subjectKey}/${sectionKey}`,
            label: section.sectionFolder || section.subject,
            type: 'section',
            children: [],
            color: SUBJECT_COLORS[subjectKey],
          });
        }

        sectionMap.get(sectionKey)!.children!.push({
          id: section.id,
          label: section.filename,
          type: 'file',
          item: section,
        });
      }
    }

    const result: TreeNode[] = [];
    for (const [subject, sectionMap] of subjectMap) {
      const children = Array.from(sectionMap.values());
      result.push({
        id: subject,
        label: subject,
        type: 'subject',
        children,
        color: SUBJECT_COLORS[subject],
      });
    }

    return result;
  }, [previews]);

  // Stats
  const stats = useMemo(() => {
    const all = previews.flatMap(p => p.sections);
    return {
      total: all.length,
      pending: all.filter(s => s.status === 'pending').length,
      approved: all.filter(s => s.status === 'approved').length,
      rejected: all.filter(s => s.status === 'rejected').length,
    };
  }, [previews]);

  // Toggle status
  const toggleStatus = useCallback((id: string, newStatus: 'approved' | 'rejected') => {
    setPreviews(prev => prev.map(p => ({
      ...p,
      sections: p.sections.map(s =>
        s.id === id ? { ...s, status: newStatus } : s
      ),
    })));
  }, []);

  // Batch approve all
  const batchApprove = useCallback(() => {
    setPreviews(prev => prev.map(p => ({
      ...p,
      sections: p.sections.map(s => ({ ...s, status: 'approved' as const })),
    })));
  }, []);

  // Import
  const handleImport = useCallback(async () => {
    const allSections = previews.flatMap(p => p.sections);
    const approved = allSections.filter(s => s.status === 'approved');
    if (approved.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch('/api/decompose/sub-question/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: approved }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(data.data);
      }
    } catch (err) {
      console.error('Import failed:', err);
    }
    setImporting(false);
  }, [previews]);

  // Selected item
  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    for (const p of previews) {
      const found = p.sections.find(s => s.id === selectedId);
      if (found) return found;
    }
    return null;
  }, [selectedId, previews]);

  // Toggle expand
  const toggleSubject = useCallback((id: string) => {
    setExpandedSubjects(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Render tree node
  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = node.type === 'subject'
      ? expandedSubjects.has(node.id)
      : node.type === 'section'
        ? expandedSections.has(node.id)
        : false;
    const isSelected = node.type === 'file' && node.id === selectedId;
    const status = node.item?.status || 'pending';
    const StatusIcon = STATUS_STYLES[status].icon;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-sm rounded
            ${isSelected ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}
            ${node.type === 'file' ? 'pl-6' : node.type === 'section' ? 'pl-3' : ''}`}
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => {
            if (node.type === 'subject') toggleSubject(node.id);
            else if (node.type === 'section') toggleSection(node.id);
            else if (node.type === 'file') setSelectedId(node.id);
          }}
        >
          {node.children && (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          )}
          {!node.children && <StatusIcon size={14} className={STATUS_STYLES[status].text} />}

          {node.type === 'subject' && SUBJECT_ICONS[node.id] && (
            (() => { const Icon = SUBJECT_ICONS[node.id]; return <Icon size={14} style={{ color: node.color }} />; })()
          )}
          {node.type === 'file' && <FileText size={14} className="text-gray-400" />}

          <span className="truncate">{node.label}</span>

          {node.type === 'file' && node.item && (
            <span className="ml-auto text-xs text-gray-400">
              {node.item.examType} {node.item.subType}
            </span>
          )}
        </div>

        {isExpanded && node.children?.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">子题拆解审查</h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1"><BarChart3 size={14} /> 总计 {stats.total}</span>
            <span className="flex items-center gap-1 text-gray-500"><Clock size={14} /> 待审 {stats.pending}</span>
            <span className="flex items-center gap-1 text-green-600"><CheckCircle size={14} /> 通过 {stats.approved}</span>
            <span className="flex items-center gap-1 text-red-600"><XCircle size={14} /> 拒绝 {stats.rejected}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={batchApprove}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
          >
            <CheckSquare size={14} /> 全部通过
          </button>
          <button
            onClick={handleImport}
            disabled={importing || stats.approved === 0}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            写入 04.5
          </button>
          <button
            onClick={fetchPreviews}
            disabled={loading}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center gap-1"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            刷新
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Tree */}
        <div className="w-72 border-r bg-white overflow-y-auto">
          {tree.map(node => renderNode(node))}
        </div>

        {/* Right: Preview */}
        <div className="flex-1 overflow-y-auto p-4">
          {importResult && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
              <strong>写入完成：</strong> 成功 {importResult.committed} 个，
              跳过 {importResult.skipped} 个
              {importResult.errors.length > 0 && (
                <span className="text-red-600">，错误 {importResult.errors.length} 个</span>
              )}
            </div>
          )}

          {selectedItem ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-semibold">{selectedItem.filename}</h2>
                  <p className="text-sm text-gray-500">
                    {selectedItem.examType} | {selectedItem.subject}
                    {selectedItem.sectionName && ` | ${selectedItem.sectionName}`}
                    {' | '}{selectedItem.subType}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleStatus(selectedItem.id, 'approved')}
                    className={`px-3 py-1 text-sm rounded flex items-center gap-1
                      ${selectedItem.status === 'approved'
                        ? 'bg-green-600 text-white'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                  >
                    <CheckCircle size={14} /> 通过
                  </button>
                  <button
                    onClick={() => toggleStatus(selectedItem.id, 'rejected')}
                    className={`px-3 py-1 text-sm rounded flex items-center gap-1
                      ${selectedItem.status === 'rejected'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                  >
                    <XCircle size={14} /> 拒绝
                  </button>
                  <button
                    onClick={() => setShowCompare(!showCompare)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 flex items-center gap-1"
                  >
                    <Eye size={14} /> {showCompare ? '隐藏原文' : '对比原文'}
                  </button>
                </div>
              </div>

              <div className={`grid gap-4 ${showCompare ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div className="bg-white border rounded p-4">
                  <h3 className="text-xs font-medium text-gray-500 mb-2">拆解内容</h3>
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {selectedItem.content}
                  </pre>
                </div>

                {showCompare && (
                  <div className="bg-gray-50 border rounded p-4">
                    <h3 className="text-xs font-medium text-gray-500 mb-2">来源文件</h3>
                    <p className="text-xs text-gray-400 mb-2">
                      Q: {selectedItem.sourceQuestionPath.split(/[/\\]/).pop()}
                      {selectedItem.sourceAnalysisPath && (
                        <> | A: {selectedItem.sourceAnalysisPath.split(/[/\\]/).pop()}</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Eye size={48} className="mx-auto mb-4 opacity-30" />
                <p>选择左侧文件查看预览</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
