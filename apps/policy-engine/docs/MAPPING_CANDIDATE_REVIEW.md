# Mapping candidate review

## Scope

The checked-in review data compares non-exact BSI, CIS, and vendor
recommendations with validated exact mappings. Similarity is advisory and does
not promote a mapping.

## Current data

- Exact reference mappings: 654
- Non-exact recommendations reviewed: 1,484
- Exact references by source: 31 BSI, 431 CIS, and 192 vendor
- Exact references by language: 31 German, 484 English, and 139 unknown
- Near-exact review queue: 855
- Partial-candidate review queue: 602
- Local-parameter queue: 27

The machine-readable records are under
`example/recommendation-coverage/`.

## Promotion rule

An exact mapping requires a validated entry in
`example/recommendation-coverage/manual-mapping-promotions.json`, explicit
evidence, and links to exact references. Candidate scores alone are
insufficient.

## Drift review

- `source-change-report.json` records source hash changes.
- `ruleset-update-plan.json` identifies source rows that require review.
- `relution-mapping-change-report.json` records recommendation-to-Relution
  mapping changes.
- `relution-mapping-update-plan.json` separates mechanically safe updates from
  manual review.

Rebuild the checked-in records from local source material:

```sh
uv run --locked python tools/update_guideline_mappings.py --offline --source all
```

Online refresh fails closed for BSI and CIS because the tool has no approved
downloader for those sources.
