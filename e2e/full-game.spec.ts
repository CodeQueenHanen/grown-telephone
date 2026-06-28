/**
 * Full 3-player game simulation.
 *
 * Three browser contexts act as three independent players. All Azure API calls
 * are intercepted by a single shared in-memory state machine so the test runs
 * completely offline.
 *
 * Turn order is deterministic: p0 writes → p1 draws → p2 guesses → all reveal.
 */

import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';

const API = 'https://grown-telephone-fn.azurewebsites.net/api';

// 1×1 transparent PNG returned for mock drawing blob URLs so the <img> loads.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// ─── In-memory backend ───────────────────────────────────────────────────────

function createBackend(totalPlayers: number) {
  const gameId = randomUUID();
  // Players pre-registered with staggered joinedAt so sort order is stable.
  const players: Array<{ id: string; order: number; joinedAt: number }> = [];
  const chain: Array<{ round: number; type: string; content: string }> = [];
  let phase: 'lobby' | 'active' | 'reveal' = 'lobby';
  let round = 0;

  return {
    gameId,
    players,
    chain,
    phase: () => phase,
    round: () => round,

    /** Call before navigation to lock in join order. */
    preRegister(playerId: string) {
      players.push({ id: playerId, order: -1, joinedAt: (players.length + 1) * 1000 });
    },

    myOrder(playerId: string) {
      const sorted = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
      return sorted.findIndex(p => p.id === playerId);
    },

    startGame() {
      if (phase !== 'lobby') return;
      const sorted = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
      sorted.forEach((p, i) => { p.order = i; });
      phase = 'active';
    },

    getTask(playerId: string): object {
      if (phase === 'reveal') return { type: 'reveal' };
      if (phase !== 'active') return { type: 'wait' };
      const me = players.find(p => p.id === playerId);
      if (!me || me.order !== round) return { type: 'wait' };
      if (round === 0) return { type: 'write' };
      const prev = chain[round - 1];
      if (!prev) return { type: 'wait' };
      return prev.type === 'text'
        ? { type: 'draw', prompt: prev.content }
        : { type: 'guess', blobUrl: prev.content };
    },

    advance(type: string, content: string) {
      chain.push({ round, type, content });
      round++;
      if (round >= totalPlayers) phase = 'reveal';
    },
  };
}

type Backend = ReturnType<typeof createBackend>;

// ─── Per-page route wiring ───────────────────────────────────────────────────

async function wireRoutes(page: Page, backend: Backend, playerId: string) {
  await page.route(`${API}/gameState*`, route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('start') === 'true') backend.startGame();
    route.fulfill({
      json: {
        round: backend.round(),
        phase: backend.phase(),
        playerCount: backend.players.length,
        myOrder: backend.myOrder(playerId),
      },
    });
  });

  await page.route(`${API}/getTask*`, route =>
    route.fulfill({ json: backend.getTask(playerId) })
  );

  await page.route(`${API}/submitText*`, async route => {
    const body = await route.request().postDataJSON() as { text: string };
    backend.advance('text', body.text);
    route.fulfill({ json: {} });
  });

  await page.route(`${API}/submitDrawing*`, route => {
    const blobUrl = `https://mock-drawings/${backend.gameId}/${backend.round()}.png`;
    backend.advance('drawing', blobUrl);
    route.fulfill({ json: { blobUrl } });
  });

  await page.route(`${API}/getChain*`, route =>
    route.fulfill({ json: { entries: [...backend.chain] } })
  );

  // Serve the mock drawing images so <img src="…"> doesn't show a broken state.
  await page.route('https://mock-drawings/**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG })
  );
}

// ─── Canvas helper ───────────────────────────────────────────────────────────

async function drawOnCanvas(page: Page) {
  const canvas = page.locator('#canvas');
  await expect(canvas).toBeVisible({ timeout: 10000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // A drag across the canvas triggers the pointermove handler and sets hasStroke.
  await page.mouse.move(cx - 60, cy - 20);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('#draw-submit')).toBeEnabled({ timeout: 5000 });
}

// ─── Test ────────────────────────────────────────────────────────────────────

test('3 players complete a full game from lobby to reveal without errors', async ({ browser }) => {
  test.setTimeout(90_000);

  const p0Id = randomUUID();
  const p1Id = randomUUID();
  const p2Id = randomUUID();

  const backend = createBackend(3);
  // Pre-register in join order so turn assignments are deterministic.
  backend.preRegister(p0Id); // order 0 → writes
  backend.preRegister(p1Id); // order 1 → draws
  backend.preRegister(p2Id); // order 2 → guesses

  const ctx0 = await browser.newContext();
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p0 = await ctx0.newPage();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  try {
    await wireRoutes(p0, backend, p0Id);
    await wireRoutes(p1, backend, p1Id);
    await wireRoutes(p2, backend, p2Id);

    // ── 1. Lobby: all three players join ─────────────────────────────────
    const lobbyUrl = `/?gameId=${backend.gameId}`;
    await Promise.all([
      p0.goto(`${lobbyUrl}&playerId=${p0Id}`),
      p1.goto(`${lobbyUrl}&playerId=${p1Id}`),
      p2.goto(`${lobbyUrl}&playerId=${p2Id}`),
    ]);

    await Promise.all([
      expect(p0.locator('#player-count')).toHaveText('3', { timeout: 10000 }),
      expect(p1.locator('#player-count')).toHaveText('3', { timeout: 10000 }),
      expect(p2.locator('#player-count')).toHaveText('3', { timeout: 10000 }),
    ]);

    // ── 2. Host starts the game ───────────────────────────────────────────
    // startGame() is global on the page; bypass the host-only button restriction
    // since all three joined via URL params (none is "creator" in the UI sense).
    await p0.evaluate(() => (window as any).startGame());

    // ── 3. Round 0 — Player 0 writes a phrase ────────────────────────────
    await expect(p0.locator('#write-screen')).toBeVisible({ timeout: 10000 });
    await p0.locator('#phrase-input').fill('a dinosaur eating a pizza');
    await p0.locator('#phrase-submit').click();
    await expect(p0.locator('#wait-screen')).toBeVisible({ timeout: 5000 });

    // ── 4. Round 1 — Player 1 draws the phrase ───────────────────────────
    // p1 is in the enterGameLoop wait-poll (3 s interval); the draw screen
    // appears once round advances to 1.
    await expect(p1.locator('#draw-screen')).toBeVisible({ timeout: 15000 });
    await expect(p1.locator('#draw-prompt')).toContainText('a dinosaur eating a pizza');
    await drawOnCanvas(p1);
    await p1.locator('#draw-submit').click();
    await expect(p1.locator('#wait-screen')).toBeVisible({ timeout: 5000 });

    // ── 5. Round 2 — Player 2 guesses the drawing ────────────────────────
    await expect(p2.locator('#guess-screen')).toBeVisible({ timeout: 15000 });
    await expect(p2.locator('#guess-img')).toHaveAttribute('src', /mock-drawings/, { timeout: 5000 });
    await p2.locator('#guess-input').fill('a giant lizard with food');
    await p2.locator('#guess-screen button.btn-primary').click();
    await expect(p2.locator('#wait-screen')).toBeVisible({ timeout: 5000 });

    // ── 6. All three players reach the reveal screen ──────────────────────
    // Players 0 and 1 are polling gameState (pollForReveal); player 2 joins them
    // after submitting. The poll interval is 3 s so allow up to 15 s.
    await Promise.all([
      expect(p0.locator('#reveal-screen')).toBeVisible({ timeout: 15000 }),
      expect(p1.locator('#reveal-screen')).toBeVisible({ timeout: 15000 }),
      expect(p2.locator('#reveal-screen')).toBeVisible({ timeout: 15000 }),
    ]);

    // ── 7. All three players see the step-by-step reveal ─────────────────
    // The intro shows for 2.8 s before reveal-steps becomes active.
    await Promise.all([
      expect(p0.locator('#reveal-steps')).toBeVisible({ timeout: 6000 }),
      expect(p1.locator('#reveal-steps')).toBeVisible({ timeout: 6000 }),
      expect(p2.locator('#reveal-steps')).toBeVisible({ timeout: 6000 }),
    ]);

    // Step 1 should be the original phrase on all screens.
    await Promise.all([
      expect(p0.locator('#reveal-step-content')).toContainText('a dinosaur eating a pizza'),
      expect(p1.locator('#reveal-step-content')).toContainText('a dinosaur eating a pizza'),
      expect(p2.locator('#reveal-step-content')).toContainText('a dinosaur eating a pizza'),
    ]);

    // Advance through the full chain on player 0's screen as a smoke-test.
    await p0.locator('#reveal-next-btn').click(); // step 2 (drawing)
    await p0.locator('#reveal-next-btn').click(); // step 3 (guess)
    await p0.locator('#reveal-next-btn').click(); // full chain
    await expect(p0.locator('#reveal-all')).toBeVisible();
    await expect(p0.locator('.chain-entry')).toHaveCount(3);
    await expect(p0.locator('.chain-entry').last()).toContainText('a giant lizard with food');

  } finally {
    await ctx0.close();
    await ctx1.close();
    await ctx2.close();
  }
});
