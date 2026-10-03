"""Conservative validation for mappings exposed to the assurance runtime."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .artifact_io_json import read_json
from .artifact_io_values import flatten_values
from .artifact_paths import APPLE_SCHEMA_CATALOG_PATH, RELUTION_SCHEMA_BUNDLE_PATH
from .mapping_exact_targets import mapping_target


SUPPORTED_MAPPING_FAMILIES = {
    "relution-native",
    "apple-schema-profile",
    "apple-mobileconfig",
}


@dataclass(frozen=True)
class MappingSchema:
    """The checked target and fields for one supported mapping family."""

    family: str
    target: str
    platforms: frozenset[str]
    enrollment_channels: tuple[str, ...]
    fields: dict[str, dict[str, Any]]
    evidence: str


def load_mapping_schemas() -> dict[tuple[str, str], MappingSchema]:
    """Load the checked-in Relution and Apple schema evidence."""

    schemas: dict[tuple[str, str], MappingSchema] = {}
    relution = read_json(RELUTION_SCHEMA_BUNDLE_PATH)
    for configuration in relution.get("configurationTypes", []):
        target = configuration.get("type")
        if not isinstance(target, str):
            continue
        schemas[("relution-native", target)] = MappingSchema(
            family="relution-native",
            target=target,
            platforms=frozenset(configuration.get("platforms", [])),
            enrollment_channels=tuple(sorted(configuration.get("enrollmentTypes", []))),
            fields={
                field["path"]: field
                for field in configuration.get("fields", [])
                if isinstance(field, dict) and isinstance(field.get("path"), str)
            },
            evidence=(
                f"data/relution-26.1.1/template-bundle.json#configurationTypes/{target}"
            ),
        )
    apple = read_json(APPLE_SCHEMA_CATALOG_PATH)
    for entry in apple.get("entries", []):
        if not isinstance(entry, dict) or entry.get("kind") != "profile":
            continue
        target = entry.get("id")
        if not isinstance(target, str):
            continue
        schema = MappingSchema(
            family="apple-schema-profile",
            target=target,
            platforms=frozenset(entry.get("availability", {}).get("platforms", [])),
            enrollment_channels=(),
            fields={
                field["path"]: field
                for field in entry.get("fields", [])
                if isinstance(field, dict) and isinstance(field.get("path"), str)
            },
            evidence=f"data/apple-device-management/catalog.json#entries/{target}",
        )
        schemas[(schema.family, target)] = schema
        schemas[("apple-mobileconfig", target)] = MappingSchema(
            family="apple-mobileconfig",
            target=target,
            platforms=schema.platforms,
            enrollment_channels=(),
            fields=schema.fields,
            evidence=schema.evidence,
        )
    return schemas


def audit_mapping(
    mapping: dict[str, Any],
    platform: str,
    schemas: dict[tuple[str, str], MappingSchema],
    *,
    role: str,
    mapping_id: str,
) -> dict[str, Any]:
    """Audit one exact or candidate mapping against checked-in schema evidence."""

    family = mapping.get("kind")
    target = mapping_target(mapping) or mapping.get("target")
    row: dict[str, Any] = {
        "mappingId": mapping_id,
        "role": role,
        "family": family,
        "target": target,
        "outcome": "invalid",
        "reasons": [],
        "settings": [],
    }
    if family not in SUPPORTED_MAPPING_FAMILIES:
        row["reasons"].append(
            "Mapping family is not supported by the assurance runtime contract."
        )
        return row
    if not isinstance(target, str) or not target:
        row["reasons"].append("Mapping target is missing.")
        return row
    schema = schemas.get((family, target))
    if schema is None:
        row["reasons"].append(
            "Mapping target is absent from the checked-in platform schema evidence."
        )
        return row
    row["schemaEvidence"] = schema.evidence
    if platform not in schema.platforms:
        row["reasons"].append(
            f"Mapping target schema does not declare platform {platform}."
        )

    if role == "candidate":
        audit_candidate_fields(mapping, schema, row)
        row["semanticEvidence"] = semantic_evidence(mapping, role)
        row["outcome"] = "candidate-only" if not row["reasons"] else "invalid-candidate"
        return row

    semantic = semantic_evidence(mapping, role)
    row["semanticEvidence"] = semantic
    if semantic["outcome"] != "verified":
        row["reasons"].append(semantic["reason"])

    values = mapping.get("values")
    if not isinstance(values, dict) or not values:
        row["reasons"].append("Exact mapping values must be a nonempty object.")
        return row
    for path, value in flatten_values(values).items():
        dotted_path = ".".join(path)
        field = schema.fields.get(dotted_path)
        setting = {
            "path": json_pointer(path),
            "value": value,
            "outcome": "valid",
            "schemaPath": dotted_path,
        }
        reason = validate_value(field, value)
        if reason is not None:
            setting["outcome"] = "invalid"
            setting["reason"] = reason
            row["reasons"].append(f"{dotted_path}: {reason}")
        row["settings"].append(setting)
    row["constraints"] = audit_constraints(mapping, schema, row)
    row["outcome"] = "valid" if not row["reasons"] else "invalid"
    return row


def semantic_evidence(mapping: dict[str, Any], role: str) -> dict[str, Any]:
    """Separate curated mapping evidence from label-similarity suggestions."""

    match = mapping.get("match")
    if role == "candidate":
        return {
            "outcome": "candidate-only",
            "kind": "declared-candidate",
            "reason": "Candidate field paths remain review evidence and do not establish semantic equivalence.",
        }
    if match is None:
        return {
            "outcome": "verified",
            "kind": "declared-exact-source-mapping",
            "reason": "The normalized source record declares this mapping directly without a similarity-match heuristic.",
        }
    if not isinstance(match, dict):
        return {
            "outcome": "unverified",
            "kind": "malformed-match-evidence",
            "reason": "Exact mapping match evidence is malformed.",
        }
    score = match.get("score")
    compatibility = match.get("valueCompatibility")
    reason = match.get("reason")
    if (
        score == 100
        and compatibility in {"curated-analog", "curated-android-analog"}
        and isinstance(reason, str)
        and reason.strip()
    ):
        return {
            "outcome": "verified",
            "kind": compatibility,
            "score": score,
            "reason": reason,
        }
    return {
        "outcome": "unverified",
        "kind": "similarity-or-unreviewed-match",
        "score": score,
        "valueCompatibility": compatibility,
        "reason": "Similarity, label, type, or field-existence evidence does not establish semantic equivalence.",
    }


def audit_constraints(
    mapping: dict[str, Any], schema: MappingSchema, row: dict[str, Any]
) -> list[dict[str, Any]]:
    """Validate each declared constraint without weakening its source operator."""

    audits = []
    for constraint in mapping.get("constraints", []):
        if not isinstance(constraint, dict):
            row["reasons"].append("Declared constraint is not an object.")
            continue
        path = constraint.get("path")
        operator = constraint.get("operator")
        value = constraint.get("value")
        reason = None
        field = schema.fields.get(path) if isinstance(path, str) else None
        if operator not in {"equals", "atLeast", "atMost", "containsAll"}:
            reason = "constraint operator is unsupported"
        elif field is None:
            reason = "constraint path is absent from checked-in schema evidence"
        elif operator == "containsAll" and (
            field.get("kind") not in {"array", "list"} or not isinstance(value, list)
        ):
            reason = "containsAll requires an array schema field and array value"
        elif operator != "containsAll":
            reason = validate_value(field, value)
        audit = {
            "path": path_to_pointer(path),
            "operator": operator,
            "value": value,
            "outcome": "valid" if reason is None else "invalid",
        }
        if reason is not None:
            audit["reason"] = reason
            row["reasons"].append(f"constraint {path}: {reason}")
        audits.append(audit)
    return audits


def audit_candidate_fields(
    mapping: dict[str, Any], schema: MappingSchema, row: dict[str, Any]
) -> None:
    """Record candidate field-path evidence without promoting it to an exact mapping."""

    paths = mapping.get("fieldPaths", [])
    if not isinstance(paths, list) or not paths:
        row["reasons"].append("Candidate mapping has no field-path evidence.")
        return
    for value in paths:
        path = str(value)
        valid = path in schema.fields
        row["settings"].append(
            {
                "path": json_pointer(tuple(path.split("."))),
                "outcome": "candidate-only" if valid else "invalid",
                "schemaPath": path,
                **(
                    {
                        "reason": "Candidate field is absent from checked-in schema evidence."
                    }
                    if not valid
                    else {}
                ),
            }
        )
        if not valid:
            row["reasons"].append(
                f"{path}: candidate field is absent from checked-in schema evidence."
            )


def validate_value(field: dict[str, Any] | None, value: Any) -> str | None:
    """Return a schema mismatch reason, or None for a supported value."""

    if field is None:
        return "field is absent from checked-in schema evidence"
    kind = field.get("kind")
    expected = {
        "boolean": lambda item: isinstance(item, bool),
        "integer": lambda item: isinstance(item, int) and not isinstance(item, bool),
        "number": lambda item: isinstance(item, (int, float))
        and not isinstance(item, bool),
        "string": lambda item: isinstance(item, str),
        "array": lambda item: isinstance(item, list),
        "list": lambda item: isinstance(item, list),
        "object": lambda item: isinstance(item, dict),
        "json": lambda _item: True,
    }.get(kind)
    if expected is not None and not expected(value):
        return f"value does not match schema kind {kind}"
    enum_values = field.get("enumValues", [])
    if enum_values and value not in enum_values:
        return "value is absent from the schema enum"
    return None


def json_pointer(path: tuple[str, ...]) -> str:
    """Encode a value path as a JSON pointer relative to mapping.values."""

    return "/" + "/".join(part.replace("~", "~0").replace("/", "~1") for part in path)


def path_to_pointer(path: Any) -> str:
    """Convert one source dotted path to a JSON pointer."""

    return json_pointer(tuple(str(path).split("."))) if path else "/"
