# Relution Policy Studio naming migration

The unified local `campusweave-monorepo` application is now **Relution Policy Studio**, a local planning and policy workbench for Relution. Its intended repository/directory slug is `relution-policy-studio`; publication is a separate step. The original standalone CampusWeave and REXP Studio repositories are outside this change.

Use `pnpm studio` to launch the unified application. `pnpm campusweave` invokes exactly the same launcher; `pnpm planner` and `pnpm rexp` retain their original component entry points.

Existing projects require no conversion or relocation. The default `~/.local/share/campusweave` data directory, `/api/campusweave` routes, `campusweave:theme` and other storage keys, project/export identifiers, `.rexp` archives, workspace/sidecar schemas, component package names, and journal/recovery contracts are unchanged. Only the private root package identity changes.

Historical source names, imported Git histories, licenses, recorded migration hashes, original design concepts and dated validation evidence retain their original identity. Current workbench titles, accessible labels, preset descriptions, launcher output and maintained product guidance use the new name. Historical preset snapshots keep their identifiers and display metadata to preserve evidence digests.

Relution Policy Studio is independent of Relution. Local planning and authoring remain local; Relution queries are read-only, optional Zammad ticket creation requires an explicit reviewed action, and MDM generation remains LAB-only. Local validation confers no deployment authority.
