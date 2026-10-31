/**
 * Confere os painéis flutuantes do mundo: arrastar pelo cabeçalho e lembrar a posição ao recarregar.
 * Uso: com API (:3000), realtime (:2567) e web (:5173) no ar.
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

const positionOf = async (selector) =>
  page.locator(selector).evaluate((node) => ({
    left: node.style.left,
    top: node.style.top,
    x: node.getBoundingClientRect().x,
    y: node.getBoundingClientRect().y,
  }));

await page.goto(BASE, { waitUntil: 'commit' });
await page.getByRole('tab', { name: 'Criar conta' }).click({ timeout: 120_000 });
await page.getByLabel('E-mail').fill(`hud-${randomUUID().slice(0, 8)}@example.test`);
await page.getByLabel('Senha').fill(`hud-${randomUUID()}`);
await page.getByLabel('Nome público').fill(`HUD ${randomUUID().slice(0, 4)}`);
await page.getByLabel('Data de nascimento').fill('1990-01-01');
await page.getByRole('button', { name: 'Criar conta' }).click();
await page.locator('p.stats').first().waitFor({ timeout: 120_000 });

const report = {};
// Clique curto no cabeçalho abre/fecha o painel; o arraste não deve abrir.
await page.locator('.world-panel-voice .voice-header').click();
await page.waitForTimeout(200);
report.openedByClick = await page.locator('.world-panel-voice .voice-body').count();
await page.locator('.world-panel-voice .voice-header').click();
await page.waitForTimeout(200);
report.closedByClick = await page.locator('.world-panel-voice .voice-body').count();

const before = await positionOf('.world-panel-voice');
const header = await page.locator('.world-panel-voice .voice-header').boundingBox();
await page.mouse.move(header.x + 20, header.y + header.height / 2);
await page.mouse.down();
await page.mouse.move(header.x - 260, header.y + header.height / 2 - 40, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await positionOf('.world-panel-voice');
report.drag = { before, after, moved: after.x !== before.x || after.y !== before.y };
report.panelOpenedByDrag = await page.locator('.world-panel-voice .voice-body').count();

// Recarrega: a posição salva no localStorage tem que voltar.
await page.reload({ waitUntil: 'commit' });
await page.locator('p.stats').first().waitFor({ timeout: 120_000 });
const restored = await positionOf('.world-panel-voice');
report.restored = { restored, same: restored.x === after.x && restored.y === after.y };

// Os outros painéis continuam nas posições iniciais e visíveis.
report.panels = {};
for (const [name, selector] of [
  ['roupa', '.world-panel-outfit'],
  ['sala', '.world-panel-room'],
  ['chat', '.world-panel-chat'],
]) {
  report.panels[name] = await positionOf(selector);
}

await page.screenshot({ path: `${process.env.TEMP}/3dx-hud.png` });
report.screenshot = `${process.env.TEMP}/3dx-hud.png`;
console.log(JSON.stringify(report, null, 2));
await browser.close();
