import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TICKET_REFRESH_INTERVAL_MS } from '@3dx/contracts';
import { login, meet, promote, registerAndEnter } from './helpers.ts';

/** A suspensão chega a quem está na sala na próxima renovação do ticket. */
const UNTIL_NEXT_REFRESH = TICKET_REFRESH_INTERVAL_MS + 15_000;

test('moderação suspende direto pela sala; contestação aceita devolve o acesso', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const tag = randomUUID().slice(0, 4);
  const mod = await registerAndEnter(browser, `Mod ${tag}`);
  const ana = await registerAndEnter(browser, `Ana ${tag}`);
  await promote(mod, 'MODERATOR');
  await meet(mod, ana);

  // Sanção direta, sem denúncia, com motivo.
  await mod.page
    .locator('.players li', { hasText: ana.name })
    .getByRole('button', { name: 'Moderar' })
    .click();
  const dialog = mod.page.getByRole('dialog', { name: `Moderar ${ana.name}` });
  await dialog.getByLabel('Sanção').selectOption({ label: 'Suspender por 7 dias' });
  await dialog.getByLabel('Motivo (fica na auditoria)').fill('Ofensas repetidas no chat');
  await dialog.getByRole('button', { name: 'Aplicar sanção' }).click();
  await expect(dialog.getByRole('status')).toContainText('Sanção aplicada');
  await dialog.getByRole('button', { name: 'Fechar' }).click();

  // Ana sai na renovação do ticket e, ao tentar entrar, pode contestar.
  await expect(ana.page.getByRole('tab', { name: 'Entrar' })).toBeVisible({
    timeout: UNTIL_NEXT_REFRESH,
  });
  await login(ana);
  await expect(ana.page.getByRole('alert')).toContainText('pode contestar', { timeout: 20_000 });
  const appeal = ana.page.getByRole('region', { name: 'Contestar suspensão' });
  await appeal
    .getByLabel('Por que a sanção deve ser revista?')
    .fill('Foi uma brincadeira entre amigos, peço revisão.');
  await appeal.getByRole('button', { name: 'Enviar contestação' }).click();
  await expect(appeal.getByRole('status')).toContainText('Contestação enviada');

  await login(ana);
  await expect(ana.page.getByRole('alert')).toContainText('em análise', { timeout: 20_000 });

  // A moderação aceita: a sanção é revogada.
  await mod.page.getByRole('button', { name: 'Moderação' }).click();
  const entry = mod.page.locator('.reports li', { hasText: `${ana.name} contesta` });
  await expect(entry).toContainText('Foi uma brincadeira entre amigos');
  await expect(entry).toContainText('Ofensas repetidas no chat');
  await entry.getByRole('button', { name: 'Aceitar e revogar' }).click();
  await expect(entry).toHaveCount(0);

  await login(ana);
  await expect(ana.page.getByRole('status').filter({ hasText: 'Na sala' })).toBeVisible({
    timeout: 30_000,
  });
});
