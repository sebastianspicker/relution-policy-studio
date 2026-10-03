# Migration acceptance ledger

Implementation and verification are local as of 2026-09-07. The authoritative baseline is the captured local state of both original repositories, including their staged, unstaged and reviewed nonignored additions.

## Delivered

- Monorepo scaffold, ownership instructions, architecture decisions, recovery documentation and approved design references.
- Unmodified source histories and all 29 live refs retained under separate migration namespaces. The import merges retain each original main commit as a parent. Distinct checkpoints preserve local changes without rewriting historical objects.
- One Node loopback host, root launcher, revisioned private project persistence and bounded versioned Python stdio. Compatibility commands remain available.
- Additive planner profile v2: editable institution records, intent, scopes, assignments and rollout stages; incomplete drafts; deterministic compilation; conservative v1 conversion. Legacy dimensions and ambiguous ownership remain explicit unresolved decisions.
- React workbench with guided and expert navigation, light/dark themes, local draft autosave, explicit policy saving, reviewed field projection, native and Apple editing, baselines, recommendations, compliance, archives, sidecars, device assessment and explicit Zammad ticket controls.
- Digest-bound evidence and review exports containing unresolved requirements. Trusted compilation and concrete mapping schema checks run again during review. Missing workspaces, invalid mappings and incomplete operations fail closed.
- Pending workspace-operation records and explicit attachment recovery. Project files, workspace/sidecar transactions and archive output remain separate durability boundaries. No cross-store atomicity is claimed.

## History and source preservation

| Source | Original main | Captured files | Retained refs |
| --- | --- | ---: | ---: |
| CampusWeave | `1b334be1387555c39c414352b96c02d25f6a0967` | 141 | 11 |
| REXP Studio | `55cedd4997dd96890778a4945b9dbaa8812290e1` | 1463 | 18 |

The final inventory comparison confirms both originals still have identical refs, HEAD, index entries, staged/unstaged patches, and working-tree hashes/modes. Immutable checkpoint verification confirms original subtree equality, all retained refs and symbolic relationships, ancestry, authoritative local file content, and `git fsck --full` integrity. Full private Git recovery copies also preserve reflogs, stashes, linked-worktree administration and unreachable objects. See [recovery](RECOVERY.md) and [import report](import-report.json).

The migration itself created only scaffold/import/checkpoint commits. The product implementation was committed afterwards on top of those checkpoints, followed by the boundary reconstruction described in [architecture](../architecture/0001-unified-product.md#repository-boundaries). Nothing was pushed, published or deployed.

## Local verification (2026-09-07 acceptance)

The current gate is `pnpm verify`; the counts below record the original acceptance run.

| Gate | Result |
| --- | --- |
| Planner | 33 Python tests, 7 Node tests, Ruff lint/format, Pyright, ESLint, machine-document validation and Python/JavaScript/zsh syntax |
| Policy engine | 145 Node tests, 8 Python tests, Ruff, TypeScript, architecture, source-size, duplicate-code and Knip gates |
| Legacy production UI | Build passes; JavaScript 127,785 / 128,000 bytes gzip; CSS 12,843 / 13,000; six required expert roots remain deferred |
| New workbench | TypeScript and Vite production build passes |
| Unified integration | 8 tests: real planner parity, editing/projection/build/archive round trip, authentication/origin rejection, stale revisions/evidence, invalid mappings, worker failure, review export/reopen, interrupted attachment and partial write recovery |
| Browser | Complete local workflow, reference/blank projects, policy save/reload, direct expert navigation, light/dark desktop and narrow layouts, keyboard/focus, reduced motion and 200% equivalent-viewport reflow |
| Migration | Original inventories unchanged, checkpoint files and refs verified, destination object integrity passes |

Migration verification is `python3 tools/migration/verify.py`. Browser details and retained synthetic screenshots are in [fidelity checks](../design/fidelity.md) and [verification manifest](../design/verification/manifest.json). Local checks ran on macOS with Node 26.8.1; the prepared CI matrix uses Node 22 and Python 3.11 on macOS and Ubuntu.

## Baseline and integration repairs

The captured planner baseline passed its existing checks. The captured engine baseline exposed duplicated semantic-group projection helpers, generic inference failures at deferred React boundaries, an unused snapshot-pack API and recommendation-catalog tests resolving data from the compiled directory. The helper logic is shared, generic props are explicit, the snapshot-pack API is retained and exercised by a round-trip test, and catalog tests resolve the application root independently of the test working directory.

The retained legacy UI exceeded its existing bundle budget. Chunk sharing, classic JSX and Oxc/Terser compression bring it below the unchanged limits while retaining deferred loading and error/retry behavior. Terser 5.51.2 is a new build-only dependency. Existing locked dependency versions and integrity records are unchanged; a frozen-lockfile installation passes.

Integration also found and repaired empty-workspace persistence, outdated background compliance requests during policy mutations, conversion information loss, unsafe integer/response bounds, volatile artifact references, unvalidated projection values, cross-project workspace-reference injection and unsafe stale-lock recovery. Focused regression tests cover these persistence and validation cases. Active dark navigation text was adjusted to meet normal-text contrast requirements.

## Verification boundaries

Ubuntu and hosted CI have been prepared but were not executed from this local task. Browser reflow at a 200% equivalent viewport passed; native browser-toolbar zoom was not exercised. Live Relution/Zammad operations and physical devices were not verified. No new Relution mutation capability was introduced, and MDM generation retains its LAB boundary. Local validation and evidence references never grant deployment or execution authority.
