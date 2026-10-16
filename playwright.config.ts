import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE ?? "http://localhost:8101",
  },
});
