# Catalog notes

CampusWeave can render an OpenAPI document exported from an explicitly
authorized Relution target into paired Markdown and JSON operation catalogs.
This is a local review and validation workflow. It does not authenticate to,
discover, or mutate a target.

## Local workflow

Store the target export and derived catalogs under the ignored
`.local/relution-contract/` directory. Render the catalog from the exact input
document, then verify the output still matches that input:

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
```

Run `python3 scripts/validate_machine_docs.py` after editable installation for
the checked-in schemas,
registries, templates, bindings, and fail-closed catalog placeholder.

## Checked-in catalog

`docs/relution/generated/API_CATALOG.md` and `API_CATALOG.json` intentionally
remain `not_generated`. They are not examples of a live target and must not be
replaced with target-derived data. See the
[Relution handbook](relution/README.md) for the evidence and storage boundary.
