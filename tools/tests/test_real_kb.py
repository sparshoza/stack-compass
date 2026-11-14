from collections import Counter
from pathlib import Path

from compassdata.compile import compile_catalog, render
from compassdata.load import load_kb

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CATALOG = ROOT / "catalog" / "catalog.json"

SPEC_CORE = {
    "web-app": "frontend meta-framework ui-kit backend database orm auth hosting",
    "content-site": "frontend meta-framework ui-kit cms hosting",
    "api-only": "backend api-style database orm auth hosting",
    "mobile-app": "mobile backend database orm auth hosting",
    "realtime-app": "frontend meta-framework ui-kit backend database cache auth hosting",
    "internal-tool": "frontend ui-kit backend database orm auth hosting",
    "ecommerce": "frontend meta-framework ui-kit backend database orm auth payments email hosting",
    "saas": (
        "frontend meta-framework ui-kit backend database orm auth payments email "
        "jobs-queue hosting"
    ),
}
SPEC_CAP_LAYERS = {
    "full-text-search": ["search"],
    "file-uploads": ["storage"],
    "payments": ["payments"],
    "transactional-email": ["email"],
    "background-jobs": ["jobs-queue"],
    "scheduled-jobs": ["jobs-queue"],
    "content-editing": ["cms"],
    "realtime": ["cache"],
    "native-mobile": ["mobile"],
    "vector-search": ["database"],
}


def test_real_kb_valid():
    load_kb(DATA)


def test_compiled_is_fresh():
    assert CATALOG.read_text(encoding="utf-8") == render(compile_catalog(DATA))


def test_layers_present_have_10_to_20_tools():
    counts = Counter(t.layer for t in load_kb(DATA).tools.values())
    assert counts
    for layer, n in counts.items():
        assert 10 <= n <= 20, f"{layer} has {n} tools"


def test_vocab_matches_spec():
    kb = load_kb(DATA)
    v = kb.vocab
    assert v.languages == [
        "python", "typescript", "javascript", "go", "java", "kotlin", "csharp",
        "ruby", "php", "rust", "elixir", "dart", "swift",
    ]  # fmt: skip
    assert [c.id for c in v.capabilities] == [
        "realtime", "ssr-seo", "static-content", "offline", "file-uploads",
        "full-text-search", "background-jobs", "scheduled-jobs", "payments",
        "transactional-email", "content-editing", "multi-tenant", "geospatial",
        "analytics", "vector-search", "social-login", "enterprise-sso",
        "edge-runtime", "type-safety", "admin-ui", "high-write-throughput",
        "native-mobile",
    ]  # fmt: skip
    assert all(c.label and c.explain for c in v.capabilities)
    assert {p.id: p.core_layers for p in v.project_types} == {
        k: val.split() for k, val in SPEC_CORE.items()
    }
    assert all(p.label for p in v.project_types)
    assert v.capability_layers == SPEC_CAP_LAYERS
    assert v.tooling_layers == ["state", "build-tool", "ci-cd", "observability", "testing"]


def test_keywords_cover_vocab():
    kb = load_kb(DATA)
    assert len(kb.keywords) >= 60
    types = {e.sets.project_type for e in kb.keywords}
    caps = {c for e in kb.keywords for c in e.sets.capabilities}
    langs = {x for e in kb.keywords for x in e.sets.languages}
    assert {p.id for p in kb.vocab.project_types} <= types
    assert {c.id for c in kb.vocab.capabilities} <= caps
    assert set(kb.vocab.languages) <= langs
    for e in kb.keywords:
        assert all(p == p.lower() for p in e.phrases)


def test_orm_languages_match_a_backend():
    tools = load_kb(DATA).tools.values()
    backend_langs = {x for t in tools if t.layer == "backend" for x in t.languages}
    for t in tools:
        if t.layer == "orm":
            assert set(t.languages) & backend_langs, t.id


def test_backend_covers_core_languages():
    tools = load_kb(DATA).tools.values()
    langs = {x for t in tools if t.layer == "backend" for x in t.languages}
    need = {"python", "typescript", "javascript", "go", "java", "kotlin", "csharp",
            "ruby", "php", "rust", "elixir"}  # fmt: skip
    assert need <= langs


def test_every_tool_has_an_edge():
    for t in load_kb(DATA).tools.values():
        assert t.edges, t.id


def test_no_dashes_in_data():
    for p in DATA.rglob("*.yaml"):
        text = p.read_text(encoding="utf-8")
        assert "—" not in text and "–" not in text, p
