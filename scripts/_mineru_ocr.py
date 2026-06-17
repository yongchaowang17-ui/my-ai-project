import sys, os, json
sys.path.insert(0, r'D:\MinerU_Project\.venv\Lib\site-packages')
from mineru.cli.common import do_parse

DATA_DIR = r'D:\my-ai-Project\data'
OUTPUT_DIR = r'D:\my-ai-Project\data\03_Exam_Final'

pdf_map = [
    {"pdf": "2022.06四级真题第3套.pdf", "target": "CET4/Question/CET4_2022.06_Set3_纯真题.md", "exam": "CET4", "setId": "CET4_2022_06_S3"},
    {"pdf": "2022.06四级解析第3套.pdf", "target": "CET4/Analysis/CET4_2022.06_Set3_纯解析.md", "exam": "CET4", "setId": "CET4_2022_06_S3"},
    {"pdf": "2022.06六级真题第3套.pdf", "target": "CET6/Question/CET6_2022.06_Set3_纯真题.md", "exam": "CET6", "setId": "CET6_2022_06_S3"},
    {"pdf": "2022.06六级解析第3套.pdf", "target": "CET6/Analysis/CET6_2022.06_Set3_纯解析.md", "exam": "CET6", "setId": "CET6_2022_06_S3"},
    {"pdf": "2022年12月4级真题 (3).pdf", "target": "CET4/Question/CET4_2022.12_Set3_纯真题.md", "exam": "CET4", "setId": "CET4_2022_12_S3"},
]

results = []
for item in pdf_map:
    pdf_path = os.path.join(DATA_DIR, item["pdf"])
    if not os.path.exists(pdf_path):
        print(f"[SKIP] {item['pdf']}")
        continue
    print(f"\n[OCR] {item['pdf']}")
    try:
        output_dir = os.path.join(DATA_DIR, "_mineru_output", item["setId"])
        os.makedirs(output_dir, exist_ok=True)
        pdf_bytes = [open(pdf_path, 'rb').read()]
        pdf_names = [item["pdf"]]

        do_parse(output_dir, pdf_names, pdf_bytes, ["ch"], f_dump_md=True, f_dump_orig_pdf=False, f_dump_middle_json=False, f_dump_model_output=False, f_dump_content_list=False, f_draw_layout_bbox=False, f_draw_span_bbox=False)

        md_files = []
        for root, dirs, files in os.walk(output_dir):
            for f in files:
                if f.endswith('.md') and 'auto' not in f.lower():
                    md_files.append(os.path.join(root, f))

        if md_files:
            content = ""
            for mf in sorted(md_files):
                with open(mf, 'r', encoding='utf-8') as fh:
                    content += fh.read() + "\n\n"
            target_path = os.path.join(OUTPUT_DIR, item["target"])
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, 'w', encoding='utf-8') as fh:
                fh.write(content)
            print(f"  OK: {len(content)} chars -> {item['target']}")
            results.append({"pdf": item["pdf"], "chars": len(content), "status": "ok"})
        else:
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    print(f"    Found: {f}")
            results.append({"pdf": item["pdf"], "status": "no_output"})
    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback; traceback.print_exc()
        results.append({"pdf": item["pdf"], "status": "error", "error": str(e)})

with open(os.path.join(DATA_DIR, "mineru-ocr-report.json"), 'w', encoding='utf-8') as fh:
    json.dump(results, fh, ensure_ascii=False, indent=2)
print("\nDone!")