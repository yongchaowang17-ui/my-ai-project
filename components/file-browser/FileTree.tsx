'use client';

import { useState, useMemo, useEffect } from 'react';
import type { FileTreeNode, AlignmentStatus } from '@/lib/types';
import {
  ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Search,
  BookOpen, Layers, Files, HelpCircle, Check, AlertTriangle,
  GitBranch, GitMerge, Shield, Atom, Merge,
} from 'lucide-react';

const ROUTING_ICONS: Record<string, { icon: React.ReactNode; colorClass: string; label: string }> = {
  raw_questions: { icon: <FileText className='w-4 h-4' />, colorClass: 'text-blue-500', label: '纯题目' },
  raw_analysis: { icon: <BookOpen className='w-4 h-4' />, colorClass: 'text-green-500', label: '纯解析' },
  mixed: { icon: <Layers className='w-4 h-4' />, colorClass: 'text-amber-500', label: '混合卷' },
  multi_set: { icon: <Files className='w-4 h-4' />, colorClass: 'text-purple-500', label: '多套卷' },
  uncategorized: { icon: <HelpCircle className='w-4 h-4' />, colorClass: 'text-muted-foreground', label: '未分类' },
};

function getCategoryFromPath(nodePath: string): string | null {
  const match = nodePath.match(/routing\/([^\/]+)$/);
  return match ? match[1] : null;
}

interface FileBrowserProps {
  tree: FileTreeNode[];
  onSelect: (path: string) => void;
  selectedPath?: string;
  highlightPath?: string | null;
}

export function FileBrowser({ tree, onSelect, selectedPath, highlightPath }: FileBrowserProps) {
  const [filter, setFilter] = useState('');
  const [alignmentCache, setAlignmentCache] = useState<Map<string, AlignmentStatus>>(new Map());

  useEffect(() => {
    fetch('/api/alignment?all=true')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.sets) {
          const map = new Map<string, AlignmentStatus>();
          for (const [id, status] of Object.entries(json.data.sets)) map.set(id, status as AlignmentStatus);
          setAlignmentCache(map);
        }
      }).catch(() => {});
  }, []);

  const alignmentSummary = useMemo(() => {
    const statuses = Array.from(alignmentCache.values());
    return {
      total: statuses.length,
      aligned: statuses.filter(s => s.isFullyAligned).length,
      pending: statuses.length - statuses.filter(s => s.isFullyAligned).length,
    };
  }, [alignmentCache]);

  const filteredTree = filter
    ? tree.filter(n => n.name.toLowerCase().includes(filter.toLowerCase()))
    : tree;

  const routingNode = filteredTree.find(n => n.path === 'routing');
  const workingAreaNode = filteredTree.find(n => n.path === '02_Working_Area');
  const finalNode = filteredTree.find(n => n.path === '03_Exam_Final');
  const fusionNode = filteredTree.find(n => n.path === '04_Fusion_Area');
  const synthesisNode = filteredTree.find(n => n.path === '05_Synthesis_Area');
  const otherNodes = filteredTree.filter(n => n.path !== 'routing' && n.path !== '02_Working_Area' && n.path !== '03_Exam_Final' && n.path !== '04_Fusion_Area' && n.path !== '05_Synthesis_Area');

  return (
    <div className='space-y-1'>
      <div className='relative mb-2'>
        <Search className='absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground' />
        <input type='text' placeholder='搜索文件...' value={filter} onChange={e => setFilter(e.target.value)}
          className='w-full pl-7 pr-2 py-1.5 text-xs bg-muted/50 border rounded-md focus:outline-none focus:ring-1 focus:ring-ring' />
      </div>

      {alignmentCache.size > 0 && alignmentSummary.total > 0 && (
        <div className='mb-2 px-2 py-1.5 rounded-md bg-muted/30 flex items-center gap-2 text-[11px]'>
          <Check className='w-3 h-3 text-green-500' />
          <span className='text-muted-foreground'>{alignmentSummary.aligned} 对齐</span>
          {alignmentSummary.pending > 0 && <>
            <AlertTriangle className='w-3 h-3 text-amber-500' />
            <span className='text-muted-foreground'>{alignmentSummary.pending} 待处理</span>
          </>}
        </div>
      )}

      {routingNode && (
        <div>
          <ZoneLabel icon={<GitBranch className='w-3 h-3' />} label='分解区' color='text-orange-500' />
          <TreeNode node={routingNode} onSelect={onSelect} selectedPath={selectedPath}
            alignmentCache={alignmentCache} highlightPath={highlightPath} />
        </div>
      )}

      {workingAreaNode && (
        <div className='mt-2'>
          <ZoneLabel icon={<GitMerge className='w-3 h-3' />} label='合成区' color='text-emerald-500' />
          <TreeNode node={workingAreaNode} onSelect={onSelect} selectedPath={selectedPath}
            alignmentCache={alignmentCache} highlightPath={highlightPath} />
        </div>
      )}

      {finalNode && (
        <div className='mt-2'>
          <ZoneLabel icon={<BookOpen className='w-3 h-3' />} label='标准资产库' color='text-indigo-500' />
          <TreeNode node={finalNode} onSelect={onSelect} selectedPath={selectedPath}
            isReadOnly={true} alignmentCache={alignmentCache} highlightPath={highlightPath} />
        </div>
      )}
      {fusionNode && (
        <div className='mt-2'>
          <ZoneLabel icon={<Atom className='w-3 h-3' />} label='融合区' color='text-cyan-500' />
          <TreeNode node={fusionNode} onSelect={onSelect} selectedPath={selectedPath}
            isReadOnly={true} alignmentCache={alignmentCache} highlightPath={highlightPath} />
        </div>
      )}

      

            {synthesisNode && (
        <div className='mt-2'>
          <ZoneLabel icon={<Merge className='w-3 h-3' />} label='合成区' color='text-emerald-500' />
          <TreeNode node={synthesisNode} onSelect={onSelect} selectedPath={selectedPath}
            isReadOnly={true} alignmentCache={alignmentCache} highlightPath={highlightPath} />
        </div>
      )}

{otherNodes.map(n => (
        <TreeNode key={n.path} node={n} onSelect={onSelect} selectedPath={selectedPath}
          alignmentCache={alignmentCache} highlightPath={highlightPath} />
      ))}

      {filteredTree.length === 0 && (
        <p className='text-xs text-muted-foreground py-4 text-center'>暂无文件</p>
      )}
    </div>
  );
}

function ZoneLabel({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className={'flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium ' + color + ' uppercase tracking-wider'}>
      {icon}
      {label}
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  onSelect: (path: string) => void;
  selectedPath?: string;
  depth?: number;
  alignmentCache?: Map<string, AlignmentStatus>;
  isReadOnly?: boolean;
  highlightPath?: string | null;
}

function TreeNode({ node, onSelect, selectedPath, depth = 0, alignmentCache, highlightPath, isReadOnly }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedPath === node.path;
  const isHighlighted = highlightPath === node.path;

  const handleClick = () => {
    if (node.type === 'directory') setExpanded(!expanded);
    else onSelect(node.path);
  };

  const routingStyle = node.type === 'directory' ? getCategoryFromPath(node.path) : null;
  const fileCategory = node.type === 'file' ? getCategoryFromPath(node.path) : null;
  const fileStyle = fileCategory ? ROUTING_ICONS[fileCategory] : null;

  const setId = node.type === 'directory' ? extractSetId(node.path) : null;
  const alignment = setId && alignmentCache ? alignmentCache.get(setId) : null;

  const DirIcon = expanded
    ? <FolderOpen className={'w-4 h-4 shrink-0 ' + (routingStyle && ROUTING_ICONS[routingStyle] ? ROUTING_ICONS[routingStyle].colorClass : 'text-blue-400')} />
    : <Folder className={'w-4 h-4 shrink-0 ' + (routingStyle && ROUTING_ICONS[routingStyle] ? ROUTING_ICONS[routingStyle].colorClass : 'text-blue-400')} />;

  const FileIcon = fileStyle
    ? <span className={fileStyle.colorClass}>{fileStyle.icon}</span>
    : <FileText className='w-4 h-4 text-muted-foreground shrink-0' />;
  const ReadOnlyBadge = isReadOnly && node.type === 'file' ? <Shield className='w-3 h-3 text-indigo-400 shrink-0 ml-0.5' /> : null;

  const childFileCount = node.type === 'directory' && node.children ? node.children.filter(c => c.type === 'file').length : 0;

  let alignmentBadge: React.ReactNode = null;
  if (alignment && node.type === 'directory') {
    if (alignment.isFullyAligned) alignmentBadge = <Check className='w-3 h-3 text-green-500 shrink-0' />;
    else if (alignment.questionFiles.length > 0 || alignment.analysisFiles.length > 0)
      alignmentBadge = <AlertTriangle className='w-3 h-3 text-amber-500 shrink-0' />;
  }

  return (
    <div>
      <button onClick={handleClick}
        className={
          'w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors text-left '
          + (isHighlighted ? 'new-file-highlight ' : '')
          + (isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50 text-foreground')
        }
        style={{ paddingLeft: (depth * 12 + 8) + 'px' }}>
        {node.type === 'directory' ? (
          expanded ? <ChevronDown className='w-3 h-3 shrink-0 text-muted-foreground' />
            : <ChevronRight className='w-3 h-3 shrink-0 text-muted-foreground' />
        ) : <span className='w-3 shrink-0' />}
        {node.type === 'directory' ? DirIcon : FileIcon}{ReadOnlyBadge}
        <span className='truncate'>{node.name}</span>
        {alignmentBadge}
        {node.type === 'directory' && childFileCount > 0 && (
          <span className='ml-auto text-[10px] text-muted-foreground shrink-0 bg-muted/50 px-1 rounded'>{childFileCount}</span>
        )}
        {node.type === 'file' && node.size !== undefined && (
          <span className='ml-auto text-[10px] text-muted-foreground shrink-0'>{formatSize(node.size)}</span>
        )}
      </button>
      {node.type === 'directory' && expanded && node.children && (
        <div>{node.children.map(child => (
          <TreeNode key={child.path} node={child} onSelect={onSelect} selectedPath={selectedPath}
            depth={depth + 1} isReadOnly={isReadOnly} alignmentCache={alignmentCache} highlightPath={highlightPath} />
        ))}</div>
      )}
    </div>
  );
}

function extractSetId(nodePath: string): string | null {
  const match = nodePath.match(/02_Working_Area\/([^\/]+)$/);
  return match ? match[1] : null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}