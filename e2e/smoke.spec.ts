import { expect, test } from '@playwright/test';

test('playground renders the player with a video element', async ({ page }) => {
  await page.goto('/');
  const video = page.locator('movie-player').locator('video');
  await expect(video).toBeAttached();
});
