# Local assurance validation

Validated on macOS on 2026-09-07. Changes remain in the monorepo working tree, uncommitted. No deployment, publication, live tenant mutation or source-repository change was performed.

## Corpus and presets

The generated reconciliation audits 2,132 recommendations, 15,206 declared mappings and 27,058 declared settings. Recommendation dispositions reconcile exactly: 430 supported, 1,555 candidate, 27 organizational, 120 unsupported and no parameter-only records. Of these, 332 recommendations are selectable after source, schema and applicability checks. A supported mapping alone does not establish resolved applicability.

Mapping outcomes reconcile to 436 valid, 316 invalid, 14,309 candidate-only and 145 invalid-candidate declarations. Source constraints retain 540 equality, 14 minimum, 14 maximum and two set-containment predicates. Every effective preset classifies the full corpus through selection or an explicit exclusion.

| CampusWeave preset v1.0.0 | Added recommendations | Effective membership | Excluded records |
| --- | ---: | ---: | ---: |
| Essential | 8 | 8 | 2,124 |
| Managed | 6 | 14 | 2,118 |
| High assurance | 4 | 18 | 2,114 |

Counts are recommendation memberships before device applicability filtering, not official assurance ratings. Essential includes Android Play Protect, iOS passcode length for each ownership scope, macOS firewall and Gatekeeper, and Windows firewall profiles. Managed adds Android management restrictions, iOS backup encryption, and macOS FileVault and recovery-key escrow. High assurance adds Android separate work-profile challenge, iOS USB file restrictions, macOS AirDrop restriction and Windows cloud blocking. Windows Managed inherits its Essential controls; no unsupported extra setting was promoted to fill a coverage target.

The current snapshot is `7ce00e549ed2a05b5422ba5d41e5569b10a5e3cb0e8b26251fffde50da49ff13`. Both indexed snapshots pass runtime schema, digest and historical-detail loading. Two complete offline rebuilds produced byte-identical assurance catalog, presets, details, reconciliation, refresh report, snapshot index and all three source rulesets. The legacy baseline index contains a generation timestamp; its deterministic check compares semantic content separately. Generated rule IDs are unique and suppressed alternatives retain source traceability.

## Source refresh

Vendor refresh completed transactionally. BSI refresh attempted all 16 allowlisted official URLs: 13 downloaded into staging, while three PDF endpoints returned HTML. The failed transaction retained the complete previous snapshot and recorded each URL outcome. The failing identifiers were `sys-2-1-general-client`, `sys-3-2-1-smartphones-tablets` and `sys-3-2-2-mdm`.

Retained CIS source bytes and versions were preserved. Newer Windows and macOS editions were recorded from official edition metadata without importing their contents. Retrieval or verification dates do not establish publication dates or source currency. The installed snapshot remains explicitly unverified for currency; it is not represented as the latest official baseline.

## Automated and browser checks

The root `pnpm verify` gate passed, including planner Python and browser tests, linting, formatting, type checking, machine-document validation, policy-engine architecture/LOC/duplication checks, Knip, builds, bundle budgets, Node tests, Python pipeline tests, the unified workbench build and root integration tests. The final run passed 33 planner Python tests, seven planner browser tests, 165 policy-engine Node tests, 16 pipeline Python tests and 13 root integration tests. Existing thresholds were retained. The policy-engine browser bundle measured 127,984/128,000 gzip bytes of JavaScript and 12,843/13,000 bytes of CSS.

All 332 selectable mappings pass the installed schema and value-kind checks. Focused regression coverage includes mixed unsupported mappings, empty and malformed predicates, undeclared schema fields, schema type and enum drift, stronger existing values, compatible set union, conflicting source values and decisions, missing parameters, version/enrollment incompatibility, inherited fixed-value and parameter-default overrides, deterministic Apple profile metadata and XML, stale draft/revision/source/preset/result digests, and selected-record scope. Integration tests cover explicit saving, reopened projects, archive round trips, assurance currency changes, historical snapshots, failed catalog loading and interrupted persistence recovery.

All 12 platform/preset combinations produced ready previews with nonempty changes against synthetic empty policies and explicit applicability/readiness context. The iOS fixture used version 26 and organizational ownership; Android used the work-profile enrollment channel. These contexts are test inputs and are not product defaults.

Chromium browser verification against an isolated local project covered:

- All three presets, inherited settings, exact preview, draft-only application and explicit saving.
- Complete source details and source comparison, retained snapshot acknowledgment, and scoped compliance availability.
- Conflict selection and rationale, invalidation of a stale preview, and disabled application until reviewed again. The UI conflict was injected as a test fixture; real conflict resolution is tested in the runtime suite.
- Review export, unsaved recovery export, interrupted project-save state and successful retry.
- Separately labeled legacy compatibility actions and their replacement acknowledgments.
- Search empty state, source-loading state, simulated source-load error and retry.
- Desktop and 390-pixel layouts, light and dark themes, keyboard-accessible controls and inspector focus restoration; no page errors in the main flow.

Browser screenshots and execution logs were captured in `/tmp/campusweave-assurance-*`. They are local diagnostics, not part of exported project evidence.

## External limits

Ubuntu CI was not run. No live Relution, Apple, Microsoft, Google tenant, enrollment server or physical device was exercised. Source refresh and local schema checks do not prove device enforcement or institutional readiness. Organizational duties, exceptions and external evidence remain visible in review exports. BSI currency remains unresolved until the failed official endpoints can be retrieved and verified successfully.
