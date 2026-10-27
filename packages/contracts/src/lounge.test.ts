import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ActionMessage,
  CHAT_MAX_LENGTH,
  ChatMessage,
  INTERACTION_LABELS,
  INTERACTION_TYPES,
  LoungeJoinOptions,
  LoungeState,
  MoveMessage,
  PAIR_CLIP_ACTIONS,
  POSE_ACTIONS,
  PROTOCOL_VERSION,
  PlayerState,
  DirectMessage,
  isPairClipAction,
  isPoseAction,
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
  it('exige a versão atual do protocolo e um ticket', () => {
    expect(LoungeJoinOptions.safeParse({ protocol: PROTOCOL_VERSION, ticket: 't' }).success).toBe(
      true,
    );
    expect(
      LoungeJoinOptions.safeParse({ protocol: PROTOCOL_VERSION + 1, ticket: 't' }).success,
    ).toBe(false);
    expect(LoungeJoinOptions.safeParse({ protocol: PROTOCOL_VERSION }).success).toBe(false);
  });
});

describe('ChatMessage', () => {
  it('remove caracteres de controle e espaços nas pontas', () => {
    expect(ChatMessage.parse({ text: '  oi\u0000 tudo​ bem?\n ' })).toEqual({
      text: 'oi tudo bem?',
    });
  });

  it.each([
    ['vazia', '   '],
    ['só caracteres invisíveis', '​​'],
    ['longa demais', 'a'.repeat(CHAT_MAX_LENGTH + 1)],
  ])('rejeita mensagem %s', (_, text) => {
    expect(ChatMessage.safeParse({ text }).success).toBe(false);
  });
});

describe('LoungeState', () => {
  it('guarda jogadores pelo sessionId, conectados por padrão', () => {
    const state = new LoungeState();
    state.players.set(
      'abc',
      new PlayerState({ userId: 'u1', name: 'Visitante', avatar: '', x: 1, z: 2, heading: 0 }),
    );

    expect(state.players.get('abc')?.connected).toBe(true);
    expect(state.players.size).toBe(1);
  });
});

describe('opções de sala', () => {
  const base = { protocol: PROTOCOL_VERSION, ticket: 't' };

  it('aceita criação de sala privada com título e senha limpos', () => {
    const parsed = LoungeJoinOptions.parse({
      ...base,
      privacy: 'private',
      title: '  Festa da Ana ',
      password: '  segredo  ',
    });
    expect(parsed.title).toBe('Festa da Ana');
    expect(parsed.password).toBe('segredo');
  });

  it.each([
    ['título curto', { title: 'ab' }],
    ['privacidade desconhecida', { privacy: 'secreta' }],
    ['senha curta', { password: 'ab' }],
    ['dono escolhido pelo cliente', { ownerId: 'x' }],
  ])('recusa %s', (_, extra) => {
    expect(LoungeJoinOptions.safeParse({ ...base, ...extra }).success).toBe(false);
  });

  it('ações conhecidas apenas', () => {
    expect(ActionMessage.safeParse({ type: 'sit' }).success).toBe(true);
    expect(ActionMessage.safeParse({ type: 'pose01' }).success).toBe(true);
    expect(ActionMessage.safeParse({ type: 'pair01' }).success).toBe(true);
    // Clipes de par novos são usados só pelas interações a dois, não pelo seletor individual.
    expect(ActionMessage.safeParse({ type: 'pair04' }).success).toBe(false);
    expect(ActionMessage.safeParse({ type: 'sex10' }).success).toBe(false);
    expect(ActionMessage.safeParse({ type: 'pose11' }).success).toBe(false);
    expect(ActionMessage.safeParse({ type: 'teleport' }).success).toBe(false);
  });

  it('catálogo de poses usa só os clipes 3DX e o guard bate', () => {
    expect(POSE_ACTIONS).toHaveLength(2);
    expect(ACTIONS).toEqual([
      'sit',
      'stand',
      'wave',
      'dance',
      'dance2',
      'beer',
      'pose01',
      'pair01',
    ]);
    for (const pose of POSE_ACTIONS) expect(isPoseAction(pose.id)).toBe(true);
    expect(isPoseAction('sit')).toBe(false);
    expect(isPoseAction('pose99')).toBe(false);
  });

  it('clipes de par cobrem o que está publicado nos corpos', () => {
    expect(PAIR_CLIP_ACTIONS).toEqual([
      'pair01',
      'pair02',
      'pair03',
      'pair04',
      'pair06',
      'pair07',
      'pair08',
      'pair09',
      'pair10',
      'pair11',
      'pair12',
      'pair13',
      'pair14',
      'pair15',
      'pair16',
      'pair17',
    ]);
    for (const action of PAIR_CLIP_ACTIONS) expect(isPairClipAction(action)).toBe(true);
    expect(isPairClipAction('pair05')).toBe(false);
    expect(isPairClipAction('pair99')).toBe(false);
  });

  it('toda interação tem rótulo e o catálogo inclui os pares de móvel', () => {
    expect(INTERACTION_TYPES).toHaveLength(16);
    expect(new Set(INTERACTION_TYPES)).toEqual(
      new Set([
        'hug',
        'dance-duo',
        'pose-intimate',
        'slow-dance-2',
        'slow-dance-behind',
        'kiss',
        'kiss-neck',
        'slow-dance-invert',
        'sofa-1',
        'sofa-2',
        'sofa-3',
        'chair-1',
        'chair-2',
        'bed-1',
        'bed-2',
        'bed-3',
      ]),
    );
    for (const type of INTERACTION_TYPES) expect(INTERACTION_LABELS[type]).toBeTruthy();
  });
});

describe('DirectMessage', () => {
  it('exige destinatário válido e texto de chat', () => {
    const to = '0b9a2a52-5f3c-4c1e-9d3b-2f1f6c0e8a11';
    expect(DirectMessage.safeParse({ to, text: '  oi  ' }).data).toEqual({ to, text: 'oi' });
    expect(DirectMessage.safeParse({ to, text: '   ' }).success).toBe(false);
    expect(DirectMessage.safeParse({ to: '1', text: 'oi' }).success).toBe(false);
  });
});
