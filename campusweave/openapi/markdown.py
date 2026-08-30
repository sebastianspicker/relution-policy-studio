from __future__ import annotations

from typing import Any, Mapping, Sequence

from .markdown_common import (
    code,
    compact_text,
    quote_block,
    schema_summary,
)
from .types import Operation


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


def _render_parameter(parameter: Any, *, context: str) -> str:
    if not isinstance(parameter, Mapping):
        raise ValueError(f"{context} contains a non-object parameter")
    if "$ref" in parameter:
        return f"| {code(parameter['$ref'])} | Not provided | Not provided | Not provided | Reference |"
    schema = parameter.get("schema") or _swagger_parameter_schema(parameter)
    return (
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


def _swagger_parameter_schema(parameter: Mapping[str, Any]) -> Any:
    if not parameter.get("type"):
        return None
    return {
        key: parameter[key]
        for key in ("type", "format", "items", "enum", "default")
        if key in parameter
    }


def render_parameters(operation: Operation) -> list[str]:
    """Render parameter details for one operation."""

    parameters = operation_parameters(operation)
    if not parameters:
        return ["None declared."]

    lines = [
        "| Name/reference | In | Required | Schema | Description |",
        "| --- | --- | --- | --- | --- |",
    ]
    context = f"{operation.surface}.{operation.path}.{operation.method}"
    lines.extend(_render_parameter(parameter, context=context) for parameter in parameters)
    return lines


def _render_openapi_request_body(request_body: Mapping[str, Any], *, context: str) -> list[str]:
    if "$ref" in request_body:
        return [f"Reference: {code(request_body['$ref'])}"]
    lines = [f"Required: {'yes' if request_body.get('required') is True else 'no'}"]
    description = quote_block(request_body.get("description"))
    if description:
        lines.extend(["", *description])
    content = request_body.get("content") or {}
    if not isinstance(content, Mapping):
        raise ValueError(f"{context}.content must be an object")
    if not content:
        return lines + ["", "No media types declared."]
    lines.extend(["", "| Media type | Schema |", "| --- | --- |"])
    lines.extend(
        _render_request_media(media_type, media, context) for media_type, media in content.items()
    )
    return lines


def _render_request_media(media_type: Any, media: Any, context: str) -> str:
    if not isinstance(media, Mapping):
        raise ValueError(f"{context} request media {media_type!r} must be an object")
    return f"| {code(media_type)} | {schema_summary(media.get('schema'))} |"


def _swagger_body_parameters(
    operation: Operation,
) -> tuple[list[Mapping[str, Any]], list[Mapping[str, Any]]]:
    parameters = [item for item in operation_parameters(operation) if isinstance(item, Mapping)]
    return (
        [item for item in parameters if item.get("in") == "body"],
        [item for item in parameters if item.get("in") == "formData"],
    )


def _render_swagger_request_body(operation: Operation, spec: Mapping[str, Any]) -> list[str]:
    body_parameters, form_parameters = _swagger_body_parameters(operation)
    if not body_parameters and not form_parameters:
        return ["None declared."]
    consumes = operation.operation.get("consumes", spec.get("consumes") or [])
    if not isinstance(consumes, list):
        raise ValueError(
            f"{operation.surface}.{operation.path}.{operation.method} effective Swagger consumes value must be an array"
        )
    lines = [f"Swagger consumes: {compact_text(consumes)}", ""]
    lines.extend(_render_swagger_body_rows(body_parameters))
    lines.extend(_render_swagger_form_notice(body_parameters, form_parameters))
    return lines


def _render_swagger_body_parameter(parameter: Mapping[str, Any]) -> str:
    return (
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


def _render_swagger_body_rows(parameters: list[Mapping[str, Any]]) -> list[str]:
    return (
        []
        if not parameters
        else [
            "| Body parameter | Required | Schema | Description |",
            "| --- | --- | --- | --- |",
            *(_render_swagger_body_parameter(item) for item in parameters),
        ]
    )


def _render_swagger_form_notice(
    body: list[Mapping[str, Any]], form: list[Mapping[str, Any]]
) -> list[str]:
    if not form:
        return []
    return ([""] if body else []) + [
        "Form fields are listed in the Parameters table; follow the Swagger `formData` definitions and `consumes` media type."
    ]


def render_request_body(operation: Operation, spec: Mapping[str, Any]) -> list[str]:
    """Render OpenAPI 3 requestBody or Swagger body/form parameters."""

    request_body = operation.operation.get("requestBody")
    context = f"{operation.surface}.{operation.path}.{operation.method}.requestBody"
    if request_body is not None:
        if not isinstance(request_body, Mapping):
            raise ValueError(f"{context} must be an object")
        return _render_openapi_request_body(request_body, context=context)
    return _render_swagger_request_body(operation, spec)


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


def render_responses(operation: Operation, spec: Mapping[str, Any]) -> list[str]:
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
    context = f"{operation.surface}.{operation.path}.{operation.method}"
    lines.extend(
        _render_response(status, response, produces, context)
        for status, response in responses.items()
    )
    return lines


def _render_response(status: Any, response: Any, produces: Sequence[Any], context: str) -> str:
    if not isinstance(response, Mapping):
        raise ValueError(f"{context} response {status!r} must be an object")
    description, content, headers = _response_cells(response, status, produces, context)
    return f"| {code(status)} | {description} | {content} | {headers} |"


def _response_cells(
    response: Mapping[str, Any], status: Any, produces: Sequence[Any], context: str
) -> tuple[str, str, str]:
    if "$ref" in response:
        return f"Reference {code(response['$ref'])}", "Not provided", "Not provided"
    raw_headers = response.get("headers") or {}
    if not isinstance(raw_headers, Mapping):
        raise ValueError(f"{context} response {status!r} headers must be an object")
    return (
        compact_text(response.get("description")),
        response_content_summary(response, produces),
        ", ".join(f"`{name}`" for name in raw_headers) or "Not provided",
    )


def render_server(server: Mapping[str, Any], *, context: str) -> str:
    """Render an OpenAPI Server Object, including variable defaults and enums."""

    url = _server_url(server, context)
    name = compact_text(server.get("name"), default="")
    description = compact_text(server.get("description"), default="")
    variables = _server_variables(server, context)
    rendered_variables = [
        _render_server_variable(key, value, context) for key, value in variables.items()
    ]
    annotations = [
        *([f"name={name}"] if name else []),
        *([description] if description else []),
        *(["variables: " + "; ".join(rendered_variables)] if rendered_variables else []),
    ]
    return f"{url} ({'; '.join(annotations)})" if annotations else url


def _server_url(server: Mapping[str, Any], context: str) -> str:
    url = server.get("url")
    if not isinstance(url, str) or not url:
        raise ValueError(f"{context}.url must be a non-empty string")
    return compact_text(url)


def _server_variables(server: Mapping[str, Any], context: str) -> Mapping[str, Any]:
    variables = server.get("variables") or {}
    if not isinstance(variables, Mapping):
        raise ValueError(f"{context}.variables must be an object")
    return variables


def _render_server_variable(name: Any, variable: Any, context: str) -> str:
    if not isinstance(variable, Mapping):
        raise ValueError(f"{context}.variables.{name} must be an object")
    default = variable.get("default")
    if not isinstance(default, str):
        raise ValueError(f"{context}.variables.{name}.default must be a string")
    enum = variable.get("enum")
    if enum is not None and not isinstance(enum, list):
        raise ValueError(f"{context}.variables.{name}.enum must be an array")
    return f"{name} default={compact_text(default)}" + (
        f" enum={compact_text(enum)}" if enum is not None else ""
    )


def contract_servers(spec: Mapping[str, Any]) -> list[str]:
    """Return server/base URL descriptions for OpenAPI or Swagger."""

    servers = spec.get("servers")
    if servers is not None:
        if not isinstance(servers, list):
            raise ValueError("top-level OpenAPI servers must be an array")
        return [_render_contract_server(server, index) for index, server in enumerate(servers)]

    return _swagger_contract_servers(spec)


def _swagger_contract_servers(spec: Mapping[str, Any]) -> list[str]:
    host, base_path, schemes = spec.get("host"), spec.get("basePath", ""), spec.get("schemes") or []
    if not isinstance(schemes, list):
        raise ValueError("top-level Swagger schemes must be an array")
    if host:
        if schemes:
            return [f"{scheme}://{host}{base_path}" for scheme in schemes]
        return [f"//{host}{base_path}"]
    return []


def _render_contract_server(server: Any, index: int) -> str:
    if not isinstance(server, Mapping):
        raise ValueError(f"servers[{index}] must be an object")
    return render_server(server, context=f"servers[{index}]")


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
        return _swagger_operation_servers(operation, spec)
    return _openapi_operation_servers(operation)


def _swagger_operation_servers(operation: Operation, spec: Mapping[str, Any]) -> str:
    schemes = operation.operation.get("schemes")
    if schemes is None:
        return "Use contract-level Swagger schemes/host/basePath"
    _validate_swagger_schemes(schemes, operation)
    host, base_path = spec.get("host"), spec.get("basePath", "")
    if not host:
        return (
            "Swagger operation scheme override: "
            + ", ".join(code(item) for item in schemes)
            + "; resolve host/basePath from the authorized retrieval context"
        )
    effective = ", ".join(
        f"{compact_text(item)}://{compact_text(host)}{compact_text(base_path, default='')}"
        for item in schemes
    )
    return f"Swagger operation override: {effective}"


def _validate_swagger_schemes(schemes: Any, operation: Operation) -> None:
    valid = (
        isinstance(schemes, list)
        and bool(schemes)
        and all(isinstance(item, str) and item for item in schemes)
    )
    if not valid:
        raise ValueError(
            f"{operation.surface}.{operation.path}.{operation.method} Swagger schemes override must be a non-empty string array"
        )


def _openapi_operation_servers(operation: Operation) -> str:
    servers = operation.operation.get("servers", operation.path_item.get("servers"))
    if servers is None:
        return "Use contract-level server"
    if not isinstance(servers, list):
        raise ValueError(
            f"{operation.surface}.{operation.path}.{operation.method} servers must be an array"
        )
    rendered = [
        _render_operation_server(server, index, operation) for index, server in enumerate(servers)
    ]
    return ", ".join(rendered) or "No servers declared"


def _render_operation_server(server: Any, index: int, operation: Operation) -> str:
    context = f"{operation.surface}.{operation.path}.{operation.method}.servers[{index}]"
    if not isinstance(server, Mapping):
        raise ValueError(f"{context} must be an object")
    return render_server(server, context=context)
