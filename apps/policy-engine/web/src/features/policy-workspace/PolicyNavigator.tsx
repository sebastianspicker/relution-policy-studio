/** Filters and navigates workspace policies while retaining the active selection. */
import type { JSX } from "react";
import { PolicyNavigatorView, type PolicyNavigatorProps } from "./PolicyNavigatorView.js";
import { usePolicyNavigatorState } from "./usePolicyNavigatorState.js";

export type { PolicyNavigatorProps } from "./PolicyNavigatorView.js";

export function PolicyNavigator(props: PolicyNavigatorProps): JSX.Element {
  const state = usePolicyNavigatorState(props.policies, props.templatesByType);
  return <PolicyNavigatorView {...props} {...state} onCloseCreate={state.closeCreate} onQueryChange={state.setQuery} onToggleCreate={state.toggleCreate} />;
}
