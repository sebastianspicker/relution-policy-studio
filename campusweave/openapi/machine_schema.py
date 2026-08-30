from __future__ import annotations

from typing import Any, Mapping


def schema_catalog_summary(schema: Any, *, context: str) -> dict[str, Any] | None:
    """Return a safe structural schema summary without copying the schema."""

    if schema is None:
        return None
    if isinstance(schema, bool):
        return {"kind": "boolean_schema", "value": schema}
    if not isinstance(schema, Mapping):
        raise ValueError(f"{context} schema must be an object or boolean")

    summary = schema_catalog_identity(schema, context)
    schema_catalog_scalar_fields(summary, schema, context)
    schema_catalog_structure(summary, schema, context)
    return summary


def schema_catalog_identity(schema: Mapping[str, Any], context: str) -> dict[str, Any]:
    """Create and validate a schema summary's identity fields."""

    summary: dict[str, Any] = {"kind": "reference" if "$ref" in schema else "inline"}
    if "$ref" in schema:
        ref = schema["$ref"]
        if not isinstance(ref, str) or not ref:
            raise ValueError(f"{context} schema $ref must be a non-empty string")
        summary["ref"] = ref

    return summary


def schema_catalog_scalar_fields(
    summary: dict[str, Any], schema: Mapping[str, Any], context: str
) -> None:
    """Copy validated scalar schema fields into a structural summary."""

    schema_catalog_type(summary, schema.get("type"), context)
    schema_catalog_strings(summary, schema, context)
    schema_catalog_booleans(summary, schema, context)
    if "enum" in schema:
        if not isinstance(schema["enum"], list):
            raise ValueError(f"{context} schema enum must be an array")
        summary["enum"] = schema["enum"]
    constraints = {
        output: schema[source] for source, output in SCHEMA_CONSTRAINT_FIELDS if source in schema
    }
    if constraints:
        summary["constraints"] = constraints


def schema_catalog_type(summary: dict[str, Any], value: Any, context: str) -> None:
    """Validate and record the schema type."""

    if value is None:
        return
    if isinstance(value, str):
        summary["type"] = value
    elif isinstance(value, list) and all(isinstance(item, str) for item in value):
        summary["type"] = list(value)
    else:
        raise ValueError(f"{context} schema type must be a string or string array")


SCHEMA_STRING_FIELDS = (
    ("format", "format"),
    ("contentEncoding", "content_encoding"),
    ("contentMediaType", "content_media_type"),
)
SCHEMA_BOOLEAN_FIELDS = (
    ("nullable", "nullable"),
    ("readOnly", "read_only"),
    ("writeOnly", "write_only"),
    ("deprecated", "deprecated"),
    ("uniqueItems", "unique_items"),
)
SCHEMA_CONSTRAINT_FIELDS = (
    ("minimum", "minimum"),
    ("maximum", "maximum"),
    ("exclusiveMinimum", "exclusive_minimum"),
    ("exclusiveMaximum", "exclusive_maximum"),
    ("multipleOf", "multiple_of"),
    ("minLength", "min_length"),
    ("maxLength", "max_length"),
    ("pattern", "pattern"),
    ("minItems", "min_items"),
    ("maxItems", "max_items"),
    ("minProperties", "min_properties"),
    ("maxProperties", "max_properties"),
)


def schema_catalog_strings(
    summary: dict[str, Any], schema: Mapping[str, Any], context: str
) -> None:
    """Copy validated string schema annotations."""

    for source_key, output_key in SCHEMA_STRING_FIELDS:
        value = schema.get(source_key)
        if value is not None:
            if not isinstance(value, str):
                raise ValueError(f"{context} schema {source_key} must be a string")
            summary[output_key] = value


def schema_catalog_booleans(
    summary: dict[str, Any], schema: Mapping[str, Any], context: str
) -> None:
    """Copy validated boolean schema annotations."""

    for source_key, output_key in SCHEMA_BOOLEAN_FIELDS:
        if source_key in schema:
            value = schema[source_key]
            if not isinstance(value, bool):
                raise ValueError(f"{context} schema {source_key} must be a boolean")
            summary[output_key] = value


def schema_catalog_structure(
    summary: dict[str, Any], schema: Mapping[str, Any], context: str
) -> None:
    """Copy nested schema structure into a structural summary."""

    properties = schema.get("properties")
    if properties is not None:
        if not isinstance(properties, Mapping):
            raise ValueError(f"{context} schema properties must be an object")
        summary["property_count"] = len(properties)

    required = schema.get("required")
    if required is not None:
        if not isinstance(required, list) or not all(isinstance(item, str) for item in required):
            raise ValueError(f"{context} schema required must be a string array")
        summary["required_properties"] = sorted(required)
    schema_catalog_children(summary, schema, context)


def schema_catalog_children(
    summary: dict[str, Any], schema: Mapping[str, Any], context: str
) -> None:
    """Copy schema composition and additional-properties summaries."""

    if "items" in schema:
        summary["items"] = schema_catalog_summary(schema["items"], context=f"{context}.items")
    for keyword in ("oneOf", "anyOf", "allOf"):
        if keyword not in schema:
            continue
        variants = schema[keyword]
        if not isinstance(variants, list):
            raise ValueError(f"{context} schema {keyword} must be an array")
        summary[keyword] = [
            schema_catalog_summary(item, context=f"{context}.{keyword}[{index}]")
            for index, item in enumerate(variants)
        ]
    if "not" in schema:
        summary["not"] = schema_catalog_summary(schema["not"], context=f"{context}.not")

    schema_catalog_additional_properties(summary, schema.get("additionalProperties"), context)


def schema_catalog_additional_properties(
    summary: dict[str, Any], additional_properties: Any, context: str
) -> None:
    """Copy the optional additional-properties schema."""

    if additional_properties is not None:
        if isinstance(additional_properties, bool):
            summary["additional_properties"] = additional_properties
        elif isinstance(additional_properties, Mapping):
            summary["additional_properties"] = schema_catalog_summary(
                additional_properties,
                context=f"{context}.additionalProperties",
            )
        else:
            raise ValueError(f"{context} schema additionalProperties must be an object or boolean")
