"""Structured OpenAPI values for the generated machine catalog."""

from __future__ import annotations

from typing import Any, Mapping

from .machine_schema import schema_catalog_summary
from .markdown import (
    contract_servers,
    operation_parameters,
    operation_servers,
    render_server,
    security_schemes,
)
from .types import Operation


def catalog_media_content(content: Any, *, context: str) -> list[dict[str, Any]]:
    """Summarize an OpenAPI Media Types Map without examples or encodings."""
    if content is None:
        return []
    if not isinstance(content, Mapping):
        raise ValueError(f"{context} must be an object")
    entries = sorted(content.items(), key=lambda item: str(item[0]))
    return [_catalog_media_entry(media_type, media, context) for media_type, media in entries]


def _catalog_media_entry(media_type: Any, media: Any, context: str) -> dict[str, Any]:
    if not isinstance(media_type, str):
        raise ValueError(f"{context} contains a non-string media type")
    if not isinstance(media, Mapping):
        raise ValueError(f"{context}.{media_type} must be an object")
    return {
        "media_type": media_type,
        "schema": schema_catalog_summary(media.get("schema"), context=f"{context}.{media_type}"),
    }


def catalog_parameter(parameter: Any, *, context: str, source: str) -> dict[str, Any]:
    """Summarize one parameter while excluding examples and arbitrary extensions."""
    if not isinstance(parameter, Mapping):
        raise ValueError(f"{context} must be an object")
    output: dict[str, Any] = {"source": source}
    if "$ref" in parameter:
        return _catalog_parameter_reference(parameter, output, context)
    _catalog_parameter_fields(parameter, output, context)
    output["schema"] = schema_catalog_summary(
        _parameter_schema(parameter), context=f"{context}.schema"
    )
    if "content" in parameter:
        output["content"] = catalog_media_content(
            parameter["content"], context=f"{context}.content"
        )
    return output


def _catalog_parameter_reference(
    parameter: Mapping[str, Any], output: dict[str, Any], context: str
) -> dict[str, Any]:
    ref = parameter["$ref"]
    if not isinstance(ref, str) or not ref:
        raise ValueError(f"{context} $ref must be a non-empty string")
    output.update({"kind": "reference", "ref": ref})
    return output


def _catalog_parameter_fields(
    parameter: Mapping[str, Any], output: dict[str, Any], context: str
) -> None:
    output["kind"] = "inline"
    _copy_parameter_strings(parameter, output, context)
    _copy_parameter_booleans(parameter, output, context)


def _copy_parameter_strings(
    parameter: Mapping[str, Any], output: dict[str, Any], context: str
) -> None:
    for key in ("name", "in", "style"):
        value = parameter.get(key)
        if value is None:
            continue
        if not isinstance(value, str):
            raise ValueError(f"{context}.{key} must be a string")
        output[key] = value


def _copy_parameter_booleans(
    parameter: Mapping[str, Any], output: dict[str, Any], context: str
) -> None:
    names = {
        "required": "required",
        "deprecated": "deprecated",
        "allowEmptyValue": "allow_empty_value",
        "allowReserved": "allow_reserved",
        "explode": "explode",
    }
    for source_key, output_key in names.items():
        if source_key not in parameter:
            continue
        value = parameter[source_key]
        if not isinstance(value, bool):
            raise ValueError(f"{context}.{source_key} must be a boolean")
        output[output_key] = value


def _parameter_schema(parameter: Mapping[str, Any]) -> Any:
    schema = parameter.get("schema")
    if schema is not None or parameter.get("type") is None:
        return schema
    return {
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


def catalog_parameters(operation: Operation) -> list[dict[str, Any]]:
    """Return path-item and operation parameters with explicit provenance."""
    output: list[dict[str, Any]] = []
    for owner, source in (
        (operation.path_item, "path_item"),
        (operation.operation, "operation"),
    ):
        output.extend(_catalog_owner_parameters(owner, operation, source))
    return output


def _catalog_owner_parameters(
    owner: Mapping[str, Any], operation: Operation, source: str
) -> list[dict[str, Any]]:
    parameters = owner.get("parameters") or []
    if not isinstance(parameters, list):
        raise ValueError(f"{operation.location} {source} parameters must be an array")
    return [
        catalog_parameter(
            parameter,
            context=f"{operation.location}.{source}.parameters[{index}]",
            source=source,
        )
        for index, parameter in enumerate(parameters)
    ]


def catalog_request_body(operation: Operation, spec: Mapping[str, Any]) -> dict[str, Any]:
    """Return a structured OpenAPI or Swagger request-body summary."""
    request_body = operation.operation.get("requestBody")
    if request_body is not None:
        return _catalog_openapi_request_body(operation, request_body)
    return _catalog_swagger_request_body(operation, spec)


def _catalog_openapi_request_body(operation: Operation, request_body: Any) -> dict[str, Any]:
    context = f"{operation.location}.requestBody"
    if not isinstance(request_body, Mapping):
        raise ValueError(f"{context} must be an object")
    if "$ref" in request_body:
        return _catalog_request_body_reference(request_body, context)
    return {
        "kind": "openapi3",
        "required": request_body.get("required") is True,
        "content": catalog_media_content(
            request_body.get("content") or {}, context=f"{context}.content"
        ),
    }


def _catalog_request_body_reference(
    request_body: Mapping[str, Any], context: str
) -> dict[str, Any]:
    ref = request_body["$ref"]
    if not isinstance(ref, str) or not ref:
        raise ValueError(f"{context}.$ref must be a non-empty string")
    return {"kind": "reference", "ref": ref}


def _catalog_swagger_request_body(operation: Operation, spec: Mapping[str, Any]) -> dict[str, Any]:
    body, form = _swagger_parameter_summaries(operation)
    if not body and not form:
        return {"kind": "none"}
    consumes = _swagger_media_types(operation, spec, "consumes")
    return {
        "kind": "swagger2",
        "consumes": consumes,
        "body_parameters": body,
        "form_parameters": form,
    }


def _swagger_parameter_summaries(
    operation: Operation,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    body: list[dict[str, Any]] = []
    form: list[dict[str, Any]] = []
    for index, parameter in enumerate(operation_parameters(operation)):
        location = _parameter_location(parameter, operation, index)
        if location not in {"body", "formData"}:
            continue
        record = catalog_parameter(
            parameter,
            context=f"{operation.location}.parameters[{index}]",
            source="effective",
        )
        (body if location == "body" else form).append(record)
    return body, form


def _parameter_location(parameter: Any, operation: Operation, index: int) -> Any:
    if not isinstance(parameter, Mapping):
        raise ValueError(f"{operation.location}.parameters[{index}] must be an object")
    return parameter.get("in")


def _swagger_media_types(operation: Operation, spec: Mapping[str, Any], field: str) -> list[str]:
    media_types = operation.operation.get(field)
    if media_types is None:
        media_types = spec.get(field) or []
    _validate_swagger_media_types(media_types, operation.location, field)
    return list(media_types)


def _validate_swagger_media_types(media_types: Any, location: str, field: str) -> None:
    if not isinstance(media_types, list):
        raise ValueError(f"{location} effective Swagger {field} must be a string array")
    if not all(isinstance(item, str) for item in media_types):
        raise ValueError(f"{location} effective Swagger {field} must be a string array")


def catalog_response_headers(headers: Any, *, context: str) -> list[dict[str, Any]]:
    """Summarize response headers without header examples or defaults."""
    if headers is None:
        return []
    if not isinstance(headers, Mapping):
        raise ValueError(f"{context} must be an object")
    return [
        _catalog_response_header(name, header, context)
        for name, header in sorted(headers.items(), key=lambda item: str(item[0]))
    ]


def _catalog_response_header(name: Any, header: Any, context: str) -> dict[str, Any]:
    if not isinstance(name, str):
        raise ValueError(f"{context} contains a non-string header name")
    if not isinstance(header, Mapping):
        raise ValueError(f"{context}.{name} must be an object")
    if "$ref" in header:
        return _catalog_response_header_reference(name, header, context)
    return {
        "name": name,
        "kind": "inline",
        "required": header.get("required") is True,
        "schema": schema_catalog_summary(
            _header_schema(header), context=f"{context}.{name}.schema"
        ),
    }


def _catalog_response_header_reference(
    name: str, header: Mapping[str, Any], context: str
) -> dict[str, Any]:
    ref = header["$ref"]
    if not isinstance(ref, str) or not ref:
        raise ValueError(f"{context}.{name}.$ref must be a non-empty string")
    return {"name": name, "kind": "reference", "ref": ref}


def _header_schema(header: Mapping[str, Any]) -> Any:
    schema = header.get("schema")
    if schema is not None or header.get("type") is None:
        return schema
    return {key: header[key] for key in ("type", "format", "items", "enum") if key in header}


def catalog_responses(operation: Operation, spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Return every response with statuses, media schemas, and header names."""
    responses = operation.operation.get("responses")
    if not isinstance(responses, Mapping) or not responses:
        raise ValueError(f"{operation.location} must declare a non-empty responses object")
    produces = _swagger_media_types(operation, spec, "produces")
    return [
        _catalog_response(str(status), response, operation.location, produces)
        for status, response in sorted(responses.items(), key=lambda item: str(item[0]))
    ]


def _catalog_response(
    status: str, response: Any, location: str, produces: list[str]
) -> dict[str, Any]:
    context = f"{location}.responses.{status}"
    if not isinstance(response, Mapping):
        raise ValueError(f"{context} must be an object")
    if "$ref" in response:
        return _catalog_response_reference(status, response, context)
    return _catalog_inline_response(status, response, context, produces)


def _catalog_response_reference(
    status: str, response: Mapping[str, Any], context: str
) -> dict[str, Any]:
    ref = response["$ref"]
    if not isinstance(ref, str) or not ref:
        raise ValueError(f"{context}.$ref must be a non-empty string")
    return {"status": status, "kind": "reference", "ref": ref}


def _catalog_inline_response(
    status: str, response: Mapping[str, Any], context: str, produces: list[str]
) -> dict[str, Any]:
    description = response.get("description")
    if description is not None and not isinstance(description, str):
        raise ValueError(f"{context}.description must be a string")
    return {
        "status": status,
        "kind": "inline",
        "description": description,
        "headers": catalog_response_headers(
            response.get("headers") or {}, context=f"{context}.headers"
        ),
        "content": _catalog_response_content(response, context, produces),
    }


def _catalog_response_content(
    response: Mapping[str, Any], context: str, produces: list[str]
) -> list[dict[str, Any]]:
    if "content" in response:
        return catalog_media_content(response["content"], context=f"{context}.content")
    if "schema" not in response:
        return []
    schema = schema_catalog_summary(response["schema"], context=f"{context}.schema")
    if not produces:
        return [{"media_type": None, "schema": schema}]
    return [{"media_type": media_type, "schema": schema} for media_type in produces]


def catalog_security(security: Any, *, context: str) -> dict[str, Any]:
    """Return security alternatives without credentials or example values."""
    if security is None:
        return {"declared": False, "anonymous": False, "alternatives": []}
    if not isinstance(security, list):
        raise ValueError(f"{context} must be an array")
    alternatives = [
        _catalog_security_requirement(requirement, context, index)
        for index, requirement in enumerate(security)
    ]
    return {
        "declared": True,
        "anonymous": _allows_anonymous_security(security, alternatives),
        "alternatives": alternatives,
    }


def _allows_anonymous_security(security: list[Any], alternatives: list[dict[str, Any]]) -> bool:
    return not security or any(not requirement["schemes"] for requirement in alternatives)


def _catalog_security_requirement(requirement: Any, context: str, index: int) -> dict[str, Any]:
    if not isinstance(requirement, Mapping):
        raise ValueError(f"{context}[{index}] must be an object")
    schemes = [
        _catalog_security_scheme_requirement(name, scopes, context, index)
        for name, scopes in sorted(requirement.items(), key=lambda item: str(item[0]))
    ]
    return {"schemes": schemes}


def _catalog_security_scheme_requirement(
    name: Any, scopes: Any, context: str, index: int
) -> dict[str, Any]:
    if not isinstance(name, str):
        raise ValueError(f"{context}[{index}] contains a non-string scheme name")
    if not isinstance(scopes, list) or not all(isinstance(scope, str) for scope in scopes):
        raise ValueError(f"{context}[{index}].{name} scopes must be a string array")
    return {"name": name, "scopes": list(scopes)}


def catalog_security_schemes(spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Return selected security-scheme fields while omitting secret-bearing examples."""
    return [
        _catalog_security_scheme(name, scheme)
        for name, scheme in sorted(security_schemes(spec).items(), key=lambda item: str(item[0]))
    ]


def _catalog_security_scheme(name: Any, scheme: Any) -> dict[str, Any]:
    if not isinstance(name, str):
        raise ValueError("security schemes contain a non-string name")
    if not isinstance(scheme, Mapping):
        raise ValueError(f"security scheme {name!r} must be an object")
    if "$ref" in scheme:
        return _catalog_security_scheme_reference(name, scheme)
    record: dict[str, Any] = {"name": name, "kind": "inline"}
    _copy_security_scheme_strings(name, scheme, record)
    _copy_security_scheme_scopes(name, scheme, record)
    _copy_security_scheme_flows(name, scheme, record)
    return record


def _catalog_security_scheme_reference(name: str, scheme: Mapping[str, Any]) -> dict[str, Any]:
    ref = scheme["$ref"]
    if not isinstance(ref, str) or not ref:
        raise ValueError(f"security scheme {name!r} $ref must be a non-empty string")
    return {"name": name, "kind": "reference", "ref": ref}


def _copy_security_scheme_strings(
    name: str, scheme: Mapping[str, Any], record: dict[str, Any]
) -> None:
    fields = {
        "type": "type",
        "in": "in",
        "name": "parameter_name",
        "scheme": "scheme",
        "bearerFormat": "bearer_format",
        "openIdConnectUrl": "open_id_connect_url",
        "flow": "flow",
        "authorizationUrl": "authorization_url",
        "tokenUrl": "token_url",
    }
    for source_key, output_key in fields.items():
        value = scheme.get(source_key)
        if value is None:
            continue
        if not isinstance(value, str):
            raise ValueError(f"security scheme {name!r} {source_key} must be a string")
        record[output_key] = value


def _copy_security_scheme_scopes(
    name: str, scheme: Mapping[str, Any], record: dict[str, Any]
) -> None:
    scopes = scheme.get("scopes")
    if scopes is None:
        return
    if not isinstance(scopes, Mapping) or not all(isinstance(scope, str) for scope in scopes):
        raise ValueError(f"security scheme {name!r} scopes must be an object")
    record["scopes"] = sorted(scopes)


def _copy_security_scheme_flows(
    name: str, scheme: Mapping[str, Any], record: dict[str, Any]
) -> None:
    flows = scheme.get("flows")
    if flows is None:
        return
    if not isinstance(flows, Mapping):
        raise ValueError(f"security scheme {name!r} flows must be an object")
    record["flows"] = [
        _catalog_security_flow(name, flow_name, flow)
        for flow_name, flow in sorted(flows.items(), key=lambda item: str(item[0]))
    ]


def _catalog_security_flow(scheme_name: str, flow_name: Any, flow: Any) -> dict[str, Any]:
    if not isinstance(flow_name, str) or not isinstance(flow, Mapping):
        raise ValueError(f"security scheme {scheme_name!r} contains an invalid flow")
    record: dict[str, Any] = {"name": flow_name}
    _copy_security_flow_urls(scheme_name, flow_name, flow, record)
    record["scopes"] = _security_flow_scopes(scheme_name, flow_name, flow)
    return record


def _security_flow_scopes(scheme_name: str, flow_name: str, flow: Mapping[str, Any]) -> list[str]:
    scopes = flow.get("scopes") or {}
    if not isinstance(scopes, Mapping):
        raise ValueError(
            f"security scheme {scheme_name!r} flow {flow_name!r} scopes must be an object"
        )
    if not all(isinstance(scope, str) for scope in scopes):
        raise ValueError(
            f"security scheme {scheme_name!r} flow {flow_name!r} scopes must be an object"
        )
    return sorted(scopes)


def _copy_security_flow_urls(
    scheme_name: str, flow_name: str, flow: Mapping[str, Any], record: dict[str, Any]
) -> None:
    for source_key, output_key in (
        ("authorizationUrl", "authorization_url"),
        ("tokenUrl", "token_url"),
        ("refreshUrl", "refresh_url"),
    ):
        value = flow.get(source_key)
        if value is None:
            continue
        if not isinstance(value, str):
            raise ValueError(
                f"security scheme {scheme_name!r} flow {flow_name!r} {source_key} must be a string"
            )
        record[output_key] = value


def catalog_openapi_server(server: Any, *, context: str) -> dict[str, Any]:
    """Return a structured Server Object after applying existing validation."""
    if not isinstance(server, Mapping):
        raise ValueError(f"{context} must be an object")
    render_server(server, context=context)
    record: dict[str, Any] = {"url": server["url"]}
    if isinstance(server.get("name"), str):
        record["name"] = server["name"]
    record["variables"] = _catalog_server_variables(server)
    return record


def _catalog_server_variables(server: Mapping[str, Any]) -> list[dict[str, Any]]:
    variables = server.get("variables") or {}
    return [
        {
            "name": name,
            "default": variable["default"],
            **({"enum": list(variable["enum"])} if "enum" in variable else {}),
        }
        for name, variable in sorted(variables.items(), key=lambda item: str(item[0]))
    ]


def catalog_contract_servers(spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Return contract-level OpenAPI servers or Swagger effective base URLs."""
    if "servers" in spec:
        return _catalog_openapi_contract_servers(spec["servers"])
    return _catalog_swagger_contract_servers(spec)


def _catalog_openapi_contract_servers(servers: Any) -> list[dict[str, Any]]:
    if not isinstance(servers, list):
        raise ValueError("top-level OpenAPI servers must be an array")
    return [
        catalog_openapi_server(server, context=f"servers[{index}]")
        for index, server in enumerate(servers)
    ]


def _catalog_swagger_contract_servers(spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    contract_servers(spec)
    host = spec.get("host")
    base_path = spec.get("basePath", "")
    _validate_swagger_server_values(host, base_path)
    schemes = spec.get("schemes") or []
    return [_swagger_server_record(scheme, host, base_path) for scheme in schemes]


def _validate_swagger_server_values(host: Any, base_path: Any) -> None:
    if host is not None and not isinstance(host, str):
        raise ValueError("top-level Swagger host must be a string")
    if not isinstance(base_path, str):
        raise ValueError("top-level Swagger basePath must be a string")


def _swagger_server_record(scheme: Any, host: str | None, base_path: str) -> dict[str, Any]:
    return {
        "kind": "swagger2",
        "scheme": scheme,
        "host": host,
        "base_path": base_path,
        "url": f"{scheme}://{host}{base_path}" if host else None,
    }


def catalog_operation_servers(operation: Operation, spec: Mapping[str, Any]) -> dict[str, Any]:
    """Return effective server provenance and selected server fields."""
    operation_servers(operation, spec)
    if spec.get("swagger"):
        return _catalog_swagger_operation_servers(operation, spec)
    return _catalog_openapi_operation_servers(operation, spec)


def _catalog_swagger_operation_servers(
    operation: Operation, spec: Mapping[str, Any]
) -> dict[str, Any]:
    schemes = operation.operation.get("schemes")
    if schemes is None:
        return {"source": "contract", "entries": catalog_contract_servers(spec)}
    host = spec.get("host")
    base_path = spec.get("basePath", "")
    return {
        "source": "operation",
        "entries": [_swagger_server_record(scheme, host, base_path) for scheme in schemes],
    }


def _catalog_openapi_operation_servers(
    operation: Operation, spec: Mapping[str, Any]
) -> dict[str, Any]:
    source, servers = _operation_server_source(operation, spec)
    if source == "contract":
        return {"source": source, "entries": catalog_contract_servers(spec)}
    if source == "not_declared":
        return {"source": source, "entries": []}
    if not isinstance(servers, list):
        raise ValueError(f"{operation.location}.servers must be an array")
    return {
        "source": source,
        "entries": [
            catalog_openapi_server(server, context=f"{operation.location}.servers[{index}]")
            for index, server in enumerate(servers)
        ],
    }


def _operation_server_source(operation: Operation, spec: Mapping[str, Any]) -> tuple[str, Any]:
    if "servers" in operation.operation:
        return "operation", operation.operation["servers"]
    if "servers" in operation.path_item:
        return "path_item", operation.path_item["servers"]
    if "servers" in spec:
        return "contract", None
    return "not_declared", None
