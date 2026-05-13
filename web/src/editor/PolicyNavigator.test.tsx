import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigurationTemplate } from "../../../src/templates.js";
import type { WorkspacePolicy } from "../../../src/workspace.js";
import { PolicyNavigator, policyMatches } from "./PolicyNavigator.js";

describe("PolicyNavigator", () => {
  it("matches policies by visible configuration metadata", () => {
    const templatesByType = new Map([[template.type, template]]);

    expect(policyMatches(policy, "iOS Restrictions", templatesByType)).toBe(true);
    expect(policyMatches(policy, "com.apple.applicationaccess", templatesByType)).toBe(true);
    expect(policyMatches(policy, "Release baseline", templatesByType)).toBe(true);
    expect(policyMatches(policy, "unrelated setting", templatesByType)).toBe(false);
  });

  it("filters by configuration metadata and exposes an empty search result", () => {
    render(
      <PolicyNavigator
        policies={[policy]}
        selection={undefined}
        templatesByType={new Map([[template.type, template]])}
        newPolicyName=""
        newPolicyPlatform="IOS"
        creatablePlatforms={["IOS", "ANDROID", "MACOS", "WINDOWS"]}
        isDirty={false}
        onSelect={vi.fn()}
        onMoveConfiguration={vi.fn()}
        onRemoveConfiguration={vi.fn()}
        onNewPolicyNameChange={vi.fn()}
        onNewPolicyPlatformChange={vi.fn()}
        onCreatePolicy={vi.fn()}
      />,
    );

    const search = screen.getByLabelText(/search policies/i);
    fireEvent.change(search, { target: { value: "iOS Restrictions" } });
    expect(screen.getByRole("heading", { name: /mobile baseline/i })).toBeTruthy();

    fireEvent.change(search, { target: { value: "does not exist" } });
    expect(screen.getByText(/no policies match the search/i)).toBeTruthy();
  });
});

const template: ConfigurationTemplate = {
  type: "IOS_RESTRICTION",
  label: "iOS Restrictions",
  schemaName: "iosRestriction",
  platforms: ["IOS"],
  enrollmentTypes: [],
  multiConfig: false,
  portalHidden: false,
  placeholders: [],
  required: [],
  fields: [],
};

const policy: WorkspacePolicy = {
  path: "policies/policy_mobile_baseline.json",
  document: {
    name: "Mobile baseline",
    platform: "IOS",
    versions: [
      {
        name: "Release baseline",
        configurations: [
          {
            details: {
              type: "IOS_RESTRICTION",
              displayName: "Restrictions",
              secondLevelPayloadType: "com.apple.applicationaccess",
            },
          },
        ],
      },
    ],
  },
};
