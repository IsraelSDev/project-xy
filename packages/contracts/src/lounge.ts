import { schema, t, type SchemaType } from '@colyseus/schema';
import { z } from 'zod';

/**
 * Contrato da sala multiplayer do lounge (cliente <-> servidor realtime).
 * Mudança incompatível aqui exige subir PROTOCOL_VERSION.
 */
export const PROTOCOL_VERSION = 5;

export const LOUNGE_ROOM = 'lounge';

/** Intervalo da simulação no servidor e do envio de estado aos clientes (20 por segundo). */
export const STATE_PATCH_INTERVAL_MS = 50;

/** Ticket emitido pela API (`POST /auth/realtime-ticket`); o realtime só aceita quem o apresenta. */
const Ticket = z.string().min(1).max(8192);

/** Remove caracteres de controle e de formatação invisível; espaços nas pontas também saem. */
const cleanText = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();

export const ROOM_PRIVACIES = ['public', 'private'] as const;
export type RoomPrivacy = (typeof ROOM_PRIVACIES)[number];

export const RoomTitle = z.string().max(80).transform(cleanText).pipe(z.string().min(3).max(40));

/** Código de convite de sala privada (aleatório, gerado pelo servidor). */
export const InviteCode = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/**
 * Entrada na sala. `privacy`/`title` só valem ao criar uma sala nova (`create`); `invite` é
 * exigido para entrar numa sala privada que você não criou.
 */
export const LoungeJoinOptions = z.strictObject({
  protocol: z.literal(PROTOCOL_VERSION),
  ticket: Ticket,
  privacy: z.enum(ROOM_PRIVACIES).optional(),
  title: RoomTitle.optional(),
  invite: InviteCode.optional(),
});
export type LoungeJoinOptions = z.infer<typeof LoungeJoinOptions>;

export const MOVE_MESSAGE = 'move';

/**
 * Direção em que o jogador quer andar, no plano do chão (mundo). (0, 0) = parado.
 * O servidor normaliza: o cliente escolhe só a direção, nunca a velocidade nem a posição.
 */
export const MoveMessage = z.strictObject({
  x: z.number().min(-1).max(1),
  z: z.number().min(-1).max(1),
});
export type MoveMessage = z.infer<typeof MoveMessage>;

export const CHAT_MAX_LENGTH = 200;

/** Cliente -> servidor: mensagem no chat público da sala. */
export const CHAT_MESSAGE = 'chat';

/** Texto de chat (público ou privado): limpo de controles e espaços extras, de 1 a 200 caracteres. */
export const ChatText = z
  .string()
  .max(CHAT_MAX_LENGTH * 2)
  .transform(cleanText)
  .pipe(z.string().min(1).max(CHAT_MAX_LENGTH));

export const ChatMessage = z.strictObject({ text: ChatText });
export type ChatMessage = z.input<typeof ChatMessage>;

/** Servidor -> cliente: mensagem entregue (já filtrada por bloqueios). */
export const CHAT_EVENT = 'chat';
export interface ChatEvent {
  id: string;
  userId: string;
  name: string;
  text: string;
  /** Epoch em ms, horário do servidor. */
  sentAt: number;
}

/** Servidor -> cliente: mensagem recusada (ex.: limite de frequência). */
export const CHAT_REJECTED_EVENT = 'chat-rejected';
export interface ChatRejectedEvent {
  reason: string;
  /** Fim do silenciamento (epoch ms), quando a recusa é por sanção da moderação. */
  until?: number;
}

/** Cliente -> servidor: mensagem privada para um amigo (em qualquer sala). */
export const DM_MESSAGE = 'dm';
export const DirectMessage = z.strictObject({ to: z.uuid(), text: ChatText });
export type DirectMessage = z.input<typeof DirectMessage>;

/** Servidor -> cliente: mensagem privada entregue (ao destinatário e às sessões de quem enviou). */
export const DM_EVENT = 'dm';
export interface DirectMessageEvent {
  id: string;
  from: { id: string; name: string };
  to: string;
  text: string;
  /** Epoch em ms, horário do servidor. */
  sentAt: number;
}

/** Servidor -> cliente: mensagem privada não enviada (amigo offline, silenciado, limite…). */
export const DM_REJECTED_EVENT = 'dm-rejected';
export interface DirectMessageRejectedEvent {
  to: string;
  reason: string;
  /** Fim do silenciamento (epoch ms), quando a recusa é por sanção. */
  until?: number;
}

/** Cliente -> servidor: ticket novo (ex.: depois de bloquear alguém), para atualizar bloqueios. */
export const REFRESH_TICKET_MESSAGE = 'refresh-ticket';
export const RefreshTicketMessage = z.strictObject({ ticket: Ticket });
export type RefreshTicketMessage = z.infer<typeof RefreshTicketMessage>;

/** Ações (cliente -> servidor). `stand` encerra a ação atual. */
export const ACTION_MESSAGE = 'action';
export const ACTIONS = ['sit', 'stand', 'wave', 'dance'] as const;
export const ActionMessage = z.strictObject({ type: z.enum(ACTIONS) });
export type ActionMessage = z.infer<typeof ActionMessage>;

/** Estado de ação/animação replicado. '' = nenhuma (anda ou fica parado normalmente). */
export type PlayerAction = '' | 'sit' | 'wave' | 'dance';

/** Duração do aceno (ms); sentar e dançar duram até a pessoa andar ou pedir `stand`. */
export const WAVE_DURATION_MS = 2500;

/** Cliente (dono da sala privada) -> servidor: gera um convite novo; os links antigos param. */
export const ROTATE_INVITE_MESSAGE = 'rotate-invite';

/** Servidor -> dono da sala privada: convite atual. Nunca vai para o estado público. */
export const INVITE_EVENT = 'invite';
export interface InviteEvent {
  code: string;
}

/** Item da lista de salas públicas (`GET /rooms` no realtime). */
export interface RoomSummary {
  roomId: string;
  title: string;
  clients: number;
  maxClients: number;
}

/** Estado público de um jogador. Não inclui nada privado: todos na sala recebem estes campos. */
export const PlayerState = schema(
  {
    /** Id público do usuário (usado para bloquear e denunciar). */
    userId: t.string(),
    name: t.string(),
    /** AvatarConfig em JSON (catálogo fechado). Cliente lê com `parseAvatar`. */
    avatar: t.string(),
    x: t.float32(),
    z: t.float32(),
    heading: t.float32(),
    /** false enquanto o servidor aguarda a reconexão de quem caiu. */
    connected: t.boolean().default(true),
    /** Ação em curso (PlayerAction): define a pose no cliente. */
    action: t.string().default(''),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** Estado da sala; `players` é indexado pelo sessionId (identificador público e efêmero). */
export const LoungeState = schema(
  {
    title: t.string().default(''),
    privacy: t.string().default('public'),
    /** Id público do dono (sala privada); '' em sala pública. */
    ownerId: t.string().default(''),
    players: t.map(PlayerState),
  },
  'LoungeState',
);
export type LoungeState = SchemaType<typeof LoungeState>;
