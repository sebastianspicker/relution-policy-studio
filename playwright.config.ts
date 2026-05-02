import { defineConfig } from "@playwright/test";

const port = 8791;
const workspace = "/tmp/relution-policy-workbench-playwright";
const output = "/tmp/relution-policy-workbench-playwright-output.rexp";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `rm -rf ${workspace} ${output} && env -u FORCE_COLOR pnpm build && env -u FORCE_COLOR node dist/src/cli.js serve --workspace ${workspace} --out ${output} --host 127.0.0.1 --port ${String(port)} --key key123`,
    url: `http://127.0.0.1:${String(port)}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
