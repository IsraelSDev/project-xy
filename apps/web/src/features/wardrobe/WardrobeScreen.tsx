import {
  ACCESSORIES,
  AVATAR_MODELS,
  AVATAR_PARTS,
  BODY_TYPES,
  DECAL_CATEGORIES,
  DECAL_SLOTS,
  EYE_COLORS,
  PALETTE,
  POSE_ACTIONS,
  SKIN_TEXTURES,
  SKIN_TONES,
  TOP_LAYER_SLOTS,
  defaultAvatarFor,
  partFitsModel,
  topLayerChoice,
  withTopLayer,
  type AvatarConfig,
  type AvatarModelId,
  type DecalChoice,
  type PartSlot,
} from '@3dx/contracts';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../app/api';
import { loadPosePresets } from '../../game/characters/goe-poses';
import { createWardrobeStage, type WardrobeStage } from '../../game/wardrobe/wardrobe-stage';
import { SLOT_LABELS } from '../avatar/part-labels';

interface WardrobeScreenProps {
  /** Depois de salvar: a sala precisa de um ticket novo para os outros verem a mudança. */
  onSaved: () => Promise<void>;
  onClose: () => void;
}

interface Option {
  id: string;
  label: string;
  hex?: string;
}

type TabId = 'corpo' | 'cabelo' | 'roupas' | 'acessorios' | 'tatuagens' | 'poses';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'corpo', label: 'Corpo' },
  { id: 'cabelo', label: 'Cabelo' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'acessorios', label: 'Acessórios' },
  { id: 'tatuagens', label: 'Tatuagens' },
  { id: 'poses', label: 'Poses' },
];

/** Slots de peça de cada aba (Corpo, Tatuagens e Poses têm conteúdo próprio). */
const TAB_PARTS: Record<TabId, readonly PartSlot[]> = {
  corpo: [],
  cabelo: ['hair'],
  // O casaco divide a camada da camiseta: aparece no grupo 'top' (escolha única), não em grupo próprio.
  roupas: ['top', 'bottom', 'costume', 'socks', 'shoes'],
  acessorios: [
    'hat',
    'glasses',
    'headphones',
    'moustache',
    'pacifier',
    'clownNose',
    'emotion',
    'gloves',
  ],
  tatuagens: [],
  poses: [],
};

const SLOTS_WITH_COLOR: readonly PartSlot[] = ['hair', 'top', 'bottom'];

/** Textura de um decalque na biblioteca (mesmo caminho que o renderizador usa no mundo). */
const decalUrl = (category: string, image: string) =>
  `/assets/goe/decals/${category}/${image}.webp`;

const poseLabel = (id: string) =>
  POSE_ACTIONS.find((pose) => pose.id === id)?.label ?? `Pose ${id}`;

/**
 * Vestiário: tela cheia com um palco 3D próprio para vestir o avatar e experimentar cada cabelo,
 * peça, acessório e decalque fora do mundo — a sala continua no fundo, com o loop parado.
 *
 * Catálogo liberado de propósito: a tela existe para provar tudo, então nenhuma peça é bloqueada por
 * não ter sido comprada (a API valida a compra só na hora de salvar).
 */
export function WardrobeScreen({ onSaved, onClose }: WardrobeScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<WardrobeStage>(undefined);
  const [draft, setDraft] = useState<AvatarConfig>();
  const [decals, setDecals] = useState<Record<string, string[]>>({});
  const [poses, setPoses] = useState<string[]>([]);
  const [tab, setTab] = useState<TabId>('corpo');
  const [spinning, setSpinning] = useState(false);
  const [pose, setPose] = useState<string>();
  const [openDecal, setOpenDecal] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState({ fps: 0, meshes: 0 });

  // O palco vive enquanto a tela está aberta; o mundo fica parado atrás (ver `setPaused`).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = createWardrobeStage(canvas, {
      onReady: () => setReady(true),
      onError: setError,
    });
    stageRef.current = stage;
    const timer = window.setInterval(
      () => setStats({ fps: stage.fps(), meshes: stage.meshCount() }),
      1000,
    );
    return () => {
      window.clearInterval(timer);
      stage.dispose();
      stageRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<AvatarConfig>('/avatar')
      .then((avatar) => {
        if (!cancelled) setDraft(avatar);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Falha ao carregar.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Imagens de decalque por categoria (geradas junto com a biblioteca de assets).
  useEffect(() => {
    let cancelled = false;
    fetch('/assets/goe/decals/manifest.json')
      .then((response) =>
        response.ok ? (response.json() as Promise<Record<string, string[]>>) : {},
      )
      .then((manifest) => {
        if (!cancelled) setDecals(manifest);
      })
      .catch(() => {
        if (!cancelled) setDecals({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Poses estáticas exportadas do GoE (mesmo arquivo que o mundo carrega sob demanda).
  useEffect(() => {
    let cancelled = false;
    loadPosePresets()
      .then((presets) => {
        if (!cancelled) setPoses([...presets.keys()]);
      })
      .catch(() => {
        if (!cancelled) setPoses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draft) stageRef.current?.setAppearance(draft);
  }, [draft]);

  useEffect(() => {
    stageRef.current?.setPose(pose);
  }, [pose]);

  const change = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    if (!draft) return;
    // Trocar de modelo troca o esqueleto: as peças do modelo anterior não servem, então volta ao
    // conjunto padrão do novo modelo (mantendo tom de pele, corpo e cores escolhidos).
    const next =
      key === 'model'
        ? {
            ...defaultAvatarFor(value as AvatarModelId),
            body: draft.body,
            skin: draft.skin,
            skinTexture: draft.skinTexture,
            eyes: draft.eyes,
            hairColor: draft.hairColor,
            topColor: draft.topColor,
            bottomColor: draft.bottomColor,
            accessory: draft.accessory,
          }
        : { ...draft, [key]: value };
    setDraft(next);
  };
  const choices = <K extends keyof AvatarConfig>(
    key: K,
    legend: string,
    options: readonly Option[],
    selection?: { value: string; onPick: (id: string) => void },
  ) =>
    draft && (
      <fieldset className={options[0]?.hex ? 'swatches' : 'choices'} key={String(key)}>
        <legend>{legend}</legend>
        {options.map((option) => (
          <label key={option.id} title={option.label}>
            <input
              type="radio"
              name={String(key)}
              value={option.id}
              checked={selection ? selection.value === option.id : draft[key] === option.id}
              onChange={() =>
                selection ? selection.onPick(option.id) : change(key, option.id as AvatarConfig[K])
              }
            />
            {option.hex ? (
              <span
                className="swatch"
                style={{ background: option.hex }}
                aria-label={option.label}
              />
            ) : (
              option.label
            )}
          </label>
        ))}
      </fieldset>
    );

  // Peças da biblioteca: 'Nenhum' + as do slot que servem no modelo atual.
  const partChoices = (slot: PartSlot) => {
    const model = draft?.model;
    // Camiseta e casaco dividem a mesma camada: um grupo só, de escolha única.
    const isTop = slot === 'top';
    const items = AVATAR_PARTS.filter(
      (part) =>
        (isTop ? (TOP_LAYER_SLOTS as readonly string[]).includes(part.slot) : part.slot === slot) &&
        model !== undefined &&
        partFitsModel(part, model),
    );
    if (items.length === 0) return undefined;
    const options = [
      { id: 'none', label: 'Nenhum' },
      ...items.map((part) => ({ id: part.id, label: part.label })),
    ];
    if (!isTop || !draft) return choices(slot, SLOT_LABELS[slot], options);
    return choices('top', SLOT_LABELS.top, options, {
      value: topLayerChoice(draft),
      onPick: (id) => setDraft(withTopLayer(draft, id)),
    });
  };

  const setDecal = (slot: DecalChoice['slot'], category: string, image: string) => {
    if (!draft) return;
    const rest = draft.decals.filter((item) => item.slot !== slot);
    change('decals', [...rest, { slot, category: category as DecalChoice['category'], image }]);
  };

  const clearDecal = (slot: DecalChoice['slot']) => {
    if (!draft) return;
    change(
      'decals',
      draft.decals.filter((item) => item.slot !== slot),
    );
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(undefined);
    try {
      await api('/avatar', { method: 'PUT', json: draft });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };

  const colorKey = (slot: PartSlot) =>
    slot === 'hair' ? 'hairColor' : slot === 'top' ? 'topColor' : 'bottomColor';

  return (
    <div className="wardrobe" role="dialog" aria-modal="true" aria-label="Vestiário">
      <canvas ref={canvasRef} className="wardrobe-canvas" aria-label="Prévia do avatar" />
      {!ready && (
        <p className="wardrobe-loading" role="status">
          Vestindo o avatar…
        </p>
      )}

      <div className="wardrobe-view hud-panel" role="group" aria-label="Câmera">
        <button type="button" onClick={() => stageRef.current?.setView('front')}>
          Frente
        </button>
        <button type="button" onClick={() => stageRef.current?.setView('back')}>
          Costas
        </button>
        <button
          type="button"
          title="Girar 45° para a esquerda"
          onClick={() => stageRef.current?.spin(-Math.PI / 4)}
        >
          ⟲
        </button>
        <button
          type="button"
          title="Girar 45° para a direita"
          onClick={() => stageRef.current?.spin(Math.PI / 4)}
        >
          ⟳
        </button>
        <button
          type="button"
          className={spinning ? 'primary' : undefined}
          title="Girar sozinho"
          onClick={() => {
            const next = !spinning;
            setSpinning(next);
            stageRef.current?.setSpinning(next);
          }}
        >
          Girar
        </button>
        <button type="button" title="Aproximar" onClick={() => stageRef.current?.zoom(0.85)}>
          +
        </button>
        <button type="button" title="Afastar" onClick={() => stageRef.current?.zoom(1.15)}>
          −
        </button>
      </div>

      <section className="wardrobe-catalog hud-panel">
        <header className="wardrobe-head">
          <h2>Vestiário</h2>
          <span className="wardrobe-stats" aria-live="off">
            {stats.fps} fps · {stats.meshes} malhas
          </span>
        </header>
        <p className="wardrobe-hint">
          Tudo liberado para provar: a prévia é local e nada muda no mundo até você salvar.
        </p>

        <nav className="wardrobe-tabs" aria-label="Seções">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === tab ? 'primary' : undefined}
              aria-current={entry.id === tab}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        {!draft && !error && <p>Carregando…</p>}

        <div className="wardrobe-form">
          {tab === 'corpo' && (
            <>
              {choices('model', 'Modelo', AVATAR_MODELS)}
              {choices('body', 'Corpo', BODY_TYPES)}
              {choices('skin', 'Tom de pele', SKIN_TONES)}
              {choices('eyes', 'Olhos', EYE_COLORS)}
              {choices(
                'skinTexture',
                'Pele',
                SKIN_TEXTURES.map((item) => ({
                  id: item.id,
                  label: item.label,
                })),
              )}
            </>
          )}

          {tab === 'cabelo' && (
            <>
              {partChoices('hair')}
              {choices('hairColor', 'Cor do cabelo', PALETTE)}
            </>
          )}

          {tab === 'roupas' && (
            <>
              {TAB_PARTS.roupas.map((slot) => (
                <div className="wardrobe-slot" key={slot}>
                  {partChoices(slot)}
                  {SLOTS_WITH_COLOR.includes(slot) &&
                    !(slot === 'top' && draft?.outerwear !== 'none') &&
                    choices(colorKey(slot), `Cor — ${SLOT_LABELS[slot]}`, PALETTE)}
                </div>
              ))}
            </>
          )}

          {tab === 'acessorios' && (
            <>
              {TAB_PARTS.acessorios.map((slot) => (
                <div className="wardrobe-slot" key={slot}>
                  {partChoices(slot)}
                </div>
              ))}
              {choices('accessory', 'Acessório clássico', ACCESSORIES)}
            </>
          )}

          {tab === 'tatuagens' && (
            <>
              {DECAL_SLOTS.map((slot) => {
                const current = draft?.decals.find((item) => item.slot === slot.id);
                const images = current ? (decals[current.category] ?? []) : [];
                const open = openDecal === slot.id;
                return (
                  <fieldset className="decal-slot" key={slot.id}>
                    <legend>{slot.label}</legend>
                    <div className="decal-line">
                      <select
                        aria-label={`Categoria do decalque em ${slot.label}`}
                        value={current?.category ?? ''}
                        onChange={(event) => {
                          const category = event.target.value;
                          if (!category) {
                            clearDecal(slot.id);
                            return;
                          }
                          const first = decals[category]?.[0];
                          if (first) setDecal(slot.id, category, first);
                        }}
                      >
                        <option value="">Nenhum</option>
                        {DECAL_CATEGORIES.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                      {current && images.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setOpenDecal(open ? undefined : slot.id)}
                          >
                            {open ? 'Fechar' : `${images.length} opções`}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => clearDecal(slot.id)}
                          >
                            Limpar
                          </button>
                        </>
                      )}
                    </div>
                    {current && open && images.length > 0 && (
                      <div className="decal-grid">
                        {images.map((image) => (
                          <button
                            key={image}
                            type="button"
                            className={current.image === image ? 'decal selected' : 'decal'}
                            title={image}
                            onClick={() => setDecal(slot.id, current.category, image)}
                          >
                            <img
                              src={decalUrl(current.category, image)}
                              alt={image}
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </>
          )}

          {tab === 'poses' && (
            <fieldset className="choices">
              <legend>Pose</legend>
              {[
                { id: '', label: 'Parado (neutro)' },
                ...poses.map((id) => ({ id, label: poseLabel(id) })),
              ].map((item) => (
                <label key={item.id || 'neutral'} title={item.label}>
                  <input
                    type="radio"
                    name="pose"
                    value={item.id}
                    checked={(pose ?? '') === item.id}
                    onChange={() => setPose(item.id || undefined)}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        {error && <p role="alert">{error}</p>}

        <div className="dialog-actions">
          <button
            type="button"
            className="ghost"
            disabled={!draft}
            onClick={() => setDraft(defaultAvatarFor(draft?.model ?? 'goe-male'))}
          >
            Restaurar padrão
          </button>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={!draft || saving}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </section>
    </div>
  );
}
