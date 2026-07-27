# Safety, failure handling, and troubleshooting

## Authorization and scope

Operate only an instance and organization explicitly placed in scope by its
owner. Relution's disclosure policy distinguishes Relution-operated services
from customer-operated installations; public documentation is not permission to
test either. Do not enumerate hosts, bypass registration, probe undocumented
routes, or test access-control weaknesses as part of ordinary administration.

Apply least privilege to both token roles and task scope. A token can be valid
while lacking a permission or organization. A missing permission is a stop
condition, not a reason to use another account, organization, legacy endpoint,
or UI session without authorization.

## Secret and sensitive-data rules

Never expose or persist:

- API tokens, passwords, session cookies, refresh tokens, recovery codes;
- private keys, certificate bundles, signing material, client secrets;
- SMTP, LDAP, OIDC, Entra, Google, APNs, Android Enterprise, VPP/ASM/DEP, or
  remote-support credentials;
- complete user/device exports, locations, serial numbers, hardware IDs,
  installed-app lists, logs, or audit exports unless explicitly required and
  handled in an approved secure location.

Use redaction labels such as `<redacted token>`, `<write-only secret changed>`,
or a permitted fingerprint; never include a secret prefix/suffix as "proof."
Avoid verbose HTTP traces and shell tracing. Inspect source OpenAPI examples for
embedded hostnames or credentials before sharing them.

If a secret appears in output or a tracked file:

1. stop all further calls;
2. do not repeat or quote the value;
3. tell the owner which secret type and exposure surface were involved;
4. revoke/rotate it through an authorized channel;
5. preserve only sanitized incident evidence;
6. follow repository/history cleanup procedures approved by the owner.

## Redirects, TLS, and target pinning

- Use HTTPS and normal certificate validation. Do not use `curl -k` or disable
  hostname verification to "fix" a request.
- Compare the parsed URL origin to the authorized origin before every scripted
  request.
- Do not put tokens in query strings.
- Do not automatically follow authenticated redirects. Resolve redirects and
  authorize the destination first.
- Treat a DNS, certificate, proxy, or SSO change as a target-identity issue. Do
  not work around it with a hosts-file entry or alternate endpoint.

## Interpreting HTTP outcomes

The exact operation response map has priority. The table below is a diagnostic
framework, not a claim that every Relution operation returns every code.

| Outcome | Meaning to establish | Safe next step |
| --- | --- | --- |
| No HTTP response | DNS/TLS/connectivity/timeout, or connection lost after server may have acted | Do not retry mutation; read state and audit first |
| `2xx` documented | Transport/server acceptance, possibly completion | Validate schema, read back, audit, and job/action status |
| `2xx` undocumented | Contract/runtime drift or wrong operation contract | Stop, retain redacted evidence, re-export contract |
| `3xx` | Redirect or wrong base/path | Do not forward token automatically; verify origin and target config |
| `400` | Shape/parameter/business validation problem | Compare exact request with schema; do not weaken validation |
| `401` | Missing/invalid/expired auth, wrong scheme or target | Verify token lifecycle and header locally; never print token |
| `403` | Insufficient role, organization, or operation permission | Stop and request the least required permission |
| `404` | Wrong version/path/ID/scope, or intentionally concealed resource | Confirm contract, identifier source, organization; do not enumerate |
| `405` | Wrong method or stale path | Re-check target catalog; do not method-probe |
| `409` / `412` | Conflict, dependency, revision, or precondition | Re-read state/revision and re-plan; never force overwrite blindly |
| `413` | Upload exceeds target/proxy/product limit | Confirm documented limit; reduce authorized payload or change plan |
| `415` | Wrong media type | Use the operation's exact content type and encoding |
| `422` | Semantically invalid input where used | Inspect field validation and dependencies; keep server rules intact |
| `429` | Rate/quota limit where used | Honor server guidance; stop fan-out and report partial scope |
| `5xx` | Server/proxy failure; mutation outcome may be unknown | No blind retry; read state, job/action, and audit; escalate with request ID |

For error bodies, record status, media type, documented error identifier, safe
message, field violations, and request/correlation ID. Redact stack traces and
operational data. Do not build automation around an undocumented prose string.

## Retry and loop policy

| Request type | Automatic retry default |
| --- | --- |
| Bounded `GET`/safe read | Only after target-specific rate guidance; finite attempts |
| Query `POST` known by contract to be read-only | Treat as safe only with explicit contract evidence |
| Create/update/delete | No automatic retry |
| Device action/command | No automatic retry |
| Upload/import/sync/migration | No resubmission; poll returned job/status operation |
| Audit/status polling | Finite interval, deadline, maximum attempts, terminal-state set |

Every loop must have a maximum item count, page count or cursor bound, elapsed
deadline, and stop behavior. Rate limits and quotas can be deployment-specific.
Relution publishes reference limits for its cloud offering (including upload,
storage, and device-action quotas), but confirm the target agreement and runtime
responses before planning work.

## Asynchronous and partial outcomes

Creation of a job/action is not completion. Track:

```text
submission_status
job_or_action_id
poll_operation
documented_nonterminal_states
documented_terminal_success_states
documented_terminal_failure_or_cancel_states
per_entity_or_device_results
independent_final_state_check
```

If a job reaches an unknown state, exceeds the deadline, or reports mixed
results, stop fan-out. Report the exact completed/failed/unknown target sets. Do
not resubmit unknown targets until state and audit evidence prove they were not
processed.

## Bulk, pagination, and fleet safety

Before a bulk operation:

1. Materialize and review the exact stable-ID target set without sensitive
   fields.
2. Record query contract, filters, sort, page count, total, and collection time.
3. Exclude ambiguous, newly appearing, or out-of-organization resources.
4. Obtain approval naming the count and effect.
5. Use one canary target and verify end-to-end.
6. Apply a bounded batch only if separately authorized.
7. Define a stop threshold for any failure, unexpected response, compliance
   regression, or action backlog.

Never interpret `limit: 100` as "all devices" or generalize a first-page test to
the fleet. Concurrent changes can make offset pagination unstable; use the
target's cursor/snapshot support or a deterministic stable sort where available.

## Device-action distinctions

Read the operation description and schema to distinguish:

- deleting a server inventory record from sending an unenroll/retire command;
- enterprise wipe from factory wipe;
- lock from lost mode;
- clearing a passcode from setting or generating a new one;
- unassigning a policy/app from actively removing it on a device;
- creating an action from the device completing it;
- cancelling an action from reversing an already completed effect.

If the contract does not make the device-side effect clear, do not execute it.
Use official release-matched product documentation or ask an administrator to
confirm behavior.

## Logging and diagnostics

Use the narrowest logger and shortest observation window. Never enable root
debug logging as a routine troubleshooting first step. Record the prior level
and restore operation before changing it. Relution warns that debug logging can
produce substantial data and impair performance.

When collecting diagnostics:

- prefer request IDs, status, timestamps, and a narrow package over full logs;
- avoid user/device payloads and authorization headers;
- keep timezone explicit;
- separate client transport errors from server application errors;
- restore log levels and verify restoration after collection.

## Audit evidence

The Relution audit log can show timestamp, acting user, HTTP method, description,
status, organization, IP address, and endpoint. Its default documented retention
is 180 days, though a target may differ. Audit evidence supports attribution and
server observation; it does not prove that a device received or completed an
action.

For a missing audit entry:

1. confirm time zone and retention window;
2. confirm target and organization;
3. confirm the acting token owner;
4. search by method/endpoint and a tight time range;
5. distinguish a request rejected upstream from one handled by Relution;
6. do not repeat a mutation merely to generate a new event.

## Common failure diagnoses

### Catalog does not contain the expected feature

- Confirm the concept exists in the appropriate product registry and distinguish
  official capability coverage from target availability.
- Confirm the target version, license/module, organization type, and export
  source.
- Search synonyms and tags, then inspect the UI workflow and official changelog.
- Confirm whether the feature is intentionally UI-only in that target contract.
- Do not import a path from another instance. Record the capability as absent
  from the supplied contract.

### `--check` says the catalog is stale

The source JSON, renderer, or either generated output changed. Regenerate both
Markdown and JSON, review the new digest and operation diff, invalidate target
bindings/change plans for the old digest, and re-resolve every planned
operation. Never hand-edit a generated file to make the check pass.

### JSON parses but referenced schemas are missing

The export may use external `$ref` documents or be incomplete. Obtain all
referenced documents through the same authorized Web API surface. The renderer
preserves reference strings but does not fetch external URLs.

### A read works but the write is forbidden

Read and write permissions differ. Confirm the exact permission named in target
documentation. Request only that role/permission and preserve separation of
duties; do not switch to a broad administrator token as a shortcut.

### Read-back differs after documented success

Possible causes include normalization, async processing, wrong scope/resource,
concurrent update, inherited policy, server-side validation/defaulting, or a
different read projection. Stop. Compare response and direct resource read to
the schema, inspect audit/job state, and rollback if the approved condition is
met. Do not keep rewriting until values happen to match.

### The response contains HTML

Likely causes include an incorrect base/path, login/SSO redirect, proxy error,
or Web UI route. Do not parse it as API JSON or follow it with the token. Check
status, `Content-Type`, `Location`, target origin, and the target contract.

## Mandatory stop conditions

Stop before or during live work if:

- target, organization, resource, desired state, or authority is ambiguous;
- the target OpenAPI contract is missing, stale, malformed, or from another
  version/host;
- the selected operation or payload is inferred rather than contract-backed;
- a concept-to-operation binding references another contract digest or a
  webhook/callback surface as a client operation;
- a secret appears in output or local artifacts;
- the response status/schema is undocumented;
- a mutation outcome is unknown;
- read-back or audit evidence contradicts the requested effect;
- concurrent state changed after planning;
- rollback/recovery is unavailable at a risk tier that requires it;
- a canary fails or a bulk stop threshold is reached;
- API, action, storage, or time bounds would be exceeded;
- a device command's end-user or data effect is unclear.

Report the blocker and the smallest missing evidence or authorization needed to
continue. Do not broaden scope to make progress.
