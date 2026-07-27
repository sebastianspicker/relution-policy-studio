# Settings mutation runbook

This runbook turns an authorized settings request into a bounded, reversible API
change. It deliberately does not hard-code settings endpoints: their paths and
schemas must come from the exact target OpenAPI contract.

For a machine-executable record, copy
`templates/settings-change-plan.json` and validate the populated copy with its
exact target artifacts:

```sh
python3 scripts/validate_machine_docs.py \
  --spec /approved/local/path/target-openapi.json \
  --catalog /approved/local/path/API_CATALOG.json \
  --bindings /approved/local/path/target-bindings.json \
  --change-plan /approved/local/path/settings-change-plan.json
```

Structural validity is not authorization: the plan remains non-executable
until its target, digest, operations, before state, approval, assertions, and
recovery fields pass the gates below.

## 1. Classify impact before discovery

Use the highest applicable tier.

| Tier | Examples | Minimum gate |
| --- | --- | --- |
| 0: Read only | Query settings, status, inventory, audit | Authorized target and organization; bounded request |
| 1: Local/reversible | One non-shared, non-security operator preference with no external effect | Exact task authorization, recorded before state, read-back, rollback value |
| 2: Organization-wide | Branding, notifications, lending, ownership defaults, app/client settings | Explicit scope confirmation, impact review, rollback test or documented restore |
| 3: Security/integration | Password/MFA/login, OIDC, LDAP, Entra, Google, IP rules, email, remote support, certificates, APNs, Android Enterprise | Explicit immediate approval, second access path, maintenance window where applicable, credential-safe rollback |
| 4: System/fleet/destructive | System security, MDM-wide behavior, audit cleanup, migrations, bulk changes, wipes/deletes/device commands | Explicit immediate approval naming effects and targets, tested recovery/rollback, bounded canary, monitoring owner |

If a change can alter authentication, authorization, trust, enrollment, device
control, data retention, external communication, or more than one organization,
or is visible to another user, it is not Tier 1 even if the request body changes
one field.

## 2. Write the change record

Complete this before a live mutation:

```text
request_owner:       <person authorizing the outcome>
operator:            <operator and token owner>
authorized_origin:   <exact approved HTTPS origin>
effective_api_server: <resolved operation/path/root server including base path>
target_version:      <reported instance version>
organization:        <stable ID and display name>
catalog_sha256:      <generated catalog digest>
impact_tier:         <0-4 with reason>
canary_monitoring:   <scope, owner, observation window when Tier 4>
resource:            <type, stable ID, display label>
read_operation:      <operation ID, method, path>
write_operation:     <operation ID, method, path>
readback_operation:  <operation ID, method, path>
before_fields:       <redacted field/value map>
desired_fields:      <redacted field/value map>
unchanged_fields:    <important invariants>
expected_statuses:   <from target contract>
rollback_operation: <method/path and prior body, or documented compensating action>
rollback_mode:       <bound operation | restore with write | manual recovery | irreversible>
success_assertion:   <machine-comparable read-back condition>
audit_plan:          <bound audit operation, or exact official UI audit procedure>
approval:            <who, permission scope, one-object effect, time, and expiry>
```

Do not put secrets in this record. For a credential replacement, record only
metadata such as secret source, expected identifier/fingerprint where safe, and
rotation time.

For Tier 1, the user's exact mutation request can supply this authorization. For
Tiers 2-4 and every externally visible effect, obtain explicit approval close to
execution that names the target, scope, and effect. A broad request to "manage
settings" is not approval for a specific externally visible or destructive
change.

The machine gate defines "close" as no more than one hour between approval and
execution and no more than one hour from approval to expiry whenever
`requires_immediate_approval` is true. This is a conservative local control;
shorter organizational windows take precedence.

## 3. Resolve read, write, and rollback operations

Resolve the relevant `setting.*` concept in `registries/settings.json`, search
the target-local `API_CATALOG.json`, record the exact operation key in a digest-bound
target binding, then inspect the source OpenAPI JSON.

Give the binding a `workflow_id` and list every `required_role` for the intended
sequence. A settings mutation normally needs read, write/update/patch/replace,
readback, and either audit API or an approved manual audit plan; add status and
rollback roles when the operation is asynchronous or uses a distinct recovery
operation. `complete_for_requested_workflow` is valid only when all declared
roles are actually bound.

Questions that must have contract-backed answers:

- Is the settings object system-wide, system-organization, organization, group,
  user, or device scoped?
- Does the API expose one aggregate settings resource or domain-specific
  resources?
- Is the mutation `POST`, `PUT`, `PATCH`, or a named action?
- Does `PUT` replace the object? Does a patch use JSON Merge Patch, JSON Patch,
  or ordinary JSON?
- Which fields are required, immutable, `readOnly`, `writeOnly`, nullable,
  secret, or mutually dependent?
- Are there revision, version, or ETag concurrency controls?
- What status codes and response schemas document success?
- Is there a reset/default operation? What does "default" mean at this scope?
- Will the mutation enqueue an action or synchronization job?

If the only available write operation is a full replacement, read the complete
current resource and preserve required server-managed-compatible fields exactly
as the schema directs. Do not convert a list response into a replacement body;
list projections can omit fields.

## 4. Establish current state and identity

1. Run a narrow read using the same resolved effective API server, unexported
   token, and organization scope that will be used for the write.
2. Confirm the returned stable ID and display name.
3. Capture only fields needed for the proposed diff and rollback.
4. Capture revision/ETag data if documented.
5. Re-run the read immediately before a Tier 3/4 change. If relevant state or
   revision changed, stop and re-plan.

Use restrictive permissions for local evidence:

```sh
umask 077
evidence_dir="$(mktemp -d -t relution-change.XXXXXX)"
before_file="${evidence_dir}/before.json"
request_file="${evidence_dir}/request.json"
response_file="${evidence_dir}/response.json"
headers_file="${evidence_dir}/response.headers"
```

The directory is temporary evidence, not an archival location. Redact the final
record, then remove temporary sensitive data using the operator environment's
approved cleanup process. Never stage or commit it.

### Read command template

Replace every placeholder from the selected catalog operation:

```zsh
read_path='/api/exact/read/path/from-catalog'

relution_curl --fail-with-body --silent --show-error \
  --connect-timeout 10 \
  --max-time 60 \
  --request GET \
  --header 'Accept: application/json' \
  --output "${before_file}" \
  "${RELUTION_API_SERVER%/}${read_path}"
```

If the read operation is `POST .../query`, use that method and its exact query
schema. Do not change it to `GET` for convenience. Define `relution_curl` and
resolve `RELUTION_API_SERVER` exactly as described in `API_CONTRACT.md`. Choose
different finite timeouts only when the operation and approved operating window
require them.

## 5. Construct the smallest valid diff

For each submitted field, classify it:

| Class | Rule |
| --- | --- |
| Intended | New value is named in the approved desired state |
| Required carry-forward | Contract requires it for replacement; copy from direct current-resource read |
| Server-managed | Omit unless contract explicitly requires client submission |
| Unknown/unrelated | Omit from patch; preserve exactly for replacement only when schema requires it |
| Secret/write-only | Source from approved secret mechanism; never copy masked UI/API text |
| Destructive sentinel | `null`, empty string/list, `false`, zero, or omitted value may disable/delete; confirm semantics explicitly |

Do not assume `null`, omission, empty string, and empty collection are equivalent.
Do not send example defaults from OpenAPI unless the desired state explicitly
requires them. Validate enum spelling and case against the contract.

Review the serialized request body before sending it. A valid JSON document can
still express an unintended whole-object replacement.

For an approved/executing machine plan, `request_body_file` must exist. The
offline validator intentionally does not open or print it because it can contain
write-only material. Validate a redacted structural body against the exact
source schema first, inject secrets only through the approved mechanism, and
perform the final no-output contract check in the authorized operator
environment.

## 6. Apply exactly one bounded mutation

Use the method, media type, path, and expected statuses from the selected
operation. The following is a shell shape, not a fixed Relution endpoint:

```zsh
write_method='PATCH'
write_path='/api/exact/write/path/from-catalog'

http_status="$(relution_curl --silent --show-error \
  --connect-timeout 10 \
  --max-time 60 \
  --request "${write_method}" \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-binary "@${request_file}" \
  --dump-header "${headers_file}" \
  --output "${response_file}" \
  --write-out '%{http_code}' \
  "${RELUTION_API_SERVER%/}${write_path}")"
curl_exit=$?

printf 'curl exit: %s; HTTP status: %s\n' "${curl_exit}" "${http_status}"
```

Before executing this shape:

- replace `PATCH` only with the catalog method;
- resolve operation/path/root server precedence and variables; ensure the full
  URL has the intended origin/base path and no untrusted redirect;
- include path/query values according to their documented encoding;
- add documented concurrency headers if applicable;
- know the exact allowed success status set;
- have immediate approval for Tiers 2-4 and every externally visible effect.

Do not use `--location` for an authenticated mutation unless the exact redirect
behavior is trusted and necessary; a redirected authorization header can cross
an origin boundary. Do not use `--retry` for mutations.

If `curl_exit` is nonzero or no documented status was returned, stop and treat
the outcome as unknown. Read state and audit evidence before considering any
retry.

## 7. Verify effect independently

An HTTP success response is only the first check:

1. Match the observed status to the operation's documented success response.
2. Validate response media type and schema when a body is expected. An empty
   body can be correct for a documented `204`.
3. Run the direct read-back operation, not a cached list page.
4. Compare every intended field to the desired value.
5. Confirm important unchanged fields remain unchanged.
6. Check revision/modified time if present.
7. For queued work, wait for a documented terminal status and inspect
   per-target outcomes.
8. In **Settings → Audit log** (or the corresponding API operation), locate the
   entry by actor, time, HTTP method, endpoint, organization, status, and object
   context.
9. When the setting affects behavior, perform the smallest safe functional
   check: for example, a non-production test notification or a canary device,
   only if separately authorized.

Report these outcomes separately:

```text
request_transport:  sent | failed | unknown
server_acceptance:  documented success | documented failure | undocumented
readback:           matches | differs | unavailable
audit:              matching | missing | unavailable
functional_check:   passed | failed | not run
overall:            verified | partially verified | not changed | outcome unknown
```

Never label `server_acceptance` alone as `verified`.

The machine plan must record this before execution. Use
`audit_plan.mode: api_operation` with a compatible digest-bound audit operation,
or `manual_ui`
with the exact official audit-log procedure. Both modes must require matching
`actor`, `time`, `http_method`, `endpoint`, `organization`, `status`, and
`object_context`.

## 8. Rollback

Rollback is a planned API operation, not "set it back later."

Classify its execution before approval: `bound_operation` for a distinct
contract operation, `restore_with_write_operation` when the same write can
restore captured prior fields, `manual_recovery` for a documented procedure
with owner and window, or `irreversible` with rollback unavailable and explicit
acknowledgment. Do not leave the mode implicit.

| Change shape | Preferred rollback |
| --- | --- |
| Reversible scalar/list update | Submit the captured prior value using the same contract version, then read back |
| New resource | Delete only the newly created resource if deletion semantics and dependencies are understood |
| Deleted resource | Restore from an approved export/backup only if the product supports faithful recreation |
| Secret/certificate rotation | Restore previous still-valid credential only if security policy permits; otherwise complete forward rotation |
| Integration reconfiguration | Restore prior config and test connectivity/authentication from a second path |
| IP/login/MFA change | Use the pre-established second admin session/path; revert immediately if access test fails |
| Published policy/app change | Reassign or republish the known prior version according to the target contract |
| Device action/wipe | Often irreversible; prevention and explicit approval replace rollback |
| Migration/synchronization/import | Use product-specific compensating plan; never assume replay is rollback |

After rollback, repeat response, read-back, audit, and functional checks. Preserve
evidence of both the failed change and the rollback.

## 9. Settings-domain playbooks

### Password, login, and MFA policy

Risk: Tier 3 or 4. A syntactically valid change can lock out administrators or
all users.

1. Resolve the scope: system, organization, role, or user.
2. Enumerate all fields and constraints from the contract; inspect dependencies
   among minimum length, character classes, expiry, reuse, lockout, and MFA.
3. Confirm at least one independent recovery administrator and access path.
4. Read current policy and active authentication/integration context.
5. Change one coherent policy unit, not unrelated login settings.
6. Read back, then test with an approved non-critical account while retaining
   the recovery session.
7. Revert immediately if either admin recovery or expected login behavior fails.

Never change OIDC/LDAP/Entra settings and local password/MFA policy in the same
unseparated request unless the contract and approved change explicitly require
an atomic operation.

### IP allow/block rules

Risk: Tier 4 due to lockout.

1. Verify the server-observed source IP and any reverse proxy/load-balancer
   behavior; do not rely only on a workstation's local address.
2. Establish a tested second administration path not dependent on the proposed
   rule.
3. Read the complete ordered rule set and its evaluation semantics.
4. Add/adjust one rule without deleting the known-working path.
5. Test a fresh authorized session from both allowed and intended-blocked
   contexts.
6. Only after positive verification, remove an obsolete rule in a separate
   approved mutation.

### Logging configuration

Relution's official guide says log levels can be changed by API and that this
requires the system-organization permission **System → Logging configuration**.
Its Web API flow selects a logger/package and level and documents HTTP `204` for
a successful change. It also supports resetting individual logging points and
restoring defaults.

Risk: Tier 3. `DEBUG`, especially on the root logger, can generate large volumes,
expose sensitive operational data, and degrade performance.

1. Search the target catalog for logging operations and inspect their exact
   schema; do not infer the URL from this guide.
2. Select the narrowest package/logger that covers the incident.
3. Record its current effective/configured level and the restore operation.
4. Set a bounded observation window and responsible operator.
5. Apply the exact level enum from the target contract.
6. Expect `204` only if the target operation documents it; read back the logger
   state and inspect audit evidence.
7. Collect only necessary logs, redact sensitive data, then reset that logging
   point or restore defaults as planned.
8. Verify the restored level and system performance.

### Email and notification settings

Risk: Tier 2 or 3. SMTP credentials are secrets and test messages are externally
visible.

1. Resolve whether credentials are write-only. Never submit masked placeholder
   text returned by a UI or API.
2. Preserve recipient allowlists, sender identity, TLS, and hostname validation.
3. Change configuration separately from sending a test notification unless the
   selected operation is explicitly a combined test.
4. Use an approved test recipient and content that contains no device/user data.
5. Verify setting read-back without expecting a secret to be echoed.
6. Verify delivery and audit evidence separately.

### OIDC, LDAP, Entra ID, and Google Workspace

Risk: Tier 3 or 4. These can alter login, identity mapping, group membership, or
user lifecycle.

1. Determine direction of authority and synchronization: import, export,
   reconciliation, or authentication only.
2. Inspect mapping, deletion/disable, conflict, and organization-routing rules.
3. Keep a working local recovery administrator.
4. Update configuration without triggering a sync unless both actions are
   explicitly approved.
5. Use a validation/test operation if the target contract provides one.
6. Run a canary authentication or sync with a bounded test identity.
7. Review job/entity results and audit events before broader synchronization.

### APNs, Android Enterprise, certificates, and certificate authorities

Risk: Tier 4. Bad trust material can break enrollment or fleet communication.

1. Never read or place private key/certificate bundle contents in this
   repository or automation output.
2. Record non-secret metadata: subject, issuer, serial/fingerprint when policy
   permits, expiry, organization, and intended platform binding.
3. Distinguish upload, activate, renew, replace, revoke, and delete operations.
4. Verify key/certificate pairing through approved tooling before mutation.
5. Preserve the prior still-valid path until the new configuration has been
   validated with a canary enrollment/device.
6. Do not delete or revoke old material in the same step as initial activation.

### MDM, policy, application, and client settings

Risk: Tier 2-4 depending on scope. A settings write can enqueue device actions.

1. Separate definition changes from publish/deploy/assign actions.
2. Confirm whether saving a setting automatically applies to enrolled devices.
3. Use a canary group or single test device where the product supports it.
4. Preserve previous policy/app version and assignment membership.
5. Observe action/job state and device compliance independently.
6. Broader rollout requires separate scope authorization after canary proof.

### Branding, custom CSS, logo, and translations

Risk: Tier 2, or Tier 3 if login/recovery/accessibility could be impaired.
Branding and CSS are externally visible even when the payload changes one field.

1. Validate content type, size, encoding, and any asset upload operation.
2. Check accessibility, login-page usability, and administrative navigation on a
   test organization where possible.
3. Keep the prior asset/value and a no-customization/reset route.
4. Read back the setting and verify the rendered UI separately; API state alone
   does not prove visual correctness.

## 10. Final report template

```markdown
### Relution change result

- Target/version: `<origin>` / `<reported version>`
- Organization: `<ID and display name>`
- Identity/scope: `<redacted actor and role>`
- Contract: SHA-256 `<digest>`, `<count>` operations
- Operation: `<operationId or none>`, `<METHOD> <path>`
- Impact/approval: `<tier>`, `<approver and approved scope>`
- Before → requested: `<redacted field-level diff>`
- Response: `<status and schema result>`
- Read-back: `<assertion and result>`
- Audit: `<matching evidence or unavailable>`
- Functional check: `<result or not run>`
- Rollback: `<available/executed/result>`
- Residual uncertainty: `<specific limits>`
```
