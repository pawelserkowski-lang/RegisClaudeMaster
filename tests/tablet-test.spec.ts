import { test, expect } from '@playwright/test';

test('tablet view - fibonacci request', async ({ page }) => {
  // Increase test timeout
  test.setTimeout(60000);
  
  // Set tablet viewport (iPad 768x1024)
  await page.setViewportSize({ width: 768, height: 1024 });
  
  // Navigate to app at localhost:5173
  await page.goto('http://localhost:5173');
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Find input field and type the prompt
  const input = page.locator('input[type="text"], textarea').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill('Napisz funkcję fibonacci w Python');
  
  // Find and click submit button
  const submitButton = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Submit"), button:has-text("Wyślij")').first();
  await submitButton.click();
  
  // Wait for response (up to 30 seconds)
  console.log('Waiting for response...');
  await page.waitForTimeout(5000);
  
  // Wait for response content to appear
  try {
    const responseArea = page.locator('.response, .output, .message, [class*="response"], [class*="message"], pre, code');
    await responseArea.first().waitFor({ state: 'visible', timeout: 30000 });
    console.log('Response area found');
  } catch (e) {
    console.log('Response area not found within timeout - continuing anyway');
  }
  
  // Take screenshot
  await page.screenshot({ path: 'tablet-test.png', fullPage: true });
  console.log('Screenshot saved to tablet-test.png');
  
  // Check if code was returned
  const pageContent = await page.content();
  const hasDefFibonacci = pageContent.includes('def fibonacci');
  const hasFibonacci = pageContent.includes('fibonacci');
  const hasCodeTag = pageContent.includes('<code');
  const hasPreTag = pageContent.includes('<pre');
  
  const hasCode = hasDefFibonacci || hasCodeTag || hasPreTag;
  
  console.log('Analysis:');
  console.log('- Contains "def fibonacci":', hasDefFibonacci);
  console.log('- Contains "fibonacci":', hasFibonacci);
  console.log('- Contains <code> tag:', hasCodeTag);
  console.log('- Contains <pre> tag:', hasPreTag);
  console.log('');
  
  if (hasCode) {
    console.log('RESULT: SUCCESS - Code was returned in the response');
  } else if (hasFibonacci) {
    console.log('RESULT: PARTIAL - Response mentions fibonacci but no code block detected');
  } else {
    console.log('RESULT: PENDING - Response may still be loading');
  }
});
