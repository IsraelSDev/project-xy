/**
 * Confere o painel de roupa do mundo: abrir, tirar uma peça, vestir de novo e "tirar a roupa".
 * O que importa é o avatar salvo na API (é o que os outros jogadores recebem pelo ticket) — e não
 * só o que a lista mostra.
 *
 * Uso: com API (:3000), realtime (:2567) e web (:5173) no ar:
 *   node scripts/outfit-check.mjs [http://localhost:5173]
 *
 * O cadastro tem limite de 5 por minuto por IP: rode uma vez por minuto.
 */
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5173';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);

const report = {};
const avatar = async () => (await page.request.get(`${BASE}/api/avatar`)).json();
const summary = async () => (await page.locator('.outfit-summary').textContent())?.trim();
const pieces = () =>
  page.locator('.outfit-body > .outfit-grid .outfit-tile-name').allTextContents();

try {
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.getByRole('tab', { name: 'Criar conta' }).click({ timeout: 120_000 });
  await page.getByLabel('E-mail').fill(`roupa-${randomUUID().slice(0, 8)}@example.test`);
  await page.getByLabel('Senha').fill(`roupa-${randomUUID()}`);
  await page.getByLabel('Nome público').fill(`Roupa ${randomUUID().slice(0, 4)}`);
  await page.getByLabel('Data de nascimento').fill('1990-01-01');
  await page.getByRole('checkbox', { name: /Li e aceito/i }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.locator('p.stats').first().waitFor({ timeout: 120_000 });
  // O aviso de cookies cobre o rodapé; o teste escolhe "só essenciais" e segue.
  if (await page.locator('.cookie-banner').isVisible()) {
    await page.getByRole('button', { name: 'Só essenciais' }).click();
  }

  // Abre o painel: lista o que está vestido, sem abrir o vestiário.
  await page.locator('.outfit-header').click({ timeout: 60_000 });
  await page.locator('.outfit-tile').first().waitFor({ timeout: 30_000 });
  report.initial = { summary: await summary(), pieces: await pieces() };
  // Captura para conferir a grade de miniaturas sem abrir a tela.
  report.screenshot = `${process.env.TEMP ?? '.'}/3dx-outfit.png`;
  await page.screenshot({ path: report.screenshot });
  const before = await avatar();

  // Tira a camada de cima (camiseta e casaco juntos) e confere no servidor.
  await page.getByRole('button', { name: /^Tirar camisa/i }).click();
  await page.locator('.outfit-removed').waitFor({ timeout: 20_000 });
  report.afterTopRemoved = {
    summary: await summary(),
    pieces: await pieces(),
    restore: await page.locator('.outfit-removed .outfit-tile-name').allTextContents(),
  };
  const withoutTop = await avatar();
  report.saved = {
    top: [before.top, withoutTop.top],
    outerwear: [before.outerwear, withoutTop.outerwear],
    bottom: withoutTop.bottom,
    underwear: withoutTop.underwear,
  };

  // "Vestir" devolve a peça que saiu.
  await page
    .locator('.outfit-removed')
    .getByRole('button', { name: /^Vestir/i })
    .first()
    .click();
  await page.locator('.outfit-summary', { hasText: '3 peças' }).waitFor({ timeout: 20_000 });
  await page.locator('.outfit-removed').waitFor({ state: 'detached', timeout: 20_000 });
  report.restored = { summary: await summary(), top: (await avatar()).top };

  // "Tirar a roupa": sai a parte de baixo e a camada de cima; a íntima fica. Espera a interface
  // refletir o avatar salvo (o estado chega pelo servidor depois do PUT + ticket novo).
  await page.getByRole('button', { name: 'Tirar a roupa' }).click();
  await page.locator('.outfit-summary', { hasText: '1 peça' }).waitFor({ timeout: 30_000 });
  await page.locator('.outfit-removed').waitFor({ timeout: 30_000 });
  const stripped = await avatar();
  report.stripped = {
    summary: await summary(),
    pieces: await pieces(),
    top: stripped.top,
    bottom: stripped.bottom,
    underwear: stripped.underwear,
  };
  report.undressDisabled = await page.getByRole('button', { name: 'Tirar a roupa' }).isDisabled();

  // O painel continua funcionando depois de despir (o "vestir de novo" fica disponível).
  report.restoreAfterAll = await page
    .locator('.outfit-removed .outfit-tile-name')
    .allTextContents();
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
