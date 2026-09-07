## Summary

- What changed:
- Why:

## Release impact

- [ ] User-visible behavior
- [ ] Security or data boundary
- [ ] Generated evidence or MDM artifacts
- [ ] Documentation or repository metadata only
- [ ] No alpha release-note impact

## Verification

List the exact commands and results. Explain every skipped or blocked check.

```text

```

- [ ] The narrow regression test passes.
- [ ] `pnpm verify:ci` passes, or limitations are recorded above.
- [ ] `git diff --check` passes.
- [ ] UI changes include current screenshots and relevant browser evidence.
- [ ] MDM changes pass `pnpm rexp mdm validate` and `pnpm rexp mdm diff`.

## Safety and data handling

- Production Relution impact:
- Zammad or other external side effects:
- Local workspace/archive impact:
- Sensitive or tenant data added: no / yes, explain

## Documentation

- [ ] Public behavior and support boundaries are current.
- [ ] `CHANGELOG.md` is updated when alpha users are affected.
- [ ] Remaining risks and unverified environments are stated.
