import { STATE_PATCH_INTERVAL_MS, type AvatarConfig } from '@3dx/contracts';
import {
  BEACH,
  CLUB,
  HOME,
  LOUNGE,
  PAIR_POSES,
  STUDIO,
  nearestSeatKind,
  obstaclesOf,
  type SeatKind,
  type Vec2,
} from '@3dx/game-core';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
// Side-effect obrigatório: sem `Culling/ray`, o `scene.pick`/`createPickingRay` usam um stub e
// devolvem `undefined` (ou estouram) — era por isso que o clique no mundo nunca achava nada.
import '@babylonjs/core/Culling/ray';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { createThirdPersonCamera, type ThirdPersonCamera } from '../camera/third-person-camera';
import { createAvatars, type PlayerSnapshot } from '../characters/avatars';
import { MANNEQUIN_FOCUS_HEIGHT } from '../characters/mannequin';
import { FLOOR_MESHES } from '../movement/pointer';
import {
  clubFloorHeight,
  createClubLighting,
  loadClub,
  type ClubLighting,
  type ClubRoom,
} from '../rendering/club';
import { loadBeach, type BeachRoom } from '../rendering/beach';
import { loadHome, type HomeRoom } from '../rendering/home';
import { buildLounge } from '../rendering/lounge';
import { buildStudio, type StudioRoom } from '../rendering/studio';

/**
 * Os avatares são exibidos este tanto no passado: com dois intervalos de atualização no buffer,
 * sempre há um snapshot de cada lado para interpolar, mesmo com um pouco de atraso na rede.
 */
export const INTERPOLATION_DELAY_MS = 2 * STATE_PATCH_INTERVAL_MS;

export interface World {
  camera: ThirdPersonCamera;
  /**
   * Aplica o estado autoritativo do servidor. `now` em ms, no mesmo relógio de `update`.
   * `hidden` são ids de usuário bloqueados pelo jogador local: o avatar deles não é exibido.
   */
  syncPlayers(
    players: ReadonlyMap<string, PlayerSnapshot>,
    localId: string,
    now: number,
    hidden?: ReadonlySet<string>,
  ): void;
  /** Remove todos os avatares (fim da sessão). */
  clearPlayers(): void;
  /** Avança interpolação, animação e câmera. */
  update(dt: number, now: number): void;
  /** Posição exibida do avatar local, se ele já apareceu (alvo do toque/clique). */
  localPosition(): Vec2 | undefined;
  /** Posição e frente exibidas de qualquer avatar (enquadramento de retrato no perfil). */
  avatarPoseOf(id: string): { x: number; z: number; heading: number } | undefined;
  /** Versão do visual do avatar (aparência + ação) para cachear o retrato do perfil. */
  avatarVersionOf(id: string): string | undefined;
  /** Esconde/mostra nome, balão e cabide do avatar (captura do retrato). */
  setAvatarDecorations(id: string, visible: boolean): void;
  /** Aquece o cache de um clipe de par (todos os modelos na cena) antes do estado chegar. */
  prefetchClip(action: string): void;
  /**
   * Início da interação vindo do servidor: alinha a fase do clipe do par nas duas pontas.
   * `type` é o tipo da interação (ex.: `sofa-3`); o clipe sai de `PAIR_POSES`.
   */
  notePairStart(type: string, startedAt: number): void;
  /** O corpo do jogador local já terminou de carregar (a cena está pronta para o ocioso). */
  localModelReady(): boolean;
  /**
   * O que está sob um ponto do canvas: um **avatar** (abre o menu) ou o **piso** (andar/sentar).
   * O piso é procurado mesmo abaixo de um móvel e, se a sala não tiver piso clicável, cai no plano
   * y=0 pelo raio da câmera — então tocar no sofá sempre devolve um ponto.
   */
  pickTap(
    x: number,
    y: number,
  ): { kind: 'avatar'; userId: string } | { kind: 'floor'; point: Vec2 } | undefined;
  /** Diagnóstico do toque (`?tap=1`): nomes do que cada busca encontrou. */
  pickTapDebug(
    x: number,
    y: number,
  ): { raw: string | null; mesh: string | null; screen: string | null; floor: string | null };
  /** Mostra acima do avatar de `userId` um balão com o texto do chat (some sozinho). */
  sayChat(userId: string, text: string): void;
  /** Prévia (não salva) da aparência do avatar local; `null` volta à do servidor. */
  previewLocalAvatar(avatar: AvatarConfig | null): void;
  /** Total de malhas dos avatares (diagnóstico de desempenho). */
  avatarMeshCount(): number;
  /** Troca o cenário visual e a iluminação; `home` e `club` carregam seus GLBs. */
  setScene(name: string): void;
}

/** Geometria de sala carregada (home, balada ou estúdio); o resto cai no layout provisório. */
type LoadedRoom = HomeRoom | ClubRoom | StudioRoom | BeachRoom;

/** Monta o lounge, luzes e câmera numa cena já criada. Não depende de canvas nem de rede. */
export function createWorld(scene: Scene): World {
  scene.clearColor = new Color4(0.03, 0.03, 0.05, 1);
  scene.ambientColor = new Color3(0.2, 0.18, 0.2);

  const ambient = new HemisphericLight('ambient-light', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.45;
  ambient.groundColor = new Color3(0.15, 0.12, 0.14);

  const key = new DirectionalLight('key-light', new Vector3(-0.35, -1, 0.25), scene);
  key.position = new Vector3(5, 12, -4);
  key.intensity = 0.55;

  const barLight = new PointLight('bar-light', new Vector3(-2, 2.8, 4.5), scene);
  barLight.diffuse = new Color3(1, 0.7, 0.4);
  barLight.intensity = 0.6;
  barLight.range = 8;

  const danceLight = new PointLight('dance-light', new Vector3(-4.5, 2.8, -4.2), scene);
  danceLight.diffuse = new Color3(0.7, 0.3, 1);
  danceLight.intensity = 0.7;
  danceLight.range = 7;

  const shadows = new ShadowGenerator(1024, key);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.002;

  const lounge = buildLounge(scene);
  lounge.shadowCasters.forEach((mesh) => {
    shadows.addShadowCaster(mesh);
  });

  const clubLighting: ClubLighting | undefined = (() => {
    try {
      return createClubLighting(scene);
    } catch (error: unknown) {
      // NullEngine (testes) não tem as constantes WebGL usadas pelo cubemap do clube.
      console.warn('Iluminação da balada indisponível nesta cena.', error);
      return undefined;
    }
  })();

  let loaded: { name: string; room: LoadedRoom } | undefined;
  let pendingName: string | undefined;
  let token = 0;
  const showPlaceholder = (visible: boolean) => {
    for (const mesh of lounge.meshes) mesh.setEnabled(visible);
  };

  /** Piso atual: a balada tem um degrau de 0,5 m no bar (o resto é y=0). */
  let floorHeight: (x: number, z: number) => number = clubFloorHeight;
  /** Mobília do assento em (x, z) no cenário atual, para escolher o clipe de sentar. */
  let seatKindAt: (x: number, z: number) => SeatKind | undefined = () => undefined;

  const applyLighting = (name: string | undefined) => {
    const isClub = name === 'club';
    // O estúdio é uma sala de teste: luz neutra e mais forte, sem as cores da balada.
    const isStudio = name === 'studio';
    // A praia é externa: luz de sol, céu claro e nenhuma das luzes coloridas da balada.
    const isBeach = name === 'beach';
    floorHeight = isClub ? clubFloorHeight : () => 0;
    const layout = isClub
      ? CLUB
      : name === 'home'
        ? HOME
        : name === 'beach'
          ? BEACH
          : name === 'lounge'
            ? LOUNGE
            : name === 'studio'
              ? STUDIO
              : undefined;
    seatKindAt = layout ? (x, z) => nearestSeatKind(layout, { x, z }) : () => undefined;
    ambient.intensity = isClub ? 0.42 : isStudio ? 0.75 : isBeach ? 0.72 : 0.45;
    ambient.diffuse = isClub
      ? new Color3(0.55, 0.48, 0.8)
      : isBeach
        ? new Color3(0.8, 0.9, 1)
        : new Color3(1, 1, 1);
    ambient.groundColor = isClub
      ? new Color3(0.08, 0.05, 0.12)
      : isStudio
        ? new Color3(0.3, 0.3, 0.33)
        : isBeach
          ? new Color3(0.62, 0.55, 0.42)
          : new Color3(0.15, 0.12, 0.14);
    key.intensity = isClub ? 0.18 : isStudio ? 0.8 : isBeach ? 0.95 : 0.55;
    // As luzes de bar/pista são posicionadas para a geometria da balada; no estúdio e na praia só
    // atrapalham.
    barLight.setEnabled(!isClub && !isStudio && !isBeach);
    danceLight.setEnabled(!isClub && !isStudio && !isBeach);
    scene.clearColor = isClub
      ? new Color4(0.008, 0.008, 0.016, 1)
      : isStudio
        ? new Color4(0.07, 0.072, 0.08, 1)
        : isBeach
          ? new Color4(0.55, 0.75, 0.92, 1)
          : new Color4(0.03, 0.03, 0.05, 1);
    clubLighting?.setEnabled(isClub);
    if (isClub) {
      // Hall inicial: a câmera começa de frente para o bar (o GLB é espelhado em X).
      camera.camera.alpha = 0;
      camera.camera.beta = 1.25;
    }
  };

  const unload = () => {
    loaded?.room.dispose();
    loaded = undefined;
  };

  const setScene = (name: string) => {
    if (loaded?.name === name) {
      showPlaceholder(false);
      applyLighting(name);
      return;
    }
    // O estúdio é procedural e síncrono: nenhum GLB para carregar, nenhum placeholder a exibir.
    if (name === 'studio') {
      token += 1;
      pendingName = undefined;
      unload();
      showPlaceholder(false);
      loaded = { name, room: buildStudio(scene) };
      applyLighting(name);
      return;
    }
    const loader =
      name === 'club'
        ? loadClub
        : name === 'home'
          ? loadHome
          : name === 'beach'
            ? loadBeach
            : undefined;
    if (!loader) {
      token += 1;
      pendingName = undefined;
      unload();
      showPlaceholder(true);
      // O nome vai junto para o cenário provisório ainda casar os assentos do layout (lounge).
      applyLighting(name);
      return;
    }
    if (pendingName === name) return;
    pendingName = name;
    const request = ++token;
    unload();
    showPlaceholder(true);
    void loader(scene)
      .then((room) => {
        if (request !== token || scene.isDisposed) {
          room.dispose();
          return;
        }
        pendingName = undefined;
        loaded = { name, room };
        showPlaceholder(false);
        applyLighting(name);
      })
      .catch((error: unknown) => {
        if (request !== token) return;
        pendingName = undefined;
        console.warn(
          `Não foi possível carregar a sala "${name}"; usando o layout provisório.`,
          error,
        );
        showPlaceholder(true);
        applyLighting(undefined);
      });
  };

  const avatars = createAvatars(
    scene,
    shadows,
    STATE_PATCH_INTERVAL_MS,
    (x, z) => floorHeight(x, z),
    (x, z) => seatKindAt(x, z),
  );
  let localId: string | undefined;
  /** `userId` do jogador local: o corpo dele não conta como alvo de toque (a câmera fica atrás). */
  let localUserId: string | undefined;

  /**
   * Resolve um toque em avatar ou piso. O avatar vem do pick da malha e, se ele falhar (malha não
   * pickable, câmera), do avatar mais próximo do ponto **em tela**. O piso vem do pick e, se a sala
   * não tiver piso clicável (a balada não tem), da interseção do raio com o plano y=0.
   */
  const resolveTap = (
    x: number,
    y: number,
  ): {
    hit: { kind: 'avatar'; userId: string } | { kind: 'floor'; point: Vec2 } | undefined;
    debug: { raw: string | null; mesh: string | null; screen: string | null; floor: string | null };
  } => {
    const engine = scene.getEngine();
    const levelInv = 1 / engine.getHardwareScalingLevel();

    const rawHit = scene.pick(x, y);
    const avatarHit = scene.pick(x, y, (mesh) => {
      const id = avatars.userIdOfMesh(mesh);
      return id !== undefined && id !== localUserId;
    });
    const meshUserId = avatarHit?.pickedMesh
      ? avatars.userIdOfMesh(avatarHit.pickedMesh)
      : undefined;
    // Reserva: corpo projetado na tela (o clique no corpo vale mesmo sem malha pickable).
    const screenUserId =
      meshUserId ?? avatars.nearestUserIdOnScreen(x * levelInv, y * levelInv, 40 * levelInv);
    const userId = screenUserId && screenUserId !== localUserId ? screenUserId : undefined;

    const floorHit = scene.pick(x, y, (mesh) => FLOOR_MESHES.has(mesh.name));
    let point = floorHit?.pickedPoint
      ? { x: floorHit.pickedPoint.x, z: floorHit.pickedPoint.z }
      : undefined;
    if (!point && scene.activeCamera) {
      const ray = scene.createPickingRay(x, y, Matrix.Identity(), scene.activeCamera);
      if (Math.abs(ray.direction.y) > 1e-6) {
        const distance = -ray.origin.y / ray.direction.y;
        if (distance > 0) {
          point = {
            x: ray.origin.x + ray.direction.x * distance,
            z: ray.origin.z + ray.direction.z * distance,
          };
        }
      }
    }

    const hit = userId
      ? ({ kind: 'avatar', userId } as const)
      : point
        ? ({ kind: 'floor', point } as const)
        : undefined;
    return {
      hit,
      debug: {
        raw: rawHit?.pickedMesh?.name ?? null,
        mesh: avatarHit?.pickedMesh?.name ?? null,
        screen: screenUserId ?? null,
        floor: floorHit?.pickedMesh?.name ?? null,
      },
    };
  };

  const spawnY = floorHeight(CLUB.spawn.position.x, CLUB.spawn.position.z);
  const focus = new Vector3(
    CLUB.spawn.position.x,
    MANNEQUIN_FOCUS_HEIGHT + spawnY,
    CLUB.spawn.position.z,
  );
  const camera = createThirdPersonCamera(scene, focus);
  // Pick/toque e a projeção dos avatares na tela dependem da câmera ativa da cena.
  scene.activeCamera = camera.camera;
  // Câmera inicial mais baixa para o quarto/balada; o jogador pode orbitar normalmente.
  camera.camera.beta = 1.35;
  camera.camera.radius = 3.6;
  setScene('club');

  // Diagnóstico: `?boxes=1` desenha as caixas de colisão da balada. Não é um
  // recurso de jogo; fica atrás do parâmetro para não afetar a cena normal.
  let debugHud: HTMLDivElement | undefined;
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('boxes')) {
    debugHud = document.createElement('div');
    debugHud.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:30;padding:6px 8px;' +
      'font:12px/1.4 ui-monospace,monospace;color:#fecaca;background:#1a0b0be6;' +
      'border:1px solid #7f1d1d;border-radius:6px;pointer-events:none;white-space:pre';
    document.body.append(debugHud);
    const material = new StandardMaterial('collision-debug', scene);
    material.emissiveColor = new Color3(1, 0.05, 0.05);
    material.disableLighting = true;
    material.alpha = 0.55;
    material.wireframe = true;
    for (const box of obstaclesOf(CLUB)) {
      const width = Math.max(0.02, box.maxX - box.minX);
      const depth = Math.max(0.02, box.maxZ - box.minZ);
      const mesh = CreateBox('collision-debug', { width, height: 2, depth }, scene);
      mesh.position.set((box.minX + box.maxX) / 2, 1, (box.minZ + box.maxZ) / 2);
      mesh.material = material;
      mesh.isPickable = false;
    }
  }

  // Diagnóstico de par desalinhado: `?pairs=1` mostra posição/frente/ação de cada avatar **depois**
  // da interpolação, isto é, o que está na tela. Serve para comparar as duas pontas: se os números
  // batem, o par está igual nas duas e a diferença é de câmera.
  let pairsHud: HTMLDivElement | undefined;
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('pairs')) {
    pairsHud = document.createElement('div');
    pairsHud.style.cssText =
      'position:fixed;left:12px;top:64px;z-index:30;padding:6px 8px;' +
      'font:12px/1.4 ui-monospace,monospace;color:#bfdbfe;background:#0b1220e6;' +
      'border:1px solid #1e3a8a;border-radius:6px;pointer-events:none;white-space:pre';
    document.body.append(pairsHud);
  }

  return {
    camera,
    syncPlayers(players, id, now, hidden) {
      localId = id;
      localUserId = players.get(id)?.userId;
      avatars.sync(players, id, now, hidden);
    },
    clearPlayers() {
      localId = undefined;
      localUserId = undefined;
      avatars.clear();
    },
    update(dt, now) {
      avatars.update(now - INTERPOLATION_DELAY_MS, dt);
      clubLighting?.update(now);

      const local = localId === undefined ? undefined : avatars.positionOf(localId);
      if (local) {
        focus.set(local.x, MANNEQUIN_FOCUS_HEIGHT + floorHeight(local.x, local.z), local.z);
      }
      if (debugHud && local) {
        const near = [
          ...new Set(
            CLUB.props
              .filter((prop) => {
                const closestX = Math.min(Math.max(local.x, prop.box.minX), prop.box.maxX);
                const closestZ = Math.min(Math.max(local.z, prop.box.minZ), prop.box.maxZ);
                return Math.hypot(local.x - closestX, local.z - closestZ) < 0.75;
              })
              .map((prop) => prop.name),
          ),
        ];
        debugHud.textContent =
          `x ${local.x.toFixed(2)}  z ${local.z.toFixed(2)}  piso ${floorHeight(local.x, local.z).toFixed(2)}\n` +
          `perto: ${near.length > 0 ? near.join(', ') : '-'}`;
      }
      if (pairsHud) {
        pairsHud.textContent = avatars
          .debugInfo()
          .map(
            (info) =>
              `${info.name.slice(0, 10).padEnd(10)} x ${info.x.toFixed(2).padStart(7)} ` +
              `z ${info.z.toFixed(2).padStart(7)} h ${((info.heading * 180) / Math.PI)
                .toFixed(0)
                .padStart(4)}° ${info.action || '-'} ${info.clip} f${info.frame.toFixed(0)}`,
          )
          .join('\n');
      }
      camera.follow(focus, dt);
    },
    previewLocalAvatar: (avatar) => avatars.previewLocal(avatar),
    sayChat: (userId, text) => avatars.say(userId, text),
    localPosition: () => (localId === undefined ? undefined : avatars.positionOf(localId)),
    pickTap: (x, y) => resolveTap(x, y).hit,
    pickTapDebug: (x, y) => resolveTap(x, y).debug,
    avatarPoseOf: (id) => avatars.poseOf(id),
    avatarVersionOf: (id) => avatars.versionOf(id),
    setAvatarDecorations: (id, visible) => avatars.setDecorationsVisible(id, visible),
    prefetchClip: (action) => avatars.prefetchClip(action),
    notePairStart: (type, startedAt) => {
      const pair = PAIR_POSES[type];
      if (!pair) return;
      const actions = pair.actor === pair.partner ? [pair.actor] : [pair.actor, pair.partner];
      avatars.notePairStart(actions, startedAt);
    },
    localModelReady: () => avatars.localModelReady(),
    avatarMeshCount: () => avatars.meshCount(),
    setScene,
  };
}
