# Machine-readable Relution knowledge pack

This directory supplies two deliberately separate machine-readable layers:

1. **Product concept registries** describe officially documented Relution
   capabilities, settings domains, policy semantics, and group behavior. They
   are stable discovery and risk metadata. They never make a target endpoint
   executable.
2. **Target contract artifacts** are generated from the exact authorized
   instance's OpenAPI JSON. They carry concrete methods, paths, parameters,
   schemas, security, responses, and server metadata for that one contract
   digest.

An operator or automation client may use a concept record to decide what to
search for and how to classify risk. It may use an exact operation only after
the target catalog is generated and current. Tags, aliases, summaries, and
search terms identify candidates; they are not proof of an API binding.

## File map and authority

| File | Machine role | Authority and completeness |
| --- | --- | --- |
| `registries/manifest.json` | Registry entry point and coverage manifest | Canonical index for the hand-authored concept layer |
| `registries/features.json` | Product feature taxonomy and dependencies | Official capability map; availability remains target-specific |
| `registries/settings.json` | Settings domains, scopes, risk, mutation effects, verification, and rollback | Official capability map; exact fields and operations require the target contract |
| `registries/policies.json` | Policy lifecycle, platforms, configuration families, priority, assignment, and status semantics | Official product semantics; target version controls exposed schemas |
| `registries/groups.json` | Device/user/security group kinds, membership, filters, actions, and loop hazards | Official product semantics plus labeled safety recommendations |
| `registries/public-api-operations.json` | Exact examples published in the Relution REST guide | Deliberately non-exhaustive and not executable without target confirmation |
| `generated/API_CATALOG.json` | Public fail-closed catalog placeholder | Its checked-in `status` is `not_generated`; never replace it with a customer-derived catalog |
| `templates/target-bindings.json` | Digest-bound map from concept/workflow pairs to catalog operation keys | Template only; a concept may have distinct records for distinct workflows, and every completed binding must match the target catalog |
| `templates/settings-change-plan.json` | One bounded mutation plan and result record | Template only; valid structure is not authorization |
| `packages/university/desired-state.json` | Active PII-free university organization, persona, policy, group, rollout, and API-workflow profile | Commit-safe intent only; contains no target IDs, endpoints, payloads, approval, or execution capability |
| `schemas/university-profile.schema.json` | Institution-neutral structural profile contract | JSON Schema 2020-12 with the stable identity `urn:campusweave-relution:schema:university-profile:1.0.0`; namespace, cross-document, and fail-closed rules are enforced by `scripts/university_profile.py` |
| `templates/university-runtime-target.json` | Credential-free shape for a private target context | Template only; evidence-bound copies bind one profile, origin, organization, contract, catalog, operation-reference set, and inventory by digest while keeping role semantics `operator_asserted_unproven`; all target evidence remains below its private `evidence_root` and non-authorizing |
| `schemas/university-runtime-target.schema.json` | Structural contract for a private target context | Location-independent schema identity is `urn:campusweave-relution:schema:university-runtime-target:1.0.0`; evidence-bound artifacts require additional digest, exact-origin, mode, structural-binding, and cross-artifact checks from the university runtime, but do not prove operation-role semantics |
| `schemas/university-inventory-snapshot.schema.json` | Structural contract for one bounded, PII-free inventory summary | Location-independent schema identity is `urn:campusweave-relution:schema:university-inventory-snapshot:1.0.0`; the runtime verifies target/profile/contract identity and declared counts, set digests, frozen membership, and read-only pagination assertions, not their external truth |
| `schemas/university-execution-plan.schema.json` | Structural contract for deterministic offline abstract-intent plans | Location-independent schema identity is `urn:campusweave-relution:schema:university-execution-plan:1.0.0`; requires zero network, zero mutation, no operation bindings, and `execution_authorized: false` |
| `schemas/*.schema.json` | JSON Schema 2020-12 contracts for registries and operational records | Structural contract for consumers |

The original target OpenAPI JSON remains authoritative for full JSON Schema
constraints. The generated catalog is an exhaustive operation index, not a
replacement for referenced component schemas. Authenticated read-back and audit
evidence remain authoritative for runtime state and effects.

## Required processing order

1. Load and validate `registries/manifest.json` and every listed dataset.
2. Select the concept IDs that match the requested outcome. Preserve their
   `related_ids`, risk cues, scope caveats, and evidence classifications.
3. Require the target-local catalog to report `status: generated` and record its
   source SHA-256 and operation count. The public `generated/API_CATALOG.json`
   remains a `not_generated` placeholder.
4. Use each concept's `api_discovery.tags` and `search_terms` only to assemble a
   candidate set from the generated operations.
5. Confirm the exact candidate in the original OpenAPI JSON: method, path,
   effective server, security, scope parameters, request schema, responses,
   concurrency controls, and read-back operation.
6. Create a target binding tied to the catalog SHA-256. A digest change
   invalidates every binding and pending plan.
7. For a mutation, copy `templates/settings-change-plan.json`, populate every
   gate, and follow `SETTINGS_RUNBOOK.md`. The plan must remain
   `execution_authorized: false` until the required approval is recorded.
8. After one bounded write, update transport, response, read-back, audit,
   functional check, and rollback results independently.

Stop when a record or target artifact says `target_contract_required`, a cross
reference is unresolved, the target catalog is absent/stale, or the selected
operation cannot be proven from the exact source contract.

The university profile adds another deliberate boundary. It may select concept
IDs and declare workflow roles that a future binder must resolve, but it cannot
contain an operation key, path, target identifier, request body, approval, or
executable status. Organizational placement can only nominate a persona review;
it never creates group membership or a policy assignment. The offline runtime
compiles 48 abstract, unresolved nodes: seven group-scope blueprints, fifteen
policy-definition intents, fifteen publication prerequisites explicitly blocked
from execution, and eleven assignment intents. Every node remains unbound and
non-executable; none identifies a target resource.

## Common registry semantics

Every concept record uses a stable ID with a type prefix:

```text
feature.<domain>[.<concept>]
setting.<domain>[.<concept>]
policy.<domain>[.<concept>]
group.<domain>[.<concept>]
```

IDs are immutable machine keys. Titles and aliases may change for clarity.
Cross references use IDs, never array positions or display names. Every factual
claim has evidence with an explicit class:

| Evidence class | Meaning |
| --- | --- |
| `official_documentation` | Directly supported by the linked first-party Relution page |
| `target_contract` | Present in the exact target OpenAPI contract and tied to its digest |
| `observed_runtime` | Returned by an authorized read from that target during the task |
| `recommendation` | Safety practice or clearly labeled inference; not a Relution API claim |

The hand-authored registries contain only official documentation and
recommendation evidence. Target contract and runtime evidence belong in the
target binding/change record created for the task.

## API operation completeness

`API_CATALOG.json` is produced by the same traversal as the Markdown catalog.
For supported Swagger/OpenAPI feature sets it enumerates every operation under
top-level paths, top-level webhooks, and recursive callbacks, including OpenAPI
3.2 `query` and `additionalOperations`. Its operation count is exhaustive only
for the supplied contract digest.

The public operation registry has a different purpose: it preserves exact
examples from Relution's public REST guide together with their limitations. It
must never be merged into the target operation set. If the public guide and the
target contract disagree, the target contract wins and the difference should be
recorded as version drift.

## Feature resolution

A feature record answers:

- what the capability does and which product domain owns it;
- supported or relevant platform families described by official guidance;
- dependencies on settings, policies, or groups;
- high-impact effects and licensing/version caveats;
- vocabulary to search in a target contract.

It does not prove the feature is licensed, enabled, authorized, or exposed by
the target API. Those are target contract and observed-runtime facts.

## Settings resolution and mutation

A setting record should drive five decisions before any request:

1. **Scope:** system, Global organization, organization, group, user, device, or
   target-specific.
2. **Impact:** minimum runbook tier, cross-organization reach, external effects,
   authentication/trust/device-control consequences, and secret handling.
3. **Activation:** immediate save, publication, synchronization/job, device
   action, or target-specific behavior.
4. **Verification:** direct read-back, audit evidence, integration test, canary,
   or secondary access-path check.
5. **Recovery:** restore prior value/version, compensating operation, forward
   rotation, or an explicitly irreversible effect.

The target contract must then answer the wire questions: aggregate versus
domain-specific resource, `PUT` versus `PATCH` semantics, required and immutable
fields, write-only values, null/omission behavior, status responses, ETags or
revision fields, and asynchronous job behavior.

## Policy resolution

Keep these states separate in reasoning and plans:

```text
policy definition
  -> unpublished template edit
  -> publication creates/selects an active version
  -> published policy assignment to device group or device
  -> delivery transition on each device
  -> observed device policy status
```

Important invariants encoded by the registry include:

- a policy is platform-dependent and its platform cannot be changed after
  creation;
- edits do not affect devices until publication;
- restoring an older version creates a new higher-version template rather than
  rewriting history;
- lower numeric priority wins conflicts within the platform's priority domain;
- only published policies can be linked to static device groups;
- global publication and copying to an organization are different operations;
- global availability is documented as irreversible and is not available for
  Android Enterprise;
- `UNKNOWN`, `NONE`, `SENT`, `APPLIED`, `UPDATE`, `CHANGE`, and `REMOVED` are
  distinct delivery states, not a Boolean success flag.

Publication, assignment, and any canary rollout require separate operation
bindings and approval decisions.

## Group resolution

Do not collapse group types:

- **Static device group:** direct membership is manually managed; adding a
  device also exposes it to the group's published policies and actions.
- **Dynamic device group:** membership is computed in real time from a nested
  `AND`/`OR` filter; direct membership changes are invalid.
- **User or externally synchronized group:** membership and source-of-truth
  behavior differ from device-group filtering.
- **Permission role/security grouping:** effective permissions are additive and
  are not the same as policy assignment.
- **Education class:** represents education structure and must not be treated as
  a generic authorization group.

For a proposed dynamic group, preserve the Boolean filter tree. Build a directed
dependency graph for included/excluded group references and reject self-links
or cycles of any length. Freeze and review expected pilot membership before
attaching policies or actions.

Event and scheduled group actions are independently hazardous. Entry, exit, or
both can trigger immediate or delayed actions; CRON rules can repeat them. An
operator or automation client must identify whether an action changes a field
used by its own or a reachable group's filter. That feedback path can oscillate
membership and must block execution unless the target design proves stability. Device deletion,
wipes, lock/lost mode, passcode changes, scripts, install/remove operations,
webhooks, notifications, renaming, and policy refresh require their own effect
and approval analysis.

## Target-binding contract

Copy `templates/target-bindings.json` for one target origin, reported version,
organization, and catalog digest. The binding file is target-local evidence; it
must not contain tokens, secret request values, or customer data that has not
been approved for storage.

`binding_status` has fail-closed semantics:

- `template` contains no bindings and cannot support execution;
- `partial` resolves only the concepts and workflow roles explicitly present;
- `resolved` means every concept in that file is
  `complete_for_requested_workflow` and `unresolved_concept_ids` is empty;
- `stale` is non-operational and fails validation until regenerated and
  re-resolved against the new digest.

Here, `resolved` means structurally complete for the workflow records declared
in that binding document. It does not prove that an operator-assigned role such
as `publish` or `rollback` matches the operation's business semantics. The
university target context therefore calls exact-catalog linkage
`contract_bound` and separately requires
`semantic_role_status: operator_asserted_unproven`. Neither status authorizes
execution or can be used by a future executor to choose an operation.

For `complete_for_requested_workflow`, set a stable `workflow_id` and enumerate
`required_roles`. Validation proves that each declared role label has a
contract operation reference of a compatible method class; it does not prove
the label's business meaning. Use separate workflow IDs for
policy definition/edit/publication/assignment, group membership/filter/action,
and other sequences whose required operations differ.

Every operation binding must reproduce the generated operation's key, surface,
method, path, lineage, and operation ID, even when the latter two are `null`.
Only top-level `paths` operations are client-callable; webhook and callback
operations describe provider-initiated traffic. Keep request schema references
and response schema references in their separate arrays, list only documented
2xx statuses, and set `source_contract_verified` only after inspecting the
source contract.

A `scope_binding` states where a scope is carried: token, server, path, query,
header, or request body. Path/query/header names must exist on every named
operation. Token/server scope uses `name: null`; request-body scope names the
contract field. `source_contract_verified: true` records that this mapping was
checked in the exact source contract, not inferred from a concept name.

## Change-plan state machine

Copy `templates/settings-change-plan.json` for exactly one resource in one
organization. Its states are intentionally not equivalent to authorization:

```text
template -> discovery -> planned -> approved -> executing
                                      |             |
                                      |             +-> verified
                                      |             +-> rolled_back
                                      |             +-> outcome_unknown
                                      +-> blocked
```

Only `approved` and `executing` may set `execution_authorized: true`. Approval
must name the request owner, operator and token owner, permission scope, exact
effect, exactly one object, approval time, and a future expiry. The effective
API server must resolve to the explicitly authorized HTTPS origin. `read` and
`readback` must use read-like operations distinct from the mutation; `write`
and API-based `rollback` must use mutating operations. All operation identities
are tied to the same catalog digest and must appear under a compatible role in
the target binding for at least one concept named by the plan.

When `requires_immediate_approval` is true, an active approval may be at most
one hour old and its approval-to-expiry window may not exceed one hour. This is
a local safety bound, not a claimed Relution server rule; use a shorter window
when the operator's policy requires it.

Risk flags are enforced, not descriptive decoration. Tier 2-4 and externally
visible changes require immediate approval. Authentication/access work must be
Tier 3 or 4 and retain a second access path. Destructive/irreversible and
multi-organization work is Tier 4. Tier 4 additionally requires a named canary
scope, monitoring owner, monitoring window, and `requires_canary: true`.

When the selected write declares a request body, the plan must name a body
file, a contract-declared media type, and a matching request schema/reference
when the catalog exposes one. An `audit_plan` must either bind an audit API
operation from the target contract or describe the official manual audit-log
procedure. In both cases it must compare actor, time, HTTP method, endpoint,
organization, status, and object context.

Before `approved` or `executing`, `request_body_file` must identify an existing
regular file. The validator checks existence without reading or printing the
file because it may contain write-only values. Validate a redacted structure
against the original OpenAPI schema before secret injection, then use the exact
authorized secret mechanism at execution time.

`rollback.execution_mode` makes recovery mechanically reviewable:
`bound_operation`, `restore_with_write_operation`, `manual_recovery`, or
`irreversible`. Bound rollback requires a bound rollback operation; write-based
restore requires captured prior values; manual recovery requires an owner and
window; irreversible mode requires `available: false`, explicit acknowledgment,
and matching Tier 4 impact classification.

`verified`, `rolled_back`, and `outcome_unknown` are terminal, non-authorized
records. `verified` and `rolled_back` require a sent request, documented success,
matching direct read-back and audit evidence, checked invariants, an observed
timestamp, and no residual uncertainty. Use `outcome_unknown` when a request may
have left the client but the result cannot be proven; preserve its resolved
target, contract, operation, and historical approval context and do not retry.
Changing a terminal record back to an executable state requires a new current
approval and a new preflight, not a Boolean edit.

## Machine validation

Run the repository validator before using a registry or template:

```sh
python3 scripts/validate_machine_docs.py
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status
```

After generating a target catalog, validate the contract-bound layer too:

```sh
python3 scripts/validate_machine_docs.py \
  --spec .local/relution-contract/relution-openapi.json \
  --catalog .local/relution-contract/API_CATALOG.json \
  --bindings /approved/local/path/target-bindings.json \
  --change-plan /approved/local/path/settings-change-plan.json
```

Validation proves structure, stable-ID uniqueness, cross-reference integrity,
allowed evidence classes, unbound concept safety, exact catalog freshness
against `--spec`, and contract-digest/operation references. It does not prove
that a recorded approval is genuine, runtime permission, feature licensing,
current device state, or the outcome of a write; those require human authority
and target-side response, read-back, and audit evidence.

The university profile validator additionally proves
BSI-before-CIS-before-vendor precedence, separate baseline and mutation-impact
tiers, a single abstract writer per effective setting scope, structural
person-field exclusion and forbidden email/UUID/URL/credential/target-field
patterns, non-activating department rules, acyclic organization and group
references, the fixed LAB-to-BROAD promotion chain, BYOD privacy exclusions,
institution namespace closure, and unresolved target-contract API workflows.
Passing it means the offline proposal is internally consistent; it does not
mean that any university tenant is known or ready.

## Public versus target-local artifacts

The registries, schemas, templates, reference university profile, and
`not_generated` catalog placeholder are durable documentation. A completed
university target context, generated offline plan, customer OpenAPI export,
completed target catalog, completed bindings, request bodies, before/after
snapshots, audit exports, and device/user data are target-local artifacts. Keep
runtime contexts and plans as non-symlink `0600` files, keep all target
evidence below the context's private `evidence_root`, review it for hostnames
and sensitive or identifying data, keep it out of public documentation by
default, and never store access tokens or secret values in either layer. The
university schemas use stable `urn:campusweave-relution:schema:...` identifiers
so their document identity does not depend on checkout location.
