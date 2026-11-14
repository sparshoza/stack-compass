import json
import shutil
from pathlib import Path

from compassdata.compile import compile_catalog, main, render

FIXTURES = Path(__file__).parent / "fixtures"
NL = chr(10)


def test_catalog_shape_and_order():
    cat = compile_catalog(FIXTURES)
    assert set(cat) == {"layers", "edgeTypes", "vocab", "keywords", "tools"}
    ids = [t["id"] for t in cat["tools"]]
    assert ids == sorted(ids)
    assert cat["layers"][0] == "backend"
    assert "alternative-to" in cat["edgeTypes"]
    assert cat["tools"][0]["verified"] == "2026-11-14"


def test_render_is_sorted_lf_with_trailing_newline():
    text = render(compile_catalog(FIXTURES))
    assert text.endswith("}\n") and "\r" not in text
    assert text == json.dumps(json.loads(text), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def test_check_flags_stale(tmp_path: Path):
    data = tmp_path / "data"
    shutil.copytree(FIXTURES, data)
    out = tmp_path / "catalog.json"
    assert main(["--data", str(data), "--out", str(out)]) == 0
    assert main(["--check", "--data", str(data), "--out", str(out)]) == 0
    out.write_text("{}\n", encoding="utf-8")
    assert main(["--check", "--data", str(data), "--out", str(out)]) == 1


def test_catalog_omits_tool_defaults(tmp_path: Path):
    data = tmp_path / "data"
    shutil.copytree(FIXTURES, data)
    cat = compile_catalog(data)
    react = next(t for t in cat["tools"] if t["id"] == "react")
    for key in ("uses", "scale", "runs_in_app", "needs_web_frontend", "match_name"):
        assert key not in react, key
    assert react["edges"] and "repo" in react


def test_catalog_keeps_values_that_differ_from_defaults(tmp_path: Path):
    data = tmp_path / "data"
    shutil.copytree(FIXTURES, data)
    path = data / "tools" / "database" / "postgres.yaml"
    path.write_text(
        path.read_text(encoding="utf-8")
        + NL.join(["uses: [app-data]", "scale: single", "runs_in_app: true", "match_name: false", ""]),
        encoding="utf-8",
    )
    pg = next(t for t in compile_catalog(data)["tools"] if t["id"] == "postgres")
    assert pg["uses"] == ["app-data"] and pg["scale"] == "single"
    assert pg["runs_in_app"] is True and pg["match_name"] is False
