# Recommendation review and policy presets

Relution Policy Studio uses BSI as the policy frame, versioned CIS snapshots as hardening evidence, and vendor documentation to establish supported device behavior. Its Essential, Managed and High assurance presets are Relution Policy Studio selections. They are not official BSI assurance levels or CIS profiles.

Essential covers foundational settings with limited disruption. Managed inherits Essential and adds controls that depend on established institutional management. High assurance inherits Managed and requires a recorded operational readiness review. Each setting has a proposed value, rationale, applicability, prerequisites and source references, or an explicit exclusion. Unknown institutional parameters remain unanswered.

Numeric baseline tiers retain their compatibility interfaces. Full-source ruleset import replaces a workspace and remains a separately labeled compatibility action. Reviewing a single recommendation uses the selection API and does not invoke that action.

## Review a selection

1. Open a policy workspace and inspect the recommendation or preset. Filter source, platform, preset, applicability, mapping readiness and source currency as needed.
2. Inspect source versions and acknowledge the selected snapshots. Retrieval and check dates are distinct from publication dates. A retained snapshot is not automatically current.
3. Supply documented device applicability and required institutional parameters. Resolve incompatible source values with an explicit choice and rationale. Review prerequisites, disruptive effects, exclusions and external evidence obligations.
4. Generate a preview. It identifies the exact changes, retained values, conflicts and unresolved parameters. Compatible stronger existing values are retained.
5. Apply the reviewed selection to the policy draft. Review the result, then use **Save changes** explicitly. Export the unsaved policy draft or review receipt if persistence fails.
6. Validate and build an archive from the saved policy. Attach evidence against that artifact and export the project review package.

Applying a recommendation, preset or local remediation does not authorize target configuration or deployment. Local configuration findings, unresolved requirements and external evidence needs remain separate.

## Interfaces and integrity

The authenticated loopback host preserves its existing recommendation and baseline endpoints and adds:

| Endpoint | Result |
| --- | --- |
| `GET /api/assurance/catalog` | Validated recommendation and preset catalogs with source and snapshot digests |
| `GET /api/assurance/presets` | Versioned preset listing |
| `GET /api/assurance/snapshots` | Retained snapshot index |
| `GET /api/assurance/detail?recommendationId=…` | Complete selected source record, bound to its snapshot |
| `POST /api/assurance/preview` | Exact selection preview against a supplied policy draft |
| `POST /api/assurance/apply` | Revalidated unsaved draft and a review receipt |

Catalog requests accept `snapshotDigest` for an indexed retained snapshot. Client-controlled file paths are not selection inputs. Unsupported mappings, empty applicability predicates and invalid constraints cannot establish compliance.

Preview and apply run through the existing workspace mutation queue. The request supplies the policy draft and expected saved workspace revision. Apply rechecks the draft, selected snapshot, source, preset, preview and proposed result digests. A mismatch requires another preview. The browser also rejects responses made stale by intervening edits or selection changes.

The assurance digest is independent of the configuration-catalog digest. It covers the normalized assurance artifacts and the project's recorded review decisions. New evidence and artifact records retain that binding. A recommendation or decision change invalidates the corresponding evidence currency. Existing evidence without a binding stays readable and is labeled unknown for assurance currency.

Project review packages retain selection receipts, source decisions, exclusions, exceptions and external obligations. Interrupted workspace attachment retains its existing pending operation record; recovery verifies durable workspace content before completing the attachment. Failed project saves retain the unsaved data in the browser with recovery export.

## Source artifacts

Generated artifacts live under `apps/policy-engine/example/recommendation-coverage/`. The catalog audits the complete recommendation corpus; the preset manifest records membership and exclusions. Snapshots preserve the exact catalog, preset and source-detail context used for review. Coverage counts reconcile to source records rather than a target mapping percentage.

BSI identifiers, normative strength, errata and organizational obligations remain source evidence. Grundschutz++ relationships are distinguished from original Kompendium requirements. Windows evidence distinguishes versioned MDM baseline releases, CSP identities and GPO-only guidance.

CIS snapshots retain their recorded versions and hashes. Newer edition checks do not import newer benchmark content. Source attribution and reuse boundaries remain attached to the artifacts. Official references include the [CIS non-member terms](https://www.cisecurity.org/terms-of-use-for-non-member-cis-products) and [Microsoft's versioned MDM baseline reference](https://learn.microsoft.com/en-us/intune/device-security/security-baselines/ref-windows-mdm-settings).

Source refresh failures retain the last valid snapshot and report their outcome. Deterministic regeneration uses stored source evidence; a refresh check does not silently turn an old snapshot into a current one.

## Local maintenance and validation

Run these commands from `apps/policy-engine`:

```sh
uv run --locked python tools/build_relution_import_artifacts.py
uv run --locked python tools/harvest_vendor_guidance.py --refresh --defer-artifacts
uv run --locked python tools/harvest_bsi_grundschutz.py --refresh --defer-artifacts
```

The first command regenerates artifacts from stored evidence. Refresh commands attempt official source downloads and record failures; after a successful refresh, run the first command to rebuild the normalized artifacts. Do not use the CIS harvester to import newer content without separately reviewing its reuse terms.

The [validation record](validation.md) records local checks and remaining external verification. Machine-readable evidence includes the [whole-corpus reconciliation](../../apps/policy-engine/example/recommendation-coverage/assurance-reconciliation.json), [source refresh report](../../apps/policy-engine/example/recommendation-coverage/source-refresh-report.json), [source changes](../../apps/policy-engine/example/recommendation-coverage/source-change-report.json), and [snapshot index](../../apps/policy-engine/example/recommendation-coverage/assurance-snapshots/index.json).
