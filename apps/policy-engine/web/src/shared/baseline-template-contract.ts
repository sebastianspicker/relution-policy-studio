/** Stable baseline-selection contract shared by application composition and assurance. */
export type BaselineExpertApplyRuleset = {
  readonly version: 1;
  readonly name: string;
  readonly policies: readonly {
    readonly platform: string;
    readonly name: string;
    readonly description?: string;
    readonly rules: readonly { readonly id: string; readonly title: string; readonly informational: boolean; readonly reason?: string; readonly sourceRules?: readonly unknown[]; readonly mappings: readonly unknown[]; }[];
  }[];
};
