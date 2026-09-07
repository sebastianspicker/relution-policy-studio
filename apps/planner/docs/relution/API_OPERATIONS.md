# Public API operation examples

This page is the human companion to
`registries/public-api-operations.json`. It records the six concrete paths
captured from Relution's public REST API guide on 2026-07-18. The set is a
historical discovery aid, not a complete or current target contract.

Every record has `execution_status` set to an example-only or
target-contract-required state. Before any request, generate a catalog from the
exact authorized target and inspect the original OpenAPI schema as described in
[the contract pack](README.md).

## User import examples

- `POST /api/management/v1/csvImport/upload/users` uploads a CSV for the
  documented asynchronous import flow. The target contract must define the
  multipart fields, limits, scope, responses, and cleanup.
- `POST /api/management/v1/security/users/import/fromFile/{file_uuid}` starts a
  background import. The target contract must define the file identifier,
  options, validation, organization, response, and retry behavior.
- `GET /api/management/v1/csvImport/job/{job_uuid}` reads aggregate job status.
  The target contract must define states, polling bounds, errors, retention,
  cancellation, and scope.
- `POST /api/management/v1/csvImport/job/{job_uuid}/entityStates/query` queries
  per-entity outcomes. The target contract must define its body, pagination,
  sorting, result schema, and terminal-state semantics.

Submitting a job is not completion. Poll only the target-documented status
operation with finite limits, inspect all entity-result pages, and do not
resubmit an unknown outcome.

## Organization example

`POST /api/management/v1/security/organizations/creationWizardRequests`
represents the public organization-creation example. It does not establish a
target's required fields, parent or license effects, permissions, asynchronous
behavior, duplicate handling, or rollback.

## Device query example

`/api/management/v2/devices/baseInfo/query` appears in the public guide, but
the presentation of its method and body is ambiguous across API generations.
The machine registry intentionally stores `method: null`. A client must not
select a verb from this page; use only the method and schema in the exact target
contract.

## Boundary

These paths do not prove target availability, licensing, authorization,
organization scope, request or response shape, success statuses, idempotency,
or runtime outcome. The authoritative evidence order and live-request controls
are in the [Relution operations runbook](OPERATIONS.md).
