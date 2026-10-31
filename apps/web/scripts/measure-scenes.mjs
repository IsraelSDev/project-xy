/**
 * Mede o desempenho do cliente (FPS e malhas) por cenário, com a sala cheia de bots.
 *
 * Pré-requisitos: `pnpm dev` (web na 5173, API na 3000 e realtime na 2567) e o banco no ar.
 *
 *   cd apps/web && node scripts/measure-scenes.mjs [--bots 10] [--scenes club,home,beach,studio]
 *
 * O navegador roda no Chromium com WebGL por software (SwiftShader), como nos e2e: os números
 * servem para COMPARAR cenários e escalas, não como FPS de GPU real.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    bots: { type: 'string', default: '10' },
    scenes: { type: 'string', default: 'club,home,beach,studio' },
    web: { type: 'string', default: 'http://localhost:5173' },
    realtime: { type: 'string', default: 'http://127.0.0.1:2567' },
    out: { type: 'string', default: 'perf-scenes.json' },
  },
});

const BOTS = Number(values.bots);
const SCENES = values.scenes
  .split(',')
  .map((scene) => scene.trim())
  .filter(Boolean);
const WEB = values.web;
const REALTIME = values.realtime;
const repoRoot = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readStats = async (page) => {
  const text = await page.locator('p.stats').last().textContent();
  const match = text?.match(
    /(\d+)\s*fps\D+(\d+)\s*malhas[^·]*·\s*(\d+)\s*tri\s*·\s*(\d+)\s*ossos\s*·\s*(\d+)\s*de avatares/,
  );
  if (!match) return undefined;
  return {
    fps: Number(match[1]),
    meshes: Number(match[2]),
    triangles: Number(match[3]),
    bones: Number(match[4]),
    avatarMeshes: Number(match[5]),
  };
};

/** Média e mediana de algumas leituras do HUD (o FPS oscila quadro a quadro). */
const sample = async (page, count = 12, intervalMs = 500) => {
  const readings = [];
  for (let index = 0; index < count; index++) {
    const stats = await readStats(page);
    if (stats) readings.push(stats);
    await sleep(intervalMs);
  }
  if (readings.length === 0) return undefined;
  const fps = readings.map((entry) => entry.fps).sort((a, b) => a - b);
  const median = fps[Math.floor(fps.length / 2)];
  const last = readings[readings.length - 1];
  return {
    fpsMedian: median,
    fpsMin: fps[0],
    fpsMax: fps[fps.length - 1],
    meshes: last.meshes,
    triangles: last.triangles,
    bones: last.bones,
    avatarMeshes: last.avatarMeshes,
    samples: readings.length,
  };
};

const rooms = async () => (await fetch(`${REALTIME}/rooms`)).json();

const waitFor = async (predicate, timeoutMs, label) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await sleep(500);
  }
  throw new Error(`tempo esgotado: ${label}`);
};

const register = async (page) => {
  await page.goto(WEB);
  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('E-mail').fill(`perf-${randomUUID().slice(0, 8)}@example.test`);
  await page.getByLabel('Senha').fill(`perf-${randomUUID()}`);
  await page.getByLabel('Nome público').fill(`Perf ${randomUUID().slice(0, 4)}`);
  await page.getByLabel('Data de nascimento').fill('1990-01-01');
  await page.getByRole('checkbox', { name: /Li e aceito/i }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.locator('p.stats').first().waitFor({ timeout: 30_000 });
  // O aviso de cookies cobre o rodapé; o teste escolhe "só essenciais" e segue.
  if (await page.locator('.cookie-banner').isVisible()) {
    await page.getByRole('button', { name: 'Só essenciais' }).click();
  }
};

const createRoom = async (page, scene, title) => {
  await page.getByRole('button', { name: 'Salas' }).click();
  await page.locator('summary', { hasText: 'Criar outra sala' }).click();
  await page.locator('input[name="title"]').fill(title);
  await page.getByLabel('Qualquer pessoa').check();
  await page.locator('select[name="scene"]').selectOption(scene);
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await page.getByRole('button', { name: 'Salas' }).waitFor({ timeout: 15_000 });
  await waitFor(
    async () => (await rooms()).some((room) => room.title === title),
    20_000,
    `sala ${title} na lista`,
  );
  const room = (await rooms()).find((entry) => entry.title === title);
  return room.roomId;
};

const spawnBots = (roomId) =>
  spawn(
    process.execPath,
    [
      '--conditions=@3dx/source',
      'scripts/bot.ts',
      '--room',
      roomId,
      '--count',
      String(BOTS),
      '--seconds',
      '45',
      '--web',
      WEB,
    ],
    { cwd: `${repoRoot}/apps/realtime`, stdio: 'ignore' },
  );

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const results = [];

try {
  await register(page);
  console.log('conta criada e sala inicial carregada');

  for (const scene of SCENES) {
    const title = `Perf ${scene} ${Date.now() % 100000}`;
    const roomId = await createRoom(page, scene, title);
    await sleep(6000); // cenário e corpo carregando

    const alone = await sample(page);
    console.log(`${scene}: sozinho`, alone);

    const bots = spawnBots(roomId);
    await waitFor(
      async () => {
        const entry = (await rooms()).find((item) => item.roomId === roomId);
        return entry !== undefined && entry.clients >= BOTS + 1;
      },
      90_000,
      `bots na sala ${scene}`,
    );
    await sleep(10_000); // os avatares dos bots carregam (GLB 13-15 MB cada, uma vez por modelo)
    const crowded = await sample(page);
    console.log(`${scene}: ${BOTS} bots`, crowded);

    results.push({ scene, bots: BOTS, alone, crowded });

    bots.kill();
    // A próxima sala (createRoom) já troca de cenário; os bots caem sozinhos no fim do `--seconds`.
    await sleep(3000);
  }
} finally {
  await browser.close();
  writeFileSync(values.out, JSON.stringify({ bots: BOTS, results }, null, 2));
  console.log(`resultado em ${values.out}`);
}
