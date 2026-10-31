import type { VoicePeerJoinedEvent, VoicePeerLeftEvent, VoicePeersEvent } from '@3dx/contracts';
import { isSpeaking, panFor, voiceGain } from './proximity';

/**
 * Voz por proximidade no cliente: microfone, canais 1:1 (mesh) e sinalização pelo WebSocket.
 *
 * - entrar na voz = ligar o microfone (o consentimento é o clique, não há convite por par);
 * - para cada vizinho na voz, um `RTCPeerConnection`; só quem tem o `userId` menor manda a oferta
 *   (regra determinística — evita as duas pontas ofertarem ao mesmo tempo);
 * - volume e pan são aplicados por WebAudio a partir da distância até o ouvinte; a voz some
 *   suavemente no alcance e nunca é enviada para quem está bloqueado (o servidor filtra);
 * - "quem está falando" vem do RMS do áudio recebido, amostrado algumas vezes por segundo.
 */

export type VoiceStatus = 'off' | 'connecting' | 'on' | 'error';

export interface VoicePeerInfo {
  id: string;
  name: string;
}

export interface VoicePeerState {
  userId: string;
  name: string;
  /** Falando agora (e dentro do alcance). */
  speaking: boolean;
  /** Eu silenciei esta pessoa. */
  muted: boolean;
  /** Dentro do alcance de audição (o ganho é maior que zero). */
  inRange: boolean;
}

export interface VoiceState {
  status: VoiceStatus;
  /** Meu microfone está desligado. */
  muted: boolean;
  /** Volume geral (0–1). */
  volume: number;
  /** Quem está na voz da sala (sem bloqueios), ordenado por nome. */
  peers: VoicePeerState[];
  /** Motivo quando `status === 'error'` (microfone negado, por exemplo). */
  error?: string;
}

export interface VoiceSignalPayload {
  sdp?: string;
  candidate?: string;
}

export interface VoiceChatOptions {
  /** Id da conta local (decide quem manda a oferta); muda junto com a sala. */
  localUserId: () => string | undefined;
  /** Envia `voice-join` para a sala. */
  join: () => void;
  /** Envia `voice-leave` para a sala. */
  leave: () => void;
  /** Repassa oferta/resposta/candidato ICE ao servidor. */
  sendSignal: (
    to: string,
    type: 'offer' | 'answer' | 'ice-candidate',
    payload: VoiceSignalPayload,
  ) => void;
  /** Estado para a interface (entrou, saiu, mudo, quem fala…). */
  onState: (state: VoiceState) => void;
  /** Posição de quem fala no mundo; `undefined` quando não está na cena. */
  locate: (userId: string) => { x: number; z: number } | undefined;
  /** Posição e frente do ouvinte (avatar/câmera local); `undefined` sem avatar local. */
  listener: () => { x: number; z: number; forwardX: number; forwardZ: number } | undefined;
  /** Servidores STUN/TURN; sem eles só conexões na mesma rede (host candidates). */
  iceServers?: RTCIceServer[];
  // Injeções para teste (no navegador usam as APIs reais).
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
  createAudioContext?: () => AudioContext;
  /** Elemento de áudio que recebe o stream remoto (o `play()` garante o decoder). */
  createAudioElement?: () => HTMLAudioElement;
}

export interface VoiceChat {
  /** Liga o microfone e entra na voz da sala. */
  enable(): Promise<void>;
  /** Sai da voz e desliga o microfone. */
  disable(): void;
  /** Mudo do meu microfone (o canal continua aberto). */
  setMuted(muted: boolean): void;
  /** Volume geral (0–1). */
  setVolume(volume: number): void;
  /** Silencia (só para mim) o áudio de alguém. */
  setPeerMuted(userId: string, muted: boolean): void;
  /** Lista de quem está na voz (resposta ao `voice-join`). */
  onPeers(event: VoicePeersEvent): void;
  onPeerJoined(event: VoicePeerJoinedEvent): void;
  onPeerLeft(event: VoicePeerLeftEvent): void;
  onSignal(event: {
    from: VoicePeerInfo;
    type: 'offer' | 'answer' | 'ice-candidate';
    sdp?: string;
    candidate?: string;
  }): void;
  /** A sessão da sala acabou: fecha os canais, mas mantém o microfone (volta ao reconectar). */
  onSessionEnded(): void;
  /** Entrou numa sala: se a voz estava ligada, pede para entrar de novo. */
  onSessionReady(): void;
  /** Recalcula ganho/pan e o indicador de fala (chamado pelo loop de render). */
  update(now: number): void;
  getState(): VoiceState;
  dispose(): void;
}

/** Sinalização entre 10 e 20 vezes por segundo é suficiente para a fala e não pesa. */
const UPDATE_INTERVAL_MS = 100;
/** Suavização do ganho/pan (s): evita estalos ao andar. */
const AUDIO_SMOOTHING_S = 0.08;
const ANALYSER_FFT = 512;

export const DEFAULT_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
};

/**
 * Regra determinística para não haver "glare": só a ponta com `userId` lexicograficamente menor
 * cria a oferta. Vale para os dois caminhos (`voice-peers` e `voice-peer-joined`).
 */
export function startsOffer(self: string, other: string): boolean {
  return self < other;
}

/** ICE de produção a partir de `VITE_ICE_SERVERS` (JSON de `RTCIceServer[]`). */
export function iceServersFromEnv(raw: string | undefined): RTCIceServer[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RTCIceServer => {
      if (typeof entry !== 'object' || entry === null) return false;
      const urls = (entry as { urls?: unknown }).urls;
      return (
        typeof urls === 'string' ||
        (Array.isArray(urls) && urls.every((url) => typeof url === 'string'))
      );
    });
  } catch {
    return [];
  }
}

/** Mensagem para o jogador quando o microfone não abre. */
export function describeMicrophoneError(error: unknown): string {
  const name = (error as { name?: string } | undefined)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão do microfone negada. Libere o microfone no navegador para falar.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhum microfone encontrado neste dispositivo.';
  }
  return 'Não foi possível ligar o microfone.';
}

interface Peer {
  userId: string;
  name: string;
  connection?: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  remoteStream?: MediaStream;
  /** O elemento é o consumidor do stream: sem ele o Chrome não decodifica áudio remoto. */
  element?: HTMLAudioElement;
  source?: AudioNode;
  gainNode?: GainNode;
  panNode?: StereoPannerNode;
  analyser?: AnalyserNode;
  samples?: Uint8Array<ArrayBuffer>;
  speaking: boolean;
  inRange: boolean;
  offering: boolean;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function createVoiceChat(options: VoiceChatOptions): VoiceChat {
  const peers = new Map<string, Peer>();
  /** Quem eu silenciei; sobrevive a sair e voltar da voz. */
  const mutedPeers = new Set<string>();

  let status: VoiceStatus = 'off';
  /** O jogador quer estar na voz (mesmo que a sala tenha caído no meio). */
  let desired = false;
  let micMuted = false;
  let volume = 1;
  let error: string | undefined;
  let localStream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let lastTick = -Infinity;
  let disposed = false;
  const reconnectTimers = new Set<ReturnType<typeof setTimeout>>();

  const state = (): VoiceState => ({
    status,
    muted: micMuted,
    volume,
    peers: [...peers.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((peer) => ({
        userId: peer.userId,
        name: peer.name,
        speaking: peer.speaking,
        muted: mutedPeers.has(peer.userId),
        inRange: peer.inRange,
      })),
    ...(error === undefined ? {} : { error }),
  });

  const emit = () => {
    if (!disposed) options.onState(state());
  };

  const audioContext = (): AudioContext => {
    if (context) return context;
    const build =
      options.createAudioContext ??
      (() => {
        const Ctor =
          globalThis.AudioContext ??
          (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error('WebAudio indisponível neste navegador.');
        return new Ctor();
      });
    context = build();
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    // O navegador pode criar o contexto em "suspended" (política de autoplay); o clique que liga a
    // voz já é o gesto que permite retomar.
    void context.resume().catch(() => undefined);
    return context;
  };

  const stopLocalStream = () => {
    for (const track of localStream?.getTracks() ?? []) track.stop();
    localStream = undefined;
  };

  const closeAudio = () => {
    if (context) void context.close().catch(() => undefined);
    context = undefined;
    master = undefined;
  };

  const clearReconnects = () => {
    for (const timer of reconnectTimers) clearTimeout(timer);
    reconnectTimers.clear();
  };

  const detachAudio = (peer: Peer) => {
    peer.source?.disconnect();
    peer.gainNode?.disconnect();
    peer.panNode?.disconnect();
    peer.analyser?.disconnect();
    if (peer.element) {
      peer.element.pause();
      peer.element.srcObject = null;
    }
    peer.element = undefined;
    peer.source = undefined;
    peer.gainNode = undefined;
    peer.panNode = undefined;
    peer.analyser = undefined;
    peer.samples = undefined;
    peer.remoteStream = undefined;
  };

  const closePeer = (peer: Peer) => {
    peers.delete(peer.userId);
    detachAudio(peer);
    if (peer.connection) {
      peer.connection.onicecandidate = null;
      peer.connection.ontrack = null;
      peer.connection.onconnectionstatechange = null;
      peer.connection.close();
      peer.connection = undefined;
    }
    peer.speaking = false;
    peer.inRange = false;
  };

  const attachRemote = (peer: Peer, stream: MediaStream) => {
    const ctx = audioContext();
    detachAudio(peer);
    peer.remoteStream = stream;
    // Um <audio> tocando o stream é o que faz o navegador decodificar o áudio remoto (um
    // `MediaStreamAudioSourceNode` sozinho pode não puxar o decoder). O som sai pelo WebAudio:
    // elemento → ganho (distância/mudo) → pan (câmera) → volume geral → saída.
    const element =
      options.createAudioElement?.() ?? Object.assign(new Audio(), { autoplay: true });
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    // Alguns navegadores não aceitam `createMediaElementSource` para MediaStream: nesse caso o
    // analisador e o ganho leem o próprio stream (perde o "empurrão" do decoder, mas toca).
    let source: AudioNode;
    try {
      source = ctx.createMediaElementSource(element);
    } catch {
      element.pause();
      element.srcObject = null;
      source = ctx.createMediaStreamSource(stream);
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER_FFT;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0; // o primeiro `update` decide a distância
    const panNode = ctx.createStereoPanner();
    source.connect(analyser);
    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(master!);
    peer.element = element;
    peer.source = source;
    peer.analyser = analyser;
    peer.samples = new Uint8Array(analyser.fftSize);
    peer.gainNode = gainNode;
    peer.panNode = panNode;
  };

  /** Cria o canal 1:1 com o vizinho (uma vez) e manda a oferta se for a vez desta ponta. */
  const connectPeer = (peer: Peer) => {
    if (peer.connection) return;
    const configuration: RTCConfiguration = { iceServers: options.iceServers ?? [] };
    const connection =
      options.createPeerConnection?.(configuration) ?? new RTCPeerConnection(configuration);
    peer.connection = connection;
    for (const track of localStream?.getTracks() ?? []) {
      connection.addTrack(track, localStream!);
    }
    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      options.sendSignal(peer.userId, 'ice-candidate', {
        candidate: JSON.stringify(event.candidate.toJSON()),
      });
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      attachRemote(peer, stream);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState !== 'failed') return;
      // Sem TURN, uma troca de rede derruba o canal: recria depois de um instante (a ponta que
      // oferta manda a oferta de novo; a outra espera).
      connection.close();
      peer.connection = undefined;
      detachAudio(peer);
      peer.inRange = false;
      peer.speaking = false;
      if (!desired) return;
      const timer = setTimeout(() => {
        reconnectTimers.delete(timer);
        if (disposed || !desired || !localStream) return;
        connectPeer(peer);
        void sendOffer(peer);
      }, 1500);
      reconnectTimers.add(timer);
    };
  };

  const sendOffer = async (peer: Peer) => {
    if (peer.offering) return;
    const self = options.localUserId();
    if (!self || !startsOffer(self, peer.userId)) return;
    const connection = peer.connection;
    if (!connection || connection.signalingState !== 'stable') return;
    peer.offering = true;
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      options.sendSignal(peer.userId, 'offer', { sdp: offer.sdp ?? '' });
    } catch (cause) {
      console.warn('[voz] oferta falhou', cause);
    } finally {
      peer.offering = false;
    }
  };

  const flushCandidates = async (peer: Peer) => {
    const connection = peer.connection;
    if (!connection) return;
    const queued = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await connection.addIceCandidate(candidate);
      } catch (cause) {
        console.warn('[voz] candidato ICE rejeitado', cause);
      }
    }
  };

  const handleSignal: VoiceChat['onSignal'] = (event) => {
    let peer = peers.get(event.from.id);
    if (!peer) {
      peer = {
        userId: event.from.id,
        name: event.from.name,
        pendingCandidates: [],
        speaking: false,
        inRange: false,
        offering: false,
      };
      peers.set(peer.userId, peer);
    }
    if (!localStream) return; // saiu da voz enquanto a sinalização chegava
    connectPeer(peer);
    const connection = peer.connection!;
    void (async () => {
      try {
        if (event.type === 'offer') {
          await connection.setRemoteDescription({ type: 'offer', sdp: event.sdp ?? '' });
          await flushCandidates(peer);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          options.sendSignal(peer.userId, 'answer', { sdp: answer.sdp ?? '' });
          return;
        }
        if (event.type === 'answer') {
          await connection.setRemoteDescription({ type: 'answer', sdp: event.sdp ?? '' });
          await flushCandidates(peer);
          return;
        }
        if (!event.candidate) return;
        const candidate = JSON.parse(event.candidate) as RTCIceCandidateInit;
        if (!connection.remoteDescription) {
          peer.pendingCandidates.push(candidate);
          return;
        }
        await connection.addIceCandidate(candidate);
      } catch (cause) {
        console.warn('[voz] sinalização falhou', cause);
      }
    })();
  };

  const upsertPeer = (info: VoicePeerInfo): Peer => {
    const existing = peers.get(info.id);
    if (existing) {
      existing.name = info.name;
      return existing;
    }
    const peer: Peer = {
      userId: info.id,
      name: info.name,
      pendingCandidates: [],
      speaking: false,
      inRange: false,
      offering: false,
    };
    peers.set(peer.userId, peer);
    return peer;
  };

  const connectAll = () => {
    for (const peer of peers.values()) {
      if (!localStream) break;
      connectPeer(peer);
      void sendOffer(peer);
    }
  };

  const enable = async () => {
    if (disposed || status === 'on' || status === 'connecting') return;
    desired = true;
    error = undefined;
    status = 'connecting';
    emit();
    try {
      if (!localStream) {
        const request =
          options.getUserMedia ??
          ((constraints: MediaStreamConstraints) =>
            navigator.mediaDevices.getUserMedia(constraints));
        localStream = await request(DEFAULT_AUDIO_CONSTRAINTS);
      }
      if (!desired || disposed) return;
      for (const track of localStream.getAudioTracks()) track.enabled = !micMuted;
      status = 'on';
      emit();
      options.join();
      connectAll();
    } catch (cause) {
      desired = false;
      status = 'off';
      error = describeMicrophoneError(cause);
      stopLocalStream();
      emit();
    }
  };

  const disable = () => {
    desired = false;
    if (status === 'on' || status === 'connecting') options.leave();
    status = 'off';
    error = undefined;
    clearReconnects();
    for (const peer of [...peers.values()]) closePeer(peer);
    stopLocalStream();
    closeAudio();
    emit();
  };

  const update = (now: number) => {
    if (status !== 'on' || now - lastTick < UPDATE_INTERVAL_MS) return;
    lastTick = now;
    // Auto-cura: o canal ficou ocioso (nenhuma descrição trocada) — pode ter faltado a oferta na
    // entrada, quando o estado da sala ainda não tinha chegado. Quem manda a oferta tenta de novo.
    for (const peer of peers.values()) {
      const connection = peer.connection;
      if (
        connection &&
        connection.signalingState === 'stable' &&
        connection.remoteDescription === null &&
        connection.localDescription === null
      ) {
        void sendOffer(peer);
      }
    }
    const listener = options.listener();
    let changed = false;
    for (const peer of peers.values()) {
      let target = 0;
      let pan = 0;
      let inRange = false;
      const pose = options.locate(peer.userId);
      if (listener && pose) {
        const dx = pose.x - listener.x;
        const dz = pose.z - listener.z;
        const distance = Math.hypot(dx, dz);
        target = voiceGain(distance);
        inRange = target > 0;
        if (distance > 1e-3) {
          pan = panFor(
            { x: dx / distance, z: dz / distance },
            { x: listener.forwardX, z: listener.forwardZ },
          );
        }
      }
      const effective = mutedPeers.has(peer.userId) ? 0 : target;
      if (peer.gainNode && context) {
        peer.gainNode.gain.setTargetAtTime(effective, context.currentTime, AUDIO_SMOOTHING_S);
      }
      if (peer.panNode && context) {
        peer.panNode.pan.setTargetAtTime(pan, context.currentTime, AUDIO_SMOOTHING_S);
      }
      if (peer.inRange !== inRange) {
        peer.inRange = inRange;
        changed = true;
      }
      let speaking = false;
      if (peer.analyser && peer.samples && inRange) {
        peer.analyser.getByteTimeDomainData(peer.samples);
        speaking = isSpeaking(peer.samples);
      }
      if (peer.speaking !== speaking) {
        peer.speaking = speaking;
        changed = true;
      }
    }
    if (changed) emit();
  };

  return {
    enable,
    disable,
    setMuted(muted) {
      micMuted = muted;
      for (const track of localStream?.getAudioTracks() ?? []) track.enabled = !muted;
      emit();
    },
    setVolume(next) {
      volume = clamp01(next);
      if (master && context) master.gain.setTargetAtTime(volume, context.currentTime, 0.05);
      emit();
    },
    setPeerMuted(userId, muted) {
      if (muted) mutedPeers.add(userId);
      else mutedPeers.delete(userId);
      // Silenciar vale na hora; voltar ao volume normal fica com o próximo `update`.
      if (muted) {
        const peer = peers.get(userId);
        if (peer?.gainNode) peer.gainNode.gain.value = 0;
      }
      emit();
    },
    onPeers(event) {
      const listed = new Set(event.users.map((user) => user.id));
      for (const peer of [...peers.values()]) {
        if (!listed.has(peer.userId)) closePeer(peer);
      }
      for (const user of event.users) upsertPeer(user);
      connectAll();
      emit();
    },
    onPeerJoined(event) {
      upsertPeer(event.user);
      connectAll();
      emit();
    },
    onPeerLeft(event) {
      const peer = peers.get(event.userId);
      if (peer) closePeer(peer);
      emit();
    },
    onSignal: handleSignal,
    onSessionEnded() {
      clearReconnects();
      for (const peer of [...peers.values()]) closePeer(peer);
      emit();
    },
    onSessionReady() {
      if (!desired || !localStream) return;
      options.join();
    },
    update,
    getState: state,
    dispose() {
      if (disposed) return;
      disable();
      disposed = true;
    },
  };
}
