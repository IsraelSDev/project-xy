/**
 * Confere o pacote legal: páginas públicas de termos/privacidade/cookies e o consentimento de
 * cookies (banner, escolha salva, reabrir pelas preferências e Analytics condicionado).
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const report = { pages: {} };
try {
  for (const [path, title] of [
    ['/termos-de-uso', 'Termos de Uso'],
    ['/politica-de-privacidade', 'Política de Privacidade'],
    ['/politica-de-cookies', 'Política de Cookies'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'commit' });
    await page.locator('h1').waitFor({ timeout: 30_000 });
    report.pages[path] = {
      title: (await page.locator('h1').textContent())?.trim(),
      sections: await page.locator('.legal-page section').count(),
      links: await page.locator('.legal-nav a').count(),
      ok: (await page.locator('h1').textContent())?.trim() === title,
    };
  }
  await page.screenshot({ path: `${process.env.TEMP}/3dx-legal.png` });
  report.screenshot = `${process.env.TEMP}/3dx-legal.png`;

  // Banho novo no site: o aviso aparece; "Só essenciais" grava e não volta ao recarregar.
  await context.clearCookies();
  await page.goto(`${BASE}/`, { waitUntil: 'commit' });
  await page.locator('.cookie-banner').waitFor({ timeout: 30_000 });
  report.bannerOnFirstVisit = true;

  await page.getByRole('button', { name: 'Só essenciais' }).click();
  await page.locator('.cookie-banner').waitFor({ state: 'detached', timeout: 10_000 });
  report.saved = await page.evaluate(() => localStorage.getItem('3dx:cookie-consent'));

  await page.reload({ waitUntil: 'commit' });
  await page
    .locator('.cookie-banner')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => undefined);
  report.bannerAfterReload = await page.locator('.cookie-banner').count();
  report.analyticsBefore = await page.evaluate(
    () => document.querySelectorAll('script[src*="insights"]').length,
  );

  // Reabrir pelas preferências e aceitar a medição de audiência.
  await page.getByRole('button', { name: 'Preferências de cookies' }).click();
  await page.locator('.cookie-banner').waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Preferências', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Medição de audiência' }).check();
  await page.getByRole('button', { name: 'Salvar escolha' }).click();
  await page.locator('.cookie-banner').waitFor({ state: 'detached', timeout: 10_000 });
  report.accepted = await page.evaluate(() => localStorage.getItem('3dx:cookie-consent'));
  await page.waitForTimeout(500);
  report.analyticsScript = await page.evaluate(
    () => document.querySelectorAll('script[src*="insights"]').length,
  );
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
