# Contributing

CampusWeave is a modular monolith. Keep domain behavior in `campusweave/`; keep
the four files under `scripts/` as thin source-checkout adapters only. Do not add
runtime dependencies, path mutation, dynamic imports, target discovery, credential
loading, or network access to normal planning and validation flows.

Private artifact handling deliberately requires POSIX no-follow,
directory-relative, mode-setting, and hard-link filesystem primitives. Preserve
the fail-closed capability check; do not silently downgrade the filesystem safety
contract for portability.

Install editable for development, or run directly from a source checkout:

```sh
python3 -m pip install --editable '.[dev]'
ruff check .
ruff format --check campusweave scripts tests
pyright
python3 -m unittest discover -s tests -v
npm ci
npm test
npm run lint
```

Before review, run the complete repository gate in [README.md](README.md).
Tests should use public package APIs, CLI subprocesses, HTTP requests, Node's built-in
test runner, and checked-in synthetic artifacts. Do not test private helpers or modify
`sys.path` to emulate obsolete script modules.

Do not commit credentials, customer contracts, tenant identifiers, inventories,
request/response captures, private plans, or local tool state. Keep authorized
target material below ignored `.local/relution-contract/` paths.
