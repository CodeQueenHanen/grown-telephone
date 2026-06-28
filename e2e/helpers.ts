import { Page } from '@playwright/test';

export const API = 'https://grown-telephone-fn.azurewebsites.net/api';

export interface GameState {
  round: number;
  phase: string;
  playerCount: number;
  myOrder: number;
}

export function mockGameState(page: Page, state: GameState) {
  return page.route(`${API}/gameState*`, route => route.fulfill({ json: state }));
}

export function mockGetTask(page: Page, task: object) {
  return page.route(`${API}/getTask*`, route => route.fulfill({ json: task }));
}

export function mockSubmitText(page: Page) {
  return page.route(`${API}/submitText*`, route => route.fulfill({ json: {} }));
}

export function mockGetChain(page: Page, entries: { round: number; type: string; content: string }[]) {
  return page.route(`${API}/getChain*`, route => route.fulfill({ json: { entries } }));
}
