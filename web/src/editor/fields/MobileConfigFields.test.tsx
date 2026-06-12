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
        value: brokenMobileConfigXml(),
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
          new File([brokenMobileConfigXml()], "broken.mobileconfig", { type: "application/xml" }),
        ],
      },
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("broken.mobileconfig")).toBeNull();
  });

  it("shows the selected file name only after content is read and applied", async () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const details = createAppleCompatConfiguration("associated-domains").details as Record<string, unknown>;
    const { container } = render(<MobileConfigFields details={details} onChange={onChange} onError={onError} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File([String(details.rawContent ?? "")], "valid.mobileconfig", { type: "application/xml" }),
        ],
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(screen.getByText("valid.mobileconfig")).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports file read rejection without replacing the previously applied file name", async () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const details = createAppleCompatConfiguration("associated-domains").details as Record<string, unknown>;
    const { container } = render(<MobileConfigFields details={details} onChange={onChange} onError={onError} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File([String(details.rawContent ?? "")], "valid.mobileconfig", { type: "application/xml" }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByText("valid.mobileconfig")).toBeTruthy());
    onChange.mockClear();

    const unreadable = new File(["ignored"], "unreadable.mobileconfig", { type: "application/xml" });
    vi.spyOn(unreadable, "text").mockRejectedValueOnce(new Error("read denied"));

    fireEvent.change(input, {
      target: {
        files: [unreadable],
      },
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Mobileconfig file read failed: read denied"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("valid.mobileconfig")).toBeTruthy();
    expect(screen.queryByText("unreadable.mobileconfig")).toBeNull();
  });
});

function brokenMobileConfigXml(): string {
  return [
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
  ].join("\n");
}
