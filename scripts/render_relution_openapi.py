#!/usr/bin/env python3
"""Render a deterministic, exhaustive Markdown catalog from OpenAPI JSON.

The renderer is deliberately offline and dependency-free. It enumerates every
Operation Object beneath ``paths``, ``webhooks``, and callbacks, including the
OpenAPI 3.2 QUERY method and ``additionalOperations`` map. It renders the
request/response navigation data an operator needs and records the raw contract
SHA-256. The source JSON remains authoritative for complete JSON Schema details.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from strict_json import load_strict_json  # noqa: E402


FIXED_HTTP_METHOD_FIELDS: tuple[str, ...] = (
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace",
)
OAS_32_FIXED_HTTP_METHOD_FIELDS = (*FIXED_HTTP_METHOD_FIELDS, "query")
PATH_ITEM_METADATA_KEYS = {
    "$ref",
    "summary",
    "description",
    "servers",
    "parameters",
}
HTTP_TOKEN = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
SUPPORTED_OPENAPI_VERSION = re.compile(r"^3\.(0|1|2)\.\d+(?:[-+].*)?$")


@dataclass(frozen=True)
class Operation:
    """One top-level API operation from the contract."""

    surface: str
    path: str
    method: str
    path_item: Mapping[str, Any]
    operation: Mapping[str, Any]
    lineage: str | None = None
    location: str = ""


def contract_feature_version(spec: Mapping[str, Any]) -> tuple[str, int, int]:
    """Return and validate the supported contract feature version."""

    swagger = spec.get("swagger")
    if swagger is not None:
        if swagger != "2.0":
            raise ValueError(
                f"unsupported Swagger version {swagger!r}; only Swagger 2.0 is supported"
            )
        return ("swagger", 2, 0)

    openapi = spec.get("openapi")
    if not isinstance(openapi, str):
        raise ValueError("the contract must declare a string 'openapi' or 'swagger' version")
    match = SUPPORTED_OPENAPI_VERSION.fullmatch(openapi)
    if not match:
        raise ValueError(
            f"unsupported OpenAPI version {openapi!r}; supported feature sets are "
            "OpenAPI 3.0, 3.1, and 3.2"
        )
    return ("openapi", 3, int(match.group(1)))


def fixed_http_method_fields(spec: Mapping[str, Any]) -> tuple[str, ...]:
    """Return Path Item fixed HTTP fields for the contract feature version."""

    kind, major, minor = contract_feature_version(spec)
    if kind == "openapi" and (major, minor) >= (3, 2):
        return OAS_32_FIXED_HTTP_METHOD_FIELDS
    return FIXED_HTTP_METHOD_FIELDS


def load_spec(path: Path) -> tuple[dict[str, Any], bytes]:
    """Load and minimally validate an OpenAPI/Swagger JSON document."""

    value, raw = load_strict_json(path)

    if not isinstance(value, dict):
        raise ValueError("the contract root must be a JSON object")
    kind, _, minor = contract_feature_version(value)
    if "paths" in value and not isinstance(value["paths"], dict):
        raise ValueError("the top-level 'paths' value must be an object")
    if "webhooks" in value and not isinstance(value["webhooks"], dict):
        raise ValueError("the top-level 'webhooks' value must be an object")
    if "components" in value and not isinstance(value["components"], dict):
        raise ValueError("the top-level 'components' value must be an object")
    if "paths" not in value and (kind == "swagger" or minor == 0):
        raise ValueError("the contract must contain a top-level 'paths' object")
    if kind == "openapi" and minor >= 1 and not any(
        key in value for key in ("paths", "components", "webhooks")
    ):
        raise ValueError(
            "OpenAPI 3.1/3.2 contracts must contain at least one of "
            "'paths', 'components', or 'webhooks'"
        )

    return value, raw


def resolve_local_ref(spec: Mapping[str, Any], ref: str) -> Any:
    """Resolve a local JSON Pointer, failing closed for external references."""

    if not ref.startswith("#/"):
        raise ValueError(
            f"operation-bearing object uses unsupported external reference {ref!r}; "
            "bundle it into the contract before catalog generation"
        )

    current: Any = spec
    for raw_token in ref[2:].split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, Mapping) or token not in current:
            raise ValueError(f"local reference {ref!r} cannot be resolved")
        current = current[token]
    return current


def resolve_path_item(
    spec: Mapping[str, Any],
    path_item: Mapping[str, Any],
    *,
    context: str,
    seen_refs: frozenset[str] = frozenset(),
) -> dict[str, Any]:
    """Resolve local path-item refs and merge allowed sibling keys."""

    ref = path_item.get("$ref")
    if ref is None:
        return dict(path_item)
    if not isinstance(ref, str):
        raise ValueError(f"{context} has a non-string $ref")
    if ref in seen_refs:
        raise ValueError(f"{context} contains a cyclic path-item reference {ref!r}")

    resolved = resolve_local_ref(spec, ref)
    if not isinstance(resolved, Mapping):
        raise ValueError(f"{context} reference {ref!r} does not resolve to an object")
    base = resolve_path_item(
        spec,
        resolved,
        context=context,
        seen_refs=seen_refs | {ref},
    )
    base.update({key: value for key, value in path_item.items() if key != "$ref"})
    return base


def resolve_callback_object(
    spec: Mapping[str, Any],
    callback: Mapping[str, Any],
    *,
    context: str,
    seen_refs: frozenset[str] = frozenset(),
) -> dict[str, Any]:
    """Resolve a locally referenced Callback Object."""

    ref = callback.get("$ref")
    if ref is None:
        return dict(callback)
    if not isinstance(ref, str):
        raise ValueError(f"{context} has a non-string $ref")
    if ref in seen_refs:
        raise ValueError(f"{context} contains a cyclic callback reference {ref!r}")

    resolved = resolve_local_ref(spec, ref)
    if not isinstance(resolved, Mapping):
        raise ValueError(f"{context} reference {ref!r} does not resolve to an object")
    base = resolve_callback_object(
        spec,
        resolved,
        context=context,
        seen_refs=seen_refs | {ref},
    )
    for key, value in callback.items():
        if key == "$ref" or key in {"summary", "description"} or key.startswith("x-"):
            continue
        base[key] = value
    return base


def operations_from_path_item(
    spec: Mapping[str, Any],
    *,
    surface: str,
    path: str,
    raw_item: Mapping[str, Any],
    context: str,
    lineage: str | None,
) -> list[Operation]:
    """Validate one Path Item and return all fixed and additional operations."""

    path_item = resolve_path_item(spec, raw_item, context=context)
    fixed_methods = fixed_http_method_fields(spec)
    _, major, minor = contract_feature_version(spec)
    supports_additional = major == 3 and minor >= 2
    allowed_keys = PATH_ITEM_METADATA_KEYS | set(fixed_methods)
    if supports_additional:
        allowed_keys.add("additionalOperations")

    for key in path_item:
        if not isinstance(key, str) or (
            key not in allowed_keys and not key.startswith("x-")
        ):
            raise ValueError(
                f"{context} contains unsupported path-item key {key!r}; "
                "refusing to risk omitting an operation"
            )

    operations: list[Operation] = []
    for method_field in fixed_methods:
        if method_field not in path_item:
            continue
        value = path_item[method_field]
        if not isinstance(value, Mapping):
            raise ValueError(f"{context}.{method_field} must be an object")
        operations.append(
            Operation(
                surface=surface,
                path=path,
                method=method_field.upper(),
                path_item=path_item,
                operation=value,
                lineage=lineage,
                location=f"{context}.{method_field}",
            )
        )

    if "additionalOperations" in path_item:
        additional = path_item["additionalOperations"]
        if not isinstance(additional, Mapping):
            raise ValueError(f"{context}.additionalOperations must be an object")
        fixed_wire_methods = {method.upper() for method in fixed_methods}
        for method, value in sorted(
            additional.items(), key=lambda item: (str(item[0]).casefold(), str(item[0]))
        ):
            if not isinstance(method, str) or not HTTP_TOKEN.fullmatch(method):
                raise ValueError(
                    f"{context}.additionalOperations contains invalid HTTP method {method!r}"
                )
            if method != method.upper():
                raise ValueError(
                    f"{context}.additionalOperations method {method!r} must use "
                    "uppercase wire-method spelling"
                )
            if method.upper() in fixed_wire_methods:
                raise ValueError(
                    f"{context}.additionalOperations duplicates fixed HTTP method {method!r}"
                )
            if not isinstance(value, Mapping):
                raise ValueError(
                    f"{context}.additionalOperations.{method} must be an object"
                )
            operations.append(
                Operation(
                    surface=surface,
                    path=path,
                    method=method,
                    path_item=path_item,
                    operation=value,
                    lineage=lineage,
                    location=f"{context}.additionalOperations.{method}",
                )
            )
    return operations


def collect_operations(spec: Mapping[str, Any]) -> list[Operation]:
    """Collect every operation from paths, webhooks, and recursive callbacks."""

    operations: list[Operation] = []

    def collect_path_item(
        *,
        surface: str,
        path: str,
        raw_item: Mapping[str, Any],
        context: str,
        lineage: str | None,
        ancestor_operation_ids: frozenset[int],
    ) -> None:
        path_operations = operations_from_path_item(
            spec,
            surface=surface,
            path=path,
            raw_item=raw_item,
            context=context,
            lineage=lineage,
        )
        for operation in path_operations:
            operation_object_id = id(operation.operation)
            if operation_object_id in ancestor_operation_ids:
                raise ValueError(
                    f"{context}.{operation.method} contains a cyclic callback operation"
                )
            operations.append(operation)

            callbacks = operation.operation.get("callbacks", {})
            if not isinstance(callbacks, Mapping):
                raise ValueError(f"{context}.{operation.method}.callbacks must be an object")
            for callback_name, raw_callback in sorted(
                callbacks.items(), key=lambda item: str(item[0])
            ):
                callback_context = (
                    f"{context}.{operation.method}.callbacks.{callback_name}"
                )
                if not isinstance(callback_name, str):
                    raise ValueError(f"{context} contains a non-string callback name")
                if not isinstance(raw_callback, Mapping):
                    raise ValueError(f"{callback_context} must be an object")
                callback = resolve_callback_object(
                    spec,
                    raw_callback,
                    context=callback_context,
                )
                for expression, callback_path_item in sorted(
                    callback.items(), key=lambda item: str(item[0])
                ):
                    if isinstance(expression, str) and expression.startswith("x-"):
                        continue
                    if not isinstance(expression, str):
                        raise ValueError(
                            f"{callback_context} contains a non-string callback expression"
                        )
                    if not isinstance(callback_path_item, Mapping):
                        raise ValueError(
                            f"{callback_context}.{expression} must be a Path Item object"
                        )
                    parent_label = (
                        operation.operation.get("operationId")
                        or f"{operation.method} {operation.path}"
                    )
                    callback_lineage = f"{parent_label} → {callback_name}"
                    if operation.lineage:
                        callback_lineage = (
                            f"{operation.lineage} → {callback_lineage}"
                        )
                    collect_path_item(
                        surface="callbacks",
                        path=expression,
                        raw_item=callback_path_item,
                        context=f"{callback_context}.{expression}",
                        lineage=callback_lineage,
                        ancestor_operation_ids=(
                            ancestor_operation_ids | {operation_object_id}
                        ),
                    )

    for surface in ("paths", "webhooks"):
        collection = spec.get(surface) or {}
        if not isinstance(collection, Mapping):
            raise ValueError(f"top-level {surface!r} must be an object")
        for path, raw_item in sorted(collection.items(), key=lambda item: str(item[0])):
            context = f"{surface}.{path}"
            if not isinstance(path, str):
                raise ValueError(f"{surface} contains a non-string path key")
            if not isinstance(raw_item, Mapping):
                raise ValueError(f"{context} must be an object")
            collect_path_item(
                surface=surface,
                path=path,
                raw_item=raw_item,
                context=context,
                lineage=None,
                ancestor_operation_ids=frozenset(),
            )
    return operations


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

    parts: list[str] = []
    schema_type = schema.get("type")
    if isinstance(schema_type, list):
        parts.append("type=" + "/".join(str(item) for item in schema_type))
    elif schema_type:
        parts.append(f"type={schema_type}")
    if schema.get("format"):
        parts.append(f"format={schema['format']}")
    if "enum" in schema:
        parts.append(
            "enum=" + json.dumps(schema["enum"], ensure_ascii=False, sort_keys=True)
        )
    if "default" in schema:
        parts.append(
            "default=" + json.dumps(schema["default"], ensure_ascii=False, sort_keys=True)
        )
    if schema.get("nullable") is True:
        parts.append("nullable")
    if schema.get("readOnly") is True:
        parts.append("readOnly")
    if schema.get("writeOnly") is True:
        parts.append("writeOnly")
    for key in ("minimum", "maximum", "minLength", "maxLength", "pattern"):
        if key in schema:
            parts.append(f"{key}={schema[key]}")

    items = schema.get("items")
    if items is not None:
        parts.append(f"items={schema_summary(items).strip('`')}")
    for keyword in ("oneOf", "anyOf", "allOf"):
        variants = schema.get(keyword)
        if isinstance(variants, Sequence) and not isinstance(variants, (str, bytes)):
            rendered = ", ".join(schema_summary(item).strip("`") for item in variants)
            parts.append(f"{keyword}=[{rendered}]")

    if not parts:
        properties = schema.get("properties")
        if isinstance(properties, Mapping):
            parts.append(f"object properties={len(properties)}")
        else:
            parts.append("inline schema")
    return code("; ".join(parts))


def security_summary(security: Any) -> str:
    """Render OpenAPI security alternatives."""

    if security is None:
        return "Not declared"
    if security == []:
        return "Anonymous (`security: []`)"
    if not isinstance(security, Sequence) or isinstance(security, (str, bytes)):
        return compact_text(security)

    alternatives: list[str] = []
    for requirement in security:
        if not isinstance(requirement, Mapping):
            alternatives.append(compact_text(requirement))
            continue
        schemes: list[str] = []
        for name, scopes in requirement.items():
            scope_text = ""
            if isinstance(scopes, Sequence) and not isinstance(scopes, (str, bytes)):
                if scopes:
                    scope_text = " (scopes: " + ", ".join(str(scope) for scope in scopes) + ")"
            schemes.append(f"`{name}`{scope_text}")
        alternatives.append(" + ".join(schemes) if schemes else "anonymous")
    return " OR ".join(alternatives)


def operation_parameters(operation: Operation) -> list[Any]:
    """Combine inherited path-item parameters with operation parameters."""

    combined: list[Any] = []
    for owner, label in (
        (operation.path_item, "path item"),
        (operation.operation, "operation"),
    ):
        parameters = owner.get("parameters") or []
        if not isinstance(parameters, list):
            raise ValueError(
                f"{operation.surface}.{operation.path}.{operation.method} "
                f"{label} parameters must be an array"
            )
        combined.extend(parameters)
    return combined


def render_parameters(operation: Operation) -> list[str]:
    """Render parameter details for one operation."""

    parameters = operation_parameters(operation)
    if not parameters:
        return ["None declared."]

    lines = [
        "| Name/reference | In | Required | Schema | Description |",
        "| --- | --- | --- | --- | --- |",
    ]
    for parameter in parameters:
        if not isinstance(parameter, Mapping):
            raise ValueError(
                f"{operation.surface}.{operation.path}.{operation.method} "
                "contains a non-object parameter"
            )
        if "$ref" in parameter:
            lines.append(
                f"| {code(parameter['$ref'])} | Not provided | Not provided | "
                "Not provided | Reference |"
            )
            continue
        schema = parameter.get("schema")
        if schema is None and parameter.get("type"):
            schema = {
                key: parameter[key]
                for key in ("type", "format", "items", "enum", "default")
                if key in parameter
            }
        lines.append(
            "| "
            + " | ".join(
                (
                    code(parameter.get("name")),
                    code(parameter.get("in")),
                    "yes" if parameter.get("required") is True else "no",
                    schema_summary(schema),
                    compact_text(parameter.get("description")),
                )
            )
            + " |"
        )
    return lines


def render_request_body(
    operation: Operation, spec: Mapping[str, Any]
) -> list[str]:
    """Render OpenAPI 3 requestBody or Swagger body/form parameters."""

    request_body = operation.operation.get("requestBody")
    if request_body is not None:
        if not isinstance(request_body, Mapping):
            raise ValueError(
                f"{operation.surface}.{operation.path}.{operation.method} "
                "requestBody must be an object"
            )
        if "$ref" in request_body:
            return [f"Reference: {code(request_body['$ref'])}"]

        lines = [
            f"Required: {'yes' if request_body.get('required') is True else 'no'}",
        ]
        description = quote_block(request_body.get("description"))
        if description:
            lines.extend(["", *description])
        content = request_body.get("content") or {}
        if not isinstance(content, Mapping):
            raise ValueError(
                f"{operation.surface}.{operation.path}.{operation.method} "
                "requestBody.content must be an object"
            )
        if not content:
            lines.extend(["", "No media types declared."])
            return lines
        lines.extend(
            [
                "",
                "| Media type | Schema |",
                "| --- | --- |",
            ]
        )
        for media_type, media in content.items():
            if not isinstance(media, Mapping):
                raise ValueError(
                    f"{operation.surface}.{operation.path}.{operation.method} "
                    f"request media {media_type!r} must be an object"
                )
            lines.append(f"| {code(media_type)} | {schema_summary(media.get('schema'))} |")
        return lines

    body_parameters = []
    form_parameters = []
    for parameter in operation_parameters(operation):
        if not isinstance(parameter, Mapping):
            continue
        if parameter.get("in") == "body":
            body_parameters.append(parameter)
        elif parameter.get("in") == "formData":
            form_parameters.append(parameter)
    if not body_parameters and not form_parameters:
        return ["None declared."]

    consumes = operation.operation.get("consumes")
    if consumes is None:
        consumes = spec.get("consumes") or []
    if not isinstance(consumes, list):
        raise ValueError(
            f"{operation.surface}.{operation.path}.{operation.method} "
            "effective Swagger consumes value must be an array"
        )
    lines = [f"Swagger consumes: {compact_text(consumes)}", ""]
    if body_parameters:
        lines.extend(
            [
                "| Body parameter | Required | Schema | Description |",
                "| --- | --- | --- | --- |",
            ]
        )
        for parameter in body_parameters:
            lines.append(
                "| "
                + " | ".join(
                    (
                        code(parameter.get("name")),
                        "yes" if parameter.get("required") is True else "no",
                        schema_summary(parameter.get("schema")),
                        compact_text(parameter.get("description")),
                    )
                )
                + " |"
            )
    if form_parameters:
        if body_parameters:
            lines.append("")
        lines.extend(
            [
                "Form fields are listed in the Parameters table; follow the "
                "Swagger `formData` definitions and `consumes` media type.",
            ]
        )
    return lines


def response_content_summary(
    response: Mapping[str, Any], swagger_produces: Sequence[Any] = ()
) -> str:
    """Summarize response media types and schemas."""

    content = response.get("content")
    if isinstance(content, Mapping):
        if not content:
            return "No content declared"
        parts: list[str] = []
        for media_type, media in content.items():
            schema = media.get("schema") if isinstance(media, Mapping) else None
            parts.append(f"{compact_text(media_type)}: {schema_summary(schema)}")
        return "; ".join(parts)
    if "schema" in response:
        rendered_schema = schema_summary(response.get("schema"))
        media_types = ", ".join(str(item) for item in swagger_produces)
        return f"{compact_text(media_types)}: {rendered_schema}" if media_types else rendered_schema
    return "Not provided"


def render_responses(
    operation: Operation, spec: Mapping[str, Any]
) -> list[str]:
    """Render every documented response entry."""

    responses = operation.operation.get("responses")
    if not isinstance(responses, Mapping) or not responses:
        raise ValueError(
            f"{operation.surface}.{operation.path}.{operation.method} "
            "must declare a non-empty responses object"
        )

    produces = operation.operation.get("produces")
    if produces is None:
        produces = spec.get("produces") or []
    if not isinstance(produces, list):
        raise ValueError(
            f"{operation.surface}.{operation.path}.{operation.method} "
            "effective Swagger produces value must be an array"
        )

    lines = [
        "| Status | Description | Content/schema | Headers |",
        "| --- | --- | --- | --- |",
    ]
    for status, response in responses.items():
        if not isinstance(response, Mapping):
            raise ValueError(
                f"{operation.surface}.{operation.path}.{operation.method} "
                f"response {status!r} must be an object"
            )
        if "$ref" in response:
            description = f"Reference {code(response['$ref'])}"
            content = "Not provided"
            headers = "Not provided"
        else:
            description = compact_text(response.get("description"))
            content = response_content_summary(response, produces)
            raw_headers = response.get("headers") or {}
            if not isinstance(raw_headers, Mapping):
                raise ValueError(
                    f"{operation.surface}.{operation.path}.{operation.method} "
                    f"response {status!r} headers must be an object"
                )
            headers = ", ".join(f"`{name}`" for name in raw_headers) or "Not provided"
        lines.append(f"| {code(status)} | {description} | {content} | {headers} |")
    return lines


def render_server(server: Mapping[str, Any], *, context: str) -> str:
    """Render an OpenAPI Server Object, including variable defaults and enums."""

    raw_url = server.get("url")
    if not isinstance(raw_url, str) or not raw_url:
        raise ValueError(f"{context}.url must be a non-empty string")
    url = compact_text(raw_url)
    name = compact_text(server.get("name"), default="")
    description = compact_text(server.get("description"), default="")
    variables = server.get("variables") or {}
    if not isinstance(variables, Mapping):
        raise ValueError(f"{context}.variables must be an object")
    rendered_variables: list[str] = []
    for variable_name, variable in variables.items():
        if not isinstance(variable, Mapping):
            raise ValueError(f"{context}.variables.{variable_name} must be an object")
        if "default" not in variable:
            raise ValueError(
                f"{context}.variables.{variable_name} must declare a default value"
            )
        if not isinstance(variable["default"], str):
            raise ValueError(
                f"{context}.variables.{variable_name}.default must be a string"
            )
        details = f"{variable_name} default={compact_text(variable['default'])}"
        enum = variable.get("enum")
        if enum is not None:
            if not isinstance(enum, list):
                raise ValueError(f"{context}.variables.{variable_name}.enum must be an array")
            details += f" enum={compact_text(enum)}"
        rendered_variables.append(details)

    annotations = []
    if name:
        annotations.append(f"name={name}")
    if description:
        annotations.append(description)
    if rendered_variables:
        annotations.append("variables: " + "; ".join(rendered_variables))
    return f"{url} ({'; '.join(annotations)})" if annotations else url


def contract_servers(spec: Mapping[str, Any]) -> list[str]:
    """Return server/base URL descriptions for OpenAPI or Swagger."""

    servers = spec.get("servers")
    if servers is not None:
        if not isinstance(servers, list):
            raise ValueError("top-level OpenAPI servers must be an array")
        output = []
        for index, server in enumerate(servers):
            if isinstance(server, Mapping):
                output.append(render_server(server, context=f"servers[{index}]"))
            else:
                raise ValueError(f"servers[{index}] must be an object")
        return output

    host = spec.get("host")
    base_path = spec.get("basePath", "")
    schemes = spec.get("schemes") or []
    if not isinstance(schemes, list):
        raise ValueError("top-level Swagger schemes must be an array")
    if host:
        if schemes:
            return [f"{scheme}://{host}{base_path}" for scheme in schemes]
        return [f"//{host}{base_path}"]
    return []


def security_schemes(spec: Mapping[str, Any]) -> Mapping[str, Any]:
    """Return OpenAPI 3 or Swagger 2 security schemes."""

    components = spec.get("components")
    if isinstance(components, Mapping):
        schemes = components.get("securitySchemes")
        if isinstance(schemes, Mapping):
            return schemes
    schemes = spec.get("securityDefinitions")
    return schemes if isinstance(schemes, Mapping) else {}


def render_security_schemes(spec: Mapping[str, Any]) -> list[str]:
    """Render security-scheme metadata without examples or credentials."""

    schemes = security_schemes(spec)
    if not schemes:
        return ["None declared."]
    lines = [
        "| Scheme | Type | In | Name/scheme | Description |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, scheme in schemes.items():
        if not isinstance(scheme, Mapping):
            lines.append(
                f"| {code(name)} | Not provided | Not provided | Not provided | "
                f"{compact_text(scheme)} |"
            )
            continue
        if "$ref" in scheme:
            lines.append(
                f"| {code(name)} | Not provided | Not provided | "
                f"{code(scheme['$ref'])} | Reference |"
            )
            continue
        scheme_name = scheme.get("name") or scheme.get("scheme") or scheme.get("openIdConnectUrl")
        lines.append(
            "| "
            + " | ".join(
                (
                    code(name),
                    code(scheme.get("type")),
                    code(scheme.get("in")),
                    code(scheme_name),
                    compact_text(scheme.get("description")),
                )
            )
            + " |"
        )
    return lines


def operation_servers(operation: Operation, spec: Mapping[str, Any]) -> str:
    """Render per-operation or path-level server overrides."""

    if spec.get("swagger"):
        schemes = operation.operation.get("schemes")
        if schemes is None:
            return "Use contract-level Swagger schemes/host/basePath"
        if (
            not isinstance(schemes, list)
            or not schemes
            or not all(isinstance(scheme, str) and scheme for scheme in schemes)
        ):
            raise ValueError(
                f"{operation.surface}.{operation.path}.{operation.method} "
                "Swagger schemes override must be a non-empty string array"
            )
        host = spec.get("host")
        base_path = spec.get("basePath", "")
        if host:
            effective = ", ".join(
                f"{compact_text(scheme)}://{compact_text(host)}"
                f"{compact_text(base_path, default='')}"
                for scheme in schemes
            )
            return f"Swagger operation override: {effective}"
        return (
            "Swagger operation scheme override: "
            + ", ".join(code(scheme) for scheme in schemes)
            + "; resolve host/basePath from the authorized retrieval context"
        )

    servers = operation.operation.get("servers")
    if servers is None:
        servers = operation.path_item.get("servers")
    if servers is None:
        return "Use contract-level server"
    if not isinstance(servers, list):
        raise ValueError(
            f"{operation.surface}.{operation.path}.{operation.method} servers must be an array"
        )
    rendered = []
    for index, server in enumerate(servers):
        if isinstance(server, Mapping):
            rendered.append(
                render_server(
                    server,
                    context=(
                        f"{operation.surface}.{operation.path}.{operation.method}"
                        f".servers[{index}]"
                    ),
                )
            )
        else:
            raise ValueError(
                f"{operation.surface}.{operation.path}.{operation.method} "
                f"servers[{index}] must be an object"
            )
    return ", ".join(rendered) or "No servers declared"


def schema_catalog_summary(schema: Any, *, context: str) -> dict[str, Any] | None:
    """Return a safe structural schema summary without copying the schema."""

    if schema is None:
        return None
    if isinstance(schema, bool):
        return {"kind": "boolean_schema", "value": schema}
    if not isinstance(schema, Mapping):
        raise ValueError(f"{context} schema must be an object or boolean")

    summary: dict[str, Any] = {
        "kind": "reference" if "$ref" in schema else "inline"
    }
    if "$ref" in schema:
        ref = schema["$ref"]
        if not isinstance(ref, str) or not ref:
            raise ValueError(f"{context} schema $ref must be a non-empty string")
        summary["ref"] = ref

    schema_type = schema.get("type")
    if schema_type is not None:
        if isinstance(schema_type, str):
            summary["type"] = schema_type
        elif isinstance(schema_type, list) and all(
            isinstance(item, str) for item in schema_type
        ):
            summary["type"] = list(schema_type)
        else:
            raise ValueError(f"{context} schema type must be a string or string array")

    for source_key, output_key in (
        ("format", "format"),
        ("contentEncoding", "content_encoding"),
        ("contentMediaType", "content_media_type"),
    ):
        value = schema.get(source_key)
        if value is not None:
            if not isinstance(value, str):
                raise ValueError(f"{context} schema {source_key} must be a string")
            summary[output_key] = value

    for source_key, output_key in (
        ("nullable", "nullable"),
        ("readOnly", "read_only"),
        ("writeOnly", "write_only"),
        ("deprecated", "deprecated"),
        ("uniqueItems", "unique_items"),
    ):
        if source_key in schema:
            value = schema[source_key]
            if not isinstance(value, bool):
                raise ValueError(f"{context} schema {source_key} must be a boolean")
            summary[output_key] = value

    if "enum" in schema:
        enum = schema["enum"]
        if not isinstance(enum, list):
            raise ValueError(f"{context} schema enum must be an array")
        summary["enum"] = enum

    constraints: dict[str, Any] = {}
    for source_key, output_key in (
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
    ):
        if source_key in schema:
            constraints[output_key] = schema[source_key]
    if constraints:
        summary["constraints"] = constraints

    properties = schema.get("properties")
    if properties is not None:
        if not isinstance(properties, Mapping):
            raise ValueError(f"{context} schema properties must be an object")
        summary["property_count"] = len(properties)

    required_properties = schema.get("required")
    if required_properties is not None:
        if not isinstance(required_properties, list) or not all(
            isinstance(item, str) for item in required_properties
        ):
            raise ValueError(f"{context} schema required must be a string array")
        summary["required_properties"] = sorted(required_properties)

    if "items" in schema:
        summary["items"] = schema_catalog_summary(
            schema["items"], context=f"{context}.items"
        )
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
        summary["not"] = schema_catalog_summary(
            schema["not"], context=f"{context}.not"
        )

    additional_properties = schema.get("additionalProperties")
    if additional_properties is not None:
        if isinstance(additional_properties, bool):
            summary["additional_properties"] = additional_properties
        elif isinstance(additional_properties, Mapping):
            summary["additional_properties"] = schema_catalog_summary(
                additional_properties,
                context=f"{context}.additionalProperties",
            )
        else:
            raise ValueError(
                f"{context} schema additionalProperties must be an object or boolean"
            )
    return summary


def catalog_media_content(content: Any, *, context: str) -> list[dict[str, Any]]:
    """Summarize an OpenAPI Media Types Map without examples or encodings."""

    if content is None:
        return []
    if not isinstance(content, Mapping):
        raise ValueError(f"{context} must be an object")
    output: list[dict[str, Any]] = []
    for media_type, media in sorted(content.items(), key=lambda item: str(item[0])):
        if not isinstance(media_type, str):
            raise ValueError(f"{context} contains a non-string media type")
        if not isinstance(media, Mapping):
            raise ValueError(f"{context}.{media_type} must be an object")
        output.append(
            {
                "media_type": media_type,
                "schema": schema_catalog_summary(
                    media.get("schema"), context=f"{context}.{media_type}"
                ),
            }
        )
    return output


def catalog_parameter(
    parameter: Any, *, context: str, source: str
) -> dict[str, Any]:
    """Summarize one parameter while excluding examples and arbitrary extensions."""

    if not isinstance(parameter, Mapping):
        raise ValueError(f"{context} must be an object")
    output: dict[str, Any] = {"source": source}
    if "$ref" in parameter:
        ref = parameter["$ref"]
        if not isinstance(ref, str) or not ref:
            raise ValueError(f"{context} $ref must be a non-empty string")
        output.update({"kind": "reference", "ref": ref})
        return output

    output["kind"] = "inline"
    for key in ("name", "in", "style"):
        value = parameter.get(key)
        if value is not None:
            if not isinstance(value, str):
                raise ValueError(f"{context}.{key} must be a string")
            output[key] = value
    for source_key, output_key in (
        ("required", "required"),
        ("deprecated", "deprecated"),
        ("allowEmptyValue", "allow_empty_value"),
        ("allowReserved", "allow_reserved"),
        ("explode", "explode"),
    ):
        if source_key in parameter:
            value = parameter[source_key]
            if not isinstance(value, bool):
                raise ValueError(f"{context}.{source_key} must be a boolean")
            output[output_key] = value

    schema = parameter.get("schema")
    if schema is None and parameter.get("type") is not None:
        schema = {
            key: parameter[key]
            for key in (
                "type",
                "format",
                "items",
                "enum",
                "minimum",
                "maximum",
                "minLength",
                "maxLength",
                "pattern",
            )
            if key in parameter
        }
    output["schema"] = schema_catalog_summary(schema, context=f"{context}.schema")
    if "content" in parameter:
        output["content"] = catalog_media_content(
            parameter["content"], context=f"{context}.content"
        )
    return output


def catalog_parameters(operation: Operation) -> list[dict[str, Any]]:
    """Return path-item and operation parameters with explicit provenance."""

    output: list[dict[str, Any]] = []
    for owner, source in (
        (operation.path_item, "path_item"),
        (operation.operation, "operation"),
    ):
        parameters = owner.get("parameters") or []
        if not isinstance(parameters, list):
            raise ValueError(
                f"{operation.location} {source} parameters must be an array"
            )
        for index, parameter in enumerate(parameters):
            output.append(
                catalog_parameter(
                    parameter,
                    context=f"{operation.location}.{source}.parameters[{index}]",
                    source=source,
                )
            )
    return output


def catalog_request_body(
    operation: Operation, spec: Mapping[str, Any]
) -> dict[str, Any]:
    """Return a structured OpenAPI or Swagger request-body summary."""

    request_body = operation.operation.get("requestBody")
    if request_body is not None:
        if not isinstance(request_body, Mapping):
            raise ValueError(f"{operation.location}.requestBody must be an object")
        if "$ref" in request_body:
            ref = request_body["$ref"]
            if not isinstance(ref, str) or not ref:
                raise ValueError(
                    f"{operation.location}.requestBody.$ref must be a non-empty string"
                )
            return {"kind": "reference", "ref": ref}
        return {
            "kind": "openapi3",
            "required": request_body.get("required") is True,
            "content": catalog_media_content(
                request_body.get("content") or {},
                context=f"{operation.location}.requestBody.content",
            ),
        }

    body_parameters: list[dict[str, Any]] = []
    form_parameters: list[dict[str, Any]] = []
    for index, parameter in enumerate(operation_parameters(operation)):
        if not isinstance(parameter, Mapping):
            raise ValueError(f"{operation.location}.parameters[{index}] must be an object")
        location = parameter.get("in")
        if location not in {"body", "formData"}:
            continue
        summarized = catalog_parameter(
            parameter,
            context=f"{operation.location}.parameters[{index}]",
            source="effective",
        )
        if location == "body":
            body_parameters.append(summarized)
        else:
            form_parameters.append(summarized)
    if not body_parameters and not form_parameters:
        return {"kind": "none"}

    consumes = operation.operation.get("consumes")
    if consumes is None:
        consumes = spec.get("consumes") or []
    if not isinstance(consumes, list) or not all(
        isinstance(item, str) for item in consumes
    ):
        raise ValueError(
            f"{operation.location} effective Swagger consumes must be a string array"
        )
    return {
        "kind": "swagger2",
        "consumes": list(consumes),
        "body_parameters": body_parameters,
        "form_parameters": form_parameters,
    }


def catalog_response_headers(headers: Any, *, context: str) -> list[dict[str, Any]]:
    """Summarize response headers without header examples or defaults."""

    if headers is None:
        return []
    if not isinstance(headers, Mapping):
        raise ValueError(f"{context} must be an object")
    output: list[dict[str, Any]] = []
    for name, header in sorted(headers.items(), key=lambda item: str(item[0])):
        if not isinstance(name, str):
            raise ValueError(f"{context} contains a non-string header name")
        if not isinstance(header, Mapping):
            raise ValueError(f"{context}.{name} must be an object")
        record: dict[str, Any] = {"name": name}
        if "$ref" in header:
            ref = header["$ref"]
            if not isinstance(ref, str) or not ref:
                raise ValueError(f"{context}.{name}.$ref must be a non-empty string")
            record.update({"kind": "reference", "ref": ref})
        else:
            schema = header.get("schema")
            if schema is None and header.get("type") is not None:
                schema = {
                    key: header[key]
                    for key in ("type", "format", "items", "enum")
                    if key in header
                }
            record.update(
                {
                    "kind": "inline",
                    "required": header.get("required") is True,
                    "schema": schema_catalog_summary(
                        schema, context=f"{context}.{name}.schema"
                    ),
                }
            )
        output.append(record)
    return output


def catalog_responses(
    operation: Operation, spec: Mapping[str, Any]
) -> list[dict[str, Any]]:
    """Return every response with statuses, media schemas, and header names."""

    responses = operation.operation.get("responses")
    if not isinstance(responses, Mapping) or not responses:
        raise ValueError(f"{operation.location} must declare a non-empty responses object")
    produces = operation.operation.get("produces")
    if produces is None:
        produces = spec.get("produces") or []
    if not isinstance(produces, list) or not all(
        isinstance(item, str) for item in produces
    ):
        raise ValueError(
            f"{operation.location} effective Swagger produces must be a string array"
        )

    output: list[dict[str, Any]] = []
    for raw_status, response in sorted(
        responses.items(), key=lambda item: str(item[0])
    ):
        status = str(raw_status)
        if not isinstance(response, Mapping):
            raise ValueError(f"{operation.location}.responses.{status} must be an object")
        record: dict[str, Any] = {"status": status}
        if "$ref" in response:
            ref = response["$ref"]
            if not isinstance(ref, str) or not ref:
                raise ValueError(
                    f"{operation.location}.responses.{status}.$ref must be a non-empty string"
                )
            record.update({"kind": "reference", "ref": ref})
        else:
            description = response.get("description")
            if description is not None and not isinstance(description, str):
                raise ValueError(
                    f"{operation.location}.responses.{status}.description must be a string"
                )
            record.update(
                {
                    "kind": "inline",
                    "description": description,
                    "headers": catalog_response_headers(
                        response.get("headers") or {},
                        context=f"{operation.location}.responses.{status}.headers",
                    ),
                }
            )
            if "content" in response:
                record["content"] = catalog_media_content(
                    response["content"],
                    context=f"{operation.location}.responses.{status}.content",
                )
            elif "schema" in response:
                schema = schema_catalog_summary(
                    response.get("schema"),
                    context=f"{operation.location}.responses.{status}.schema",
                )
                record["content"] = [
                    {"media_type": media_type, "schema": schema}
                    for media_type in produces
                ] or [{"media_type": None, "schema": schema}]
            else:
                record["content"] = []
        output.append(record)
    return output


def catalog_security(security: Any, *, context: str) -> dict[str, Any]:
    """Return security alternatives without credentials or example values."""

    if security is None:
        return {"declared": False, "anonymous": False, "alternatives": []}
    if not isinstance(security, list):
        raise ValueError(f"{context} must be an array")
    alternatives: list[dict[str, Any]] = []
    anonymous = not security
    for index, requirement in enumerate(security):
        if not isinstance(requirement, Mapping):
            raise ValueError(f"{context}[{index}] must be an object")
        schemes: list[dict[str, Any]] = []
        if not requirement:
            anonymous = True
        for name, scopes in sorted(requirement.items(), key=lambda item: str(item[0])):
            if not isinstance(name, str):
                raise ValueError(f"{context}[{index}] contains a non-string scheme name")
            if not isinstance(scopes, list) or not all(
                isinstance(scope, str) for scope in scopes
            ):
                raise ValueError(
                    f"{context}[{index}].{name} scopes must be a string array"
                )
            schemes.append({"name": name, "scopes": list(scopes)})
        alternatives.append({"schemes": schemes})
    return {
        "declared": True,
        "anonymous": anonymous,
        "alternatives": alternatives,
    }


def catalog_security_schemes(spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Return selected security-scheme fields while omitting secret-bearing examples."""

    output: list[dict[str, Any]] = []
    for name, scheme in sorted(security_schemes(spec).items(), key=lambda item: str(item[0])):
        if not isinstance(name, str):
            raise ValueError("security schemes contain a non-string name")
        if not isinstance(scheme, Mapping):
            raise ValueError(f"security scheme {name!r} must be an object")
        record: dict[str, Any] = {"name": name}
        if "$ref" in scheme:
            ref = scheme["$ref"]
            if not isinstance(ref, str) or not ref:
                raise ValueError(f"security scheme {name!r} $ref must be a non-empty string")
            record.update({"kind": "reference", "ref": ref})
            output.append(record)
            continue

        record["kind"] = "inline"
        for source_key, output_key in (
            ("type", "type"),
            ("in", "in"),
            ("name", "parameter_name"),
            ("scheme", "scheme"),
            ("bearerFormat", "bearer_format"),
            ("openIdConnectUrl", "open_id_connect_url"),
            ("flow", "flow"),
            ("authorizationUrl", "authorization_url"),
            ("tokenUrl", "token_url"),
        ):
            value = scheme.get(source_key)
            if value is not None:
                if not isinstance(value, str):
                    raise ValueError(f"security scheme {name!r} {source_key} must be a string")
                record[output_key] = value

        raw_scopes = scheme.get("scopes")
        if raw_scopes is not None:
            if not isinstance(raw_scopes, Mapping) or not all(
                isinstance(scope, str) for scope in raw_scopes
            ):
                raise ValueError(f"security scheme {name!r} scopes must be an object")
            record["scopes"] = sorted(raw_scopes)

        raw_flows = scheme.get("flows")
        if raw_flows is not None:
            if not isinstance(raw_flows, Mapping):
                raise ValueError(f"security scheme {name!r} flows must be an object")
            flows: list[dict[str, Any]] = []
            for flow_name, flow in sorted(raw_flows.items(), key=lambda item: str(item[0])):
                if not isinstance(flow_name, str) or not isinstance(flow, Mapping):
                    raise ValueError(f"security scheme {name!r} contains an invalid flow")
                flow_record: dict[str, Any] = {"name": flow_name}
                for source_key, output_key in (
                    ("authorizationUrl", "authorization_url"),
                    ("tokenUrl", "token_url"),
                    ("refreshUrl", "refresh_url"),
                ):
                    value = flow.get(source_key)
                    if value is not None:
                        if not isinstance(value, str):
                            raise ValueError(
                                f"security scheme {name!r} flow {flow_name!r} "
                                f"{source_key} must be a string"
                            )
                        flow_record[output_key] = value
                scopes = flow.get("scopes") or {}
                if not isinstance(scopes, Mapping) or not all(
                    isinstance(scope, str) for scope in scopes
                ):
                    raise ValueError(
                        f"security scheme {name!r} flow {flow_name!r} scopes "
                        "must be an object"
                    )
                flow_record["scopes"] = sorted(scopes)
                flows.append(flow_record)
            record["flows"] = flows
        output.append(record)
    return output


def catalog_openapi_server(server: Any, *, context: str) -> dict[str, Any]:
    """Return a structured Server Object after applying existing validation."""

    if not isinstance(server, Mapping):
        raise ValueError(f"{context} must be an object")
    render_server(server, context=context)
    record: dict[str, Any] = {"url": server["url"]}
    if isinstance(server.get("name"), str):
        record["name"] = server["name"]
    variables = server.get("variables") or {}
    record["variables"] = [
        {
            "name": name,
            "default": variable["default"],
            **({"enum": list(variable["enum"])} if "enum" in variable else {}),
        }
        for name, variable in sorted(variables.items(), key=lambda item: str(item[0]))
    ]
    return record


def catalog_contract_servers(spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Return contract-level OpenAPI servers or Swagger effective base URLs."""

    if "servers" in spec:
        servers = spec["servers"]
        if not isinstance(servers, list):
            raise ValueError("top-level OpenAPI servers must be an array")
        return [
            catalog_openapi_server(server, context=f"servers[{index}]")
            for index, server in enumerate(servers)
        ]

    contract_servers(spec)
    host = spec.get("host")
    base_path = spec.get("basePath", "")
    if host is not None and not isinstance(host, str):
        raise ValueError("top-level Swagger host must be a string")
    if not isinstance(base_path, str):
        raise ValueError("top-level Swagger basePath must be a string")
    schemes = spec.get("schemes") or []
    return [
        {
            "kind": "swagger2",
            "scheme": scheme,
            "host": host,
            "base_path": base_path,
            "url": f"{scheme}://{host}{base_path}" if host else None,
        }
        for scheme in schemes
    ]


def catalog_operation_servers(
    operation: Operation, spec: Mapping[str, Any]
) -> dict[str, Any]:
    """Return effective server provenance and selected server fields."""

    operation_servers(operation, spec)
    if spec.get("swagger"):
        schemes = operation.operation.get("schemes")
        if schemes is None:
            return {"source": "contract", "entries": catalog_contract_servers(spec)}
        host = spec.get("host")
        base_path = spec.get("basePath", "")
        return {
            "source": "operation",
            "entries": [
                {
                    "kind": "swagger2",
                    "scheme": scheme,
                    "host": host,
                    "base_path": base_path,
                    "url": f"{scheme}://{host}{base_path}" if host else None,
                }
                for scheme in schemes
            ],
        }

    if "servers" in operation.operation:
        source = "operation"
        servers = operation.operation["servers"]
    elif "servers" in operation.path_item:
        source = "path_item"
        servers = operation.path_item["servers"]
    elif "servers" in spec:
        return {"source": "contract", "entries": catalog_contract_servers(spec)}
    else:
        return {"source": "not_declared", "entries": []}
    if not isinstance(servers, list):
        raise ValueError(f"{operation.location}.servers must be an array")
    return {
        "source": source,
        "entries": [
            catalog_openapi_server(
                server, context=f"{operation.location}.servers[{index}]"
            )
            for index, server in enumerate(servers)
        ],
    }


def operation_machine_key(operation: Operation) -> str:
    """Return a deterministic binding key derived from the operation location."""

    key_material = json.dumps(
        [
            operation.surface,
            operation.location,
            operation.lineage or "",
            operation.method,
            operation.path,
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return "operation.sha256." + hashlib.sha256(key_material).hexdigest()


def build_machine_catalog(
    spec: Mapping[str, Any], raw: bytes, source_name: str
) -> dict[str, Any]:
    """Build the generated, machine-readable operation catalog."""

    operations = collect_operations(spec)
    raw_info = spec.get("info")
    info: Mapping[str, Any] = raw_info if isinstance(raw_info, Mapping) else {}
    for field in ("title", "version"):
        if info.get(field) is not None and not isinstance(info[field], str):
            raise ValueError(f"info.{field} must be a string")
    contract_kind = "openapi" if spec.get("openapi") else "swagger"
    contract_version = spec.get("openapi") or spec.get("swagger")
    digest = hashlib.sha256(raw).hexdigest()
    fixed_wire_methods = {
        method.upper() for method in fixed_http_method_fields(spec)
    }
    global_security = spec.get("security")
    operation_records: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for operation in operations:
        details = operation.operation
        operation_id = details.get("operationId")
        summary = details.get("summary")
        if operation_id is not None and not isinstance(operation_id, str):
            raise ValueError(f"{operation.location}.operationId must be a string")
        if summary is not None and not isinstance(summary, str):
            raise ValueError(f"{operation.location}.summary must be a string")
        tags = details.get("tags") or []
        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            raise ValueError(f"{operation.location}.tags must be a string array")
        if "deprecated" in details and not isinstance(details["deprecated"], bool):
            raise ValueError(f"{operation.location}.deprecated must be a boolean")

        key = operation_machine_key(operation)
        if key in seen_keys:
            raise ValueError(
                f"duplicate generated operation key for {operation.location}; "
                "the contract traversal location is ambiguous"
            )
        seen_keys.add(key)
        if "security" in details:
            security_source = "operation"
            effective_security = details["security"]
        elif "security" in spec:
            security_source = "contract"
            effective_security = global_security
        else:
            security_source = "not_declared"
            effective_security = None
        callbacks = details.get("callbacks") or {}
        if not isinstance(callbacks, Mapping):
            raise ValueError(f"{operation.location}.callbacks must be an object")
        operation_records.append(
            {
                "key": key,
                "source_location": operation.location,
                "surface": operation.surface,
                "method": operation.method,
                "path": operation.path,
                "operation_id": operation_id,
                "tags": list(tags),
                "summary": summary,
                "deprecated": details.get("deprecated") is True,
                "lineage": operation.lineage,
                "parameters": catalog_parameters(operation),
                "request_body": catalog_request_body(operation, spec),
                "responses": catalog_responses(operation, spec),
                "security": {
                    "source": security_source,
                    **catalog_security(
                        effective_security,
                        context=f"{operation.location}.effective_security",
                    ),
                },
                "servers": catalog_operation_servers(operation, spec),
                "declared_callbacks": sorted(str(name) for name in callbacks),
            }
        )

    callback_operation_count = sum(
        operation.surface == "callbacks" for operation in operations
    )
    additional_operation_count = sum(
        operation.method.upper() not in fixed_wire_methods for operation in operations
    )
    global_security_source = "contract" if "security" in spec else "not_declared"
    return {
        "document_type": "relution_openapi_operation_catalog",
        "schema_version": "1.0.0",
        "status": "generated",
        "generated_by": "scripts/render_relution_openapi.py",
        "source": {
            "file": source_name,
            "sha256": digest,
            "authority": "supplied_contract",
        },
        "contract": {
            "kind": contract_kind,
            "version": contract_version,
            "info": {
                "title": info.get("title"),
                "version": info.get("version"),
            },
            "counts": {
                "paths": len(spec.get("paths") or {}),
                "webhooks": len(spec.get("webhooks") or {}),
                "callback_operations": callback_operation_count,
                "additional_method_operations": additional_operation_count,
                "operations": len(operations),
            },
        },
        "operation_count": len(operations),
        "operation_key": {
            "format": "operation.sha256.<64 lowercase hexadecimal digits>",
            "algorithm": (
                "SHA-256 of the UTF-8 canonical JSON array "
                "[surface, source_location, lineage_or_empty, method, path] "
                "using ensure_ascii=false and separators ',' ':'"
            ),
        },
        "completeness": {
            "operation_coverage": "complete_for_supplied_contract",
            "surfaces": ["paths", "webhooks", "callbacks"],
            "openapi_3_2_query_included": True,
            "openapi_3_2_additional_operations_included": True,
            "recursive_callbacks_included": True,
            "local_operation_bearing_references": "resolved",
            "external_operation_bearing_references": "rejected",
            "schema_detail": "structural_summaries_only",
            "examples_included": False,
            "extensions_included": False,
            "source_contract_authoritative": True,
            "runtime_permissions_verified": False,
            "licensed_features_verified": False,
        },
        "servers": {
            "source": "contract" if catalog_contract_servers(spec) else "not_declared",
            "entries": catalog_contract_servers(spec),
        },
        "security_schemes": catalog_security_schemes(spec),
        "global_security": {
            "source": global_security_source,
            **catalog_security(global_security, context="security"),
        },
        "operations": operation_records,
    }


def render_machine_catalog(
    spec: Mapping[str, Any], raw: bytes, source_name: str
) -> str:
    """Render a deterministic JSON catalog with a terminal newline."""

    return (
        json.dumps(
            build_machine_catalog(spec, raw, source_name),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def render_catalog(spec: Mapping[str, Any], raw: bytes, source_name: str) -> str:
    """Render a deterministic Markdown operation catalog."""

    operations = collect_operations(spec)
    raw_info = spec.get("info")
    info: Mapping[str, Any] = raw_info if isinstance(raw_info, Mapping) else {}
    title = compact_text(info.get("title"), default="Relution")
    info_version = compact_text(info.get("version"), default="not declared")
    contract_version = spec.get("openapi") or spec.get("swagger")
    contract_kind = "OpenAPI" if spec.get("openapi") else "Swagger"
    digest = hashlib.sha256(raw).hexdigest()
    path_count = len(spec.get("paths") or {})
    webhook_count = len(spec.get("webhooks") or {})
    callback_operation_count = sum(
        operation.surface == "callbacks" for operation in operations
    )
    fixed_wire_methods = {
        method.upper() for method in fixed_http_method_fields(spec)
    }
    additional_operation_count = sum(
        operation.method.upper() not in fixed_wire_methods for operation in operations
    )
    global_security = spec.get("security")

    lines: list[str] = [
        f"# {title} API operation catalog",
        "",
        "> Generated by `scripts/render_relution_openapi.py`. Do not edit by hand.",
        "> The source JSON remains authoritative for complete schema constraints.",
        "",
        f"- Contract format: **{contract_kind} {compact_text(contract_version)}**",
        f"- API info version: **{info_version}**",
        f"- Source file: `{compact_text(source_name)}`",
        f"- Source SHA-256: `{digest}`",
        f"- Paths: **{path_count}**",
        f"- Webhooks: **{webhook_count}**",
        f"- Callback operations: **{callback_operation_count}**",
        f"- Additional-method operations: **{additional_operation_count}**",
        f"- Operations: **{len(operations)}**",
        "",
        "## Completeness and use",
        "",
        "This file enumerates every Operation Object reachable beneath top-level "
        "`paths`, `webhooks`, and recursive callbacks in the supplied contract, "
        "including OpenAPI 3.2 `query` and `additionalOperations`. Local path-item "
        "and callback references are resolved; generation fails for external "
        "operation-bearing references or malformed entries so operations are not "
        "silently omitted.",
        "",
        "Before a live call, confirm the target host/version and this digest, then "
        "inspect the original JSON for full schemas, examples, extensions, and constraints. "
        "Catalog presence does not prove runtime permission, licensing, or authorization.",
        "",
        "## Contract servers",
        "",
    ]

    servers = contract_servers(spec)
    if servers:
        lines.extend(f"- {server}" for server in servers)
    else:
        lines.append("No contract-level server declared. Confirm the authorized base URL separately.")

    lines.extend(
        [
            "",
            "## Security schemes",
            "",
            *render_security_schemes(spec),
            "",
            f"Global security requirement: {security_summary(global_security)}",
            "",
            "## Operation index",
            "",
            "| # | Surface | Method | Path/name | Operation ID | Tags | Summary |",
            "| ---: | --- | --- | --- | --- | --- | --- |",
        ]
    )

    for index, operation in enumerate(operations, start=1):
        details = operation.operation
        tags = details.get("tags") or []
        tag_text = ", ".join(str(tag) for tag in tags) if isinstance(tags, list) else tags
        lines.append(
            "| "
            + " | ".join(
                (
                    str(index),
                    code(operation.surface),
                    code(operation.method),
                    code(operation.path),
                    code(details.get("operationId")),
                    compact_text(tag_text),
                    compact_text(details.get("summary")),
                )
            )
            + " |"
        )

    if not operations:
        lines.append(
            "| Not provided | Not provided | Not provided | Not provided | "
            "Not provided | Not provided | No operations declared |"
        )

    lines.extend(["", "## Operation details", ""])
    for index, operation in enumerate(operations, start=1):
        details = operation.operation
        effective_security = details.get("security", global_security)
        tags = details.get("tags") or []
        if isinstance(tags, list):
            tag_text = ", ".join(f"`{tag}`" for tag in tags) or "Not provided"
        else:
            tag_text = compact_text(tags)

        lines.extend(
            [
                f"### {index}. {compact_text(operation.method)} "
                f"{compact_text(operation.path)}",
                "",
                f"- Surface: `{operation.surface}`",
                *(
                    [f"- Callback lineage: {compact_text(operation.lineage)}"]
                    if operation.lineage
                    else []
                ),
                f"- Operation ID: {code(details.get('operationId'))}",
                f"- Tags: {tag_text}",
                f"- Summary: {compact_text(details.get('summary'))}",
                f"- Deprecated: {'yes' if details.get('deprecated') is True else 'no'}",
                f"- Security: {security_summary(effective_security)}",
                f"- Server override: {operation_servers(operation, spec)}",
            ]
        )

        external_docs = details.get("externalDocs")
        if isinstance(external_docs, Mapping) and external_docs.get("url"):
            lines.append(f"- External docs: {code(external_docs.get('url'))}")

        description = quote_block(details.get("description"))
        if description:
            lines.extend(["", *description])

        lines.extend(
            [
                "",
                "#### Parameters",
                "",
                *render_parameters(operation),
                "",
                "#### Request body",
                "",
                *render_request_body(operation, spec),
                "",
                "#### Responses",
                "",
                *render_responses(operation, spec),
            ]
        )

        callbacks = details.get("callbacks")
        if isinstance(callbacks, Mapping) and callbacks:
            lines.extend(
                [
                    "",
                    "#### Callbacks",
                    "",
                    "Declared callback names/references: "
                    + ", ".join(code(name) for name in callbacks),
                    "",
                    "Their Operation Objects are enumerated as separate `callbacks` "
                    "entries with parent lineage. They are server-initiated callbacks, "
                    "not top-level client-callable operations.",
                ]
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def atomic_write(path: Path, content: str) -> None:
    """Write a catalog atomically in its destination directory."""

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render or verify deterministic Markdown and JSON catalogs from OpenAPI JSON."
    )
    parser.add_argument("--spec", required=True, type=Path, help="OpenAPI/Swagger JSON file")
    parser.add_argument("--output", required=True, type=Path, help="Markdown catalog path")
    parser.add_argument(
        "--json-output",
        type=Path,
        help="optional machine-readable JSON catalog path",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "fail unless the Markdown output exactly matches; when --json-output "
            "is supplied, check both outputs"
        ),
    )
    parser.add_argument(
        "--json-check",
        action="store_true",
        help="fail unless --json-output exactly matches, without checking Markdown",
    )
    args = parser.parse_args(argv)
    if args.json_check and args.json_output is None:
        parser.error("--json-check requires --json-output")
    return args


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.spec.resolve() == args.output.resolve():
            raise ValueError("--spec and --output must be different files")
        if args.json_output is not None:
            if args.spec.resolve() == args.json_output.resolve():
                raise ValueError("--spec and --json-output must be different files")
            if args.output.resolve() == args.json_output.resolve():
                raise ValueError("--output and --json-output must be different files")
        spec, raw = load_spec(args.spec)
        catalog = render_catalog(spec, raw, args.spec.name)
        machine_catalog = (
            render_machine_catalog(spec, raw, args.spec.name)
            if args.json_output is not None
            else None
        )
        operation_count = len(collect_operations(spec))
        digest = hashlib.sha256(raw).hexdigest()

        check_markdown = args.check
        check_json = args.json_check or (args.check and args.json_output is not None)
        if check_markdown or check_json:
            checks: list[tuple[Path, str]] = []
            if check_markdown:
                checks.append((args.output, catalog))
            if check_json:
                assert args.json_output is not None and machine_catalog is not None
                checks.append((args.json_output, machine_catalog))

            stale = False
            for path, expected in checks:
                if not path.exists():
                    print(f"stale: catalog does not exist: {path}", file=sys.stderr)
                    stale = True
                elif path.read_bytes() != expected.encode("utf-8"):
                    print(
                        f"stale: {path} does not match {args.spec} "
                        f"(SHA-256 {digest})",
                        file=sys.stderr,
                    )
                    stale = True
            if stale:
                return 1

            if check_markdown and check_json:
                checked_path = f"{args.output} and {args.json_output}"
            elif check_json:
                checked_path = str(args.json_output)
            else:
                checked_path = str(args.output)
            print(
                f"current: {checked_path} contains {operation_count} operations "
                f"from SHA-256 {digest}"
            )
            return 0

        atomic_write(args.output, catalog)
        if args.json_output is not None:
            assert machine_catalog is not None
            atomic_write(args.json_output, machine_catalog)
            written_path = f"{args.output} and {args.json_output}"
        else:
            written_path = str(args.output)
        print(f"wrote {written_path}: {operation_count} operations, source SHA-256 {digest}")
        return 0
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
