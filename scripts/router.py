#!/usr/bin/env python3
"""
File Sorting Router for Exam Data Pipeline

Scans data/raw/ for .md files and classifies them into data/routing/ subdirectories
based on content analysis (not filename).

Usage:
    python scripts/router.py [--dry-run]

Categories:
    raw_questions  - Contains question numbers but no answer/analysis sections
    raw_analysis   - Contains answer/analysis sections but no question numbers
    mixed          - Contains both question numbers and answer/analysis sections
    multi_set      - Contains 3+ Part headers (multi-set exam papers)
    uncategorized  - Does not match any of the above
"""

import os
import re
import sys
import shutil
from pathlib import Path

# ===== Configuration =====

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
RAW_DIR = PROJECT_ROOT / 'data' / 'raw'
ROUTING_DIR = PROJECT_ROOT / 'data' / 'routing'

# Question pattern: number + dot/comma + letter choice (A/B/C/D)
QUESTION_RE = re.compile(r'\d+[.、]\s*[A-D][)）]', re.MULTILINE)

# Analysis section headers (not just instruction mentions)
ANALYSIS_SECTION_RE = re.compile(
    r'[#＃]\s*(答案|解析|详解|参考范文|Answer\s*Key|参考答案|答案与详解|答案及解析)',
    re.IGNORECASE | re.MULTILINE
)

# Answer blocks: numbered answers with colon
ANSWER_BLOCK_RE = re.compile(
    r'(?:^|\n)\s*(?:【?\d+】?\s*)?(?:答案|解析|详解)\s*[：:]',
    re.MULTILINE
)

# Part headers for multi-set detection
PART_RE = re.compile(
    r'Part\s+(I{1,3}|IV|V|1|2|3|4|5)',
    re.IGNORECASE | re.MULTILINE
)

CATEGORIES = ['multi_set', 'mixed', 'raw_questions', 'raw_analysis', 'uncategorized']


def classify_file(content):
    """Classify a file based on its content."""
    # 1. Multi-set: 3+ Part headers
    parts = PART_RE.findall(content)
    if len(parts) >= 3:
        return 'multi_set'

    # 2. Question numbers: require at least 3 questions
    question_matches = QUESTION_RE.findall(content)
    has_questions = len(question_matches) >= 3

    # 3. Analysis sections: require 2+ section headers or 3+ answer blocks
    analysis_sections = ANALYSIS_SECTION_RE.findall(content)
    answer_blocks = ANSWER_BLOCK_RE.findall(content)
    has_analysis = len(analysis_sections) >= 2 or len(answer_blocks) >= 3

    if has_questions and has_analysis:
        return 'mixed'
    elif has_questions:
        return 'raw_questions'
    elif has_analysis:
        return 'raw_analysis'
    else:
        return 'uncategorized'


def ensure_dirs():
    """Create routing subdirectories."""
    for cat in CATEGORIES:
        (ROUTING_DIR / cat).mkdir(parents=True, exist_ok=True)


def safe_move(src, dst):
    """Safely move a file, handling name collisions."""
    if dst.exists():
        stem = dst.stem
        suffix = dst.suffix
        counter = 1
        while dst.exists():
            dst = dst.parent / f'{stem}_{counter}{suffix}'
            counter += 1
    shutil.move(str(src), str(dst))
    return dst


def run(dry_run=False):
    """Main routing logic."""
    if not RAW_DIR.exists():
        print(f'Error: raw directory not found: {RAW_DIR}')
        sys.exit(1)

    if not dry_run:
        ensure_dirs()

    md_files = sorted(RAW_DIR.glob('*.md'))
    if not md_files:
        print(f'No .md files found in {RAW_DIR}')
        return

    print(f'Found {len(md_files)} .md files in {RAW_DIR}')
    print(f'Mode: {"DRY RUN" if dry_run else "LIVE"}')
    print('=' * 60)

    stats = {cat: [] for cat in CATEGORIES}

    for md_file in md_files:
        try:
            content = md_file.read_text(encoding='utf-8')
        except Exception as e:
            print(f'  [ERROR] Cannot read {md_file.name}: {e}')
            stats['uncategorized'].append(md_file.name)
            continue

        category = classify_file(content)
        dest = ROUTING_DIR / category / md_file.name

        if dry_run:
            print(f'  [DRY] {md_file.name} -> {category}/')
        else:
            final_path = safe_move(md_file, dest)
            print(f'  [MOVE] {md_file.name} -> {category}/{final_path.name}')

        stats[category].append(md_file.name)

    # Print summary
    print('=' * 60)
    print('Classification Summary:')
    print('-' * 60)
    total = 0
    for cat in CATEGORIES:
        count = len(stats[cat])
        total += count
        print(f'  {cat:20s}: {count:3d} files')
    print('-' * 60)
    print(f'  {"TOTAL":20s}: {total:3d} files')
    print('=' * 60)


if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    run(dry_run=dry_run)
