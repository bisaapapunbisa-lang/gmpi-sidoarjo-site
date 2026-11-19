import { chromium as playwright } from 'playwright-core';
import chromium, { inflate } from '@sparticuz/chromium';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
const REV = '2026-10-31-gmpi-sidoarjo';
mkdirSync('.cache/branding/tests', { recursive: true });
const executablePath = await chromium.executablePath();
const libPath = join(tmpdir(), 'al2023', 'lib');
await inflate(join(process.cwd(), 'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
const browser = await playwright.launch({
  executablePath,
  args: chromium.args,
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: `${libPath}:${process.env.LD_LIBRARY_PATH || ''}` }
});
const errors = [];
const master = readFileSync('assets/logo-gmpi-sidoarjo.webp');
let logoValue = { text: 'logos/legacy-old-logo.png' }; // no revision: must be ignored

async function checkBrand(page, selector) {
  const count = await page.locator(selector).count();
  assert.ok(count > 0, `missing ${selector}`);
  await page.waitForFunction(sel => {
    const els = [...document.querySelectorAll(sel)];
    return els.length > 0 && els.every(el => el.complete && el.naturalWidth > 0);
  }, selector, { timeout: 20000 });
  const infos = await page.locator(selector).evaluateAll(els => els.map(el => ({
    src: el.currentSrc || el.src,
    fit: getComputedStyle(el).objectFit,
    radius: getComputedStyle(el).borderRadius,
    w: el.naturalWidth,
    h: el.naturalHeight
  })));
  for (const info of infos) {
    assert.ok(info.src.includes('logo-gmpi-sidoarjo.webp') || info.src.includes('logos/custom.webp'), info.src);
    assert.equal(info.fit, 'contain');
    assert.equal(info.radius, '0px');
    assert.ok(info.w > 0 && info.h > 0, 'logo failed to load');
  }
}

try {
  // One reused page keeps the sandboxed Chromium memory footprint small.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://iapwzhlcwprzojeruymm.supabase.co/**', async route => {
    const url = route.request().url();
    if (url.includes('/rest/v1/site_content')) {
      return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: logoValue ? [{ key: 'site_logo', value: logoValue }] : [] });
    }
    if (url.includes('/storage/v1/object/public/site-assets/logos/custom.webp')) {
      return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, contentType: 'image/webp', body: master });
    }
    if (url.includes('/rest/v1/')) return route.fulfill({ json: [] });
    return route.fulfill({ status: 200, body: '{}' });
  });

  await page.goto(`${base}/index.html`, { waitUntil: 'commit', timeout: 60000 });
  await checkBrand(page, 'img[data-site-logo]');
  const hero = await page.locator('.hero-emblem').evaluate(el => {
    const r = el.getBoundingClientRect();
    return { ratio: r.width / r.height, clip: getComputedStyle(el.querySelector('img')).clipPath };
  });
  assert.ok(Math.abs(hero.ratio - 889 / 1091) < 0.02, JSON.stringify(hero));
  assert.equal(hero.clip, 'none');
  assert.ok((await page.locator('link[rel="icon"]').getAttribute('href')).includes('v=20261031'));
  assert.ok((await page.locator('meta[property="og:image"]').getAttribute('content')).includes('v=20261031'));
  await page.screenshot({ path: '.cache/branding/tests/home-desktop.png', fullPage: false });

  // A future Admin selection stamped with the current revision is still honored.
  logoValue = { text: 'logos/custom.webp', revision: REV };
  await page.goto(`${base}/index.html?logo-test=custom`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll('img[data-site-logo]')].every(i => i.src.includes('logos/custom.webp')), null, { timeout: 20000 });

  // Mobile layout.
  logoValue = null;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/index.html?logo-test=mobile`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await checkBrand(page, 'img[data-site-logo]');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.cache/branding/tests/home-mobile.png', fullPage: false });

  const pages = [
    ['/berita.html', 'img[data-site-logo]'],
    ['/iuran.html', '.dues-brand img'],
    ['/darurat.html', '.sos-brand img'],
    ['/verifikasi.html', '.vf-brand img'],
    ['/rsvp.html', '.brand img'],
    ['/sinematik.html', '.studio-brand img']
  ];
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [path, selector] of pages) {
    await page.goto(`${base}${path}`, { waitUntil: 'commit', timeout: 60000 });
    await checkBrand(page, selector);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
  }

  assert.deepEqual(errors, []);
  console.log('PASS: official transparent shield on home/news/iuran/darurat/verifikasi/rsvp/cinema, contain not circular-crop, portrait hero ratio, legacy CMS logo ignored, revisioned Admin logo honored, favicon/OG cache-bust, desktop/mobile no overflow, no page errors.');
} finally {
  await browser.close();
}
