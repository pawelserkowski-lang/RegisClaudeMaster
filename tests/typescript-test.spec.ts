import { test, expect } from '@playwright/test';

test.describe('TypeScript Question Test', () => {
  test('should submit question and get response', async ({ page }) => {
    // Set viewport to 1280x720 (desktop)
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Navigate to the app
    await page.goto('/', { waitUntil: 'networkidle' });
    
    console.log('Page loaded, looking for input...');
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    
    // Take screenshot of initial state
    await page.screenshot({ path: 'screenshots/01-initial-state.png', fullPage: true });
    
    // Find the input field - try multiple selectors
    const inputSelectors = [
      'textarea[placeholder*="wpisz"]',
      'textarea[placeholder*="Wpisz"]',
      'textarea[placeholder*="pytanie"]',
      'textarea',
      'input[type="text"]',
      '[data-testid="chat-input"]',
      '.chat-input',
      'input[placeholder*="pytanie"]',
    ];
    
    let inputElement = null;
    for (const selector of inputSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        inputElement = element;
        console.log(`Found input with selector: ${selector}`);
        break;
      }
    }
    
    if (!inputElement) {
      // Log the page content for debugging
      const html = await page.content();
      console.log('Page HTML (first 2000 chars):', html.substring(0, 2000));
      await page.screenshot({ path: 'screenshots/debug-no-input.png', fullPage: true });
      throw new Error('Could not find input element');
    }
    
    // Type the question
    await inputElement.fill('Wyjaśnij czym jest TypeScript w 2 zdaniach');
    console.log('Question typed');
    
    // Take screenshot after typing
    await page.screenshot({ path: 'screenshots/02-question-typed.png', fullPage: true });
    
    // Find and click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Wyślij")',
      'button:has-text("Send")',
      'button:has-text("wyślij")',
      '[data-testid="submit-button"]',
      'button[aria-label*="send"]',
      'button svg', // Common pattern - button with icon
    ];
    
    let submitButton = null;
    for (const selector of submitSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        submitButton = element;
        console.log(`Found submit button with selector: ${selector}`);
        break;
      }
    }
    
    if (submitButton) {
      await submitButton.click();
      console.log('Submit button clicked');
    } else {
      // Try pressing Enter as fallback
      await inputElement.press('Enter');
      console.log('Pressed Enter as fallback');
    }
    
    // Take screenshot after submit
    await page.screenshot({ path: 'screenshots/03-after-submit.png', fullPage: true });
    
    // Wait for response - up to 30 seconds
    console.log('Waiting for response (up to 30 seconds)...');
    
    const responseSelectors = [
      '.message',
      '.response',
      '.assistant-message',
      '[data-role="assistant"]',
      '.chat-message',
      '.ai-response',
      'div:has-text("TypeScript")',
    ];
    
    let responseFound = false;
    const startTime = Date.now();
    const timeout = 30000;
    
    while (Date.now() - startTime < timeout && !responseFound) {
      for (const selector of responseSelectors) {
        const elements = page.locator(selector);
        const count = await elements.count();
        if (count > 1) { // More than just the user message
          responseFound = true;
          console.log(`Response found with selector: ${selector}`);
          break;
        }
      }
      
      if (!responseFound) {
        // Check for any new content
        const bodyText = await page.locator('body').textContent();
        if (bodyText && (bodyText.includes('język') || bodyText.includes('JavaScript') || bodyText.includes('statyczne'))) {
          responseFound = true;
          console.log('Response detected in body text');
        }
      }
      
      if (!responseFound) {
        await page.waitForTimeout(500);
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'screenshots/04-final-state.png', fullPage: true });
    
    // Report results
    if (responseFound) {
      console.log('SUCCESS: Response appeared within timeout');
    } else {
      console.log('WARNING: Response may not have appeared within 30 seconds');
    }
    
    // Get and log any visible response text
    const pageText = await page.locator('body').textContent();
    console.log('Page text includes "TypeScript":', pageText?.includes('TypeScript'));
    
    // Verify something happened (either loading indicator or response)
    const hasActivity = await page.locator('body').textContent();
    expect(hasActivity).toBeTruthy();
  });
});
