import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { mockGameState } from './helpers';

test.describe('Lobby', () => {
  test('creates game with unique gameId and playerId in URL on fresh load', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await page.goto('/');
    const url = new URL(page.url());
    expect(url.searchParams.get('gameId')).toBeTruthy();
    expect(url.searchParams.get('playerId')).toBeTruthy();
  });

  test('share link contains gameId but not playerId', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await page.goto('/');
    const gameId = new URL(page.url()).searchParams.get('gameId');
    const shareValue = await page.locator('#share-link').inputValue();
    expect(shareValue).toContain(`gameId=${gameId}`);
    expect(shareValue).not.toContain('playerId');
  });

  test('host is highlighted in player list', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await page.goto('/');
    await expect(page.locator('.player-list li.me')).toContainText('👑 Host');
  });

  test('start button is disabled with only 1 player', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await page.goto('/');
    await expect(page.locator('#start-btn')).toBeDisabled();
  });

  test('start button enables when 2 players have joined', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 2, myOrder: 0 });
    await page.goto('/');
    await expect(page.locator('#start-btn')).toBeEnabled();
  });

  test('non-host sees waiting message and no start button', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 2, myOrder: 1 });
    await page.goto(`/?gameId=${randomUUID()}&playerId=${randomUUID()}`);
    await expect(page.locator('#start-btn')).toBeHidden();
    await expect(page.locator('#waiting-for-host')).toBeVisible();
  });

  test('non-host is highlighted as Player 2 in player list', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 2, myOrder: 1 });
    await page.goto(`/?gameId=${randomUUID()}&playerId=${randomUUID()}`);
    await expect(page.locator('.player-list li.me')).toContainText('Player 2');
  });

  test('player badge is hidden while on lobby screen', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await page.goto('/');
    await expect(page.locator('#player-badge')).toBeHidden();
  });

  test('copy button text resets after 2 seconds', async ({ page }) => {
    await mockGameState(page, { round: 0, phase: 'lobby', playerCount: 1, myOrder: 0 });
    await page.goto('/');
    await page.locator('.share-box button').click();
    await expect(page.locator('.share-box button')).toHaveText('Copied!');
    await expect(page.locator('.share-box button')).toHaveText('Copy', { timeout: 3000 });
  });
});
