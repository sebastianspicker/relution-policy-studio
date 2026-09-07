/** Protects outbound service calls from local, private, and DNS-rebound targets. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOutboundHostAllowed,
  literalServiceHostPolicyError,
  outboundHostPolicyError,
  resolveAllowedServiceAddresses,
} from "../../src/platform/network/outbound-host-policy.js";

const blockedLocalHosts = [
  "::ffff:192.168.1.1",
  "::ffff:10.0.0.1",
  "::ffff:172.16.0.1",
  "100.64.0.1",
  "198.18.0.1",
  "192.0.0.1",
  "192.88.99.1",
  "203.0.113.1",
  "240.0.0.1",
  "fc00::1",
  "fe80::1",
  "fec0::1",
  "::127.0.0.1",
  "::ffff:0:127.0.0.1",
  "::ffff:0:8.8.8.8",
  "64:ff9b::7f00:1",
  "64:ff9b:1::7f00:1",
  "2001::7f00:1",
  "2001:2::1",
  "2001:10::1",
  "2001:20::1",
  "2002:7f00:1::",
  "2001:db8::1",
  "3fff::1",
  "5f00::1",
];

for (const host of blockedLocalHosts) {
  test(`assertOutboundHostAllowed rejects ${host}`, async () => {
    await assert.rejects(
      assertOutboundHostAllowed("Relution", host, false),
      /blocked local\/private address/u,
    );
  });
}

const allowedPublicHosts = ["2606:4700:4700::1111", "8.8.8.8"];

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

test("literal host checks reject private addresses without a DNS preflight", () => {
  assert.match(literalServiceHostPolicyError("Relution", "[::1]", false) ?? "", /blocked local\/private address/u);
  assert.equal(literalServiceHostPolicyError("Relution", "8.8.8.8", false), undefined);
  assert.equal(literalServiceHostPolicyError("Relution", "127.0.0.1", true), undefined);
});

test("outboundHostPolicyError returns blocked when DNS resolves to a private address", async () => {
  const result = await outboundHostPolicyError("Relution", "internal.example.test", false, async () => ["10.0.0.1"]);

  assert.equal(result?.kind, "blocked");
  assert.match(result.reason, /blocked local\/private address \(10\.0\.0\.1\)/u);
});

test("outboundHostPolicyError returns undefined when DNS resolves to a public address", async () => {
  const result = await outboundHostPolicyError("Relution", "public.example.test", false, async () => ["8.8.8.8"]);

  assert.equal(result, undefined);
});

test("outbound policy fails closed when DNS returns no answers", async () => {
  const result = await outboundHostPolicyError("Relution", "empty.example.test", false, async () => []);

  assert.equal(result?.kind, "dns-failure");
  assert.match(result?.error ?? "", /DNS returned no addresses/u);
});

test("resolveAllowedServiceAddresses rejects mixed public and private DNS answers", async () => {
  await assert.rejects(
    resolveAllowedServiceAddresses("Relution", "rebind.example.test", false, async () => ["8.8.8.8", "127.0.0.1"]),
    /blocked local\/private address \(127\.0\.0\.1\)/u,
  );
});

test("resolveAllowedServiceAddresses returns exact approved addresses for socket pinning", async () => {
  const addresses = await resolveAllowedServiceAddresses(
    "Relution",
    "public.example.test",
    false,
    async () => ["8.8.8.8", "2606:4700:4700::1111"],
  );

  assert.deepEqual(addresses, [
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
});

test("resolveAllowedServiceAddresses fails closed when DNS returns no answers", async () => {
  await assert.rejects(
    resolveAllowedServiceAddresses("Relution", "empty.example.test", false, async () => []),
    /DNS returned no addresses/u,
  );
});

test("resolveAllowedServiceAddresses normalizes the resolver host and preserves first-seen address order", async () => {
  let resolvedHost: string | undefined;
  const addresses = await resolveAllowedServiceAddresses("Relution", " [Example.Test.] ", false, async (_service, hostname) => {
    resolvedHost = hostname;
    return ["8.8.8.8", "2606:4700:4700::1111", "8.8.8.8"];
  });

  assert.equal(resolvedHost, "example.test");
  assert.deepEqual(addresses, [
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
});

test("trusted local override skips preflight DNS while socket resolution still validates answers", async () => {
  let preflightInvoked = false;
  const policy = await outboundHostPolicyError("Relution", "lab.example.test", true, async () => {
    preflightInvoked = true;
    return ["not-an-ip"];
  });
  assert.equal(policy, undefined);
  assert.equal(preflightInvoked, false);
  await assert.doesNotReject(resolveAllowedServiceAddresses("Relution", "lab.example.test", true, async () => ["127.0.0.1"]));

  for (const allowLocalServiceHosts of [false, true]) {
    await assert.rejects(
      resolveAllowedServiceAddresses("Relution", "malformed.example.test", allowLocalServiceHosts, async () => ["not-an-ip"]),
      /invalid address not-an-ip/u,
    );
  }

  const malformedPolicy = await outboundHostPolicyError("Relution", "malformed.example.test", false, async () => ["not-an-ip"]);
  assert.equal(malformedPolicy?.kind, "dns-failure");
});

test("resolver timeout is validated before invoking the resolver", async () => {
  let invoked = false;
  await assert.rejects(
    resolveAllowedServiceAddresses("Relution", "public.example.test", false, async () => {
      invoked = true;
      return ["8.8.8.8"];
    }, 0),
    /DNS timeout must be a positive safe integer/u,
  );
  assert.equal(invoked, false);
});

test("service-address classification includes private subnet boundaries", async () => {
  await assert.doesNotReject(resolveAllowedServiceAddresses("Relution", "boundary.example.test", false, async () => ["100.63.255.255", "172.32.0.0"]));
  for (const address of ["100.64.0.0", "172.31.255.255"]) {
    await assert.rejects(
      resolveAllowedServiceAddresses("Relution", "boundary.example.test", false, async () => [address]),
      /blocked local\/private address/u,
    );
  }
});

test("resolveAllowedServiceAddresses bounds direct resolver calls", async () => {
  await assert.rejects(
    resolveAllowedServiceAddresses("Relution", "hung.example.test", false, async () => await new Promise(() => undefined), 5),
    /resolution exceeded 5ms/u,
  );
});
