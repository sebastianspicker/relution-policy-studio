# Phase A Relution MDM assessment and remediation plan

## Executive assessment

The repository is a mature local policy workbench, not a current-state export
of an organisation's Relution service. It provides strong tooling evidence for
Relution Server 26.1.1: a format-v1 `.rexp` implementation, a synthetic known-
good archive, 201 harvested configuration types, 2,067 OpenAPI schemas, and
201 successful mock round trips. The template source identifies itself as a
local JAR but has an unknown image digest. Four additional Windows `.rexp`
fixtures identify Server 5.30.0 and are historical compatibility evidence.

No evidence supplied establishes the target tenant's server version, hosting
model, organisations, administrators, roles, groups, users, devices,
applications, certificates, integrations, compliance rules, assignments,
exceptions, or actual device behaviour. Current maturity of the target tenant
is therefore not assessable, not low. The dominant Phase A risk is false
assurance from confusing tooling capability with deployed control evidence.

The proposed target is a layered, ownership-aware architecture with explicit
deployment rings, graduated compliance remediation, time-limited exceptions,
and traceability from source requirement to device evidence. It deliberately
preserves common productivity features unless data classification or a threat
model justifies restriction.

## Scope and authority

| Evidence | State | Authority and use |
|---|---|---|
| `data/relution-26.1.1/template-bundle.json` | OBSERVED | Relution 26.1.1 tooling/schema evidence; not tenant-version proof |
| `data/relution-26.1.1/audit-report.json` | OBSERVED/MEASURED | 19 platforms, 201 configuration types, 2,067 schemas, 24 regex compatibility issues, 201/0 mock round-trip pass/fail |
| `example/sample-policy-export.rexp` | OBSERVED | Synthetic 26.1.1 archive-format fixture; not a real policy baseline |
| four `example/Windows*.rexp` files | OBSERVED | Server 5.30.0 historical fixtures; not current schema evidence |
| `example/{bsi,cis,vendor}-references/` | OBSERVED | Generated offline snapshots; mappings require source/version and applicability review |
| `private/source-pdfs-cache/` | OBSERVED | Ignored historical source evidence restored from Git; licence-constrained |
| target Relution tenant | NOT_EVIDENCED | No live metadata, tenant export, or controlled API evidence supplied |

The installed version must be established in this order: server/portal system
metadata; known-good exports from that system; read-only API/OpenAPI metadata;
matching official documentation and release notes; controlled lab tests.

## Immediate findings

### P0: none proven

No supplied evidence proves an immediate live security, privacy, or operational
incident. Absence of evidence is not evidence of absence.

### P1: required before a BSI-aligned baseline can be claimed

| ID | Evidence | Scope/risk | Action and usability consequence |
|---|---|---|---|
| F-P1-001 | No tenant inventory or export | Entire assessment may target the wrong models or miss conflicts | Acquire the inventories in `inventory/current-state.yaml`; read-only collection has no endpoint-user impact |
| F-P1-002 | Only tooling evidence identifies 26.1.1; historical fixtures identify 5.30.0 | Schema, assignment, payload, and precedence assumptions may be wrong | Record Server/Portal/Companion/client/API versions and migration state before generating JSON |
| F-P1-003 | No admin/RBAC/MFA/audit-log evidence | Management-plane compromise risk cannot be assessed | Export roles/accounts/authentication/log configuration; disable nothing until ownership and break-glass are confirmed |
| F-P1-004 | No ownership/enrolment/supervision inventory | Corporate restrictions could violate BYOD privacy or fail technically | Classify every device model before policy design; quarantine unknowns only after notification and support review |
| F-P1-005 | No effective assignment or precedence evidence | Duplicate/conflicting policies may cause lockout or data loss | Export groups, policies, versions, assignments, device effective state, and error codes; test composition in lab |
| F-P1-006 | No rollback exports or pilot proof | Broad change could cause operational lockout | Create Lab/Pilot rings and immutable pre-change exports before any target assignment |

### P2: vendor/CIS improvement work

| ID | Evidence | Risk | Action |
|---|---|---|---|
| F-P2-001 | Apple DDM capability/effective declarations not supplied | Legacy and declarative update settings may conflict | Inventory OS/DDM status and prefer supported declarations after lab verification |
| F-P2-002 | Windows editions, CSP results, BitLocker escrow, WDAC mode, and update telemetry absent | Controls may be unsupported or destructive | Map exact CSP nodes; use WDAC audit-first and validate escrow/recovery |
| F-P2-003 | Android ownership mode, explicit policy, posture, and enforcement rules absent | BYOD overreach or default wipe behaviour | Export effective policy and non-compliance details; customise graduated actions |
| F-P2-004 | CIS snapshots include benchmark-specific and Intune-oriented material | Blind mapping may be unsupported or disproportionate | Reconfirm title/version/licence, map to vendor CSP/payload, adopt Level-1-like outcomes selectively |

### P3: maintainability optimisation

- Record the source JAR/image digest for regenerated Relution templates.
- Resolve or explicitly waive the 24 schema regex compatibility issues before
  treating all OpenAPI validation as exact.
- Add sanitised inventory importers and completeness reports without expanding
  the production API client's read-only endpoint allow-list implicitly.

## Threat and risk model

| Threat | Existing evidence | Proposed control | Residual/operational risk |
|---|---|---|---|
| Lost/stolen device | NOT_EVIDENCED | authentication, encryption, managed-data boundary, lost-mode/lock/retire runbook | offline device; BYOD selective-wipe limitations |
| Weak/stolen credentials | NOT_EVIDENCED | phishing-resistant admin MFA, RBAC, hardware-backed endpoint credentials | break-glass and recovery failure |
| Unsupported or unpatched OS | NOT_EVIDENCED | support matrix, rings, grace periods, retirement | vendor/OEM delay and critical emergency exceptions |
| Malicious/risky apps | NOT_EVIDENCED | managed stores, provenance, Play Protect/Defender, risk-based deny | false positives and app-owner delays |
| Data exfiltration | NOT_EVIDENCED | managed open-in/work-profile boundaries, encryption, conditional VPN | screenshots/camera and authorised sharing remain residual |
| Root/jailbreak/boot compromise | NOT_EVIDENCED | posture/integrity signals and graduated access restriction | signal availability and false positives |
| Certificate compromise | NOT_EVIDENCED | inventory, short lifecycle, escrow separation, revocation runbook | offline revocation and dependency outage |
| MDM admin compromise | NOT_EVIDENCED | MFA, least privilege, separation, audit review, privileged workstation | vendor/service compromise |
| Policy tampering/unenrolment | NOT_EVIDENCED | supervised/device-owner enrolment where applicable, alerting, access restriction | BYOD user removal is legitimate and must trigger data-access revocation, not punitive wipe |
| Excessive restriction/lockout | NOT_EVIDENCED | proportionality review, pilots, support criteria, rollback | emergency hardening may temporarily increase friction |
| Privacy overreach | NOT_EVIDENCED | data minimisation and ownership-specific visibility/wipe notices | legal/works-council requirements remain organisation-specific |

## User and deployment models

No population is evidenced. Phase A must interview service owner, security,
data protection, works council where applicable, application owners, help desk,
accessibility representatives, and representative users. A model is activated
only when inventory evidence shows it exists. Candidate models are:

- Apple: supervised corporate iPhone/iPad, Shared iPad, corporate Mac, User
  Enrollment/BYOD, dedicated/kiosk.
- Windows: corporate workstation/laptop, shared, privileged workstation,
  dedicated/kiosk, BYOD only if the actual join/enrolment and data boundary are
  acceptable.
- Android Enterprise: fully managed, COPE work profile, BYOD work profile,
  dedicated, Samsung-specific only where the fleet and licences require it.

For every activated model, record ownership, enrolment authority, privacy
boundary, wipe semantics, controls available/unavailable, applications,
offline/peripheral/accessibility needs, and support owner.

## Compliance model

Use `compliant → grace → non-compliant → restricted → quarantine → retired`,
plus `unknown/stale`. Each check must specify source, threshold, cadence,
false-positive risk, notice, support escalation, exception and recovery.

Default response is notify, self-remediate, support alert, restrict selected
organisational access, quarantine, then retire/wipe only with authorisation.
Never configure ordinary compliance failures to trigger immediate destructive
action. Android default enforcement behaviour must be explicitly inspected and
overridden where disproportionate.

## Traceability and audit proof

Every implemented row must resolve this chain:

`source requirement → control ID → policy/version → group/ring → device model → verification result → dated evidence → exception`

An MDM field proves only configuration intent. Compliance claims additionally
require applicability, successful delivery/effective state, operational
processes, exception handling, and periodic review.

## Phase B approval conditions

Phase B may start only when:

1. all `critical_inputs` in the inventory are `EVIDENCED` and sanitised;
2. installed version and known-good export schema are confirmed;
3. at least one harmless export/import round trip succeeds in Lab;
4. active device models and user populations are approved;
5. target controls and deviations receive security, service-owner, privacy and
   operations review;
6. pilot devices, success/failure criteria, support comms and rollback owners
   are named;
7. no generated artifact contains secrets, production assignments, duplicate
   IDs, or unresolved production placeholders.
