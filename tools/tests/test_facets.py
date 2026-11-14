"""Use-case facets: the vocab `facets` and `shared_facets` sections and the tool
fields `uses` and `scale` that the One piece chooser filters on."""

import shutil
from pathlib import Path

import pytest
import yaml

from compassdata.load import KbError, load_kb

FIXTURES = Path(__file__).parent / "fixtures"
NL = chr(10)


@pytest.fixture
def kb_dir(tmp_path: Path) -> Path:
    dest = tmp_path / "data"
    shutil.copytree(FIXTURES, dest)
    return dest


def edit_yaml(path: Path, fn) -> None:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    fn(doc)
    path.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")


def edit_vocab(kb_dir: Path, fn) -> None:
    edit_yaml(kb_dir / "vocab.yaml", fn)


def edit_tool(kb_dir: Path, layer: str, tool_id: str, fn) -> None:
    edit_yaml(kb_dir / "tools" / layer / f"{tool_id}.yaml", fn)


def errors_of(kb_dir: Path) -> list[str]:
    with pytest.raises(KbError) as exc:
        load_kb(kb_dir)
    return exc.value.errors


def vocab_errors(kb_dir: Path, needle: str) -> list[str]:
    return [e for e in errors_of(kb_dir) if e.startswith("vocab.yaml") and needle in e]


def option(oid: str, label: str = "Plain label", hint: str = "Plain hint") -> dict:
    return {"id": oid, "label": label, "hint": hint}


# Loading and defaults


def test_fixture_facets_load():
    kb = load_kb(FIXTURES)
    groups = kb.vocab.facets["database"]
    assert [g.id for g in groups] == ["need", "scale"]
    assert [o.id for o in groups[0].options] == ["app-data", "analytics", "vectors"]
    assert groups[0].multi is True and groups[1].multi is False
    assert [s.id for s in kb.vocab.shared_facets] == ["run", "license"]
    assert kb.vocab.shared_facets[0].layers == {"database": ["in-app", "self-hosted", "managed"]}
    assert kb.vocab.shared_facets[1].layers == {"database": ["oss", "any"]}
    assert kb.vocab.service_layers == ["database"]


def test_uses_and_scale_default_to_empty(kb_dir):
    kb = load_kb(kb_dir)
    assert kb.tools["react"].uses == []
    assert kb.tools["react"].scale is None


def test_accepts_valid_uses_and_scale(kb_dir):
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(
        uses=["app-data", "vectors"], scale="single"))
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(uses=["interactive"]))
    kb = load_kb(kb_dir)
    assert kb.tools["postgres"].uses == ["app-data", "vectors"]
    assert kb.tools["postgres"].scale == "single"
    assert kb.tools["react"].uses == ["interactive"]


# Tool fields


def test_rejects_use_from_another_layer(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(uses=["analytics"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "'analytics'" in e for e in errs)


def test_rejects_unknown_use(kb_dir):
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(uses=["telepathy"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/database/postgres.yaml") and "telepathy" in e for e in errs)


def test_rejects_scale_option_in_uses(kb_dir):
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(uses=["single"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/database/postgres.yaml") and "'single'" in e for e in errs)


def test_rejects_shared_option_in_uses(kb_dir):
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(uses=["managed"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/database/postgres.yaml") and "'managed'" in e for e in errs)


def test_rejects_duplicate_use(kb_dir):
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(uses=["app-data", "app-data"]))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/database/postgres.yaml") and "duplicate use" in e
               for e in errs)


def test_rejects_scale_on_layer_without_scale_group(kb_dir):
    edit_tool(kb_dir, "frontend", "react", lambda d: d.update(scale="single"))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "scale" in e for e in errs)


def test_rejects_unknown_scale_value(kb_dir):
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(scale="huge"))
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/database/postgres.yaml") and "scale" in e for e in errs)


@pytest.mark.parametrize("value", ["single", "scale-out", "both"])
def test_accepts_every_scale_value(kb_dir, value):
    edit_tool(kb_dir, "database", "postgres", lambda d: d.update(scale=value))
    assert load_kb(kb_dir).tools["postgres"].scale == value


# Facet groups


def test_rejects_facets_for_unknown_layer(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"].update(warehouse=d["facets"]["frontend"]))
    assert vocab_errors(kb_dir, "warehouse")


def test_rejects_layer_with_tools_but_no_facets(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"].pop("frontend"))
    assert vocab_errors(kb_dir, "frontend")


def test_rejects_layer_with_no_groups(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"].update(frontend=[]))
    assert any(e.startswith("vocab.yaml") and "frontend" in e for e in errors_of(kb_dir))


def test_rejects_layer_with_more_than_three_groups(kb_dir):
    def add(d):
        base = d["facets"]["frontend"][0]
        for gid in ("two", "three", "four"):
            d["facets"]["frontend"].append({
                **base, "id": gid,
                "options": [option(f"{gid}-{i}") for i in range(3)],
            })
    edit_vocab(kb_dir, add)
    assert any(e.startswith("vocab.yaml") and "frontend" in e for e in errors_of(kb_dir))


def test_rejects_layer_without_a_need_group(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0].update(id="purpose"))
    assert vocab_errors(kb_dir, "'need'")


def test_rejects_group_with_fewer_than_three_options(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0]["options"].pop())
    assert vocab_errors(kb_dir, "3 to 8")


def test_rejects_group_with_more_than_eight_options(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0]["options"].extend(
        option(f"extra-{i}") for i in range(6)))
    assert vocab_errors(kb_dir, "3 to 8")


def test_rejects_duplicate_option_id_within_a_layer(kb_dir):
    def dup(d):
        d["facets"]["backend"].append({
            "id": "style", "question": "What style?", "multi": True,
            "options": [option("apis"), option("rest"), option("rpc")],
        })
    edit_vocab(kb_dir, dup)
    assert vocab_errors(kb_dir, "duplicate option id 'apis'")


def test_same_option_id_in_two_layers_is_fine(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0]["options"][0].update(id="apis"))
    load_kb(kb_dir)


def test_rejects_duplicate_group_id_within_a_layer(kb_dir):
    def dup(d):
        d["facets"]["backend"].append({
            "id": "need", "question": "Again?", "multi": True,
            "options": [option("a1"), option("a2"), option("a3")],
        })
    edit_vocab(kb_dir, dup)
    assert vocab_errors(kb_dir, "duplicate group id 'need'")


@pytest.mark.parametrize("gid", ["run", "license"])
def test_rejects_group_id_reserved_for_shared_facets(kb_dir, gid):
    def add(d):
        d["facets"]["backend"].append({
            "id": gid, "question": "Where?", "multi": True,
            "options": [option("b1"), option("b2"), option("b3")],
        })
    edit_vocab(kb_dir, add)
    assert vocab_errors(kb_dir, f"'{gid}'")


def test_scale_group_must_have_exactly_the_two_scale_options(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["database"][1]["options"].append(option("huge")))
    assert vocab_errors(kb_dir, "scale")


def test_scale_group_must_not_be_multi(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["database"][1].update(multi=True))
    assert vocab_errors(kb_dir, "scale")


@pytest.mark.parametrize("field", ["label", "hint"])
@pytest.mark.parametrize("dash", ["-", chr(0x2013), chr(0x2014)])
def test_rejects_dashes_in_option_text(kb_dir, field, dash):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0]["options"][0].update(
        {field: f"Full{dash}text"}))
    assert vocab_errors(kb_dir, "dash")


def test_rejects_dash_in_question(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0].update(question="Use-case?"))
    assert vocab_errors(kb_dir, "dash")


def test_rejects_dash_in_shared_label(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][0]["options"][0].update(label="In-app"))
    assert vocab_errors(kb_dir, "dash")


@pytest.mark.parametrize("bad", ["App data", "AppData", "app_data", "-app", "app-"])
def test_rejects_bad_option_id(kb_dir, bad):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0]["options"][0].update(id=bad))
    assert any(e.startswith("vocab.yaml") and "id" in e for e in errors_of(kb_dir))


def test_rejects_empty_label(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0]["options"][0].update(label=""))
    assert any(e.startswith("vocab.yaml") and "label" in e for e in errors_of(kb_dir))


def test_rejects_unknown_group_field(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0].update(colour="red"))
    assert any(e.startswith("vocab.yaml") and "colour" in e for e in errors_of(kb_dir))


# Shared facets


def test_shared_facets_must_be_run_and_license(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"].pop())
    assert vocab_errors(kb_dir, "shared_facets")


def test_shared_run_options_are_fixed(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][0]["options"][0].update(id="embedded"))
    assert vocab_errors(kb_dir, "shared_facets")


def test_shared_license_options_are_fixed(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][1]["options"][1].update(id="whatever"))
    assert vocab_errors(kb_dir, "shared_facets")


def test_rejects_shared_facet_on_unknown_layer(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][0]["layers"].update(warehouse=["managed"]))
    assert vocab_errors(kb_dir, "warehouse")


def test_rejects_shared_facet_on_layer_without_facets(kb_dir):
    def add(d):
        d["service_layers"].append("testing")
        d["shared_facets"][1]["layers"]["testing"] = ["oss", "any"]
    edit_vocab(kb_dir, add)
    assert vocab_errors(kb_dir, "testing")


def test_rejects_shared_layer_option_not_in_the_facet(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][0]["layers"].update(
        database=["in-app", "embedded"]))
    assert vocab_errors(kb_dir, "'embedded'")


def test_rejects_shared_layer_with_fewer_than_two_options(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][0]["layers"].update(database=["managed"]))
    assert vocab_errors(kb_dir, "at least 2")


def test_rejects_duplicate_option_in_a_shared_layer(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][0]["layers"].update(
        database=["managed", "managed", "in-app"]))
    assert vocab_errors(kb_dir, "duplicate")


def test_shared_layer_options_keep_the_facet_order(kb_dir):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][0]["layers"].update(
        database=["managed", "in-app"]))
    assert vocab_errors(kb_dir, "order")


def test_rejects_duplicate_shared_layer_key(kb_dir):
    path = kb_dir / "vocab.yaml"
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "      database: [oss, any]", "      database: [oss, any]" + NL + "      database: [oss, any]"
    )
    path.write_text(text, encoding="utf-8")
    assert vocab_errors(kb_dir, "duplicate key")


def test_rejects_duplicate_key_in_a_tool_file(kb_dir):
    path = kb_dir / "tools" / "frontend" / "react.yaml"
    path.write_text(path.read_text(encoding="utf-8") + "name: React again" + NL, encoding="utf-8")
    errs = errors_of(kb_dir)
    assert any(e.startswith("tools/frontend/react.yaml") and "duplicate key" in e for e in errs)


@pytest.mark.parametrize(("index", "multi"), [(0, False), (1, True)])
def test_shared_facet_multi_is_fixed(kb_dir, index, multi):
    edit_vocab(kb_dir, lambda d: d["shared_facets"][index].update(multi=multi))
    assert vocab_errors(kb_dir, "multi")


def test_rejects_shared_layer_outside_service_layers(kb_dir):
    edit_vocab(kb_dir, lambda d: d["service_layers"].clear())
    assert vocab_errors(kb_dir, "service_layers")


def test_rejects_unknown_service_layer(kb_dir):
    edit_vocab(kb_dir, lambda d: d["service_layers"].append("warehouse"))
    assert vocab_errors(kb_dir, "warehouse")


def test_need_group_must_come_first(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["database"].reverse())
    assert vocab_errors(kb_dir, "first")


def test_need_group_must_be_multi(kb_dir):
    edit_vocab(kb_dir, lambda d: d["facets"]["frontend"][0].update(multi=False))
    assert vocab_errors(kb_dir, "multi")
