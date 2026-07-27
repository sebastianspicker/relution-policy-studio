# API operation inventory

## What "all operations" means

Relution exposes a large, release-dependent API. The exhaustive operation list
for a target is every OpenAPI Operation Object reachable from top-level `paths`,
top-level `webhooks`, and recursive callbacks. For OpenAPI 3.2 this includes the
fixed `query` operation and arbitrary methods under `additionalOperations`. It
is generated into paired target-local `API_CATALOG.json` and `API_CATALOG.md`
files by `scripts/render_relution_openapi.py`.

Completeness is mechanical:

```text
catalog operation count
  = every fixed HTTP method Operation Object under every OpenAPI path
  + every OpenAPI 3.2 additionalOperations entry under those paths
  + every corresponding operation under top-level webhooks
  + every corresponding operation under recursively declared callbacks
```

Path-level metadata such as `parameters`, `summary`, and `$ref` is not counted as
an operation. The generator supports Swagger 2.0 and the OpenAPI 3.0, 3.1, and
3.2 feature sets. It renders both path-level and operation-level parameters,
security, effective request/response media types, request bodies, response
codes, server overrides/variables, callback lineage, and schema references. It
includes the source SHA-256 so the catalog can be tied to the exact export.

Run:

```sh
python3 scripts/render_relution_openapi.py \
  --spec .local/relution-contract/relution-openapi.json \
  --output .local/relution-contract/API_CATALOG.md \
  --json-output .local/relution-contract/API_CATALOG.json

python3 scripts/render_relution_openapi.py \
  --spec .local/relution-contract/relution-openapi.json \
  --output .local/relution-contract/API_CATALOG.md \
  --json-output .local/relution-contract/API_CATALOG.json \
  --check

python3 scripts/validate_machine_docs.py \
  --spec .local/relution-contract/relution-openapi.json \
  --catalog .local/relution-contract/API_CATALOG.json
```

If no target OpenAPI export is present, an exhaustive exact-path catalog is not
available. Do not fill the gap from search results, an SDK, a different server,
or a public example. Obtain the target export.

## How to use the generated catalog

Begin with `registries/manifest.json` and select a stable concept ID. Use its
discovery tags and terms to find candidates in the target-local
`.local/relution-contract/API_CATALOG.json`. A candidate becomes a usable
operation only after
its stable operation key and source fields are confirmed against the original
contract and recorded in a target binding tied to the source SHA-256.

Search broadly by concept, then narrow by operation evidence:

```sh
rg -n -i 'password|mfa|oidc|ldap' .local/relution-contract/API_CATALOG.md
rg -n -i 'setting|configuration|update|patch' .local/relution-contract/API_CATALOG.md
rg -n '^### [0-9]+\. ' \
  .local/relution-contract/API_CATALOG.md
rg -n -i 'password|mfa|oidc|ldap' \
  .local/relution-contract/API_CATALOG.json
```

For each candidate:

1. Match its tag and summary to the intended product concept record.
2. Confirm the operation key, surface, method, exact path, and source location.
3. Check whether it is global, system-organization, organization, user, group,
   or device scoped.
4. Inspect all path/query/header parameters and their required flags.
5. Open the original JSON and resolve request/response schema references.
6. Identify a read operation for current-state and read-back evidence.
7. Identify rollback: restore prior state, delete newly created resource, or run
   a documented compensating operation.
8. Check the target UI's audit-event description after a controlled test.

Only operations whose `surface` is `paths` are top-level client requests.
`webhooks` and `callbacks` are included to prove contract completeness but
describe provider-initiated requests; do not send them as Relution client calls.

Do not select an operation from its summary alone. Similar concepts can have
system and organization variants, legacy and current versions, or action and
configuration endpoints with very different effects.

## Operation-family checklist

When documenting or automating a domain, look for every applicable family. An
absent family is a contract fact; do not synthesize it.

| Family | Typical purpose | Safety checks |
| --- | --- | --- |
| Get/read | One resource or current settings | Stable ID, scope, redaction, read-back suitability |
| List/query/search | Collection discovery | Pagination, deterministic sort, filters, total count |
| Create | New resource or configuration | Required defaults, uniqueness, parent scope, cleanup |
| Update/replace | Change full state | PUT replacement semantics, revision fields, omitted fields |
| Patch | Change selected fields | Patch media type and allowed paths/fields |
| Delete | Remove state | Dependencies, irreversibility, retention, explicit approval |
| Action/command | Cause device/server activity | Asynchrony, idempotency, action status, device impact |
| Bulk action | Affect a set | Frozen target set, batch limit, partial failure, stop rule |
| Import/upload | Ingest files/data | File type/size, validation, async job, per-row results |
| Export/download | Produce data | PII, file retention, content type, pagination/snapshot |
| Publish/deploy | Make policy/app content active | Version, audience, schedule, rollback/unpublish behavior |
| Assign/unassign | Change relationships | Both object IDs, organization, inherited effects |
| Synchronize/migrate | Reconcile external or internal systems | Direction, deletion policy, dry run, job status, conflicts |
| Validate/test | Preflight configuration | Side effects, required permission, result interpretation |
| Status/audit | Observe processing and effects | Terminal states, correlation, retention window |

## Publicly documented endpoint examples

The following exact paths are present in Relution's official REST API guide and
are also represented in `registries/public-api-operations.json`. They are useful
for understanding conventions, but they are not a substitute for the target
catalog and do not constitute the full API.

| Method | Path | Documented purpose | Important note |
| --- | --- | --- | --- |
| `POST` | `/api/management/v1/csvImport/upload/users` | Upload a user-import CSV | Multipart schema must come from target |
| `POST` | `/api/management/v1/security/users/import/fromFile/{file_uuid}` | Start user import from uploaded file | Query options and result are versioned |
| `GET` | `/api/management/v1/csvImport/job/{job_uuid}` | Read CSV-import job status | Poll with a bound; `RUNNING` is not success |
| `POST` | `/api/management/v1/csvImport/job/{job_uuid}/entityStates/query` | Query per-entity import outcomes | Inspect partial failures |
| `POST` | `/api/management/v1/security/organizations/creationWizardRequests` | Submit an organization creation-wizard request | Public prose example must not replace schema |
| Public guide shows `GET`; confirm target | `/api/management/v2/devices/baseInfo/query` | Query device base information | The public method/body example is ambiguous across API generations |

The guide says the older synchronous user-import API was removed in Relution
5.34 and imports became background jobs. This is a concrete example of why an
operator or automation client must not retain an endpoint from prior knowledge.

## Product capability map

Relution's official audit-event reference supplies a broad map of observable
product operations. The entries below identify which concepts to search for in
the target catalog. They are **capabilities, not endpoint names**, and one
event can correspond to multiple API operations or UI workflows.

### Devices, enrollment, policies, and applications

| Domain | Read/query capabilities to locate | Mutation/action capabilities to locate |
| --- | --- | --- |
| Device inventory | Base info, details, ownership, user, compliance, actions, location, apps, updates, logs | Create/update/delete device records, migrate device, change ownership/user |
| Authorized devices | List/query authorization and compliance state | Refresh/update authorization, change compliance/action state, authorized-device settings |
| Device enrollment | Enrollment status, invitations, agreements, profiles | Android/Apple enrollment, auto-enrollment CRUD/import, create/delete enrollment, bulk enrollment |
| Apple automated enrollment | DEP/ADE accounts, profiles, assigned devices | Add/update/delete account/profile, assign profile, synchronize devices |
| Device groups | Group details, memberships, assigned policies | Create/update/delete group, add/remove devices, assign/unassign policies |
| Device actions | Action state/history | Create/cancel/delete action, bulk or group action |
| Device certificates | Installed/issued certificate information | Create, renew, revoke, remove, or deploy certificate where supported |
| Policies | Policy/version/configuration details, assignments, test results | Create/update/delete, import/export, publish, restore, test, assign/unassign |
| Off-time policies | Policy configuration and assignment | Create/update/delete, publish, assign/unassign |
| Applications | App metadata, versions, permissions, scripts, deployment state | Create/update/delete app/version, upload file, deploy/install/remove, set permissions/scripts |
| App categories | Category list and membership | Create/update/delete category, move/assign apps |
| Courses and lessons | Courses, lessons, templates, schedules | Create/update/delete, assign content/devices/users, update lesson schedule |
| Remote support | Support configuration/session status | Start/stop or configure remote support; TeamViewer integration operations |

### High-impact device command families

These are settings-adjacent but operationally destructive or user-visible. Their
presence in a catalog never authorizes execution.

| Command family | Required additional evidence |
| --- | --- |
| Locate device | Location/privacy authorization, platform support, action result and fresh location time |
| Lock or lost mode | Exact device and owner, recovery plan, platform-specific message/contact fields |
| Passcode reset/clear | Identity verification, platform semantics, secure delivery of any generated value |
| Enterprise/factory wipe | Immediate explicit approval, irreversibility statement, backup/ownership status |
| Delete/retire/unenroll | Difference among server deletion, MDM removal, retirement, and device-side effect |
| Install/remove app or profile | Version, target set, dependency and rollback behavior, action completion |
| Shared-device logout | Current session/user, data impact, action completion |
| Assign/change user | Old/new user IDs, ownership effects, policy/application consequences |

### Identity, organization, and access control

| Domain | Read/query capabilities to locate | Mutation/action capabilities to locate |
| --- | --- | --- |
| Users | Users, profiles, invitations, status, certificates | Create/update/delete, import, enable/disable, invite, reset/change password, certificate operations |
| Security groups | Groups, membership, effective scope | Create/update/delete, add/remove users, assign roles |
| Permission roles | Roles, permissions, assignments | Create/update/delete, import/export, assign/unassign |
| API access tokens | Token metadata and owner | Create, rename/update where supported, revoke/delete |
| MFA | Enrollment/status/methods | Enroll, reset, disable, or update MFA and policy settings |
| Organizations | Hierarchy, domains, settings, licenses | Creation wizard, create/update/delete, domain changes, management settings |
| Login management | Login/security state | Password policy, login policy, support access, system-security changes |
| Agreements | Enrollment agreement/version/status | Create/update/delete/publish/acceptance-related administration |

### Platform and service integrations

| Domain | Read/query capabilities to locate | Mutation/action capabilities to locate |
| --- | --- | --- |
| Android Enterprise | Binding/account/configuration/status | Configure, bind/unbind, synchronize, update Android Enterprise settings |
| Apple Push Notification service | APNs certificate/status | Upload/renew/delete certificate, change APNs settings |
| Apple School Manager | ASM account/configuration/sync status | Configure, update SFTP settings, synchronize |
| Apps and Books / VPP | Tokens, assets, licenses, users | Token CRUD/sync, asset/user/license assignment changes |
| Google Workspace | Configuration and synchronization state | Upload/change key, update settings, synchronize |
| Microsoft Entra ID | Configuration, mappings, sync state | Configure/update/delete settings or mappings, synchronize |
| LDAP | Configuration and sync state | Create/update/delete configuration, test/synchronize |
| OpenID Connect | Provider/client configuration | Create/update/delete OIDC settings |
| Conditional Access | Policies/state | Configure/update/delete conditional-access integration |
| OneRoster / Schul-Connex | Connector settings and sync state | Configure, synchronize/import, mapping changes |
| Secure Mail Gateway | Connection and policy state | Configure/update/delete gateway settings |
| TeamViewer | Connector/account configuration | Configure/update/delete and remote-session actions |
| Decon and other connectors | Connector state | Configure, import/synchronize, delete where supported |

### Certificates, files, automation, and workflows

| Domain | Read/query capabilities to locate | Mutation/action capabilities to locate |
| --- | --- | --- |
| Built-in/external CA | CA configuration, certificate templates, issued certificates | CA/template CRUD, issue/revoke/renew, connector settings |
| Organization certificates | Certificate metadata/expiry | Upload/create/update/delete/revoke |
| Files and fonts | Metadata, download, assignments | Upload/update/delete, assign/unassign |
| Scripts | Script metadata, versions, execution/action state | Create/update/delete, deploy/execute/cancel where supported |
| Workflow | Definitions, executions, state | Create/update/delete, start/cancel/retry where documented |
| CSV import | Uploaded files, jobs, entity states | Upload, start import, clean up according to target contract |
| Export | Audit/data export state | Start/generate/download export, retention cleanup |
| Geofences / iBeacon | Definitions, assignments, observations | Create/update/delete, assign/unassign |
| Language and translations | Available languages/custom translations | Add/update/delete translation or language settings |

### Settings and system administration

Search both organization-scoped and system-organization variants for these
domains. Similar display labels do not imply identical schemas.

| Settings domain | Mutations represented in official audit-event coverage | Risk cue |
| --- | --- | --- |
| General organization | Update organization identity, defaults, management behavior | Medium; may affect all org users/devices |
| System general | Update global system behavior | High; cross-organization |
| System security | Update global security controls | Critical; access/availability |
| Password policy | Update complexity, expiry, reuse, or related policy | Critical; login impact |
| MFA / login | Update MFA and login-management settings | Critical; lockout risk |
| IP allow/block rules | Create/update/delete network access rules | Critical; verify source IP and rollback first |
| Email | Update/delete SMTP/email settings | High; notification and credential sensitivity |
| Notifications | Update notification settings | Medium/high; external messages |
| Customizing | Custom CSS, logo, translation, branding | Medium; visible UI and hosted assets |
| App Store / client apps | Update store and client-application settings | High; distribution impact |
| Device custom fields | Create/update/delete field definitions | High; schema/data compatibility |
| Device ownership / lending | Update ownership and lending behavior | High; enrollment and data rules |
| MDM | Update MDM settings or migrate group behavior | Critical; fleet impact |
| Linux MDM | Update Linux-specific management settings | High; platform scope |
| Remote support | Update support configuration | High; remote-access trust boundary |
| Relution Shield | Update shield/security settings | Critical; security boundary |
| Support access | Update vendor/support settings | Critical; external access |
| Logging | Change/reset individual loggers or restore defaults | High; sensitive logs/performance |
| Audit | Retention, export, read, or cleanup operations | Critical for cleanup; evidence loss |
| License | License state and installation | High; feature availability |
| Secure Mail Gateway | Update gateway settings | Critical; mail/data path |
| Certificate services | CA, template, certificate, APNs settings | Critical; trust and enrollment |
| Platform integrations | Android Enterprise, Apple, Google, Microsoft settings | Critical; external identity/device control |

## Proving inventory completeness

Before claiming that the catalog contains every target operation:

1. Verify the export is from the intended host and reported version.
2. Record its SHA-256 from the catalog header.
3. Confirm `--check` succeeds without changing the generated file.
   The paired check must cover both Markdown and JSON output.
4. Confirm generation reports no malformed path item, callback, operation, or
   unsupported-version error. The generator fails closed rather than silently
   omit an operation-bearing external reference or unknown Path Item field.
5. Run the repository tests. They independently exercise local Path Item
   references, webhook/component-only OpenAPI 3.1 contracts, recursive
   callbacks, OpenAPI 3.2 `query` and `additionalOperations`, Swagger 2 global
   media types and operation scheme overrides, server variables, malformed
   operations, deterministic output, stale-output detection, and the
   no-argv/no-disk curl authentication helper:

   ```sh
   PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
   python3 scripts/validate_machine_docs.py \
     --spec .local/relution-contract/relution-openapi.json \
     --catalog .local/relution-contract/API_CATALOG.json
   ```

6. If the target Web API UI or an organization-approved OpenAPI validator shows
   an operation count, compare it with the catalog and resolve any difference.
   Do not use a naive direct-key count: local `$ref` path items and callback
   operations make that count incomplete.
7. Retain the original JSON for full schemas. A catalog can prove enumeration,
   not runtime permission or feature licensing.

A correct completeness statement is: "The catalog enumerates every Operation
Object reachable from paths, webhooks, and recursive callbacks in supported
contract SHA-256 `<digest>`, exported from target `<host>` running reported
version `<version>`; runtime availability and authorization were verified only
for `<operations actually tested>`."
