# Compiler checks

CampusWeave compiles a deterministic, digest-bound offline plan from a valid
Reference University profile. A successful validation proves only local
artifact consistency. It does not prove target access, current inventory,
request semantics, or device outcomes.

Run adapter commands after `python3 -m pip install --editable .`.

## Profile and plan checks

```sh
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status
```

For a reference-derived profile, instantiate it in a private temporary
directory, build a plan, then validate and inspect it:

```sh
campusweave_work_dir=$(mktemp -d)

python3 scripts/campusweave_runtime.py profile instantiate \
  --institution-code example-u \
  --institution-label "Example University" \
  --output "$campusweave_work_dir/example-u-profile.json"

python3 scripts/campusweave_runtime.py plan build \
  --profile "$campusweave_work_dir/example-u-profile.json" \
  --output "$campusweave_work_dir/example-u-plan.json"

python3 scripts/campusweave_runtime.py plan validate \
  --profile "$campusweave_work_dir/example-u-profile.json" \
  --plan "$campusweave_work_dir/example-u-plan.json"

python3 scripts/campusweave_runtime.py dry-run \
  --profile "$campusweave_work_dir/example-u-profile.json" \
  --plan "$campusweave_work_dir/example-u-plan.json"
```

The runtime rejects non-reference-derived changes, writes plans with mode
`0600`, and refuses to replace an existing artifact. Full repository checks
are listed in [CONTRIBUTING.md](../CONTRIBUTING.md).
