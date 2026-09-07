# Using CampusWeave

CampusWeave has two offline interfaces: a browser workbench for reviewing and
exporting the reference-derived profile, and command adapters for validating
profiles, plans, target evidence, and OpenAPI catalogs. Run all commands below
from the repository root after an editable install.

```sh
python3 -m pip install --editable .
```

## Browser workbench

Start the fixed loopback service:

```sh
campusweave
```

Open <http://127.0.0.1:8766> and stop the service with `Ctrl-C`. The interface
can review the Reference University profile, change its institution code and
label, validate it, and export the resulting profile and plan. It cannot accept
arbitrary policies, target identifiers, credentials, request bodies, approvals,
or live results.

The browser stores one validated profile in local storage under
`campusweave:v1:profile`; imports and resets require confirmation. Plan export
remains disabled until the matching profile has been exported. Browser
downloads cannot enforce private file modes, so set an exported plan to `0600`
before validation or storage:

```sh
chmod 600 /approved/private/path/university-plan.json
```

## Inspect the reference profile

```sh
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status
```

`profile validate` checks the public synthetic profile and its registry
references. `profile status` emits its digest, counts, unresolved inputs, and
non-authorizing runtime state as JSON.

## Create and validate a plan

Create a reference-derived profile by changing only the institution identity,
then build, validate, and inspect its plan:

```sh
campusweave_work_dir=$(mktemp -d)

python3 scripts/campusweave_runtime.py profile instantiate \
  --institution-code example-u \
  --institution-label "Example University" \
  --output "$campusweave_work_dir/example-u-profile.json"

python3 scripts/campusweave_runtime.py plan build \
  --profile "$campusweave_work_dir/example-u-profile.json" \
  --output "$campusweave_work_dir/example-u-plan.json"

python3 scripts/campusweave_runtime.py plan validate \
  --profile "$campusweave_work_dir/example-u-profile.json" \
  --plan "$campusweave_work_dir/example-u-plan.json"

python3 scripts/campusweave_runtime.py dry-run \
  --profile "$campusweave_work_dir/example-u-profile.json" \
  --plan "$campusweave_work_dir/example-u-plan.json"
```

Creation never replaces an existing output. Profiles are written as public
commit-safe data; plans are written with mode `0600`. Plan validation and dry
run require `0600` by default. `--allow-nonprivate` exists only to inspect an
offline plan with no target evidence and does not weaken target-context rules.

A successful dry run proves that the profile and plan are internally
consistent, digest-matched, dependency-closed, and still blocked. It reports
`execution_ready: false`, `execution_authorized: false`, `network_calls: 0`,
and `mutation_calls: 0`. It proves nothing about a target, permission, live
inventory, operation semantics, approval, or outcome.

## Validate target-context evidence

Validate the checked-in empty template:

```sh
python3 scripts/campusweave_runtime.py target validate \
  --context docs/relution/templates/university-runtime-target.json
```

A completed context must remain outside the repository. It binds private,
digest-matched copies of the profile, OpenAPI document, catalog, bindings, and
inventory beneath one traversal-free evidence root. The context file and each
artifact must be a regular non-symlink file with mode `0600`; its directories
must be owned by the current user with mode `0700`.

Validation checks local structure and cross-artifact consistency. Operation
roles remain `operator_asserted_unproven`, and `execution_authorized` remains
false. Tokens are never part of this artifact.

## Render and check an OpenAPI catalog

Obtain a JSON contract through an explicitly authorized target's documented
export control. Keep it and its derived catalogs in the ignored local area:

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

python3 scripts/campusweave_runtime.py contract check \
  --spec .local/relution-contract/relution-openapi.json \
  --catalog .local/relution-contract/API_CATALOG.json
```

The renderer supports JSON Swagger 2.0 and OpenAPI 3.0 through 3.2. It makes no
network requests, resolves local operation-bearing references, and rejects
external operation-bearing references that could conceal operations. The
source contract remains authoritative for full schemas.

Never replace `docs/relution/generated/API_CATALOG.*`; those checked-in files
are fail-closed placeholders with `status: not_generated`.

## Validate checked-in machine documents

```sh
python3 scripts/validate_machine_docs.py
```

This validates the registries, schema references, placeholder catalog,
bindings template, and change-plan template. See the
[Relution contract pack](relution/README.md) for the artifact model and the
[operations runbook](relution/OPERATIONS.md) before any separately authorized
live request.

## Troubleshooting

- `ModuleNotFoundError: campusweave` from a script adapter means the editable
  install is missing or belongs to another interpreter.
- A stale catalog check means the source document, renderer, or output changed;
  regenerate both catalog files and review the operation diff.
- A private-artifact mode or symlink error is a safety failure. Correct the
  ownership, location, or mode rather than using a permissive fallback.
- Port `8766` is fixed. Stop the other listener instead of exposing
  CampusWeave on another interface or port.
