import {
  ACCESSORIES,
  BODY_TYPES,
  BOTTOMS,
  HAIR_STYLES,
  PALETTE,
  SKIN_TONES,
  TOPS,
  type AvatarConfig,
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

/** Editor de aparência: só opções do catálogo, com prévia ao vivo no mundo. */
export function AvatarEditor({ onPreview, onSaved, onClose }: AvatarEditorProps) {
  const [draft, setDraft] = useState<AvatarConfig>();
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
  ) =>
    draft && (
      <fieldset className={options[0]?.hex ? 'swatches' : 'choices'}>
        <legend>{legend}</legend>
        {options.map((option) => (
          <label key={option.id} title={option.label}>
            <input
              type="radio"
              name={key}
              value={option.id}
              checked={draft[key] === option.id}
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
        ))}
      </fieldset>
    );

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
        {group('body', 'Corpo', BODY_TYPES)}
        {group('skin', 'Tom de pele', SKIN_TONES)}
        {group('hair', 'Cabelo', HAIR_STYLES)}
        {group('hairColor', 'Cor do cabelo', PALETTE)}
        {group('top', 'Parte de cima', TOPS)}
        {group('topColor', 'Cor (parte de cima)', PALETTE)}
        {group('bottom', 'Parte de baixo', BOTTOMS)}
        {group('bottomColor', 'Cor (parte de baixo)', PALETTE)}
        {group('accessory', 'Acessório', ACCESSORIES)}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={cancel}>
            Cancelar
          </button>
          <button type="button" onClick={() => void save()} disabled={!draft || saving}>
            Salvar
          </button>
        </div>
      </section>
    </div>
  );
}
