const { defineConfig, devices } = require('@playwright/test');

const port = process.env.PORT || 3210;
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node src/server.js',
    url: baseURL,
    // Always test a freshly started copy of the current code.
    reuseExistingServer: false,
    env: { PORT: String(port) },
  },
});
