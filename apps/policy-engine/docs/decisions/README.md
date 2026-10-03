# Architecture decisions

These active records define the safety boundaries that must survive maintenance
and refactoring. Runtime source and tests remain authoritative for exact
behavior; a decision records the invariants that changes must preserve.

| Record | Boundary |
| --- | --- |
| [0001](0001-loopback-editor-authority.md) | Loopback editor authority |
| [0002](0002-outbound-service-transport.md) | Outbound service transport |
| [0003](0003-archive-and-sidecar-persistence.md) | Archive and sidecar persistence |
| [0004](0004-external-write-boundary.md) | Relution and Zammad write boundary |
| [0005](0005-capability-modular-monolith.md) | Capability-oriented modular monolith |
| [0006](0006-unified-node-python-host.md) | Unified Node host and bounded Python planner bridge |

A replacement decision must name the record it supersedes. Do not silently
weaken an invariant in source, configuration, or documentation.
