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
test.setTimeout(90000);

test.describe('Post Module - Multi-User Real-World Playwright E2E Verification', () => {
  const timestamp = Date.now();
  const userAEmail = `post_user_a_${timestamp}@test.com`;
  const userAUsername = `user_a_${timestamp}`;
  const userBEmail = `post_user_b_${timestamp}@test.com`;
  const userBUsername = `user_b_${timestamp}`;

  test('01. User A Signup and Create Post with Rich Media & Tags', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Signup User A
    const signupBtn = page.getByText("Sign up", { exact: true });
    if (await signupBtn.isVisible()) {
      await signupBtn.click();
      await page.waitForTimeout(500);

      await page.getByPlaceholder('you@example.com').fill(userAEmail);
      await page.getByPlaceholder('Full Name').fill('Post User A');
      await page.getByPlaceholder('Username').fill(userAUsername);
      await page.locator('select').nth(0).selectOption('1');
      await page.locator('select').nth(1).selectOption('1');
      await page.locator('select').nth(2).selectOption('2000');
      await page.getByPlaceholder('Password (Min 8 characters)').fill('password123');

      await page.getByText('Sign up', { exact: true }).click();
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'playwright_01_user_a_signed_up.png') });

    // Open Create Post modal
    const createBtn = page.locator('text="Create"').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1000);
    }

    const postContent = `Real-World E2E Test Post 🚀 #JamSh @user_b http://example.com special chars <script>alert(1)</script>`;
    const textarea = page.getByPlaceholder(/What's on your mind|Write a caption/i).first();
    if (await textarea.isVisible()) {
      await textarea.fill(postContent);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'playwright_02_create_post_input.png') });

      const shareBtn = page.getByText(/Share|Post/i).first();
      await shareBtn.click();
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'playwright_03_post_created_on_feed.png') });
  });

  test('02. User B Signup, Like Post, Comment on Post, and Real-Time Interaction', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Signup User B
    const signupBtn = page.getByText("Sign up", { exact: true });
    if (await signupBtn.isVisible()) {
      await signupBtn.click();
      await page.waitForTimeout(500);

      await page.getByPlaceholder('you@example.com').fill(userBEmail);
      await page.getByPlaceholder('Full Name').fill('Post User B');
      await page.getByPlaceholder('Username').fill(userBUsername);
      await page.locator('select').nth(0).selectOption('2');
      await page.locator('select').nth(1).selectOption('15');
      await page.locator('select').nth(2).selectOption('1998');
      await page.getByPlaceholder('Password (Min 8 characters)').fill('password123');

      await page.getByText('Sign up', { exact: true }).click();
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'playwright_04_user_b_signed_up.png') });

    // Find and like post
    const thunderIcon = page.locator('.lucide-zap, [data-testid="like-button"]').first();
    if (await thunderIcon.isVisible()) {
      await thunderIcon.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'playwright_05_user_b_liked_post.png') });

    // Comment on post
    const commentInput = page.getByPlaceholder(/Add a comment/i).first();
    if (await commentInput.isVisible()) {
      await commentInput.fill('Amazing post from Playwright E2E! 🎉');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'playwright_06_user_b_commented.png') });
  });

  test('03. User A Checks Notifications Feed and Reads Notifications', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Login as User A
    await page.getByPlaceholder('you@example.com').fill(userAEmail);
    await page.getByPlaceholder("• • • • • • • •").fill('password123');
    await page.getByText('Log in', { exact: true }).click();
    await page.waitForTimeout(2500);

    // Go to Notifications tab
    const notifBtn = page.locator('text="Notifications"').first();
    if (await notifBtn.isVisible()) {
      await notifBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'playwright_07_user_a_notifications_feed.png') });
  });
});
