import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBaselineTemplateRuleset } from "./baseline-template-client.js";
import { readJsonResponse } from "./editor-utils.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchBaselineTemplateRuleset", () => {
  it("preserves non-JSON error responses from the template endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("gateway unavailable", { status: 502 }));

    await expect(fetchBaselineTemplateRuleset({ platform: "IOS", tier: 1, shape: "modules" })).rejects.toThrow(/gateway unavailable/u);
  });

  it("rejects empty template endpoint responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await expect(fetchBaselineTemplateRuleset({ platform: "IOS", tier: 1, shape: "modules" })).rejects.toThrow(/empty response/u);
  });
});

describe("readJsonResponse", () => {
  it("rejects empty response bodies instead of fabricating an empty object", async () => {
    await expect(readJsonResponse(new Response(""))).rejects.toThrow(/empty response/u);
  });
});
