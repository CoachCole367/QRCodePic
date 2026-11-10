import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:4173",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
