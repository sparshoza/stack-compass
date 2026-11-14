from collections import Counter
from pathlib import Path

from compassdata.compile import compile_catalog, render
from compassdata.load import load_kb
from compassdata.models import LAYERS

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
    "rest-api": ["api-style"],
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
        "native-mobile", "rest-api",
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


def test_every_orm_language_matches_some_backend():
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


def test_every_tool_has_at_least_one_edge():
    for t in load_kb(DATA).tools.values():
        assert t.edges, t.id


def test_no_dashes_in_data():
    for p in DATA.rglob("*.yaml"):
        text = p.read_text(encoding="utf-8")
        assert chr(0x2014) not in text and chr(0x2013) not in text, p


def test_every_meta_framework_built_on_a_frontend():
    tools = load_kb(DATA).tools
    metas = [t for t in tools.values() if t.layer == "meta-framework"]
    assert metas
    for t in metas:
        built = [e.target for e in t.edges if e.type == "built-on"]
        assert any(tools[x].layer == "frontend" for x in built), t.id


def test_every_state_and_ui_kit_built_on_or_pairs_with_a_frontend():
    tools = load_kb(DATA).tools
    subjects = [t for t in tools.values() if t.layer in ("state", "ui-kit")]
    assert subjects
    for t in subjects:
        linked = [e.target for e in t.edges if e.type in ("built-on", "pairs-with")]
        assert any(tools[x].layer == "frontend" for x in linked), t.id


def test_all_22_layers_present():
    tools = load_kb(DATA).tools.values()
    assert len(LAYERS) == 22
    assert {t.layer for t in tools} == set(LAYERS)


def test_total_tools_between_280_and_340():
    assert 280 <= len(load_kb(DATA).tools) <= 340


def test_keywords_at_least_150():
    assert len(load_kb(DATA).keywords) >= 150


def test_runs_in_app_marks_libraries_not_services():
    tools = load_kb(DATA).tools
    libraries = {
        "better-auth", "authjs", "passportjs", "devise", "spring-security",
        "nodemailer", "react-email", "mjml", "fusejs", "minisearch", "flexsearch",
        "pagefind", "uppy",
    }
    services = {"keycloak", "authentik", "zitadel", "meilisearch", "celery", "postgresql", "clerk"}
    assert {t for t in libraries if not tools[t].runs_in_app} == set()
    assert {t for t in services if tools[t].runs_in_app} == set()


def _kw_phrases():
    return {p for e in load_kb(DATA).keywords for p in e.phrases}


def test_rest_api_capability_and_keywords():
    kb = load_kb(DATA)
    cap = next(c for c in kb.vocab.capabilities if c.id == "rest-api")
    assert cap.label == "REST API" and cap.explain
    assert len(kb.vocab.capabilities) == 23
    assert kb.vocab.capability_layers["rest-api"] == ["api-style"]
    setting = {p for e in kb.keywords if "rest-api" in e.sets.capabilities for p in e.phrases}
    assert {"rest api", "restful", "rest endpoints", "json api"} <= setting


def test_rest_api_tags_only_where_docs_say_so():
    tools = load_kb(DATA).tools
    tagged = {t.id for t in tools.values() if "rest-api" in t.tags}
    assert tagged == {"openapi"}


def test_new_tools_exist_with_official_sources():
    tools = load_kb(DATA).tools
    expect = {
        "django-orm": ("orm", "python", "docs.djangoproject.com"),
        "vapor": ("backend", "swift", "vapor.codes"),
        "fluent": ("orm", "swift", "docs.vapor.codes"),
        "swiftui": ("mobile", "swift", "developer.apple.com"),
    }
    for tid, (layer, lang, host) in expect.items():
        t = tools[tid]
        assert t.layer == layer and t.languages == [lang], tid
        assert host in t.url and all(host in s or "github.com" in s or "apple.com" in s
                                     for s in t.sources), tid
    assert tools["django-orm"].match_name is False
    assert tools["fluent"].match_name is False
    assert tools["vapor"].match_name is False
    assert tools["swiftui"].license == "Proprietary"


def _pairs(tools, tid):
    return {e.target for e in tools[tid].edges if e.type == "pairs-with"}


def test_new_tool_edges():
    tools = load_kb(DATA).tools
    assert {"django", "postgresql", "mariadb", "mysql", "sqlite"} <= _pairs(tools, "django-orm")
    assert {"vapor", "postgresql", "mysql", "sqlite", "mongodb"} <= _pairs(tools, "fluent")
    assert "fluent" in _pairs(tools, "vapor")
    assert {"mariadb", "mysql", "postgresql", "sqlite", "mongodb", "laravel"} <= _pairs(
        tools, "eloquent"
    )
    for db in ("postgresql", "mysql", "mariadb", "sqlite"):
        assert "eloquent" in _pairs(tools, db) and "django-orm" in _pairs(tools, db)


def test_job_queue_in_app_libraries_run_in_app():
    tools = load_kb(DATA).tools
    in_app = {"oban", "solid-queue", "laravel-queues", "river", "pg-boss", "jobrunr",
              "quartz", "bullmq", "sidekiq", "rq", "asynq"}  # fmt: skip
    assert {t for t in in_app if not tools[t].runs_in_app} == set()
    assert {t for t in ("celery", "temporal", "trigger-dev") if tools[t].runs_in_app} == set()


def test_go_phrases_and_no_inner_tool_bias_phrases():
    phrases = _kw_phrases()
    assert {"in go", "using go", "use go", "written in go", "golang"} <= phrases
    assert not {"s3 compatible", "stripe like payments"} & phrases
