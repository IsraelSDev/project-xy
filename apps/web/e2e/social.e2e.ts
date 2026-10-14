import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { meet, registerAndEnter, sendChat } from './helpers.ts';

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
  const bia = await registerAndEnter(browser, `Bia ${tag}`);
  await meet(ana, bia);

  await sendChat(ana, `olá da Ana ${tag}`);
  await expect(bia.page.locator('.chat-messages')).toContainText(`olá da Ana ${tag}`, {
    timeout: 10_000,
  });
});
