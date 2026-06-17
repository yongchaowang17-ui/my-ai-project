# 题库清洗手术台 — 项目进度报告

> 更新时间：2026-06-06
> 版本：v0.5.0

---

## 项目概述

构建一个 Next.js (App Router) + TailwindCSS + Shadcn/UI + Monaco Editor 应用，用于对教育真题 Markdown 文档进行可视化拆解、清洗、批注及标准化导出。

**技术栈**：Next.js 15 / React 19 / TypeScript / TailwindCSS 4 / Monaco Editor / lucide-react

**数据目录**：`D:\my-ai-Project\data\`

---

## 架构总览

```
D:\my-ai-Project\
├── app/
│   ├── layout.tsx                          # 根布局（顶部导航）
│   ├── page.tsx                            # 主页面（三栏手术台）
│   ├── globals.css                         # 全局样式 + Monaco 装饰
│   ├── review/
│   │   ├── page.tsx                        # 批量审查页面
│   │   ├── decompose/page.tsx              # 拆解预览页面（03→04）
│   │   └── synthesis/page.tsx              # 合成审查页面（04→05）
│   └── api/
│       ├── files/route.ts                  # GET 目录扫描
│       ├── files/[...path]/route.ts        # 文件 CRUD（乐观锁 + 命名校验）
│       ├── split/route.ts                  # 题目拆解（路由感知规则选择）
│       ├── export/route.ts                 # 格式化导出（预留）
│       ├── export/divert/route.ts          # 选区精准分流导出
│       ├── export/extract-selection/route.ts # 选区提取 API
│       ├── export/split-at-line/route.ts   # 行级分割 API
│       ├── export/batch-split/route.ts     # 批量提交 API
│       ├── alignment/route.ts              # Q/A 对齐检测
│       ├── routing-profile/route.ts        # 路由分类 → splitProfile 映射
│       ├── scan/route.ts + scan/tasks/     # 扫描 API + 任务持久化
│       ├── assets/final/[...path]/route.ts # 标准资产库只读 API
│       ├── assets/fusion/[...path]/route.ts# 融合区只读 API
│       ├── decompose/preview/route.ts      # 03→04 拆解预览 API
│       └── decompose/import/route.ts       # 04 区写入 API
├── components/
│   ├── file-browser/FileTree.tsx           # 四区分割目录树
│   ├── editor/MarkdownEditor.tsx           # Monaco Editor（只读/编辑切换）
│   ├── editor/EditorPlaceholder.tsx        # Monaco 加载失败 fallback
│   ├── tool-panel/ToolPanel.tsx            # 拆解/导出/批注 Tab + 分流按钮
│   ├── divert/DivertModal.tsx              # 分流导出模态框
│   ├── divert/ExtractSelectionModal.tsx    # 选区提取模态框（含区选择器）
│   ├── divert/SplitAtLineModal.tsx         # 行级分割确认弹窗
│   ├── bulk-review/BulkReviewPanel.tsx     # 批量审查面板（块操作+拖拽）
│   └── ui/Toast.tsx                        # Toast 通知组件
├── lib/
│   ├── types.ts                            # 全部 TypeScript 类型定义
│   ├── utils.ts                            # cn() 工具函数
│   ├── fs-utils.ts                         # 文件系统安全层（含 FUSION_ROOT）
│   ├── naming-validator.ts                 # 命名校验器
│   ├── fingerprint.ts                      # 指纹索引 + 原子写入
│   ├── standardizer.ts                     # 标准化复制 + Frontmatter
│   ├── organizer.ts                        # 分拣引擎（清单追踪）
│   ├── block-utils.ts                      # 块操作工具（合并/删除/拆分/重算行号）
│   ├── scanner.ts                          # 路由文件正则扫描逻辑
│   ├── fusion-decomposer.ts                # Part 级拆解引擎（正则+gray-matter）
│   ├── splitter.ts                         # 文本拆解逻辑（规则引擎）
│   ├── annotator.ts                        # 批注管理逻辑
│   └── llm/                                # LLM Provider 抽象层
├── config/
│   ├── exam-types.json                     # 考试类型注册表
│   ├── split-rules.json                    # 拆解规则集（含路由 profile）
│   ├── routing-rules.json                  # 路由分类配置
│   ├── output-templates.json               # 输出模板
│   └── annotation-presets.json             # 批注预设
├── scripts/
│   ├── router.py                           # Python 分拣脚本
│   ├── router.js                           # Node.js 分拣脚本
│   ├── scanner.js                          # 路由文件扫描脚本
│   ├── decompose-fusion.js                 # CLI 批量拆解脚本
│   ├── synthesize-05.js                    # 04→05 合成脚本（Section 精确配对）
│   ├── finalize-assets.js                  # 标准化资产管线
│   ├── organize-all.js                     # 分拣 routing → 02_Working_Area
│   └── diagnose.js                         # 自诊断脚本（prebuild 钩子）
├── middleware.ts                            # API 权限分级（final+fusion+synthesis 只读）
└── data/
    ├── raw/                                # 原始文件（已清空，归档）
    ├── routing/                            # 分拣后文件（192 个）
    │   ├── raw_questions/    102 个
    │   ├── raw_analysis/      31 个
    │   ├── mixed/             16 个
    │   └── uncategorized/     43 个
    ├── 02_Working_Area/                    # 合成区（126 套卷）
    ├── 03_Exam_Final/                      # 标准资产库（251 文件，只读）
    ├── 04_Fusion_Area/                     # 融合区（20 文件，手拆模板）
    ├── tasks/                              # 扫描任务持久化（88 个）
    └── fingerprint.json                    # 指纹索引
```

---

## 已完成功能

### Phase 1：项目骨架 + 核心 API

- [x] Next.js 项目初始化（手动创建，无 create-next-app）
- [x] `lib/fs-utils.ts` 文件系统安全层（路径校验 / SHA-256 乐观锁 / 软删除）
- [x] `GET /api/files` 目录树扫描 API
- [x] `GET/POST/PUT/DELETE /api/files/[...path]` 文件 CRUD API
- [x] `config/` 下四个 JSON 配置文件
- [x] `data/raw/` 下 3 个示例真题 MD 文件
- [x] TypeScript 严格模式 + 全类型覆盖

### Phase 2：Monaco Editor 集成

- [x] `@monaco-editor/react` 集成（forwardRef + useImperativeHandle）
- [x] 默认只读模式 + 工具栏切换按钮
- [x] Ctrl+S 快捷键绑定保存
- [x] `getSelectedText()` / `getSelectedLineRange()` 暴露给父组件
- [x] Monaco deltaDecorations 装饰器（已分流高亮）
- [x] 光标位置实时显示（底部状态栏）
- [x] 文件切换时未保存修改 confirm 提示

### Phase 3：分拣-分区治理

- [x] `scripts/router.js` / `router.py` 文件分拣脚本（内容分析，非文件名）
- [x] 192 个真题文件分类到 4 个子目录
- [x] `config/routing-rules.json` 路由分类配置
- [x] `config/split-rules.json` 新增 4 种拆解规则集
- [x] `/api/split` 支持 filePath/splitProfile 参数，自动推断拆解规则
- [x] FileTree 路由分类彩色图标 + 文件计数

### Phase 4：标准化套卷治理

- [x] `data/02_Working_Area/{setId}/Question|Analysis/` 三级工作区
- [x] `lib/naming-validator.ts` 命名校验器（正则 + 字段解析）
- [x] `safePath()` 路径限制收紧到工作区范围内
- [x] `GET /api/alignment` Q/A 对齐检测 API
- [x] FileTree 套卷目录绿色勾/黄色感叹号对齐状态图标
- [x] ToolPanel「打开对应解析/题目」配对文件切换按钮
- [x] POST/PUT 命名校验中间件（400 拒绝不合规文件名）
- [x] 新建文件时自动创建套卷目录结构

### Phase 5：双区布局 + 分流导出

- [x] `scanDirectory('')` 支持 data/ 根目录合并扫描
- [x] FileTree 分割为「分解区」(routing/) + 「合成区」(02_Working_Area/)
- [x] ZoneLabel 组件（橙色 GitBranch + 绿色 GitMerge 图标）
- [x] `POST /api/export/divert` 选区精准分流 API（追加模式）
- [x] DivertModal 模态框（真题/解析单选 + 文件名预填 + 路径预览）
- [x] Toast 通知组件（3 秒自动消失）
- [x] Question 文件导出后绿色左边框高亮装饰

### Phase 6：批量审查 Pipeline

- [x] `scripts/scanner.js` 正则扫描 routing/mixed/ 生成 data/tasks/*.json
- [x] BulkReviewPanel：卡片式审查界面
- [x] 块级操作：合并、删除、拆分（带 checkbox 选择）
- [x] @dnd-kit 拖拽：Question ↔ Analysis 跨容器拖拽切换 type
- [x] finalizeBlocksOrder() 拖拽结算：排序 + 行号重算
- [x] validateBlockIntegrity() + validateLineContinuity() 数据校验
- [x] 批量提交 API: POST /api/export/batch-split

### Phase 7：标准化资产管线

- [x] lib/standardizer.ts：copyAndStandardize (gray-matter + Frontmatter 植入)
- [x] lib/organizer.ts：organizeFileTracked (清单追踪)
- [x] scripts/finalize-assets.js：标准化 02_Working_Area → 03_Exam_Final
- [x] scripts/organize-all.js：分拣 routing → 02_Working_Area
- [x] lib/fingerprint.ts：指纹索引 + 原子写入
- [x] middleware.ts：API 权限分级 (03_Exam_Final + 04_Fusion_Area 只读)
- [x] /api/assets/final/[...path]：标准资产库只读 API
- [x] /api/assets/fusion/[...path]：融合区只读 API
- [x] scripts/diagnose.js：自诊断脚本 (prebuild 钩子)
- [x] FileTree 三区布局：分解区 + 合成区 + 标准资产库
- [x] 251 个文件已标准化，含 YAML Frontmatter

### Phase 8：04_Fusion_Area + 拆解预览界面

- [x] lib/fs-utils.ts：新增 FUSION_ROOT 常量 + safePath 白名单
- [x] lib/fusion-decomposer.ts：Part 级拆解引擎（正则锚点 + gray-matter）
- [x] scripts/decompose-fusion.js：CLI 批量拆解脚本
- [x] /api/assets/fusion/[...path]：04区只读 API + middleware 保护
- [x] /api/decompose/preview：扫描 03区文件，按 Part 标题切分为预览块
- [x] /api/decompose/import：将编辑后的块写入 04_Fusion_Area
- [x] /review/decompose 页面：可视化拆解预览界面
  - [x] 全选/取消全选按钮
  - [x] 基于表格的行号显示（左侧行号列）
  - [x] 块内容可编辑（textarea）+ Part 名称可重命名
  - [x] 块级操作：合并、删除、上移、下移
  - [x] 块拆分功能（✂️ 按行号拆分单个块为两个）
  - [x] 导入状态检测（已存在/部分导入/可导入）
  - [x] 导入结果面板 + 返回预览按钮
- [x] ExtractSelectionModal 新增「区选择器」：合成区/融合区
- [x] setId 路径提取支持四级目录（02/03/04/routing）
- [x] 04_Fusion_Area 目录结构初始化
- [x] 用户手拆模板：CET4_2015_06_S1（20个文件，Q/A 各4 Part）
### Phase 9：05_Synthesis_Area 合成管线

- [x] scripts/synthesize-05.js：04→05 合成脚本（Writing/Translation 整块拼接，Reading/Listening 逐段交叉）
- [x] 听力 Section 按题目编号范围精确切分（Q1-7/Q8-15/Q16-25），四级/六级标签区分
- [x] Reading Section 按标题名称匹配交叉（SectionA/B/C/PassageOne/Two）
- [x] app/api/synthesis/preview/route.ts：合成预览 + 审查状态 GET/POST API
- [x] app/api/synthesis/import/route.ts：05区批量导入（手动 frontmatter + 指纹幂等）
- [x] app/review/synthesis/page.tsx：可视化合成审查页面（筛选/编辑/批量导入/快捷键）
- [x] FileTree 第五区 05_Synthesis_Area（Merge 图标 + text-emerald-500）
- [x] middleware.ts 新增 /api/assets/synthesis/** 只读保护
- [x] 导航栏新增「合成审查」链接
- [x] Translation 乱码修复：4 个文件（CET4_2022_06_S3_A, CET6_2021_12_S1_Q, CET6_2021_06_S2_Q, CET4_2024_12_S2_A）
- [x] gray-matter 导入 bug 修复：内容含 --- 被误解析为 YAML 分隔符，改用手动拼接


---

## 已知问题

- [ ] 导入按钮首次点击偶发无响应（已修复 computeFileHash bug，待用户确认）
- [ ] Dev server 端口冲突需手动 kill 进程

---

## 数据统计

| 指标 | 数值 |
|------|------|
| 源文件总数 | 192 个 .md |
| 分拣到 routing/ | 192 个 |
| 分类：raw_questions | 102 个 |
| 分类：raw_analysis | 31 个 |
| 分类：mixed | 16 个 |
| 分类：uncategorized | 43 个 |
| 工作区套卷数 | 126 个 (CET4: 63 + CET6: 63) |
| API 路由数 | 20+ 个 |
| 标准化资产 | 251 个 (03_Exam_Final) |
| 融合区文件 | 495 个 (04_Fusion_Area Part 块) |
| 合成区文件 | 495 个 (05_Synthesis_Area Q+A 交叉) |
| 合成预览 | synthesis-preview.json (495 个) |
| 扫描任务 | 88 个 (data/tasks/) |
| 前端组件数 | 14 个 |
| 配置文件数 | 5 个 |

---

## API 接口清单

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/files?root=` | 扫描目录树（空 root=合并视图） |
| GET | `/api/files/[...path]` | 读取文件内容 |
| POST | `/api/files/[...path]` | 创建文件（含命名校验） |
| PUT | `/api/files/[...path]` | 更新文件（乐观锁） |
| DELETE | `/api/files/[...path]` | 软删除文件 |
| POST | `/api/split` | 题目拆解（路由感知） |
| POST | `/api/export/divert` | 选区精准分流导出 |
| POST | `/api/export/extract-selection` | 选区提取到目标区 |
| POST | `/api/export/split-at-line` | 光标行级分割 |
| POST | `/api/export/batch-split` | 批量提交拆解结果 |
| GET | `/api/alignment?setId=` | 单套卷对齐检测 |
| GET | `/api/alignment?all=true` | 所有套卷对齐概览 |
| GET | `/api/routing-profile?category=` | 路由分类→splitProfile 映射 |
| POST | `/api/scan` | 正则扫描路由文件 → 任务清单 |
| GET | `/api/scan/tasks` | 获取所有扫描任务 |
| GET | `/api/assets/final/[...path]` | 标准资产库只读浏览 |
| GET | `/api/assets/fusion/[...path]` | 融合区只读浏览 |
| POST | `/api/decompose/preview` | 03区文件拆解预览 |
| POST | `/api/decompose/import` | 拆解块写入04区 |
| GET | `/api/synthesis/preview` | 05合成预览 + 审查状态 |
| POST | `/api/synthesis/preview` | 更新审查状态/内容 |
| POST | `/api/synthesis/import` | 05区批量导入 |

---

## 命名规范

**套卷目录**：`{考试级别}_{年份}_{月份}_{套号}`
- 示例：`CET4_2024_06_S1`、`CET6_2023_12_S3`

**合成区文件名**：`{年份}_{月份}_{套号}_{Q|A}_{序号}.md`
- 示例：`2024_06_S1_Q_01-10.md`、`2024_12_S2_A_05.md`

**融合区文件名**：`{考试级别}_{年份}_{月份}_{套号}_{Q|A}_{序号}_{Part名称}.md`
- 示例：`CET4_2015_06_S1_Q_01_Writing.md`
- Part 名称：Writing / Listening / Reading / Translation
- CET-4 四个 Part，CET-6 四至五个 Part

---

## 启动方式

```bash
cd D:\my-ai-Project
npm install
npm run dev
# 访问 http://localhost:3000
```

---

## 待办事项

- [ ] 05区批量导入：495 个合成文件审查确认后写入 05_Synthesis_Area
- [ ] 拆解预览界面：修复导入按钮首次点击无响应问题
- [ ] 04区命名格式统一：四级(CET4) / 六级(CET6) 区分
- [ ] 诊断脚本扩展：04区 Part 完整性检查 + 元数据一致性校验
- [ ] 接入 LLM Provider（OpenAI / Dify）到 Split Engine
- [ ] Monaco Editor 完整注释面板（批注 CRUD + 拖拽排序）
- [ ] 文件搜索全局快捷键（Ctrl+P）
- [ ] 暗色主题适配
- [ ] 单元测试覆盖（fs-utils / naming-validator / scanner）

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/fs-utils.ts` | 修改 | safePath 新增 FUSION_ROOT 白名单 |
| `lib/fingerprint.ts` | 新建 | 指纹索引 + 原子写入 |
| `lib/fusion-decomposer.ts` | 新建 | Part级拆解引擎（正则+gray-matter） |
| `lib/block-utils.ts` | 新建 | 块操作工具（合并/删除/拆分/重算行号） |
| `lib/scanner.ts` | 新建 | 路由文件正则扫描逻辑 |
| `scripts/decompose-fusion.js` | 新建 | CLI批量拆解脚本 |
| `scripts/scanner.js` | 新建 | 路由文件扫描脚本 |
| `scripts/diagnose.js` | 新建 | 自诊断脚本（含04区检查） |
| `middleware.ts` | 新建 | API权限分级（final+fusion只读） |
| `app/api/assets/final/[...path]/route.ts` | 新建 | 标准资产库只读API |
| `app/api/assets/fusion/[...path]/route.ts` | 新建 | 融合区只读API |
| `app/api/decompose/preview/route.ts` | 新建 | 03区拆解预览API |
| `app/api/decompose/import/route.ts` | 新建 | 04区写入API |
| `app/api/scan/route.ts` + `scan/tasks/` | 新建 | 扫描API + 任务持久化 |
| `app/api/export/extract-selection/route.ts` | 新建 | 选区提取API |
| `app/api/export/split-at-line/route.ts` | 新建 | 行级分割API |
| `app/api/export/batch-split/route.ts` | 新建 | 批量提交API |
| `app/review/page.tsx` | 新建 | 批量审查页面 |
| `app/review/decompose/page.tsx` | 新建 | 拆解预览页面 |
| `app/review/synthesis/page.tsx` | 新建 | 合成审查页面 |
| `app/api/synthesis/preview/route.ts` | 新建 | 05合成预览API |
| `app/api/synthesis/import/route.ts` | 新建 | 05区批量导入API |
| `scripts/synthesize-05.js` | 新建 | 04→05合成脚本 |
| `components/bulk-review/BulkReviewPanel.tsx` | 新建 | 批量审查面板组件 |
| `components/divert/ExtractSelectionModal.tsx` | 新建 | 选区提取弹窗（含区选择器） |
| `components/divert/SplitAtLineModal.tsx` | 新建 | 行级分割确认弹窗 |
| `components/file-browser/FileTree.tsx` | 修改 | 四区布局（+资产库+融合区） |
| `app/page.tsx` | 修改 | 主页面状态扩展 |
| `app/layout.tsx` | 修改 | 顶部导航（手术台+批量审查+拆解预览） |

---

## 关键设计决策

1. **UTF-8 编码**：PowerShell 5.x 默认 GBK 会导致中文乱码，所有含中文的文件通过 `node --% -e` 或 `fs.writeFileSync(content, 'utf-8')` 写入
2. **路径安全**：`safePath()` 强制所有操作在工作区内，防路径穿越
3. **乐观锁**：SHA-256 前 16 位 checksum，PUT 时校验一致性，409 冲突返回当前 checksum
4. **分流追加**：`/api/export/divert` 使用 `appendFileSync` 而非覆盖，支持多次选中分流到同一文件
5. **配置驱动**：拆解规则、考试类型、输出模板全部 JSON 配置，切换考试类型无需改代码
6. **四区数据架构**：routing/(分解区) → 02_Working_Area/(合成区) → 03_Exam_Final/(资产库) → 04_Fusion_Area/(融合区)，逐级清洗标准化
7. **权限分级**：03区和04区通过 middleware 强制只读，防止误修改资产库
8. **正则优先**：扫描和拆解以正则为主（覆盖90%文件），LLM仅作审计兜底
9. **模板驱动**：04区拆解遵循用户手拆模板格式，先预览确认再批量写入

---

## 乱码修复记录（2026-06-06）

### 修复范围
- **02_Working_Area**：26 个文件修复
- **03_Exam_Final**：24+ 个文件修复（四轮修复）
- **04_Fusion_Area**：10 个文件修复（全部清零）

### 修复类别

| 类别 | 影响文件数 | 修复方式 |
|------|-----------|---------|
| 标题乱码（# ??????·听力原文·） | ~20 | 正则匹配替换为正确中文标题 |
| U+FFFD 替换字符（英文段落） | ~15 | 根据上下文重建正确英文内容 |
| 翻译段落乱码（中文 OCR 损坏） | ~10 | 从对应 Analysis/Question 文件恢复 |
| CET4_2021.12 深度 OCR 损坏 | 3 | 部分修复（Part/Section 标题+词汇表），深度损坏内容无法恢复 |
| 04区 Part 导出继承乱码 | 10 | 同步修复（内容与 03区一致） |

### 无法自动修复的内容
- CET4_2021.12_Set1/2/3 Analysis 文件有约 150+ 行深度 OCR 损坏（完全不可读的乱码），原始数据源缺失，需人工重新 OCR 或寻找替代数据源

### 扫描脚本
- `scripts/scan-garbled-precise.js` — 02/03区乱码扫描
- `scripts/scan-04-garbled.js` — 04区乱码扫描
- `scripts/fix-garbled.js` — 第一轮修复（标题+内容）
- `scripts/fix-garbled-02.js` — 02区修复
- `scripts/fix-garbled-v2.js` — 残留标题修复
- `scripts/fix-garbled-v3.js` — 散点 U+FFFD 修复
- `scripts/fix-garbled-final.js` — 最终修复（CET4_2021.12 + 词汇）
- `scripts/fix-garbled-04.js` + `v2` + `v3` — 04区修复
