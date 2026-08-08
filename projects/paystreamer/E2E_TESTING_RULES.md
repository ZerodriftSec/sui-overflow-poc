# E2E Testing Standards & Rules

These rules **MUST** be followed by all agents when writing, modifying, or reviewing end-to-end (E2E) tests in this workspace.

## Pre-Execution Evaluation Rule
Before executing or committing any E2E test, you **must explicitly evaluate** the test against this question:
> *"If the React application throws a fatal error and renders a blank white screen, will this test fail?"*

If the answer is **No** (e.g., the test only checks the URL, or conditionally checks for elements), the test is invalid and must be rewritten. **No test build or execution is permitted until this evaluation passes.**

## 1. Never Rely Solely on URL Navigation
Navigating to a route (`page.goto`) and asserting the URL (`toHaveURL`) is insufficient in a Single Page Application (SPA). Playwright will pass the test as soon as the HTML loads, completely ignoring React rendering failures.
- **BAD**: `await expect(page).toHaveURL(/.*dashboard/);`
- **GOOD**: `await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();`

## 2. Always Assert DOM Content Visibility
Every navigation or state-changing action must be followed by an assertion that verifies the expected UI is actually mounted and visible in the DOM.

## 3. Ban on Conditional Assertions
Do not use `if` statements to conditionally check if an element is visible before interacting with it. This creates false-green tests when the UI fails to render.
- **BAD**: `if (await button.isVisible()) { await button.click(); }`
- **GOOD**: `await expect(button).toBeVisible(); await button.click();`

## 4. Strict Error Monitoring
Tests must actively fail if the application throws uncaught runtime exceptions or console errors. 
- You must collect console and page errors.
- You must include an explicit assertion at the end of the test that the error array is empty (e.g., `expect(errors).toHaveLength(0)`).

## 5. Verify Meaningful Interactions
E2E tests should represent real user flows. Do not write tests that simply navigate through pages without interacting with the core business logic (e.g., wallet connection, form submission, transaction signing).

## 6. Assert on Async Data and Loading State Transitions
When a page loads data from an API (e.g., GraphQL or RPC), the UI displays a "Loading..." spinner or skeleton. A common bug is that the UI gets stuck in an infinite loading loop—especially when an API returns an empty array (`[]`) and dependent queries get disabled but remain in a `pending` status.
- **NEVER** pass a test simply because the page title or layout loaded while the main content area says "Loading...".
- **ALWAYS** explicitly assert that the loading state goes away: `await expect(page.locator('text=Loading...')).not.toBeVisible();`
- **Listen for Network Errors**: Explicitly monitor network requests using `page.on('requestfailed')` or `response.status() >= 400` to catch silent API failures.

## 7. Explicitly Test Empty States vs. Populated States
Tests must verify that the UI correctly handles both successful data and empty data. It is not enough to just check if *something* rendered.
- **The Empty State Bug**: APIs often succeed but return empty arrays (`{"data":{"events":{"nodes":[]}}}`). If frontend logic is flawed (e.g., React Query `enabled: false` logic bugs), the empty state UI ("No activity yet") might never trigger, leaving the user staring at a spinner.
- Your E2E suite MUST include specific tests for users with no data (e.g., a fresh burner wallet) to verify the empty state successfully renders.
- **GOOD**: 
  ```typescript
  // 1. Wait for loading to finish (catches infinite spinner bugs)
  await expect(page.locator('text=Loading...')).not.toBeVisible({ timeout: 10000 });
  // 2. Explicitly assert the Empty State rendered because we are using a fresh wallet
  await expect(page.locator('text=No activity yet')).toBeVisible();
  ```

## 8. Agent Integrity: Handling Failing Tests
If you write an E2E test that follows all these rules and it fails, **assume the application code is broken first.** 
- **DO NOT** modify the test to "make it green" (e.g., by removing an assertion, changing it to `toHaveURL()`, or asserting on the broken state). 
- Modifying a valid test just to achieve a passing test suite is strictly prohibited and ruins the purpose of E2E testing.
- You may only modify a failing test if you can definitively prove the test logic itself is fundamentally flawed or out of sync with new product requirements.
- **MANDATORY**: If you determine the application code is broken and causing the test to fail, you must pause and fix the application code (or ask the user how to proceed). Do not lower the standard of the test to bypass the bug.
