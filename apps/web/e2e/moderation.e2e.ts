import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { TICKET_REFRESH_INTERVAL_MS } from '@3dx/contracts';
import { login, meet, promote, registerAndEnter, sendChat, type Person } from './helpers.ts';

/** A sanção chega a quem está na sala na próxima renovação do ticket. */
const UNTIL_NEXT_REFRESH = TICKET_REFRESH_INTERVAL_MS + 10_000;

async function report(reporter: Person, target: Person): Promise<void> {
  await reporter.page
    .locator('.players li', { hasText: target.name })
    .getByRole('button', { name: 'Denunciar' })
    .click();
  await reporter.page.getByRole('button', { name: 'Enviar denúncia' }).click();
  await expect(reporter.page.getByText('Denúncia enviada')).toBeVisible();
  await reporter.page.getByRole('button', { name: 'Fechar' }).click();
}

/** Abre a fila de moderação e resolve a denúncia contra `targetName` com a sanção escolhida. */
async function resolveWith(moderator: Page, targetName: string, sanction: string): Promise<void> {
  await moderator.getByRole('button', { name: 'Moderação' }).click();
  const entry = moderator.locator('.reports li', { hasText: `${targetName} denunciado` }).first();
  await entry.getByLabel('Sanção ao resolver').selectOption({ label: sanction });
  await entry.getByRole('button', { name: 'Resolver' }).click();
  await expect(moderator.locator('.reports li', { hasText: `${targetName}:` })).toBeVisible();
  await moderator.getByRole('button', { name: 'Fechar' }).click();
}

test('moderação silencia e depois suspende quem foi denunciado', async ({ browser }) => {
  // Três cadastros com WebGL por software e duas esperas pela renovação do ticket.
  test.setTimeout(240_000);
  const tag = randomUUID().slice(0, 4);
  const ana = await registerAndEnter(browser, `Ana ${tag}`);
  const bia = await registerAndEnter(browser, `Bia ${tag}`);
  await meet(ana, bia);

  // Primeira pessoa da moderação: o papel vem da linha de comando, como em produção.
  const mod = await registerAndEnter(browser, `Mod ${tag}`);
  await promote(mod, 'MODERATOR');

  await report(ana, bia);
  await resolveWith(mod.page, bia.name, 'Silenciar por 1 hora');

  // Silenciada: continua na sala, mas o chat recusa (vale a partir da renovação do ticket).
  await expect(async () => {
    await sendChat(bia, `ainda falo? ${randomUUID().slice(0, 4)}`);
    await expect(bia.page.locator('.chat-notice')).toContainText('silenciado', {
      timeout: 2000,
    });
  }).toPass({ timeout: UNTIL_NEXT_REFRESH, intervals: [3000] });
  await expect(bia.page.getByRole('status').filter({ hasText: 'Na sala' })).toBeVisible();

  await report(ana, bia);
  await resolveWith(mod.page, bia.name, 'Suspender por 7 dias');

  // Suspensa: a sessão cai na renovação seguinte e o login é recusado com o motivo.
  await expect(bia.page.getByRole('tab', { name: 'Entrar' })).toBeVisible({
    timeout: UNTIL_NEXT_REFRESH,
  });
  await expect(ana.page.locator('.players')).not.toContainText(bia.name, { timeout: 60_000 });
  await login(bia);
  // O login (scrypt) disputa a CPU com o WebGL por software das outras abas.
  await expect(bia.page.getByRole('alert')).toContainText('Conta suspensa', { timeout: 20_000 });
});
