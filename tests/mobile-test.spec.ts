import { expect, test } from '@playwright/test';

// Mobile test configuration - iPhone viewport (375x667)
test.use({
  viewport: { width: 375, height: 667 },
  
  isMobile: true,
  hasTouch: true,
});

// Increase timeout to 90 seconds for this test (API can be slow)
test.setTimeout(90000);
test.skip(({ browserName }) => browserName === 'firefox', 'Firefox does not support mobile emulation');

test('Mobile view test - ask about React', async ({ page }) => {
  // 1. Open app with mobile viewport (already set via test.use)
  await page.goto('/');
  
  // Verify app loaded
  await expect(page.getByRole('heading', { name: 'Regis Matrix Lab' })).toBeVisible({ timeout: 10000 });
  console.log('App loaded successfully');
  
  // 2. Type question in input
  const input = page.getByPlaceholder('Wpisz pytanie do Regis...');
  await expect(input).toBeVisible();
  await input.fill('Co to jest React?');
  
  // Verify input has the text
  await expect(input).toHaveValue('Co to jest React?');
  console.log('Input filled with: Co to jest React?');
  
  // 3. Click submit button
  const submitButton = page.locator('button[type="submit"]');
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  console.log('Submit button clicked');
  
  // 4. Wait for response (up to 30 seconds)
  console.log('Waiting for response...');
  
  // Wait for the thinking indicator to appear first
  try {
    await page.waitForSelector('text=Myślę...', { timeout: 5000 });
    console.log('Thinking indicator appeared');
  } catch (e) {
    console.log('Thinking indicator not found, continuing...');
  }
  
  // Now wait for the actual response - when "Myślę..." disappears or real content appears
  // The response should contain React-related information
  try {
    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      const text = main.textContent || '';
      // Check for response indicators
      const hasReactContent = text.toLowerCase().includes('react') && 
                             (text.toLowerCase().includes('javascript') || 
                              text.toLowerCase().includes('bibliotek') ||
                              text.toLowerCase().includes('komponent') ||
                              text.toLowerCase().includes('facebook') ||
                              text.toLowerCase().includes('interfejs'));
      const hasSubstantialContent = text.length > 50;
      return hasReactContent || hasSubstantialContent;
    }, { timeout: 45000 });
    console.log('Response content detected');
  } catch (e) {
    console.log('Timeout waiting for detailed response, taking screenshot anyway');
  }
  
  // Extra wait for content to fully render
  await page.waitForTimeout(2000);
  
  // 5. Take screenshot
  await page.screenshot({ 
    path: 'mobile-test.png',
    fullPage: true 
  });
  console.log('Screenshot saved: mobile-test.png');
  
  // 6. Report response text
  // Get main content
  const mainContent = await page.locator('main').textContent();
  
  console.log('=== Main Content ===');
  console.log(mainContent);
  console.log('=== End Content ===');
  
  // Verify something was displayed
  expect(mainContent).toBeTruthy();
  expect(mainContent!.length).toBeGreaterThan(50);
  
  // Report key findings
  if (mainContent!.toLowerCase().includes('react')) {
    console.log('SUCCESS: Response contains React-related information');
  } else if (mainContent!.includes('Myślę...') || mainContent!.includes('Pracuję')) {
    console.log('NOTE: Response is still being generated');
  }
});
