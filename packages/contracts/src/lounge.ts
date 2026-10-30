import { schema, t, type SchemaType } from '@colyseus/schema';
import { z } from 'zod';
import type { Role } from './auth.ts';

/**
 * Contrato da sala multiplayer do lounge (cliente <-> servidor realtime).
 * Mudança incompatível aqui exige subir PROTOCOL_VERSION.
 */
export const PROTOCOL_VERSION = 7;

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
export const ROOM_SCENES = ['club', 'home', 'lounge', 'beach', 'private-room', 'studio'] as const;
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
  /** Cenário/tema da sala (só ao criar). Padrão: 'club'. */
  scene: z.enum(ROOM_SCENES).optional(),
  password: RoomPassword.optional(),
});
export type LoungeJoinOptions = z.infer<typeof LoungeJoinOptions>;

export const MOVE_MESSAGE = 'move';

/**
 * Direção em que o jogador quer andar, no plano do chão (mundo). (0, 0) = parado.
 * O servidor normaliza: o cliente escolhe só a direção, nunca a velocidade nem a posição.
 * `sprint` (SHIFT) é só um pedido de corrida: o servidor aplica a velocidade extra apenas para
 * quem tem permissão (ADMIN); os demais continuam andando na velocidade normal.
 */
export const MoveMessage = z.strictObject({
  x: z.number().min(-1).max(1),
  z: z.number().min(-1).max(1),
  sprint: z.boolean().optional(),
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

/**
 * Clipes de pose/par do corpo 3DX usados como ação replicada: `pose01` é a pose neutra e `pair01` o
 * par nativo. Ficam até a pessoa andar, pedir `stand` ou escolher outra.
 */
export const POSE_ACTIONS = [
  { id: 'pose01', label: 'Pose 1' },
  { id: 'pair01', label: 'Par 1' },
] as const satisfies readonly { id: string; label: string }[];

export type PoseAction = (typeof POSE_ACTIONS)[number]['id'];

export const isPoseAction = (value: string): value is PoseAction =>
  (POSE_ACTIONS as readonly { id: string }[]).some((pose) => pose.id === value);

/**
 * Clipes de par embutidos nos corpos 3DX. São usados como ação dos dois lados de uma interação a
 * dois; ficam de fora do seletor de poses individual (só `pair01` aparece lá).
 */
export const PAIR_CLIP_ACTIONS = [
  'pair01',
  'pair02',
  'pair03',
  'pair04',
  'pair06',
  'pair07',
  'pair08',
  'pair09',
  // Pares M/F sentados/em móveis (sofa/chair), importados dos bundles nativos.
  'pair10',
  'pair11',
  'pair12',
  'pair13',
  'pair14',
  // Pares de cama (mf/bed), importados dos bundles nativos.
  'pair15',
  'pair16',
  'pair17',
  // Segundo pacote: 5 a mais por móvel, incluindo os de parede (mf/wall).
  'pair18',
  'pair19',
  'pair20',
  'pair21',
  'pair22',
  'pair23',
  'pair24',
  'pair25',
  'pair26',
  'pair27',
  'pair28',
  'pair29',
  'pair30',
  'pair31',
  'pair32',
  'pair33',
  'pair34',
  'pair35',
  'pair36',
  'pair37',
  // Pares do mesmo gênero: um clipe por metade (a/b), autorado para o corpo F ou M.
  // F/F — `ff/rel` (abraço/beijo) e móveis `ff/sofa`, `ff/bed`.
  'ff_hug_a',
  'ff_hug_b',
  'ff_kiss_a',
  'ff_kiss_b',
  'ff_sofa_1_a',
  'ff_sofa_1_b',
  'ff_bed_1_a',
  'ff_bed_1_b',
  // M/M — `mm/rel`, `mm/sofa`, `mm/bed`.
  'mm_hug_a',
  'mm_hug_b',
  'mm_kiss_a',
  'mm_kiss_b',
  'mm_sofa_1_a',
  'mm_sofa_1_b',
  'mm_bed_1_a',
  'mm_bed_1_b',
  // Danças sociais e móveis que já têm assento: cadeira (F/F, M/M) e parede (M/M).
  'ff_slow_dance_a',
  'ff_slow_dance_b',
  'ff_slow_dance_invert_a',
  'ff_slow_dance_invert_b',
  'ff_chair_1_a',
  'ff_chair_1_b',
  'mm_slow_dance_a',
  'mm_slow_dance_b',
  'mm_slow_dance_invert_a',
  'mm_slow_dance_invert_b',
  'mm_chair_1_a',
  'mm_chair_1_b',
  'mm_wall_1_a',
  'mm_wall_1_b',
  // Segunda opção de cada móvel (F/F e M/M), para a mesma variedade dos pares M/F.
  'ff_sofa_2_a',
  'ff_sofa_2_b',
  'ff_bed_2_a',
  'ff_bed_2_b',
  'ff_chair_2_a',
  'ff_chair_2_b',
  'ff_wall_1_a',
  'ff_wall_1_b',
  'mm_sofa_2_a',
  'mm_sofa_2_b',
  'mm_bed_2_a',
  'mm_bed_2_b',
  'mm_chair_2_a',
  'mm_chair_2_b',
] as const;

export type PairClipAction = (typeof PAIR_CLIP_ACTIONS)[number];

export const isPairClipAction = (value: string): value is PairClipAction =>
  (PAIR_CLIP_ACTIONS as readonly string[]).includes(value);

const POSE_IDS = POSE_ACTIONS.map((pose) => pose.id);

export const ACTIONS = ['sit', 'stand', 'wave', 'dance', 'dance2', 'beer', ...POSE_IDS] as const;
export const ActionMessage = z.strictObject({ type: z.enum(ACTIONS) });
export type ActionMessage = z.infer<typeof ActionMessage>;

/** Cliente -> servidor: entrou/saiu do closet (mostra o cabide acima do avatar para os outros). */
export const CLOSET_MESSAGE = 'closet';
export const ClosetMessage = z.strictObject({ open: z.boolean() });
export type ClosetMessage = z.infer<typeof ClosetMessage>;

/** Estado de ação/animação replicado. '' = nenhuma (anda ou fica parado normalmente). */
export type PlayerAction =
  '' | 'sit' | 'wave' | 'dance' | 'dance2' | 'beer' | PoseAction | PairClipAction;

/** Duração do aceno (ms); sentar e dançar duram até a pessoa andar ou pedir `stand`. */
export const WAVE_DURATION_MS = 2500;

/** Duração de "pegar cerveja no balde" (ms); volta sozinho ao estado normal. */
export const BEER_DURATION_MS = 4000;

/**
 * Tipos de interação social a dois, sempre com consentimento mútuo.
 * Qualquer participante pode interromper a qualquer momento.
 */
export const INTERACTION_TYPES = [
  'hug',
  'dance-duo',
  'pose-intimate',
  'slow-dance-2',
  'slow-dance-behind',
  'kiss',
  'kiss-neck',
  'slow-dance-invert',
  // Pares que só valem com o iniciador sentado no móvel correspondente.
  'sofa-1',
  'sofa-2',
  'sofa-3',
  'chair-1',
  'chair-2',
  // Pares que só valem com o iniciador deitado/sentado numa cama.
  'bed-1',
  'bed-2',
  'bed-3',
  // Segundo pacote, 5 por móvel.
  'sofa-4',
  'sofa-5',
  'sofa-6',
  'sofa-7',
  'sofa-8',
  'chair-3',
  'chair-4',
  'chair-5',
  'chair-6',
  'chair-7',
  'bed-4',
  'bed-5',
  'bed-6',
  'bed-7',
  'bed-8',
  // Pares que só valem com o iniciador encostado numa âncora de parede.
  'wall-1',
  'wall-2',
  'wall-3',
  'wall-4',
  'wall-5',
  // Pares do mesmo gênero (F/F e M/M), com clipes próprios para cada metade.
  'ff-hug',
  'ff-kiss',
  'ff-sofa-1',
  'ff-bed-1',
  'mm-hug',
  'mm-kiss',
  'mm-sofa-1',
  'mm-bed-1',
  // Danças e móveis: paridade com os pares M/F já publicados.
  'ff-slow-dance',
  'ff-slow-dance-invert',
  'ff-chair-1',
  'mm-slow-dance',
  'mm-slow-dance-invert',
  'mm-chair-1',
  'mm-wall-1',
  // Segunda opção por móvel (mesma variedade dos pares M/F).
  'ff-sofa-2',
  'ff-bed-2',
  'ff-chair-2',
  'ff-wall-1',
  'mm-sofa-2',
  'mm-bed-2',
  'mm-chair-2',
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Composição de um par: quem inicia e quem aceita, pelo gênero do corpo. */
export type PairComposition = 'mf' | 'ff' | 'mm';

/** Rótulo de cada interação (usado no menu e no diálogo de consentimento). */
export const INTERACTION_LABELS: Readonly<Record<InteractionType, string>> = {
  hug: 'Abraço',
  'dance-duo': 'Dança a dois',
  'pose-intimate': 'Pose íntima',
  'slow-dance-2': 'Dança lenta II',
  'slow-dance-behind': 'Dança por trás',
  kiss: 'Beijo',
  'kiss-neck': 'Beijo no pescoço',
  'slow-dance-invert': 'Dança invertida',
  'sofa-1': 'Sofá 1 · vaginal',
  'sofa-2': 'Sofá 2 · anal',
  'sofa-3': 'Sofá 3 · anal',
  'chair-1': 'Cadeira 1 · vaginal',
  'chair-2': 'Cadeira 2 · anal',
  'bed-1': 'Cama 1 · anal',
  'bed-2': 'Cama 2 · anal',
  'bed-3': 'Cama 3 · vaginal',
  'sofa-4': 'Sofá 4',
  'sofa-5': 'Sofá 5',
  'sofa-6': 'Sofá 6',
  'sofa-7': 'Sofá 7',
  'sofa-8': 'Sofá 8',
  'chair-3': 'Cadeira 3',
  'chair-4': 'Cadeira 4',
  'chair-5': 'Cadeira 5',
  'chair-6': 'Cadeira 6',
  'chair-7': 'Cadeira 7',
  'bed-4': 'Cama 4',
  'bed-5': 'Cama 5',
  'bed-6': 'Cama 6',
  'bed-7': 'Cama 7',
  'bed-8': 'Cama 8',
  'wall-1': 'Parede 1',
  'wall-2': 'Parede 2',
  'wall-3': 'Parede 3',
  'wall-4': 'Parede 4',
  'wall-5': 'Parede 5',
  'ff-hug': 'Abraço · F/F',
  'ff-kiss': 'Beijo · F/F',
  'ff-sofa-1': 'Sofá F/F · 1',
  'ff-bed-1': 'Cama F/F · 1',
  'mm-hug': 'Abraço · M/M',
  'mm-kiss': 'Beijo · M/M',
  'mm-sofa-1': 'Sofá M/M · 1',
  'mm-bed-1': 'Cama M/M · 1',
  'ff-slow-dance': 'Dança lenta · F/F',
  'ff-slow-dance-invert': 'Dança invertida · F/F',
  'ff-chair-1': 'Cadeira F/F · 1',
  'mm-slow-dance': 'Dança lenta · M/M',
  'mm-slow-dance-invert': 'Dança invertida · M/M',
  'mm-chair-1': 'Cadeira M/M · 1',
  'mm-wall-1': 'Parede M/M · 1',
  'ff-sofa-2': 'Sofá F/F · 2',
  'ff-bed-2': 'Cama F/F · 2',
  'ff-chair-2': 'Cadeira F/F · 2',
  'ff-wall-1': 'Parede F/F · 1',
  'mm-sofa-2': 'Sofá M/M · 2',
  'mm-bed-2': 'Cama M/M · 2',
  'mm-chair-2': 'Cadeira M/M · 2',
};

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

/**
 * Cliente -> servidor: troca a **cena** (pose) da interação ativa mantendo o parceiro e o móvel.
 * Vale só para o mesmo tipo de móvel e para a composição dos dois corpos; os dois recebem um novo
 * `interaction-started` com o tipo novo (é o "passar de uma cena para outra" do menu do móvel).
 */
export const INTERACTION_SWITCH_MESSAGE = 'interaction-switch';
export const InteractionSwitch = z.strictObject({
  type: z.enum(INTERACTION_TYPES),
});
export type InteractionSwitch = z.infer<typeof InteractionSwitch>;

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
  /**
   * Instante do início no relógio do servidor (epoch ms). Os dois clientes alinham o clipe do par
   * por ele: sem isso cada um começa quando o estado chega (e quando o clipe termina de baixar), e
   * as duas telas mostram fases diferentes da mesma animação.
   */
  startedAt: number;
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
  /** Dono da sala privada; '' nas públicas. */
  ownerId: string;
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
    /** Está no closet; o cliente desenha um cabide acima do avatar. */
    closet: t.boolean().default(false),
    /** Versão da foto do perfil (ISO); '' = sem foto. Usada no `<img>` da lista da sala. */
    photoUpdatedAt: t.string().default(''),
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
    scene: t.string().default('club'),
    /** Id público do dono (sala privada); '' em sala pública. */
    ownerId: t.string().default(''),
    players: t.map(PlayerState),
  },
  'LoungeState',
);
export type LoungeState = SchemaType<typeof LoungeState>;
