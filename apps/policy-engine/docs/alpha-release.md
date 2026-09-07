# Source release procedure

The Node.js and Python manifests currently use version `0.1.0`. The Node.js
package is private. Releases use a reviewed Git commit and GitHub source
archives; npm and PyPI publication are not configured.

No public release has been published from this repository.

The GitHub Pages site is a separate static demonstration artifact. It runs the
React workbench against deterministic data held only in browser memory and has
no archive, filesystem, credential, Relution, Zammad, or product API authority.

## Release scope

A source release can include:

- the archive CLI and loopback browser editor
- Relution 26.1.1 reference templates and reviewed samples
- Apple schema and compatibility data
- recommendation mappings and baseline templates
- read-only Relution device audit support
- optional Zammad ticket creation
- the LAB-only MDM reference package

A release does not establish:

- support for a hosted or non-loopback editor
- production Relution write support
- compatibility with an untested Relution release or tenant
- production approval of MDM source files or outputs
- device application, rollback, accessibility, live-service, or browser
  behavior that was not tested for the release commit

## Publication prerequisites

Before creating a tag:

1. Select the release version and align `package.json` and `pyproject.toml`.
2. Review the complete diff from a clean worktree.
3. Confirm that source rights, redistribution terms, attribution, and notices
   are acceptable for each included third-party or derived reference artifact.
4. Install from the lock files in a clean source checkout.
5. Run the required verification commands.
6. Review all documentation, examples, screenshots, links, and known limits
   against the exact release commit.
7. Confirm that no tenant data, decrypted workspace, credential, certificate,
   private source document, local report, or environment file is included.
8. Create the tag only after the commit and evidence have been approved.

Repository-authored MIT-licensed code does not change the terms that apply to
third-party reference data or dependencies.

## Verification

Required local checks:

```sh
pnpm install --frozen-lockfile
uv sync --locked
pnpm verify:ci
git diff --check
```

Required MDM checks:

```sh
pnpm rexp mdm validate
pnpm rexp mdm diff
pnpm rexp mdm manifest
```

Run source hash verification when the approved private corpus is available:

```sh
pnpm rexp mdm verify-sources
```

Record the exact result of each command. A passing subset does not establish the
full release gate.

## Release review

Review these files and assets at the selected commit:

- `README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `docs/`
- `mdm/README.md`
- `docs/readme-tour/`
- `package.json`
- `pyproject.toml`
- `pnpm-lock.yaml`
- `uv.lock`

After creating a GitHub prerelease, inspect its source archives, release notes,
license, links, and security-reporting route. Correct packaging or
documentation errors before announcing the release.

Use the repository issue tracker for bugs and documentation problems. Report
vulnerabilities through [`SECURITY.md`](../SECURITY.md).
