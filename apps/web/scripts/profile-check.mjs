/**
 * Confere o perfil social: localização, aniversário, status, opções do perfil (procurando,
 * pronomes, interesses, idiomas) pela interface e na API; e que a seção "Atividade" saiu.
 */
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
report.activityBefore = await page.locator('.profile-activity').count();

await page.getByLabel('Localização').fill('São Paulo, SP');
await page.getByLabel('Mostrar aniversário').check();
await page.getByLabel('Status').fill('Na vibe de dançar até tarde');
await page.getByLabel('Procurando').selectOption('dance');
await page.getByLabel('Pronomes').selectOption('they');
await page.getByRole('button', { name: 'Música', exact: true }).click();
await page.getByRole('button', { name: 'Dança', exact: true }).click();
await page.getByRole('button', { name: 'Português', exact: true }).click();
await page.getByRole('button', { name: 'Inglês', exact: true }).click();
await page.getByRole('button', { name: 'Salvar' }).click();
await page.getByText('Perfil salvo.').waitFor({ timeout: 20_000 });

const saved = await (await page.request.get(`${BASE}/api/profiles/me`)).json();
report.saved = {
  location: saved.location,
  status: saved.status,
  lookingFor: saved.lookingFor,
  pronouns: saved.pronouns,
  interests: saved.interests,
  languages: saved.languages,
  birthday: saved.birthday,
};
report.activityAfter = await page.locator('.profile-activity').count();
report.header = (await page.locator('.profile-dialog').innerText()).slice(0, 900);
await page.screenshot({ path: `${process.env.TEMP}/3dx-profile.png` });
report.screenshot = `${process.env.TEMP}/3dx-profile.png`;
console.log(JSON.stringify(report, null, 2));
await browser.close();
