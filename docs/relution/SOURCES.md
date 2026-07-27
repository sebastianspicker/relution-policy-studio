# Official sources and evidence boundaries

All links below were checked on 2026-07-24. The target instance's OpenAPI
contract remains authoritative for exact live operations.

## Primary sources

### REST API guide

- URL: <https://hub.relution.io/en/docs/settings/rest-api/>
- Used for: REST API availability; target UI documentation; access-token
  creation and `X-User-Access-Token`; token lifecycle guidance; user-import
  background-job sequence; representative query/pagination structure;
  organization creation and device-base-info public examples.
- Boundary: examples can lag, contain abbreviated bodies, or differ from a
  target release. The device query example is not used here as a runnable write
  contract.

### Target/public Web API reference

- Public entry point: <https://live.relution.io/web-api/index.html>
- Registration statement and scope context:
  <https://hub.relution.io/en/docs/product-info/disclosure/>
- Used for: establishing that Relution has an interactive OpenAPI/Web API
  reference and that the public reference requires registration.
- Boundary: a public/demo contract does not prove a customer deployment's
  version, enabled modules, paths, permissions, or authorization. No account was
  created and no endpoint was probed while authoring this repository.

### Changelog

- URL: <https://hub.relution.io/en/docs/product-info/changelog/>
- Used for: evidence that API paths, endpoint grouping, query methods, form-data
  schemas, and breaking behavior change across releases; evidence of standalone
  OpenAPI Web UI support.

### Audit log and audit-event reference

- URL: <https://hub.relution.io/en/docs/settings/audit/>
- Used for: audit fields, default documented retention, and the product-wide
  capability map in `API_OPERATIONS.md`.
- Boundary: an audit-event name is not a method/path mapping. Multiple API/UI
  workflows can produce an event, and a target can differ by version/module.

### Logging configuration by API

- URL:
  <https://hub.relution.io/en/docs/installation/knowledge-base/loglevel-debug/>
- Used for: required system permission, Web API authorization scheme name,
  logger/level selection, successful `204` example, reset/restore behavior, and
  debug-volume/performance warning.
- Boundary: the exact logging endpoint is intentionally not copied from an
  image or inferred; resolve it from the target contract.

### Security optimization

- URL:
  <https://hub.relution.io/en/docs/installation/knowledge-base/security-optimization/>
- Used for: preferring expiring API tokens to stored username/password and the
  lockout risk of IP access rules.
- Boundary: apply target-specific network/proxy architecture and organizational
  security policy.

### Settings index

- URL: <https://hub.relution.io/en/docs/settings/>
- Used for: cross-checking settings domains such as Android Enterprise, audit,
  certificate authority, conditional access, iOS/macOS, IP blocking, LDAP,
  Entra ID, login management, MFA, OIDC, remote support, REST API, and Secure
  Mail Gateway.

### Policies and policy platforms

- General lifecycle URL:
  <https://hub.relution.io/en/docs/general/devicemanagement/policies/>
- Platform overviews:
  <https://hub.relution.io/en/docs/apple-ios/policies/ios-policy-overview/>,
  <https://hub.relution.io/en/docs/apple-tvos/policies/policy-overview/>,
  <https://hub.relution.io/en/docs/apple-macos/policies/policy-overview/>,
  <https://hub.relution.io/en/docs/android-enterprise/policies/overview/>,
  <https://hub.relution.io/en/docs/android-classic/policies/overview/>, and
  <https://hub.relution.io/en/docs/windows/policies/policy-overview/>.
- Used for: platform immutability, template/publication/version/restore
  lifecycle, per-platform priority, global policy constraints, device policy
  status vocabulary, and documented configuration families.
- Boundary: these pages are capability snapshots. The target contract and
  reported release decide which configuration schemas are exposed.

### Device groups and group actions

- URLs:
  <https://hub.relution.io/en/docs/general/devicemanagement/devicegroups/> and
  <https://hub.relution.io/en/docs/general/devicemanagement/actions-groups-overview/>.
- Used for: static versus real-time dynamic membership, Boolean filters, group
  references and cycle hazards, published-policy assignment, bulk membership,
  entry/exit and scheduled actions, and destructive/action side effects.
- Boundary: action wire schemas, exact CRON representation, time zone, and
  platform applicability remain target-contract facts.

### User-based policy targeting and permissions

- URLs:
  <https://hub.relution.io/en/docs/general/devicemanagement/user-based-policy/>
  and
  <https://hub.relution.io/en/docs/general/usermanagement/permissions/>.
- Used for: user/user-group dynamic targeting, login/logout membership effects,
  additive permissions, default versus custom permissions, and the distinction
  between grouping and authorization.

### Global organization, login, and off-time behavior

- URLs: <https://hub.relution.io/en/docs/settings/global/>,
  <https://hub.relution.io/en/docs/settings/mfa/>,
  <https://hub.relution.io/en/docs/settings/fail2ban/>, and
  <https://hub.relution.io/en/docs/settings/offtime/>.
- Used for: cross-organization resource distribution, MFA and recovery risk,
  IP/user lockout behavior, and off-time calendar precedence.

### User profile and access tokens

- URL: <https://hub.relution.io/en/docs/general/usermanagement/user-profile/>
- Used for: user-profile access-token context.

### Relution Cloud quotas

- URL: <https://hub.relution.io/en/docs/relution-cloud/cloud-quotas/>
- Used for: warning operators that upload, storage, and device-action quotas exist.
- Boundary: published cloud quotas are reference values, not a contract for a
  particular shared, dedicated, or self-hosted instance.

### OpenAPI and Swagger specifications

- URLs: <https://spec.openapis.org/oas/v3.2.0.html>,
  <https://spec.openapis.org/oas/v3.1.1.html>, and
  <https://spec.openapis.org/oas/v2.0.html>
- Used for: operation enumeration semantics, Path Item fixed fields including
  `query`, `additionalOperations`, server precedence/variables, webhook-only
  contracts, callback Operation Objects, Swagger global media types, and
  operation-level scheme overrides.
- Boundary: these are API-description format standards, not evidence that a
  particular Relution export uses any specific format feature.

### curl command-line manual

- URL: <https://curl.se/docs/manpage.html>
- Used for: `--config -`, `--disable` as the first curl argument, finite
  connection/request timeouts, and guarded request construction.
- Boundary: the repository tests the installed curl/zsh behavior locally; an
  operator must still use an approved, supported curl build.

## Evidence labels used by this handbook

| Label | Meaning |
| --- | --- |
| Officially documented | Directly stated in a first-party source above |
| Contract-backed | Present in the exact target OpenAPI JSON and generated catalog |
| Observed | Returned by an authorized request to the target during the task |
| Verified changed | Documented success plus independent read-back and audit evidence |
| Capability map | Product concept found in official audit/settings documentation, not an endpoint claim |
| Example | Request/shape illustrating a workflow; target schema still required |
| Recommendation | Safety or operating practice derived from the documented behavior |

## Deliberately excluded sources

Archived SDKs, old CLI tools, third-party blog posts, search-result snippets, and
contracts from unrelated Relution instances are not used as current API truth.
They can be historical clues only, never the basis for a live mutation.
