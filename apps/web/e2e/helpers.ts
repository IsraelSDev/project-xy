import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Person {
  page: Page;
  name: string;
  email: string;
  password: string;
}

const contexts: BrowserContext[] = [];

// Cada pessoa é uma aba com WebGL por software: deixá-la aberta pesa nos testes seguintes e a mantém
// na sala pública.
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

/** Cadastra uma conta nova (dados de teste únicos) e espera entrar na sala. */
export async function registerAndEnter(browser: Browser, name: string): Promise<Person> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  const password = `e2e-${randomUUID()}`;
  await page.goto('/');

  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByLabel('Nome público').fill(name);
  await page.getByLabel('Data de nascimento').fill('1990-01-01');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Na sala' })).toBeVisible({
    timeout: 20_000,
  });
  return { page, name, email, password };
}

/** Leva `guest` para a sala de `host` pela lista pública e espera os dois se verem. */
export async function meet(host: Person, guest: Person): Promise<void> {
  const hostRoom = await host.page.locator('.room-title strong').textContent();
  await guest.page.getByRole('button', { name: 'Salas' }).click();
  const entry = guest.page.locator('.rooms li', { hasText: hostRoom ?? '' }).first();
  if (await entry.getByRole('button', { name: 'Entrar' }).isVisible()) {
    await entry.getByRole('button', { name: 'Entrar' }).click();
  } else {
    // Já estão na mesma sala.
    await guest.page.getByRole('button', { name: 'Fechar' }).click();
  }

  await expect(host.page.locator('.players')).toContainText(guest.name, { timeout: 15_000 });
  await expect(guest.page.locator('.players')).toContainText(host.name);
}

export async function sendChat(person: Person, text: string): Promise<void> {
  await person.page.getByPlaceholder('Escreva no chat…').fill(text);
  await person.page.keyboard.press('Enter');
}

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** Dá o papel pela linha de comando (como em produção) e recarrega para o site ler o papel novo. */
export async function promote(person: Person, role: 'MODERATOR' | 'ADMIN'): Promise<void> {
  execSync(`pnpm --filter @3dx/api user:role ${person.email} ${role}`, {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  await person.page.reload();
  await expect(person.page.getByRole('status').filter({ hasText: 'Na sala' })).toBeVisible({
    timeout: 20_000,
  });
}

/** Entra pela tela de login com as credenciais da pessoa. */
export async function login(person: Person): Promise<void> {
  await person.page.getByRole('tab', { name: 'Entrar' }).click();
  await person.page.getByLabel('E-mail').fill(person.email);
  await person.page.getByLabel('Senha', { exact: true }).fill(person.password);
  await person.page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
