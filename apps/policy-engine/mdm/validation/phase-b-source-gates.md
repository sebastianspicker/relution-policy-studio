# Phase B source gates

Status: `REFERENCE_VALIDATED` source contract; not approved for production.

Phase B sources use JSON Schema draft 2020-12 in `mdm/schemas/`. Every source
record must be machine-valid, have a unique policy ID, use the naming convention
`<PLATFORM>-<MODEL>-<PURPOSE>-L<LAYER>-LAB-v<MAJOR>`, and declare
`production_ready: false`. `LAB` is the only permitted ring in source records.

`APPROVED` means the process or design decision has approval; it does not prove
a payload. `REFERENCE_VALIDATED` means the source shape/reference was checked
against available material. `NOT_EVIDENCED` means a tenant, model, capability or
Lab result has not been supplied. None is authorisation for production use.

Before any generated import unit exists, validate source YAML against its
schema, source/control references, uniqueness, placeholder/secret absence,
platform/model applicability, conflict matrix and deterministic ordering. Then
prove installed-version schema validation, import/export round trip, device
effective state and rollback on a pseudonymous Lab device. Promote a record
only through explicit evidence fields in the generated manifest.
