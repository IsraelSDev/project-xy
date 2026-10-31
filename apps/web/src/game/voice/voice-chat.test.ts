import { describe, expect, it } from 'vitest';
import { createVoiceChat, iceServersFromEnv, startsOffer, type VoiceState } from './voice-chat';

/** Canle de áudio de mentira: só o que o módulo usa (`enabled`, `stop`). */
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
  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
}

class FakeAudioParam {
  value = 0;
  setTargetAtTime(value: number) {
    this.value = value;
  }
}
class FakeNode {
  connected: FakeNode[] = [];
  connect(node: FakeNode) {
    this.connected.push(node);
    return node;
  }
  disconnect() {
    this.connected = [];
  }
}
class FakeGain extends FakeNode {
  gain = new FakeAudioParam();
}
class FakePanner extends FakeNode {
  pan = new FakeAudioParam();
}
class FakeAnalyser extends FakeNode {
  fftSize = 512;
  /** Amostras devolvidas por `getByteTimeDomainData`. */
  samples = new Uint8Array(512).fill(128);
  getByteTimeDomainData(target: Uint8Array) {
    target.set(this.samples.subarray(0, target.length));
  }
}
class FakeContext {
  currentTime = 0;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  analysers: FakeAnalyser[] = [];
  closed = false;
  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createStereoPanner() {
    return new FakePanner();
  }
  createAnalyser() {
    const node = new FakeAnalyser();
    this.analysers.push(node);
    return node;
  }
  createMediaStreamSource() {
    return new FakeNode();
  }
  createMediaElementSource() {
    return new FakeNode();
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

interface Harness {
  chat: ReturnType<typeof createVoiceChat>;
  states: VoiceState[];
  signals: { to: string; type: string; sdp?: string; candidate?: string }[];
  joins: number;
  leaves: number;
  context: FakeContext;
  track: FakeTrack;
  listener: { x: number; z: number; forwardX: number; forwardZ: number } | undefined;
  locate: Map<string, { x: number; z: number }>;
}

function harness(selfId = 'a'): Harness {
  FakeConnection.instances = [];
  const context = new FakeContext();
  const track = new FakeTrack();
  const stream = new FakeStream([track]);
  const states: VoiceState[] = [];
  const signals: Harness['signals'] = [];
  const locate = new Map<string, { x: number; z: number }>();
  const harness: Harness = {
    chat: undefined as unknown as Harness['chat'],
    states,
    signals,
    joins: 0,
    leaves: 0,
    context,
    track,
    listener: { x: 0, z: 0, forwardX: 0, forwardZ: -1 },
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
    createAudioContext: () => context as unknown as AudioContext,
    createAudioElement: () =>
      ({
        srcObject: null,
        play: () => Promise.resolve(),
        pause: () => undefined,
      }) as unknown as HTMLAudioElement,
  });
  return harness;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    const context = new FakeContext();
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
      createAudioContext: () => context as unknown as AudioContext,
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

  it('aplica ganho pela distância, pan pela câmera e detecta quem fala', async () => {
    const test = harness('a');
    await test.chat.enable();
    test.chat.onPeers({ users: [{ id: 'b', name: 'Bia' }] });
    await flush();

    // Áudio remoto chega: o módulo cria o grafo de WebAudio.
    const connection = FakeConnection.instances[0]!;
    connection.ontrack?.({
      streams: [new FakeStream([new FakeTrack()]) as unknown as MediaStream],
    } as unknown as RTCTrackEvent);
    const gain = test.context.gains.at(-1);

    // Perto (0 m) e à direita de quem olha para -z.
    test.locate.set('b', { x: 2, z: 0 });
    for (let index = 0; index < test.context.analysers[0]!.samples.length; index += 1) {
      test.context.analysers[0]!.samples[index] = index % 2 === 0 ? 0 : 255;
    }
    test.chat.update(1000);
    expect(gain?.gain.value).toBeCloseTo(1, 5);
    expect(test.chat.getState().peers[0]!.speaking).toBe(true);

    // Longe (além do alcance): ganho 0 e ninguém "falando".
    test.locate.set('b', { x: 40, z: 0 });
    test.chat.update(2000);
    expect(gain?.gain.value).toBe(0);
    expect(test.chat.getState().peers[0]!.inRange).toBe(false);
    expect(test.chat.getState().peers[0]!.speaking).toBe(false);
  });

  it('silenciar uma pessoa zera o ganho dela e o volume geral é aplicado', async () => {
    const test = harness('a');
    await test.chat.enable();
    test.chat.onPeerJoined({ user: { id: 'b', name: 'Bia' } });
    await flush();
    const connection = FakeConnection.instances[0]!;
    connection.ontrack?.({
      streams: [new FakeStream([new FakeTrack()]) as unknown as MediaStream],
    } as unknown as RTCTrackEvent);
    const gain = test.context.gains.at(-1)!;

    test.locate.set('b', { x: 0, z: 0 });
    test.chat.setVolume(0.5);
    test.chat.update(1000);
    expect(gain.gain.value).toBe(1); // ganho da pessoa (perto)

    test.chat.setPeerMuted('b', true);
    expect(test.chat.getState().peers[0]!.muted).toBe(true);
    expect(gain.gain.value).toBe(0);

    test.chat.update(2000);
    expect(gain.gain.value).toBe(0);
    test.chat.setPeerMuted('b', false);
    test.chat.update(3000);
    expect(gain.gain.value).toBeCloseTo(1, 5);
    // O volume geral fica no ganho mestre (criado antes do ganho da pessoa).
    expect(test.context.gains[0]!.gain.value).toBeCloseTo(0.5, 5);
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
