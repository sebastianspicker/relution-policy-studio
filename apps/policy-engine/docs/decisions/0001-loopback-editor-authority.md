# 0001: Keep editor authority loopback-only and capability-bound

Status: Active  
Date: 2026-08-09

## Context

The browser editor can read and mutate sensitive local policy workspaces. A
network-reachable listener or ambient browser authority would expand that trust
boundary beyond the local operating-system account.

## Decision

The editor remains loopback-only. Normal CLI startup creates a high-entropy
capability token, and API access is accepted only through the loopback host and
request authority checks. The runtime retains an explicit token-injection seam
for controlled integration use; it is not an operational credential store or a
supported way to create reusable editor URLs.

## Invariants

- Server startup accepts only loopback listener addresses.
- Normal CLI startup generates the process capability token at runtime, and the
  application does not persist it in the repository or workspace.
- A caller that injects a token assumes responsibility for its strength and
  secrecy; injection never broadens the loopback or origin boundary.
- API requests require the expected capability and loopback host authority.
- Mutating browser requests must satisfy the same-origin request guard.

## Ownership and source of truth

Repository maintainers own the boundary. The implementation authority is
`src/editor/editor-server-runtime.ts` and
`src/editor/editor-api-request-guards.ts`; CLI host validation remains aligned
with those modules.

## Compatibility

Local CLI and browser workflows may change presentation, but existing loopback
URLs and authorized API behavior must remain usable. Network editor support is
not a compatibility requirement.

## Rollback and recovery

On authority failure, stop the editor and use normal CLI startup to obtain a
new token. Revert a faulty authority change as one unit; do not recover by
binding a non-loopback address or bypassing token or origin checks.

## Verification

`tests/integration/editor-loopback-authority.test.ts` exercises the real
listener, bind-address, host, token, and same-origin boundaries.
