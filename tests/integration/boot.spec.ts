// Playwright: the single-file build opened from disk, driven through the
// game-state hook (src/hook.ts). npm run smoke runs only the @boot test.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Opens the build and collects every page error and console error. */
async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(build(query));
  // Until the game installs its hook, window.game is the canvas (an element's id is a window
  // property), so wait for the hook itself: a library may start after the page has loaded.
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return errors;
}

test('boots to the title screen with no errors @boot', async ({ page }) => {
  const errors = await open(page, 'manual=1');
  expect(await page.evaluate(() => window.game!.scene)).toBe('title');
  const size = await page.locator('#game').boundingBox();
  expect(size && size.width > 0 && size.height > 0).toBe(true);
  expect(errors).toEqual([]);
});

test('a scripted run flies the ship, and the same seed repeats it exactly', async ({ page }) => {
  // ?manual=1 stops the loop, so only step() moves the game: one mechanism, no fake clock.
  async function run(): Promise<{ scene: string; moved: number; snapshot: string }> {
    await open(page, 'manual=1&seed=7');
    return page.evaluate(() => {
      const g = window.game!;
      type Z = { ships: { x: number; y: number }[] };
      g.press('Enter'); g.step();
      const s0 = (g.state as Z).ships[0], x0 = s0.x, y0 = s0.y;
      g.hold('ArrowUp', true); g.hold('Space', true); g.step(90);
      g.hold('ArrowUp', false); g.hold('Space', false); g.step(60);
      const s1 = (g.state as Z).ships[0];
      return { scene: g.scene, moved: Math.hypot(s1.x - x0, s1.y - y0), snapshot: JSON.stringify(g.state) };
    });
  }
  const first = await run();
  expect(first.scene).toBe('play');
  expect(first.moved).toBeGreaterThan(100);
  expect(await run()).toEqual(first);
  void config;
});

test('pause stops the zone and the figure sheet draws', async ({ page }) => {
  const errors = await open(page, 'manual=1');
  const t = await page.evaluate(() => {
    const g = window.game!; g.press('Enter'); g.step(10); g.press('KeyP'); g.step(1);
    const before = (g.state as { t: number }).t; g.step(60);
    return { scene: g.scene, same: (g.state as { t: number }).t === before };
  });
  expect(t).toEqual({ scene: 'pause', same: true });
  await open(page, 'manual=1&scene=figures');
  expect(await page.evaluate(() => window.game!.scene)).toBe('figures');
  expect(errors).toEqual([]);
});
