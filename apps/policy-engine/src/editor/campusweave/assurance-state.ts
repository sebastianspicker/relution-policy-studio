/** Binds project review decisions to the currently validated assurance artifacts. */
import { currentAssuranceDigest } from "../../assurance/assurance-catalog-loader.js";
import type { CampusWeaveProject } from "../../contracts/campusweave.js";
import type { EditorRequestContext } from "../editor-server-contract.js";

export function campusWeaveAssuranceDigest(context: EditorRequestContext, project?: CampusWeaveProject): string | undefined {
  const runtime = context.runtimeState.campusweave;
  const active = project ?? (runtime?.activeProjectId === undefined ? undefined : runtime.store.get(runtime.activeProjectId));
  return currentAssuranceDigest(active?.assurance_reviews ?? [], context.options.assuranceRootDir === undefined
    ? {} : { rootDir: context.options.assuranceRootDir });
}
