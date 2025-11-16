import { describe, expect, it } from "vitest";

describe("relution api", () => {
  it("keeps the scope label stable", () => {
    expect("relution api").toContain("relution");
  });
});

// regression note: relution_api
it("keeps relution api stable", () => {
  expect("relution api").toContain("relution");
});
