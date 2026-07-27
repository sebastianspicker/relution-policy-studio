from __future__ import annotations

from contextlib import redirect_stderr
import http.client
import io
import json
import socket
import sys
import threading
import time
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from campusweave import service  # noqa: E402
from scripts.university_runtime.plan import validate_execution_plan  # noqa: E402


class CampusWeaveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.reference = service.reference_response()

    def _server(self) -> tuple[service.ThreadingHTTPServer, threading.Thread, int]:
        server = service.ThreadingHTTPServer(("127.0.0.1", 0), service.CampusWeaveHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, thread, server.server_port

    def _request(
        self,
        port: int,
        method: str,
        path: str,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_reference_compiles_checked_in_profile_to_unbound_plan(self) -> None:
        response = self.reference
        self.assertEqual(response["profile_filename"], "university-profile.canonical.json")
        self.assertEqual(
            response["profile_sha256"],
            service.canonical_sha256(response["profile"]),
        )
        self.assertEqual(response["plan_filename"], "university-plan.canonical.json")
        self.assertEqual(response["source_profile_filename"], "desired-state.json")
        self.assertNotEqual(response["profile_sha256"], response["source_profile_sha256"])
        self.assertEqual(
            validate_execution_plan(response["plan"], response["profile"], response["profile_sha256"]),
            [],
        )
        self.assertTrue(
            validate_execution_plan(response["plan"], response["profile"], response["source_profile_sha256"])
        )
        self.assertFalse(response["dry_run"]["execution_authorized"])
        self.assertFalse(response["dry_run"]["network_capable"])
        self.assertFalse(response["dry_run"]["mutation_capable"])
        self.assertTrue(response["dry_run"]["all_steps_unbound"])
        self.assertEqual(response["counts"]["plan_steps"], len(response["plan"]["steps"]))

    def test_http_routes_security_and_strict_compile_requests(self) -> None:
        server, thread, port = self._server()
        allowed = {"Host": "localhost:8766", "Origin": "http://localhost:8766"}
        try:
            status, headers, body = self._request(port, "GET", "/api/v1/health", headers=allowed)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), {"mode": "offline_planning_only", "status": "ok"})
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn("default-src 'self'", headers["Content-Security-Policy"])

            status, _, _ = self._request(port, "GET", "/api/v1/reference", headers={"Host": "evil.invalid"})
            self.assertEqual(status, 403)
            status, _, _ = self._request(port, "GET", "/api/v1/reference", headers={"Host": "localhost:8766", "Origin": "https://evil.invalid"})
            self.assertEqual(status, 403)
            status, _, _ = self._request(
                port,
                "GET",
                "/api/v1/reference",
                headers={"Host": "localhost:8766", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors"},
            )
            self.assertEqual(status, 403)

            profile = json.dumps(self.reference["profile"]).encode()
            status, _, body = self._request(
                port, "POST", "/api/v1/compile-profile", json.dumps({"profile": self.reference["profile"]}).encode(),
                {**allowed, "Content-Type": "application/json"},
            )
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["profile_sha256"], service.canonical_sha256(self.reference["profile"]))

            duplicate = b'{"profile":{},"profile":{}}'
            status, _, _ = self._request(port, "POST", "/api/v1/compile-profile", duplicate, {**allowed, "Content-Type": "application/json"})
            self.assertEqual(status, 400)
            imported_duplicate = b'{"package":{},"package":{}}'
            status, _, _ = self._request(port, "POST", "/api/v1/import-profile", imported_duplicate, {**allowed, "Content-Type": "application/json"})
            self.assertEqual(status, 400)
            nan = b'{"profile":NaN}'
            status, _, _ = self._request(port, "POST", "/api/v1/compile-profile", nan, {**allowed, "Content-Type": "application/json"})
            self.assertEqual(status, 400)
            status, headers, _ = self._request(port, "PUT", "/api/v1/reference", headers=allowed)
            self.assertEqual(status, 405)
            self.assertEqual(headers["Allow"], "GET, POST")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_instantiate_and_static_missing_or_present(self) -> None:
        server, thread, port = self._server()
        headers = {"Host": "localhost:8766", "Content-Type": "application/json"}
        try:
            request = {
                "profile": self.reference["profile"],
                "institution_code": "example-u",
                "institution_label": "Example University",
            }
            status, _, body = self._request(port, "POST", "/api/v1/instantiate-profile", json.dumps(request).encode(), headers)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["profile"]["package"]["institution_code"], "example-u")
            status, _, _ = self._request(port, "GET", "/missing.js", headers={"Host": "localhost:8766"})
            self.assertEqual(status, 404)
            status, response_headers, body = self._request(
                port, "GET", "/app.js", headers={"Host": "localhost:8766"}
            )
            self.assertEqual(status, 200)
            self.assertEqual(response_headers["Content-Type"], "text/javascript; charset=utf-8")
            self.assertIn(b"createActions", body)

            # Modular static modules are allowlisted; assert 200 only when present.
            modular_checks = (
                ("/app/state.mjs", "app/state.mjs", "text/javascript; charset=utf-8"),
                ("/app/actions.mjs", "app/actions.mjs", "text/javascript; charset=utf-8"),
                ("/styles/tokens.css", "styles/tokens.css", "text/css; charset=utf-8"),
                ("/views/html.mjs", "views/html.mjs", "text/javascript; charset=utf-8"),
            )
            host = {"Host": "localhost:8766"}
            for route, relative, content_type in modular_checks:
                if not (service.STATIC_ROOT / relative).is_file():
                    continue
                status, response_headers, _ = self._request(port, "GET", route, headers=host)
                self.assertEqual(status, 200, msg=f"{route} should be served when present")
                self.assertEqual(response_headers["Content-Type"], content_type)
                self.assertEqual(service.STATIC_FILES[route], (relative, content_type))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_fixed_listener_rejects_non_loopback_or_nonstandard_port(self) -> None:
        with self.assertRaises(ValueError):
            service.CampusWeaveServer(("127.0.0.1", 0), service.CampusWeaveHandler)

    def test_connection_timeout_and_admission_cap_are_finite(self) -> None:
        class EphemeralCampusWeaveServer(service.CampusWeaveServer):
            def server_bind(self) -> None:
                service.ThreadingHTTPServer.server_bind(self)

        server = EphemeralCampusWeaveServer(("127.0.0.1", 0), service.CampusWeaveHandler)
        client = socket.create_connection(("127.0.0.1", server.server_port), timeout=2)
        try:
            accepted, _ = server.get_request()
            try:
                self.assertEqual(accepted.gettimeout(), service.CONNECTION_TIMEOUT_SECONDS)
            finally:
                accepted.close()
            self.assertEqual(service.CampusWeaveServer.request_queue_size, service.MAX_CONCURRENT_REQUESTS)
            self.assertTrue(all(server._request_slots.acquire(blocking=False) for _ in range(service.MAX_CONCURRENT_REQUESTS)))
            self.assertFalse(server._request_slots.acquire(blocking=False))
            for _ in range(service.MAX_CONCURRENT_REQUESTS):
                server._request_slots.release()
        finally:
            client.close()
            server.server_close()

    def test_completed_request_forces_close_and_releases_admission_slot(self) -> None:
        class EphemeralCampusWeaveServer(service.CampusWeaveServer):
            def server_bind(self) -> None:
                service.ThreadingHTTPServer.server_bind(self)

        server = EphemeralCampusWeaveServer(("127.0.0.1", 0), service.CampusWeaveHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
        try:
            connection.request(
                "GET",
                "/api/v1/health",
                headers={"Host": "localhost:8766", "Connection": "keep-alive"},
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.getheader("Connection"), "close")
            self.assertTrue(response.will_close)
            response.read()

            deadline = time.monotonic() + 2
            while True:
                acquired = [
                    server._request_slots.acquire(blocking=False)
                    for _ in range(service.MAX_CONCURRENT_REQUESTS)
                ]
                if all(acquired):
                    break
                for slot_acquired in acquired:
                    if slot_acquired:
                        server._request_slots.release()
                if time.monotonic() >= deadline:
                    self.fail("completed request did not release its admission slot")
                time.sleep(0.01)
            for _ in range(service.MAX_CONCURRENT_REQUESTS):
                server._request_slots.release()
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_expected_disconnects_do_not_emit_request_tracebacks(self) -> None:
        class EphemeralCampusWeaveServer(service.CampusWeaveServer):
            def server_bind(self) -> None:
                service.ThreadingHTTPServer.server_bind(self)

        server = EphemeralCampusWeaveServer(("127.0.0.1", 0), service.CampusWeaveHandler)
        try:
            output = io.StringIO()
            with redirect_stderr(output):
                try:
                    raise ConnectionResetError("simulated client disconnect")
                except ConnectionResetError:
                    server.handle_error(None, ("127.0.0.1", 1))
            self.assertEqual(output.getvalue(), "")

            with redirect_stderr(output):
                try:
                    raise RuntimeError("sensitive internal detail")
                except RuntimeError:
                    server.handle_error(None, ("127.0.0.1", 1))
            self.assertEqual(
                output.getvalue(),
                "CampusWeave request handler failed unexpectedly\n",
            )
            self.assertNotIn("sensitive internal detail", output.getvalue())
        finally:
            server.server_close()

    def test_invalid_inputs_are_safe_actionable_and_rebinding_only(self) -> None:
        server, thread, port = self._server()
        headers = {"Host": "localhost:8766", "Content-Type": "application/json"}
        try:
            invalid = dict(self.reference["profile"])
            package = dict(invalid["package"])
            package["untrusted_secret_field"] = "do-not-reflect-this-credential"
            invalid["package"] = package
            status, _, body = self._request(
                port, "POST", "/api/v1/compile-profile", json.dumps({"profile": invalid}).encode(), headers
            )
            result = json.loads(body)
            self.assertEqual(status, 400)
            self.assertEqual(result["details"][0]["path"], "$.package")
            self.assertNotIn("untrusted_secret_field", body.decode())
            self.assertNotIn("do-not-reflect-this-credential", body.decode())

            details = service._safe_validation_details(
                ["$.package.user_supplied_secret_key: unknown keys are not allowed"]
            )
            self.assertEqual(details[0]["path"], "$.package")
            self.assertNotIn("user_supplied_secret_key", json.dumps(details))

            changed = dict(self.reference["profile"])
            units = [dict(item) for item in changed["organization_units"]]
            units[1]["label"] = "opaque target value"
            changed["organization_units"] = units
            status, _, body = self._request(port, "POST", "/api/v1/import-profile", json.dumps(changed).encode(), headers)
            self.assertEqual(status, 400)
            self.assertEqual(json.loads(body)["details"][0]["path"], "$")

            request = {"profile": self.reference["profile"], "institution_code": "INVALID_CODE", "institution_label": "Example"}
            status, _, body = self._request(port, "POST", "/api/v1/instantiate-profile", json.dumps(request).encode(), headers)
            self.assertEqual(status, 400)
            self.assertEqual(json.loads(body)["details"][0]["path"], "$.institution_code")

            request = {
                "profile": self.reference["profile"],
                "institution_code": "example-u",
                "institution_label": "   ",
            }
            status, _, body = self._request(
                port,
                "POST",
                "/api/v1/instantiate-profile",
                json.dumps(request).encode(),
                headers,
            )
            self.assertEqual(status, 400)
            detail = json.loads(body)["details"][0]
            self.assertEqual(detail["path"], "$.institution_label")
            self.assertIn("non-whitespace", detail["message"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)
