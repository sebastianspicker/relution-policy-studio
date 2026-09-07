"""Fixed loopback HTTP and static-file transport for CampusWeave."""

from __future__ import annotations

import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlsplit

from .json_snapshot import decode_strict_json
from .private_artifacts import canonical_json_bytes
from .resources import WEB_ROOT
from .workbench import CampusWeaveInputError, compile_endpoint_request, reference_response

HOST = "127.0.0.1"
PORT = 8766
MAX_REQUEST_BYTES = 2 * 1024 * 1024
CONNECTION_TIMEOUT_SECONDS = 5.0
MAX_CONCURRENT_REQUESTS = 8
STATIC_ROOT = WEB_ROOT
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
    # Style modules are loaded through styles.css imports.
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

    def __init__(
        self, server_address: tuple[str, int], handler: type[BaseHTTPRequestHandler]
    ) -> None:
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

    def log_message(self, *message_parts: object) -> None:
        """Do not write request data to logs."""

        _ = message_parts

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
        self.send_header(
            "Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
        )

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
        return not (
            fetch_mode in {"cors", "navigate", "no-cors", "same-origin"}
            and fetch_site != "same-origin"
        )

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
            response = compile_endpoint_request(path, self._read_json_body())
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
