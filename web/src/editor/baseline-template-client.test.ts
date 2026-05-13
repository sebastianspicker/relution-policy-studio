import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBaselineTemplateRuleset } from "./baseline-template-client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchBaselineTemplateRuleset", () => {
  it("preserves non-JSON error responses from the template endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("gateway unavailable", { status: 502 }));

    await expect(fetchBaselineTemplateRuleset({ platform: "IOS", tier: 1, shape: "modules" })).rejects.toThrow(/gateway unavailable/u);
  });
});
