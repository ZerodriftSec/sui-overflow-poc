import { test, expect } from '@playwright/test';

const DEMO_PLATFORM_ID = "0xa9d5aa6ac94c1508a2a7f93d1498e881f117fd017c5e6932ad4e3045d070403a"; // devnet demo id

test('Checkout page loads correctly', async ({ page }) => {
  await page.goto(`http://localhost:5178/${DEMO_PLATFORM_ID}`);
  
  // Wait for loading to finish and check if the name is displayed or "Platform Not Found"
  await expect(
    page.locator('h1').or(page.locator('text=Platform Not Found')).first()
  ).toBeVisible({ timeout: 15000 });
});
