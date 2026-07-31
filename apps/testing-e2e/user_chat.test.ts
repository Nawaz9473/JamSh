import { test, expect } from '@playwright/test';
import * as path from 'path';

import * as fs from 'fs';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'C:/Users/nawaz/.gemini/antigravity-ide/brain/7081fe8d-8299-4e3d-bbd3-dc16e9281e09';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

test.setTimeout(180000); // 180 seconds timeout

test('Cross-Platform Web & Mobile App Verification', async ({ browser }) => {
  const timestamp = Date.now();
  const userAEmail = `nawaz_${timestamp}@test.com`;
  const userAUsername = `nawaz_${timestamp}`;
  const userAName = `Nawaz_${timestamp}`;

  const userBEmail = `uswa_${timestamp}@test.com`;
  const userBUsername = `uswa_${timestamp}`;
  const userBName = `uswa_${timestamp}`;

  console.log(`User 1 (Web): Username: ${userAUsername}, Email: ${userAEmail}`);
  console.log(`User 2 (Mobile App): Username: ${userBUsername}, Email: ${userBEmail}`);

  // Create separate browser contexts to simulate separate logged-in devices concurrently
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 } }); // mobile size triggers isMobile layout

  const webPage = await desktopContext.newPage();
  const appPage = await mobileContext.newPage();

  // Load and clear localStorage for clean test state
  await webPage.goto('http://localhost:5173');
  await webPage.waitForLoadState('domcontentloaded');
  await webPage.waitForTimeout(2000);
  try {
    await webPage.evaluate(() => localStorage.clear());
  } catch (e) {
    await webPage.waitForTimeout(1000);
    await webPage.evaluate(() => localStorage.clear());
  }
  await webPage.reload();
  await webPage.waitForLoadState('domcontentloaded');
  await webPage.waitForTimeout(1000);

  await appPage.goto('http://localhost:5173');
  await appPage.waitForLoadState('domcontentloaded');
  await appPage.waitForTimeout(2000);
  try {
    await appPage.evaluate(() => localStorage.clear());
  } catch (e) {
    await appPage.waitForTimeout(1000);
    await appPage.evaluate(() => localStorage.clear());
  }
  await appPage.reload();
  await appPage.waitForLoadState('domcontentloaded');
  await appPage.waitForTimeout(1000);
  await webPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_01_loaded.png') });

  // 1. Signup User 1 on Web & User 2 on Mobile App
  console.log('Signing up User 1 on Web...');
  await webPage.getByText("Don't have an account?").click();
  await webPage.waitForTimeout(500);
  await webPage.getByPlaceholder('Mobile Number or Email Address').fill(userAEmail);
  await webPage.getByPlaceholder('Full Name').fill(userAName);
  await webPage.getByPlaceholder('Username').fill(userAUsername);
  await webPage.locator('select').nth(0).selectOption('1'); // Jan
  await webPage.locator('select').nth(1).selectOption('1'); // 1
  await webPage.locator('select').nth(2).selectOption('2000'); // 2000
  await webPage.getByPlaceholder('Password (Min 8 characters)').fill('N@w@z1234');
  await webPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_02_nawaz_signup_form.png') });
  await webPage.getByText('Sign up', { exact: true }).click();

  console.log('Signing up User 2 on Mobile App...');
  await appPage.getByText("Don't have an account?").click();
  await appPage.waitForTimeout(500);
  await appPage.getByPlaceholder('Mobile Number or Email Address').fill(userBEmail);
  await appPage.getByPlaceholder('Full Name').fill(userBName);
  await appPage.getByPlaceholder('Username').fill(userBUsername);
  await appPage.locator('select').nth(0).selectOption('2'); // Feb
  await appPage.locator('select').nth(1).selectOption('15'); // 15
  await appPage.locator('select').nth(2).selectOption('1998'); // 1998
  await appPage.getByPlaceholder('Password (Min 8 characters)').fill('N@w@z1234');
  await appPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_04_uswa_signup_form.png') });
  await appPage.getByText('Sign up', { exact: true }).click();

  // Wait for signup completes on both pages
  await webPage.waitForTimeout(5000);
  await appPage.waitForTimeout(5000);

  // Verify log out is visible to ensure successful login on both
  await expect(webPage.locator('text="Log out"')).toBeVisible();
  await expect(appPage.locator('.lucide-log-out').first()).toBeVisible();

  // 2. Profile verification on Web (User 1)
  console.log('Verifying User 1 profile data on Web...');
  await webPage.locator('text="Profile"').click();
  await webPage.waitForTimeout(1500);
  await expect(webPage.getByText(userAUsername).first()).toBeVisible();
  await expect(webPage.getByText(userAName).first()).toBeVisible();
  await expect(webPage.getByText('0 followers')).toBeVisible();
  await expect(webPage.getByText('0 following')).toBeVisible();

  // 3. Profile verification on Mobile App (User 2)
  console.log('Verifying User 2 profile data on Mobile App...');
  await appPage.locator('.lucide-user').first().click();
  await appPage.waitForTimeout(1500);
  await appPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_05_uswa_profile_initial.png') });
  await expect(appPage.getByText(userBUsername).first()).toBeVisible();
  await expect(appPage.getByText(userBName).first()).toBeVisible();
  await expect(appPage.getByText('0 followers')).toBeVisible();
  await expect(appPage.getByText('0 following')).toBeVisible();

  // 4. Search and Follow from User 1 (Web) -> User 2 (Mobile)
  console.log('User 1 (Web) follows User 2 (Mobile)...');
  await webPage.locator('text="Search"').click();
  await webPage.waitForTimeout(1000);
  await webPage.getByPlaceholder('Type username or display name...').fill(userBUsername);
  await webPage.waitForTimeout(2000);
  await webPage.locator('text="View"').first().click();
  await webPage.waitForTimeout(1500);

  await expect(webPage.getByText('0 followers')).toBeVisible();
  await webPage.locator('text="Follow"').first().click();
  await webPage.waitForTimeout(2500);

  // Verify User 2's follower count increases to 1 on Web view
  await expect(webPage.getByText('Following').first()).toBeVisible();
  await expect(webPage.getByText('1 followers')).toBeVisible();
  await webPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_07_nawaz_followed_uswa.png') });

  // Go to Web User 1's profile and check Following increases to 1
  await webPage.locator('text="Profile"').click();
  await webPage.waitForTimeout(1500);
  await expect(webPage.getByText('1 following')).toBeVisible();

  // Verify User 2's follower count increases to 1 on Mobile view
  console.log('Verifying User 2 profile on Mobile updates to 1 follower...');
  await appPage.locator('.lucide-user').first().click(); // clicks profile tab (triggers handleNavigateToOwnProfile)
  await appPage.waitForTimeout(1500);
  await expect(appPage.getByText('1 followers')).toBeVisible();

  // 5. Search and Follow from User 2 (Mobile) -> User 1 (Web)
  console.log('User 2 (Mobile) follows User 1 (Web)...');
  await appPage.locator('.lucide-search').first().click();
  await appPage.waitForTimeout(1000);
  await appPage.getByPlaceholder('Type username or display name...').fill(userAUsername);
  await appPage.waitForTimeout(2000);
  await appPage.locator('text="View"').first().click();
  await appPage.waitForTimeout(1500);

  await expect(appPage.getByText('0 followers')).toBeVisible();
  await appPage.locator('text="Follow"').first().click();
  await appPage.waitForTimeout(2500);

  // Verify User 1's follower count increases to 1 on Mobile view
  await expect(appPage.getByText('Following').first()).toBeVisible();
  await expect(appPage.getByText('1 followers')).toBeVisible();

  // Go to Mobile User 2's profile and check Following increases to 1
  await appPage.locator('.lucide-user').first().click();
  await appPage.waitForTimeout(1500);
  await expect(appPage.getByText('1 following')).toBeVisible();

  // Go to Web User 1's profile and check Follower count increases to 1
  console.log('Verifying User 1 profile on Web updates to 1 follower...');
  await webPage.locator('text="Profile"').click();
  await webPage.waitForTimeout(1500);
  await expect(webPage.getByText('1 followers')).toBeVisible();

  // 6. Refresh and check counts remain synchronized
  console.log('Reloading both Web and App platforms...');
  await webPage.reload();
  await webPage.waitForTimeout(2000);
  await webPage.locator('text="Profile"').click();
  await webPage.waitForTimeout(1500);
  await expect(webPage.getByText('1 followers')).toBeVisible();
  await expect(webPage.getByText('1 following')).toBeVisible();

  await appPage.reload();
  await appPage.waitForTimeout(2000);
  await appPage.locator('.lucide-user').first().click();
  await appPage.waitForTimeout(1500);
  await expect(appPage.getByText('1 followers')).toBeVisible();
  await expect(appPage.getByText('1 following')).toBeVisible();

  // 7. Test Unfollow from User 1 (Web) -> User 2 (Mobile)
  console.log('Testing Unfollow from Web to Mobile...');
  await webPage.locator('text="Search"').click();
  await webPage.waitForTimeout(1000);
  await webPage.getByPlaceholder('Type username or display name...').fill(userBUsername);
  await webPage.waitForTimeout(1500);
  await webPage.locator('text="View"').first().click();
  await webPage.waitForTimeout(1500);
  await webPage.getByText('Following').first().click();
  await webPage.waitForTimeout(2500);

  // Verify Web views counts decrease
  await expect(webPage.getByText('Follow').first()).toBeVisible();
  await expect(webPage.getByText('0 followers')).toBeVisible();

  await webPage.locator('text="Profile"').click();
  await webPage.waitForTimeout(1500);
  await expect(webPage.getByText('0 following')).toBeVisible();

  // Verify Mobile views counts decrease
  await appPage.locator('.lucide-user').first().click();
  await appPage.waitForTimeout(1500);
  await expect(appPage.getByText('0 followers')).toBeVisible();

  // 8. Test Unfollow from User 2 (Mobile) -> User 1 (Web)
  console.log('Testing Unfollow from Mobile to Web...');
  await appPage.locator('.lucide-search').first().click();
  await appPage.waitForTimeout(1000);
  await appPage.getByPlaceholder('Type username or display name...').fill(userAUsername);
  await appPage.waitForTimeout(1500);
  await appPage.locator('text="View"').first().click();
  await appPage.waitForTimeout(1500);
  await appPage.getByText('Following').first().click();
  await appPage.waitForTimeout(2500);

  // Reload to ensure count is updated in database and reflected on fresh mount
  await appPage.reload();
  await appPage.waitForLoadState('domcontentloaded');
  await appPage.locator('.lucide-search').first().click();
  await appPage.waitForTimeout(1000);
  await appPage.getByPlaceholder('Type username or display name...').fill(userAUsername);
  await appPage.waitForTimeout(1500);
  await appPage.locator('text="View"').first().click();
  await appPage.waitForTimeout(1500);

  // Verify Mobile views counts decrease
  await expect(appPage.getByText('Follow').first()).toBeVisible();
  await expect(appPage.getByText('0 followers')).toBeVisible();

  await appPage.locator('.lucide-user').first().click();
  await appPage.waitForTimeout(1500);
  await expect(appPage.getByText('0 following')).toBeVisible();

  // Verify Web views counts decrease
  await webPage.reload();
  await webPage.waitForLoadState('domcontentloaded');
  await webPage.locator('text="Profile"').click();
  await webPage.waitForTimeout(1500);
  await expect(webPage.getByText('0 followers')).toBeVisible();

  // 9. Follow back again to test messaging
  console.log('Re-establishing follow links for message testing...');
  await webPage.locator('text="Search"').click();
  await webPage.waitForTimeout(1000);
  await webPage.getByPlaceholder('Type username or display name...').fill(userBUsername);
  await webPage.waitForTimeout(1500);
  await webPage.locator('text="View"').first().click();
  await webPage.waitForTimeout(1500);
  await webPage.getByText('Follow').first().click();
  await webPage.waitForTimeout(2500);

  await appPage.locator('.lucide-search').first().click();
  await appPage.waitForTimeout(1000);
  await appPage.getByPlaceholder('Type username or display name...').fill(userAUsername);
  await appPage.waitForTimeout(1500);
  await appPage.locator('text="View"').first().click();
  await appPage.waitForTimeout(1500);
  await appPage.getByText('Follow').first().click();
  await appPage.waitForTimeout(2500);

  // 10. Message sending: User 1 (Web) -> User 2 (Mobile App)
  console.log('User 1 (Web) sending message to User 2 (Mobile App)...');
  await webPage.locator('text="Search"').click();
  await webPage.waitForTimeout(1000);
  await webPage.getByPlaceholder('Type username or display name...').fill(userBUsername);
  await webPage.waitForTimeout(1500);
  await webPage.locator('text="View"').first().click();
  await webPage.waitForTimeout(1500);
  await webPage.locator('text="Message"').click();
  await webPage.waitForTimeout(2000);

  const messageFromWeb = `Web message at timestamp ${timestamp}`;
  await webPage.getByPlaceholder('Message...').fill(messageFromWeb);
  await webPage.locator('text="Send"').click();
  await webPage.waitForTimeout(3000);
  await webPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_08_nawaz_sent_message.png') });

  // Verify alignment (Right side on Web)
  const webSentBubble = webPage.getByText(messageFromWeb).locator('..').locator('..');
  await expect(webSentBubble).toHaveCSS('justify-content', 'flex-end');

  // 11. Verify User 2 (Mobile App) receives Web message
  console.log('Verifying User 2 receives message on Mobile App...');
  await appPage.locator('.lucide-message-square').first().click();
  await appPage.waitForTimeout(2000);
  await appPage.locator(`text="${userAName}"`).first().click();
  await appPage.waitForTimeout(6000); // handshake/decryption

  const mobileReceivedText = appPage.locator(`text="${messageFromWeb}"`);
  await expect(mobileReceivedText).toBeVisible();
  await appPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_09_uswa_received_message.png') });

  // Verify alignment (Left side on Mobile)
  const mobileReceivedBubble = appPage.getByText(messageFromWeb).locator('..').locator('..');
  await expect(mobileReceivedBubble).toHaveCSS('justify-content', 'flex-start');

  // 12. Message reply: User 2 (Mobile App) -> User 1 (Web)
  console.log('User 2 (Mobile App) replying to User 1 (Web)...');
  const messageFromMobile = `Mobile reply at timestamp ${timestamp}`;
  await appPage.getByPlaceholder('Message...').fill(messageFromMobile);
  await appPage.locator('text="Send"').click();
  await appPage.waitForTimeout(3000);
  await appPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_10_uswa_sent_reply.png') });

  // Verify alignment (Right side on Mobile)
  const mobileSentBubble = appPage.getByText(messageFromMobile).locator('..').locator('..');
  await expect(mobileSentBubble).toHaveCSS('justify-content', 'flex-end');

  // 13. Verify User 1 (Web) receives Mobile reply
  console.log('Verifying User 1 receives reply on Web...');
  await webPage.waitForTimeout(4000); // Wait for sync
  const webReceivedText = webPage.locator(`text="${messageFromMobile}"`);
  await expect(webReceivedText).toBeVisible();
  await webPage.screenshot({ path: path.join(ARTIFACT_DIR, 'reply_11_nawaz_received_reply.png') });

  // Verify alignment (Left side on Web)
  const webReceivedBubble = webPage.getByText(messageFromMobile).locator('..').locator('..');
  await expect(webReceivedBubble).toHaveCSS('justify-content', 'flex-start');

  // 14. Multiple back-and-forth messages to confirm real-time synchronization
  console.log('Testing multiple back-and-forth messages...');
  const msgWeb2 = `Web follow-up ${timestamp}`;
  await webPage.getByPlaceholder('Message...').fill(msgWeb2);
  await webPage.locator('text="Send"').click();
  await webPage.waitForTimeout(3000);

  await appPage.waitForTimeout(2000);
  await expect(appPage.locator(`text="${msgWeb2}"`)).toBeVisible();

  const msgMobile2 = `Mobile follow-up ${timestamp}`;
  await appPage.getByPlaceholder('Message...').fill(msgMobile2);
  await appPage.locator('text="Send"').click();
  await appPage.waitForTimeout(3000);

  await webPage.waitForTimeout(2000);
  await expect(webPage.locator(`text="${msgMobile2}"`)).toBeVisible();

  // 15. Refresh both and check history availability
  console.log('Reloading both pages to check chat history persistence...');
  await webPage.reload();
  await webPage.waitForTimeout(2000);
  await webPage.locator('text="Messages"').click();
  await webPage.waitForTimeout(2000);
  await webPage.locator(`text="${userBName}"`).first().click();
  await webPage.waitForTimeout(6000); // decryption

  await expect(webPage.locator(`text="${messageFromWeb}"`)).toBeVisible();
  await expect(webPage.locator(`text="${messageFromMobile}"`)).toBeVisible();
  await expect(webPage.locator(`text="${msgWeb2}"`)).toBeVisible();
  await expect(webPage.locator(`text="${msgMobile2}"`)).toBeVisible();

  await appPage.reload();
  await appPage.waitForTimeout(2000);
  await appPage.locator('.lucide-message-square').first().click();
  await appPage.waitForTimeout(2000);
  await appPage.locator(`text="${userAName}"`).first().click();
  await appPage.waitForTimeout(6000); // decryption

  await expect(appPage.locator(`text="${messageFromWeb}"`)).toBeVisible();
  await expect(appPage.locator(`text="${messageFromMobile}"`)).toBeVisible();
  await expect(appPage.locator(`text="${msgWeb2}"`)).toBeVisible();
  await expect(appPage.locator(`text="${msgMobile2}"`)).toBeVisible();

  console.log('Cross-Platform Web & Mobile E2E verification successful!');
});
