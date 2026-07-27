# Release status

## `0.1.0-alpha.1`

Status: unpublished local source candidate.

## Verified locally

- 101 Python tests pass.
- 19 Node.js frontend tests pass.
- Every browser JavaScript module passes `node --check`.
- Both standalone Python documentation tools compile.
- Machine-readable schemas, registries, templates, and fail-closed catalog
  state validate.
- Both zsh scripts pass syntax checks.
- Pyright reports no findings for the configured source, script, and test scope.
- Markdownlint reports no findings.
- YAML lint passes for `.github/`.

The checked-in screenshots use the synthetic Reference University profile:

- `docs/assets/screenshots/campusweave-overview.png`, 1440 by 1000;
- `docs/assets/screenshots/campusweave-assignments.png`, 1440 by 1000; and
- `docs/assets/screenshots/campusweave-mobile.png`, 500 by 900.

These results cover the local source candidate only.

## Not verified

- remote GitHub Actions;
- a committed or tagged candidate;
- package, installer, container, or executable distribution;
- live browser keyboard, screen-reader, accessibility-tree, and zoom behavior;
- compatibility with a live Relution instance;
- publication and rendered release contents; and
- third-party attribution and license compatibility.

## Publication blockers

- No public license has been selected.
- The repository has no commits.
- No Git remote is configured.
- GitHub Actions has not run for a candidate commit.
- No tag or release exists.
- Browser accessibility checks remain incomplete.

See [`RELEASING.md`](RELEASING.md) for the candidate procedure.
