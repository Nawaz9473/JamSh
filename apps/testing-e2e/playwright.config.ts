import { defineConfig } from '@playwright/test';
import ws from 'ws';

// Polyfill WebSocket constructor for Node.js environments lacking native implementation
global.WebSocket = ws as any;

export default defineConfig({
  testDir: '.',
  timeout: 45000,
  expect: {
    timeout: 5000
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'C:/Users/nawaz/.gemini/antigravity-ide/brain/428b5a86-50af-43d1-9e29-475f07e98d54/playwright-report', open: 'never' }],
    ['json', { outputFile: 'C:/Users/nawaz/.gemini/antigravity-ide/brain/428b5a86-50af-43d1-9e29-475f07e98d54/playwright-report/results.json' }]
  ],
  use: {
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev --workspace @jamsh/web',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 60000
  }
});
