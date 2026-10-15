import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { meet, registerAndEnter, type Person } from './helpers.ts';

/** Lista de amigos e ticket se atualizam a cada 20 s; com folga para a CPU do WebGL por software. */
const PROPAGATION = 45_000;

const playerRow = (page: Page, name: string) => page.locator('.players li', { hasText: name });

/** Abre a conversa (a opção ganha "(n)" quando há não lidas, então busca pelo nome). */
async function openConversation(from: Person, to: Person) {
  const panel = from.page.getByRole('region', { name: 'Mensagens privadas' });
  const value = await panel.locator('option', { hasText: to.name }).getAttribute('value');
  await panel.getByRole('combobox').selectOption(value ?? '');
  return panel;
}

async function sendPrivate(from: Person, to: Person, text: string): Promise<void> {
  const panel = await openConversation(from, to);
  await panel.getByPlaceholder('Mensagem privada…').fill(text);
  await panel.getByRole('button', { name: 'Enviar' }).click();
}

test('pedido de amizade, aceite e mensagens privadas', async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = randomUUID().slice(0, 4);
  const ana = await registerAndEnter(browser, `Ana ${tag}`);
  const bia = await registerAndEnter(browser, `Bia ${tag}`);
  await meet(ana, bia);

  await playerRow(ana.page, bia.name).getByRole('button', { name: 'Adicionar amigo' }).click();
  await expect(
    playerRow(ana.page, bia.name).getByRole('button', { name: 'Pedido enviado' }),
  ).toBeDisabled();

  // Bia aceita pela lista da sala (o botão pode estar como "Adicionar" até a lista recarregar:
  // pedir de volta também vira amizade).
  await expect(async () => {
    const row = playerRow(bia.page, ana.name);
    await row.getByRole('button', { name: /Aceitar amizade|Adicionar amigo/ }).click();
    await expect(row).toContainText('· amigo', { timeout: 3000 });
  }).toPass({ timeout: PROPAGATION });
  await expect(bia.page.locator('.chat-notice')).toContainText('agora são amigos');

  // Ana descobre o aceite sem recarregar a página.
  await expect(playerRow(ana.page, bia.name)).toContainText('· amigo', { timeout: PROPAGATION });

  // Bia escreve; Ana vê a conversa com a mensagem como não lida.
  await sendPrivate(bia, ana, `oi Ana ${tag}`);
  await expect(ana.page.getByRole('region', { name: 'Mensagens privadas' })).toContainText(
    '1 não lidas',
    { timeout: PROPAGATION },
  );

  // Ana abre a conversa, lê e responde (quando o ticket dela já tiver a amizade).
  const anaPanel = await openConversation(ana, bia);
  await expect(anaPanel).toContainText(`oi Ana ${tag}`);
  await expect(async () => {
    await sendPrivate(ana, bia, `oi Bia ${tag}`);
    await expect(bia.page.getByRole('region', { name: 'Mensagens privadas' })).toContainText(
      /1 não lidas|oi Bia/,
      { timeout: 3000 },
    );
  }).toPass({ timeout: PROPAGATION });
});
