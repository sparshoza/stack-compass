"""Compile data/ into catalog/catalog.json. `--check` exits 1 when the file is stale."""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .load import KbError, load_kb
from .models import EDGE_TYPES, LAYERS

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = ROOT / "data"
DEFAULT_OUT = ROOT / "catalog" / "catalog.json"


# Tool fields left out of the catalog when they hold their default; web/src/lib/kb.ts
# puts the same defaults back.
OMIT_DEFAULTS: dict[str, Any] = {
    "uses": [],
    "scale": None,
    "runs_in_app": False,
    "needs_web_frontend": False,
    "serves_backend": False,
    "match_name": True,
}


def _tool_json(tool: Any) -> dict[str, Any]:
    data = tool.model_dump(mode="json")
    return {k: v for k, v in data.items() if k not in OMIT_DEFAULTS or v != OMIT_DEFAULTS[k]}


def compile_catalog(data_dir: Path) -> dict[str, Any]:
    kb = load_kb(data_dir)
    return {
        "layers": list(LAYERS),
        "edgeTypes": list(EDGE_TYPES),
        "vocab": kb.vocab.model_dump(mode="json"),
        "keywords": [k.model_dump(mode="json") for k in kb.keywords],
        "tools": [_tool_json(kb.tools[i]) for i in sorted(kb.tools)],
    }


def render(catalog: dict[str, Any]) -> str:
    return json.dumps(catalog, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="compassdata.compile")
    parser.add_argument("--check", action="store_true", help="exit 1 if the catalog is stale")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    try:
        text = render(compile_catalog(args.data))
    except KbError as e:
        for err in e.errors:
            print(err, file=sys.stderr)
        return 1
    if args.check:
        current = args.out.read_text(encoding="utf-8") if args.out.exists() else None
        if current != text:
            print(f"{args.out} is stale, run: uv run python -m compassdata.compile", file=sys.stderr)
            return 1
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
