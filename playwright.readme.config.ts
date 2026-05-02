import { defineConfig } from "@playwright/test";

const port = 8792;
const workspace = "/tmp/relution-policy-workbench-readme-tour";
const output = "/tmp/relution-policy-workbench-readme-tour-output.rexp";

export default defineConfig({
  testDir: "./e2e-readme",
  fullyParallel: false,
  reporter: "list",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    trace: "off",
  },
  webServer: {
    command: `rm -rf ${workspace} ${output} && env -u FORCE_COLOR pnpm build && env -u FORCE_COLOR node dist/src/cli.js serve --workspace ${workspace} --out ${output} --host 127.0.0.1 --port ${String(port)} --key key123`,
    url: `http://127.0.0.1:${String(port)}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
