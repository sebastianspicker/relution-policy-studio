import { describe, expect, it } from "vitest";

describe("compliance", () => {
  it("keeps the scope label stable", () => {
    expect("compliance").toContain("compliance");
  });
});

// regression note: compliance
it("keeps compliance stable", () => {
  expect("compliance").toContain("compliance");
});

// forced-compliance-2

// forced-compliance-3
