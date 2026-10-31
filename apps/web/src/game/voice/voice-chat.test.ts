import { describe, expect, it } from 'vitest';
import { createVoiceChat, iceServersFromEnv, startsOffer, type VoiceState } from './voice-chat';

/** Canal de áudio de mentira: só o que o módulo usa (`enabled`, `stop`). */
class FakeTrack {
  enabled = true;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  constructor(readonly tracks: FakeTrack[] = [new FakeTrack()]) {}
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
}

/** Elemento de áudio de mentira: volume, play/pause e srcObject. */
class FakeElement {
  srcObject: MediaStream | null = null;
  volume = 1;
  muted = false;
  paused = true;
  isConnected = false;
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  remove() {
    this.isConnected = false;
  }
}

class FakeConnection {
  static instances: FakeConnection[] = [];
  signalingState: RTCSignalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addedTracks = 0;
  addedCandidates: RTCIceCandidateInit[] = [];
  closed = false;
  /** Nível de áudio que o `getStats` reporta (indicador de fala). */
  audioLevel = 0;
  statsCalls = 0;

  constructor(readonly configuration: RTCConfiguration) {
    FakeConnection.instances.push(this);
  }

  addTrack() {
    this.addedTracks += 1;
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'offer-sdp' });
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer' as const, sdp: 'answer-sdp' });
  }
  setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description as unknown as RTCSessionDescription;
    if (description.type === 'offer') this.signalingState = 'have-local-offer';
    if (description.type === 'answer') this.signalingState = 'stable';
    return Promise.resolve();
  }
  setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    if (description.type === 'offer') this.signalingState = 'have-remote-offer';
    if (description.type === 'answer') this.signalingState = 'stable';
    return Promise.resolve();
  }
  addIceCandidate(candidate: RTCIceCandidateInit) {
    this.addedCandidates.push(candidate);
    return Promise.resolve();
  }
  getStats() {
    this.statsCalls += 1;
    const entries = new Map<string, unknown>([
      ['inbound', { type: 'inbound-rtp', kind: 'audio', audioLevel: this.audioLevel }],
    ]);
    return Promise.resolve(entries as unknown as RTCStatsReport);
  }
  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
}

interface Harness {
  chat: ReturnType<typeof createVoiceChat>;
  states: VoiceState[];
  signals: { to: string; type: string; sdp?: string; candidate?: string }[];
  joins: number;
  leaves: number;
  track: FakeTrack;
  elements: FakeElement[];
  listener: { x: number; z: number } | undefined;
  locate: Map<string, { x: number; z: number }>;
}

function harness(selfId = 'a'): Harness {
  FakeConnection.instances = [];
  const track = new FakeTrack();
  const stream = new FakeStream([track]);
  const states: VoiceState[] = [];
  const signals: Harness['signals'] = [];
  const locate = new Map<string, { x: number; z: number }>();
  const elements: FakeElement[] = [];
  const harness: Harness = {
    chat: undefined as unknown as Harness['chat'],
    states,
    signals,
    joins: 0,
    leaves: 0,
    track,
    elements,
    listener: { x: 0, z: 0 },
    locate,
  };
  harness.chat = createVoiceChat({
    localUserId: () => selfId,
    join: () => {
      harness.joins += 1;
    },
    leave: () => {
      harness.leaves += 1;
    },
    sendSignal: (to, type, payload) => {
      signals.push({ to, type, ...payload });
    },
    onState: (state) => states.push(state),
    locate: (userId) => locate.get(userId),
    listener: () => harness.listener,
    getUserMedia: () => Promise.resolve(stream as unknown as MediaStream),
    createPeerConnection: (configuration) =>
      new FakeConnection(configuration) as unknown as RTCPeerConnection,
    createAudioElement: () => {
      const element = new FakeElement();
      elements.push(element);
      return element as unknown as HTMLAudioElement;
    },
  });
  return harness;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Roda o `update` até o volume se estabilizar (a suavização leva alguns quadros). */
function settle(chat: ReturnType<typeof createVoiceChat>, start: number) {
  for (let step = 1; step <= 12; step += 1) chat.update(start + step * 200);
}

describe('regra de oferta', () => {
  it('só quem tem o id menor cria a oferta', () => {
    expect(startsOffer('a', 'b')).toBe(true);
    expect(startsOffer('b', 'a')).toBe(false);
    expect(startsOffer('a', 'a')).toBe(false);
  });
});

describe('ICE por ambiente', () => {
  it('lê a lista JSON e ignora entradas inválidas', () => {
    expect(iceServersFromEnv(undefined)).toEqual([]);
    expect(iceServersFromEnv('não é json')).toEqual([]);
    expect(iceServersFromEnv('{"urls":"stun:x"}')).toEqual([]);
    expect(
      iceServersFromEnv(
        JSON.stringify([
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: ['turn:a', 'turn:b'], username: 'u', credential: 'c' },
          { nada: true },
        ]),
      ),
    ).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: ['turn:a', 'turn:b'], username: 'u', credential: 'c' },
    ]);
  });
});

describe('voz por proximidade', () => {
  it('liga o microfone, entra na voz e desliga ao sair', async () => {
    const test = harness();
    const { chat, track } = test;
    await chat.enable();

    expect(test.joins).toBe(1);
    expect(chat.getState().status).toBe('on');
    expect(test.states.at(-1)?.status).toBe('on');

    chat.setMuted(true);
    expect(track.enabled).toBe(false);
    expect(chat.getState().muted).toBe(true);

    chat.disable();
    expect(test.leaves).toBe(1);
    expect(track.stopped).toBe(true);
    expect(chat.getState().status).toBe('off');
  });

  it('avisa quando o microfone é negado', async () => {
    const chat = createVoiceChat({
      localUserId: () => 'a',
      join: () => undefined,
      leave: () => undefined,
      sendSignal: () => undefined,
      onState: () => undefined,
      locate: () => undefined,
      listener: () => undefined,
      getUserMedia: () =>
        Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })),
    });
    await chat.enable();
    expect(chat.getState().status).toBe('off');
    expect(chat.getState().error).toContain('Permissão do microfone');
  });

  it('quem tem o id menor manda a oferta e lista o vizinho', async () => {
    const test = harness('a');
    await test.chat.enable();
    test.chat.onPeers({ users: [{ id: 'b', name: 'Bia' }] });
    await flush();

    expect(test.signals).toContainEqual({ to: 'b', type: 'offer', sdp: 'offer-sdp' });
    expect(FakeConnection.instances).toHaveLength(1);
    expect(FakeConnection.instances[0]!.addedTracks).toBe(1);
    expect(test.chat.getState().peers).toEqual([
      expect.objectContaining({ userId: 'b', name: 'Bia', speaking: false }),
    ]);
  });

  it('quem tem o id maior espera a oferta e responde', async () => {
    const test = harness('b');
    await test.chat.enable();
    test.chat.onPeerJoined({ user: { id: 'a', name: 'Ana' } });
    await flush();
    expect(test.signals).toHaveLength(0);

    test.chat.onSignal({ from: { id: 'a', name: 'Ana' }, type: 'offer', sdp: 'oferta' });
    await flush();
    expect(test.signals).toContainEqual({ to: 'a', type: 'answer', sdp: 'answer-sdp' });
    expect(FakeConnection.instances[0]!.remoteDescription?.sdp).toBe('oferta');
  });

  it('guarda candidatos ICE até a descrição remota existir', async () => {
    const test = harness('b');
    await test.chat.enable();
    test.chat.onSignal({
      from: { id: 'a', name: 'Ana' },
      type: 'ice-candidate',
      candidate: '{"candidate":"cedo"}',
    });
    await flush();
    expect(FakeConnection.instances[0]!.addedCandidates).toHaveLength(0);

    test.chat.onSignal({ from: { id: 'a', name: 'Ana' }, type: 'offer', sdp: 'oferta' });
    await flush();
    expect(FakeConnection.instances[0]!.addedCandidates).toEqual([{ candidate: 'cedo' }]);
  });

  it('aplica o volume pela distância e detecta quem fala pelo nível do RTP', async () => {
    const test = harness('a');
    await test.chat.enable();
    test.chat.onPeers({ users: [{ id: 'b', name: 'Bia' }] });
    await flush();

    // Áudio remoto chega: o módulo cria o elemento que toca o stream.
    const connection = FakeConnection.instances[0]!;
    connection.ontrack?.({
      streams: [new FakeStream([new FakeTrack()]) as unknown as MediaStream],
    } as unknown as RTCTrackEvent);
    const element = test.elements.at(-1)!;
    expect(element.volume).toBe(0);
    expect(element.paused).toBe(false);

    // Perto: volume cheio.
    test.locate.set('b', { x: 2, z: 0 });
    settle(test.chat, 1000);
    expect(element.volume).toBeCloseTo(1, 2);

    // Longe (além do alcance): volume 0 e ninguém "falando".
    test.locate.set('b', { x: 40, z: 0 });
    settle(test.chat, 4000);
    expect(element.volume).toBe(0);
    expect(test.chat.getState().peers[0]!.inRange).toBe(false);

    // De volta ao alcance, com voz no RTP: o ponto de fala acende.
    test.locate.set('b', { x: 1, z: 0 });
    await flush(); // resolve leituras de nível pendentes dos passos anteriores
    connection.audioLevel = 0.5;
    test.chat.update(7000);
    await flush();
    test.chat.update(7200);
    expect(test.chat.getState().peers[0]!.speaking).toBe(true);

    // Silêncio no RTP apaga o ponto.
    await flush();
    connection.audioLevel = 0;
    test.chat.update(7600);
    await flush();
    test.chat.update(7800);
    expect(test.chat.getState().peers[0]!.speaking).toBe(false);
  });

  it('silenciar uma pessoa zera o volume dela e o volume geral é aplicado', async () => {
    const test = harness('a');
    await test.chat.enable();
    test.chat.onPeerJoined({ user: { id: 'b', name: 'Bia' } });
    await flush();
    const connection = FakeConnection.instances[0]!;
    connection.ontrack?.({
      streams: [new FakeStream([new FakeTrack()]) as unknown as MediaStream],
    } as unknown as RTCTrackEvent);
    const element = test.elements.at(-1)!;

    test.locate.set('b', { x: 0, z: 0 });
    test.chat.setVolume(0.5);
    settle(test.chat, 1000);
    expect(element.volume).toBeCloseTo(0.5, 2);

    test.chat.setPeerMuted('b', true);
    expect(test.chat.getState().peers[0]!.muted).toBe(true);
    expect(element.volume).toBe(0);

    test.chat.update(2000);
    expect(element.volume).toBe(0);
    test.chat.setPeerMuted('b', false);
    settle(test.chat, 3000);
    expect(element.volume).toBeCloseTo(0.5, 2);
  });

  it('mantém o microfone ao trocar de sala e entra de novo na voz', async () => {
    const test = harness('a');
    await test.chat.enable();
    test.chat.onPeers({ users: [{ id: 'b', name: 'Bia' }] });
    await flush();
    expect(FakeConnection.instances[0]!.closed).toBe(false);

    test.chat.onSessionEnded();
    expect(FakeConnection.instances[0]!.closed).toBe(true);
    expect(test.chat.getState().peers).toEqual([]);
    expect(test.track.stopped).toBe(false);

    test.chat.onSessionReady();
    expect(test.joins).toBe(2);
  });

  it('ao sair da voz fecha os canais e não aceita mais sinalização', async () => {
    const test = harness('a');
    await test.chat.enable();
    test.chat.onPeers({ users: [{ id: 'b', name: 'Bia' }] });
    await flush();
    test.chat.disable();
    expect(FakeConnection.instances[0]!.closed).toBe(true);
    expect(test.chat.getState().peers).toEqual([]);

    const before = test.signals.length;
    test.chat.onSignal({ from: { id: 'b', name: 'Bia' }, type: 'offer', sdp: 'x' });
    await flush();
    expect(test.signals.length).toBe(before);
  });
});
