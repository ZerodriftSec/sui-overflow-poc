import { test, expect, Page } from '@playwright/test';

// Deterministic secret key for persistent burner wallet
const TEST_BURNER_SK = 'suiprivkey1qrhc5vekj8h344caqgj752ur72rq2d2w67kdq98qk36s66q4usuhx7q9sep';
const DEMO_PLATFORM_ID = "0xa9d5aa6ac94c1508a2a7f93d1498e881f117fd017c5e6932ad4e3045d070403a";

async function connectWalletIfPrompted(page: Page) {
  const connectBtn = page.getByRole('button', { name: 'Connect Wallet' }).first();
  if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await connectBtn.click();
    
    const burnerBtn = page.getByRole('button', { name: /Persistent Burner Wallet/i }).or(page.getByText('Persistent Burner Wallet')).first();
    await expect(burnerBtn).toBeVisible({ timeout: 5000 });
    await burnerBtn.click();
    await page.waitForTimeout(1000);
  }
}

test.describe('Portal Full User Flow E2E', () => {
  let consoleErrors: string[] = [];
  let networkErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    networkErrors = [];

    page.on('pageerror', (err) => {
      consoleErrors.push(`Uncaught browser exception: ${err.message}\n${err.stack}`);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('Failed to load resource') && !text.includes('the server responded with a status of 404')) {
          consoleErrors.push(`Console error: ${text}`);
        }
      }
    });

    // Rule 6: Network Error Monitoring
    page.on('requestfailed', (req) => {
      const errText = req.failure()?.errorText || '';
      if (!errText.includes('net::ERR_ABORTED')) {
        networkErrors.push(`Network request failed: ${req.url()} - ${errText}`);
      }
    });

    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon')) {
        networkErrors.push(`HTTP ${res.status()} response from ${res.url()}`);
      }
    });

    // Pre-seed burner wallet in localStorage to simulate connected state across all pages
    await page.addInitScript((sk) => {
      localStorage.setItem('paystreamer_burner_sk', sk);
    }, TEST_BURNER_SK);
  });

  test.afterEach(async () => {
    expect(consoleErrors, `Expected zero uncaught console/page errors, but got:\n${consoleErrors.join('\n---\n')}`).toHaveLength(0);
    expect(networkErrors, `Expected zero network failures or HTTP 4xx/5xx errors, but got:\n${networkErrors.join('\n---\n')}`).toHaveLength(0);
  });

  test('should load dashboard subscriptions page with connected burner wallet, verify DOM elements, loading transition, and empty state', async ({ page }) => {
    await page.goto('/dashboard/subscriptions');
    await connectWalletIfPrompted(page);

    // Rule 1 & 2: DOM Visibility
    await expect(page.getByRole('heading', { name: 'Subscriptions', level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Manage your active subscriptions')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore Platforms' })).toBeVisible();

    // Rule 6: Loading State Transition
    await expect(page.getByText('Loading...').or(page.locator('.animate-spin'))).not.toBeVisible({ timeout: 15000 });

    // Rule 7: Explicit Empty State assertion for fresh wallet
    await expect(page.getByText('No subscriptions yet')).toBeVisible();
  });

  test('should navigate across dashboard pages using sidebar links and verify DOM elements, loading transitions, and empty states', async ({ page }) => {
    await page.goto('/dashboard/subscriptions');
    await connectWalletIfPrompted(page);

    await expect(page.getByRole('heading', { name: 'Subscriptions', level: 1 })).toBeVisible({ timeout: 15000 });

    // Click sidebar link to Accounts
    await page.getByRole('link', { name: 'Accounts' }).click();
    await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible();
    await expect(page.getByText('Manage your subscription accounts')).toBeVisible();
    await expect(page.getByText('Loading accounts...')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No accounts yet. Create one to get started.')).toBeVisible();

    // Click sidebar link to Activity
    await page.getByRole('link', { name: 'Activity' }).click();
    await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    await expect(page.getByText('View your transaction history')).toBeVisible();
    await expect(page.getByText('Loading...')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No activity yet')).toBeVisible();

    // Click sidebar link to Settings
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByText('Manage your account preferences')).toBeVisible();
  });

  test('should load platform creator portal pages, verify loading transitions, and assert fresh wallet empty states', async ({ page }) => {
    await page.goto('/platforms/overview');
    await connectWalletIfPrompted(page);

    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText("You don't own any platforms yet.")).toBeVisible({ timeout: 15000 });

    await page.goto('/platforms/tiers');
    await connectWalletIfPrompted(page);
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText("You need to own a platform to manage tiers.")).toBeVisible({ timeout: 15000 });

    await page.goto('/platforms/treasury');
    await connectWalletIfPrompted(page);
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText("You don't own any platforms.")).toBeVisible({ timeout: 15000 });
  });

  test('should load checkout page with platform ID and render platform details or not-found card', async ({ page }) => {
    await page.goto(`/checkout/${DEMO_PLATFORM_ID}`);
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await expect(
      page.locator('h1').or(page.getByText('Platform Not Found')).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('should trigger Register Platform modal deterministically without conditional branching', async ({ page }) => {
    await page.goto('/platforms/overview');
    await connectWalletIfPrompted(page);

    const regButton = page.locator('button:has-text("Register Platform"), button:has-text("Register Your First Platform")').first();
    await expect(regButton).toBeVisible({ timeout: 15000 });
    await regButton.click();

    // Verify modal is open and visible
    await expect(page.getByText('Register New Platform')).toBeVisible();
  });
});
