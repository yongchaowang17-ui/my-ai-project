// ===== 目录树 =====
export interface FileTreeNode {
  name: string;
  path: string;            // 相对于 data/ 的路径
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
  lastModified?: string;
  extension?: string;
}

// ===== 文件内容 =====
export interface FileContent {
  path: string;
  name: string;
  content: string;
  encoding: string;
  size: number;
  lastModified: string;
  checksum: string;         // SHA-256 前 16 位，用于乐观锁
}

// ===== 文件写入请求 =====
export interface FileWriteRequest {
  content: string;
  checksum?: string;        // PUT 时必填，POST 时可选
}

// ===== 题目结构 =====
export interface Question {
  id: string;
  type:
    | 'choice'
    | 'fill'
    | 'translate'
    | 'reading'
    | 'writing'
    | 'listening'
    | 'unknown';
  content: string;
  options?: string[];
  answer?: string;
  analysis?: string;
  section?: string;
  metadata: QuestionMetadata;
}

export interface QuestionMetadata {
  sourceFile: string;
  examType: string;
  section?: string;
  difficulty?: number;      // 1-5
  flags: AnnotationFlag[];
  createdAt: string;
  updatedAt: string;
}

// ===== 批注标记 =====
export interface AnnotationFlag {
  id: string;
  type: 'error' | 'warning' | 'note' | 'todo' | 'review';
  label: string;
  content: string;
  position: { start: number; end: number };
  createdAt: string;
}

// ===== 考试配置 =====
export interface ExamTypeConfig {
  id: string;
  name: string;
  description: string;
  sections: SectionConfig[];
  splitRules: SplitRule[];
  outputTemplate: string;
}

export interface SectionConfig {
  id: string;
  name: string;
  questionTypes: string[];
}

export interface SplitRule {
  pattern: string;
  flags: string;
  questionType: string;
  priority: number;
}

// ===== 套卷对齐状态 =====
export interface AlignmentStatus {
  setId: string;
  questionFiles: string[];
  analysisFiles: string[];
  matched: Array<{
    questionFile: string;
    analysisFile: string;
    pairKey: string;
  }>;
  unmatched: Array<{
    file: string;
    side: 'question' | 'analysis';
  }>;
  isFullyAligned: boolean;
}

// ===== 命名校验结果 =====
export interface NamingValidation {
  valid: boolean;
  error?: string;
  parsed?: {
    year: string;
    month: string;
    set: string;
    side: 'Q' | 'A';
    sequence: string;
  };
}

// ===== 配对文件信息 =====
export interface PairedFileInfo {
  currentFile: string;
  pairedFile: string | null;
  pairedPath: string | null;
  exists: boolean;
}

// ===== API 响应 =====
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ===== 批量预拆解 Pipeline =====

/** 单个拆解块 */
export interface ProposedBlock {
  id: string;                   // 唯一标识符（dnd-kit 拖拽用）
  type: string;                 // Question 或 Analysis
  lineRange: [number, number];  // 1-based, 含首尾行
  title: string;                // 该块首行标题
  content: string;              // 该块原始文本
  confidence: number;           // 0-1, 正则为 1.0
}

/** 批量扫描任务 */
export interface SplitTask {
  id: string;                   // 源文件名（去扩展名）
  sourcePath: string;           // routing/mixed/xxx.md
  examType: string;             // cet4/cet6/kaoyan
  proposedBlocks: ProposedBlock[];
  scanMethod: string;           // regex 或 llm
  status: string;               // pending/reviewed/flagged/committed
  createdAt: string;
}