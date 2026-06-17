"""
Convert PDFs to Markdown using MinerU.
Run with: D:\MinerU_Project\.venv\Scripts\python.exe _run_mineru.py
"""
import sys
import os
import json

# Add MinerU venv site-packages
sys.path.insert(0, r'D:\MinerU_Project\.venv\Lib\site-packages')

DATA_DIR = r'D:\my-ai-Project\data'
OUTPUT_DIR = r'D:\my-ai-Project\data\03_Exam_Final'

# PDF mapping
pdf_map = [
    {"pdf": "2022.06四级真题第3套.pdf", "target": "CET4/Question/CET4_2022.06_Set3_纯真题.md", "type": "Question", "exam": "CET4", "setId": "CET4_2022_06_S3"},
    {"pdf": "2022.06四级解析第3套.pdf", "target": "CET4/Analysis/CET4_2022.06_Set3_纯解析.md", "type": "Analysis", "exam": "CET4", "setId": "CET4_2022_06_S3"},
    {"pdf": "2022.06六级真题第3套.pdf", "target": "CET6/Question/CET6_2022.06_Set3_纯真题.md", "type": "Question", "exam": "CET6", "setId": "CET6_2022_06_S3"},
    {"pdf": "2022.06六级解析第3套.pdf", "target": "CET6/Analysis/CET6_2022.06_Set3_纯解析.md", "type": "Analysis", "exam": "CET6", "setId": "CET6_2022_06_S3"},
    {"pdf": "2022年12月4级真题 (3).pdf", "target": "CET4/Question/CET4_2022.12_Set3_纯真题.md", "type": "Question", "exam": "CET4", "setId": "CET4_2022_12_S3"},
    {"pdf": "2024年06月六级考试真题答案速查（第1套）.pdf", "target": "CET6/Analysis/CET6_2024.06_Set1_纯解析.md", "type": "Analysis", "exam": "CET6", "setId": "CET6_2024_06_S1"},
    {"pdf": "2024年06月六级考试真题答案速查（第2套）.pdf", "target": "CET6/Analysis/CET6_2024.06_Set2_纯解析.md", "type": "Analysis", "exam": "CET6", "setId": "CET6_2024_06_S2"},
    {"pdf": "2024年06月六级考试真题答案速查（第3套）.pdf", "target": "CET6/Analysis/CET6_2024.06_Set3_纯解析.md", "type": "Analysis", "exam": "CET6", "setId": "CET6_2024.06_Set3"},
]

def main():
    try:
        from mineru.cli.common import do_parse
        print("MinerU imported successfully")
    except ImportError as e:
        print(f"Failed to import MinerU: {e}")
        print("Trying alternative import...")
        try:
            from mineru import convert_pdf_to_markdown
            print("Alternative import OK")
        except ImportError as e2:
            print(f"Alternative import also failed: {e2}")
            # List available mineru modules
            import mineru
            print("mineru dir:", dir(mineru))
            return

    results = []
    for item in pdf_map:
        pdf_path = os.path.join(DATA_DIR, item["pdf"])
        if not os.path.exists(pdf_path):
            print(f"[SKIP] {item['pdf']} - not found")
            continue

        print(f"[CONVERT] {item['pdf']}")
        try:
            # Use MinerU to extract
            output_dir = os.path.join(DATA_DIR, "_mineru_output", item["setId"])
            os.makedirs(output_dir, exist_ok=True)

            do_parse(pdf_path, output_dir)

            # Find the output markdown
            md_files = []
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    if f.endswith('.md'):
                        md_files.append(os.path.join(root, f))

            if md_files:
                # Read and concatenate
                content = ""
                for md_file in sorted(md_files):
                    with open(md_file, 'r', encoding='utf-8') as fh:
                        content += fh.read() + "\n\n"

                # Write to 03区
                target_path = os.path.join(OUTPUT_DIR, item["target"])
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, 'w', encoding='utf-8') as fh:
                    fh.write(content)

                print(f"  OK: {len(content)} chars -> {item['target']}")
                results.append({"pdf": item["pdf"], "chars": len(content), "target": item["target"], "status": "ok"})
            else:
                print(f"  WARN: No markdown output found")
                results.append({"pdf": item["pdf"], "status": "no_output"})

        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({"pdf": item["pdf"], "status": "error", "error": str(e)})

    # Save report
    report_path = os.path.join(DATA_DIR, "mineru-report.json")
    with open(report_path, 'w', encoding='utf-8') as fh:
        json.dump(results, fh, ensure_ascii=False, indent=2)
    print(f"\nReport: {report_path}")

if __name__ == "__main__":
    main()
