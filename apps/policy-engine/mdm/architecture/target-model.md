# Proposed target group and policy architecture

Status: `PROPOSED` reference design. Production inventory, Lab validation, and
deployment approval are `NOT_EVIDENCED`.

Activate only the branches supported by completed inventory and Lab evidence.
The installed tenant's Relution version, migration state, and assignment
semantics must be proven before using this model.

## Naming

`<PLATFORM>-<MODEL>-<PURPOSE>-L<LAYER>-<RING>-v<MAJOR>`

Platforms: `APL`, `MAC`, `WIN`, `AND`, `CROSS`. Models: `CORP`, `BYOD`,
`COPE`, `SHARED`, `KIOSK`, `PRIV`. Rings: `LAB`, `PILOT`, `EARLY`, `BROAD`,
`ELEVATED`, `QUARANTINE`. Phase B source records are `LAB-only`; a later ring
is an approval and evidence transition, never a name-only promotion.

Names state scope and lifecycle, not compliance. Never use `Secure`, `Final`,
`BSI compliant`, or a department name as a security classification.

## Assignment dimensions

| Dimension | Purpose | Membership/source | Owner/lifecycle |
|---|---|---|---|
| Platform | payload applicability | device-reported platform | Endpoint engineering; automatic |
| Ownership/enrolment | control/privacy boundary | authoritative enrolment record | Service owner; reviewed quarterly |
| Functional model | standard, privileged, shared, kiosk | approved device-purpose register | Business/device owner; expiry on reassignment |
| Ring | change exposure | explicit asset list or percentage with stable IDs | Change manager; promotion per release |
| Compliance | remediation state only | measurable effective-state rules | Security operations; automatic recovery |
| Exception | narrow deviation | approved exception ID and expiry | Risk owner; mandatory expiry |

Avoid groups named after policies, opaque compound rules, manual membership
when an auditable source exists, permanent exceptions, and mixed-platform
groups for platform-specific payloads.

## Conceptual hierarchy

```text
All managed devices
├── Platform: Apple mobile | macOS | Windows | Android Enterprise
├── Model: corporate | BYOD/work profile | shared | dedicated | privileged
├── Ring: Lab | Pilot | Early | Broad | Elevated
└── State: grace | restricted | quarantine | retirement | exception
```

Each real group catalogue row must include name, UUID, purpose, one primary
assignment function, deterministic inclusion/exclusion, source, owner, member
count, assignments, overlap analysis, lifecycle and last review.

## Policy layers

| Layer | Scope | Examples | Composition rule |
|---|---|---|---|
| 0 Trust/enrolment | model-specific | identity, certificate bootstrap, management-removal semantics | first; never assume supervised/device-owner controls on BYOD |
| 1 Platform baseline | platform + model | authentication, encryption, integrity, lock, updates | small coherent baseline; no persona apps |
| 2 Connectivity | platform/site/use case | EAP-TLS Wi-Fi, VPN, DNS, proxy, certificates | environment values via approved overlays |
| 3 Data protection | ownership/model | managed open-in, work-profile boundary, backups/cloud | prefer boundaries over global feature bans |
| 4 Applications | persona/model | required/optional/prohibited, managed config, update | app owner and licence prerequisite |
| 5 Persona | stable functional need | standard, privileged, shared, kiosk, field | narrow delta from baseline |
| 6 Compliance | cross-platform outcomes | supported OS, encryption, integrity, check-in | graduated actions; no ordinary-failure wipe |
| 7 Exception | single deviation | compensating control and expiry | highest specificity; never silently weaken baseline |

Composition and precedence are hypotheses until a harmless lab matrix proves
same-field, cross-layer, group-overlap, legacy-vs-declarative and exception
behaviour on each platform.

## Candidate policy units

The LAB source units are under `mdm/policies/`. Later-ring examples are derived
only after the preceding evidence gate succeeds; they are not generated now:

- `APL-CORP-STANDARD-L1-PILOT-v1`, `APL-BYOD-STANDARD-L3-PILOT-v1`
- `MAC-CORP-STANDARD-L1-PILOT-v1`, `MAC-PRIV-ADMIN-L5-ELEVATED-v1`
- `WIN-CORP-STANDARD-L1-PILOT-v1`, `WIN-PRIV-ADMIN-L5-ELEVATED-v1`
- `AND-CORP-STANDARD-L1-PILOT-v1`, `AND-COPE-STANDARD-L3-PILOT-v1`
- `AND-BYOD-STANDARD-L3-PILOT-v1`, `AND-KIOSK-DEDICATED-L5-PILOT-v1`
- `CROSS-MANAGED-COMPLIANCE-L6-PILOT-v1`

Shared/kiosk/elevated profiles are use-case-specific, not stricter defaults.

## Platform boundaries

- Apple: prove ADE/supervision/User Enrollment and DDM capability. Declarative
  update/app declarations may take precedence over comparable legacy commands.
- Windows: prove edition/build/join/licensing and exact CSP result codes.
  Microsoft Intune baselines are comparison material, not Relution imports.
  WDAC follows audit, analyse, pilot, then enforcement with recovery media.
- Android: policy is model-dependent; fully managed, COPE, BYOD work profile
  and dedicated devices have different privacy and command surfaces. Inspect
  explicit values and non-compliance details; do not rely on unstable defaults.
- Samsung: add Knox/KME/OEMConfig deltas only when fleet and licence evidence
  establish the requirement.

## Migration disposition

Every current group and policy receives one of `retain`, `rename`, `merge`,
`split`, `replace`, `retire`. No disposition can be assigned before current
objects and dependencies are inventoried. Migration order is backup/export,
Lab rings, parallel target assignment, effective-state comparison, Pilot,
staged promotion, old-assignment removal, observation, then retirement.
