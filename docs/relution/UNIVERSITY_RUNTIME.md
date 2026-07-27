# CampusWeave offline runtime

The university runtime turns a commit-safe institutional profile into a
deterministic, reviewable execution-intent graph. Version 1 is strictly
offline. It performs no HTTP request, reads no credential, contains no live
executor, and cannot authorize a mutation.

This boundary is intentional. A university profile can describe what should
exist, but only the exact target OpenAPI contract, current inventory,
independently established operation semantics, resource before state,
immediate approval, independent read-back, and audit evidence can prove that
one live change is safe.

## Artifact layers

| Layer | Location | Content and authority |
| --- | --- | --- |
| University profile | `packages/university/desired-state.json` | Public, PII-free organization, cohort, policy, group, assignment, workflow, and rollout intent; never target authority |
| Profile schema and validator | `schemas/university-profile.schema.json`, `scripts/university_profile.py` | Structural and semantic rules, including namespace closure, one-writer policy, BYOD safety, dependency cycles, and forbidden target/secret fields |
| Target-context template | `templates/university-runtime-target.json` | Credential-free local binding shape for one origin, organization, contract, catalog, binding set, inventory snapshot, profile digest, and private `evidence_root` |
| Offline plan | Output from `plan build` | Owner-only, deterministic 48-step graph of abstract, unresolved intents; every step remains `unbound` and blocked, rather than identifying one target resource |
| Exact target contract layer | OpenAPI export, generated catalog, and contract-bound operation references | Target-local evidence with operator-asserted, explicitly unproven role semantics; still not authorization |
| Live approval and evidence | Not implemented by runtime v1 | Outside the runtime and required before any separately implemented live operation |

## Commands

Validate and inspect the reference profile:

```sh
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status
```

Create a new institution-specific proposal. This changes only the institution
namespace and label; campus and department design must still be reviewed by the
institution before target binding:

```sh
python3 scripts/campusweave_runtime.py profile instantiate \
  --institution-code example-u \
  --institution-label "Example University" \
  --output /approved/local/path/example-u-profile.json
```

Compile and validate a deterministic, digest-bound offline intent plan:

```sh
python3 scripts/campusweave_runtime.py plan build \
  --profile /approved/local/path/example-u-profile.json \
  --output /approved/private/path/example-u-plan.json

python3 scripts/campusweave_runtime.py plan validate \
  --profile /approved/local/path/example-u-profile.json \
  --plan /approved/private/path/example-u-plan.json

python3 scripts/campusweave_runtime.py dry-run \
  --profile /approved/local/path/example-u-profile.json \
  --plan /approved/private/path/example-u-plan.json
```

The checked-in reference compiles to 48 steps: seven group-scope blueprints,
fifteen policy-definition intents, fifteen explicitly blocked
policy-publication prerequisites, and eleven assignment intents. Compilation is
deterministic and binds the plan to the exact profile SHA-256. These are
abstract intent nodes with unresolved cardinality, not one-resource plans or
operation bindings. The validator recomputes the full plan, checks every
dependency, rejects cycles and missing steps, and refuses plans with operation
bindings, execution authority, network capability, or mutation capability.

`plan build` creates a private `0600` output. `plan validate` and `dry-run`
also require that mode by default. `--allow-nonprivate` is an unsafe,
local-only opt-out for inspecting a plan that contains no target evidence; it
does not relax target-context or evidence protections. Keep plans and every
target-local evidence artifact out of the repository.

Validate the checked-in target-context template, or a completed private copy:

```sh
python3 scripts/campusweave_runtime.py target validate \
  --context docs/relution/templates/university-runtime-target.json
```

An evidence-bound context must be a regular file with mode `0600`. Its
traversal-free relative `evidence_root` names the private root for every bound
artifact.
Each directory below it must be current-user mode `0700`; every related OpenAPI,
profile, catalog, binding, and inventory artifact must be a non-symlink `0600`
file whose digest matches the context. The effective API server must exactly
equal the explicitly authorized HTTPS origin. Validation regenerates the
catalog from the exact OpenAPI bytes and requires byte-model equality, runs the
full machine binding validator, requires every profile concept/workflow pair
and its exact declared role set to be method-compatible, operation- and
organization-scope-bound, rejects one operation key masquerading as conflicting
mutation roles, and checks that the bounded inventory summary matches the same
profile, contract, target, organization, timestamp, and frozen scope. The
context must record `semantic_role_status: operator_asserted_unproven` because
an OpenAPI method and an operator-assigned label cannot prove whether an
otherwise compatible operation means publish, rollback, assign, or another
overlapping action. A successful validation therefore cannot select an
operation for execution. It proves local cross-artifact consistency, not role
semantics or the external truth of an inventory assertion. Tokens are not part
of this artifact.

For an evidence-bound context, `--profile` must name the private profile copy
beneath that context's `evidence_root`; using the checked-in public reference
profile is valid only for the checked-in template.

The execution-plan and target-context schema identities are stable,
location-independent URNs (`urn:campusweave-relution:schema:university-execution-plan:1.0.0`
and `urn:campusweave-relution:schema:university-runtime-target:1.0.0`), not
checkout-relative file locations.

Check an exact generated catalog against its source contract with the existing
machine validator:

```sh
python3 scripts/campusweave_runtime.py contract check \
  --spec /approved/private/path/relution-openapi.json \
  --catalog /approved/private/path/API_CATALOG.json
```

Both inputs are read as bounded regular non-symlink snapshots. Duplicate JSON
keys and non-finite values such as `NaN` or `Infinity` are rejected before the
catalog validator runs.

## Dry-run meaning

A successful dry-run means only that the commit-safe profile and offline plan
are internally consistent, digest-matched, dependency-closed, and still blocked
from execution. Its report explicitly records:

- `execution_ready: false`;
- `execution_authorized: false`;
- `network_calls: 0`; and
- `mutation_calls: 0`.

It does not establish target permissions, licensing, current inventory,
operation availability, request-schema validity, policy publication state,
group membership, device reach, rollback viability, or live outcome.

## Runtime v1 non-goals

Runtime v1 has no token access, HTTP transport, API mutation, publication,
assignment, settings update, device action, bulk operation, import,
synchronization, audit polling, rollback execution, resume behavior, endpoint
fallback, or adoption of institution-specific target objects. It never
interprets a profile, target context, or dry-run as approval.
