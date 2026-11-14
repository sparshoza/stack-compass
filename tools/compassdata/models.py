"""Pydantic models for the knowledge base. Cross-file rules live in load.py."""

import re
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Scoring order, also the display order.
LAYERS: list[str] = [
    "backend",
    "frontend",
    "meta-framework",
    "mobile",
    "database",
    "orm",
    "api-style",
    "auth",
    "cache",
    "jobs-queue",
    "search",
    "storage",
    "payments",
    "email",
    "cms",
    "state",
    "ui-kit",
    "build-tool",
    "hosting",
    "ci-cd",
    "observability",
    "testing",
]

EDGE_TYPES: list[str] = ["alternative-to", "pairs-with", "built-on", "extends", "replaces"]
SYMMETRIC_EDGE_TYPES: list[str] = ["alternative-to", "pairs-with"]
HOSTING = {"managed", "self-hosted"}
PRICING = {"oss", "free-tier", "paid"}
MATURITY = {"emerging", "established", "legacy"}

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Edge(Strict):
    type: str
    target: str

    @field_validator("type")
    @classmethod
    def _type_known(cls, v: str) -> str:
        if v not in EDGE_TYPES:
            raise ValueError(f"unknown edge type '{v}', expected one of {EDGE_TYPES}")
        return v


class Tool(Strict):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    aliases: list[str] = []
    match_name: bool = True
    # A library that runs inside the app (no server of its own to host).
    runs_in_app: bool = False
    layer: str
    summary: str = Field(min_length=1, max_length=140)
    url: str = Field(min_length=1)
    repo: str | None = None
    license: str = Field(min_length=1)
    languages: list[str] = []
    tags: list[str] = []
    hosting: list[str] = Field(min_length=1)
    pricing: list[str] = Field(min_length=1)
    maturity: str
    good_for: list[str] = Field(default=[], max_length=3)
    avoid_when: list[str] = Field(default=[], max_length=3)
    edges: list[Edge] = []
    verified: date
    sources: list[str] = Field(min_length=1)

    @field_validator("layer")
    @classmethod
    def _layer_known(cls, v: str) -> str:
        if v not in LAYERS:
            raise ValueError(f"unknown layer '{v}'")
        return v

    @field_validator("hosting")
    @classmethod
    def _hosting_known(cls, v: list[str]) -> list[str]:
        bad = [x for x in v if x not in HOSTING]
        if bad:
            raise ValueError(f"unknown hosting {bad}, expected a subset of {sorted(HOSTING)}")
        return v

    @field_validator("pricing")
    @classmethod
    def _pricing_known(cls, v: list[str]) -> list[str]:
        bad = [x for x in v if x not in PRICING]
        if bad:
            raise ValueError(f"unknown pricing {bad}, expected a subset of {sorted(PRICING)}")
        return v

    @field_validator("maturity")
    @classmethod
    def _maturity_known(cls, v: str) -> str:
        if v not in MATURITY:
            raise ValueError(f"unknown maturity '{v}', expected one of {sorted(MATURITY)}")
        return v

    @field_validator("verified", mode="before")
    @classmethod
    def _verified_iso(cls, v: object) -> date:
        if isinstance(v, date) and not hasattr(v, "hour"):
            return v
        if isinstance(v, str) and _ISO_DATE.match(v):
            try:
                return date.fromisoformat(v)
            except ValueError:
                pass
        raise ValueError(f"verified must be an ISO date YYYY-MM-DD, got {v!r}")


class ProjectType(Strict):
    id: str
    label: str
    core_layers: list[str]


class Capability(Strict):
    id: str
    label: str
    explain: str


class Vocab(Strict):
    languages: list[str]
    capabilities: list[Capability]
    project_types: list[ProjectType]
    capability_layers: dict[str, list[str]]
    tooling_layers: list[str]


class KeywordSets(Strict):
    project_type: str | None = None
    capabilities: list[str] = []
    languages: list[str] = []


class KeywordEntry(Strict):
    phrases: list[str] = Field(min_length=1)
    sets: KeywordSets


class KnowledgeBase(Strict):
    tools: dict[str, Tool]
    vocab: Vocab
    keywords: list[KeywordEntry]
