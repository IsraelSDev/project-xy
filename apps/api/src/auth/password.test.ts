import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('senha (scrypt)', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const stored = await hashPassword('correta-e-longa');

    expect(stored.startsWith('scrypt$15$8$1$')).toBe(true);
    await expect(verifyPassword('correta-e-longa', stored)).resolves.toBe(true);
    await expect(verifyPassword('errada-e-longa', stored)).resolves.toBe(false);
  });

  it('usa sal aleatório: a mesma senha gera hashes diferentes', async () => {
    expect(await hashPassword('mesma-senha-123')).not.toBe(await hashPassword('mesma-senha-123'));
  });

  it('hash malformado conta como senha errada, sem exceção', async () => {
    await expect(verifyPassword('qualquer', 'texto-qualquer')).resolves.toBe(false);
  });
});
