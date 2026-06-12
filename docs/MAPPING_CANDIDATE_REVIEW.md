# Offline Bilingual Mapping Candidate Review

Generated: `2026-04-26T17:20:43Z`

## Scope

This backend artifact uses existing exact BSI, CIS, and vendor mappings as bilingual reference examples. It does not call an external LLM or promote mappings automatically.

## Summary

- Exact reference mappings: `654`
- Reviewed non-exact recommendations: `1484`
- Exact references by source: `{"bsi": 31, "cis": 431, "vendor": 192}`
- Exact references by language: `{"de": 31, "en": 484, "unknown": 139}`
- Review actions: `{"review-near-exact-reference": 855, "review-partial-candidates": 602, "supply-local-parameters": 27}`

## Promotion Rule

Candidate similarity is advisory. Exact mappings require a validated entry in `example/recommendation-coverage/manual-mapping-promotions.json` with explicit evidence and exact-reference links.

## Guideline Drift Artifacts

- `example/recommendation-coverage/source-change-report.json` tracks BSI/CIS/vendor source hash drift against the previous generated report.
- `example/recommendation-coverage/ruleset-update-plan.json` turns changed sources into review-gated update rows. Safe rows may be retained mechanically; exact mapping promotions still require the manual ledger.
- `example/recommendation-coverage/relution-mapping-change-report.json` tracks recommendation-to-Relution mapping drift against the previous generated report.
- `example/recommendation-coverage/relution-mapping-update-plan.json` records safe mapping updates separately from manual-ledger review rows.
- `tools/update_guideline_mappings.py --offline --source all` rebuilds these artifacts from checked-in source material. Online refresh currently fails closed for BSI/CIS because no safe downloader is implemented there.

## Top Review Queues

- `review-near-exact-reference`: `855`
- `review-partial-candidates`: `602`
- `supply-local-parameters`: `27`
