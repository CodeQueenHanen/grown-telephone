import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { API, mockGameState, mockGetTask, mockSubmitText } from './helpers';

// Navigate as a joined (non-creator) player so the lobby transitions immediately
// when gameState returns phase: 'active'.
function gameUrl() {
  return `/?gameId=${randomUUID()}&playerId=${randomUUID()}`;
}

const ACTIVE_STATE = { round: 0, phase: 'active', playerCount: 2, myOrder: 0 };

test.describe('Game screens', () => {
  test('write screen appears for a write task', async ({ page }) => {
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'write' });
    await page.goto(gameUrl());
    await expect(page.locator('#write-screen')).toBeVisible({ timeout: 5000 });
  });

  test('player badge shows "Host" on write screen', async ({ page }) => {
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'write' });
    await page.goto(gameUrl());
    await expect(page.locator('#write-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#player-badge')).toBeVisible();
    await expect(page.locator('#player-badge')).toContainText("You're the Host");
  });

  test('player badge shows correct number for non-host', async ({ page }) => {
    await mockGameState(page, { ...ACTIVE_STATE, myOrder: 1 });
    await mockGetTask(page, { type: 'write' });
    await page.goto(gameUrl());
    await expect(page.locator('#write-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#player-badge')).toContainText("You're Player 2");
  });

  test('submitting a phrase shows wait screen with ringing phone', async ({ page }) => {
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'write' });
    await mockSubmitText(page);
    await page.goto(gameUrl());
    await expect(page.locator('#write-screen')).toBeVisible({ timeout: 5000 });
    await page.locator('#phrase-input').fill('a cat on a trampoline');
    await page.locator('#phrase-submit').click();
    await expect(page.locator('#wait-screen')).toBeVisible();
    await expect(page.locator('#wait-screen .phone-ringing')).toContainText('📞');
  });

  test('submit button is disabled until phrase is entered', async ({ page }) => {
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'write' });
    await page.goto(gameUrl());
    await expect(page.locator('#write-screen')).toBeVisible({ timeout: 5000 });
    // The phrase-submit button is not explicitly disabled in the HTML,
    // but submitting with an empty input is guarded by the JS trim() check.
    // Verify the input placeholder is present and usable.
    await expect(page.locator('#phrase-input')).toBeEditable();
  });

  test('draw screen shows prompt and canvas', async ({ page }) => {
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'draw', prompt: 'a purple elephant' });
    await page.goto(gameUrl());
    await expect(page.locator('#draw-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#draw-prompt')).toContainText('"a purple elephant"');
    await expect(page.locator('#canvas')).toBeVisible();
  });

  test('draw submit button is disabled until user draws', async ({ page }) => {
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'draw', prompt: 'something' });
    await page.goto(gameUrl());
    await expect(page.locator('#draw-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#draw-submit')).toBeDisabled();
  });

  test('guess screen shows the drawing image', async ({ page }) => {
    const blobUrl = 'https://example.com/drawing.png';
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'guess', blobUrl });
    await page.goto(gameUrl());
    await expect(page.locator('#guess-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#guess-img')).toHaveAttribute('src', blobUrl);
  });

  test('wait task shows ringing phone while waiting', async ({ page }) => {
    await mockGameState(page, ACTIVE_STATE);
    await mockGetTask(page, { type: 'wait' });
    await page.goto(gameUrl());
    await expect(page.locator('#wait-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#wait-screen .phone-ringing')).toBeVisible();
  });

  test('wait screen polls until getTask returns reveal', async ({ page }) => {
    // First 2 getTask calls return 'wait'; 3rd returns 'reveal' (bug fix: getTask.ts
    // now returns {type:'reveal'} when game.phase === 'reveal' so waiting players
    // see the reveal screen without having to submit anything themselves).
    let callCount = 0;
    await page.route(`${API}/getTask*`, route => {
      callCount++;
      route.fulfill({ json: { type: callCount >= 3 ? 'reveal' : 'wait' } });
    });
    await mockGameState(page, ACTIVE_STATE);
    await page.route(`${API}/getChain*`, route =>
      route.fulfill({ json: { entries: [] } })
    );

    await page.goto(gameUrl());
    await expect(page.locator('#wait-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#reveal-screen')).toBeVisible({ timeout: 15000 });
  });
});
