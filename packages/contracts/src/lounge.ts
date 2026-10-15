import { schema, t, type SchemaType } from '@colyseus/schema';
import { z } from 'zod';
import type { Role } from './auth.ts';

/**
 * Contrato da sala multiplayer do lounge (cliente <-> servidor realtime).
 * Mudança incompatível aqui exige subir PROTOCOL_VERSION.
 */
export const PROTOCOL_VERSION = 6;

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

/** Senha de sala privada: enviada só ao criar/entrar, nunca vai para o estado público da sala. */
export const RoomPassword = z
  .string()
  .max(128)
  .transform(cleanText)
  .pipe(z.string().min(3).max(40));

/**
 * Entrada na sala. `privacy`/`title`/`password` só valem ao criar uma sala nova (`create`);
 * `password` também é exigido para entrar numa sala privada sem ser o dono ou um convidado.
 */
export const LoungeJoinOptions = z.strictObject({
  protocol: z.literal(PROTOCOL_VERSION),
  ticket: Ticket,
  privacy: z.enum(ROOM_PRIVACIES).optional(),
  title: RoomTitle.optional(),
  password: RoomPassword.optional(),
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
  /** Papel da conta (a interface marca a equipe). */
  role: Role;
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
  from: { id: string; name: string; role: Role };
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

/**
 * Cliente (dono da sala privada) -> servidor: convida um amigo para a sala. O convite chega na hora
 * a quem está online; quem aceita entra sem precisar da senha.
 */
export const INVITE_MESSAGE = 'invite';
export const InviteMessage = z.strictObject({ to: z.uuid() });
export type InviteMessage = z.infer<typeof InviteMessage>;

/** Servidor -> convidado: convite recebido (não é guardado; some se não for aceito). */
export const INVITED_EVENT = 'invited';
export interface InvitedEvent {
  roomId: string;
  title: string;
  /** Nome de quem convidou. */
  from: string;
}

/** Servidor -> quem convidou: convite não entregue (não é amigo, offline, limite…). */
export const INVITE_REJECTED_EVENT = 'invite-rejected';
export interface InviteRejectedEvent {
  to: string;
  reason: string;
}

/** Cliente (dono) -> servidor: troca a senha da sala privada; os convidados seguem valendo. */
export const CHANGE_PASSWORD_MESSAGE = 'change-password';
export const ChangePasswordMessage = z.strictObject({ password: RoomPassword });
export type ChangePasswordMessage = z.infer<typeof ChangePasswordMessage>;

/**
 * Servidor -> cliente: ids de usuário cujo avatar o cliente NÃO deve exibir. Serve para o bloqueio
 * nos dois sentidos (o cliente só conhece os bloqueios que ele mesmo fez; um bloqueio feito contra
 * ele só é visível aqui). Mudou o conjunto (entrou/saiu alguém, ticket novo), o servidor reenvia.
 */
export const HIDDEN_PLAYERS = 'hidden-players';
export interface HiddenPlayersEvent {
  hidden: string[];
}

export const USER_NOTIFY_KINDS = ['friends', 'queue'] as const;
export type UserNotifyKind = (typeof USER_NOTIFY_KINDS)[number];

/**
 * Servidor -> cliente: algo do usuário mudou fora da sala (amizades/presença ou fila da moderação).
 * É só um aviso — o cliente responde refazendo o GET correspondente, que continua sendo a verdade.
 */
export const USER_NOTIFY = 'notify';
export interface UserNotifyEvent {
  kind: UserNotifyKind;
}

/**
 * API -> realtime (rota interna, não vem do navegador): pede para avisar estes usuários. A rota é
 * protegida por segredo compartilhado (`NOTIFY_HEADER`); sem segredo configurado, fica desligada.
 */
export const NOTIFY_HEADER = 'x-notify-secret';
export const NotifyRequest = z.strictObject({
  users: z.array(z.uuid()).min(1).max(2048),
  kind: z.enum(USER_NOTIFY_KINDS),
});
export type NotifyRequest = z.infer<typeof NotifyRequest>;

/** Item da lista de salas (`GET /rooms` no realtime). Salas privadas aparecem, mas pedem senha. */
export interface RoomSummary {
  roomId: string;
  title: string;
  privacy: RoomPrivacy;
  clients: number;
  maxClients: number;
}

/** Estado público de um jogador. Não inclui nada privado: todos na sala recebem estes campos. */
export const PlayerState = schema(
  {
    /** Id público do usuário (usado para bloquear e denunciar). */
    userId: t.string(),
    name: t.string(),
    /** Papel da conta (ADMIN/MODERATOR/USER): a interface marca a equipe. */
    role: t.string().default('USER'),
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
