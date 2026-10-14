import { schema, t, type SchemaType } from '@colyseus/schema';
import { z } from 'zod';

/**
 * Contrato da sala multiplayer do lounge (cliente <-> servidor realtime).
 * Mudança incompatível aqui exige subir PROTOCOL_VERSION.
 */
export const PROTOCOL_VERSION = 3;

export const LOUNGE_ROOM = 'lounge';

/** Intervalo da simulação no servidor e do envio de estado aos clientes (20 por segundo). */
export const STATE_PATCH_INTERVAL_MS = 50;

/** Ticket emitido pela API (`POST /auth/realtime-ticket`); o realtime só aceita quem o apresenta. */
const Ticket = z.string().min(1).max(8192);

export const LoungeJoinOptions = z.strictObject({
  protocol: z.literal(PROTOCOL_VERSION),
  ticket: Ticket,
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

/** Remove caracteres de controle e de formatação invisível; espaços nas pontas também saem. */
const cleanText = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();

export const ChatMessage = z.strictObject({
  text: z
    .string()
    .max(CHAT_MAX_LENGTH * 2)
    .transform(cleanText)
    .pipe(z.string().min(1).max(CHAT_MAX_LENGTH)),
});
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
}

/** Cliente -> servidor: ticket novo (ex.: depois de bloquear alguém), para atualizar bloqueios. */
export const REFRESH_TICKET_MESSAGE = 'refresh-ticket';
export const RefreshTicketMessage = z.strictObject({ ticket: Ticket });
export type RefreshTicketMessage = z.infer<typeof RefreshTicketMessage>;

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
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** Estado da sala; `players` é indexado pelo sessionId (identificador público e efêmero). */
export const LoungeState = schema({ players: t.map(PlayerState) }, 'LoungeState');
export type LoungeState = SchemaType<typeof LoungeState>;
