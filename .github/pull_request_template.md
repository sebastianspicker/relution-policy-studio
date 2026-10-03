## Summary

- What changed:
- Why:
- Affected application: planner / policy-engine / workbench / root tooling

## Release impact

- [ ] User-visible behavior
- [ ] Security or data boundary
- [ ] Generated evidence or MDM artifacts
- [ ] Documentation or repository metadata only
- [ ] No release-note impact

## Verification

List the exact commands and results. Explain every skipped or blocked check.

```text

```

- [ ] The narrow regression test passes.
- [ ] `pnpm verify` passes at the repository root, or limitations are recorded above.
- [ ] `pnpm format:check` passes.
- [ ] UI changes were checked at desktop and mobile widths, with current screenshots.
- [ ] MDM changes pass `pnpm rexp mdm validate` and `pnpm rexp mdm diff`.

## Safety and data handling

- Production Relution impact:
- Zammad or other external side effects:
- Local workspace/archive impact:
- No credentials, customer data, target evidence or local tool state is included: yes / no, explain

## Documentation

- [ ] Public behavior and support boundaries are current.
- [ ] `CHANGELOG.md` is updated when users are affected.
- [ ] Remaining risks and unverified environments are stated.
