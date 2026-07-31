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
  reporter: 'list',
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
