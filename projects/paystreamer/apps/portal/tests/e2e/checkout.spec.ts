import { test, expect } from '@playwright/test';

const DEMO_PLATFORM_ID = "0xa9d5aa6ac94c1508a2a7f93d1498e881f117fd017c5e6932ad4e3045d070403a";

test.describe('Checkout Page E2E', () => {
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
  });

  test.afterEach(async () => {
    expect(consoleErrors, `Expected zero uncaught console/page errors, but got:\n${consoleErrors.join('\n---\n')}`).toHaveLength(0);
    expect(networkErrors, `Expected zero network failures or HTTP 4xx/5xx errors, but got:\n${networkErrors.join('\n---\n')}`).toHaveLength(0);
  });

  test('Checkout page loads correctly, completes loading state, and displays platform info or not found message', async ({ page }) => {
    await page.goto(`/checkout/${DEMO_PLATFORM_ID}`);
    
    // Rule 6: Assert loading spinner disappears
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Rule 1 & 2: Assert DOM content visibility
    await expect(
      page.locator('h1').or(page.getByText('Platform Not Found')).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
