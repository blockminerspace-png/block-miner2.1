#!/usr/bin/env python3
"""Replace console.* calls with proper logger calls in server TypeScript files."""

import re
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent.parent / "server"

CONSOLE_RE = re.compile(r'\bconsole\.(log|warn|error|debug)\b')

# Map console.* level to logger level
LEVEL_MAP = {"log": "info", "warn": "warn", "error": "error", "debug": "debug"}


def has_logger(content: str) -> bool:
    return "loggerLib" in content or "from '../utils/logger" in content or 'from "../../utils/logger' in content or "logger" in content and "loggerLib" in content


def find_import_block_end(lines: list[str]) -> int:
    """Return the 0-based line index of the first line AFTER all top-level import statements."""
    i = 0
    last_import_end = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped.startswith("import "):
            # Count braces to handle multi-line imports
            open_braces = lines[i].count("{") - lines[i].count("}")
            j = i
            while open_braces > 0 and j + 1 < len(lines):
                j += 1
                open_braces += lines[j].count("{") - lines[j].count("}")
            last_import_end = j + 1
            i = j + 1
        elif stripped == "" or stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
            i += 1
        else:
            break
    return last_import_end


def compute_logger_name(filepath: Path) -> str:
    # Use the stem of the file as logger child name
    return filepath.stem


def compute_relative_logger_path(filepath: Path) -> str:
    """Compute relative path from file to server/utils/logger.js"""
    depth = len(filepath.relative_to(ROOT).parts) - 1
    prefix = "../" * depth if depth > 0 else "./"
    return f"{prefix}utils/logger.js"


def process_file(filepath: Path) -> bool:
    content = filepath.read_text(encoding="utf-8")

    if not CONSOLE_RE.search(content):
        return False

    lines = content.splitlines(keepends=True)

    # Determine logger name and import path
    logger_name = compute_logger_name(filepath)
    rel_path = compute_relative_logger_path(filepath)

    logger_import = f'import loggerLib from "{rel_path}";\n'
    logger_const = f'const logger = loggerLib.child("{logger_name}");\n'

    already_has_logger = "loggerLib" in content

    # Replace console.* calls
    new_lines = []
    for line in lines:
        new_line = CONSOLE_RE.sub(lambda m: f"logger.{LEVEL_MAP[m.group(1)]}", line)
        new_lines.append(new_line)

    # Insert logger import/const if not already present
    if not already_has_logger:
        insert_at = find_import_block_end(new_lines)
        # Insert after imports block
        insertion = ["\n", logger_import, logger_const]
        new_lines = new_lines[:insert_at] + insertion + new_lines[insert_at:]

    new_content = "".join(new_lines)
    filepath.write_text(new_content, encoding="utf-8")
    return True


def main():
    files = sorted(ROOT.rglob("*.ts"))
    files = [f for f in files if "node_modules" not in str(f) and not f.name.endswith(".d.ts")]

    changed = []
    for f in files:
        try:
            if process_file(f):
                changed.append(f)
                print(f"  fixed: {f.relative_to(ROOT.parent)}")
        except Exception as e:
            print(f"  ERROR {f}: {e}", file=sys.stderr)

    print(f"\nDone: {len(changed)} files modified.")


if __name__ == "__main__":
    main()
