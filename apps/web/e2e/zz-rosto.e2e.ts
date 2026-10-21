import { test } from '@playwright/test';
import { registerAndEnter } from './helpers.ts';

const OUT = 'C:/Users/israe/AppData/Local/Temp/opencode/wardrobe';

test('rosto: close no palco', async ({ browser }) => {
  test.setTimeout(300_000);
  const me = await registerAndEnter(browser, `Rosto${Math.random().toString(36).slice(2, 7)}`);
  const page = me.page;
  page.on('pageerror', (error: Error) => console.log('PAGE ERROR:', error.message));

  await page.getByRole('button', { name: 'Vestiário' }).click();
  await page.locator('.wardrobe-loading').waitFor({ state: 'hidden', timeout: 90_000 });
  await page.waitForTimeout(5000);

  await page.locator('.wardrobe-view').getByRole('button', { name: 'Frente' }).click();
  for (let i = 0; i < 4; i++) {
    await page.locator('.wardrobe-view').getByRole('button', { name: '+' }).click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/f3-rosto.png` });

  const canvas = page.locator('.wardrobe-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 70, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/f4-rosto-baixo.png` });

  await page.locator('.wardrobe-catalog').getByRole('button', { name: 'Cancelar' }).click();
  await page.waitForTimeout(2500);
});
