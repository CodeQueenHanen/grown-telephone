import { test, expect } from '@playwright/test';
import { mockGameState, mockGetChain } from './helpers';

const SAMPLE_CHAIN = [
  { round: 0, type: 'text', content: 'a cat on a trampoline' },
  { round: 1, type: 'drawing', content: 'https://example.com/r1.png' },
  { round: 2, type: 'text', content: 'a dog jumping on something' },
];

// All reveal tests drive showReveal() directly via page.evaluate rather than
// going through the full multiplayer flow. The game's showReveal() is a global
// function (non-module script tag) so it's accessible from evaluate.

test.describe('Reveal – intro phase', () => {
  test('shows pencil/notepad emoji and ringing phone while loading chain', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await mockGetChain(page, SAMPLE_CHAIN);
    await page.goto('/');
    await page.evaluate('showReveal()');
    await expect(page.locator('#reveal-intro')).toBeVisible();
    await expect(page.locator('.reveal-emoji')).toContainText('📝');
    await expect(page.locator('#reveal-intro .phone-ringing')).toBeVisible();
  });
});

test.describe('Reveal – step-by-step phase', () => {
  // Use page.clock to skip the 2.8 s intro timer so tests run instantly.
  test.beforeEach(async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await mockGetChain(page, SAMPLE_CHAIN);
    await page.clock.install();
    await page.goto('/');
    // showReveal() is async: it fetches getChain then registers setTimeout(2800).
    // Awaiting it ensures the setTimeout is registered before we fast-forward.
    await page.evaluate('showReveal()');
    await page.clock.fastForward(3000);
    await expect(page.locator('#reveal-steps')).toBeVisible();
  });

  test('shows step 1 of 3 with first phrase', async ({ page }) => {
    await expect(page.locator('#reveal-counter')).toContainText('Step 1 of 3');
    await expect(page.locator('#reveal-step-content')).toContainText('a cat on a trampoline');
  });

  test('next button advances to step 2', async ({ page }) => {
    await page.locator('#reveal-next-btn').click();
    await expect(page.locator('#reveal-counter')).toContainText('Step 2 of 3');
  });

  test('progress bar fills as steps advance', async ({ page }) => {
    // Step 1 = 33% width
    const fill = page.locator('#reveal-progress-fill');
    const w1 = await fill.evaluate((el: HTMLElement) => el.style.width);
    expect(parseFloat(w1)).toBeCloseTo(33.3, 0);

    await page.locator('#reveal-next-btn').click();
    const w2 = await fill.evaluate((el: HTMLElement) => el.style.width);
    expect(parseFloat(w2)).toBeCloseTo(66.7, 0);
  });

  test('last step button label changes to "See the full chain"', async ({ page }) => {
    await page.locator('#reveal-next-btn').click(); // step 2
    await page.locator('#reveal-next-btn').click(); // step 3
    await expect(page.locator('#reveal-next-btn')).toContainText('See the full chain');
  });
});

test.describe('Reveal – full chain phase', () => {
  async function goToFullChain(page: import('@playwright/test').Page) {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await mockGetChain(page, SAMPLE_CHAIN);
    await page.clock.install();
    await page.goto('/');
    await page.evaluate('showReveal()');
    await page.clock.fastForward(3000);
    await expect(page.locator('#reveal-steps')).toBeVisible();
    for (let i = 0; i < SAMPLE_CHAIN.length; i++) {
      await page.locator('#reveal-next-btn').click();
    }
    await expect(page.locator('#reveal-all')).toBeVisible();
  }

  test('shows all chain entries', async ({ page }) => {
    await goToFullChain(page);
    await expect(page.locator('.chain-entry')).toHaveCount(SAMPLE_CHAIN.length);
  });

  test('first entry contains original phrase', async ({ page }) => {
    await goToFullChain(page);
    await expect(page.locator('.chain-entry').first()).toContainText('a cat on a trampoline');
  });

  test('drawing entry contains an image', async ({ page }) => {
    await goToFullChain(page);
    await expect(page.locator('.chain-entry').nth(1).locator('img')).toHaveAttribute(
      'src',
      'https://example.com/r1.png'
    );
  });

  test('play again button reloads the page', async ({ page }) => {
    await goToFullChain(page);
    await page.locator('button:has-text("Play again")').click();
    // After reload the lobby screen is shown again
    await expect(page.locator('#lobby-screen')).toBeVisible({ timeout: 5000 });
  });
});
