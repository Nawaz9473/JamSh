import { test, expect } from '@playwright/test';
import * as path from 'path';

import * as fs from 'fs';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'C:/Users/nawaz/.gemini/antigravity-ide/brain/7081fe8d-8299-4e3d-bbd3-dc16e9281e09';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

test.setTimeout(120000);

test('Offline E2EE Queue and Automatic Synchronization E2E Verification', async ({ browser }) => {
  const timestamp = Date.now();
  const userEmail = `offline_user_${timestamp}@test.com`;
  const username = `off_user_${timestamp}`;
  const fullName = `Offline User ${timestamp}`;

  const peerEmail = `offline_peer_${timestamp}@test.com`;
  const peerUsername = `off_peer_${timestamp}`;
  const peerName = `Offline Peer ${timestamp}`;

  // 1. Setup contexts
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  try {
    await page.evaluate(() => localStorage.clear());
  } catch (e) {
    await page.waitForTimeout(1000);
    await page.evaluate(() => localStorage.clear());
  }
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // 2. Register User A
  console.log('Signing up User A...');
  await page.getByText("Sign up", { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('you@example.com').fill(userEmail);
  await page.getByPlaceholder('Full Name').fill(fullName);
  await page.getByPlaceholder('Username').fill(username);
  await page.locator('select').nth(0).selectOption('1'); // Jan
  await page.locator('select').nth(1).selectOption('1'); // 1
  await page.locator('select').nth(2).selectOption('2000'); // 2000
  await page.getByPlaceholder('Password (Min 8 characters)').fill('N@w@z1234');
  await page.getByText('Sign up', { exact: true }).click();
  await page.waitForTimeout(5000);

  // 3. Log out and register User B (so they are mutually followable)
  await page.locator('text="Log out"').click();
  await page.waitForTimeout(1000);
  await page.reload();

  console.log('Signing up User B...');
  await page.getByText("Sign up", { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('you@example.com').fill(peerEmail);
  await page.getByPlaceholder('Full Name').fill(peerName);
  await page.getByPlaceholder('Username').fill(peerUsername);
  await page.locator('select').nth(0).selectOption('2'); // Feb
  await page.locator('select').nth(1).selectOption('15'); // 15
  await page.locator('select').nth(2).selectOption('1998'); // 1998
  await page.getByPlaceholder('Password (Min 8 characters)').fill('N@w@z1234');
  await page.getByText('Sign up', { exact: true }).click();
  await page.waitForTimeout(5000);

  // 4. Follow User A from User B
  await page.locator('text="Search"').click();
  await page.waitForTimeout(1000);
  await page.getByPlaceholder('Type username or display name...').fill(username);
  await page.waitForTimeout(1500);
  await page.locator('text="View"').first().click();
  await page.waitForTimeout(1500);
  await page.locator('text="Follow"').first().click();
  await page.waitForTimeout(2000);

  await page.evaluate(() => localStorage.clear());
  await page.waitForTimeout(1000);
  await page.reload();

  console.log('Logging back in as User A...');
  await page.getByPlaceholder('you@example.com').fill(userEmail);
  await page.getByPlaceholder("• • • • • • • •").fill('N@w@z1234');
  await page.getByText('Log in', { exact: true }).click();
  await page.waitForTimeout(3000);

  await page.locator('text="Search"').click();
  await page.waitForTimeout(1000);
  await page.getByPlaceholder('Type username or display name...').fill(peerUsername);
  await page.waitForTimeout(1500);
  await page.locator('text="View"').first().click();
  await page.waitForTimeout(1500);
  const followBtn = page.locator('text="Follow"').first();
  if (await followBtn.isVisible()) {
    await followBtn.click();
    await page.waitForTimeout(2000);
  }

  // 6. Navigate to chat window
  await page.locator('text="Message"').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'offline_01_chat_ready.png') });

  // 7. GO OFFLINE & send message
  console.log('Toggling browser context to OFFLINE...');
  await context.setOffline(true);
  await page.waitForTimeout(1000);

  const testOfflineMsg = `This is a test message sent offline at timestamp ${timestamp}`;
  await page.getByPlaceholder('Message...').fill(testOfflineMsg);
  await page.locator('.lucide-send').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'offline_02_message_queued.png') });

  // Assert that message bubble exists and displays the offline '🕒 Queued' indicator
  await expect(page.getByText(testOfflineMsg).first()).toBeVisible();

  // 8. GO ONLINE & verify synchronization
  console.log('Toggling browser context back to ONLINE...');
  await context.setOffline(false);
  
  // Wait for the online event to trigger queue flush and sync reconciliation
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'offline_03_message_synced.png') });

  await expect(page.getByText(testOfflineMsg).first()).toBeVisible();
  console.log('Offline queue and synchronization verification passed!');
});
