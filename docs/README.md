# Documentation guide

CampusWeave is a local, offline planning and contract-review tool. It does not
connect to a Relution tenant or apply changes. The checked-in documentation
uses the synthetic Reference University profile and deliberately excludes
target-derived contracts, inventories, evidence, and credentials.

## Start here

- [Project overview](../README.md) explains the local web interface, offline
  runtime, and OpenAPI catalog workflow.
- [Architecture](ARCHITECTURE.md) explains the package layers and adapter rule.
- [Browser workbench](FRONTEND.md) describes the static interface, routes,
  and accessibility expectations.
- [Relution handbook](relution/README.md) explains the documentation boundary
  and the distinction between public concepts and target-specific evidence.

## Reference material

- [Profile notes](profile-notes.md) covers the inert university desired-state
  profile.
- [Catalog notes](catalog-notes.md) covers the local OpenAPI catalog workflow.
- [Compiler checks](compiler-checks.md) lists the deterministic validation
  commands.

Use only checked-in synthetic inputs in public documentation. Keep authorized
target contracts and resulting evidence in the ignored
`.local/relution-contract/` workspace.
