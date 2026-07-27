# Target OpenAPI input

Keep target OpenAPI exports and derived catalogs outside the public
documentation tree. Create the ignored local directory from the repository
root:

```sh
mkdir -p .local/relution-contract
```

Save the JSON OpenAPI or Swagger export from the explicitly authorized target
Relution instance as:

```text
.local/relution-contract/relution-openapi.json
```

Relution contracts are version-specific and deployment-specific. They can
contain customer hostnames, feature details, and example data. Do not commit the
export or its derived catalogs.

Obtain the export from the target instance's Web API view using its displayed
download control or source URL. Do not guess Swagger or OpenAPI URL patterns,
and do not use a public demonstration contract for a customer instance.

Validate that the saved file is JSON rather than an HTML login or error page:

```sh
python3 -m json.tool \
  .local/relution-contract/relution-openapi.json \
  >/dev/null
```

Generate and check the target-local catalog:

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

The checked-in files under `docs/relution/generated/` are public fail-closed
placeholders. They must not contain target server or operation metadata.

The renderer supports Swagger 2.0 and OpenAPI 3.0 through 3.2 JSON and makes no
network calls. It resolves local operation-bearing references and fails on
external Path Item or Callback references so hidden operations cannot be
omitted silently. The JSON catalog supplies digest-derived operation keys for
target bindings. The source contract remains authoritative for full schemas.
Retain externally referenced ordinary schemas from the same authorized contract
source and inspect them when constructing a request.
