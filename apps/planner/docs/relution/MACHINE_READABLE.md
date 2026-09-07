# Machine-readable contracts

This document is for maintainers and consumers of the registries, schemas,
templates, generated catalogs, and university profile under `docs/relution/`.
For command examples and private file requirements, see
[Using CampusWeave](../USAGE.md).

## Concept layer

`registries/manifest.json` is the only registry entry point. Each dataset names
its schema, record container, record count, completeness class, and authority
level. Consumers must validate the manifest and every listed dataset before
using any record.

Concept IDs are immutable keys with these prefixes:

```text
feature.<domain>[.<concept>]
setting.<domain>[.<concept>]
policy.<domain>[.<concept>]
group.<domain>[.<concept>]
```

Cross-references use IDs, never array positions or display names. Titles,
aliases, tags, and search terms may identify candidate target operations, but
they are not bindings.

Evidence records distinguish:

- `official_documentation`: a claim supported by the linked first-party source.
- `target_contract`: a fact from one exact target contract and digest.
- `observed_runtime`: a result from an authorized read of that target.
- `recommendation`: a local safety rule or interpretation, not a product/API
  claim.

Checked-in concept registries contain official-documentation and recommendation
evidence. Target-contract and observed-runtime evidence belongs in private
target artifacts. [Relution evidence sources](SOURCES.md) maps the principal
first-party sources to the capability claims they support.

## Catalog layer

The public `generated/API_CATALOG.json` and `.md` files are non-runnable
placeholders. A target-local catalog is generated from caller-supplied JSON and
is authoritative only for that source SHA-256.

For supported Swagger/OpenAPI versions, the renderer enumerates operations
under top-level `paths`, top-level `webhooks`, and recursive callbacks,
including OpenAPI 3.2 `query` and `additionalOperations`. Only top-level
`paths` operations are ordinary client requests; webhooks and callbacks
describe provider-initiated traffic. External operation-bearing references are
rejected rather than fetched or silently omitted.

The original OpenAPI JSON remains authoritative for full parameter, request,
response, security, and schema constraints. A catalog line is never enough to
construct a write request.

## Target bindings

`templates/target-bindings.json` maps requested concept workflows to catalog
operation keys. Every populated operation reference must reproduce the target
catalog's digest-bound identity, surface, method, path, lineage, and operation
ID. Request and response schema references remain separate.

Binding states are fail-closed:

- `template`: empty and unusable for target work;
- `partial`: only named workflows are partly resolved;
- `resolved`: structurally complete for the declared workflow and roles;
- `stale`: invalid until rebuilt for the current catalog digest.

`resolved` does not prove business semantics. A role label such as `publish`,
`assign`, or `rollback` remains an operator assertion even when its HTTP method
class is compatible. University target contexts therefore require
`semantic_role_status: operator_asserted_unproven` and cannot select an
operation for execution.

## University profile and plan

`packages/university/desired-state.json` is an institution-neutral, PII-free
profile. The only supported customization is an institution code and label;
the package, organization, policy, and workflow namespaces are derived from
that identity. Validators reject target identifiers, URLs, credentials,
request bodies, executable fields, namespace gaps, broken references, and
unsafe activation claims.

The planner produces a deterministic graph of abstract intent. Each plan is
bound to the canonical profile digest, every step remains `unbound`, and
network, mutation, readiness, and authorization flags remain false. Plan files
are private local artifacts and are not target operation plans.

## Target context

`templates/university-runtime-target.json` defines a credential-free shape for
one origin, organization, profile, OpenAPI document, catalog, binding set,
inventory snapshot, and private evidence root. A completed context must bind
every related artifact by digest and retain `execution_authorized: false`.

Validation regenerates the catalog from the exact OpenAPI bytes, checks
catalog-model equality, validates bindings, compares target/profile/organization
identity, and checks a bounded inventory summary. It validates claims inside
the local artifact set; it cannot prove those claims are externally true.

## Settings change plan

`templates/settings-change-plan.json` records one resource change, its contract
operations, before and desired fields, approval window, assertions, audit plan,
and recovery mode. Its lifecycle is:

```text
template -> discovery -> planned -> approved -> executing
                                      |             |
                                      |             +-> verified
                                      |             +-> rolled_back
                                      |             +-> outcome_unknown
                                      +-> blocked
```

Only `approved` and `executing` may carry an active authorization flag, and
that flag is a recorded assertion rather than proof of human authority. A plan
must use read-like operations for current state and read-back, mutating
operations for writes, and one of the defined recovery modes: bound operation,
restore with the write operation, manual recovery, or irreversible.

Terminal records are non-authorizing. `verified` and `rolled_back` require a
sent request, a contract-documented success response, direct read-back, audit
evidence, checked invariants, and no residual uncertainty. A possibly sent
request without proof becomes `outcome_unknown` and must not be retried blindly.

## Change rules

- Update schemas and validators together; schema validity alone is not the
  complete contract.
- Preserve stable IDs, schema URNs, operation-key derivation, deterministic
  ordering, and error behavior unless a versioned compatibility change is
  intended.
- Do not hand-edit generated target catalogs or the checked-in placeholder.
- Never add credentials or customer-derived evidence to schemas, examples,
  tests, or Markdown.
- Run `python3 scripts/validate_machine_docs.py` and the profile/plan tests after
  changing this layer.
