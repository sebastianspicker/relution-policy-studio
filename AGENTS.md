# Relution Policy Studio monorepo

A local planning and policy workbench: a React UI served by one authenticated
Node loopback host, which invokes an offline Python planner over bounded JSON
stdio. See [architecture](docs/architecture/0001-unified-product.md).

## Map

| Path | Owns | Language |
| --- | --- | --- |
| `apps/workbench/` | Studio UI (`pnpm studio`), served by the host as static files | React/TS |
| `apps/policy-engine/` (`rexp-studio`) | Domain, `rexp` CLI, loopback host, project store, legacy editor UI (`rexp serve`), offline data tooling | TS + Python tools |
| `apps/planner/` (`campusweave`) | Offline profile compilation, stdio bridge, v1 CLI and legacy planner server (`pnpm planner serve`) | Python |
| `contracts/` | Cross-language JSON schemas and golden fixtures; tests in both languages check them | JSON |
| `tests/integration/` | End-to-end tests against the real host and planner | Node |
| `tools/` | Root launcher and task runner (`runtime/`), boundary check; migration provenance | Node/Python |

Dependency direction: workbench → engine `rexp-studio/browser|ui`; root
launcher → `rexp-studio/host`; integration tests → `rexp-studio/host|testing`;
engine → planner only by spawning `python -m campusweave.commands.stdio`.
Nothing imports another app's files by relative path or build output
(`pnpm check:boundaries`). New cross-app needs get a declared `exports` entry,
not a deep import. Each app's internal rules live in its own docs
(`apps/policy-engine/docs/architecture.md`, `apps/planner/docs/ARCHITECTURE.md`)
and are enforced by `check-architecture.mjs` and `tests/test_architecture.py`.

## Commands (run from the repository root)

Requires Node.js 22.12+, Python 3.11+, pnpm 10.34.5 and uv 0.10.7 (the engine
pins `required-version = "==0.10.7"`).

- `pnpm bootstrap`: frozen pnpm workspace install plus both locked uv
  environments.
- `pnpm verify`: the full gate. Runs, in order: boundaries, Prettier check,
  knip, the planner gates, engine `verify:ci` (size/duplicate/architecture
  checks, build, legacy bundle budget, tests), the demo build, workbench tests
  and build, and integration tests.
- `pnpm test:integration`: integration tests only. They need the engine
  (`pnpm --dir apps/policy-engine build`) and workbench (`pnpm --dir
  apps/workbench build`) builds first; `pnpm verify` builds them.
- `pnpm studio [--port N] [--data-dir PATH] [--no-open] [--no-build]`: build
  and launch. `pnpm campusweave` is an alias.
- `pnpm planner …` and `pnpm rexp …`: component CLIs.
- `pnpm format`: format the Prettier-scoped files (workbench, root tools,
  integration tests).
- Focused checks: `pnpm --dir apps/policy-engine test`, `pnpm --dir
  apps/workbench test`, and `uv run --locked python -m unittest discover -s
  tests` in `apps/planner`.

The legacy UI bundle budget has very little headroom: run `pnpm --dir
apps/policy-engine build:web` and then `check:bundle:web` after any change that
reaches `web/src`.

## Constraints

- Preserve the persisted and wire identities listed in
  `docs/migration/PRODUCT-NAMING.md`: the `campusweave` data directory,
  `/api/campusweave`, storage keys, `.rexp` and workspace/sidecar formats, the
  stdio envelope v1, and the planner v1 CLI and HTTP API. Digests persisted in
  projects use the canonical JSON in `contracts/fixtures/canonical-json-vectors.json`.
- No remote writes, publication, production MDM, or new Relution mutation
  capability. Relution stays read-only; Zammad ticket creation needs an explicit
  reviewed action. Local validation confers no operational authority.
- Keep private artifacts, credentials, tenant evidence and recovery backups
  outside tracked content. Projects live under `~/.local/share/campusweave`.
- Preserve the imported histories (`refs/migration-sources/*`, import and
  checkpoint commits). Report prepared, locally validated and operationally
  verified status separately.
- Use at most two editing workers, with disjoint ownership.

## Working together

The user, Claude Code and Codex share this repository, and this file is the
guide both agents read.

- **Roles.** The user sets scope, approves irreversible or outward-facing
  actions, and commits. The agent the user starts implements; the other
  agent reviews. No agent accepts its own work.
- **One writer at a time.** Only one agent edits this checkout at a time.
  Before editing, read `.agents/handoff.md` if it exists and run
  `git status`; preserve changes you did not make.
- **Handoff.** When you stop with work in progress or ask for review,
  overwrite `.agents/handoff.md` (ignored by git, never committed) with:
  status (`in-progress`, `ready-for-review`, `changes-requested` or
  `accepted`), date, goal, files changed, checks run with exit codes, and
  open questions or risks.
- **Review.** Review the uncommitted diff against the goal in the handoff
  note. Report each finding as `file:line`, defect and evidence, and record
  the verdict in the handoff note. Do not rewrite the change unless asked.
- **Ready for review** means `pnpm verify` from the repository root exits 0.
  Paste failures verbatim and name any check you skipped.
