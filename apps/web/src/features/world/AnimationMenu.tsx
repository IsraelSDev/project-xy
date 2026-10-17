import { useState } from 'react';

/** Clipes exportados do GoE (ver `tools/goe/anim/retarget.py`), com rótulos para o teste. */
const CLIPS: readonly { id: string; label: string }[] = [
  { id: 'idle', label: 'Parado' },
  { id: 'walk', label: 'Andando' },
  { id: 'sit', label: 'Sentado' },
  { id: 'sitTalk', label: 'Sentado conversando' },
  { id: 'talk', label: 'Conversando' },
  { id: 'interact', label: 'Aceno' },
  { id: 'dance', label: 'Dança' },
];

/** O menu aparece em desenvolvimento ou com `?animMenu=1` (nunca no build de produção por padrão). */
export const animationMenuEnabled = (): boolean =>
  import.meta.env.DEV ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('animMenu') === '1');

interface AnimationMenuProps {
  /** Clipe a tocar no avatar local; `undefined` volta ao automático (parado/andando/ação). */
  onPick: (clip: string | undefined) => void;
}

/**
 * Menu de teste das animações do GoE: toca cada clipe no avatar local para inspecionar o ciclo.
 * Diagnóstico, sem efeito no servidor — só o avatar local muda.
 */
export function AnimationMenu({ onPick }: AnimationMenuProps) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<string>();

  if (!open) {
    return (
      <div className="hud-panel">
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          Animações (teste) ▸
        </button>
      </div>
    );
  }

  const choose = (clip: string | undefined) => {
    setActive(clip);
    onPick(clip);
  };

  return (
    <div className="hud-panel anim-menu">
      <div className="anim-menu-head">
        <strong>Animações (teste)</strong>
        <button
          type="button"
          className="ghost icon"
          onClick={() => setOpen(false)}
          aria-label="Fechar"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className={active === undefined ? 'primary' : 'ghost'}
        onClick={() => choose(undefined)}
      >
        Automático
      </button>
      {CLIPS.map((clip) => (
        <button
          key={clip.id}
          type="button"
          className={active === clip.id ? 'primary' : 'ghost'}
          onClick={() => choose(clip.id)}
        >
          {clip.label}
        </button>
      ))}
    </div>
  );
}
