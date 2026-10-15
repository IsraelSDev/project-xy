import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { AccountExport } from '@3dx/contracts';
import { login, registerAndEnter } from './helpers.ts';

test('exporta os dados e exclui a conta', async ({ browser }) => {
  const ana = await registerAndEnter(browser, `Ana ${randomUUID().slice(0, 4)}`);
  const { page } = ana;
  await page.getByRole('button', { name: 'Conta' }).click();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados' }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^3dxchat-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await file.path(), 'utf8')) as AccountExport;
  expect(data.account).toMatchObject({ email: ana.email, displayName: ana.name });

  const deletion = page.locator('form', { hasText: 'Entendo que a exclusão é definitiva.' });
  await deletion.getByLabel('Senha atual').fill(ana.password);
  await deletion.getByLabel('Entendo que a exclusão é definitiva.').check();
  await deletion.getByRole('button', { name: 'Excluir minha conta' }).click();

  await expect(page.getByRole('status')).toContainText('Conta excluída', { timeout: 15_000 });
  await login(ana);
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos', {
    timeout: 20_000,
  });
});
