import { describe, expect, it } from 'vitest';
import {
  LoungeJoinOptions,
  LoungeState,
  MoveMessage,
  PROTOCOL_VERSION,
  PlayerState,
} from './lounge.ts';

describe('MoveMessage', () => {
  it('aceita direção dentro de [-1, 1] em cada eixo', () => {
    expect(MoveMessage.safeParse({ x: 0.6, z: -0.8 }).success).toBe(true);
    expect(MoveMessage.safeParse({ x: 0, z: 0 }).success).toBe(true);
  });

  it.each([
    ['fora do intervalo', { x: 2, z: 0 }],
    ['não numérico', { x: '1', z: 0 }],
    ['NaN', { x: Number.NaN, z: 0 }],
    ['infinito', { x: Number.POSITIVE_INFINITY, z: 0 }],
    ['campo faltando', { x: 1 }],
    ['campo extra (posição enviada pelo cliente)', { x: 1, z: 0, position: { x: 50, z: 50 } }],
    ['não objeto', 'norte'],
  ])('rejeita %s', (_, value) => {
    expect(MoveMessage.safeParse(value).success).toBe(false);
  });
});

describe('LoungeJoinOptions', () => {
  it('aceita só a versão atual do protocolo', () => {
    expect(LoungeJoinOptions.safeParse({ protocol: PROTOCOL_VERSION }).success).toBe(true);
    expect(LoungeJoinOptions.safeParse({ protocol: PROTOCOL_VERSION + 1 }).success).toBe(false);
    expect(LoungeJoinOptions.safeParse({}).success).toBe(false);
  });
});

describe('LoungeState', () => {
  it('guarda jogadores pelo sessionId, conectados por padrão', () => {
    const state = new LoungeState();
    state.players.set('abc', new PlayerState({ name: 'Visitante', x: 1, z: 2, heading: 0 }));

    expect(state.players.get('abc')?.connected).toBe(true);
    expect(state.players.size).toBe(1);
  });
});
