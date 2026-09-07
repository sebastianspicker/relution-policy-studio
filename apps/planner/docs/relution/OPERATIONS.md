# Relution operations runbook

This runbook applies only to a separately authorized Relution request made with
`scripts/relution_curl.zsh`. CampusWeave does not invoke this helper, turn an
offline plan into a request, or establish authority to operate a target.

## Preconditions

Before any live request, record and verify:

- the explicitly authorized HTTPS origin and effective API server, including
  any base path;
- the target's reported version and exact exported OpenAPI JSON;
- organization ID and display name;
- acting identity, token owner, role, and intended permission scope;
- stable resource ID and requested field-level outcome;
- exact catalog operation, source schema, expected statuses, and concurrency
  mechanism;
- independent read-back and audit checks; and
- recovery or rollback procedure.

If any item is missing, stop or perform only separately authorized, bounded
read-only discovery. Public examples, search results, another server's
contract, and repository concept records are not substitutes for the target's
contract.

## Contract preparation

Export the OpenAPI JSON through the target's documented Web API interface and
generate the private catalog as described in [the contract pack](README.md).
Confirm the catalog source digest, server metadata, version, and operation
count. A changed digest invalidates existing bindings and pending change plans.

For OpenAPI 3.x, resolve servers in operation, Path Item, then document order.
For Swagger 2.0, account for operation-level schemes, top-level host, and base
path. Resolve variables and relative URLs from the exact contract context.
The final request URL must remain within the explicitly authorized origin and
base path.

Do not send top-level webhook or callback operations as client requests. Do not
guess an endpoint, method, parameter, identifier, media type, or success code.

## Authentication helper

Relution's official REST API documentation identifies the
`X-User-Access-Token` header and notes that tokens are displayed once. Use a
dedicated, least-privileged, expiring identity where the target supports it.

In a trusted interactive zsh with tracing disabled, set the exact server and
read the token into an unexported variable:

```zsh
set +x
typeset -g RELUTION_API_SERVER='https://mdm.example.invalid'
typeset -g +x RELUTION_API_TOKEN
read -r -s 'RELUTION_API_TOKEN?Relution access token: '
printf '\n'
source scripts/relution_curl.zsh
```

The helper rejects an exported or line-bearing token, requires an unambiguous
HTTPS server, permits exactly one URL within that server, disables ambient curl
configuration and proxies, and accepts only a narrow set of methods, headers,
timeouts, file bodies, evidence outputs, and HTTP-status output. It pipes the
token to curl's standard-input configuration, so the expanded value is not a
curl argument, exported environment value, or persistent configuration file.

The helper does not protect against a compromised shell, account, executable,
or privileged debugger. Use a trusted `PATH`. Never enable shell tracing, curl
verbose/trace output, redirects, TLS bypass, automatic retries, or a proxy for
an authenticated request. Unset the token when finished:

```zsh
unset RELUTION_API_TOKEN
```

## Select one operation

Record the catalog digest, operation key and ID, surface, method, path, scope
parameters, request media type and schema, documented success responses, and
read-back operation. Resolve every reference in the source contract.

Use stable IDs obtained through an authorized read. A label, list position,
partial match, or identifier copied from another organization is not enough.
Prove organization scope through the mechanism documented by the operation:
token role, server, path, query, header, or request body.

Inspect `readOnly`, `writeOnly`, nullable, required, immutable, enum, and
unknown-property behavior. Treat omission, `null`, empty strings, empty lists,
zero, and `false` as distinct until the target contract proves otherwise. A
`PUT` can replace an entire resource; do not submit a list projection as a full
resource.

## Classify impact

Use the highest applicable tier from the machine change-plan schema:

- Tier 0 is read-only observation. It requires an authorized target and
  organization plus a bounded request.
- Tier 1 is one local, reversible, non-security preference. It requires an
  exact request, captured before state, read-back, and a rollback value.
- Tier 2 is organization-wide or externally visible. It requires immediate
  scope confirmation, impact review, and a tested or documented restore.
- Tier 3 affects authentication, security, trust, or an external integration.
  It requires immediate approval, a second access path, and maintenance and
  credential-safe recovery plans.
- Tier 4 is system-wide, fleet, bulk, destructive, or irreversible. Approval
  must name exact targets and effects; a canary, stop threshold, monitoring
  owner, and tested recovery or explicit irreversibility are required.

Configuration and execution are separate effects. Updating a policy definition,
publishing it, assigning it, and observing device application require separate
operation bindings and approval decisions. The same separation applies to
imports, synchronization jobs, device commands, certificate rotation, and
other asynchronous or externally visible work.

## Plan and execute a bounded change

Copy `templates/settings-change-plan.json` into an approved private location.
Bind it to the exact catalog and validate it with:

```sh
python3 scripts/validate_machine_docs.py \
  --spec /approved/private/path/relution-openapi.json \
  --catalog /approved/private/path/API_CATALOG.json \
  --bindings /approved/private/path/target-bindings.json \
  --change-plan /approved/private/path/settings-change-plan.json
```

Structural validation is not authorization. Before a mutation:

1. Read the exact resource with the same identity and scope.
2. Capture only the fields needed for the diff, rollback, and concurrency.
3. Re-read immediately before a high-impact change; stop if state changed.
4. Prepare the smallest schema-valid body in a private file. Never copy a
   masked or write-only secret from a response.
5. Obtain the approval required for the recorded target, one-object effect,
   risk tier, and time window.
6. Send one bounded request using the exact contract method, media type, path,
   timeouts, and precondition headers.
7. Do not automatically retry a mutation or resubmit an import, job, or device
   action when the response is missing or ambiguous.

Use `--data-binary @file`, never `@-`, because the helper reserves standard
input for its ephemeral authentication configuration. Supply finite
`--connect-timeout` and `--max-time` values. Evidence output paths are the
operator's responsibility and must remain private.

## Verify the result

Record transport, server acceptance, read-back, audit, functional check, and
rollback as separate results. A documented `2xx` response can mean acceptance
rather than completion.

1. Match the status and media type to the exact operation contract.
2. Validate the response schema when a body is documented.
3. Read the resource directly rather than relying on a cached or list view.
4. Compare intended fields and important unchanged fields.
5. For asynchronous work, poll only the documented status operation with a
   finite interval, deadline, attempt count, and known terminal states.
6. Match an audit record by actor, time, method, endpoint, organization,
   status, and object context.
7. Perform the smallest separately authorized functional or canary check.

Use `outcome_unknown` when a request may have left the client but its effect
cannot be proven. Preserve sanitized context and inspect state, job/action
status, and audit evidence before considering any retry.

## Pagination, bulk work, and sensitive evidence

Bound every page count, item count, cursor, and elapsed time. Prefer a stable,
unique sort or contract-provided snapshot/cursor. If offset pagination runs
against a changing collection, deduplicate by stable ID and describe the result
as a best effort rather than a complete inventory.

Before bulk work, materialize and review the exact stable-ID set, obtain
approval naming its count and effect, run one canary, and define a stop threshold
for failures, unexpected responses, compliance changes, or action backlog.

Never store tokens, passwords, private keys, certificates, customer contracts,
complete user/device exports, locations, hardware identifiers, application
inventories, logs, or audit exports in the tracked repository. If field-level
evidence is enough, do not retain a full record.

## Stop conditions

Stop when:

- target, organization, resource, desired state, authority, or effect is
  ambiguous;
- the contract is missing, stale, malformed, or from another host/version;
- the operation, schema, scope, identifier, or success response is inferred;
- a binding uses another digest or a provider-initiated surface;
- a secret appears in output or an artifact;
- runtime behavior contradicts the contract;
- state changes after planning, a canary fails, or a bound is exceeded;
- a mutation outcome is unknown;
- read-back or audit evidence contradicts the requested result; or
- required rollback, recovery, or second access is unavailable.

Do not broaden scope, disable TLS checks, follow an authenticated redirect,
switch to a broader identity, probe legacy paths, or repeat a mutation to make
progress.

## Troubleshooting

- A stale catalog check requires regenerating both catalogs, reviewing the
  operation diff, and invalidating old bindings and plans.
- When an expected capability is absent, confirm the target version and modules
  and record the capability as absent. Do not import another server's path.
- When reads work but writes are forbidden, request only the exact missing
  permission. Do not switch to an administrator token.
- A `3xx` or HTML response requires checking origin, base path, content type,
  and SSO/proxy behavior without forwarding the token.
- For `409` or `412`, re-read state and revision and re-plan. Do not force an
  overwrite.
- For `429`, honor target guidance, stop fan-out, and report partial scope.
- Treat a `5xx`, timeout, or lost connection during mutation as an unknown
  outcome. Inspect state, job/action status, and audit before retrying.

## External references

- [Relution REST API](https://hub.relution.io/en/docs/settings/rest-api/)
- [Relution audit log](https://hub.relution.io/en/docs/settings/audit/)
- [Relution vulnerability disclosure policy](https://hub.relution.io/en/docs/product-info/disclosure/)
- [OpenAPI specifications](https://spec.openapis.org/oas/)
- [curl command-line manual](https://curl.se/docs/manpage.html)

These sources provide product and protocol context. The exact target contract
and authorized observations remain authoritative for one deployment.
