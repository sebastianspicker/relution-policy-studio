from __future__ import annotations

import json
from typing import Any, Mapping, Sequence


def compact_text(value: Any, default: str = "Not provided") -> str:
    """Normalize arbitrary contract text for a Markdown table cell."""

    if value is None:
        return default
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        text = str(value)
    text = " ".join(text.replace("\r", " ").replace("\n", " ").split())
    if not text:
        return default
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\\", "\\\\")
        .replace("|", "\\|")
    )


def code(value: Any, default: str = "Not provided") -> str:
    """Format a compact value as safe inline code."""

    text = compact_text(value, default="")
    if not text:
        return default
    return "`" + text.replace("`", "\\`") + "`"


def quote_block(value: Any) -> list[str]:
    """Render multiline contract prose without allowing it to become headings."""

    if value is None:
        return []
    text = str(value).strip()
    if not text:
        return []
    safe_lines = [
        line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        for line in text.splitlines()
    ]
    return [f"> {line}" if line else ">" for line in safe_lines]


def schema_summary(schema: Any) -> str:
    """Describe a schema compactly while preserving its references and bounds."""

    if schema is None:
        return "Not provided"
    if not isinstance(schema, Mapping):
        return code(schema)
    if "$ref" in schema:
        return code(schema["$ref"])

    parts = schema_scalar_summary_parts(schema)
    parts.extend(schema_nested_summary_parts(schema))
    if not parts:
        parts.append(schema_fallback_summary(schema))
    return code("; ".join(parts))


def schema_scalar_summary_parts(schema: Mapping[str, Any]) -> list[str]:
    """Return scalar schema annotations in catalog display order."""

    parts = schema_type_summary_parts(schema)
    parts.extend(schema_annotation_summary_parts(schema))
    return parts


def schema_type_summary_parts(schema: Mapping[str, Any]) -> list[str]:
    """Return the optional type annotation."""

    schema_type = schema.get("type")
    if isinstance(schema_type, list):
        return ["type=" + "/".join(str(item) for item in schema_type)]
    return [f"type={schema_type}"] if schema_type else []


def schema_annotation_summary_parts(schema: Mapping[str, Any]) -> list[str]:
    """Return non-type scalar schema annotations."""

    parts = schema_value_annotations(schema)
    parts.extend(schema_boolean_annotations(schema))
    parts.extend(schema_bound_annotations(schema))
    return parts


def schema_value_annotations(schema: Mapping[str, Any]) -> list[str]:
    """Return format, enum, and default annotations."""

    parts: list[str] = []
    for key in ("format", "enum", "default"):
        if key in schema and (key in {"enum", "default"} or schema[key]):
            value = schema[key]
            rendered = (
                json.dumps(value, ensure_ascii=False, sort_keys=True)
                if key in {"enum", "default"}
                else value
            )
            parts.append(f"{key}={rendered}")
    return parts


def schema_boolean_annotations(schema: Mapping[str, Any]) -> list[str]:
    """Return enabled Boolean annotations."""

    return [key for key in ("nullable", "readOnly", "writeOnly") if schema.get(key) is True]


def schema_bound_annotations(schema: Mapping[str, Any]) -> list[str]:
    """Return numeric and string bounds."""

    return [
        f"{key}={schema[key]}"
        for key in ("minimum", "maximum", "minLength", "maxLength", "pattern")
        if key in schema
    ]


def schema_nested_summary_parts(schema: Mapping[str, Any]) -> list[str]:
    """Return item and composition summaries for a schema."""

    parts = []
    if schema.get("items") is not None:
        parts.append(f"items={schema_summary(schema['items']).strip('`')}")
    for keyword in ("oneOf", "anyOf", "allOf"):
        variants = schema.get(keyword)
        if isinstance(variants, Sequence) and not isinstance(variants, (str, bytes)):
            rendered = ", ".join(schema_summary(item).strip("`") for item in variants)
            parts.append(f"{keyword}=[{rendered}]")

    return parts


def schema_fallback_summary(schema: Mapping[str, Any]) -> str:
    """Describe an otherwise unannotated schema."""

    properties = schema.get("properties")
    return (
        f"object properties={len(properties)}"
        if isinstance(properties, Mapping)
        else "inline schema"
    )


def security_summary(security: Any) -> str:
    """Render OpenAPI security alternatives."""

    if security is None:
        return "Not declared"
    if security == []:
        return "Anonymous (`security: []`)"
    if not isinstance(security, Sequence) or isinstance(security, (str, bytes)):
        return compact_text(security)

    return " OR ".join(security_requirement_summary(requirement) for requirement in security)


def security_requirement_summary(requirement: Any) -> str:
    """Render one security alternative."""

    if not isinstance(requirement, Mapping):
        return compact_text(requirement)
    schemes = [security_scheme_summary(name, scopes) for name, scopes in requirement.items()]
    return " + ".join(schemes) if schemes else "anonymous"


def security_scheme_summary(name: Any, scopes: Any) -> str:
    """Render one scheme requirement and any declared scopes."""

    if not isinstance(scopes, Sequence) or isinstance(scopes, (str, bytes)) or not scopes:
        return f"`{name}`"
    return f"`{name}` (scopes: {', '.join(str(scope) for scope in scopes)})"
