# Phase A control traceability matrix

Status: design trace only. Policies, groups, verification results, evidence and
exceptions are intentionally unresolved until tenant inventory and Lab proof.

| Source requirement | Control | Proposed policy/layer | Proposed group | Verification | Evidence / exception |
|---|---|---|---|---|---|
| BSI MDM.2.1.01; SYS.3.2.2.A1 | MDM-GOV-001 | organisational/L0 | model register | approved strategy review | NOT_EVIDENCED / no exception |
| BSI MDM.2.2.08; SYS.3.2.2.A12 | MDM-ADM-001 | management plane | admin roles | MFA/RBAC/log tests | NOT_EVIDENCED / expiring CISO exception |
| SYS.3.2.1.A4 | MDM-AUTH-001 | platform L1 | platform+model | effective state, lock/recovery | NOT_EVIDENCED / expiring risk exception |
| SYS.3.2.1.A11 | MDM-ENC-001 | platform L1 | corporate/work container | encryption+escrow+recovery | NOT_EVIDENCED / CISO exception |
| SYS.3.2.1.A5 | MDM-UPD-001 | platform L1 | platform+ring | build/deadline/failure recovery | NOT_EVIDENCED / app+security exception |
| BSI MDM.2.2.02 | MDM-INT-001 | compliance L6 | model+state | injected integrity failure | NOT_EVIDENCED / risk exception |
| BSI MDM.2.6 | MDM-DATA-001 | data L3 | ownership/model | positive/negative data flow | NOT_EVIDENCED / data-owner exception |
| SYS.3.2.1.A8; SYS.3.2.2.A7 | MDM-APP-001 | apps L4 | persona/model | install/update/remove/config | NOT_EVIDENCED / app+security exception |
| SYS.3.2.1.A22/A34 | MDM-NET-001 | connectivity L2 | use case/site | auth/renewal/roaming/offline | NOT_EVIDENCED / network exception |
| SYS.3.2.2.A21 | MDM-CERT-001 | trust/connectivity | all managed | issue/renew/revoke/deny | NOT_EVIDENCED / PKI exception |
| SYS.3.2.2.A23 | MDM-CMP-001 | compliance L6 | state groups | failure through recovery | NOT_EVIDENCED / risk exception |
| SYS.3.2.2.A6 | MDM-LOG-001 | management plane | all managed/admin | event/export/access/retention | NOT_EVIDENCED / no exception |
| SYS.3.2.2.A22 | MDM-LIFE-001 | lifecycle L0/L6 | ownership/model | loss/retire/wipe lab test | NOT_EVIDENCED / dual approval |
| Apple Platform Deployment; Relution 26.1 notes | APL-UPD-001 | Apple L1 | Apple corporate+ring | DDM status and update result | NOT_EVIDENCED / endpoint exception |
| Microsoft App Control guidance | WIN-WDAC-001 | Windows L5 | approved corporate/privileged | audit events, apps, enforcement rollback | NOT_EVIDENCED / app+security exception |
| Android Enterprise policy guidance | AND-MODE-001 | Android L0/L3 | exact AE model | owner/profile status and wipe boundary | NOT_EVIDENCED / no exception |
| BSI MDM.2.1.02 | MDM-EXC-001 | exception L7 | one approved scope | monthly expiry/closure sample | NOT_EVIDENCED / no meta-exception |

CIS mapping remains `pending-current-benchmark-applicability` for each row. The
recovered PDFs may be inspected locally, but benchmark title/version/profile,
licence and relevance to the actual OS/management surface must be approved
before individual recommendations are adopted, modified or rejected.

