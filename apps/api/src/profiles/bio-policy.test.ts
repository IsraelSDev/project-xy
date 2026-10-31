import { describe, expect, it } from 'vitest';
import { bioProblem, normalizeBio } from './bio-policy.js';

describe('bioProblem', () => {
  it('aceita texto normal, com acentos e emojis', () => {
    expect(bioProblem('Gosto de dançar, música e conversar. 🎶')).toBeNull();
    expect(bioProblem('Sou do Rio, curto praia e jogos.')).toBeNull();
    // "instante" não é "insta".
    expect(bioProblem('Amo cada instante aqui.')).toBeNull();
  });

  it('recusa links e domínios', () => {
    expect(bioProblem('me segue em https://exemplo.com')).toBe('A bio não pode conter links.');
    expect(bioProblem('site: www.meusite.com')).toBe('A bio não pode conter links.');
    expect(bioProblem('foto no 3dxchat.com.br')).toBe('A bio não pode conter links.');
  });

  it('recusa contato e venda fora da plataforma', () => {
    expect(bioProblem('chama no whatsapp')).toBe(
      'A bio não pode divulgar contato ou venda fora da plataforma.',
    );
    expect(bioProblem('meu telegram é @fulano')).toBe(
      'A bio não pode divulgar contato ou venda fora da plataforma.',
    );
    expect(bioProblem('vendo pack')).toBe(
      'A bio não pode divulgar contato ou venda fora da plataforma.',
    );
  });

  it('não cai com acento, caixa alta nem caractere invisível', () => {
    expect(bioProblem('WHATSÁPP')).not.toBeNull();
    expect(bioProblem('Wha\u200btsApp')).not.toBeNull();
    expect(bioProblem('TELEGRAM')).not.toBeNull();
  });

  it('normaliza para comparação', () => {
    expect(normalizeBio('  Olá   MUNDO ')).toBe('ola mundo');
  });
});
