# Contributing

CampusWeave is a dependency-free Python modular monolith with a browser-only
frontend. Changes must preserve its offline planning boundary and its exact
source-checkout interfaces.

## Development setup

Use Python 3.11 or newer and Node.js 22.12 or newer. From the monorepo root,
`pnpm bootstrap` installs the JavaScript workspace (this package's eslint and
Node tests included) and syncs this package's locked uv environment
(`uv sync --locked --extra dev`). The adapters under `scripts/` run through
`uv run --locked`.

## Complete gate

From this directory (the monorepo's `pnpm verify` runs the same planner steps):

```sh
uv run --locked ruff check .
uv run --locked ruff format --check campusweave scripts tests
uv run --locked pyright
uv run --locked python -m unittest discover -s tests -v
pnpm test
pnpm lint
uv run --locked python scripts/validate_machine_docs.py
zsh -n scripts/relution_curl.zsh
```

The monorepo's `pnpm verify` also checks syntax: `node --check` on every
`.js`/`.mjs` file under `web/`, and `py_compile` with `.venv/bin/python` on
`campusweave/` and `scripts/`.

The monorepo's `.github/workflows/unified.yml` runs this gate on macOS and
Ubuntu with Python 3.11 and Node.js 22. Report checks
that could not be run instead of implying that local success proves another
platform, a live Relution target, or a release artifact.

## Change rules

- Put product and domain behavior under `campusweave/`.
- Keep the three Python files in `scripts/` as imports of one
  `campusweave.commands.*` entry point. Keep `relution_curl.zsh` separate from
  normal runtime flows.
- Preserve the acyclic dependency rules enforced by
  `tests/test_architecture.py`; domain packages must not import commands.
- Add every browser module or stylesheet to the explicit static allowlist in
  `campusweave/server.py`.
- Do not add runtime dependencies, dynamic product imports, `sys.path`
  mutation, credential loading, target discovery, or outbound network access
  to CampusWeave flows.
- Preserve public package exports, command messages and exit codes, fixed HTTP
  routes, browser storage keys, and machine-document identities unless the
  change deliberately updates the compatibility contract.
- Keep private filesystem checks fail-closed. Do not replace POSIX no-follow,
  ownership, link-count, or mode guarantees with permissive fallbacks.

Tests should exercise public package APIs, subprocess adapters, HTTP behavior,
browser modules, and checked-in synthetic artifacts. Avoid tests coupled only
to private helpers or file layout.

## Documentation and sensitive data

Update the single authoritative document for any changed command, interface,
or boundary. Do not copy target hostnames, credentials, customer contracts,
inventories, request/response captures, private plans, or local tool state into
the public tree. Authorized target material belongs under ignored `.local/`
paths and remains subject to [SECURITY.md](SECURITY.md).

## Review and release

Pull requests should state the outcome, exact checks run, skipped checks, and
remaining uncertainty. UI changes also require manual keyboard, responsive,
zoom, and accessibility checks described in [docs/FRONTEND.md](docs/FRONTEND.md).

There is no automated release or deployment process. Before any publication,
an owner must select a license and applicable attribution, approve the exact
commit/version/tag, run the complete gate, verify CI on that commit, and confirm
that the public tree contains no private target material.
