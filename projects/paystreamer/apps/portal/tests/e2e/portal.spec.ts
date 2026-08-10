import { test, expect, Page } from '@playwright/test';

const TEST_BURNER_SK = 'suiprivkey1qrhc5vekj8h344caqgj752ur72rq2d2w67kdq98qk36s66q4usuhx7q9sep';

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

test.describe('Portal Core Navigation & Routing', () => {
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

    await page.addInitScript((sk) => {
      localStorage.setItem('paystreamer_burner_sk', sk);
    }, TEST_BURNER_SK);
  });

  test.afterEach(async () => {
    expect(consoleErrors, `Expected zero uncaught console/page errors, but got:\n${consoleErrors.join('\n---\n')}`).toHaveLength(0);
    expect(networkErrors, `Expected zero network failures or HTTP 4xx/5xx errors, but got:\n${networkErrors.join('\n---\n')}`).toHaveLength(0);
  });

  test('should load dashboard subscriptions page successfully and verify DOM UI, loading transition, and empty state', async ({ page }) => {
    await page.goto('/dashboard/subscriptions');
    await connectWalletIfPrompted(page);

    // Rule 1 & 2: Heading DOM visibility
    await expect(page.getByRole('heading', { name: 'Subscriptions', level: 1 })).toBeVisible({ timeout: 15000 });

    // Rule 6: Loading State Transition
    await expect(page.getByText('Loading...').or(page.locator('.animate-spin'))).not.toBeVisible({ timeout: 15000 });

    // Rule 7: Explicit Empty State assertion for fresh burner wallet
    await expect(page.getByText('No subscriptions yet')).toBeVisible();
  });

  test('should load platform overview page successfully and verify DOM UI, loading transition, and empty state', async ({ page }) => {
    await page.goto('/platforms/overview');
    await connectWalletIfPrompted(page);

    // Rule 6: Loading State Transition
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Rule 7: Explicit Empty State assertion for fresh burner wallet
    await expect(page.getByText("You don't own any platforms yet.")).toBeVisible({ timeout: 15000 });
  });
});
