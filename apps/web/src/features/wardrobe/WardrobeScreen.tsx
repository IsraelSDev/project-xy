import {
  ACCESSORIES,
  AVATAR_MODELS,
  AVATAR_PARTS,
  DECAL_CATEGORIES,
  DECAL_SLOTS,
  EYE_COLORS,
  HEIGHT_MAX,
  HEIGHT_MIN,
  PALETTE,
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
import {
  createWardrobeStage,
  type WardrobeFocus,
  type WardrobeStage,
} from '../../game/wardrobe/wardrobe-stage';
import { SLOT_LABELS } from '../avatar/part-labels';
import { randomAvatar } from './random-avatar';

interface WardrobeScreenProps {
  /** Depois de salvar: a sala precisa de um ticket novo para os outros verem a mudança. */
  onSaved: () => Promise<void>;
  onClose: () => void;
}

const FOCUS_OPTIONS: readonly { id: WardrobeFocus; label: string }[] = [
  { id: 'body', label: 'Corpo inteiro' },
  { id: 'face', label: 'Rosto' },
  { id: 'profile', label: 'Perfil' },
  { id: 'torso', label: 'Tronco' },
  { id: 'arms', label: 'Braços' },
  { id: 'legs', label: 'Pernas' },
  { id: 'back', label: 'Costas' },
];

interface Option {
  id: string;
  label: string;
  hex?: string;
}

type ColorKey = 'hairColor' | 'topColor' | 'bottomColor' | 'eyeColor';
type ColorHexKey = 'hairColorHex' | 'topColorHex' | 'bottomColorHex' | 'eyeColorHex';

const HEX = /^#[0-9a-f]{6}$/i;

function rgbOf(hex: string): [number, number, number] {
  const value = HEX.test(hex) ? hex.slice(1) : 'c68e68';
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function hexOf(rgb: readonly number[]): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

type TabId = 'corpo' | 'cabelo' | 'roupas' | 'acessorios' | 'tatuagens';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'corpo', label: 'Corpo' },
  { id: 'cabelo', label: 'Cabelo' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'acessorios', label: 'Acessórios' },
  { id: 'tatuagens', label: 'Tatuagens' },
];

/** Slots de peça de cada aba (Corpo e Tatuagens têm conteúdo próprio). */
const TAB_PARTS: Record<TabId, readonly PartSlot[]> = {
  corpo: [],
  cabelo: ['hair'],
  // O casaco divide a camada da camiseta: aparece no grupo 'top' (escolha única), não em grupo próprio.
  roupas: ['top', 'bottom', 'underwear', 'costume', 'socks', 'shoes'],
  acessorios: [
    'hat',
    'glasses',
    'mask',
    'headphones',
    'moustache',
    'pacifier',
    'clownNose',
    'emotion',
    'gloves',
  ],
  tatuagens: [],
};

const SLOTS_WITH_COLOR: readonly PartSlot[] = ['hair', 'top', 'bottom'];

/** Textura de um decalque na biblioteca 3DX (mesmo caminho que o renderizador usa no mundo). */
const decalUrl = (category: string, image: string) =>
  `/assets/3dx/decals/${category}/${image}.webp`;

/**
 * Vestiário: tela cheia com um palco 3D próprio para vestir o avatar e experimentar cada cabelo,
 * peça e acessório fora do mundo — a sala continua no fundo, com o loop parado.
 *
 * Catálogo liberado de propósito: a tela existe para provar tudo, então nenhuma peça é bloqueada por
 * não ter sido comprada (a API valida a compra só na hora de salvar).
 */
export function WardrobeScreen({ onSaved, onClose }: WardrobeScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<WardrobeStage>(undefined);
  const [draft, setDraft] = useState<AvatarConfig>();
  const [paletteKey, setPaletteKey] = useState<ColorKey>();
  const [decals, setDecals] = useState<Record<string, string[]>>({});
  const [tab, setTab] = useState<TabId>('corpo');
  // Sem foco ativo depois de um giro à mão (`undefined`): a câmera fica livre até clicar num FOCO.
  const [focus, setFocus] = useState<WardrobeFocus | undefined>('body');
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
      onOrbit: () => setFocus(undefined),
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

  useEffect(() => {
    if (draft) stageRef.current?.setAppearance(draft);
  }, [draft]);

  // Imagens de decalque por categoria (geradas junto com a biblioteca 3DX).
  useEffect(() => {
    let cancelled = false;
    fetch('/assets/3dx/decals/manifest.json')
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

  useEffect(() => {
    if (focus) stageRef.current?.setFocus(focus);
  }, [focus]);

  const change = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    if (!draft) return;
    // Trocar de modelo troca o esqueleto: as peças do modelo anterior não servem, então volta ao
    // conjunto padrão do novo modelo (mantendo tom de pele, altura e cores escolhidas).
    const next =
      key === 'model'
        ? {
            ...defaultAvatarFor(value as AvatarModelId),
            skin: draft.skin,
            hairColor: draft.hairColor,
            topColor: draft.topColor,
            bottomColor: draft.bottomColor,
            accessory: draft.accessory,
            height: draft.height,
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

  // Paleta com um swatch redondo extra para a cor personalizada. Clicar numa cor
  // predefinida aplica na hora e limpa o hex livre. O swatch extra abre um
  // seletor RGB próprio (sem o modal nativo do input[type=color]).
  const colorChoices = (
    colorKey: ColorKey,
    hexKey: ColorHexKey,
    legend: string,
    options: readonly Option[],
  ) => {
    if (!draft) return undefined;
    const custom = draft[hexKey];
    const current =
      custom && HEX.test(custom)
        ? custom
        : (options.find((option) => option.id === draft[colorKey])?.hex ?? '#c68e68');
    const rgb = rgbOf(current);
    const applyColor = (id: string, hex: string | undefined) => {
      setDraft({ ...draft, [colorKey]: id, [hexKey]: hex } as AvatarConfig);
    };
    const setChannel = (index: number, value: number) => {
      const next = [...rgb];
      next[index] = value;
      applyColor(draft[colorKey] as string, hexOf(next));
    };
    return (
      <div className="palette-group" key={colorKey}>
        <fieldset className="swatches">
          <legend>{legend}</legend>
          {options.map((option) => (
            <label key={option.id} title={option.label}>
              <input
                type="radio"
                name={colorKey}
                value={option.id}
                checked={!custom && draft[colorKey] === option.id}
                onChange={() => {
                  applyColor(option.id, undefined);
                  setPaletteKey(undefined);
                }}
              />
              <span
                className="swatch"
                style={{ background: option.hex }}
                aria-label={option.label}
              />
            </label>
          ))}
          <button
            type="button"
            className={`swatch palette-swatch${custom ? ' active' : ''}`}
            style={{
              background:
                custom ??
                'conic-gradient(#e11d48, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #e11d48)',
            }}
            title="Cor personalizada"
            aria-label="Cor personalizada"
            aria-expanded={paletteKey === colorKey}
            onClick={() => setPaletteKey(paletteKey === colorKey ? undefined : colorKey)}
          />
        </fieldset>
        {paletteKey === colorKey && (
          <div className="palette-popover" role="group" aria-label="Cor personalizada">
            {(['R', 'G', 'B'] as const).map((channel, index) => (
              <label key={channel}>
                <span>{channel}</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={rgb[index]}
                  onChange={(event) => setChannel(index, Number(event.target.value))}
                />
                <output>{rgb[index]}</output>
              </label>
            ))}
            <span className="palette-preview" style={{ background: current }} />
          </div>
        )}
      </div>
    );
  };

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

      <div className="wardrobe-view hud-panel" role="group" aria-label="Foco da câmera">
        <span className="wardrobe-focus-label">Foco</span>
        {FOCUS_OPTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={focus === item.id ? 'primary' : undefined}
            aria-pressed={focus === item.id}
            onClick={() => setFocus(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="wardrobe-orbit-hint">arraste para girar · roda para zoom</span>
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
              {draft && (
                <fieldset className="choices" key="height">
                  <legend>Altura</legend>
                  <label className="range-slider">
                    <input
                      type="range"
                      min={HEIGHT_MIN}
                      max={HEIGHT_MAX}
                      step={0.01}
                      value={draft.height}
                      aria-label="Altura"
                      onChange={(event) => change('height', Number(event.target.value))}
                    />
                    <output>{Math.round(draft.height * 100)}%</output>
                  </label>
                </fieldset>
              )}
              {choices('skin', 'Tom de pele', SKIN_TONES)}
              {colorChoices('eyeColor', 'eyeColorHex', 'Cor dos olhos', EYE_COLORS)}
            </>
          )}

          {tab === 'cabelo' && (
            <>
              {partChoices('hair')}
              {colorChoices('hairColor', 'hairColorHex', 'Cor do cabelo', PALETTE)}
            </>
          )}

          {tab === 'roupas' && (
            <>
              {TAB_PARTS.roupas.map((slot) => (
                <div className="wardrobe-slot" key={slot}>
                  {partChoices(slot)}
                  {SLOTS_WITH_COLOR.includes(slot) &&
                    colorChoices(
                      colorKey(slot) as ColorKey,
                      slot === 'top' ? 'topColorHex' : 'bottomColorHex',
                      `Cor — ${SLOT_LABELS[slot]}`,
                      PALETTE,
                    )}
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
        </div>

        {error && <p role="alert">{error}</p>}

        <div className="dialog-actions">
          <button
            type="button"
            disabled={!draft}
            title="Sorteia um avatar novo do mesmo gênero"
            onClick={() => draft && setDraft(randomAvatar(draft))}
          >
            Randomizar
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!draft}
            onClick={() => setDraft(defaultAvatarFor(draft?.model ?? '3dx-male'))}
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
