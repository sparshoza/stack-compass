from collections import Counter
from pathlib import Path

import pytest

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


def test_needs_web_frontend_marks_browser_test_tools_only():
    tools = load_kb(DATA).tools
    browser = {"playwright", "cypress", "selenium"}
    assert {t for t, tool in tools.items() if tool.needs_web_frontend} == browser


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


def _kw_sets(phrase):
    return next(e.sets for e in load_kb(DATA).keywords if phrase in e.phrases)


def test_go_project_phrases():
    rest = _kw_sets("go rest api")
    assert (rest.project_type, rest.capabilities, rest.languages) == (
        "api-only", ["rest-api"], ["go"]
    )
    graphql = _kw_sets("go graphql api")
    assert (graphql.project_type, graphql.capabilities, graphql.languages) == (
        "api-only", [], ["go"]
    )
    web = _kw_sets("go web app")
    assert (web.project_type, web.languages) == ("web-app", ["go"])
    for phrase in ("go web service", "go microservice"):
        assert (_kw_sets(phrase).project_type, _kw_sets(phrase).languages) == ("api-only", ["go"])
    # "go app" and "go server" also match "on the go app", so they are not phrases.
    assert not {"go app", "go server"} & _kw_phrases()


def test_vapor_aliases():
    aliases = set(load_kb(DATA).tools["vapor"].aliases)
    assert {"vapor backend", "vapor api", "vapor app", "vapor server", "vapor framework",
            "swift vapor"} <= aliases  # fmt: skip


# A chosen capability is required in the layer it adds (when some tool there has
# it), so these are the tools each one leaves out, each checked against its
# official docs. PostgreSQL gets vector search from the separate pgvector tool,
# MySQL keeps DISTANCE() to HeatWave, Temporal and Quartz run workflows and
# schedules rather than a job queue, and the email gaps send no mail.
CAPABILITY_GAPS = {
    "full-text-search": set(),
    "file-uploads": set(),
    "payments": set(),
    "transactional-email": {"mailhog", "mailpit", "mjml", "react-email"},
    "background-jobs": {"quartz", "temporal"},
    "scheduled-jobs": set(),
    "content-editing": set(),
    "realtime": {"caffeine", "ehcache", "memcached"},
    "native-mobile": set(),
    "vector-search": {"dynamodb", "mysql", "postgresql", "sqlite"},
}


def test_required_capabilities_leave_out_only_reviewed_tools():
    kb = load_kb(DATA)
    gaps = {}
    for cap, layers in kb.vocab.capability_layers.items():
        if cap == "rest-api":
            continue  # pinned by test_rest_api_tags_only_where_docs_say_so
        gaps[cap] = {
            t.id for t in kb.tools.values() if t.layer in layers and cap not in t.tags
        }
    assert gaps == CAPABILITY_GAPS


def test_swift_testing_tool():
    tools = load_kb(DATA).tools
    t = tools["swift-testing"]
    assert (t.layer, t.languages, t.license, t.pricing) == (
        "testing", ["swift"], "Apache-2.0", ["oss"]
    )
    assert "swift-testing" in _pairs(tools, "vapor")
    assert "https://docs.vapor.codes/advanced/testing/" in t.sources


def test_every_layer_has_facets_led_by_a_need_group():
    facets = load_kb(DATA).vocab.facets
    assert set(facets) == set(LAYERS)
    for layer, groups in facets.items():
        assert 1 <= len(groups) <= 3, layer
        assert groups[0].id == "need", layer
        assert groups[0].question == "What do you need it for?", layer


def test_scale_groups_only_where_size_splits_the_layer():
    facets = load_kb(DATA).vocab.facets
    with_scale = {layer for layer, gs in facets.items() if any(g.id == "scale" for g in gs)}
    assert with_scale == {"database", "cache", "search"}


SERVICE_LAYERS = [
    "database", "cache", "jobs-queue", "search", "storage", "auth", "payments",
    "email", "cms", "hosting", "ci-cd", "observability",
]  # fmt: skip


def test_service_layers_are_the_scorer_service_layers():
    # web/src/engine/score.test.ts checks SERVICE_LAYERS in score.ts against this list.
    assert load_kb(DATA).vocab.service_layers == SERVICE_LAYERS


def test_run_is_shown_on_service_layers_except_jobs_queue():
    shared = {s.id: s for s in load_kb(DATA).vocab.shared_facets}
    assert list(shared["run"].layers) == [x for x in SERVICE_LAYERS if x != "jobs-queue"]


def test_license_is_shown_wherever_it_can_narrow_the_list():
    kb = load_kb(DATA)
    license_layers = {s.id: s for s in kb.vocab.shared_facets}["license"].layers
    for layer in SERVICE_LAYERS:
        tools = [t for t in kb.tools.values() if t.layer == layer]
        all_oss = all("oss" in t.pricing for t in tools)
        # Hidden only where every tool is open source (jobs-queue today).
        assert (layer not in license_layers) == all_oss, layer


def _shared_match(facet: str, option: str, tool) -> bool:
    if facet == "run":
        return {
            "in-app": tool.runs_in_app,
            "self-hosted": "self-hosted" in tool.hosting and not tool.runs_in_app,
            "managed": "managed" in tool.hosting,
        }[option]
    return option == "any" or "oss" in tool.pricing


def _shared_cases():
    kb = load_kb(DATA)
    for shared in kb.vocab.shared_facets:
        for layer, options in shared.layers.items():
            for option in options:
                case = (shared.id, layer, option)
                yield pytest.param(*case, id="-".join(case))


@pytest.mark.parametrize(("facet", "layer", "option"), list(_shared_cases()))
def test_every_shown_shared_option_matches_a_tool(facet, layer, option):
    tools = [t for t in load_kb(DATA).tools.values() if t.layer == layer]
    assert any(_shared_match(facet, option, t) for t in tools)


# Tools on a layer with a scale group that deliberately leave `scale` unset.
SCALE_UNSET = {
    # Algolia is a hosted search API: its docs describe no single-node or sharded
    # topology the user chooses, so neither scale option is a true claim.
    "algolia",
}


def test_every_facet_option_matches_a_tool_and_every_tool_has_a_need():
    kb = load_kb(DATA)
    for layer, groups in kb.vocab.facets.items():
        tools = [t for t in kb.tools.values() if t.layer == layer]
        for group in groups:
            for opt in group.options:
                if group.id == "scale":
                    hit = any(t.scale in (opt.id, "both") for t in tools)
                else:
                    hit = any(opt.id in t.uses for t in tools)
                assert hit, f"{layer} {group.id} {opt.id} matches no tool"
        need = {o.id for o in groups[0].options}
        for t in tools:
            assert need & set(t.uses), f"{t.id} has no need option"
            if any(g.id == "scale" for g in groups) and t.id not in SCALE_UNSET:
                assert t.scale is not None, f"{t.id} has no scale"
