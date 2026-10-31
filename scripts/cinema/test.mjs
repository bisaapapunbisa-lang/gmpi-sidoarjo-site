import { chromium as playwright } from 'playwright-core';
import chromium, { inflate } from '@sparticuz/chromium';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { mkdirSync, statSync } from 'node:fs';

const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
mkdirSync('.cache/cinema/tests', { recursive: true });
const executablePath = await chromium.executablePath();
const libPath = join(tmpdir(), 'al2023', 'lib');
await inflate(join(process.cwd(), 'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
const browser = await playwright.launch({ executablePath, args: chromium.args, headless: true, env: { ...process.env, LD_LIBRARY_PATH: `${libPath}:${process.env.LD_LIBRARY_PATH || ''}` } });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/sinematik.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.cinemaPlayer?.getState().ready);
  assert.equal(await page.locator('#film-error').isVisible(), false);
  assert.equal(await page.locator('#hero-play').isEnabled(), true);
  await page.screenshot({ path: '.cache/cinema/tests/desktop.png', fullPage: true });
  await page.locator('#hero-play').click();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => cinemaPlayer.getState().playing), true);
  assert.ok(await page.evaluate(() => cinemaPlayer.getState().time > .3));
  await page.locator('#play-toggle').click();
  assert.equal(await page.evaluate(() => cinemaPlayer.getState().playing), false);
  await page.locator('#gentle-toggle').click();
  assert.equal(await page.locator('#gentle-toggle').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-time="12"]').click();
  assert.ok(await page.evaluate(() => cinemaPlayer.getState().time >= 12));
  await page.locator('#play-toggle').click();
  await page.locator('#sound-toggle').click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  await page.locator('#sound-toggle').click();
  await page.evaluate(() => cinemaPlayer.seek(23.8));
  await page.locator('#play-toggle').click();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => cinemaPlayer.getState().time), 24);
  assert.equal(await page.evaluate(() => cinemaPlayer.getState().playing), false);
  await page.locator('#replay').click();
  assert.ok(await page.evaluate(() => cinemaPlayer.getState().time < 1));
  await page.evaluate(() => cinemaPlayer.seek(15));
  await page.locator('#timeline').fill('7.5');
  assert.equal(await page.evaluate(() => cinemaPlayer.getState().time), 7.5);
  const download = await page.request.get(`${base}/unduh-film`, { headers: { Range: 'bytes=0-1023' } });
  assert.equal(download.status(), 206);
  assert.equal(download.headers()['content-type'], 'video/mp4');
  assert.match(download.headers()['content-disposition'], /^attachment;/);
  assert.equal((await download.body()).length, 1024);
  const [downloadEvent] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-top').click()
  ]);
  assert.equal(downloadEvent.suggestedFilename(), 'DPD-GMPI-Sidoarjo-Cahaya-Perjuangan-4K.mp4');
  const downloadedPath = await downloadEvent.path();
  assert.ok(downloadedPath);
  assert.ok(statSync(downloadedPath).size > 20 * 1024 * 1024);
  assert.equal(await page.locator('.download-strip').isVisible(), true);
  const home = await page.request.get(`${base}/index.html`);
  assert.equal(home.status(), 200);
  assert.ok((await home.text()).includes('href="sinematik.html"'));

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(`${base}/sinematik.html`, { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => window.cinemaPlayer?.getState().ready);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: '.cache/cinema/tests/mobile.png', fullPage: true });
  assert.equal(await mobile.locator('#download-top').isVisible(), true);
  assert.equal(await mobile.locator('.download-strip').isVisible(), true);
  await mobile.locator('#hero-play').tap();
  assert.equal(await mobile.evaluate(() => cinemaPlayer.getState().playing), true);

  const reduced = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await reduced.goto(`${base}/sinematik.html`, { waitUntil: 'networkidle' });
  await reduced.waitForFunction(() => window.cinemaPlayer?.getState().ready);
  assert.equal(await reduced.evaluate(() => cinemaPlayer.getState().gentle), true);
  assert.equal(await reduced.evaluate(() => cinemaPlayer.getState().playing), false);
  assert.deepEqual(errors, []);
  console.log('PASS: desktop playback, pause, replay, seek, chapters, sound, gentle lighting, end state, 4K range + real browser download, visible download actions, homepage link, mobile layout/tap, reduced motion, no page errors.');
} finally { await browser.close(); }
