/** Covers URL-like connection host parsing and field-precedence invariants. */
import assert from "node:assert/strict";
import test from "node:test";
import { HttpConnectionInputError, normalizeHttpConnectionInput } from "../../src/platform/network/connection-normalization.js";

function normalize(host: string, overrides: Partial<Parameters<typeof normalizeHttpConnectionInput>[0]> = {}) {
  return normalizeHttpConnectionInput({ host, serviceName: "Test service", ...overrides });
}

test("normalizes explicit HTTP URL protocol, port, and base path", () => {
  assert.deepEqual(normalize(" http://service.example.test:8080/customer-a/ "), {
    protocol: "http",
    host: "service.example.test",
    port: 8080,
    basePath: "/customer-a",
    baseUrl: "http://service.example.test:8080/customer-a",
    allowLocalServiceHosts: false,
  });
});

test("normalizes a bare host without treating parser HTTPS as explicit input", () => {
  assert.deepEqual(normalize("service.example.test:8443/customer-a"), {
    protocol: "https",
    host: "service.example.test",
    port: 8443,
    basePath: "/customer-a",
    baseUrl: "https://service.example.test:8443/customer-a",
    allowLocalServiceHosts: false,
  });
});

test("explicit connection fields override URL-derived protocol, port, and base path", () => {
  assert.deepEqual(normalize("https://service.example.test:8443/customer-a", {
    protocol: "http",
    port: 8080,
    basePath: "/field-override/",
  }), {
    protocol: "http",
    host: "service.example.test",
    port: 8080,
    basePath: "/field-override",
    baseUrl: "http://service.example.test:8080/field-override",
    allowLocalServiceHosts: false,
  });
});

test("preserves bracketed IPv6 authority formatting for raw and URL-like hosts", () => {
  assert.equal(normalize("::1", { port: 8443 }).baseUrl, "https://[::1]:8443");
  assert.equal(normalize("https://[::1]:9443/customer-a").baseUrl, "https://[::1]:9443/customer-a");
});

test("keeps blank-host and malformed-host fallback behavior", () => {
  assert.throws(
    () => normalize("   "),
    (error) => error instanceof HttpConnectionInputError && error.message === "Test service host is required",
  );
  assert.deepEqual(normalize("https://[invalid/path"), {
    protocol: "https",
    host: "[invalid",
    basePath: "",
    baseUrl: "https://[invalid",
    allowLocalServiceHosts: false,
  });
});
