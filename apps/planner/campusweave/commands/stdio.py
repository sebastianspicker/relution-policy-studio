"""Bounded, one-request JSON stdio bridge for profile planning."""

from __future__ import annotations

import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ..json_snapshot import decode_strict_json
from ..private_artifacts import canonical_json_bytes
from ..profiles_v2 import compile_profile, convert_v1_profile, reference_profile, validate_profile

PROTOCOL_VERSION = 1
MAX_REQUEST_BYTES = 1024 * 1024
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_REQUEST_ID_CHARS = 128
PROFILE_COMMANDS = {"validate", "compile", "convert-v1"}
COMMANDS = {*PROFILE_COMMANDS, "reference"}


class RequestError(ValueError):
    """A bridge request failure safe to return to the caller."""

    def __init__(
        self,
        code: str,
        message: str,
        details: list[dict[str, str]],
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details
        self.request_id = request_id


def _detail(path: str, message: str) -> list[dict[str, str]]:
    return [{"path": path, "message": message}]


def _safe_request_id(value: Any) -> str | None:
    if isinstance(value, str) and value.strip() and len(value) <= MAX_REQUEST_ID_CHARS:
        return value
    return None


def _read_request() -> Any:
    payload = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    if len(payload) > MAX_REQUEST_BYTES:
        raise RequestError(
            "request_too_large",
            "request exceeds the stdio bridge limit",
            _detail("$", f"request must be at most {MAX_REQUEST_BYTES} bytes"),
        )
    try:
        return decode_strict_json(payload, Path("<stdin>"))
    except ValueError as exc:
        raise RequestError(
            "invalid_json", "request is not strict UTF-8 JSON", _detail("$", str(exc))
        ) from exc


def _validate_envelope(request: Any) -> tuple[str, str, Mapping[str, Any]]:
    if not isinstance(request, Mapping):
        raise RequestError(
            "invalid_request",
            "request envelope must be an object",
            _detail("$", "must be an object"),
        )
    request_id = _safe_request_id(request.get("id"))
    if set(request) != {"version", "id", "command", "payload"}:
        raise RequestError(
            "invalid_request",
            "request envelope has unexpected fields",
            _detail("$", "must contain exactly version, id, command, and payload"),
            request_id=request_id,
        )
    raw_id = request.get("id")
    if request_id is None or not isinstance(raw_id, str) or raw_id != raw_id.strip():
        raise RequestError(
            "invalid_request",
            "request id is not valid",
            _detail(
                "$.id",
                f"must be a nonblank string of at most {MAX_REQUEST_ID_CHARS} characters without surrounding whitespace",
            ),
        )
    version = request.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version != PROTOCOL_VERSION:
        raise RequestError(
            "unsupported_version",
            "protocol version is not supported",
            _detail("$.version", f"must equal {PROTOCOL_VERSION}"),
            request_id=request_id,
        )
    command = request.get("command")
    if not isinstance(command, str) or command not in COMMANDS:
        raise RequestError(
            "unknown_command",
            "command is not supported",
            _detail("$.command", f"must be one of {', '.join(sorted(COMMANDS))}"),
            request_id=request_id,
        )
    payload = request.get("payload")
    if not isinstance(payload, Mapping):
        raise RequestError(
            "invalid_request",
            "payload must be an object",
            _detail("$.payload", "must be an object"),
            request_id=request_id,
        )
    if command == "reference":
        if payload:
            raise RequestError(
                "invalid_request",
                "reference payload must be empty",
                _detail("$.payload", "must be an empty object"),
                request_id=request_id,
            )
    elif set(payload) != {"profile"} or not isinstance(payload.get("profile"), Mapping):
        raise RequestError(
            "invalid_request",
            "command payload must contain one profile object",
            _detail("$.payload", "must contain exactly profile as an object"),
            request_id=request_id,
        )
    return request_id, command, payload


def _dispatch(command: str, payload: Mapping[str, Any]) -> Any:
    if command == "reference":
        return reference_profile()
    profile = payload["profile"]
    if command == "validate":
        return validate_profile(profile)
    if command == "compile":
        return compile_profile(profile)
    return convert_v1_profile(profile)


def _success(request_id: str, result: Any) -> dict[str, Any]:
    return {"version": PROTOCOL_VERSION, "id": request_id, "ok": True, "result": result}


def _failure(error: RequestError) -> dict[str, Any]:
    return {
        "version": PROTOCOL_VERSION,
        "id": error.request_id,
        "ok": False,
        "error": {"code": error.code, "message": str(error), "details": error.details},
    }


def _write(response: Mapping[str, Any]) -> None:
    encoded = canonical_json_bytes(response)
    if len(encoded) > MAX_RESPONSE_BYTES:
        raise RequestError(
            "response_too_large",
            "response exceeds the stdio bridge limit",
            _detail("$", f"response must be at most {MAX_RESPONSE_BYTES} bytes"),
            request_id=_safe_request_id(response.get("id")),
        )
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def main() -> int:
    """Read one request through EOF, dispatch it, and emit one response."""
    request_id: str | None = None
    try:
        request_id, command, payload = _validate_envelope(_read_request())
        _write(_success(request_id, _dispatch(command, payload)))
        return 0
    except RequestError as exc:
        _write(_failure(exc))
        return 2
    except Exception:
        error = RequestError(
            "internal_error",
            "the offline planner could not complete the request",
            _detail("$", "internal planner failure"),
            request_id=request_id,
        )
        _write(_failure(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
