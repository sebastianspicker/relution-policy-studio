import assert from "node:assert/strict";
import test from "node:test";
import { assertOutboundHostAllowed, outboundHostPolicyError } from "../src/outbound-host-policy.js";

const blockedLocalHosts = [
  "::ffff:192.168.1.1",
  "::ffff:10.0.0.1",
  "::ffff:172.16.0.1",
  "fc00::1",
  "fe80::1",
];

for (const host of blockedLocalHosts) {
  test(`assertOutboundHostAllowed rejects ${host}`, async () => {
    await assert.rejects(
      assertOutboundHostAllowed("Relution", host, false),
      /blocked local\/private address/u,
    );
  });
}

const allowedPublicHosts = ["2001:db8::1", "8.8.8.8"];

for (const host of allowedPublicHosts) {
  test(`assertOutboundHostAllowed accepts ${host}`, async () => {
    await assert.doesNotReject(assertOutboundHostAllowed("Relution", host, false));
  });
}

test("outboundHostPolicyError returns dns-failure when DNS resolution throws ENOTFOUND", async () => {
  const result = await outboundHostPolicyError("Relution", "missing.example.test", false, async () => {
    throw new Error("getaddrinfo ENOTFOUND missing.example.test");
  });

  assert.equal(result?.kind, "dns-failure");
  assert.match(result.error, /ENOTFOUND/u);
});

test("outboundHostPolicyError returns blocked when DNS resolves to a private address", async () => {
  const result = await outboundHostPolicyError("Relution", "internal.example.test", false, async () => ["10.0.0.1"]);

  assert.equal(result?.kind, "blocked");
  assert.match(result.reason, /blocked local\/private address \(10\.0\.0\.1\)/u);
});

test("outboundHostPolicyError returns undefined when DNS resolves to a public address", async () => {
  const result = await outboundHostPolicyError("Relution", "public.example.test", false, async () => ["203.0.113.1"]);

  assert.equal(result, undefined);
});
