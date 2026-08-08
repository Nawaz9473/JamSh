import { test, expect } from '@playwright/test';
import * as path from 'path';

import * as fs from 'fs';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'C:/Users/nawaz/.gemini/antigravity-ide/brain/428b5a86-50af-43d1-9e29-475f07e98d54';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

test.use({
  viewport: { width: 1280, height: 800 },
});
test.setTimeout(60000);

test('E2EE Messaging Flow - Option 1 Web Verification', async ({ page }) => {
  const timestamp = Date.now();
  const userAEmail = `user_a_${timestamp}@test.com`;
  const userAUsername = `user_a_${timestamp}`;
  const userBEmail = `user_b_${timestamp}@test.com`;
  const userBUsername = `user_b_${timestamp}`;

  // 1. Navigate and clean storage
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
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_01_loaded.png') });

  // 2. Click Sign up link
  await page.getByText("Sign up", { exact: true }).click();
  await page.waitForTimeout(500);

  // 3. Signup User A
  await page.getByPlaceholder('you@example.com').fill(userAEmail);
  await page.getByPlaceholder('Full Name').fill('User A');
  await page.getByPlaceholder('Username').fill(userAUsername);
  await page.locator('select').nth(0).selectOption('1'); // Jan
  await page.locator('select').nth(1).selectOption('1'); // 1
  await page.locator('select').nth(2).selectOption('2000'); // 2000
  await page.getByPlaceholder('Password (Min 8 characters)').fill('password123');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_02_user_a_form.png') });
  
  await page.getByText('Sign up', { exact: true }).click();
  await page.waitForTimeout(4000); // Wait for signup

  // 4. View User A profile & Edit Bio
  await page.locator('text="Profile"').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_03_user_a_profile_initial.png') });

  await page.locator('text="Edit profile"').click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Bio').fill('Hello from User A!');
  await page.locator('text="Save"').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_04_user_a_profile_bio.png') });

  // 5. Log out
  await page.locator('text="Log out"').click();
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_05_logged_out.png') });

  // 6. Sign up User B
  await page.getByText("Sign up", { exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByPlaceholder('you@example.com').fill(userBEmail);
  await page.getByPlaceholder('Full Name').fill('User B');
  await page.getByPlaceholder('Username').fill(userBUsername);
  await page.locator('select').nth(0).selectOption('2'); // Feb
  await page.locator('select').nth(1).selectOption('15'); // 15
  await page.locator('select').nth(2).selectOption('1998'); // 1998
  await page.getByPlaceholder('Password (Min 8 characters)').fill('password123');
  
  await page.getByText('Sign up', { exact: true }).click();
  await page.waitForTimeout(4000);

  // 7. View User B profile & Edit Bio
  await page.locator('text="Profile"').click();
  await page.waitForTimeout(500);
  await page.locator('text="Edit profile"').click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Bio').fill('Hello from User B!');
  await page.locator('text="Save"').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_06_user_b_profile_bio.png') });

  // 8. Search for User A
  await page.locator('text="Search"').click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Type username or display name...').fill(userAUsername);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_07_search_results.png') });

  // Click View Profile next to user_a
  await page.locator('text="View"').first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_08_view_user_a_profile.png') });

  // Click Message to open chat room
  await page.locator('text="Message"').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_09_chat_opened.png') });

  // 9. Send E2EE Message from User B to User A
  await page.getByPlaceholder('Message...').fill('Hi User A, this is an E2E encrypted message!');
  await page.locator('.lucide-send').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_10_message_sent.png') });

  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // 11. Log in as User A
  await page.getByPlaceholder('you@example.com').fill(userAEmail);
  await page.getByPlaceholder("• • • • • • • •").fill('password123');
  await page.getByText('Log in', { exact: true }).click();
  await page.waitForTimeout(3000);

  // 12. Open chat room with User B via Search & view decrypted message
  const searchBtn = page.locator('.lucide-search').first();
  if (await searchBtn.isVisible()) {
    await searchBtn.click({ force: true });
  } else {
    await page.locator('text="Search"').first().click({ force: true });
  }
  await page.waitForTimeout(1000);

  await page.getByPlaceholder('Type username or display name...').fill(userBUsername);
  await page.waitForTimeout(1500);

  // Click Message/View button specifically within User B search result row
  const userBRow = page.locator('div').filter({ hasText: userBUsername }).first();
  const actionBtn = userBRow.locator('text=/Message|View/i').first();
  if (await actionBtn.isVisible()) {
    await actionBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }

  // If View opened profile page, click Message button on profile page
  const profileMsgBtn = page.getByText('Message', { exact: true }).first();
  if (await profileMsgBtn.isVisible()) {
    await profileMsgBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(4000);

  const acceptBtn = page.getByText('Accept', { exact: true }).first();
  if (await acceptBtn.isVisible()) {
    await acceptBtn.click({ force: true });
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_11_message_decrypted.png') });

  // Assert decrypted text is present on page
  await expect(page.getByText('Hi User A, this is an E2E encrypted message!', { exact: false }).last()).toBeVisible({ timeout: 15000 });
});
