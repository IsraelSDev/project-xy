/** Confere o PWA no build de produção: manifest servido, service worker ativo e shell offline. */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1024, height: 700 } });
const page = await context.newPage();
const report = {};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  report.manifestHref = manifestHref;

  const manifestResponse = await page.request.get(`${BASE}/manifest.webmanifest`);
  report.manifestStatus = manifestResponse.status();
  report.manifestType = manifestResponse.headers()['content-type'];
  const manifest = await manifestResponse.json();
  report.manifestName = manifest.name;
  report.iconCount = manifest.icons?.length ?? 0;
  report.iconStatuses = [];
  for (const icon of manifest.icons ?? []) {
    const response = await page.request.get(`${BASE}${icon.src}`);
    report.iconStatuses.push(`${icon.src} ${response.status()}`);
  }

  // O registro acontece no `load`; espera o service worker ficar ativo.
  report.registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'sem serviceWorker';
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(undefined), 15_000)),
    ]);
    return registration === undefined ? 'timeout' : 'ativo';
  });
  report.cacheKeys = await page.evaluate(() => caches.keys());

  // Offline: recarrega com a rede desligada e o shell tem que vir do cache.
  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    report.offlineRoot = await page.evaluate(() => document.querySelector('#root') !== null);
    report.offlineTitle = await page.title();
  } catch (error) {
    report.offlineError = String(error).split('\n')[0];
  } finally {
    await context.setOffline(false);
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
