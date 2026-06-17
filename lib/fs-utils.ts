/**
 * File System Safety Layer
 *
 * All fs operations go through this layer:
 * 1. Path safety -- prevents path traversal outside allowed areas
 * 2. Optimistic locking -- checksum prevents concurrent overwrites
 * 3. Soft delete -- moves to .trash instead of permanent deletion
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FileTreeNode, FileContent } from './types';

// ===== Constants =====

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = process.env.DATA_ROOT || path.join(PROJECT_ROOT, 'data');
const WORKSPACE_ROOT = path.join(DATA_ROOT, '02_Working_Area');
const ROUTING_ROOT = path.join(DATA_ROOT, 'routing');
const TRASH_DIR = path.join(DATA_ROOT, '.trash');
const FINAL_ROOT = path.join(DATA_ROOT, '03_Exam_Final');
const FUSION_ROOT = path.join(DATA_ROOT, '04_Fusion_Area');
const SYNTHESIS_ROOT = path.join(DATA_ROOT, '05_Synthesis_Area');
const DECOMPOSED_ROOT = path.join(DATA_ROOT, '04.5_Decomposed');
const IGNORED_NAMES = new Set(['.trash', '.git', 'node_modules', '.next', '.npm-cache']);

// ===== Path Safety =====

export function safePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const resolved = path.resolve(DATA_ROOT, normalized);

  // Allow DATA_ROOT itself (for scanning), workspace, and routing
  if (resolved !== DATA_ROOT
    && !resolved.startsWith(WORKSPACE_ROOT)
    && !resolved.startsWith(ROUTING_ROOT)
    && !resolved.startsWith(FINAL_ROOT)
    && !resolved.startsWith(FUSION_ROOT)
    && !resolved.startsWith(SYNTHESIS_ROOT)
    && !resolved.startsWith(DECOMPOSED_ROOT)
  ) {
    throw new PathSecurityError('Path outside workspace: ' + relativePath);
  }

  return resolved;
}

function toRelative(absolutePath: string): string {
  return path.relative(DATA_ROOT, absolutePath).replace(/\\/g, '/');
}

// ===== Error Types =====

export class PathSecurityError extends Error {
  constructor(message: string) { super(message); this.name = 'PathSecurityError'; }
}
export class FileExistsError extends Error {
  constructor(message: string) { super(message); this.name = 'FileExistsError'; }
}
export class FileNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = 'FileNotFoundError'; }
}
export class ChecksumConflictError extends Error {
  currentChecksum: string;
  constructor(message: string, currentChecksum: string) {
    super(message); this.name = 'ChecksumConflictError'; this.currentChecksum = currentChecksum;
  }
}

// ===== Checksum =====

export function computeChecksum(content: string | Buffer): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return hash.slice(0, 16);
}

// ===== Directory Tree =====

export function scanDirectory(rootDir: string = ''): FileTreeNode[] {
  // Empty string or '.' means scan DATA_ROOT (combined view)
  const rootPath = rootDir ? safePath(rootDir) : DATA_ROOT;
  if (!fs.existsSync(rootPath)) {
    if (rootDir) fs.mkdirSync(rootPath, { recursive: true });
    return [];
  }
  const stat = fs.statSync(rootPath);
  if (!stat.isDirectory()) throw new Error('Path is not a directory: ' + rootDir);
  return readDirRecursive(rootPath);
}

function readDirRecursive(dirPath: string): FileTreeNode[] {
  const entries = fs.readdirSync(dirPath);
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry) || entry.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);
    const relativePath = toRelative(fullPath);

    if (stat.isDirectory()) {
      nodes.push({ name: entry, path: relativePath, type: 'directory', children: readDirRecursive(fullPath) });
    } else {
      nodes.push({ name: entry, path: relativePath, type: 'file', size: stat.size, lastModified: stat.mtime.toISOString(), extension: path.extname(entry) });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return nodes;
}

// ===== File Read =====

export function readFile(relativePath: string): FileContent {
  const absolutePath = safePath(relativePath);
  if (!fs.existsSync(absolutePath)) throw new FileNotFoundError('File not found: ' + relativePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error('Path is not a file: ' + relativePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const checksum = computeChecksum(content);
  return { path: relativePath, name: path.basename(relativePath), content, encoding: 'utf-8', size: stat.size, lastModified: stat.mtime.toISOString(), checksum };
}

// ===== File Write (restricted to workspace only) =====

export function createFile(relativePath: string, content: string): FileContent {
  const absolutePath = safePath(relativePath);
  if (fs.existsSync(absolutePath)) throw new FileExistsError('File already exists: ' + relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
  const stat = fs.statSync(absolutePath);
  const checksum = computeChecksum(content);
  return { path: relativePath, name: path.basename(relativePath), content, encoding: 'utf-8', size: stat.size, lastModified: stat.mtime.toISOString(), checksum };
}

export function updateFile(relativePath: string, content: string, expectedChecksum: string): FileContent {
  const absolutePath = safePath(relativePath);
  if (!fs.existsSync(absolutePath)) throw new FileNotFoundError('File not found: ' + relativePath);
  const currentContent = fs.readFileSync(absolutePath, 'utf-8');
  const currentChecksum = computeChecksum(currentContent);
  if (currentChecksum !== expectedChecksum) {
    throw new ChecksumConflictError('File modified, please refresh. Current: ' + currentChecksum, currentChecksum);
  }
  fs.writeFileSync(absolutePath, content, 'utf-8');
  const stat = fs.statSync(absolutePath);
  const newChecksum = computeChecksum(content);
  return { path: relativePath, name: path.basename(relativePath), content, encoding: 'utf-8', size: stat.size, lastModified: stat.mtime.toISOString(), checksum: newChecksum };
}

export function softDeleteFile(relativePath: string): void {
  const absolutePath = safePath(relativePath);
  if (!fs.existsSync(absolutePath)) throw new FileNotFoundError('File not found: ' + relativePath);
  fs.mkdirSync(TRASH_DIR, { recursive: true });
  fs.renameSync(absolutePath, path.join(TRASH_DIR, Date.now() + '_' + path.basename(relativePath)));
}

export function getFileChecksum(relativePath: string): string {
  const absolutePath = safePath(relativePath);
  if (!fs.existsSync(absolutePath)) throw new FileNotFoundError('File not found: ' + relativePath);
  return computeChecksum(fs.readFileSync(absolutePath, 'utf-8'));
}

// ===== Workspace Utilities =====

export function listExamSets(): string[] {
  if (!fs.existsSync(WORKSPACE_ROOT)) return [];
  return fs.readdirSync(WORKSPACE_ROOT).filter(e => {
    const p = path.join(WORKSPACE_ROOT, e);
    return fs.statSync(p).isDirectory() && !e.startsWith('.');
  });
}

export function getExamSetStructure(setId: string): { questionFiles: string[]; analysisFiles: string[] } {
  const qDir = path.join(WORKSPACE_ROOT, setId, 'Question');
  const aDir = path.join(WORKSPACE_ROOT, setId, 'Analysis');
  return {
    questionFiles: fs.existsSync(qDir) ? fs.readdirSync(qDir).filter(f => f.endsWith('.md')) : [],
    analysisFiles: fs.existsSync(aDir) ? fs.readdirSync(aDir).filter(f => f.endsWith('.md')) : [],
  };
}

export function fileExists(relativePath: string): boolean {
  try {
    const absolutePath = safePath(relativePath);
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
  } catch { return false; }
}

export function createExamSetDirs(setId: string): void {
  fs.mkdirSync(path.join(WORKSPACE_ROOT, setId, 'Question'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_ROOT, setId, 'Analysis'), { recursive: true });
}

export { WORKSPACE_ROOT, ROUTING_ROOT, DATA_ROOT, FINAL_ROOT, FUSION_ROOT, SYNTHESIS_ROOT, DECOMPOSED_ROOT };

