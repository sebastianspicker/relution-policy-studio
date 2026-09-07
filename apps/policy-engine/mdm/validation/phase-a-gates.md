# Phase A evidence and JSON gates

The repository permits offline LAB output against the checked-in Relution
26.1.1 reference schema. Target-tenant identity, harmless Lab round-trip
behavior, device application, rollback, and production approval remain
`NOT_EVIDENCED`.

## Schema establishment procedure

1. Record exact installed Server/Portal/client/Companion/API versions and build
   identifiers.
2. Export at least one harmless policy per active platform and one policy using
   each planned payload family. Hash and retain originals in `private/`.
3. Inspect clear `metadata.json`/`report.json` and decrypt only in controlled
   private storage. Compare container/framing, required metadata, type names,
   enums, identifiers, references, secrets/placeholders and assignment fields.
4. Determine create/update/duplicate behaviour for policy UUID, version UUID,
   name, dependency and assignment. Never infer idempotency.
5. Compare installed OpenAPI/runtime metadata with the 26.1.1 bundle and record
   added, removed, deprecated, hidden, preview and incompatible fields.
6. Build one minimal harmless archive from an installed-version export, verify
   hashes/decryptability, import into Lab, export again, and compare semantic
   state. Do not attach production groups.
7. Apply to one representative Lab device per active model; capture delivery,
   effective-state, error, user-impact and rollback evidence.

## Artifact status vocabulary

Every future manifest row must contain independent booleans/timestamps for:

- `syntax_validated`
- `schema_validated` with exact Relution version/build
- `roundtrip_imported_in_lab`
- `applied_to_test_device`
- `rollback_tested`
- `production_approved`

No earlier status implies a later one.

## Required validators for Phase B

- source YAML schema and required-field validation;
- stable unique control and policy IDs;
- source-reference and assignment-reference completeness;
- platform, enrolment and minimum-OS applicability;
- duplicate policy/configuration/identifier detection;
- same-setting conflict analysis across layers and overlapping groups;
- unresolved placeholder and secret-pattern failure;
- deterministic ordering/regeneration and manifest SHA-256;
- source-to-generated semantic comparison;
- import-unit JSON Schema/OpenAPI validation for the installed version;
- human-readable diff and report;
- explicit offline default: no production network call without a separate flag.

## Conflict test matrix

Test at least same field in two policies, two group overlaps, baseline plus
exception, legacy Apple profile plus DDM declaration, Windows CSP conflicts,
Android explicit versus omitted values, app/config dependency, certificate
renewal, update-ring overlap, kiosk override and policy removal/rollback.
Record expected precedence, observed result, affected device, OS/build, user and
security impact, and disposition. Never assume “most restrictive wins”.

## Current deterministic checks

```sh
pnpm rexp inspect example/sample-policy-export.rexp --json
pnpm typecheck
pnpm test:node
pnpm rexp mdm validate
pnpm rexp mdm diff
```

Docker import/export and dashboard tests are optional environment proof and do
not prove a production tenant. Live API collection must remain read-only and
must report truncation; the current client permits only POST
`/api/v2/devices/baseInfo/query` and defaults to 100 results.
