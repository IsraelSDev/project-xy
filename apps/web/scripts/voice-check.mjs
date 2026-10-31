/**
 * Confere a voz por proximidade com navegadores reais (microfone falso do Chrome): todos entram na
 * balada, ligam o microfone, se veem na lista, o áudio P2P flui e a sinalização fecha os canais.
 *
 * Uso: com API (:3000), realtime (:2567) e web (:5173) no ar:
 *   node scripts/voice-check.mjs [http://localhost:5173] [usuários]
 *
 * Cada usuário abre um Chromium próprio com um tom de frequência diferente na captura: o microfone
 * falso do Chrome é um bipe curto, e um tom contínuo deixa o áudio observável. Frequências diferentes
 * também impedem que o cancelamento de eco de um lado apague o tom do outro.
 *
 * Limitação do headless: sem dispositivo de saída de áudio, o Chrome decodifica o áudio remoto
 * (os samples aparecem no `getStats`), mas não o entrega ao WebAudio — o analisador fica em silêncio
 * e o ponto de "falando" não acende. O indicador de fala é coberto pelos testes de unidade com
 * analisador falso; aqui conferimos canais conectados e áudio decodificado.
 *
 * O cadastro tem limite de 5 por minuto por IP: rode uma vez por minuto.
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const USERS = Number(process.argv[3] ?? 2);
const REALTIME = process.env.REALTIME_URL ?? 'http://127.0.0.1:2567';

/** WAV de 4 s alternando 0,5 s de tom e 0,5 s de silêncio (o Chrome repete o arquivo em loop). */
function fakeAudioFile(frequency) {
  const rate = 48_000;
  const samples = rate * 4;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const playing = Math.floor(index / (rate / 2)) % 2 === 0;
    const value = playing ? Math.sin((2 * Math.PI * frequency * index) / rate) * 0.5 : 0;
    data.writeInt16LE(Math.round(value * 32_767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  const path = join(tmpdir(), `3dx-voz-${frequency}.wav`);
  writeFileSync(path, Buffer.concat([header, data]));
  return path;
}

const launch = (frequency) =>
  chromium.launch({
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      // Sem UI de permissão e com um microfone sintético em vez do dispositivo real.
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fakeAudioFile(frequency)}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

const report = { users: USERS, peers: {}, far: {}, summary: {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const register = async (page, label) => {
  // `commit` não espera o grafo de módulos (o app é grande); o clique no formulário espera a UI.
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.getByRole('tab', { name: 'Criar conta' }).click({ timeout: 120_000 });
  await page.getByLabel('E-mail').fill(`voz-${label}-${randomUUID().slice(0, 8)}@example.test`);
  await page.getByLabel('Senha').fill(`voz-${randomUUID()}`);
  await page.getByLabel('Nome público').fill(`Voz ${label} ${randomUUID().slice(0, 4)}`);
  await page.getByLabel('Data de nascimento').fill('1990-01-01');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  try {
    await page.locator('p.stats').first().waitFor({ timeout: 60_000 });
  } catch (error) {
    // Mostra o que apareceu na tela (limite de cadastros, erro de validação…).
    const notice = await page.locator('[role="alert"]').allTextContents();
    const visible = (await page.locator('body').innerText()).slice(0, 800);
    throw new Error(
      `cadastro de ${label} falhou: ${notice.join(' | ') || String(error)}\n--- tela ---\n${visible}`,
      { cause: error },
    );
  }
};

const openVoice = async (page) => {
  await page.bringToFront();
  await page.locator('.voice-header').click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Ligar microfone' }).click({ timeout: 60_000 });
  // O resumo muda quando o microfone abre e a sala confirma a entrada na voz; um erro (microfone
  // negado, por exemplo) encerra a espera com o motivo.
  await page.waitForFunction(
    () =>
      (document.querySelector('.voice-summary')?.textContent ?? '').includes('por perto') ||
      document.querySelector('.voice-error') !== null,
    undefined,
    { timeout: 90_000 },
  );
  const error = await page
    .locator('.voice-error')
    .textContent()
    .catch(() => null);
  if (error) throw new Error(`voz não ligou: ${error}`);
};

const clubClients = async () => {
  const rooms = await (await fetch(`${REALTIME}/rooms`)).json();
  const club =
    rooms.find((room) => room.title === 'Balada') ?? rooms.find((room) => room.clients > 1);
  return club?.clients ?? 0;
};

const players = [];
try {
  for (let index = 0; index < USERS; index += 1) {
    const label = String.fromCharCode(65 + index);
    const instance = await launch(380 + index * 130);
    const context = await instance.newContext({
      viewport: { width: 700, height: 480 },
      permissions: ['microphone'],
    });
    // Instrumenta o WebRTC para conferir o áudio (e não só a sinalização).
    await context.addInitScript(() => {
      const PeerConnection = window.RTCPeerConnection;
      window.__voiceConnections = [];
      window.RTCPeerConnection = new Proxy(PeerConnection, {
        construct(target, args) {
          const connection = new target(...args);
          window.__voiceConnections.push(connection);
          return connection;
        },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.on('pageerror', (error) => console.log(`[${label}] pageerror:`, error.message));
    await register(page, label);
    // O cadastro já entra na sala padrão (a balada).
    players.push({ label, instance, context, page });
  }

  // Todos na mesma sala (a balada é única e pública).
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await clubClients()) >= USERS) break;
    await sleep(500);
  }
  report.clubClients = await clubClients();

  for (const player of players) await openVoice(player.page);

  // Cada um vê todos os outros na lista de vozes (mesh completo, sem "longe").
  for (const player of players) {
    await player.page
      .locator('.voice-peers li .voice-name')
      .nth(USERS - 2)
      .waitFor({ timeout: 30_000 });
    report.peers[player.label] = await player.page
      .locator('.voice-peers li .voice-name')
      .allTextContents();
    report.summary[player.label] = (
      await player.page.locator('.voice-summary').textContent()
    )?.trim();
    report.far[player.label] = await player.page.locator('.voice-peers .voice-far').count();
  }

  // O tom na captura alterna: o indicador de fala deve acender em alguma ponta (informativo —
  // no headless o áudio remoto não chega ao WebAudio, então fica em 0).
  let speaking = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    speaking = 0;
    for (const player of players) {
      speaking += await player.page.locator('.voice-dot.is-speaking').count();
    }
    if (speaking > 0) break;
    await sleep(250);
  }
  report.speakingDots = speaking;

  // Áudio P2P: bytes e amostras decodificadas por canal (WebRTC instrumentado na entrada da página).
  report.audio = {};
  for (const player of players) {
    report.audio[player.label] = await player.page.evaluate(async () => {
      const summaries = [];
      for (const connection of window.__voiceConnections ?? []) {
        const stats = await connection.getStats();
        let inboundBytes = 0;
        let outboundBytes = 0;
        const inbound = [];
        stats.forEach((entry) => {
          if (entry.type === 'inbound-rtp' && entry.kind === 'audio') {
            inboundBytes += entry.bytesReceived ?? 0;
            inbound.push({
              samples: entry.totalSamplesReceived,
              energy: entry.totalAudioEnergy,
              level: entry.audioLevel,
            });
          }
          if (entry.type === 'outbound-rtp' && entry.kind === 'audio') {
            outboundBytes += entry.bytesSent ?? 0;
          }
        });
        summaries.push({
          state: connection.connectionState,
          inboundBytes,
          outboundBytes,
          inbound,
          receivers: connection.getReceivers().map((receiver) => ({
            kind: receiver.track?.kind,
            muted: receiver.track?.muted,
            state: receiver.track?.readyState,
          })),
        });
      }
      return summaries;
    });
  }

  // Mudo do próprio microfone e mute individual do vizinho (na primeira ponta).
  const first = players[0];
  await first.page.bringToFront();
  await first.page.getByRole('button', { name: 'Mudo' }).click();
  report.selfMuted = await first.page
    .getByRole('button', { name: 'Falar' })
    .getAttribute('aria-pressed');
  await first.page.locator('.voice-peer-mute').first().click();
  report.peerMutedLabel = (
    await first.page.locator('.voice-peer-mute').first().textContent()
  )?.trim();

  // Saída da voz da última ponta: os outros são avisados e a lista diminui.
  const last = players.at(-1);
  await last.page.bringToFront();
  await last.page.getByRole('button', { name: 'Sair da voz' }).click();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const count = await first.page.locator('.voice-peers li .voice-name').count();
    if (count === USERS - 2) break;
    await sleep(500);
  }
  report.afterLeave = {
    firstPeers: await first.page.locator('.voice-peers li .voice-name').count(),
    lastStatus: (await last.page.locator('.voice-summary').textContent())?.trim(),
  };
} finally {
  for (const player of players) await player.instance.close().catch(() => undefined);
}

console.log(JSON.stringify(report, null, 2));
