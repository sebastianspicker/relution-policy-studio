# CampusWeave university profile

`desired-state.json` is the active, institution-neutral university profile. It
models organization units, campus locations, functional cohorts, layered
policies, group blueprints, rollout rings, and activation gates without target
identifiers, credentials, payloads, or executable operations. Its offline
compiler produces 48 abstract, unresolved intents: seven group-scope
blueprints, fifteen policy definitions, fifteen explicitly blocked publication
prerequisites, and eleven assignment intents. None is a target resource plan.

The checked-in example is **Reference University**
(`institution_code: university`). A real institution may use another lowercase namespace, but
the package must use that exact namespace consistently:

- `package.package_id` is `<institution_code>-relution-desired-state-v1`;
- the sole organization root is `ou.<institution_code>`;
- policy IDs begin `<institution_code>-policy.`;
- workflow IDs begin `<institution_code>.`; and
- `commit_boundary.target_local_root` is `private/<institution_code>`.

The validator rejects mismatches, target data, secrets, URLs, executable
fields, and unbound activation claims. The profile is therefore safe to review
and compile into an offline abstract-intent plan, but does not authorize any
live Relution mutation.

Run the offline validation from the repository root:

```sh
python3 scripts/campusweave_runtime.py profile validate
python3 scripts/campusweave_runtime.py profile status
```

Instantiate a separate commit-safe proposal and compile an owner-only offline
plan without contacting a Relution instance:

```sh
python3 scripts/campusweave_runtime.py profile instantiate \
  --institution-code example-u \
  --institution-label "Example University" \
  --output /approved/local/path/example-u-profile.json

python3 scripts/campusweave_runtime.py plan build \
  --profile /approved/local/path/example-u-profile.json \
  --output /approved/private/path/example-u-plan.json

python3 scripts/campusweave_runtime.py dry-run \
  --profile /approved/local/path/example-u-profile.json \
  --plan /approved/private/path/example-u-plan.json
```

`plan build` creates an owner-only `0600` plan. Validation and dry-run require
that private mode by default. `--allow-nonprivate` is an unsafe local-only
opt-out for a plan with no target evidence. Target-context evidence is separate
from this public profile and must remain below the context's private
`evidence_root`.

See the [runtime contract](../../UNIVERSITY_RUNTIME.md) for the artifact layers
and the explicit v1 non-goals.
