# LLM Relution Mapping Review

Generated: `2026-04-26T17:05:57Z`

## Scope

This review maps Relution settings against the vendored BSI, CIS, and vendor recommendation corpus. It uses the committed achievability matrix, semantic index, and unified source analysis as evidence. No online source refresh or external LLM API call is part of this artifact.

BSI remains authoritative for interpretation when CIS or vendor guidance differs.

## Source Snapshots

| Source | Verified as of | Baseline | Manifest | Recommendations |
| --- | --- | --- | --- | --- |
| bsi | 2026-04-23 | `example/bsi-references/bsi-relution-baseline.json` | `example/bsi-references/downloads/manifest.json` | `example/bsi-references/bsi-recommendations.json` |
| cis | 2026-04-23 | `example/cis-references/cis-relution-baseline.json` | `example/cis-references/downloads/manifest.json` | `example/cis-references/cis-recommendations.json` |
| vendor | 2026-04-23 | `example/vendor-references/vendor-relution-baseline.json` | `example/vendor-references/downloads/manifest.json` | `example/vendor-references/vendor-recommendations.json` |

## Results

- Total recommendations: `2132`
- Reviewed recommendations: `2132`
- Pending recommendations: `0`
- Status counts: `{"exact":648,"gap":4,"helper-only":43,"parameterized":27,"partial":1410}`
- Source counts: `{"bsi":278,"cis":1336,"vendor":518}`
- Platform counts: `{"ANDROID":19,"ANDROID_ENTERPRISE":110,"IOS":581,"MACOS":324,"WINDOWS":1098}`
- Confidence counts: `{"high":648,"medium":1484}`

## Semantic Correction

Semantic concepts are grounded in the current exact or candidate Relution/Apple target links. Exact mappings do not inherit unrelated candidate-target concepts, and common semantic groups only list targets whose own concept metadata matches the group concept.

## Status Semantics

- `exact`: Relution or Apple profile transport can enforce the concrete recommendation value.
- `parameterized`: Relution support exists, but local identifiers, scope, or process evidence must be supplied before compliance can be closed.
- `partial`: Related Relution targets exist, but exact values, scope, app identifiers, certificates, network names, schedules, or local policy choices are still required.
- `helper-only`: structured audit/remediation guidance exists outside Relution importable settings.
- `gap`: no supported Relution, Apple profile, mobileconfig, or helper target is available in this repo snapshot.

## Notable Differences

- Common semantic groups: `104`
- Hard contradictions: `2`
- Differences noted: `107`
- BSI-authoritative differences: `107`

The machine-readable ledger is `example/recommendation-coverage/llm-relution-mapping-review.json`.
