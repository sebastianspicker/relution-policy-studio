import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  APPLE_COMPAT_SETTINGS,
  createAppleCompatConfiguration,
  extractAppleCompatPayloadBodyJson,
  type AppleCompatSetting,
} from "../../../../src/apple-compat.js";
import { AppleCompatFields } from "./AppleCompatFields.js";

describe("AppleCompatFields", () => {
  it("preserves blank optional numeric fields while still accepting zero and positive values", () => {
    const setting = createOptionalNumericSetting();
    withAppleCompatSetting(setting, () => {
      let currentDetails = createAppleCompatConfiguration(setting.id).details as Record<string, unknown>;
      const onError = vi.fn();
      const onChange = vi.fn((nextDetails: Record<string, unknown>) => {
        currentDetails = nextDetails;
      });
      const view = render(<AppleCompatFields setting={setting} details={currentDetails} onChange={onChange} onError={onError} />);

      expect(getPayloadBody(setting, currentDetails)).toEqual({
        OptionalCount: 7,
        OptionalRatio: 1.5,
      });

      fireEvent.change(getFieldNumberInput("Optional count"), { target: { value: "" } });
      expect(getPayloadBody(setting, currentDetails)).toEqual({ OptionalRatio: 1.5 });

      view.rerender(<AppleCompatFields setting={setting} details={currentDetails} onChange={onChange} onError={onError} />);
      fireEvent.change(getFieldNumberInput("Optional count"), { target: { value: "0" } });
      expect(getPayloadBody(setting, currentDetails)).toEqual({
        OptionalCount: 0,
        OptionalRatio: 1.5,
      });

      view.rerender(<AppleCompatFields setting={setting} details={currentDetails} onChange={onChange} onError={onError} />);
      fireEvent.change(getFieldNumberInput("Optional count"), { target: { value: "12.5" } });
      expect(getPayloadBody(setting, currentDetails)).toEqual({
        OptionalCount: 0,
        OptionalRatio: 1.5,
      });

      view.rerender(<AppleCompatFields setting={setting} details={currentDetails} onChange={onChange} onError={onError} />);
      fireEvent.change(getFieldNumberInput("Optional ratio"), { target: { value: "" } });
      expect(getPayloadBody(setting, currentDetails)).toEqual({ OptionalCount: 0 });

      view.rerender(<AppleCompatFields setting={setting} details={currentDetails} onChange={onChange} onError={onError} />);
      fireEvent.change(getFieldNumberInput("Optional ratio"), { target: { value: "2.25" } });
      expect(getPayloadBody(setting, currentDetails)).toEqual({
        OptionalCount: 0,
        OptionalRatio: 2.25,
      });
      expect(onError).not.toHaveBeenCalled();
    });
  });
});

function withAppleCompatSetting(setting: AppleCompatSetting, run: () => void): void {
  APPLE_COMPAT_SETTINGS.push(setting);
  try {
    run();
  } finally {
    const index = APPLE_COMPAT_SETTINGS.findIndex((entry) => entry.id === setting.id);
    if (index >= 0) {
      APPLE_COMPAT_SETTINGS.splice(index, 1);
    }
  }
}

function getFieldNumberInput(fieldTitle: string): HTMLInputElement {
  return within(getFieldContainer(fieldTitle)).getByRole("spinbutton");
}

function getFieldContainer(fieldTitle: string): HTMLElement {
  const label = screen.getByText(fieldTitle);
  const container = label.closest(".field, .checkbox-field");
  if (container === null) {
    throw new Error(`Missing field container for ${fieldTitle}`);
  }
  return container as HTMLElement;
}

function getPayloadBody(setting: AppleCompatSetting, details: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(extractAppleCompatPayloadBodyJson(details, setting)) as Record<string, unknown>;
}

function createOptionalNumericSetting(): AppleCompatSetting {
  return {
    id: "test-optional-numeric",
    label: "Optional Numeric",
    payloadType: "com.example.optional-numeric",
    platforms: ["IOS"],
    status: "mobileconfig-backed",
    jamfFeature: "Optional numeric profile payload",
    relutionTransportType: "APPLE_MOBILECONFIG",
    description: "",
    sourceUrls: ["https://example.invalid/profile"],
    builder: "generic-json",
    fields: [
      {
        id: "payloadKeysJson",
        label: "Payload keys JSON",
        kind: "json",
        description: "",
        defaultValue: JSON.stringify({ OptionalCount: 7, OptionalRatio: 1.5 }, null, 2),
      },
      {
        id: "optionalCount",
        label: "Optional count",
        kind: "integer",
        description: "",
        defaultValue: undefined,
        payloadKey: "OptionalCount",
      },
      {
        id: "optionalRatio",
        label: "Optional ratio",
        kind: "number",
        description: "",
        defaultValue: undefined,
        payloadKey: "OptionalRatio",
      },
    ],
  };
}
