import { randomUUID } from 'node:crypto';
import { chromium, devices } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = {};

try {
  // Celular: `hasTouch` faz `(pointer: coarse)` casar e o componente aparecer.
  const mobile = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await mobile.newPage();
  await page.goto(BASE);
  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('E-mail').fill(`touch-${randomUUID().slice(0, 8)}@example.test`);
  await page.getByLabel('Senha').fill(`touch-${randomUUID()}`);
  await page.getByLabel('Nome público').fill(`Touch ${randomUUID().slice(0, 4)}`);
  await page.getByLabel('Data de nascimento').fill('1990-01-01');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.locator('p.stats').first().waitFor({ timeout: 30_000 });

  report.padVisible = await page.locator('.touch-pad').isVisible();
  report.buttons = await page.locator('.touch-buttons button').allTextContents();
  report.hudShifted = await page.evaluate(() =>
    document.body.classList.contains('touch-ui'),
  );

  // Arrasta o joystick para a direita e confere que ele move o knob (o eixo em si é testado no vitest).
  const pad = page.locator('.touch-pad');
  const box = await pad.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(
    ({ cx, cy }) => {
      const pad = document.querySelector('.touch-pad');
      const opts = { pointerId: 7, bubbles: true, pointerType: 'touch', clientX: cx + 40, clientY: cy };
      pad.dispatchEvent(new PointerEvent('pointerdown', opts));
      pad.dispatchEvent(new PointerEvent('pointermove', opts));
    },
    { cx, cy },
  );
  report.knobAfterDrag = await page.locator('.touch-knob').evaluate((node) => node.style.transform);
  await mobile.close();

  // Desktop: nada de controles de toque.
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desk = await desktop.newPage();
  await desk.goto(BASE);
  report.desktopPad = await desk.locator('.touch-pad').count();
  await desktop.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
