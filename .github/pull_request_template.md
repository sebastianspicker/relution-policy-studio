## Summary

-

## Scope

- [ ] Documentation, metadata, or repository hygiene only
- [ ] Archive/status/ledger routing changed
- [ ] Runtime code or generated artifacts changed
- [ ] Local editor/API behavior changed
- [ ] Relution/Zammad integration behavior changed

## Verification

- [ ] `pnpm verify:pre-pr`
- [ ] `pnpm verify:ci`
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:meta`
- [ ] `ruff check .`
- [ ] `pytest`
- [ ] `pnpm codacy:cloud:inspect`
- [ ] `pnpm codacy:cloud`
- [ ] `git diff --check`
- [ ] Other relevant checks:
- If `pnpm verify:pre-pr` was skipped, explain why:

## Runtime And Data Impact

- Relution production API impact:
- Local workspace/archive impact:
- Security or network exposure impact:
- Codacy/local analysis impact:
- Excluded analysis/remediation paths touched (`AGENTS.md`, `private/`,
  `node_modules/`, `docs/archive/`): no / yes, details:
- Codacy Cloud closure claimed: no / yes, evidence:

## Notes

- Tests or checks skipped:
- Remaining risks:
- Release notes or docs updated:
- Archive or ignored-local artifacts updated, with `git check-ignore -v` proof:
