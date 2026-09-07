"""Data models and target helpers for recommendation matching."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FieldTokens:
    """Normalized search tokens associated with a Relution or Apple field."""

    tokens: frozenset[str]
    label_tokens: frozenset[str]
    enum_values: tuple[str, ...]


@dataclass(frozen=True)
class FieldEntry:
    """Searchable field entry from a Relution template or Apple schema."""

    kind: str
    target: str
    field_path: str
    label: str
    field_kind: str
    platforms: frozenset[str]
    token_data: FieldTokens

    @property
    def tokens(self) -> frozenset[str]:
        """All normalized search tokens for this field."""

        return self.token_data.tokens

    @property
    def label_tokens(self) -> frozenset[str]:
        """Normalized tokens derived from the field label."""

        return self.token_data.label_tokens

    @property
    def enum_values(self) -> tuple[str, ...]:
        """Enumerated values observed for this field."""

        return self.token_data.enum_values


@dataclass(frozen=True)
class ScoredField:
    """Candidate field plus score and matching evidence."""

    score: int
    matched_terms: tuple[str, ...]
    value_compatibility: str
    field: FieldEntry


AnalogValues = tuple[tuple[str, Any], ...]
AnalogRequired = tuple[tuple[str, ...], ...]
AnalogConstraints = tuple[tuple[str, str, Any], ...]


@dataclass(frozen=True)
class AppleAnalogRule:
    """Curated Apple payload analog for non-exact recommendation matching."""

    platforms: frozenset[str]
    schema_id: str
    values: AnalogValues
    required: AnalogRequired
    excluded: tuple[str, ...] = ()
    constraints: AnalogConstraints = ()
    reason: str = (
        "Curated Apple schema analog matched managed-device recommendation wording."
    )


@dataclass(frozen=True)
class AndroidAnalogRule:
    """Curated Android Enterprise analog for recommendation matching."""

    target: str
    values: AnalogValues
    required: AnalogRequired
    excluded: tuple[str, ...] = ()
    constraints: AnalogConstraints = ()
    reason: str = "Curated Android Enterprise analog matched managed-device recommendation wording."


@dataclass(frozen=True)
class SemanticConceptTarget:
    """Relution or Apple target associated with a semantic concept."""

    platforms: frozenset[str]
    kind: str
    target: str
    field_paths: tuple[str, ...]
    note: str


@dataclass(frozen=True)
class SemanticConceptRule:
    """Bilingual concept rule linking recommendation text to target surfaces."""

    concept_id: str
    label_de: str
    label_en: str
    terms: tuple[str, ...]
    targets: tuple[SemanticConceptTarget, ...]
    gs_controls: tuple[str, ...] = ()
    exclusions: tuple[str, ...] = ()


def semantic_target(
    platforms: tuple[str, ...],
    kind: str,
    target: str,
    field_paths: tuple[str, ...],
    note: str,
) -> SemanticConceptTarget:
    """Build a semantic concept target with normalized platform values."""

    return SemanticConceptTarget(frozenset(platforms), kind, target, field_paths, note)
