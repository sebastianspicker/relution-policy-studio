# Relution evidence sources

This register records the first-party sources used to build the checked-in
concept registries and public operation examples. The URL attached to each
registry evidence record remains the precise provenance for that claim. For a
live target, the exported OpenAPI document and authorized observations take
precedence over every page listed here.

## API, versions, and audit

- [REST API guide](https://hub.relution.io/en/docs/settings/rest-api/) supports
  the documented token header and lifecycle, Web API export route, asynchronous
  user-import sequence, and the six paths summarized in
  [Public API operation examples](API_OPERATIONS.md). Its examples are not a
  complete or release-matched target contract.
- [Public Web API reference](https://live.relution.io/web-api/index.html) and
  [vulnerability disclosure policy](https://hub.relution.io/en/docs/product-info/disclosure/)
  establish that an interactive reference exists and requires registration. A
  public contract cannot establish a customer target's version, modules,
  permissions, or paths.
- [Changelog](https://hub.relution.io/en/docs/product-info/changelog/) supports
  the warning that endpoints, groupings, query methods, form-data schemas, and
  compatibility can change between releases.
- [Audit documentation](https://hub.relution.io/en/docs/settings/audit/)
  supports the audit capability vocabulary and audit-field guidance. An event
  name is not an HTTP method or path binding.
- [API logging guidance](https://hub.relution.io/en/docs/installation/knowledge-base/loglevel-debug/)
  supports permission, logger-level, reset, and debug-volume cautions. Resolve
  the exact endpoint from the target contract rather than from screenshots.

## Security and settings

- [Security optimization](https://hub.relution.io/en/docs/installation/knowledge-base/security-optimization/)
  supports preferring expiring API tokens to stored passwords and the warning
  about IP-rule lockout. Apply the target's network design and local security
  policy.
- [Settings index](https://hub.relution.io/en/docs/settings/) is the discovery
  source for settings domains represented by the feature and setting
  registries; it does not define their wire schemas.
- [Global settings](https://hub.relution.io/en/docs/settings/global/),
  [multi-factor authentication](https://hub.relution.io/en/docs/settings/mfa/),
  [login blocking](https://hub.relution.io/en/docs/settings/fail2ban/), and
  [off-time](https://hub.relution.io/en/docs/settings/offtime/) support the
  organization-distribution, recovery, lockout, and calendar-precedence
  concepts.
- [User profile](https://hub.relution.io/en/docs/general/usermanagement/user-profile/)
  supplies user-facing access-token context.
- [Relution Cloud quotas](https://hub.relution.io/en/docs/relution-cloud/cloud-quotas/)
  establishes that upload, storage, and action quotas exist. Published cloud
  values are not a contract for a particular deployment.

## Policies, groups, and permissions

- [Policy lifecycle](https://hub.relution.io/en/docs/general/devicemanagement/policies/)
  and the platform overviews for
  [iOS](https://hub.relution.io/en/docs/apple-ios/policies/ios-policy-overview/),
  [tvOS](https://hub.relution.io/en/docs/apple-tvos/policies/policy-overview/),
  [macOS](https://hub.relution.io/en/docs/apple-macos/policies/policy-overview/),
  [Android Enterprise](https://hub.relution.io/en/docs/android-enterprise/policies/overview/),
  [Android Classic](https://hub.relution.io/en/docs/android-classic/policies/overview/),
  and [Windows](https://hub.relution.io/en/docs/windows/policies/policy-overview/)
  support the policy capability and lifecycle vocabulary. The exact target
  release determines available configuration schemas.
- [Device groups](https://hub.relution.io/en/docs/general/devicemanagement/devicegroups/)
  and [group actions](https://hub.relution.io/en/docs/general/devicemanagement/actions-groups-overview/)
  support static and dynamic membership, group references, assignment, and
  action-risk concepts. Action schemas, schedule syntax, and platform support
  remain target-contract facts.
- [User-based policy targeting](https://hub.relution.io/en/docs/general/devicemanagement/user-based-policy/)
  and [permissions](https://hub.relution.io/en/docs/general/usermanagement/permissions/)
  support user/group targeting and the distinction between grouping and
  authorization.

## Format and transport standards

- [OpenAPI 3.2](https://spec.openapis.org/oas/v3.2.0.html),
  [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.1.html), and
  [Swagger 2.0](https://spec.openapis.org/oas/v2.0.html) define the operation,
  server, webhook, callback, media-type, and scheme semantics implemented by
  the catalog parser. They do not show which features a Relution export uses.
- [curl command-line manual](https://curl.se/docs/manpage.html) is the source
  for the restricted helper's configuration, timeout, and request-construction
  behavior. Operators remain responsible for an approved curl build.

## Evidence classes

- `official_documentation`: a claim directly supported by a linked first-party
  source.
- `target_contract`: a fact present in the exact target OpenAPI document and
  digest-bound generated catalog.
- `observed_runtime`: a result from an authorized request to that target.
- `recommendation`: a local safety rule or interpretation rather than a
  product or endpoint claim.

Capability records and public examples are discovery aids. Archived SDKs, old
CLI tools, third-party posts, search-result snippets, and contracts from other
Relution instances are not current target truth and must not justify a live
request.
