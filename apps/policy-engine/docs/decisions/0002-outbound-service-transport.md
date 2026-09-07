# 0002: Centralize fail-closed outbound service transport

Status: Active  
Date: 2026-08-09

## Context

Relution and Zammad connections carry credentials and may target operator-
supplied hosts. Redirects, DNS rebinding, unbounded responses, and inconsistent
timeouts could disclose credentials or make local workflows unsafe.

## Decision

Service clients use the shared transport and outbound-host policy. Destination
approval is resolved before connection, the approved socket address is pinned,
redirects are rejected, and request deadlines and response-size limits are
enforced centrally.

## Invariants

- HTTPS is the default; local, private, special-use, or cleartext destinations
  require the explicit lab-only opt-in.
- Hostname and resolved-address policy must agree before credentials are sent.
- Approved socket addresses are pinned for the request and redirects are never
  followed with credentials.
- Connection, response-body, size, and deadline failures remain bounded and
  fail closed.

## Ownership and source of truth

Repository maintainers own the boundary.
`src/platform/network/http-service-transport.ts`, its focused transport
modules, and `src/platform/network/outbound-host-policy.ts` are authoritative.

## Compatibility

Relution and Zammad adapters may retain their public request and error contracts,
but must not bypass the shared transport. Lab opt-in remains explicit and does
not become a production exception.

## Rollback and recovery

If a transport change regresses safe connections, revert the transport and its
adapter changes together or disable the affected external action. Do not recover
by following redirects, using an unvalidated address, removing limits, or
silently broadening the host allowlist.

## Verification

`tests/integration/outbound-service-contract.test.ts` proves that the Relution
and Zammad adapters share the pinned transport. The focused security suites
under `tests/security/` cover host policy and response bounds.
