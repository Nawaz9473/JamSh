import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Instagram-Style Explore & Search E2E Verification', () => {

  test('Should load explore grid, categories filters, and search autocompletes', async ({ page }) => {
    const timestamp = Date.now();
    const userEmail = `explore_user_${timestamp}@test.com`;
    const username = `explore_user_${timestamp}`;

    // 1. Navigate and clean storage
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    try {
      await page.evaluate(() => localStorage.clear());
    } catch (e) {}
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // 2. Click Sign up link
    await page.getByText("Don't have an account?").click();
    await page.waitForTimeout(500);

    // 3. Signup User
    await page.getByPlaceholder('Mobile Number or Email Address').fill(userEmail);
    await page.getByPlaceholder('Full Name').fill('Explore Tester');
    await page.getByPlaceholder('Username').fill(username);
    await page.locator('select').nth(0).selectOption('1'); // Jan
    await page.locator('select').nth(1).selectOption('1'); // 1
    await page.locator('select').nth(2).selectOption('2000'); // 2000
    await page.getByPlaceholder('Password (Min 8 characters)').fill('password123');

    // Click Sign up button using the exact text selector
    await page.getByText('Sign up', { exact: true }).click();
    await page.waitForTimeout(4000);

    // Click on the Search Tab/Icon in the sidebar
    const searchTabButton = page.locator('text=Search').first();
    await searchTabButton.click();
    await page.waitForTimeout(1000);

    // Verify search input is present on the screen
    const searchInput = page.getByPlaceholder('Type username or display name...');
    await expect(searchInput).toBeVisible();

    // 4. Verify filter chips are rendered
    const categoryChips = page.locator('text=All');
    await expect(categoryChips).toBeVisible();

    const techChip = page.locator('text=Technology');
    await expect(techChip).toBeVisible();
    await techChip.click();
    await page.waitForTimeout(500);

    // 5. Verify masonry explore cards render correctly
    const exploreLoadButton = page.locator('text=LOAD MORE EXPLORE');
    await expect(exploreLoadButton).toBeVisible();

    // 6. Verify autocomplete search query suggestion box overlay triggers on focus
    await searchInput.focus();
    await page.waitForTimeout(500);

    // Type a search query
    await searchInput.fill(username);
    await page.waitForTimeout(1000);

    // Verify suggestion overlay appears and shows matched suggestions
    const suggestionsHeader = page.locator('text=SUGGESTIONS');
    await expect(suggestionsHeader).toBeVisible();

    const matchedSuggestion = page.locator(`text=@${username}`).first();
    await expect(matchedSuggestion).toBeVisible();

    // Execute search by clicking suggestion
    await matchedSuggestion.click();
    await page.waitForTimeout(1000);

    // Verify matched results screen displays section header
    const matchedUsersHeader = page.locator('text=Users');
    await expect(matchedUsersHeader).toBeVisible();
  });
});
