import {
  ACCESSORIES,
  AVATAR_MODELS,
  BODY_TYPES,
  FREE_PART_IDS,
  PALETTE,
  PART_CATALOG,
  PART_SLOTS,
  SKIN_TONES,
  type AvatarConfig,
  type PartSlot,
  type Purchase,
  type ShopItem,
} from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';

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

/** Rótulo de cada slot de peça da biblioteca, na ordem em que aparece no editor. */
const SLOT_LABELS: Record<PartSlot, string> = {
  hair: 'Cabelo',
  hat: 'Chapéu',
  glasses: 'Óculos',
  headphones: 'Fone',
  moustache: 'Bigode',
  pacifier: 'Chupeta',
  clownNose: 'Nariz de palhaço',
  emotion: 'Expressão',
  top: 'Parte de cima',
  outerwear: 'Casaco',
  bottom: 'Parte de baixo',
  costume: 'Fantasia',
  socks: 'Meias',
  shoes: 'Sapato',
  gloves: 'Luvas',
};

/** Editor de aparência: só opções do catálogo, com prévia ao vivo no mundo. */
export function AvatarEditor({ onPreview, onSaved, onClose }: AvatarEditorProps) {
  const [draft, setDraft] = useState<AvatarConfig>();
  const [owned, setOwned] = useState<Set<string>>();
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

  const change = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    if (!draft) return;
    const next = { ...draft, [key]: value };
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
  ) =>
    draft && (
      <fieldset className={options[0]?.hex ? 'swatches' : 'choices'}>
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
                checked={draft[key] === option.id}
                disabled={isLocked}
                onChange={() => change(key, option.id as AvatarConfig[K])}
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

  // Peças da biblioteca: 'Nenhum' + itens do slot. Não comprado (e não equipado) fica bloqueado.
  const partGroup = (slot: PartSlot) => {
    const items = PART_CATALOG.filter((part) => part.slot === slot);
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
        {PART_SLOTS.map((slot) => partGroup(slot))}
        {group('hairColor', 'Cor do cabelo', PALETTE)}
        {group('topColor', 'Cor (parte de cima)', PALETTE)}
        {group('bottomColor', 'Cor (parte de baixo)', PALETTE)}
        {group('accessory', 'Acessório', ACCESSORIES)}
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
