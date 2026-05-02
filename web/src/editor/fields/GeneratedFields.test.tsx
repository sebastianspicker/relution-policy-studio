import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeneratedFields } from "./GeneratedFields.js";

describe("GeneratedFields", () => {
  it("writes real null for nullable enum selections", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "mode",
              label: "Mode",
              kind: "string",
              required: false,
              nullable: true,
              enumValues: ["AUTO", "MANUAL"],
              enumLabels: { AUTO: "Auto", MANUAL: "Manual" },
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", mode: "AUTO" }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__NULL__" } });

    expect(onChange).toHaveBeenCalledWith({ type: "TEST", uuid: "DETAIL-1", mode: null });
  });

  it("renders field-scoped JSON editors for opaque object settings instead of raw JSON-only fallback", () => {
    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "nested",
              label: "Nested",
              kind: "object",
              required: false,
              nullable: false,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", nested: { mode: "guided" } }}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByText(/some settings are only available in raw json/i)).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe('{\n  "mode": "guided"\n}');
    expect(screen.getByRole("button", { name: /apply nested json/i })).toBeTruthy();
  });

  it("applies object JSON edits through the native GUI", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "nested",
              label: "Nested",
              kind: "object",
              required: false,
              nullable: false,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", nested: { mode: "guided" } }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: '{\n  "mode": "json"\n}' } });
    fireEvent.click(screen.getByRole("button", { name: /apply nested json/i }));

    expect(onChange).toHaveBeenCalledWith({
      type: "TEST",
      uuid: "DETAIL-1",
      nested: { mode: "json" },
    });
  });

  it("applies array-of-object JSON edits through the native GUI", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "whitelistedApps",
              label: "Whitelisted Apps",
              kind: "array",
              itemKind: "object",
              required: false,
              nullable: false,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{
          type: "TEST",
          uuid: "DETAIL-1",
          whitelistedApps: [{ packageName: "com.example.one" }],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: '[\n  {\n    "packageName": "com.example.two"\n  }\n]' },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply whitelisted apps json/i }));

    expect(onChange).toHaveBeenCalledWith({
      type: "TEST",
      uuid: "DETAIL-1",
      whitelistedApps: [{ packageName: "com.example.two" }],
    });
  });

  it("applies array-of-number edits through the native GUI", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "levels",
              label: "Levels",
              kind: "array",
              itemKind: "number",
              required: false,
              nullable: false,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", levels: [1, 2] }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3\n4" } });

    expect(onChange).toHaveBeenCalledWith({
      type: "TEST",
      uuid: "DETAIL-1",
      levels: [3, 4],
    });
  });

  it("rejects non-integer values for integer fields", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "priority",
              label: "Priority",
              kind: "integer",
              required: false,
              nullable: false,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", priority: 1 }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12.5" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects non-integer entries in integer arrays", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "levels",
              label: "Levels",
              kind: "array",
              itemKind: "integer",
              required: false,
              nullable: false,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", levels: [1, 2] }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3\n4abc" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders supported nested DNS settings in the GUI instead of warning about raw JSON only", () => {
    render(
      <GeneratedFields
        template={createDnsTemplate()}
        details={{
          type: "APPLE_DNS_SETTINGS",
          uuid: "DETAIL-1",
          dnsSettings: {
            dnsProtocol: "HTTPS",
            serverAddresses: ["1.1.1.1", "8.8.8.8"],
            supplementalMatchDomains: ["example.test", "*.corp.test"],
          },
        }}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByText(/some settings are only available in raw json/i)).toBeNull();
    expect(screen.getByText("DNS Settings")).toBeTruthy();
    expect(screen.getAllByRole("textbox").some((element) => (element as HTMLTextAreaElement).value === "1.1.1.1\n8.8.8.8")).toBe(true);
    expect(screen.getAllByRole("textbox").some((element) => (element as HTMLTextAreaElement).value === "example.test\n*.corp.test")).toBe(true);
  });

  it("writes nested string arrays and preserves unknown sibling keys", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={createDnsTemplate()}
        details={{
          type: "APPLE_DNS_SETTINGS",
          uuid: "DETAIL-1",
          dnsSettings: {
            serverAddresses: ["1.1.1.1"],
            customResolver: true,
          },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("1.1.1.1"), { target: { value: "1.1.1.1\n8.8.8.8" } });

    expect(onChange).toHaveBeenCalledWith({
      type: "APPLE_DNS_SETTINGS",
      uuid: "DETAIL-1",
      dnsSettings: {
        serverAddresses: ["1.1.1.1", "8.8.8.8"],
        customResolver: true,
      },
    });
  });

  it("prunes empty parent objects when clearing the last nested optional field", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={createDnsTemplate()}
        details={{
          type: "APPLE_DNS_SETTINGS",
          uuid: "DETAIL-1",
          dnsSettings: {
            serverAddresses: ["1.1.1.1"],
          },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("1.1.1.1"), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith({
      type: "APPLE_DNS_SETTINGS",
      uuid: "DETAIL-1",
    });
  });

  it("offers an explicit clear action for optional primitive fields", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "nickname",
              label: "Nickname",
              kind: "string",
              required: false,
              nullable: false,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", nickname: "alpha" }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /clear nickname/i }));

    expect(onChange).toHaveBeenCalledWith({ type: "TEST", uuid: "DETAIL-1" });
  });

  it("offers an explicit null action for nullable primitive fields", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={{
          type: "TEST",
          label: "Test",
          schemaName: "TestSchema",
          platforms: ["IOS"],
          enrollmentTypes: [],
          multiConfig: false,
          portalHidden: false,
          placeholders: [],
          required: [],
          fields: [
            {
              path: "threshold",
              label: "Threshold",
              kind: "number",
              required: true,
              nullable: true,
              enumValues: [],
              enumLabels: {},
            },
          ],
        }}
        details={{ type: "TEST", uuid: "DETAIL-1", threshold: 42 }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /set threshold to null/i }));

    expect(onChange).toHaveBeenCalledWith({ type: "TEST", uuid: "DETAIL-1", threshold: null });
  });

  it("renders nested object-list editors when array<object> metadata is present", () => {
    const template = createObjectListTemplate();
    const rulesField = template.fields.find((field) => field.path === "rules");

    expect(rulesField?.itemFields?.map((field) => field.path)).toEqual([
      "name",
      "priority",
      "weights",
      "options",
      "options.enabled",
      "options.matchDomains",
    ]);

    render(
      <GeneratedFields
        template={template}
        details={{
          type: "TEST_OBJECT_LIST",
          uuid: "DETAIL-1",
          rules: [
            {
              name: "alpha",
              priority: 7,
              weights: [1.5, 2.25],
              options: {
                enabled: true,
                matchDomains: ["example.test", "*.corp.test"],
              },
            },
          ],
        }}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByText(/some settings are only available in raw json/i)).toBeNull();
    expect(screen.getByText("Rules")).toBeTruthy();
    expect(screen.getByText("Options")).toBeTruthy();
    expect(screen.getByDisplayValue("alpha")).toBeTruthy();
    expect(screen.getByDisplayValue("7")).toBeTruthy();
    expect(screen.getAllByRole("textbox").some((element) => (element as HTMLTextAreaElement).value === "1.5\n2.25")).toBe(true);
    expect(screen.getAllByRole("textbox").some((element) => (element as HTMLTextAreaElement).value === "example.test\n*.corp.test")).toBe(
      true,
    );
  });

  it("updates nested array<object> rows and preserves unknown sibling keys", () => {
    const onChange = vi.fn();

    render(
      <GeneratedFields
        template={createObjectListTemplate()}
        details={{
          type: "TEST_OBJECT_LIST",
          uuid: "DETAIL-1",
          rules: [
            {
              name: "alpha",
              priority: 7,
              weights: [1.5],
              options: {
                enabled: true,
              },
              untouched: "keep-me",
            },
          ],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("1.5"), { target: { value: "1.5\n2.25" } });
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(onChange).toHaveBeenNthCalledWith(1, {
      type: "TEST_OBJECT_LIST",
      uuid: "DETAIL-1",
      rules: [
        {
          name: "alpha",
          priority: 7,
          weights: [1.5, 2.25],
          options: {
            enabled: true,
          },
          untouched: "keep-me",
        },
      ],
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      type: "TEST_OBJECT_LIST",
      uuid: "DETAIL-1",
      rules: [],
    });
  });
});

function createDnsTemplate() {
  return {
    type: "APPLE_DNS_SETTINGS",
    label: "Apple DNS Settings",
    schemaName: "AppleDnsSettingsConfiguration",
    platforms: ["IOS", "MACOS"],
    enrollmentTypes: ["IOS", "MACOS"],
    multiConfig: true,
    portalHidden: false,
    placeholders: [],
    required: [],
    fields: [
      {
        path: "dnsSettings",
        label: "DNS Settings",
        kind: "object",
        required: false,
        nullable: false,
        enumValues: [],
        enumLabels: {},
      },
      {
        path: "dnsSettings.dnsProtocol",
        label: "DNS Settings DNS Protocol",
        kind: "string",
        required: false,
        nullable: false,
        enumValues: ["HTTPS", "TLS"],
        enumLabels: { HTTPS: "HTTPS", TLS: "TLS" },
      },
      {
        path: "dnsSettings.serverAddresses",
        label: "DNS Settings Server Addresses",
        kind: "array",
        required: false,
        nullable: false,
        enumValues: [],
        enumLabels: {},
        itemKind: "string",
      },
      {
        path: "dnsSettings.serverUrl",
        label: "DNS Settings Server URL",
        kind: "string",
        required: false,
        nullable: false,
        enumValues: [],
        enumLabels: {},
      },
      {
        path: "dnsSettings.supplementalMatchDomains",
        label: "DNS Settings Supplemental Match Domains",
        kind: "array",
        required: false,
        nullable: false,
        enumValues: [],
        enumLabels: {},
        itemKind: "string",
      },
      {
        path: "prohibitDisablement",
        label: "Prohibit Disablement",
        kind: "boolean",
        required: false,
        nullable: false,
        enumValues: [],
        enumLabels: {},
      },
    ],
  };
}

function createObjectListTemplate() {
  return {
    type: "TEST_OBJECT_LIST",
    label: "Test Object List",
    schemaName: "TestObjectListConfiguration",
    platforms: ["IOS"],
    enrollmentTypes: [],
    multiConfig: false,
    portalHidden: false,
    placeholders: [],
    required: [],
    fields: [
      {
        path: "rules",
        label: "Rules",
        kind: "array",
        required: false,
        nullable: false,
        enumValues: [],
        enumLabels: {},
        itemKind: "object",
        itemFields: [
          {
            path: "name",
            label: "Name",
            kind: "string",
            required: false,
            nullable: false,
            enumValues: [],
            enumLabels: {},
          },
          {
            path: "priority",
            label: "Priority",
            kind: "integer",
            required: false,
            nullable: false,
            enumValues: [],
            enumLabels: {},
          },
          {
            path: "weights",
            label: "Weights",
            kind: "array",
            required: false,
            nullable: false,
            enumValues: [],
            enumLabels: {},
            itemKind: "number",
          },
          {
            path: "options",
            label: "Options",
            kind: "object",
            required: false,
            nullable: false,
            enumValues: [],
            enumLabels: {},
          },
          {
            path: "options.enabled",
            label: "Options Enabled",
            kind: "boolean",
            required: false,
            nullable: false,
            enumValues: [],
            enumLabels: {},
          },
          {
            path: "options.matchDomains",
            label: "Options Match Domains",
            kind: "array",
            required: false,
            nullable: false,
            enumValues: [],
            enumLabels: {},
            itemKind: "string",
          },
        ],
      },
    ],
  };
}
