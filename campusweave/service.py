"""Dependency-free loopback service for offline university profile planning.

This module deliberately has no executor, target configuration, persistent
state, logging, credential access, or outbound-network capability.
"""

from __future__ import annotations

from functools import lru_cache
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import sys
import threading
from typing import Any, Mapping
from urllib.parse import urlsplit


from scripts import university_profile
from scripts.strict_json import decode_strict_json
from scripts.university_runtime.io import (
    canonical_json_bytes,
    canonical_sha256,
    load_json_with_sha256,
)
from scripts.university_runtime.plan import (
    build_execution_plan,
    instantiate_profile,
    validate_execution_plan,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


HOST = "127.0.0.1"
PORT = 8766
MAX_REQUEST_BYTES = 2 * 1024 * 1024
CONNECTION_TIMEOUT_SECONDS = 5.0
MAX_CONCURRENT_REQUESTS = 8
PROFILE_PATH = REPOSITORY_ROOT / "docs/relution/packages/university/desired-state.json"
MANIFEST_PATH = REPOSITORY_ROOT / "docs/relution/registries/manifest.json"
STATIC_ROOT = REPOSITORY_ROOT / "web"
# Explicit relative paths only - never serve arbitrary filesystem paths.
_STATIC_ALLOWLIST: list[tuple[str, str, str]] = [
    ("/", "index.html", "text/html; charset=utf-8"),
    ("/app.js", "app.js", "text/javascript; charset=utf-8"),
    ("/favicon.svg", "favicon.svg", "image/svg+xml"),
    ("/model.mjs", "model.mjs", "text/javascript; charset=utf-8"),
    ("/views.mjs", "views.mjs", "text/javascript; charset=utf-8"),
    ("/styles.css", "styles.css", "text/css; charset=utf-8"),
    # app modules (state and domain actions; loaded from app.js)
    ("/app/state.mjs", "app/state.mjs", "text/javascript; charset=utf-8"),
    ("/app/actions.mjs", "app/actions.mjs", "text/javascript; charset=utf-8"),
    # styles modules (Academic Ledger split; loaded via styles.css @import)
    ("/styles/tokens.css", "styles/tokens.css", "text/css; charset=utf-8"),
    ("/styles/base.css", "styles/base.css", "text/css; charset=utf-8"),
    ("/styles/shell.css", "styles/shell.css", "text/css; charset=utf-8"),
    ("/styles/components.css", "styles/components.css", "text/css; charset=utf-8"),
    ("/styles/lists.css", "styles/lists.css", "text/css; charset=utf-8"),
    ("/styles/inspector.css", "styles/inspector.css", "text/css; charset=utf-8"),
    ("/styles/screens.css", "styles/screens.css", "text/css; charset=utf-8"),
    ("/styles/responsive.css", "styles/responsive.css", "text/css; charset=utf-8"),
    # model modules (re-exported from model.mjs)
    ("/model/api.mjs", "model/api.mjs", "text/javascript; charset=utf-8"),
    ("/model/selectors.mjs", "model/selectors.mjs", "text/javascript; charset=utf-8"),
    ("/model/serialize.mjs", "model/serialize.mjs", "text/javascript; charset=utf-8"),
    ("/model/storage.mjs", "model/storage.mjs", "text/javascript; charset=utf-8"),
    # views modules (re-exported from views.mjs)
    ("/views/html.mjs", "views/html.mjs", "text/javascript; charset=utf-8"),
    ("/views/shell.mjs", "views/shell.mjs", "text/javascript; charset=utf-8"),
    ("/views/inspectors.mjs", "views/inspectors.mjs", "text/javascript; charset=utf-8"),
    ("/views/screens.mjs", "views/screens.mjs", "text/javascript; charset=utf-8"),
    ("/views/app-shell.mjs", "views/app-shell.mjs", "text/javascript; charset=utf-8"),
]
STATIC_FILES = {route: (filename, ctype) for route, filename, ctype in _STATIC_ALLOWLIST}
ALLOWED_AUTHORITIES = {f"{HOST}:{PORT}", f"localhost:{PORT}"}
SAFE_DETAIL_PATH = re.compile(
    r"^\$\.(?:package|provenance|commit_boundary|locations|organization_units|"
    r"functional_cohorts|department_persona_rules|policy_layers|policy_units|"
    r"group_blueprints|rollout_rings|assignment_intents|activation_gates|"
    r"api_workflows|unresolved_inputs)(?:\[\d+\])?"
)


class CampusWeaveInputError(ValueError):
    """A deliberately non-sensitive client input failure."""

    def __init__(self, message: str, details: list[dict[str, str]] | None = None) -> None:
        super().__init__(message)
        self.details = details or [{"path": "$", "message": "request is not valid"}]


def _safe_validation_details(errors: list[str]) -> list[dict[str, str]]:
    """Keep field locations while never reflecting supplied keys or values."""

    details: list[dict[str, str]] = []
    for error in errors[:16]:
        raw_path, separator, raw_message = error.partition(":")
        path_match = SAFE_DETAIL_PATH.match(raw_path) if separator and len(raw_path) <= 256 else None
        path = path_match.group(0) if path_match else "$"
        lowered = raw_message.lower()
        if "missing keys" in lowered or "required" in lowered:
            message = "a required field is missing"
        elif "unknown keys" in lowered:
            message = "an unknown field is not allowed"
        elif "forbidden" in lowered:
            message = "value is not permitted in a commit-safe profile"
        elif "reference" in lowered:
            message = "reference does not resolve within the profile"
        else:
            message = "value does not satisfy the offline university contract"
        details.append({"path": path, "message": message})
    return details or [{"path": "$", "message": "profile does not satisfy the offline university contract"}]


def _counts(profile: Mapping[str, Any], plan: Mapping[str, Any]) -> dict[str, int]:
    return {
        "organization_units": len(profile["organization_units"]),
        "locations": len(profile["locations"]),
        "functional_cohorts": len(profile["functional_cohorts"]),
        "policy_units": len(profile["policy_units"]),
        "group_blueprints": len(profile["group_blueprints"]),
        "assignment_intents": len(profile["assignment_intents"]),
        "api_workflows": len(profile["api_workflows"]),
        "plan_steps": len(plan["steps"]),
    }


def _dry_run_facts(plan: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "mode": "offline_planning_only",
        "execution_authorized": plan["execution_authorized"],
        "network_capable": plan["network_capable"],
        "mutation_capable": plan["mutation_capable"],
        "network_calls": 0,
        "mutation_calls": 0,
        "all_steps_unbound": all(step.get("state") == "unbound" for step in plan["steps"]),
    }


def _concept_ids() -> set[str]:
    errors: list[str] = []
    concepts = university_profile.concept_ids_from_manifest(MANIFEST_PATH, errors)
    if errors:
        raise RuntimeError("the checked-in university registry is not available")
    return concepts


@lru_cache(maxsize=1)
def _reference_source() -> tuple[bytes, str]:
    """Load the checked-in reference once, retaining only immutable bytes."""

    profile, source_digest = load_json_with_sha256(PROFILE_PATH)
    return canonical_json_bytes(profile), source_digest


def _reference_profile() -> Mapping[str, Any]:
    profile = decode_strict_json(_reference_source()[0], Path("reference-profile.json"))
    if not isinstance(profile, Mapping):  # pragma: no cover - checked-in profile invariant
        raise RuntimeError("the checked-in university profile is not an object")
    return profile


def _assert_supported_rebinding(profile: Mapping[str, Any]) -> None:
    """Prove structural derivation from the reference, not just field similarity."""

    package = profile.get("package")
    if not isinstance(package, Mapping):
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$.package", "message": "must be a supported reference rebinding"}],
        )
    code = package.get("institution_code")
    label = package.get("institution_label")
    if not isinstance(code, str) or not isinstance(label, str):
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$.package", "message": "must declare a supported institution identity"}],
        )
    try:
        expected = instantiate_profile(_reference_profile(), code, label)
    except ValueError as exc:
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$.package", "message": "must declare a supported institution identity"}],
        ) from exc
    if canonical_json_bytes(profile) != canonical_json_bytes(expected):
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$", "message": "must exactly match a supported reference rebinding"}],
        )


def compile_profile(
    profile: Any,
    *,
    source_profile_sha256: str | None = None,
    source_profile_filename: str | None = None,
) -> dict[str, Any]:
    """Validate and compile one commit-safe profile without touching a target."""

    if not isinstance(profile, Mapping):
        raise CampusWeaveInputError("profile must be an object", [{"path": "$.profile", "message": "must be an object"}])
    errors = university_profile.validate_package(profile, _concept_ids())
    if errors:
        raise CampusWeaveInputError("profile does not satisfy the offline university contract", _safe_validation_details(errors))
    _assert_supported_rebinding(profile)
    # The plan identifies this canonical API export, never raw source-file bytes.
    digest = canonical_sha256(profile)
    plan = build_execution_plan(profile, digest)
    if validate_execution_plan(plan, profile, digest):
        raise RuntimeError("the offline planner produced an invalid plan")
    return {
        "profile": profile,
        "profile_sha256": digest,
        "profile_filename": "university-profile.canonical.json",
        "plan": plan,
        "plan_sha256": plan["plan_sha256"],
        "plan_filename": "university-plan.canonical.json",
        "counts": _counts(profile, plan),
        "dry_run": _dry_run_facts(plan),
        "source_profile_sha256": source_profile_sha256,
        "source_profile_filename": source_profile_filename,
    }


@lru_cache(maxsize=1)
def _reference_response_bytes() -> bytes:
    """Compile the immutable reference once; callers receive fresh decoded data."""

    _, source_digest = _reference_source()
    return canonical_json_bytes(
        compile_profile(
            _reference_profile(),
            source_profile_sha256=source_digest,
            source_profile_filename=PROFILE_PATH.name,
        )
    )


def reference_response() -> dict[str, Any]:
    """Return a fresh view of the cached, authoritative canonical export."""

    response = decode_strict_json(_reference_response_bytes(), Path("reference-response.json"))
    if not isinstance(response, dict):  # pragma: no cover - compiler invariant
        raise RuntimeError("the cached reference response is not an object")
    return response


def _origin_is_allowed(value: str) -> bool:
    parsed = urlsplit(value)
    return (
        parsed.scheme == "http"
        and parsed.path == ""
        and parsed.query == ""
        and parsed.fragment == ""
        and parsed.netloc in ALLOWED_AUTHORITIES
    )


class CampusWeaveServer(ThreadingHTTPServer):
    """A server whose address is fixed to the IPv4 loopback interface."""

    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = MAX_CONCURRENT_REQUESTS

    def __init__(self, server_address: tuple[str, int], handler: type[BaseHTTPRequestHandler]) -> None:
        self._request_slots = threading.BoundedSemaphore(MAX_CONCURRENT_REQUESTS)
        super().__init__(server_address, handler)

    def server_bind(self) -> None:
        if self.server_address != (HOST, PORT):
            raise ValueError(f"CampusWeave must bind only to {HOST}:{PORT}")
        super().server_bind()

    def get_request(self) -> tuple[Any, tuple[str, int]]:
        request, client_address = super().get_request()
        request.settimeout(CONNECTION_TIMEOUT_SECONDS)
        return request, client_address

    def process_request(self, request: Any, client_address: tuple[str, int]) -> None:
        if not self._request_slots.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Cache-Control: no-store\r\n"
                    b"Content-Security-Policy: default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'\r\n"
                    b"Content-Length: 0\r\nConnection: close\r\n\r\n"
                )
            finally:
                self.shutdown_request(request)
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request: Any, client_address: tuple[str, int]) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()

    def handle_error(self, request: Any, client_address: tuple[str, int]) -> None:
        """Suppress expected client disconnect noise without exposing request data."""

        _ = request, client_address
        failure = sys.exception()
        if isinstance(
            failure,
            (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, TimeoutError),
        ):
            return
        print("CampusWeave request handler failed unexpectedly", file=sys.stderr)


class CampusWeaveHandler(BaseHTTPRequestHandler):
    """Fixed-route handler with no request logging or mutable session state."""

    protocol_version = "HTTP/1.1"
    server_version = "CampusWeave"
    sys_version = ""

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        """Do not write request data to logs."""

        _ = format, args

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self) -> None:  # noqa: N802
        self._method_not_allowed()

    def do_PATCH(self) -> None:  # noqa: N802
        self._method_not_allowed()

    def do_DELETE(self) -> None:  # noqa: N802
        self._method_not_allowed()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._method_not_allowed()

    def _security_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'")

    def _send_bytes(self, status: HTTPStatus, content_type: str, payload: bytes) -> None:
        self.close_connection = True
        self.send_response(status)
        self._security_headers()
        self.send_header("Connection", "close")
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, status: HTTPStatus, value: Mapping[str, Any]) -> None:
        self._send_bytes(status, "application/json; charset=utf-8", canonical_json_bytes(value))

    def _error(
        self,
        status: HTTPStatus,
        code: str,
        details: list[dict[str, str]] | None = None,
    ) -> None:
        response: dict[str, Any] = {"error": code}
        if details:
            response["details"] = details[:16]
        self._send_json(status, response)

    def _method_not_allowed(self) -> None:
        self.close_connection = True
        self.send_response(HTTPStatus.METHOD_NOT_ALLOWED)
        self._security_headers()
        self.send_header("Connection", "close")
        self.send_header("Allow", "GET, POST")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        payload = canonical_json_bytes({"error": "method_not_allowed"})
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _valid_request_origin(self) -> bool:
        host = self.headers.get("Host")
        if host not in ALLOWED_AUTHORITIES:
            return False
        origin = self.headers.get("Origin")
        return origin is None or _origin_is_allowed(origin)

    def _reference_browser_authorized(self) -> bool:
        """Permit direct local tools, but deny origin-less cross-site browser fetches."""

        if self.headers.get("Origin") is not None:
            return True
        fetch_site = self.headers.get("Sec-Fetch-Site")
        fetch_mode = self.headers.get("Sec-Fetch-Mode")
        if fetch_site == "cross-site":
            return False
        return not (fetch_mode in {"cors", "navigate", "no-cors", "same-origin"} and fetch_site != "same-origin")

    def _read_json_body(self) -> Any:
        if self.headers.get("Content-Type") != "application/json":
            raise CampusWeaveInputError("unsupported content type")
        length_header = self.headers.get("Content-Length")
        if length_header is None or not length_header.isdecimal():
            raise CampusWeaveInputError("invalid content length")
        length = int(length_header)
        if length > MAX_REQUEST_BYTES:
            raise CampusWeaveInputError("request too large")
        payload = self.rfile.read(length)
        if len(payload) != length:
            raise CampusWeaveInputError("incomplete request")
        try:
            return decode_strict_json(payload, Path("request.json"))
        except ValueError as exc:
            raise CampusWeaveInputError("invalid JSON request") from exc

    def _dispatch(self, method: str) -> None:
        if not self._valid_request_origin():
            self._error(HTTPStatus.FORBIDDEN, "invalid_request_origin")
            return
        path = urlsplit(self.path)
        if path.query or path.fragment:
            self._error(HTTPStatus.NOT_FOUND, "not_found")
            return
        if method == "GET":
            self._get(path.path)
            return
        self._post(path.path)

    def _get(self, path: str) -> None:
        if path == "/api/v1/health":
            self._send_json(HTTPStatus.OK, {"status": "ok", "mode": "offline_planning_only"})
        elif path == "/api/v1/reference":
            if not self._reference_browser_authorized():
                self._error(HTTPStatus.FORBIDDEN, "cross_site_reference_forbidden")
                return
            try:
                self._send_json(HTTPStatus.OK, reference_response())
            except (OSError, RuntimeError, ValueError):
                self._error(HTTPStatus.INTERNAL_SERVER_ERROR, "reference_unavailable")
        elif path in STATIC_FILES:
            filename, content_type = STATIC_FILES[path]
            try:
                payload = (STATIC_ROOT / filename).read_bytes()
            except (FileNotFoundError, OSError):
                self._error(HTTPStatus.NOT_FOUND, "not_found")
                return
            self._send_bytes(HTTPStatus.OK, content_type, payload)
        else:
            self._error(HTTPStatus.NOT_FOUND, "not_found")

    def _post(self, path: str) -> None:
        if path not in {
            "/api/v1/compile-profile",
            "/api/v1/import-profile",
            "/api/v1/instantiate-profile",
        }:
            self._error(HTTPStatus.NOT_FOUND, "not_found")
            return
        try:
            request = self._read_json_body()
            if path == "/api/v1/compile-profile":
                if not isinstance(request, Mapping):
                    raise CampusWeaveInputError("request must be an object")
                if set(request) != {"profile"}:
                    raise CampusWeaveInputError("unexpected request shape")
                response = compile_profile(request["profile"])
            elif path == "/api/v1/import-profile":
                response = compile_profile(request)
            else:
                if not isinstance(request, Mapping):
                    raise CampusWeaveInputError("request must be an object")
                if set(request) != {"profile", "institution_code", "institution_label"}:
                    raise CampusWeaveInputError("unexpected request shape")
                if not isinstance(request["profile"], Mapping):
                    raise CampusWeaveInputError("profile must be an object")
                if not isinstance(request["institution_code"], str) or not isinstance(request["institution_label"], str):
                    raise CampusWeaveInputError("institution identity must be strings")
                try:
                    instantiated = instantiate_profile(
                        request["profile"],
                        request["institution_code"],
                        request["institution_label"],
                    )
                except ValueError as exc:
                    failure = str(exc)
                    if failure.startswith("institution code"):
                        path = "$.institution_code"
                        message = "must use at most 48 lowercase letters, digits, or hyphens"
                    elif failure.startswith("institution label"):
                        path = "$.institution_label"
                        message = "must contain 1 through 200 non-whitespace characters"
                    else:
                        path = "$.profile"
                        message = "must be a supported reference-derived profile"
                    raise CampusWeaveInputError(
                        "institution identity is not valid",
                        [{"path": path, "message": message}],
                    ) from exc
                response = compile_profile(instantiated)
        except CampusWeaveInputError as exc:
            self._error(HTTPStatus.BAD_REQUEST, "invalid_request", exc.details)
            return
        except (KeyError, TypeError, ValueError):
            self._error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                [{"path": "$", "message": "request does not match the endpoint contract"}],
            )
            return
        except RuntimeError:
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, "planner_unavailable")
            return
        self._send_json(HTTPStatus.OK, response)


def create_server() -> CampusWeaveServer:
    """Return the only permitted listener for CampusWeave."""

    return CampusWeaveServer((HOST, PORT), CampusWeaveHandler)
