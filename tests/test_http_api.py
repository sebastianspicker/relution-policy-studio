from __future__ import annotations

import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from campusweave import server


class HttpApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.CampusWeaveHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.allowed = {"Host": "localhost:8766", "Origin": "http://localhost:8766"}

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=3)

    def request(
        self,
        method: str,
        path: str,
        *,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_health_and_reference_are_offline_and_not_cacheable(self) -> None:
        status, headers, payload = self.request("GET", "/api/v1/health", headers=self.allowed)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload), {"mode": "offline_planning_only", "status": "ok"})
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

        status, _, payload = self.request("GET", "/api/v1/reference", headers=self.allowed)
        self.assertEqual(status, 200)
        response = json.loads(payload)
        self.assertFalse(response["dry_run"]["execution_authorized"])
        self.assertEqual(response["dry_run"]["network_calls"], 0)
        self.assertTrue(response["dry_run"]["all_steps_unbound"])

    def test_request_shape_origin_and_method_fail_closed(self) -> None:
        self.assertEqual(
            self.request("GET", "/api/v1/health", headers={"Host": "example.invalid"})[0], 403
        )
        self.assertEqual(
            self.request("GET", "/api/v1/health?unexpected=1", headers=self.allowed)[0], 404
        )
        status, headers, payload = self.request("PUT", "/api/v1/health", headers=self.allowed)
        self.assertEqual(status, 405)
        self.assertEqual(headers["Allow"], "GET, POST")
        self.assertEqual(json.loads(payload), {"error": "method_not_allowed"})

        status, _, payload = self.request(
            "POST",
            "/api/v1/compile-profile",
            body=b'{"profile":{},"profile":{}}',
            headers={**self.allowed, "Content-Type": "application/json"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(payload)["error"], "invalid_request")


if __name__ == "__main__":
    unittest.main()
