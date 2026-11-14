import shutil
from pathlib import Path

import pytest
import yaml

from compassdata.load import KbError, load_kb
from compassdata.models import LAYERS, KnowledgeBase

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def kb_dir(tmp_path: Path) -> Path:
    dest = tmp_path / "data"
    shutil.copytree(FIXTURES, dest)
    return dest


def edit_yaml(path: Path, fn) -> None:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    fn(doc)
    path.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")


def edit_tool(kb_dir: Path, layer: str, tool_id: str, fn) -> None:
    edit_yaml(kb_dir / "tools" / layer / f"{tool_id}.yaml", fn)


def errors_of(kb_dir: Path) -> list[str]:
    with pytest.raises(KbError) as exc:
        load_kb(kb_dir)
    return exc.value.errors


def test_layers_are_the_spec_22_in_scoring_order():
    assert LAYERS == [
        "backend", "frontend", "meta-framework", "mobile", "database", "orm", "api-style",
        "auth", "cache", "jobs-queue", "search", "storage", "payments", "email", "cms",
        "state", "ui-kit", "build-tool", "hosting", "ci-cd", "observability", "testing",
    ]


def test_loads_fixture():
    kb = load_kb(FIXTURES)
    assert isinstance(kb, KnowledgeBase)
    assert set(kb.tools) == {"react", "preact", "fastapi", "postgres"}
    assert kb.tools["react"].edges[0].target == "preact"
    assert kb.vocab.project_types[0].core_layers == ["frontend", "backend", "database"]
    assert len(kb.keywords) == 3


def test_rejects_unknown_layer(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(layer="nonsense"))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "layer" in e for e in errs)


def test_rejects_layer_not_matching_folder(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(layer="backend"))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "folder" in e for e in errs)


def test_rejects_id_not_matching_filename(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(id="reactjs2"))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "filename" in e for e in errs)


def test_rejects_unknown_tag(kb_dir):
    edit_tool(kb_dir, "backend", "fastapi", lambda d: d.update(tags=["telepathy"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/backend/fastapi.yaml") and "telepathy" in e for e in errs)


def test_rejects_unknown_language(kb_dir):
    edit_tool(kb_dir, "backend", "fastapi", lambda d: d.update(languages=["cobol"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/backend/fastapi.yaml") and "cobol" in e for e in errs)


def test_rejects_missing_edge_target(kb_dir):
    edit_tool(
        kb_dir,
        "frontend",
        "react",
        lambda d: d.update(edges=[{"type": "built-on", "target": "ghost"}]),
    )
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "ghost" in e for e in errs)


def test_rejects_one_sided_alternative_and_pairs_with(kb_dir):
    edit_tool(kb_dir, "frontend", "preact", lambda d: d.update(edges=[]))
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(edges=[]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "alternative-to" in e for e in errs)
    assert any(e.startswith("tools/backend/fastapi.yaml") and "pairs-with" in e for e in errs)


def test_rejects_summary_over_140(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(summary="x" * 141))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "summary" in e for e in errs)


def test_accepts_summary_of_exactly_140(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(summary="x" * 140))
    load_kb(kb_dir)


def test_rejects_bad_verified_date(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(verified="2026-13-45"))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "verified" in e for e in errs)


def test_rejects_future_verified_date(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(verified="2999-01-01"))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "future" in e for e in errs)


def test_rejects_url_missing_from_sources(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(sources=["https://other.example"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "sources" in e for e in errs)


def test_rejects_empty_pricing_and_bad_maturity(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(pricing=[], maturity="ancient"))
    errs = errors_of(kb_dir)
    assert any("pricing" in e for e in errs)
    assert any("maturity" in e for e in errs)


def test_rejects_too_many_good_for(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(good_for=["a", "b", "c", "d"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "good_for" in e for e in errs)


def test_rejects_duplicate_phrase_across_keyword_entries(kb_dir):
    edit_yaml(kb_dir / "keywords.yaml", lambda doc: doc[1]["phrases"].append("  Chat "))
    errs = errors_of(kb_dir)
    assert any(e.startswith("keywords.yaml") and "chat" in e.lower() for e in errs)


def test_rejects_alias_colliding_with_other_tool(kb_dir):
    edit_tool(kb_dir, "frontend", "preact", lambda d: d.update(aliases=["React"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/preact.yaml") and "react" in e.lower() for e in errs)


def test_rejects_project_type_with_unknown_core_layer(kb_dir):
    edit_yaml(
        kb_dir / "vocab.yaml",
        lambda d: d["project_types"][0].update(core_layers=["frontend", "warehouse"]),
    )
    errs = errors_of(kb_dir)
    assert any(e.startswith("vocab.yaml") and "warehouse" in e for e in errs)


def test_rejects_bad_capability_layers_and_tooling_layers(kb_dir):
    def bad(d):
        d["capability_layers"] = {"nocap": ["search"], "realtime": ["nolayer"]}
        d["tooling_layers"] = ["nolayer2"]

    edit_yaml(kb_dir / "vocab.yaml", bad)
    errs = errors_of(kb_dir)
    assert any("nocap" in e for e in errs)
    assert any("nolayer" in e and "capability_layers" in e for e in errs)
    assert any("nolayer2" in e for e in errs)


def test_rejects_keyword_with_unknown_set_values(kb_dir):
    edit_yaml(kb_dir / "keywords.yaml", lambda doc: doc[0]["sets"].update(capabilities=["nope"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("keywords.yaml") and "nope" in e for e in errs)


def test_reports_all_errors_at_once(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(summary="x" * 200))
    edit_tool(kb_dir, "backend", "fastapi", lambda d: d.update(tags=["telepathy"]))
    edit_yaml(
        kb_dir / "vocab.yaml",
        lambda d: d["project_types"][0].update(core_layers=["warehouse"]),
    )
    errs = errors_of(kb_dir)
    files = {e.split(":")[0] for e in errs}
    assert {"tools/frontend/react.yaml", "tools/backend/fastapi.yaml", "vocab.yaml"} <= files


def test_rejects_duplicate_vocab_languages(kb_dir):
    edit_yaml(kb_dir / "vocab.yaml", lambda d: d["languages"].append("Python "))
    errs = errors_of(kb_dir)
    assert any(e.startswith("vocab.yaml") and "duplicate language" in e for e in errs)
