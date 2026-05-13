import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppleCompatConfiguration } from "../../../../src/apple-compat.js";
import { MobileConfigFields } from "./MobileConfigFields.js";

describe("MobileConfigFields", () => {
  it("clears derived payload state when xml stays unsigned but becomes unparsable", () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const details = createAppleCompatConfiguration("associated-domains").details as Record<string, unknown>;
    const { container } = render(<MobileConfigFields details={details} onChange={onChange} onError={onError} />);
    const textarea = container.querySelector("textarea.mobileconfig-textarea");

    expect(textarea).toBeTruthy();

    fireEvent.change(textarea!, {
      target: {
        value: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          "<plist version=\"1.0\">",
          "<dict>",
          "<key>PayloadType</key>",
          "<string>Configuration</string>",
          "<key>PayloadContent</key>",
          "<array>",
          "<dict>",
          "<key>PayloadType</key>",
          "<string>com.apple.associated-domains</string>",
          "</array>",
          "</dict>",
          "</plist>",
        ].join("\n"),
      },
    });

    expect(onError).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rawContent: expect.stringContaining("com.apple.associated-domains"),
        payloadContent: {},
        secondLevelPayloadType: "",
        mobileConfigSignatureState: "signed-invalid",
      }),
    );
  });

  it("shows detected payload type as read-only display data", () => {
    const onChange = vi.fn();
    const details = createAppleCompatConfiguration("associated-domains").details as Record<string, unknown>;

    render(<MobileConfigFields details={details} onChange={onChange} onError={vi.fn()} />);

    const payloadTypeInput = screen.getByDisplayValue("com.apple.associated-domains");

    expect(payloadTypeInput.hasAttribute("readonly")).toBe(true);

    fireEvent.change(payloadTypeInput, {
      target: {
        value: "com.example.changed",
      },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports file parse errors without overwriting parent error state", async () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const details = createAppleCompatConfiguration("associated-domains").details as Record<string, unknown>;
    const { container } = render(<MobileConfigFields details={details} onChange={onChange} onError={onError} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File([
            [
              '<?xml version="1.0" encoding="UTF-8"?>',
              '<plist version="1.0">',
              "<dict>",
              "<key>PayloadType</key>",
              "<string>Configuration</string>",
              "<key>PayloadContent</key>",
              "<array>",
              "<dict>",
              "<key>PayloadType</key>",
              "<string>com.apple.associated-domains</string>",
              "</array>",
              "</dict>",
              "</plist>",
            ].join("\n"),
          ], "broken.mobileconfig", { type: "application/xml" }),
        ],
      },
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });
});
