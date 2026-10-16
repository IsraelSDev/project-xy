import {
  ACCESSORIES,
  AVATAR_MODELS,
  BODY_TYPES,
  DECAL_CATEGORIES,
  DECAL_SLOTS,
  EYE_COLORS,
  FREE_PART_IDS,
  PALETTE,
  AVATAR_PARTS,
  PART_SLOTS,
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
  type Purchase,
  type ShopItem,
} from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';
import { SLOT_LABELS } from './part-labels';

interface AvatarEditorProps {
  /** Mostra a aparência no próprio avatar, antes de salvar; `null` cancela. */
  onPreview: (avatar: AvatarConfig | null) => void;
  /** Depois de salvar: a sala precisa de um ticket novo para os outros verem a mudança. */
  onSaved: () => Promise<void>;
  onClose: () => void;
}

interface Option {
  id: string;
  label: string;
  hex?: string;
}

/** Editor de aparência: só opções do catálogo, com prévia ao vivo no mundo. */
export function AvatarEditor({ onPreview, onSaved, onClose }: AvatarEditorProps) {
  const [draft, setDraft] = useState<AvatarConfig>();
  const [owned, setOwned] = useState<Set<string>>();
  const [decals, setDecals] = useState<Record<string, string[]>>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

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

  // Peças compradas (cruza a loja com as compras). Enquanto não chega, nada é bloqueado.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api<ShopItem[]>('/economy/shop'), api<Purchase[]>('/economy/purchases')])
      .then(([shop, purchases]) => {
        if (cancelled) return;
        const bought = new Set(purchases.map((purchase) => purchase.shopItemId));
        const ids = new Set<string>(FREE_PART_IDS);
        for (const item of shop) {
          if (bought.has(item.id)) ids.add(item.value);
        }
        setOwned(ids);
      })
      .catch(() => {
        if (!cancelled) setOwned(new Set(FREE_PART_IDS));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lista de imagens de decalque por categoria (gerada junto com a biblioteca de assets).
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
            hairColor: draft.hairColor,
            topColor: draft.topColor,
            bottomColor: draft.bottomColor,
            accessory: draft.accessory,
          }
        : { ...draft, [key]: value };
    setDraft(next);
    onPreview(next);
  };

  const cancel = () => {
    onPreview(null);
    onClose();
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

  const group = <K extends keyof AvatarConfig>(
    key: K,
    legend: string,
    options: readonly Option[],
    locked?: (id: string) => boolean,
    selection?: { value: string; onPick: (id: string) => void },
  ) =>
    draft && (
      <fieldset className={options[0]?.hex ? 'swatches' : 'choices'} key={String(key)}>
        <legend>{legend}</legend>
        {options.map((option) => {
          const isLocked = locked?.(option.id) ?? false;
          return (
            <label
              key={option.id}
              title={isLocked ? `${option.label} — compre na loja` : option.label}
            >
              <input
                type="radio"
                name={key}
                value={option.id}
                checked={selection ? selection.value === option.id : draft[key] === option.id}
                disabled={isLocked}
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
          );
        })}
      </fieldset>
    );

  // Peças da biblioteca: 'Nenhum' + itens do slot que servem no modelo atual. Não comprado (e não
  // equipado) fica bloqueado.
  const partGroup = (slot: PartSlot) => {
    const model = draft?.model;
    const items = AVATAR_PARTS.filter(
      (part) => part.slot === slot && model !== undefined && partFitsModel(part, model),
    );
    if (items.length === 0) return undefined;
    const options: Option[] = [
      { id: 'none', label: 'Nenhum' },
      ...items.map((part) => ({ id: part.id, label: part.label })),
    ];
    return group(
      slot,
      SLOT_LABELS[slot],
      options,
      (id) => id !== 'none' && owned !== undefined && !owned.has(id) && draft?.[slot] !== id,
    );
  };

  // Camiseta e casaco dividem a mesma camada: um grupo só, de escolha única (escolher um tira o outro).
  const pickTopLayer = (id: string) => {
    if (!draft) return;
    const next = withTopLayer(draft, id);
    setDraft(next);
    onPreview(next);
  };
  const topLayerGroup = () => {
    const model = draft?.model;
    if (!draft || model === undefined) return undefined;
    const items = AVATAR_PARTS.filter(
      (part) =>
        (TOP_LAYER_SLOTS as readonly string[]).includes(part.slot) && partFitsModel(part, model),
    );
    if (items.length === 0) return undefined;
    const current = topLayerChoice(draft);
    return group(
      'top',
      SLOT_LABELS.top,
      [{ id: 'none', label: 'Nenhum' }, ...items.map((part) => ({ id: part.id, label: part.label }))],
      (id) => id !== 'none' && owned !== undefined && !owned.has(id) && current !== id,
      { value: current, onPick: pickTopLayer },
    );
  };

  // Decalques (tatuagem, cicatriz…): um por slot; a imagem vem da categoria escolhida.
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

  const decalGroup = (slot: DecalChoice['slot']) => {
    const current = draft?.decals.find((item) => item.slot === slot);
    const images = current ? (decals?.[current.category] ?? []) : [];
    return (
      <fieldset className="choices" key={`decal-${slot}`}>
        <legend>{DECAL_SLOTS.find((item) => item.id === slot)?.label}</legend>
        <select
          value={current?.category ?? ''}
          onChange={(event) => {
            const category = event.target.value;
            if (!category) {
              clearDecal(slot);
              return;
            }
            const first = decals?.[category]?.[0];
            if (first) setDecal(slot, category, first);
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
          <select
            value={current.image}
            onChange={(event) => setDecal(slot, current.category, event.target.value)}
          >
            {images.map((image) => (
              <option key={image} value={image}>
                {image}
              </option>
            ))}
          </select>
        )}
      </fieldset>
    );
  };

  return (
    <div className="dialog-backdrop avatar-backdrop">
      <section
        className="hud-panel dialog avatar-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-title"
      >
        <h2 id="avatar-title">Seu avatar</h2>
        <p className="avatar-hint">
          A prévia aparece no seu personagem. Salve para os outros verem.
        </p>
        {!draft && !error && <p>Carregando…</p>}
        {group('model', 'Modelo', AVATAR_MODELS)}
        {group('body', 'Corpo', BODY_TYPES)}
        {group('skin', 'Tom de pele', SKIN_TONES)}
        {group('skinTexture', 'Pele', SKIN_TEXTURES)}
        {group('eyes', 'Olhos', EYE_COLORS)}
        {PART_SLOTS.map((slot) =>
          slot === 'top' ? topLayerGroup() : slot === 'outerwear' ? undefined : partGroup(slot),
        )}
        {group('hairColor', 'Cor do cabelo', PALETTE)}
        {group('topColor', 'Cor (parte de cima)', PALETTE)}
        {group('bottomColor', 'Cor (parte de baixo)', PALETTE)}
        {group('accessory', 'Acessório', ACCESSORIES)}
        {DECAL_SLOTS.map((slot) => decalGroup(slot.id))}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={cancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={!draft || saving}
          >
            Salvar
          </button>
        </div>
      </section>
    </div>
  );
}
