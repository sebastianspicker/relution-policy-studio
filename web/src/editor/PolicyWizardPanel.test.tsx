import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PolicyWizardPanel } from "./PolicyWizardPanel.js";
import { createEditorControllerStub, installFetchMock } from "./useEditorController.test-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PolicyWizardPanel", () => {
  it("shows a guided baseline preview and applies the selected template", async () => {
    installFetchMock();
    const controller = createEditorControllerStub();

    render(<PolicyWizardPanel controller={controller} />);

    expect(await screen.findByRole("heading", { name: /policy wizard/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /1\. scope/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /2\. security tier/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /3\. preview and apply/i })).toBeTruthy();
    expect(screen.getByText(/3 policies, 3 rules ready/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /replace workspace with selected baseline/i }));

    await waitFor(() => expect(controller.applyBaselineTemplate).toHaveBeenCalledWith({
      platform: "IOS",
      tier: 3,
      shape: "modules",
    }));
  });

  it("shows BSI/CIS/Vendor source checkboxes all checked by default", async () => {
    installFetchMock();
    const controller = createEditorControllerStub();

    render(<PolicyWizardPanel controller={controller} />);

    await screen.findByRole("heading", { name: /1\. scope/i });

    const bsiBox = screen.getByRole("checkbox", { name: /^bsi$/i }) as HTMLInputElement;
    const cisBox = screen.getByRole("checkbox", { name: /^cis$/i }) as HTMLInputElement;
    const vendorBox = screen.getByRole("checkbox", { name: /^vendor$/i }) as HTMLInputElement;

    expect(bsiBox.checked).toBe(true);
    expect(cisBox.checked).toBe(true);
    expect(vendorBox.checked).toBe(true);
  });

  it("source filter affects expert coverage and preset selection", async () => {
    installFetchMock();
    const controller = createEditorControllerStub();

    render(<PolicyWizardPanel controller={controller} />);

    fireEvent.click(await screen.findByRole("tab", { name: /expert selection/i }));
    await screen.findByLabelText(/3 of 4 settings selected/i);

    // Uncheck BSI — tier 3 has only BSI-sourced settings, so selection should drop to 0.
    fireEvent.click(screen.getByRole("checkbox", { name: /^bsi$/i }));

    expect(screen.getByLabelText(/0 of 4 settings selected/i)).toBeTruthy();
  });

  it("filters expert settings, exposes coverage, and applies selected settings", async () => {
    installFetchMock();
    const controller = createEditorControllerStub();

    render(<PolicyWizardPanel controller={controller} />);

    fireEvent.click(await screen.findByRole("tab", { name: /expert selection/i }));

    expect(await screen.findByLabelText(/3 of 4 settings selected/i)).toBeTruthy();
    expect(screen.getByText(/selected baseline coverage/i)).toBeTruthy();
    expect(screen.getByText(/current workspace compliance/i)).toBeTruthy();
    expect(screen.getAllByText(/BSI bsi-ios-passcode/i).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/search settings/i), { target: { value: "no matching setting" } });
    expect(screen.getByText(/no settings match the current search/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/search settings/i), { target: { value: "passcode" } });
    expect(screen.getAllByText(/IOS_PASSCODE/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(screen.getByLabelText(/0 of 4 settings selected/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /replace workspace with expert selection/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    fireEvent.click(screen.getByRole("button", { name: /replace workspace with expert selection/i }));

    await waitFor(() => expect(controller.applyExpertBaselineSelection).toHaveBeenCalledOnce());
    const ruleset = vi.mocked(controller.applyExpertBaselineSelection).mock.calls[0]?.[0];
    expect(ruleset?.policies.map((policy) => policy.name).sort()).toEqual([
      "iOS Tier 3 Baseline - iOS Passcode",
      "iOS Tier 3 Baseline - iOS Restriction",
      "iOS Tier 3 Baseline - iOS Update",
    ]);
  });

  it("applies the filtered guided preview as an expert ruleset", async () => {
    installFetchMock();
    const controller = createEditorControllerStub();

    render(<PolicyWizardPanel controller={controller} />);

    await screen.findByText(/3 policies, 3 rules ready/i);
    fireEvent.click(screen.getByRole("checkbox", { name: /^cis$/i }));

    expect(screen.getByText(/3 \/ 3 rules \(BSI\+Vendor filtered\), 3 policies/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /replace workspace with selected baseline/i }));

    await waitFor(() => expect(controller.applyExpertBaselineSelection).toHaveBeenCalledOnce());
    expect(controller.applyBaselineTemplate).not.toHaveBeenCalled();
    const ruleset = vi.mocked(controller.applyExpertBaselineSelection).mock.calls[0]?.[0];
    expect(ruleset?.policies).toHaveLength(3);
  });

  it("treats an empty source selection as no selected baseline", async () => {
    installFetchMock();
    const controller = createEditorControllerStub();

    render(<PolicyWizardPanel controller={controller} />);

    await screen.findByText(/3 policies, 3 rules ready/i);
    fireEvent.click(screen.getByRole("checkbox", { name: /^bsi$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^cis$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^vendor$/i }));

    expect(screen.getByText(/Select at least one source-backed setting before applying this baseline/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /replace workspace with selected baseline/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
