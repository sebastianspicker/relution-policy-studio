# CampusWeave

CampusWeave is a local, offline planning and contract-review tool for a
synthetic university configuration. It validates a commit-safe reference
profile, compiles deterministic unbound intent, and inspects Relution OpenAPI
artifacts without connecting to a target or authorizing a change.

The repository contains one Python application, a browser interface served by
that application, three command adapters, and a separately operated zsh
transport helper. The helper is not used by CampusWeave's offline runtime.

## Status

The package version is `0.1.0`. It is a source-checkout application rather than
a deployed service, and no license has been selected. Redistribution and a
public release require an approved license and any necessary attribution.

## Capabilities

- Review the checked-in Reference University profile in a local browser.
- Rebind only the institution code and label, then compile a digest-bound plan.
- Validate profiles, plans, private target-context evidence, and machine
  contracts without network access.
- Render deterministic Markdown and JSON operation catalogs from an explicitly
  supplied Swagger or OpenAPI JSON document.
- Provide a restricted curl wrapper for a separate, explicitly authorized
  Relution operation.

CampusWeave does not discover targets, read credentials, execute plans, publish
policies, mutate devices, or prove that an operator-assigned API role has the
intended business meaning.

## Prerequisites

- Python 3.11 or newer on a POSIX system
- Node.js 20.19 or newer for frontend tests and linting
- zsh and curl only when using the separate transport helper

Private artifact handling requires POSIX no-follow, directory-relative,
mode-setting, and hard-link primitives. It fails closed when those capabilities
are unavailable. CI currently verifies macOS.

## Quick start

From the repository root:

```sh
python3 -m pip install --editable .
campusweave
```

Open <http://127.0.0.1:8766>. The host and port are fixed. Stop the service with
`Ctrl-C`.

For the complete command-line workflow, including profile instantiation, plan
validation, and private target evidence, see [Using CampusWeave](docs/USAGE.md).

## Common commands

Run these from the repository root after an editable install:

```sh
# Start the browser workbench.
campusweave

# Validate or inspect the reference profile.
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status

# Discover adapter options and validate checked-in machine documents.
python3 scripts/campusweave_runtime.py --help
python3 scripts/render_relution_openapi.py --help
python3 scripts/validate_machine_docs.py
```

## Repository map

- `campusweave/` contains Python domain logic, command orchestration, and the
  installed loopback application.
- `web/` contains browser-only ES modules and CSS served by that application.
- `scripts/*.py` are independently runnable source-checkout adapters to
  `campusweave.commands` after editable installation.
- `scripts/relution_curl.zsh` is independently operated live transport and is
  never called by CampusWeave.
- `docs/relution/` contains checked-in application resources: registries,
  schemas, templates, the profile, and the catalog placeholder.
- `tests/` contains Python architecture/behavior tests and Node frontend tests.

## Development and documentation

The complete reproducible gate and contribution rules are in
[CONTRIBUTING.md](CONTRIBUTING.md). Architectural boundaries and runtime flows
are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Frontend-specific design
rules are in [docs/FRONTEND.md](docs/FRONTEND.md), and the Relution contract
pack starts at [docs/relution/README.md](docs/relution/README.md).

Use [GitHub issues](https://github.com/sebastianspicker/campusweave/issues) only
for non-sensitive support and reproducible reports based on synthetic data.
Read [SECURITY.md](SECURITY.md) before reporting a vulnerability or handling
target-derived material.
