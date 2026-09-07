# REXP Studio MDM outputs

Status: `REFERENCE_VALIDATED`, LAB-only, and not approved for production.

This directory contains deterministic rulesets, Relution 26.1.1 workspaces, and
their manifest. The manifest records:

- 17 active LAB artifacts
- 68 checksummed output files
- 5 required manual values
- syntax and reference-schema validation
- false values for Lab round trip, device application, rollback, and
  production approval

The source PDF corpus is not tracked. Source hashes and repository-relative
private cache locators remain in the evidence manifest.

Rebuild and compare the outputs:

```sh
pnpm rexp mdm generate
pnpm rexp mdm diff
```

When `RELUTION_REXP_KEY` is set, encrypted archives are written under the
ignored `private/mdm-archives/LAB/` directory. Encrypted archive hashes are not
part of the deterministic manifest because archive encryption uses randomized
values.
