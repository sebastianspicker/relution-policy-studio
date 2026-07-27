# Contributing

CampusWeave accepts changes to the loopback application, offline runtime,
Relution contract tools, schemas, tests, and technical documentation.

## Development setup

Use Python 3.11 or later and Node.js 20 or later. Run all commands from the
repository root. There is no package installation or build step.

Optional release checks use Pyright, markdownlint-cli2, and yamllint.

## Data boundary

Use only the checked-in Reference University profile and synthetic fixtures.
Do not add:

- credentials or tokens;
- customer hostnames or tenant identifiers;
- private OpenAPI documents;
- device, user, group, or organization exports;
- request or response captures;
- audit exports;
- live configuration screenshots;
- target-derived catalogs, bindings, plans, or evidence; or
- local editor and tool state.

Store approved local contract material under `.local/relution-contract/`. That
directory is ignored by Git.

## Change workflow

1. Inspect the implementation, schema, tests, and documentation affected by the
   change.
2. Reproduce the current behavior or failing check.
3. Make a focused change without weakening the offline or fail-closed boundary.
4. Run the narrowest relevant tests.
5. Run the complete local gate.
6. Inspect the final diff for private data and unrelated changes.

Do not add live mutation behavior as an incidental extension. Connected
operation requires exact-contract discovery, explicit authorization,
read-before-write, bounded scope, independent read-back, audit evidence, and a
defined recovery path.

## Testing

Run the complete local gate:

```sh
python3 -m unittest discover -s tests -v
node --test tests/test_campusweave_ui.mjs
for f in web/**/*.{js,mjs}; do
  [ -f "$f" ] || continue
  node --check "$f"
done
python3 -m py_compile scripts/render_relution_openapi.py
python3 -m py_compile scripts/validate_machine_docs.py
python3 scripts/validate_machine_docs.py
zsh -n scripts/relution_curl.zsh
zsh -n scripts/capture_campusweave_screenshots.zsh
```

Run these checks when their tools are installed:

```sh
pyright
markdownlint-cli2 '**/*.md'
yamllint .github
```

Tests must verify the public contract or failure mode, not private implementation
details.

## Documentation

Update documentation when a command, path, environment variable, schema,
supported version, or runtime boundary changes. Keep examples executable from
the repository root.

Do not copy target-derived paths, identifiers, payloads, or responses into
public examples. The checked-in files under `docs/relution/generated/` must
remain fail-closed placeholders.

## Frontend changes

Follow [`docs/FRONTEND.md`](docs/FRONTEND.md). Preserve keyboard behavior,
focus, loading, empty, error, and compact states.

When visible output changes, regenerate screenshots with:

```sh
zsh scripts/capture_campusweave_screenshots.zsh
```

Inspect each image before review.

## Submitting changes

Use the issue forms for bugs, feature proposals, and documentation problems.
Pull requests should describe:

- the behavior changed;
- the files and contracts affected;
- the commands run and their results;
- checks that were not run; and
- remaining compatibility or release uncertainty.

Do not include sensitive data in an issue or pull request.
