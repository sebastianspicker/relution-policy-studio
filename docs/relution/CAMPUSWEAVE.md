# CampusWeave interface

CampusWeave is the browser interface for the checked-in university profile and
offline plan compiler. It runs locally and has no Relution connection.

## Start the service

From the repository root:

```sh
python3 -m campusweave
```

Open <http://127.0.0.1:8766>. The address and port are fixed.

## Workflow

The interface contains eight screens:

| Screen | Purpose |
| --- | --- |
| Overview | Show profile counts and the local-only boundary |
| Institution | Change the institution code and label |
| Organization | Review organization units and locations |
| Groups | Review group blueprints and target requirements |
| Policies | Review policy intent, prerequisites, platforms, and impact |
| Assignments | Review inert policy-to-group assignment intent |
| Readiness | Review blockers, unresolved inputs, and profile digest |
| Review | Validate and export profile, plan, or dry-run facts |

Routes use fragments such as
<http://127.0.0.1:8766/#assignments>. Selecting an organization, group, policy,
or assignment changes the detail view only.

The only editable profile fields are the institution code and label. Accepted
imports must match the checked-in reference profile after those two identity
fields are normalized. The interface does not accept arbitrary policies,
groups, notes, target identifiers, request bodies, approvals, or live results.

## Local API

The browser calls fixed endpoints on the loopback service:

| Method | Path |
| --- | --- |
| `GET` | `/api/v1/health` |
| `GET` | `/api/v1/reference` |
| `POST` | `/api/v1/compile-profile` |
| `POST` | `/api/v1/import-profile` |
| `POST` | `/api/v1/instantiate-profile` |

The service rejects other methods, routes, query strings, non-loopback request
origins, malformed JSON, duplicate keys, non-finite numbers, and request bodies
larger than 2 MiB.

## Persistence

The browser stores the last validated reference-derived profile under
`campusweave:v1:profile` in local storage. Stored JSON is limited to 2 MiB.
Import and reset require confirmation before replacing the stored profile.

Do not enter a credential, tenant identifier, or live organization identifier
in the institution fields.

## Exports

Profile and plan exports use canonical JSON. The plan is bound to the exact
profile digest, so plan export remains disabled until the current profile has
been exported.

Browser downloads cannot enforce file permissions. Set an exported plan to
mode `0600`, then validate the pair:

```sh
chmod 600 /path/to/university-plan.json
python3 scripts/campusweave_runtime.py plan validate \
  --profile /path/to/university-profile.json \
  --plan /path/to/university-plan.json
```

Plans and target-derived artifacts must remain outside the repository.

## Validation result

A successful interface validation proves that:

- the profile is an allowed reference-derived document;
- the plan matches the canonical profile digest;
- all 48 plan steps remain unbound;
- `execution_authorized` is false; and
- the dry-run reports zero network and mutation calls.

It does not prove target permissions, contract availability, inventory,
operation semantics, publication state, approval, read-back, audit evidence, or
rollback viability.

## Tests

```sh
python3 -m unittest tests/test_campusweave.py -v
node --test tests/test_campusweave_ui.mjs
```

Frontend architecture and manual browser checks are documented in
[`../FRONTEND.md`](../FRONTEND.md).
