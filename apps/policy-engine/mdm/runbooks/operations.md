# Phase B operational procedure specifications

These reference procedures are neither execution authority nor evidence that
they currently operate in a production tenant.

## Enrolment

Verify approved asset/user, ownership, platform support, enrolment method,
privacy notice/consent where applicable, network/time, device identity and
certificate bootstrap. Assign only Lab/Pilot-approved baseline groups. Confirm
management, encryption, required apps, compliance and check-in. On failure,
remove only the incomplete enrolment artefacts and preserve personal data.

## Policy creation and change

Link every setting to a control and affected model; record default behaviour,
prerequisite, user/support/privacy impact and rollback. Generate only from
approved sources against the installed-version schema. Peer review, validate,
Lab import, device test, Pilot observation, approval, staged promotion and
changelog are mandatory. Emergency changes retain evidence and rollback.

## Support

For each material setting publish expected symptom, affected users, diagnostic
state/error, safe self-remediation, escalation owner, exception path and known
recovery time. First-line support may notify and guide; destructive commands,
exception approval and broad assignments require authorised roles.

## Compliance remediation

Confirm data freshness and false-positive conditions. Notify with actionable
instructions, open a support alert, observe grace, restrict only relevant
organisational access, quarantine if unresolved, and retire/wipe only under the
approved ownership-specific process. Recovery automatically removes temporary
restrictions and closes evidence; unknown remains unknown.

Default timings are seven days of grace for ordinary failures. Critical
integrity failure or active-management loss notifies immediately and restricts
organisational access after 24 hours. Stale check-in warns at seven days,
restricts at 30 days, and enters retirement review at 90 days. Recovery removes
temporary restrictions automatically. Immediate compliance wipe is prohibited.

## Update deadlines

Lab receives updates first. Ordinary security updates have a seven-day
deadline; feature updates have a 30-day deadline. A 24-hour emergency path
requires incident approval and retains rollback evidence.

## Ring promotion and rollback

- Lab uses model-specific IT devices for at least three business days.
- Pilot uses representative users and at least five devices or 5% of the target
  population for at least five business days.
- Early covers 20% of the target population for at least five business days.
- Broad covers the remaining eligible devices only after recorded release
  approval. Elevated and quarantine remain separate scopes.

Roll back immediately for enrolment failure, unrecoverable lockout, lost
connectivity or certificates, critical application failure, unintended
personal-data impact, or security-control regression. Also roll back when
false-positive non-compliance exceeds 2% or attributable support tickets rise
more than 10%.

## Device loss, transfer and retirement

Authenticate reporter; classify ownership and data risk; revoke sessions and
certificates; use corporate lost mode only when lawful and supported; choose
selective work-data removal for BYOD and authorised erase for corporate assets;
record offline failure; verify downstream access removal. Transfer requires
prior-user removal, ownership update, re-enrolment and fresh compliance proof.

## Certificates

Maintain owner, purpose, issuer, template, subject minimisation, expiry,
renewal window, revocation and dependency register. Test renewal before broad
rollout. Never export private keys into the repository. Compromise triggers
revocation, replacement, access review and incident evidence.

## Administrator access

Named account, MFA, approved role, privileged workstation, manager/system-owner
approval and logged onboarding are required. Review quarterly and on role
change. Offboarding immediately disables access and tokens, transfers ownership
and reviews recent privileged actions. Break-glass use requires alert and
post-use credential rotation.

## Audit export, evidence and retention

Record UTC timestamp, collector/tool version, query/filter/limit/total,
truncation, source version/build and SHA-256. Store originals in protected
private evidence; promote only sanitised summaries. Evidence catalogue records
owner, classification, retention, reproduction command and related control.

## Backup, recovery and rollback

Back up application/configuration/database and export every affected policy
before change. Test restoration on a schedule defined by recovery objectives.
Rollback follows `implementation-plan.md`; validate effective device state and
dependent network/certificate/app recovery, not merely successful re-import.

## Exception and change review

Use the exception template; reject missing expiry or compensating control.
Review expiry monthly and control applicability annually or after material OS,
Relution, threat, law, vendor or use-case change. Closed exceptions retain dated
closure evidence.

Exceptions expire after 90 days by default and never exceed 180 days without a
renewed risk approval.
