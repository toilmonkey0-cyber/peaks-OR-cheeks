import { defineConfig } from "@playwright/test";
export default defineConfig({
  // without this, Playwright's default testMatch also sweeps up the vitest unit
  // tests (src/**/*.test.tsx), which cannot run under the Playwright runner
  testDir: "./e2e",
  use: { baseURL: "http://localhost:4173" },
  webServer: { command: "npm run build && npm run preview", port: 4173, reuseExistingServer: true },
});
