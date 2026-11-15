import { expect, test, type Page } from '@playwright/test';

/**
 * Browser tests against the playground. They use the public Mux HLS test
 * stream unless STREAM_URL is set (e.g. to the local ffmpeg ladder:
 * STREAM_URL=/streams/master.m3u8 after `npm run streams`).
 */
const STREAM = process.env.STREAM_URL ?? 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

// Playwright's Linux WebKit build can't decode H.264 High profile (the Mux
// stream's 480p+ renditions fail even with bare hls.js), so tests that need
// continuous playback are skipped there. Real Safari is unaffected.
const NEEDS_PLAYBACK = 'Playwright Linux WebKit cannot decode H.264 High profile';

const state = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector('movie-player')!.state;
    return { status: s.status, currentTime: s.currentTime, duration: s.duration, muted: s.muted };
  });

async function openPlayer(page: Page, src = STREAM) {
  await page.goto(`/?src=${encodeURIComponent(src)}`);
  await expect.poll(async () => (await state(page)).status, { timeout: 20_000 }).toBe('ready');
}

test('renders custom controls instead of native ones', async ({ page }) => {
  await openPlayer(page);
  await expect(page.locator('movie-player mp-play-button button')).toBeVisible();
  await expect(page.locator('movie-player mp-seek-bar [role="slider"]')).toBeVisible();
  expect(
    await page.locator('movie-player video').evaluate((v: HTMLVideoElement) => v.controls),
  ).toBe(false);
});

test('plays from the big play button and time advances', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && !process.env.STREAM_URL, NEEDS_PLAYBACK);
  await openPlayer(page);
  const events: string[] = [];
  await page.exposeFunction('recordEvent', (t: string) => events.push(t));
  await page.evaluate(() =>
    document
      .querySelector('movie-player')!
      .addEventListener('mp-playing', () =>
        (window as unknown as { recordEvent: (t: string) => void }).recordEvent('mp-playing'),
      ),
  );

  await page.locator('movie-player mp-big-play button').click();
  await expect
    .poll(async () => (await state(page)).currentTime, { timeout: 20_000 })
    .toBeGreaterThan(1);
  expect((await state(page)).status).toBe('playing');
  await expect(page.locator('movie-player mp-play-button button')).toHaveAttribute(
    'aria-label',
    'Pause',
  );
  expect(events).toContain('mp-playing');
});

test('keyboard shortcuts control playback and seeking', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && !process.env.STREAM_URL, NEEDS_PLAYBACK);
  await openPlayer(page);
  const player = page.locator('movie-player');
  await player.focus();

  await page.keyboard.press('k');
  await expect.poll(async () => (await state(page)).status, { timeout: 20_000 }).toBe('playing');
  await page.keyboard.press('k');
  await expect.poll(async () => (await state(page)).status).toBe('paused');

  const before = (await state(page)).currentTime;
  await page.keyboard.press('l');
  await expect.poll(async () => (await state(page)).currentTime).toBeGreaterThan(before + 9);
  await expect(page.locator('movie-player .indicator')).toHaveText('+10s');

  await page.keyboard.press('5');
  const { duration } = await state(page);
  await expect.poll(async () => (await state(page)).currentTime).toBeCloseTo(duration / 2, 0);
});

test('clicking the seek bar seeks', async ({ page }) => {
  await openPlayer(page);
  const bar = page.locator('movie-player mp-seek-bar [role="slider"]');
  const box = (await bar.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  const { duration } = await state(page);
  await expect.poll(async () => (await state(page)).currentTime / duration).toBeGreaterThan(0.2);
  expect((await state(page)).currentTime / duration).toBeLessThan(0.3);
});

test('mute button toggles mute', async ({ page }) => {
  await openPlayer(page);
  const button = page.locator('movie-player mp-volume button');
  const initial = (await state(page)).muted;
  await button.click();
  await expect.poll(async () => (await state(page)).muted).toBe(!initial);
  await button.click();
  await expect.poll(async () => (await state(page)).muted).toBe(initial);
});

test('fullscreen button fullscreens the player element', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Fullscreen is unreliable in headless Firefox/WebKit');
  await openPlayer(page);
  await page.locator('movie-player mp-fullscreen-button button').click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.tagName))
    .toBe('MOVIE-PLAYER');
  await expect(page.locator('movie-player mp-fullscreen-button button')).toHaveAttribute(
    'aria-label',
    'Exit fullscreen',
  );
});

test('a broken source shows the error overlay with retry', async ({ page }) => {
  await page.goto(`/?src=${encodeURIComponent('/does-not-exist.m3u8')}`);
  const overlay = page.locator('movie-player mp-error-overlay [role="alert"]');
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(overlay.getByRole('button', { name: 'Try again' })).toBeVisible();
});
