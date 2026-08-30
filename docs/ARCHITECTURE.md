# Architecture

CampusWeave is a dependency-free modular monolith. The package owns all domain
logic; adapters are intentionally small and are not alternate implementations.

| Layer | Responsibility |
| --- | --- |
| `campusweave.json_snapshot` and `private_artifacts` | Strict, bounded JSON and safe local artifact access |
| `campusweave.profiles` | Commit-safe university profile validation |
| `campusweave.planning` | Deterministic, unbound offline intent plans |
| `campusweave.targets` | Fail-closed validation of local target context |
| `campusweave.openapi` and `contracts` | Presentation-free offline OpenAPI catalog and machine-contract validation |
| `campusweave.server` and `workbench` | Fixed loopback HTTP boundary and browser workbench |
| `campusweave.commands` | All parsing, terminal presentation, exit codes, catalog write/check, and validation CLI orchestration |

`campusweave.resources` is the single owner of source-checkout paths for the
checked-in contract bundle and browser assets. CampusWeave supports editable
source installations; it does not claim that a wheel without those repository
resources is a complete runtime distribution.

Private artifact I/O intentionally requires POSIX no-follow,
directory-relative, mode-setting, and hard-link primitives. Capability checks
fail closed instead of weakening symlink or file-mode guarantees. The current CI
platform is macOS.

The `scripts/` directory contains exactly four adapters: three Python entry
points (`campusweave_runtime.py`, `render_relution_openapi.py`, and
`validate_machine_docs.py`) and `relution_curl.zsh`. Python adapters import
only from `campusweave.commands.*`. They do not alter import paths, load modules
dynamically, or contain domain logic. Commands can depend on domain packages;
domain packages never depend on commands.

Profile compilation precedes target validation. A compiled plan is digest-bound,
non-networked, non-mutating, and has only unbound steps. A target context and a
generated catalog can validate local evidence, but neither authorizes execution.

The workbench is loopback-only. It serves fixed static files and fixed API routes;
it does not read credentials, private artifacts, application configuration, or a
network target. The browser is a review surface, not a remote administration
client.
