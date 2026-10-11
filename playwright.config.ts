import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, workers: 1, timeout: 30000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: {width: 1440, height: 1000},
    trace: 'retain-on-failure', launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    } },
  webServer: { command: 'npm run demo -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
