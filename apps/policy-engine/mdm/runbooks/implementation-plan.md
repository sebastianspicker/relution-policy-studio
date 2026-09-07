# Controlled implementation batches

This is a proposed sequence for controlled Lab implementation. The repository
does not establish authority to execute it in a tenant. Each batch requires a
named approver, rollback owner, and evidence; production promotion requires a
separate recorded release approval.

| Batch | Scope and prerequisites | Tests / approval / rollback |
|---|---|---|
| 1 | Private inventory, exports, hashes and backup; read-only access approved | completeness/truncation report; service owner; restore one export |
| 2 | Management-plane MFA/RBAC/log/backup review; break-glass named | MFA and restore tests; CISO/operations; retain prior role export |
| 3 | Current group/policy catalogue and migration dispositions | overlap/dependency graph; service owner; no deletions |
| 4 | Lab/Pilot/Early/Broad/Quarantine groups | deterministic membership test; change manager; remove empty ring assignments |
| 5 | Approve normalised control catalogue and deviations | mapping/licence/applicability review; security/privacy/operations |
| 6 | Apple source policies only for evidenced models | schema, DDM/legacy conflict, supervised/User Enrollment tests; Apple owner; import rollback export |
| 7 | Windows source policies only for supported editions/builds | CSP result, BitLocker recovery, update ring, WDAC audit; Windows owner |
| 8 | Android policies split by fully managed/COPE/BYOD/dedicated | explicit policy, privacy, non-compliance and wipe-semantics tests; Android owner |
| 9 | Connectivity, apps and data protection overlays | certificate renewal and positive/negative app/data-flow tests; app/network/data owners |
| 10 | Compliance states, notifications, support integration | simulated failures through recovery; security/support; disable automation first |
| 11 | Exception workflow and narrow profiles | expiry/report test; risk owner; remove exception assignment |
| 12 | Generate installed-version import units and manifests | deterministic/schema/secret/conflict checks; technical reviewer; preserve sources and exports |
| 13 | Lab then representative Pilot | success/failure criteria and observation period; CAB; restore export/remove target policy |
| 14 | Early/Broad staged promotion and audit closeout | help-desk telemetry, effective-state sample, rollback drill; CAB/risk owner |

## Per-batch record

Record scope, policy/control versions, devices/models, prerequisites, expected
user symptom, support diagnosis, success/failure criteria, observation period,
telemetry, communication, approval, rollback trigger/method, evidence hashes and
source-control commit. Emergency deployment shortens observation only under a
documented incident decision; it does not bypass rollback or evidence.

## Rollback order

Stop promotion; disable automated destructive actions; remove the newest narrow
assignment; reassign the last known-good policy/version; restore required
certificate/network dependencies; validate effective state; notify users and
support; preserve logs; open incident/problem records; decide whether the failed
version is fixed or retired. Rollback itself is a controlled change.
