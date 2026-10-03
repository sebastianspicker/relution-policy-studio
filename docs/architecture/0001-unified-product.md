# Unified local product

Use the REXP Studio Node loopback host and retain capability authentication, same-origin mutation checks, bounded inputs and scheduling. Invoke Python planning through versioned bounded JSON stdio, never a second server. Preserve v1 behavior and introduce editable v2 profiles additively.

One project owns a draft, compiled references, reviewed intent-to-field mappings, workspace references and an evidence index. Project revision writes are separate from workspace-plus-sidecar transactions and archive publication. Multi-workspace outcomes must identify partial success; no cross-store atomicity is claimed. Evidence and validation bind to profile, policy, artifact and catalog digests and become stale on relevant changes.

Incomplete drafts may persist. Compilation checks references, cycles, scope and setting ownership. Ownership differs from functional role. Unresolved legacy meanings stay unresolved. Target identifiers, credentials, live evidence and operational authority do not belong in profiles. Group and assignment blueprints are planning records.

The new React workbench uses Overview, Institution, Intent, Policies, Evidence and Review, with direct Archives, Device assessment and Settings access. Drafts autosave; policies require explicit saving. Mockup values are illustrative and never configuration defaults.

Review exports include the complete project, mappings, persisted per-workspace artifact references, evidence freshness and freshly recompiled diagnostics. The `complete` field describes current local review references, not external verification or authority. Deployment and execution flags are always false. Operational evidence reference identifiers are `target-contract`, `inventory-scope`, `physical-device` and `recovery`; the first two use target evidence, followed by device and recovery evidence. An evidence reference must also identify its intent, workspace, requirement, profile digest, policy revision, artifact digest and catalog digest. These identifiers describe the unresolved review requirements in the approved design, not new deployment gates.

## Repository boundaries

Three applications follow the runtime and language boundaries: `apps/workbench` (browser UI), `apps/policy-engine` (Node host, domain and `rexp` CLI) and `apps/planner` (Python planning). The engine exposes four package entry points and nothing else to other apps: `rexp-studio/host` (`startStudioHost`, the composition root used by `pnpm studio`), `rexp-studio/testing` (integration tests only), `rexp-studio/browser` (browser-safe DTOs and canonical JSON) and `rexp-studio/ui` (the editor controller and field editors embedded by the workbench). The planner is reached only by spawning its stdio bridge, which loads no HTTP code. The legacy planner server and the legacy editor UI remain as documented compatibility entry points (`pnpm planner serve`, `rexp serve`) and share no code with the workbench beyond `rexp-studio/ui`.

`contracts/schemas` define the persisted project, mapping, profile v2 and bridge shapes. Engine and planner tests validate real store output, fixtures and bridge envelopes against them, and golden vectors pin the canonical JSON digest shared by Python, the engine and the workbench. Schema changes follow the running code and must keep those tests green.

One pnpm workspace and lockfile serve the JavaScript applications. The planner and the engine's offline data tooling keep separate locked uv environments because their dependency sets differ (the planner has no runtime dependencies). `tools/check-boundaries.mjs`, root knip, the engine's `check-architecture.mjs` and the planner's `tests/test_architecture.py` enforce these boundaries in `pnpm verify`.
