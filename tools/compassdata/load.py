"""Load and strictly validate data/vocab.yaml, data/keywords.yaml and data/tools/**."""

from datetime import date
from pathlib import Path
from typing import Any

import yaml
from pydantic import TypeAdapter, ValidationError

from .models import (
    LAYERS,
    SYMMETRIC_EDGE_TYPES,
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


def _read_yaml(path: Path, rel: str, errors: list[str]) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
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


def _check_tool(
    tool: Tool, rel: str, folder: str, stem: str, vocab: Vocab | None, errors: list[str]
) -> None:
    if tool.layer != folder:
        errors.append(f"{rel}: layer '{tool.layer}' does not match folder '{folder}'")
    if tool.id != stem:
        errors.append(f"{rel}: id '{tool.id}' does not match filename '{stem}'")
    if tool.url not in tool.sources:
        errors.append(f"{rel}: url '{tool.url}' must appear in sources")
    if tool.verified > date.today():
        errors.append(f"{rel}: verified {tool.verified} is in the future")
    if vocab is not None:
        cap_ids = {c.id for c in vocab.capabilities}
        for tag in tool.tags:
            if tag not in cap_ids:
                errors.append(f"{rel}: tag '{tag}' is not a capability in vocab.yaml")
        for lang in tool.languages:
            if lang not in vocab.languages:
                errors.append(f"{rel}: language '{lang}' is not in vocab.yaml")


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
            owners.setdefault(_norm(term), set()).add(tool_id)
    for tool_id, (tool, rel) in tools.items():
        for alias in tool.aliases:
            others = sorted(owners[_norm(alias)] - {tool_id})
            if others:
                errors.append(
                    f"{rel}: alias '{alias}' collides with id, name or alias of "
                    f"{', '.join(others)}"
                )


def _check_keyword_tool_collisions(
    keywords: list[KeywordEntry], tools: dict[str, tuple[Tool, str]], errors: list[str]
) -> None:
    """A keyword phrase may not equal a matched tool name or an alias: the
    longest-match scan would read it as both."""
    terms: dict[str, set[str]] = {}
    for tool_id, (tool, _) in tools.items():
        names = [tool.name] if tool.match_name else []
        for term in [*names, *tool.aliases]:
            terms.setdefault(_norm(term), set()).add(tool_id)
    for i, entry in enumerate(keywords):
        for phrase in entry.phrases:
            owners = terms.get(_norm(phrase))
            if owners:
                errors.append(
                    f"keywords.yaml: entry {i} phrase '{_norm(phrase)}' equals the name or "
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
        if keywords is not None:
            _check_keyword_tool_collisions(keywords, tools, errors)

    if errors:
        raise KbError(errors)
    assert vocab is not None and keywords is not None
    return KnowledgeBase(tools={k: v[0] for k, v in tools.items()}, vocab=vocab, keywords=keywords)
