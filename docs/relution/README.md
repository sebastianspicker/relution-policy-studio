# Relution API operations

This directory contains the Relution contract handbook, machine-readable
registries, schemas, templates, reference university profile, and fail-closed
catalog placeholders used by CampusWeave.

CampusWeave performs no live Relution request. The transport helper is available
only for separately authorized operations that satisfy the contract and safety
requirements below.

## Source precedence

Use sources in this order:

1. OpenAPI JSON exported from the exact authorized Relution instance.
2. Authenticated read-only responses and audit records from that instance.
3. Release-matched Relution documentation listed in
   [`SOURCES.md`](SOURCES.md).
4. Repository registries and examples.

Do not infer a path, method, parameter, schema, identifier format, response, or
permission from another Relution version.

## Required context

Before a live request, record:

- explicitly authorized HTTPS origin;
- effective operation server, including any base path;
- target version;
- organization identifier and name;
- acting identity, role, and intended permission scope;
- exact local OpenAPI document;
- selected catalog operation and source schema;
- stable resource identifier;
- requested field-level outcome;
- independent read-back check; and
- recovery or rollback procedure.

If any value is missing, stop or perform bounded read-only discovery.

## Local contract workspace

Keep the target OpenAPI document and its catalogs under the ignored local
directory:

```sh
mkdir -p .local/relution-contract

python3 scripts/render_relution_openapi.py \
  --spec .local/relution-contract/relution-openapi.json \
  --output .local/relution-contract/API_CATALOG.md \
  --json-output .local/relution-contract/API_CATALOG.json

python3 scripts/render_relution_openapi.py \
  --spec .local/relution-contract/relution-openapi.json \
  --output .local/relution-contract/API_CATALOG.md \
  --json-output .local/relution-contract/API_CATALOG.json \
  --check

python3 scripts/validate_machine_docs.py \
  --spec .local/relution-contract/relution-openapi.json \
  --catalog .local/relution-contract/API_CATALOG.json
```

Confirm the catalog source digest, server information, version, and operation
count against the intended export. Do not replace the checked-in
`generated/API_CATALOG.md` or `generated/API_CATALOG.json`; they must remain
empty fail-closed placeholders.

## Documentation map

| File | Purpose |
| --- | --- |
| [`API_CONTRACT.md`](API_CONTRACT.md) | Contract acquisition, server resolution, authentication, requests, pagination, uploads, and asynchronous jobs |
| [`API_OPERATIONS.md`](API_OPERATIONS.md) | Operation discovery and capability families |
| [`SETTINGS_RUNBOOK.md`](SETTINGS_RUNBOOK.md) | Impact classification, authorization, mutation, verification, audit, and rollback |
| [`SAFETY_AND_TROUBLESHOOTING.md`](SAFETY_AND_TROUBLESHOOTING.md) | Stop conditions, dangerous actions, failures, retries, and secret handling |
| [`MACHINE_READABLE.md`](MACHINE_READABLE.md) | Registries, schema relationships, bindings, and validation rules |
| [`UNIVERSITY_RUNTIME.md`](UNIVERSITY_RUNTIME.md) | Offline profile, plan, target-context, and dry-run contracts |
| [`CAMPUSWEAVE.md`](CAMPUSWEAVE.md) | Browser workflow, persistence, exports, and validation meaning |
| [`SOURCES.md`](SOURCES.md) | External technical references and their limits |

## Machine-readable content

| Directory | Content |
| --- | --- |
| `registries/` | Relution concepts, settings, policy, group, and public operation references |
| `schemas/` | JSON Schema 2020-12 contracts |
| `templates/` | Fail-closed target binding, target context, and settings-change records |
| `packages/university/` | Reference University desired-state profile |
| `generated/` | Checked-in empty catalog placeholders |
| `openapi/` | Instructions for local target OpenAPI storage |

Run `python3 scripts/validate_machine_docs.py` after changing any registry,
schema, template, or reference profile.

## Authentication

The optional zsh helper reads:

- `RELUTION_API_SERVER`, the exact approved HTTPS server and base path; and
- `RELUTION_API_TOKEN`, an unexported shell variable.

Source the helper only after reviewing [`API_CONTRACT.md`](API_CONTRACT.md):

```sh
source scripts/relution_curl.zsh
```

The helper restricts HTTP methods, request headers, body input, output paths,
timeouts, and request destination. It does not determine whether an operation is
authorized or safe.

## Mutation requirements

For every `POST`, `PUT`, `PATCH`, `DELETE`, bulk operation, or device command:

1. Classify impact with [`SETTINGS_RUNBOOK.md`](SETTINGS_RUNBOOK.md).
2. Confirm the exact target, organization, resource, operation, and effect.
3. Read the current resource directly.
4. Prepare the smallest field-level change and a recovery plan.
5. Validate authentication and scope with a bounded read.
6. Send one bounded request. Do not retry unless target-defined idempotency is
   proven.
7. Check the documented response.
8. Read the resource back independently.
9. Match the audit record.
10. Record the result and rollback status without sensitive values.

Destructive, externally visible, authentication, trust, enrollment, policy,
application, certificate, synchronization, and fleet-wide operations require
explicit approval immediately before execution.

## What repository validation proves

Repository validation can prove local schema consistency, digest relationships,
catalog freshness, required fields, and fail-closed state. It cannot prove:

- target availability or version compatibility;
- identity permissions;
- external inventory truth;
- operation semantics beyond the exact contract;
- approval;
- device or service outcome;
- audit evidence; or
- rollback success.

An HTTP success response without independent read-back is not sufficient
evidence that the requested state exists.
