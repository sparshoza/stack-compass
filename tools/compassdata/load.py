"""Load and strictly validate data/vocab.yaml, data/keywords.yaml and data/tools/**."""

import re
import unicodedata
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import yaml
from pydantic import TypeAdapter, ValidationError

from .models import (
    LAYERS,
    NEED_GROUP,
    SCALE_GROUP,
    SCALE_OPTIONS,
    SHARED_FACET_MULTI,
    SHARED_FACET_OPTIONS,
    SYMMETRIC_EDGE_TYPES,
    FacetGroup,
    KeywordEntry,
    KnowledgeBase,
    Tool,
    Vocab,
)


class KbError(Exception):
    """Every validation problem found, each message starting with the file it concerns."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("\n".join(errors))


def _norm(s: str) -> str:
    return s.strip().lower()


_BARRIER_WORDS = {"but", "however"}
_CLAUSE_BREAK = re.compile(r"[,;:!?\n\r]+|\.{2,}")


def _match_key(text: str) -> str:
    """Normalise a phrase, name or alias the way web/src/engine/match.ts `tokenize`
    does, so the collision checks agree with the matcher: NFKC, lowercase, apostrophes
    dropped, anything that is not a letter, digit, mark or one of . + # becomes a
    space, leading . + # and trailing dots are stripped from each word, and a single
    leading dot before a word survives (".net"). Clause breaks and the words "but" and
    "however" vanish."""
    cleaned = unicodedata.normalize("NFKC", text).lower()
    cleaned = re.sub("['‘’ʼ]", "", cleaned)
    cleaned = _CLAUSE_BREAK.sub(" ", cleaned)
    cleaned = "".join(
        ch if (unicodedata.category(ch)[0] in "LNM" or ch in ".+#") else " " for ch in cleaned
    )
    tokens: list[str] = []
    for raw in cleaned.split():
        token = re.sub(r"\.+$", "", re.sub(r"^[.+#]+", "", raw))
        if not token:
            continue
        if raw.startswith(".") and raw[1:2] not in (".", "+", "#"):
            token = "." + token
        if token not in _BARRIER_WORDS:
            tokens.append(token)
    return " ".join(tokens)


class _UniqueKeyLoader(yaml.SafeLoader):
    """A safe loader that rejects a mapping with the same key twice (PyYAML keeps the last)."""

    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False) -> dict:
        seen: set[Any] = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in seen:
                raise yaml.constructor.ConstructorError(
                    None, None, f"found duplicate key '{key}'", key_node.start_mark
                )
            seen.add(key)
        return super().construct_mapping(node, deep=deep)


def _read_yaml(path: Path, rel: str, errors: list[str]) -> Any:
    try:
        return yaml.load(path.read_text(encoding="utf-8"), Loader=_UniqueKeyLoader)
    except OSError as e:
        errors.append(f"{rel}: cannot read file ({e.strerror or e})")
    except yaml.YAMLError as e:
        first = str(e).splitlines()[0] if str(e) else "parse error"
        errors.append(f"{rel}: invalid YAML ({first})")
    return None


def _validate(model: Any, data: Any, rel: str, errors: list[str]) -> Any:
    try:
        return TypeAdapter(model).validate_python(data)
    except ValidationError as e:
        for err in e.errors():
            loc = ".".join(str(p) for p in err["loc"])
            errors.append(f"{rel}: {loc}: {err['msg']}" if loc else f"{rel}: {err['msg']}")
    return None


def _check_vocab(vocab: Vocab, errors: list[str]) -> None:
    rel = "vocab.yaml"
    layers = set(LAYERS)
    seen_langs: set[str] = set()
    for lang in vocab.languages:
        if _norm(lang) in seen_langs:
            errors.append(f"{rel}: duplicate language '{lang}'")
        seen_langs.add(_norm(lang))
    seen: set[str] = set()
    for cap in vocab.capabilities:
        if cap.id in seen:
            errors.append(f"{rel}: duplicate capability id '{cap.id}'")
        seen.add(cap.id)
    seen = set()
    for pt in vocab.project_types:
        if pt.id in seen:
            errors.append(f"{rel}: duplicate project type id '{pt.id}'")
        seen.add(pt.id)
        for layer in pt.core_layers:
            if layer not in layers:
                errors.append(f"{rel}: project type '{pt.id}' has unknown core layer '{layer}'")
    cap_ids = {c.id for c in vocab.capabilities}
    for cap, cap_layers in vocab.capability_layers.items():
        if cap not in cap_ids:
            errors.append(f"{rel}: capability_layers key '{cap}' is not a capability")
        for layer in cap_layers:
            if layer not in layers:
                errors.append(f"{rel}: capability_layers '{cap}' has unknown layer '{layer}'")
    for layer in vocab.tooling_layers:
        if layer not in layers:
            errors.append(f"{rel}: tooling_layers has unknown layer '{layer}'")
    _check_facets(vocab, errors)


_DASHES = ("-", chr(0x2013), chr(0x2014))


def _check_facet_text(group: FacetGroup, where: str, errors: list[str]) -> None:
    texts = [("question", group.question)]
    for opt in group.options:
        texts += [(f"option '{opt.id}' label", opt.label), (f"option '{opt.id}' hint", opt.hint)]
    for what, text in texts:
        if any(d in text for d in _DASHES):
            errors.append(f"vocab.yaml: {where} {what} '{text}' contains a dash, use plain words")


def _check_facets(vocab: Vocab, errors: list[str]) -> None:
    rel = "vocab.yaml"
    layers = set(LAYERS)
    shared_ids = [s.id for s in vocab.shared_facets]
    if shared_ids != list(SHARED_FACET_OPTIONS):
        errors.append(
            f"{rel}: shared_facets must be exactly {list(SHARED_FACET_OPTIONS)}, got {shared_ids}"
        )
    service: set[str] = set()
    for layer in vocab.service_layers:
        if layer not in layers:
            errors.append(f"{rel}: service_layers has unknown layer '{layer}'")
        if layer in service:
            errors.append(f"{rel}: service_layers lists '{layer}' twice")
        service.add(layer)
    for shared in vocab.shared_facets:
        where = f"shared_facets '{shared.id}'"
        expected = SHARED_FACET_OPTIONS.get(shared.id)
        got = [o.id for o in shared.options]
        if expected is not None and got != expected:
            errors.append(f"{rel}: {where} options must be {expected}, got {got}")
        multi = SHARED_FACET_MULTI.get(shared.id)
        if multi is not None and shared.multi != multi:
            errors.append(f"{rel}: {where} must have multi: {str(multi).lower()}")
        _check_facet_text(shared, where, errors)
        for layer, shown in shared.layers.items():
            if layer not in layers:
                errors.append(f"{rel}: {where} has unknown layer '{layer}'")
                continue
            if layer not in service:
                errors.append(f"{rel}: {where} lists '{layer}', which is not in service_layers")
            if layer not in vocab.facets:
                errors.append(f"{rel}: {where} lists layer '{layer}' which has no facets")
            if len(shown) < 2:
                errors.append(f"{rel}: {where} '{layer}' must show at least 2 options")
            if len(set(shown)) != len(shown):
                errors.append(f"{rel}: {where} '{layer}' has a duplicate option")
            unknown = [o for o in shown if o not in got]
            for o in unknown:
                errors.append(f"{rel}: {where} '{layer}' shows unknown option '{o}'")
            if not unknown and shown != sorted(shown, key=got.index):
                errors.append(f"{rel}: {where} '{layer}' must keep the option order {got}")
    for layer, groups in vocab.facets.items():
        where = f"facets '{layer}'"
        if layer not in layers:
            errors.append(f"{rel}: facets has unknown layer '{layer}'")
            continue
        if not 1 <= len(groups) <= 3:
            errors.append(f"{rel}: {where} must have 1 to 3 groups, has {len(groups)}")
        if NEED_GROUP not in [g.id for g in groups]:
            errors.append(f"{rel}: {where} has no '{NEED_GROUP}' group (What do you need it for?)")
        elif groups[0].id != NEED_GROUP:
            errors.append(f"{rel}: {where} must list the '{NEED_GROUP}' group first")
        elif not groups[0].multi:
            errors.append(f"{rel}: {where} group '{NEED_GROUP}' must have multi: true")
        group_ids: set[str] = set()
        option_ids: set[str] = set()
        for group in groups:
            gwhere = f"{where} group '{group.id}'"
            if group.id in group_ids:
                errors.append(f"{rel}: {where} has duplicate group id '{group.id}'")
            group_ids.add(group.id)
            if group.id in SHARED_FACET_OPTIONS:
                errors.append(
                    f"{rel}: {where} group id '{group.id}' is reserved for shared_facets"
                )
            ids = [o.id for o in group.options]
            if group.id == SCALE_GROUP:
                if ids != SCALE_OPTIONS or group.multi:
                    errors.append(
                        f"{rel}: {gwhere} must be single choice with options {SCALE_OPTIONS}"
                    )
            else:
                if not 3 <= len(ids) <= 8:
                    errors.append(f"{rel}: {gwhere} must have 3 to 8 options, has {len(ids)}")
                for oid in ids:
                    if oid in option_ids:
                        errors.append(f"{rel}: {where} has duplicate option id '{oid}'")
                    option_ids.add(oid)
            _check_facet_text(group, gwhere, errors)


def _check_facet_coverage(
    vocab: Vocab, tools: dict[str, tuple[Tool, str]], errors: list[str]
) -> None:
    for layer in sorted({tool.layer for tool, _ in tools.values()} - set(vocab.facets)):
        errors.append(f"vocab.yaml: facets has no groups for layer '{layer}', which has tools")


def _use_options(vocab: Vocab, layer: str) -> set[str]:
    """Option ids a tool on this layer may list in `uses`."""
    return {
        o.id
        for g in vocab.facets.get(layer, [])
        if g.id != SCALE_GROUP
        for o in g.options
    }


def _check_keywords(keywords: list[KeywordEntry], vocab: Vocab | None, errors: list[str]) -> None:
    rel = "keywords.yaml"
    first_seen: dict[str, int] = {}
    for i, entry in enumerate(keywords):
        for phrase in entry.phrases:
            key = _norm(phrase)
            if not key:
                errors.append(f"{rel}: entry {i} has an empty phrase")
            elif key in first_seen:
                errors.append(
                    f"{rel}: duplicate phrase '{key}' in entries {first_seen[key]} and {i}"
                )
            else:
                first_seen[key] = i
        if vocab is None:
            continue
        s = entry.sets
        if s.project_type is not None and s.project_type not in {p.id for p in vocab.project_types}:
            errors.append(f"{rel}: entry {i} sets unknown project_type '{s.project_type}'")
        cap_ids = {c.id for c in vocab.capabilities}
        for cap in s.capabilities:
            if cap not in cap_ids:
                errors.append(f"{rel}: entry {i} sets unknown capability '{cap}'")
        for lang in s.languages:
            if lang not in vocab.languages:
                errors.append(f"{rel}: entry {i} sets unknown language '{lang}'")


def _utc_today() -> date:
    return datetime.now(UTC).date()


def _check_tool(
    tool: Tool, rel: str, folder: str, stem: str, vocab: Vocab | None, errors: list[str]
) -> None:
    if tool.layer != folder:
        errors.append(f"{rel}: layer '{tool.layer}' does not match folder '{folder}'")
    if tool.id != stem:
        errors.append(f"{rel}: id '{tool.id}' does not match filename '{stem}'")
    if tool.serves_backend and tool.layer != "meta-framework":
        errors.append(f"{rel}: serves_backend is only for meta-framework tools")
    if tool.url not in tool.sources:
        errors.append(f"{rel}: url '{tool.url}' must appear in sources")
    # Dates are written in the author's local time; no timezone is more than a day ahead of UTC.
    if tool.verified > _utc_today() + timedelta(days=1):
        errors.append(f"{rel}: verified {tool.verified} is in the future")
    if vocab is not None:
        cap_ids = {c.id for c in vocab.capabilities}
        for tag in tool.tags:
            if tag not in cap_ids:
                errors.append(f"{rel}: tag '{tag}' is not a capability in vocab.yaml")
        for lang in tool.languages:
            if lang not in vocab.languages:
                errors.append(f"{rel}: language '{lang}' is not in vocab.yaml")
        allowed = _use_options(vocab, tool.layer)
        seen_uses: set[str] = set()
        for use in tool.uses:
            if use in seen_uses:
                errors.append(f"{rel}: duplicate use '{use}'")
            seen_uses.add(use)
            if use not in allowed:
                errors.append(
                    f"{rel}: use '{use}' is not an option of the {tool.layer} facets "
                    f"in vocab.yaml (scale and shared facets are not uses)"
                )
        groups = vocab.facets.get(tool.layer, [])
        if tool.scale is not None and not any(g.id == SCALE_GROUP for g in groups):
            errors.append(
                f"{rel}: scale is set but the {tool.layer} layer has no scale group in vocab.yaml"
            )


def _check_edges(tools: dict[str, tuple[Tool, str]], errors: list[str]) -> None:
    for tool_id, (tool, rel) in tools.items():
        for edge in tool.edges:
            if edge.target == tool_id:
                errors.append(f"{rel}: edge '{edge.type}' targets the tool itself")
                continue
            target = tools.get(edge.target)
            if target is None:
                errors.append(f"{rel}: edge '{edge.type}' target '{edge.target}' does not exist")
                continue
            if edge.type in SYMMETRIC_EDGE_TYPES and not any(
                e.type == edge.type and e.target == tool_id for e in target[0].edges
            ):
                errors.append(
                    f"{rel}: edge '{edge.type}' to '{edge.target}' is not declared on "
                    f"{target[1]} (must be declared on both sides)"
                )


def _check_exclusive_pair_edges(tools: dict[str, tuple[Tool, str]], errors: list[str]) -> None:
    exclusive = ("alternative-to", "pairs-with")
    for tool_id, (tool, rel) in tools.items():
        for target in sorted({e.target for e in tool.edges}):
            if target <= tool_id:
                continue
            types = {e.type for e in tool.edges if e.target == target}
            if set(exclusive) <= types:
                errors.append(
                    f"{rel}: '{tool_id}' and '{target}' cannot be both alternative-to "
                    f"and pairs-with"
                )


def _check_aliases(tools: dict[str, tuple[Tool, str]], errors: list[str]) -> None:
    owners: dict[str, set[str]] = {}
    for tool_id, (tool, _) in tools.items():
        for term in [tool.id, tool.name, *tool.aliases]:
            owners.setdefault(_match_key(term), set()).add(tool_id)
    for tool_id, (tool, rel) in tools.items():
        for alias in tool.aliases:
            others = sorted(owners[_match_key(alias)] - {tool_id})
            if others:
                errors.append(
                    f"{rel}: alias '{alias}' collides with id, name or alias of "
                    f"{', '.join(others)}"
                )


def _check_keyword_tool_collisions(
    keywords: list[KeywordEntry], tools: dict[str, tuple[Tool, str]], errors: list[str]
) -> None:
    """A keyword phrase may not equal a matched tool name or an alias once both are
    normalised like the web matcher: the longest-match scan would read it as both."""
    terms: dict[str, set[str]] = {}
    for tool_id, (tool, _) in tools.items():
        names = [tool.name] if tool.match_name else []
        for term in [*names, *tool.aliases]:
            terms.setdefault(_match_key(term), set()).add(tool_id)
    for i, entry in enumerate(keywords):
        for phrase in entry.phrases:
            owners = terms.get(_match_key(phrase))
            if owners:
                errors.append(
                    f"keywords.yaml: entry {i} phrase '{_match_key(phrase)}' equals the name or "
                    f"an alias of {', '.join(sorted(owners))}"
                )


def load_kb(data_dir: Path) -> KnowledgeBase:
    data_dir = Path(data_dir)
    errors: list[str] = []

    vocab: Vocab | None = None
    vocab_path = data_dir / "vocab.yaml"
    if vocab_path.exists():
        raw = _read_yaml(vocab_path, "vocab.yaml", errors)
        if raw is not None:
            vocab = _validate(Vocab, raw, "vocab.yaml", errors)
    else:
        errors.append("vocab.yaml: file not found")
    if vocab is not None:
        _check_vocab(vocab, errors)

    keywords: list[KeywordEntry] | None = None
    kw_path = data_dir / "keywords.yaml"
    if kw_path.exists():
        raw = _read_yaml(kw_path, "keywords.yaml", errors)
        if raw is not None:
            keywords = _validate(list[KeywordEntry], raw, "keywords.yaml", errors)
    else:
        errors.append("keywords.yaml: file not found")
    if keywords is not None:
        _check_keywords(keywords, vocab, errors)

    tools: dict[str, tuple[Tool, str]] = {}
    tools_dir = data_dir / "tools"
    if not tools_dir.is_dir():
        errors.append("tools: directory not found")
    else:
        for path in sorted(tools_dir.rglob("*.yaml")):
            rel = path.relative_to(data_dir).as_posix()
            if path.parent == tools_dir:
                errors.append(f"{rel}: tool files must live in tools/<layer>/")
                continue
            before = len(errors)
            raw = _read_yaml(path, rel, errors)
            if raw is None:
                if len(errors) == before:
                    errors.append(f"{rel}: file is empty")
                continue
            tool = _validate(Tool, raw, rel, errors)
            if tool is None:
                continue
            _check_tool(tool, rel, path.parent.name, path.stem, vocab, errors)
            if tool.id in tools:
                errors.append(f"{rel}: duplicate tool id '{tool.id}' (also {tools[tool.id][1]})")
            else:
                tools[tool.id] = (tool, rel)
        _check_edges(tools, errors)
        _check_exclusive_pair_edges(tools, errors)
        _check_aliases(tools, errors)
        if vocab is not None:
            _check_facet_coverage(vocab, tools, errors)
        if keywords is not None:
            _check_keyword_tool_collisions(keywords, tools, errors)

    if errors:
        raise KbError(errors)
    assert vocab is not None and keywords is not None
    return KnowledgeBase(tools={k: v[0] for k, v in tools.items()}, vocab=vocab, keywords=keywords)
