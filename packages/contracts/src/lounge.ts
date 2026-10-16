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

/** Cenário/tema da sala. Cada um tem geometria, obstáculos e assentos próprios. */
export const ROOM_SCENES = ['lounge', 'club', 'beach', 'private-room'] as const;
export type RoomScene = (typeof ROOM_SCENES)[number];

export const RoomTitle = z.string().max(80).transform(cleanText).pipe(z.string().min(3).max(40));

/** Senha de sala privada: enviada só ao criar/entrar, nunca vai para o estado público da sala. */
export const RoomPassword = z
  .string()
  .max(128)
  .transform(cleanText)
  .pipe(z.string().min(3).max(40));

/**
 * Entrada na sala. `privacy`/`title`/`scene`/`password` só valem ao criar uma sala nova (`create`);
 * `password` também é exigido para entrar numa sala privada sem ser o dono ou um convidado.
 */
export const LoungeJoinOptions = z.strictObject({
  protocol: z.literal(PROTOCOL_VERSION),
  ticket: Ticket,
  privacy: z.enum(ROOM_PRIVACIES).optional(),
  title: RoomTitle.optional(),
  /** Cenário/tema da sala (só ao criar). Padrão: 'lounge'. */
  scene: z.enum(ROOM_SCENES).optional(),
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
 * Tipos de interação social a dois, sempre com consentimento mútuo.
 * Qualquer participante pode interromver a qualquer momento.
 */
export const INTERACTION_TYPES = ['hug', 'dance-duo', 'pose-intimate'] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Cliente -> servidor: solicita uma interação consentida com outro jogador da sala. */
export const INTERACTION_REQUEST_MESSAGE = 'interaction-request';
export const InteractionRequest = z.strictObject({
  to: z.uuid(),
  type: z.enum(INTERACTION_TYPES),
});
export type InteractionRequest = z.infer<typeof InteractionRequest>;

/** Cliente -> servidor: aceita ou recusa uma interação recebida. */
export const INTERACTION_RESPONSE_MESSAGE = 'interaction-response';
export const InteractionResponse = z.strictObject({
  from: z.uuid(),
  accept: z.boolean(),
});
export type InteractionResponse = z.infer<typeof InteractionResponse>;

/** Servidor -> cliente: alguém pediu uma interação com você. */
export const INTERACTION_REQUESTED_EVENT = 'interaction-requested';
export interface InteractionRequestedEvent {
  from: { id: string; name: string };
  type: InteractionType;
}

/** Servidor -> cliente: sua solicitação foi aceita ou recusada. */
export const INTERACTION_RESPONDED_EVENT = 'interaction-responded';
export interface InteractionRespondedEvent {
  to: { id: string; name: string };
  accept: boolean;
  type: InteractionType;
}

/** Servidor -> cliente: uma interação consentida começou ou terminou entre dois jogadores. */
export const INTERACTION_STARTED_EVENT = 'interaction-started';
export const INTERACTION_ENDED_EVENT = 'interaction-ended';
export interface InteractionStartedEvent {
  with: { id: string; name: string };
  type: InteractionType;
}
export interface InteractionEndedEvent {
  with: { id: string; name: string };
  type: InteractionType;
}

/** Duração máxima de uma interação consentida (ms); depois termina automaticamente. */
export const INTERACTION_MAX_DURATION_MS = 300_000;

/**
 * Voz por proximidade (WebRTC): sinalização pelo WebSocket, áudio direto P2P.
 * O servidor só repassa as mensagens de sinalização entre jogadores da mesma sala;
 * o áudio flui diretamente entre os navegadores após a conexão estabelecida.
 */

/** Cliente -> servidor: solicita voz com outro jogador da sala. */
export const VOICE_REQUEST_MESSAGE = 'voice-request';
export const VoiceRequest = z.strictObject({
  to: z.uuid(),
});
export type VoiceRequest = z.infer<typeof VoiceRequest>;

/** Cliente -> servidor: aceita ou recusa uma solicitação de voz. */
export const VOICE_RESPONSE_MESSAGE = 'voice-response';
export const VoiceResponse = z.strictObject({
  from: z.uuid(),
  accept: z.boolean(),
});
export type VoiceResponse = z.infer<typeof VoiceResponse>;

/**
 * Cliente -> servidor: mensagem de sinalização WebRTC (SDP oferta/resposta ou
 * candidato ICE). O `type` é 'offer', 'answer' ou 'ice-candidate'; `sdp` ou
 * `candidate` carregam o conteúdo dependendo do tipo.
 */
export const VOICE_SIGNAL_MESSAGE = 'voice-signal';
export const VoiceSignal = z.strictObject({
  to: z.uuid(),
  type: z.enum(['offer', 'answer', 'ice-candidate']),
  sdp: z.string().optional(),
  candidate: z.string().optional(),
});
export type VoiceSignal = z.infer<typeof VoiceSignal>;

/** Servidor -> cliente: alguém solicitou voz com você. */
export const VOICE_REQUESTED_EVENT = 'voice-requested';
export interface VoiceRequestedEvent {
  from: { id: string; name: string };
}

/** Servidor -> cliente: sua solicitação de voz foi aceita ou recusada. */
export const VOICE_RESPONDED_EVENT = 'voice-responded';
export interface VoiceRespondedEvent {
  to: { id: string; name: string };
  accept: boolean;
}

/** Servidor -> cliente: uma mensagem de sinalização WebRTC para estabelecer a voz. */
export const VOICE_SIGNAL_EVENT = 'voice-signal';
export interface VoiceSignalEvent {
  from: { id: string; name: string };
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: string;
}

/** Servidor -> cliente: uma conversa de voz começou ou terminou entre dois jogadores. */
export const VOICE_STARTED_EVENT = 'voice-started';
export const VOICE_ENDED_EVENT = 'voice-ended';
export interface VoiceStartedEvent {
  with: { id: string; name: string };
}
export interface VoiceEndedEvent {
  with: { id: string; name: string };
}

/** Distância máxima (m) para ouvir voz de outro jogador na sala. */
export const VOICE_HEAR_DISTANCE_M = 15;

/** Distância (m) abaixo da qual o volume está no máximo. */
export const VOICE_FULL_VOLUME_DISTANCE_M = 3;

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
  /** Cenário/tema da sala. */
  scene: RoomScene;
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
    /** Cenário/tema da sala. */
    scene: t.string().default('lounge'),
    /** Id público do dono (sala privada); '' em sala pública. */
    ownerId: t.string().default(''),
    players: t.map(PlayerState),
  },
  'LoungeState',
);
export type LoungeState = SchemaType<typeof LoungeState>;
