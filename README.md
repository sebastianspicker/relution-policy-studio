# CampusWeave

CampusWeave is a dependency-free, local tool for reviewing a commit-safe university
profile, compiling deterministic offline intent, and validating Relution contract
artifacts. It never contacts a target or authorizes a mutation.

## Install and run

Use Python 3.11 or newer on a POSIX system with no-follow, directory-relative,
mode-setting, and hard-link filesystem primitives. The runtime fails closed when
those safety capabilities are unavailable; CI currently verifies macOS. Run
`python3 -m campusweave` directly from a source checkout, or install editable to
use the named command and source adapters.

```sh
python3 -m pip install --editable '.[dev]'
campusweave
```

The browser workbench listens only on <http://127.0.0.1:8766>. It accepts the
checked-in Reference University profile and supported identity rebindings, then
returns an offline, unbound plan. It has no target configuration, persistence,
credentials, executor, or outbound network capability.

## Offline commands

The source-checkout adapters are deliberately thin. Install editable, then run
them from the repository root:

```sh
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status
python3 scripts/render_relution_openapi.py --help
python3 scripts/validate_machine_docs.py
```

The fourth adapter, `scripts/relution_curl.zsh`, is a bounded transport helper
for separately authorized work. It is not used by CampusWeave and does not turn
an offline plan into an executable operation.

## Repository gate

```sh
python3 -m pip install --editable '.[dev]'
ruff check .
ruff format --check campusweave scripts tests
pyright
python3 -m unittest discover -s tests -v
npm ci
npm test
npm run lint
find web -type f \( -name '*.js' -o -name '*.mjs' \) -exec node --check {} +
find campusweave scripts -type f -name '*.py' -exec python3 -m py_compile {} +
python3 scripts/validate_machine_docs.py
zsh -n scripts/relution_curl.zsh
```

Read [the architecture](docs/ARCHITECTURE.md), [the browser workbench notes](docs/FRONTEND.md),
and [the Relution handbook](docs/relution/README.md) before extending a boundary.

## License

No license has been selected. Redistribution requires an approved license and
any applicable third-party attribution.
