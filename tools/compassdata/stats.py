"""Print catalog size: tools per layer (in scoring order), total tools and keyword entries."""

import argparse
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from .load import KbError, load_kb
from .models import LAYERS

DATA = Path(__file__).resolve().parents[2] / "data"


def catalog_stats(data_dir: Path) -> dict[str, Any]:
    kb = load_kb(data_dir)
    counts = Counter(t.layer for t in kb.tools.values())
    return {
        "layers": {layer: counts[layer] for layer in LAYERS if counts[layer]},
        "total": len(kb.tools),
        "keywords": len(kb.keywords),
    }


def render_stats(stats: dict[str, Any]) -> str:
    width = max(len(layer) for layer in [*stats["layers"], "keyword entries"])
    lines = [f"{layer:<{width}}  {n:>3}" for layer, n in stats["layers"].items()]
    lines.append(f"{'total':<{width}}  {stats['total']:>3}")
    lines.append(f"{'keyword entries':<{width}}  {stats['keywords']:>3}")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="compassdata.stats")
    parser.add_argument("--data", type=Path, default=DATA)
    args = parser.parse_args(argv)
    try:
        stats = catalog_stats(args.data)
    except KbError as e:
        for err in e.errors:
            print(err, file=sys.stderr)
        return 1
    sys.stdout.write(render_stats(stats))
    return 0


if __name__ == "__main__":
    sys.exit(main())
