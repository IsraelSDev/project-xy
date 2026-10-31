import { MoveMessage } from '@3dx/contracts';
import { MatchMakeError } from '@colyseus/sdk';
import { describe, expect, it } from 'vitest';
import { describeJoinError, retryDelay, toMoveMessage } from './lounge-connection';

describe('retryDelay', () => {
  it('dobra a cada tentativa até o teto', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(retryDelay)).toEqual([
      1000, 2000, 4000, 8000, 15_000, 15_000, 15_000,
    ]);
  });
});

describe('describeJoinError', () => {
  it('repassa a mensagem de recusa do servidor (4xx)', () => {
    const error = new MatchMakeError('Versão do cliente incompatível com o servidor.', 400);
    expect(describeJoinError(error)).toBe('Versão do cliente incompatível com o servidor.');
  });

  it('sala que não existe mais tem mensagem própria', () => {
    expect(describeJoinError(new MatchMakeError('room not found', 522))).toBe(
      'Essa sala não existe mais.',
    );
  });

  it.each([
    ['proxy sem backend (502)', new MatchMakeError('Bad Gateway', 502)],
    ['conexão recusada', new MatchMakeError('fetch failed', 'ECONNREFUSED' as unknown as number)],
    ['erro inesperado', new TypeError('Failed to fetch')],
  ])('%s vira mensagem genérica, sem detalhe técnico', (_, error) => {
    expect(describeJoinError(error)).toBe('Servidor de tempo real indisponível.');
  });
});

describe('toMoveMessage', () => {
  it('sempre produz uma mensagem válida para o contrato', () => {
    const almostOne = { x: 1 + Number.EPSILON, z: -1 - Number.EPSILON };
    expect(MoveMessage.safeParse(toMoveMessage(almostOne)).success).toBe(true);
  });

  it('leva o pedido de corrida (SHIFT) sem inventar velocidade', () => {
    expect(toMoveMessage({ x: 0, z: 1 }, true)).toEqual({ x: 0, z: 1, sprint: true });
    expect(toMoveMessage({ x: 0, z: 1 })).toEqual({ x: 0, z: 1 });
    expect(MoveMessage.safeParse(toMoveMessage({ x: 0.2, z: -1 }, true)).success).toBe(true);
  });
});
