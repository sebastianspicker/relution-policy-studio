# API contract, authentication, and request mechanics

## 1. Contract and version discovery

Treat a Relution API as an instance-specific, versioned contract. The same
product capability may move, split, change method, adopt a request body, or gain
new validation across releases. The official changelog records endpoint grouping
and breaking API changes, so the target's own OpenAPI document has precedence.

Capture the following before operation discovery:

```text
authorized_origin: https://mdm.example.invalid
effective_api_server: https://mdm.example.invalid[/contract/base-path]
relution_version: <reported by the target>
organization_id: <exact stable identifier>
organization_name: <display name used for human confirmation>
contract_file: .local/relution-contract/relution-openapi.json
contract_sha256: <from generated catalog>
operation_count: <from generated catalog>
```

Obtain the JSON through the target instance's Web API page. Relution's public
manual links a public Web API reference, but that reference requires
registration; it is not a substitute for a customer's deployment contract. If
the UI only renders an interactive page, use its documented download control or
the spec URL it displays. Do not try common Swagger/OpenAPI paths until one
works: a guessed URL can hit the wrong service, version, or access control.

The catalog generator accepts JSON Swagger 2.0 and OpenAPI 3.0, 3.1, and 3.2
documents. It resolves local operation-bearing references and fails closed on
external Path Item or Callback references because they could hide operations.
It preserves ordinary external schema/parameter/body references without fetching
them. Bundle operation-bearing references into the authorized export and retain
all referenced schema documents from the same source.

### Resolve the effective API server

Do not assume every operation uses the separately remembered instance root.
For OpenAPI 3.x, resolve the selected operation's server in this precedence
order:

1. operation-level `servers`;
2. Path Item `servers`;
3. top-level `servers`.

For Swagger 2.0, an Operation Object's `schemes` overrides top-level `schemes`;
combine the effective scheme with top-level `host` and `basePath`. If `host` is
omitted, resolve it from the authorized contract retrieval context. The catalog
renders both the top-level server and every operation scheme override.

The generated catalog displays contract-level servers, operation/path overrides,
and every Server Object variable's required default and enum. Resolve each
variable deliberately from the target contract and operator-approved deployment
context. A default is contract evidence, but it still must identify the intended
deployment. If a Server Object URL is relative, resolve it using the OpenAPI
document's exact base-URI rules (`$self` when the supported contract defines it,
otherwise the authorized retrieval URI as applicable) and have the operator
confirm the resulting full URL.

Record two distinct values:

```text
authorized_origin:     https://mdm.example.invalid
effective_api_server:  https://mdm.example.invalid/relution
```

The effective server may include a base path. It must resolve to the authorized
origin unless a second origin is explicitly authorized. Normalize only its
trailing slash; do not discard a base path. For a client-callable Path Object
key beginning with `/`, construct:

```sh
export RELUTION_API_SERVER='https://mdm.example.invalid/relution'
operation_path='/api/exact/path/from-target-catalog'
request_url="${RELUTION_API_SERVER%/}${operation_path}"
```

Do not send top-level webhook or callback operations as client requests; those
catalog surfaces describe requests initiated by the provider.

## 2. Authentication

Relution's official REST API guide documents user access tokens and the request
header `X-User-Access-Token`. A token is created in the user's profile under
**Access Token** and is displayed only once. Its effective permissions are those
of its owner, including organization restrictions.

Use a dedicated automation identity where possible. Give it only the roles
needed for the intended operation, set an expiration, and revoke/reissue the
token after role or account changes. A token cannot be recovered from Relution;
generate a replacement instead.

Load the token into an unexported variable in the current interactive zsh.
Keeping it unexported prevents unrelated child processes from inheriting it:

```zsh
set +x
typeset -g +x RELUTION_API_TOKEN
read -r -s 'RELUTION_API_TOKEN?Relution access token: '
printf '\n'
```

Source the repository's tested zsh wrapper. It supplies the header through a
pipe to curl's standard-input configuration, so the expanded token is neither a
curl process argument, exported environment value, nor disk-backed/persistent
config file. It disables ambient `.curlrc` configuration before loading the
pipe, bypasses proxies, and requires exactly one HTTPS URL within the explicitly
configured `RELUTION_API_SERVER` origin and base path. Its option allowlist
blocks redirects, TLS bypass, alternate authentication, generated libcurl
source, and ambiguous curl option forms.

```zsh
source scripts/relution_curl.zsh
```

`relution_curl` consumes standard input for its ephemeral curl configuration.
Provide request bodies with `--data-binary @file`, not `@-`. The wrapper permits
the documented `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` methods plus bounded
timeouts, `Accept` and `Content-Type` headers, file-based evidence output, and
the exact `%{http_code}` write-out template. Disable shell tracing before
defining or invoking it. Unset the secret after the task with
`unset RELUTION_API_TOKEN`.

Do not:

- put a literal token in a script, Markdown file, URL, shell history, request
  body, issue, chat transcript, screenshot, or generated artifact;
- use `curl -v`, `--trace`, shell tracing (`set -x`), or debug proxies with a
  live authorization header;
- send a customer token to the public demonstration service or a different
  Relution instance;
- store a token in an `.env` file or commit an OpenAPI export containing a live
  example credential.

Use the wrapper with the effective server resolved in the previous section and
explicit connection/overall bounds:

```zsh
relution_curl --fail-with-body --silent --show-error \
  --connect-timeout 10 \
  --max-time 60 \
  --request GET \
  --header 'Accept: application/json' \
  "${RELUTION_API_SERVER%/}/api/exact/path/from-target-catalog"
```

The placeholder path above is deliberately non-runnable. Replace it only with a
path verified in the generated catalog. Adjust the timeouts before the request
when the target contract, approved upload size, or operating window requires a
different finite bound. A timeout during a mutation makes the outcome unknown;
it does not prove the server made no change. This wrapper reduces ordinary
process-argument and disk exposure; it does not defend against a privileged
debugger or a compromised operator account.

In the interactive Web API UI, the security scheme may be named
`userAccessTokenAuth`. Authorizing there is useful for bounded manual validation,
but do not leave shared browser sessions authorized.

## 3. Resolving an operation

For every request, record an operation selection block:

```text
catalog_sha256: <digest>
operation_id:   <value or "not supplied by contract">
method:         GET|POST|PUT|PATCH|DELETE|QUERY|<exact additional method>
path_template:  /api/...
tag:            <catalog tag>
path_params:    name=value (source of identifier)
query_params:   name=value (why each is needed)
content_type:   application/json|multipart/form-data|...
request_schema: <component ref or inline schema>
success_codes:  <codes documented by the operation>
readback_op:    <method/path/operation ID>
```

Inspect both path-level and operation-level parameters. Resolve `$ref` entries
in the original JSON. Confirm required fields, enums, numeric bounds, string
formats, `readOnly`/`writeOnly`, nullable values, and whether unknown properties
are allowed. A catalog line is not enough to construct a write body.

### Identifier discipline

Resolve stable identifiers through a read or query operation. If a name returns
zero or multiple objects, stop. Record both the identifier and display name,
then read the identified object directly when the contract provides such an
operation. Never send a mutation based only on a list position, UI label, partial
match, or identifier copied from a different organization.

### Organization discipline

Relution is organization-aware. Establish organization scope using the target's
documented mechanism: token role, path parameter, query parameter, or request
field. Do not add an organization field merely because another endpoint uses
one. Before a mutation, make a read that proves the acting identity can see the
intended resource in the intended organization.

## 4. HTTP request construction

Use the exact media types in the target contract.

### JSON request template

Create request bodies in a temporary file so the proposed diff can be reviewed
without placing JSON or secrets in shell quoting. The body must contain only
fields allowed by the schema.

```zsh
request_file="$(mktemp -t relution-request.XXXXXX.json)"
# Populate request_file using the approved local editor.

relution_curl --fail-with-body --silent --show-error \
  --connect-timeout 10 \
  --max-time 60 \
  --request PATCH \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-binary "@${request_file}" \
  "${RELUTION_API_SERVER%/}/api/exact/path/from-target-catalog"
```

`PATCH` is only an example. Use it only when the target contract defines it. A
`PUT` commonly replaces a resource, so preserve all server-required fields and
never assume omitted fields remain unchanged. Remove the temporary request file
through the platform's approved recoverable cleanup process after evidence is
captured.

### Query and pagination bodies

Relution's public API guide shows query objects with fields such as `limit`,
`offset`, `getNonpagedCount`, `sortOrder`, and a nested `filter`. A representative
shape is:

```json
{
  "limit": 100,
  "offset": 0,
  "getNonpagedCount": true,
  "sortOrder": {
    "sortFields": [
      {"name": "modifiedDate", "ascending": true}
    ]
  },
  "filter": {
    "type": "logOp",
    "operation": "AND",
    "filters": []
  }
}
```

This is a shape example, not a universal schema. Field names, allowed sort keys,
filter operators, method, and maximum limit must come from the selected target
operation. The public device-base-info example is method/body ambiguous across
Relution generations, which is another reason to follow the instance contract.

For a traversal that can be claimed complete:

1. choose a deterministic, unique sort order if the operation supports one;
2. request the contract's permitted page size;
3. advance `offset` or the documented cursor by the number actually returned;
4. stop according to the documented total/next-cursor condition, not because an
   arbitrary page happened to be short unless the contract defines that rule;
5. deduplicate by a stable resource identifier;
6. bound pages and elapsed time to prevent an unbounded pagination loop;
7. report page count, returned count, and server-reported total separately.

If the contract provides neither a snapshot/cursor nor a deterministic unique
sort, concurrent collection changes can create omissions or duplicates under
offset pagination. In that case, bound and deduplicate the traversal but label
it a point-in-time best effort; do not claim a complete inventory. Ask for a
quiescent window or a contract-supported snapshot mechanism when completeness
is required.

Never turn a query result directly into bulk mutations. Re-resolve and re-read
each approved identifier immediately before its change.

### File uploads and asynchronous imports

The official Relution guide documents this user-import sequence for releases
from 5.34 onward:

1. `POST /api/management/v1/csvImport/upload/users` as multipart upload.
2. `POST /api/management/v1/security/users/import/fromFile/{file_uuid}` with
   documented query parameters such as `overwrite`, `role`, and `csvSeparator`.
3. `GET /api/management/v1/csvImport/job/{job_uuid}` until the job reaches a
   terminal state.
4. `POST /api/management/v1/csvImport/job/{job_uuid}/entityStates/query` to
   inspect entity-level outcomes.

These paths are a verified public example, not permission to run an import and
not proof that a target still exposes the same schemas. Confirm all four
operations in the target catalog first.

For any asynchronous operation:

- retain the returned job/action identifier;
- poll only the documented status operation;
- use a bounded interval, deadline, and maximum attempts;
- distinguish request acceptance from job completion;
- treat `RUNNING` as non-terminal and inspect all documented failure/partial
  states rather than assuming only `FINISHED` exists;
- inspect per-entity status for imports and bulk tasks;
- do not submit a second job merely because the first is slow;
- verify resulting resources independently after terminal success.

## 5. Responses and evidence

Do not hard-code generic success status codes. The selected operation's response
map is authoritative. Relution's logging-setting example, for instance,
documents HTTP `204` for a successful change; another operation may return a
resource with `200`/`201` or accept an asynchronous job.

Capture:

- UTC request time and a local correlation label that contains no secret;
- method and redacted URL (retain stable identifiers only when safe);
- expected statuses from the contract;
- observed status, response media type, and redacted body;
- response headers used for concurrency, pagination, request IDs, or rate limits;
- independent read-back operation and assertion;
- matching audit-log row.

Do not store complete device/user records when a field-level proof is enough.
Treat names, email addresses, serial numbers, hardware identifiers, locations,
installed-app inventories, certificates, and logs as sensitive operational data.

## 6. Concurrency and idempotency

If the contract documents an ETag, version, revision, or other optimistic-lock
field, preserve it and use the documented conditional mechanism. If it does not,
minimize the gap between read and write and read again immediately before a
high-risk change.

Safe retry rules:

- A transport failure before a response does not prove a mutation was not
  applied.
- Do not automatically retry `POST`, device actions, bulk operations, or any
  mutation whose idempotency is not explicitly established.
- Before retrying, read the resource or job/action state and search the audit log
  using time, actor, endpoint, and object context.
- Honor documented retry/rate-limit headers. Otherwise stop and report rather
  than inventing a delay policy.

## 7. Contract refresh triggers

Re-export and regenerate when any of these changes:

- target hostname or deployment;
- reported Relution version or patch level;
- server upgrade/rollback;
- enabled modules or licensed features;
- authentication scheme;
- the Web API UI displays a new contract;
- an operation returns an undocumented status or schema;
- the catalog's `--check` command fails.

Do not edit a generated catalog by hand. Fix the source export or generator and
regenerate it.
