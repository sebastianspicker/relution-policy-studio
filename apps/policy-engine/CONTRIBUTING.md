# Contributing

Contributions should preserve the local trust boundary, archive compatibility,
and the distinction between reference validation and device evidence.

## Prerequisites

- Node.js 22.12 or newer
- pnpm 10.34.5
- Python 3.11 or newer
- uv 0.10.7

The package scripts use POSIX shell utilities. CI runs on Ubuntu with Node.js 22
and Python 3.11.

## Setup

```sh
pnpm install --frozen-lockfile
uv sync --locked
pnpm build
```

Start the local editor:

```sh
pnpm rexp:built
```

## Change guidelines

- Keep the editor loopback-only.
- Keep production Relution operations read-only.
- Treat Zammad ticket creation as a separate, explicit external write.
- Do not commit real exports, decrypted workspaces, tenant data, credentials,
  tokens, certificates, keys, or private source documents.
- Change source builders and their verification together. Do not hand-edit
  machine-maintained evidence when a repository tool owns it.
- Keep LAB reference status separate from production support or compliance
  claims.
- Add a regression test for behavior changes.
- Update documentation, screenshots, examples, and configuration references
  when the public interface changes.

Keep each contribution scoped to its stated purpose. Avoid unrelated formatting
or refactoring.

## Verification

Run the narrowest relevant check first, then the local CI contract:

```sh
pnpm verify:ci
git diff --check
```

Common focused checks:

```sh
pnpm typecheck
pnpm knip
pnpm check:architecture
pnpm test:node
pnpm python:lint
pnpm python:test
```

For MDM source or output changes:

```sh
pnpm rexp mdm validate
pnpm rexp mdm diff
```

If a check cannot run, report the exact command and the environmental reason.
Do not describe a passing subset as the full verification result.

## Pull requests

Keep the scope reviewable. Describe:

- the behavior or contract that changed
- the files and interfaces affected
- verification commands and results
- screenshots for visible changes
- security and data-boundary effects
- skipped checks and remaining uncertainty

Report suspected vulnerabilities through [SECURITY.md](SECURITY.md), not a
public issue.
