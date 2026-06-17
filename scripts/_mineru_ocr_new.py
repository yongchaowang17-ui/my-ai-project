"""
MinerU OCR: 处理新增的6个PDF
- 2021.06 六级真题+解析 (3套) → CET6 Question + Analysis
- 2021.12 四级真题 (3套) → CET4 Question
"""
import sys, os, json

sys.path.insert(0, r'D:\MinerU_Project\.venv\Lib\site-packages')
from mineru.cli.common import do_parse

DATA_DIR = r'D:\my-ai-Project\data'
OUTPUT_DIR = r'D:\my-ai-Project\data\03_Exam_Final'

# 逐个处理避免 Windows multiprocessing 问题
pdf_map = [
    # CET6 2021.06 真题+解析合订本 → 拆分为 Question 和 Analysis
    {
        "pdf": "2021.06六级真题+解析第1套.pdf",
        "setId": "CET6_2021_06_S1",
        "exam": "CET6",
        "targets": [
            {"type": "Question", "path": "CET6/Question/CET6_2021.06_Set1_纯真题.md"},
            {"type": "Analysis", "path": "CET6/Analysis/CET6_2021.06_Set1_纯解析.md"},
        ]
    },
    {
        "pdf": "2021.06六级真题+解析第2套.pdf",
        "setId": "CET6_2021_06_S2",
        "exam": "CET6",
        "targets": [
            {"type": "Question", "path": "CET6/Question/CET6_2021.06_Set2_纯真题.md"},
            {"type": "Analysis", "path": "CET6/Analysis/CET6_2021.06_Set2_纯解析.md"},
        ]
    },
    {
        "pdf": "2021.06六级真题+解析第3套.pdf",
        "setId": "CET6_2021_06_S3",
        "exam": "CET6",
        "targets": [
            {"type": "Question", "path": "CET6/Question/CET6_2021.06_Set3_纯真题.md"},
            {"type": "Analysis", "path": "CET6/Analysis/CET6_2021.06_Set3_纯解析.md"},
        ]
    },
    # CET4 2021.12 真题
    {
        "pdf": "2021年12月大学英语4级（卷一）.pdf",
        "setId": "CET4_2021_12_S1",
        "exam": "CET4",
        "targets": [
            {"type": "Question", "path": "CET4/Question/CET4_2021.12_Set1_纯真题.md"},
        ]
    },
    {
        "pdf": "2021年12月大学英语4级（卷二）.pdf",
        "setId": "CET4_2021_12_S2",
        "exam": "CET4",
        "targets": [
            {"type": "Question", "path": "CET4/Question/CET4_2021.12_Set2_纯真题.md"},
        ]
    },
    {
        "pdf": "2021年12月大学英语4级（卷三）.pdf",
        "setId": "CET4_2021_12_S3",
        "exam": "CET4",
        "targets": [
            {"type": "Question", "path": "CET4/Question/CET4_2021.12_Set3_纯真题.md"},
        ]
    },
]

results = []

for item in pdf_map:
    pdf_path = os.path.join(DATA_DIR, item["pdf"])
    if not os.path.exists(pdf_path):
        print(f"[SKIP] {item['pdf']} not found")
        continue

    print(f"\n{'='*60}")
    print(f"[OCR] {item['pdf']} ({os.path.getsize(pdf_path) / 1024 / 1024:.1f} MB)")
    print(f"  SetId: {item['setId']}")

    output_dir = os.path.join(DATA_DIR, "_mineru_output", item["setId"])
    os.makedirs(output_dir, exist_ok=True)

    try:
        pdf_bytes = [open(pdf_path, 'rb').read()]
        pdf_names = [item["pdf"]]

        do_parse(
            output_dir, pdf_names, pdf_bytes, ["ch"],
            f_dump_md=True, f_dump_orig_pdf=False,
            f_dump_middle_json=False, f_dump_model_output=False,
            f_dump_content_list=False, f_draw_layout_bbox=False,
            f_draw_span_bbox=False
        )

        # 收集输出的 Markdown 文件
        md_content = ""
        for root, dirs, files in os.walk(output_dir):
            for f in sorted(files):
                if f.endswith('.md') and 'auto' not in f.lower():
                    with open(os.path.join(root, f), 'r', encoding='utf-8') as fh:
                        md_content += fh.read() + "\n\n"

        if not md_content.strip():
            print(f"  WARNING: MinerU 未生成有效内容")
            results.append({"pdf": item["pdf"], "status": "empty"})
            continue

        print(f"  OCR提取: {len(md_content)} 字符")
        
        # 对于合订本（真题+解析），尝试按关键词拆分
        if len(item["targets"]) > 1 and "真题+解析" in item["pdf"]:
            # 合订本拆分：查找解析/答案的分界线
            split_markers = [
                "答案与详解", "参考答案与解析", "答案及解析", "答案与解析",
                "参考答案", "Answers", "Answer Key",
                "# Part I Writing", "# 写作",
            ]
            
            # 尝试找到拆分点
            split_pos = -1
            lower_content = md_content.lower()
            
            # 先找"答案与解析"类标题
            for marker in ["答案与详解", "参考答案与解析", "答案及解析", "答案与解析", "参考答案"]:
                idx = md_content.find(marker)
                if idx > 0:
                    split_pos = idx
                    break
            
            if split_pos > 0:
                question_content = md_content[:split_pos].strip()
                analysis_content = md_content[split_pos:].strip()
                print(f"  拆分: Question={len(question_content)} chars, Analysis={len(analysis_content)} chars")
            else:
                # 无法拆分，全部作为 Question
                question_content = md_content.strip()
                analysis_content = ""
                print(f"  未能找到拆分点，全部作为 Question ({len(question_content)} chars)")

            for target in item["targets"]:
                target_path = os.path.join(OUTPUT_DIR, target["path"])
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                
                if target["type"] == "Question" and question_content:
                    with open(target_path, 'w', encoding='utf-8') as fh:
                        fh.write(question_content)
                    print(f"  -> 写入 {target['path']} ({len(question_content)} chars)")
                elif target["type"] == "Analysis" and analysis_content:
                    with open(target_path, 'w', encoding='utf-8') as fh:
                        fh.write(analysis_content)
                    print(f"  -> 写入 {target['path']} ({len(analysis_content)} chars)")
                else:
                    print(f"  -> 跳过 {target['type']} (无内容)")

            results.append({
                "pdf": item["pdf"],
                "status": "ok",
                "chars": len(md_content),
                "split": True,
                "question_chars": len(question_content),
                "analysis_chars": len(analysis_content),
            })
        else:
            # 单一目标，直接写入
            for target in item["targets"]:
                target_path = os.path.join(OUTPUT_DIR, target["path"])
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, 'w', encoding='utf-8') as fh:
                    fh.write(md_content.strip())
                print(f"  -> 写入 {target['path']} ({len(md_content)} chars)")

            results.append({
                "pdf": item["pdf"],
                "status": "ok",
                "chars": len(md_content),
            })

    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()
        results.append({"pdf": item["pdf"], "status": "error", "error": str(e)})

# 保存报告
report_path = os.path.join(DATA_DIR, "mineru-ocr-report-new.json")
with open(report_path, 'w', encoding='utf-8') as fh:
    json.dump(results, fh, ensure_ascii=False, indent=2)

print(f"\n{'='*60}")
print(f"完成! 共处理 {len(results)} 个PDF")
ok_count = sum(1 for r in results if r["status"] == "ok")
print(f"成功: {ok_count}, 失败: {len(results) - ok_count}")
print(f"报告: {report_path}")
