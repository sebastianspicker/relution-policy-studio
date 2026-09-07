/** Owns local policy-navigation query, creation visibility, and filtered policy indices. */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConfigurationTemplate } from "../../../../src/browser/workspace.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { policyMatches } from "./policy-navigation-search.js";

export interface IndexedWorkspacePolicy {
  readonly policy: WorkspacePolicy;
  readonly policyIndex: number;
}

export interface PolicyNavigatorState {
  readonly query: string;
  readonly showCreate: boolean;
  readonly visiblePolicies: readonly IndexedWorkspacePolicy[];
  readonly closeCreate: () => void;
  readonly setQuery: (query: string) => void;
  readonly toggleCreate: () => void;
}

export function usePolicyNavigatorState(
  policies: readonly WorkspacePolicy[],
  templatesByType: ReadonlyMap<string, ConfigurationTemplate>,
): PolicyNavigatorState {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(policies.length === 0);

  useEffect(() => {
    if (policies.length === 0) {
      setShowCreate(true);
    }
  }, [policies.length]);

  const visiblePolicies = useMemo(
    () => policies
      .map((policy, policyIndex) => ({ policy, policyIndex }))
      .filter(({ policy }) => policyMatches(policy, query, templatesByType)),
    [policies, query, templatesByType],
  );
  const closeCreate = useCallback(() => setShowCreate(false), []);
  const toggleCreate = useCallback(() => setShowCreate((visible) => !visible), []);

  return { closeCreate, query, setQuery, showCreate, toggleCreate, visiblePolicies };
}
