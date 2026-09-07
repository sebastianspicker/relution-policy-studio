# Relution contract pack

This subtree is a checked-in, machine-readable description of Relution product
concepts plus fail-closed templates for target-specific evidence. CampusWeave
uses it to validate a synthetic university profile, compile offline intent, and
inspect a caller-supplied OpenAPI document. It contains no live tenant contract,
credential, inventory, approval, or executable operation.

## Authority and source precedence

For target-specific work, use evidence in this order:

1. the OpenAPI JSON exported from the exact authorized target;
2. authenticated, authorized read-only responses and audit records from that
   target;
3. release-matched official Relution documentation;
4. this repository's registries, templates, and examples.

Repository records provide discovery vocabulary, product semantics, and safety
cues. They cannot establish a target's exact path, schema, license, permission,
runtime state, or operation meaning.

## Artifact map

- `registries/manifest.json` is the canonical index of concept registries and
  their schemas.
- `registries/{features,settings,policies,groups}.json` provides stable IDs,
  relationships, evidence, risk, and discovery terms. It is a capability map,
  not executable data.
- `registries/public-api-operations.json` holds deliberately incomplete,
  non-authorizing public-guide examples.
- `schemas/` contains the JSON Schema 2020-12 structural contracts.
- `templates/target-bindings.json` is an empty catalog-digest-bound operation
  map. Role labels remain operator assertions.
- `templates/settings-change-plan.json` is an empty bounded change/evidence
  record. Structural validity is not approval.
- `templates/university-runtime-target.json` is an empty private target context
  with execution disabled.
- `packages/university/desired-state.json` is the synthetic commit-safe profile.
- `generated/API_CATALOG.json` and `.md` are `not_generated` markers. Never
  replace them with target data.

Detailed consumer rules are in [Machine-readable contracts](MACHINE_READABLE.md).
The six public-guide examples have a concise human companion in
[Public API operation examples](API_OPERATIONS.md). The evidence classes and
first-party provenance used by the registries are indexed in
[Relution evidence sources](SOURCES.md).

## Validate the checked-in pack

Install CampusWeave editably, then run from the repository root:

```sh
python3 scripts/validate_machine_docs.py
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status
```

The first command validates schema references, stable IDs, cross-references,
catalog state, bindings, and change-plan structure. The profile commands add
the university-specific semantic checks. Passing them proves only local
consistency and fail-closed state.

## Target-local contract workflow

Use the target's documented Web API export control. Do not guess an OpenAPI URL
or substitute a public/demo contract. Store the JSON and its derived catalogs
under the ignored local workspace:

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

The generated catalog enumerates supported operation surfaces for exactly one
source digest. It is an index, not a replacement for referenced schemas or a
proof of runtime availability. A new digest invalidates bindings and pending
change plans tied to the old catalog.

Keep target contracts, completed catalogs, bindings, plans, request bodies,
snapshots, audit exports, and device or user data out of the tracked tree.
Private target-context artifacts require the ownership, path, link, and mode
protections described in [Using CampusWeave](../USAGE.md).

## Live transport

CampusWeave itself makes no Relution request. `scripts/relution_curl.zsh` is a
separately sourced helper for an independently authorized operation. Read the
[Relution operations runbook](OPERATIONS.md) before using it. Validation of a
context, catalog, binding, or change plan never authorizes the helper.
