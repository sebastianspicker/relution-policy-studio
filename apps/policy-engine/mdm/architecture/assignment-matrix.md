# Provisional assignment matrix

This is a design matrix, not a tenant assignment. `ACTIVE?` remains `NO` until
the inventory proves the model exists and its owner approves it.

| Device model | L0 | L1 | L2 | L3 | L4 | L5 | L6 | Wipe/privacy boundary | ACTIVE? |
|---|---|---|---|---|---|---|---|---|---|
| Supervised corporate iPhone/iPad | corporate enrolment | Apple corporate | site/use case | managed data | persona apps | optional persona | corporate compliance | full wipe authorised; lost mode only with process | NO |
| Apple User Enrollment/BYOD | user enrolment | minimal Apple | managed connectivity | managed data boundary | work apps | none by default | work-access compliance | selective organisational-data removal | NO |
| Corporate Mac | ADE/manual model proven | macOS corporate | site/use case | managed storage/share | persona apps | standard/privileged | corporate compliance | FileVault recovery and authorised erase | NO |
| Corporate Windows | join/provision model proven | Windows corporate | site/use case | data and removable media | persona apps | standard/privileged | corporate compliance | BitLocker recovery and authorised reset | NO |
| Android fully managed | device owner | Android corporate | site/use case | corporate data | managed Play | standard | corporate compliance | corporate wipe authorised | NO |
| Android COPE | company-owned profile mode | Android COPE | site/use case | work/personal boundary | managed Play work | standard | work and device compliance | verify personal-data wipe semantics | NO |
| Android BYOD work profile | profile owner | minimal Android work | managed connectivity | work-profile boundary | managed Play work | none by default | work-access compliance | work-profile removal only | NO |
| Shared/dedicated/kiosk | dedicated enrolment | platform baseline | fixed connectivity | task-specific | allowlisted task apps | kiosk delta | dedicated compliance | asset-owner procedure and escape path | NO |
| Privileged workstation | corporate enrolment | corporate baseline | admin network/VPN | elevated boundary | approved admin tools | privileged delta | elevated compliance | security/operations dual control | NO |

No cross-platform payload policy is assigned merely for naming convenience.
Cross-platform compliance means common outcomes evaluated from platform-specific
signals.

