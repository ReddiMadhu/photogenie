#!/usr/bin/env python3
"""Validate governance example JSON documents against Draft 2020-12 schemas.

Requires: pip install jsonschema
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    print("Missing dependency: pip install jsonschema", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "packages" / "schemas"
EXAMPLE_DIR = ROOT / "config" / "governance" / "examples"

PAIRS = [
    ("policy/purpose_codes.schema.json", "purpose_codes.example.json"),
    ("policy/jurisdiction_profile.schema.json", "jurisdiction_us_il.example.json"),
    ("policy/jurisdiction_profile.schema.json", "jurisdiction_deny_default.example.json"),
    ("policy/tenant_policy.schema.json", "tenant_policy.example.json"),
    ("policy/model_bom.schema.json", "model_bom_arcface.example.json"),
    ("policy/retention_rule.schema.json", "retention_face_embedding.example.json"),
    ("audit/audit_event.schema.json", "audit_event_search_denied.example.json"),
    ("governance/release_gate_status.schema.json", "release_gate_status.example.json"),
]


def load_json(path: Path) -> object:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    failures = 0
    for schema_rel, example_rel in PAIRS:
        schema_path = SCHEMA_DIR / schema_rel
        example_path = EXAMPLE_DIR / example_rel
        schema = load_json(schema_path)
        instance = load_json(example_path)
        validator = Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(instance), key=lambda e: e.path)
        if errors:
            failures += 1
            print(f"FAIL {example_rel} :: {schema_rel}")
            for err in errors:
                path = ".".join(str(p) for p in err.path) or "<root>"
                print(f"  - {path}: {err.message}")
        else:
            print(f"OK   {example_rel}")
    if failures:
        print(f"\n{failures} example(s) failed validation", file=sys.stderr)
        return 1
    print("\nAll governance examples validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
