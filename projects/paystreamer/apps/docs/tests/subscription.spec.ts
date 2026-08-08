import { test, expect } from '@playwright/test';

test.describe('Subscription Flow E2E', () => {
  test('should render the modal and execute a subscription successfully', async ({ page }) => {
    // Navigate to the component docs page
    await page.goto('/components/SetupSubscriptionModal');
    
    // Inject the predefined Burner Wallet Secret Key
    await page.evaluate(() => {
      localStorage.setItem('paystreamer_burner_sk', 'suiprivkey1qrhc5vekj8h344caqgj752ur72rq2d2w67kdq98qk36s66q4usuhx7q9sep');
    });
    
    await page.reload();
    
    // Toggle Live Mode
    const liveToggle = page.locator('button', { hasText: 'Live' });
    await expect(liveToggle).toBeVisible();
    await liveToggle.click();
    
    // Look for Connect Wallet button inside DocsDemoWrapper
    const connectWalletBtn = page.getByRole('button', { name: /Connect/i });

    if (await connectWalletBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await connectWalletBtn.click();
    }

    const connectBurner = page.getByText(/Persistent Burner Wallet/i);

    if (await connectBurner.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.evaluate(() => {
        const modal = document.querySelector('mysten-dapp-kit-connect-modal');
        if (modal && modal.shadowRoot) {
          const btn = Array.from(modal.shadowRoot.querySelectorAll('*')).find(el => el.children.length === 0 && el.textContent?.includes('Persistent Burner Wallet'));
          if (btn) (btn.closest('button, [role="button"]') || btn as HTMLElement).click();
        }
      });
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape').catch(() => {});
    }

    const openModalButton = page.getByRole('button', { name: 'Open Setup Modal' });
    await expect(openModalButton).toBeVisible({ timeout: 10000 });
    await openModalButton.click({ force: true });

    // Verify the modal is open
    const modalHeading = page.locator('h2', { hasText: /Setup Subscription|Fill Up & Subscribe/ });
    await expect(modalHeading).toBeVisible();

    // Find the main action button (Setup & Subscribe or Subscribe)
    const subscribeButton = page.locator('button:has-text("Subscribe")').last(); // using last() in case there are other subscribe texts on the page
    await expect(subscribeButton).toBeVisible();

    // Wait for loading states to resolve (checking if button becomes enabled)
    // The component disables the button while loading platform/account data
    await expect(subscribeButton).toBeEnabled({ timeout: 15000 });

    // Ensure we don't have insufficient balance (the test localnet should have funded the burner wallet)
    const insufficientBalanceText = page.locator('text="Insufficient PUSD"');
    await expect(insufficientBalanceText).not.toBeVisible();

    // Click subscribe
    await subscribeButton.click();

    // The modal changes to a success state after processing
    const successHeading = page.locator('h3:has-text("You\'re Subscribed!")');
    
    // Check if there is an error displayed
    const errorMsg = page.locator('.text-red-600');
    
    try {
      await expect(successHeading).toBeVisible({ timeout: 15000 });
    } catch (e) {
      if (await errorMsg.isVisible()) {
        const text = await errorMsg.textContent();
        throw new Error(`Subscription failed with error: ${text}`);
      }
      throw e;
    }

    // Close the modal
    const closeButton = page.locator('button:has-text("Close")');
    await closeButton.click();

    // Verify modal is gone
    await expect(successHeading).not.toBeVisible();
  });
});
