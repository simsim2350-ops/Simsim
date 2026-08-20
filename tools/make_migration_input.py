#!/usr/bin/env python3
"""Create a manus-mcp-cli input file from a reviewed migration SQL file."""
from __future__ import annotations

import json
import sys
from pathlib import Path

if len(sys.argv) != 5:
    raise SystemExit("usage: make_migration_input.py <project_id> <migration_name> <sql_file> <output_json>")

project_id, migration_name, sql_path, output_path = sys.argv[1:]
query = Path(sql_path).read_text(encoding="utf-8")
if not query.strip().lower().startswith("--"):
    raise SystemExit("migration file must be a reviewed SQL source file")

Path(output_path).write_text(
    json.dumps({"project_id": project_id, "name": migration_name, "query": query}, ensure_ascii=False),
    encoding="utf-8",
)
