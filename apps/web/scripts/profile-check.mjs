/** Confere o perfil social: localização, aniversário visível e atividade (avatar/sala). */
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);

await page.goto(BASE, { waitUntil: 'commit' });
await page.getByRole('tab', { name: 'Criar conta' }).click({ timeout: 120_000 });
await page.getByLabel('E-mail').fill(`perfil-${randomUUID().slice(0, 8)}@example.test`);
await page.getByLabel('Senha').fill(`perfil-${randomUUID()}`);
await page.getByLabel('Nome público').fill(`Perfil ${randomUUID().slice(0, 4)}`);
await page.getByLabel('Data de nascimento').fill('1990-05-12');
await page.getByRole('button', { name: 'Criar conta' }).click();
await page.locator('p.stats').first().waitFor({ timeout: 120_000 });

const report = {};
await page.getByRole('button', { name: 'Perfil' }).click();
await page.locator('.profile-dialog').waitFor();
report.before = await page.locator('.profile-facts').count();

await page.getByLabel('Localização').fill('São Paulo, SP');
await page.getByLabel('Mostrar aniversário').check();
await page.getByRole('button', { name: 'Salvar' }).click();
await page.getByText('Perfil salvo.').waitFor({ timeout: 20_000 });

const saved = await (await page.request.get(`${BASE}/api/profiles/me`)).json();
report.saved = {
  location: saved.location,
  birthday: saved.birthday,
  activity: (
    await (await page.request.get(`${BASE}/api/profiles/${saved.id}/activity`)).json()
  ).map((item) => item.kind),
};
report.facts = await page.locator('.profile-facts').allTextContents();
await page.screenshot({ path: `${process.env.TEMP}/3dx-profile.png` });
report.screenshot = `${process.env.TEMP}/3dx-profile.png`;
console.log(JSON.stringify(report, null, 2));
await browser.close();
