import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

/** Cadastra uma conta nova (dados de teste únicos) e espera entrar na sala. */
async function registerAndEnter(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');

  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('E-mail').fill(`e2e-${randomUUID().slice(0, 8)}@example.test`);
  await page.getByLabel('Senha').fill(`e2e-${randomUUID()}`);
  await page.getByLabel('Nome público').fill(name);
  await page.getByLabel('Data de nascimento').fill('1990-01-01');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Na sala' })).toBeVisible({
    timeout: 20_000,
  });
  return page;
}

test('menor de idade não consegue criar conta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('E-mail').fill(`e2e-${randomUUID().slice(0, 8)}@example.test`);
  await page.getByLabel('Senha').fill(`e2e-${randomUUID()}`);
  await page.getByLabel('Nome público').fill(`Menor ${randomUUID().slice(0, 4)}`);
  await page.getByLabel('Data de nascimento').fill('2015-01-01');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByRole('alert')).toContainText('18 anos');
});

test('duas pessoas entram na mesma sala, se veem e conversam pelo chat', async ({ browser }) => {
  const tag = randomUUID().slice(0, 4);
  const ana = await registerAndEnter(browser, `Ana ${tag}`);

  // A segunda pessoa vai para a sala da primeira pelo diálogo de salas (a lista pública).
  const bia = await registerAndEnter(browser, `Bia ${tag}`);
  const anaRoom = await ana.locator('.room-title strong').textContent();
  await bia.getByRole('button', { name: 'Salas' }).click();
  const anaRoomEntry = bia.locator('.rooms li', { hasText: anaRoom ?? '' }).first();
  if (await anaRoomEntry.getByRole('button', { name: 'Entrar' }).isVisible()) {
    await anaRoomEntry.getByRole('button', { name: 'Entrar' }).click();
  } else {
    await bia.getByRole('button', { name: 'Fechar' }).click();
  }

  await expect(ana.locator('.players')).toContainText(`Bia ${tag}`, { timeout: 15_000 });
  await expect(bia.locator('.players')).toContainText(`Ana ${tag}`);

  await ana.getByPlaceholder('Escreva no chat…').fill(`olá da Ana ${tag}`);
  await ana.keyboard.press('Enter');

  await expect(bia.locator('.chat-messages')).toContainText(`olá da Ana ${tag}`, {
    timeout: 10_000,
  });
});
