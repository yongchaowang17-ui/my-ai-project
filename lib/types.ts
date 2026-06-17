// ===== 鐩綍鏍?=====
export interface FileTreeNode {
  name: string;
  path: string;            // 鐩稿浜?data/ 鐨勮矾寰?  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
  lastModified?: string;
  extension?: string;
}

// ===== 鏂囦欢鍐呭 =====
export interface FileContent {
  path: string;
  name: string;
  content: string;
  encoding: string;
  size: number;
  lastModified: string;
  checksum: string;         // SHA-256 鍓?16 浣嶏紝鐢ㄤ簬涔愯閿?}

// ===== 鏂囦欢鍐欏叆璇锋眰 =====
export interface FileWriteRequest {
  content: string;
  checksum?: string;        // PUT 鏃跺繀濉紝POST 鏃跺彲閫?}

// ===== 棰樼洰缁撴瀯 =====
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

// ===== 鎵规敞鏍囪 =====
export interface AnnotationFlag {
  id: string;
  type: 'error' | 'warning' | 'note' | 'todo' | 'review';
  label: string;
  content: string;
  position: { start: number; end: number };
  createdAt: string;
}

// ===== 鑰冭瘯閰嶇疆 =====
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

// ===== 濂楀嵎瀵归綈鐘舵€?=====
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

// ===== 鍛藉悕鏍￠獙缁撴灉 =====
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

// ===== 閰嶅鏂囦欢淇℃伅 =====
export interface PairedFileInfo {
  currentFile: string;
  pairedFile: string | null;
  pairedPath: string | null;
  exists: boolean;
}

// ===== API 鍝嶅簲 =====
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ===== 鎵归噺棰勬媶瑙?Pipeline =====

/** 鍗曚釜鎷嗚В鍧?*/
export interface ProposedBlock {
  id: string;                   // 鍞竴鏍囪瘑绗︼紙dnd-kit 鎷栨嫿鐢級
  type: string;                 // Question 鎴?Analysis
  lineRange: [number, number];  // 1-based, 鍚灏捐
  title: string;                // 璇ュ潡棣栬鏍囬
  content: string;              // 璇ュ潡鍘熷鏂囨湰
  confidence: number;           // 0-1, 姝ｅ垯涓?1.0
}

/** 鎵归噺鎵弿浠诲姟 */
export interface SplitTask {
  id: string;                   // 婧愭枃浠跺悕锛堝幓鎵╁睍鍚嶏級
  sourcePath: string;           // routing/mixed/xxx.md
  examType: string;             // cet4/cet6/kaoyan
  proposedBlocks: ProposedBlock[];
  scanMethod: string;           // regex 鎴?llm
  status: string;               // pending/reviewed/flagged/committed
  createdAt: string;
}
// ===== 子题拆解 (04.5 Decomposed) =====

export interface SubSection {
  id: string;                // e.g. "ScA_News1", "ScC_P1"
  subject: string;           // 听力 / 阅读 / 写作 / 翻译
  sectionFolder: string;     // SectionA / SectionB / SectionC / "" (写作/翻译无子目录)
  filename: string;          // e.g. "CET4_2024_06_S1_News1.md"
  setId: string;
  examType: string;          // CET4 / CET6
  partIndex: number;
  partName: string;
  sectionIndex?: string;     // A / B / C
  sectionName?: string;
  subType: string;           // news / conversation / passage / bankCloze / matching / writing / translation
  subIndex: number;
  content: string;           // 合并后的题目+解析
  sourceQuestionPath: string;
  sourceAnalysisPath: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

export interface SubDecomposePreview {
  setId: string;
  examType: string;
  sections: SubSection[];
  totalSections: number;
  status: 'ready' | 'partial' | 'error';
  errorMsg?: string;
}
