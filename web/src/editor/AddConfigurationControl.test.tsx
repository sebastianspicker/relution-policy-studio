import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddConfigurationControl } from "./AddConfigurationControl.js";

describe("AddConfigurationControl", () => {
  it("does not offer single-instance native templates that already exist", () => {
    render(
      <AddConfigurationControl
        availableTemplates={[
          {
            type: "NATIVE_SINGLE",
            label: "Single Native",
            schemaName: "SingleNative",
            platforms: ["IOS"],
            enrollmentTypes: [],
            multiConfig: false,
            portalHidden: false,
            placeholders: [],
            required: [],
            fields: [],
          },
          {
            type: "NATIVE_MULTI",
            label: "Multi Native",
            schemaName: "MultiNative",
            platforms: ["IOS"],
            enrollmentTypes: [],
            multiConfig: true,
            portalHidden: false,
            placeholders: [],
            required: [],
            fields: [],
          },
        ]}
        presentNativeTypes={["NATIVE_SINGLE"]}
        availableAppleCompatSettings={[]}
        availableAppleSchemaProfiles={[]}
        customSettingsAvailable={false}
        selectedType=""
        query=""
        group="all"
        onSelectedTypeChange={vi.fn()}
        onQueryChange={vi.fn()}
        onGroupChange={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.queryByRole("option", { name: /single native/i })).toBeNull();
    expect(screen.getByRole("option", { name: /multi native/i })).toBeTruthy();
    expect(screen.getByLabelText(/configuration template/i)).toBeTruthy();
  });
});
