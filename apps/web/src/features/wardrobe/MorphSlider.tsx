interface MorphSliderProps {
  label: string;
  /** Influência atual, 0..1. */
  value: number;
  onChange: (value: number) => void;
  /** Rótulo curto quando a linha tem dois sliders (ex.: "E"/"D"): vira só o `aria-label`. */
  compact?: boolean;
}

/** Controle de uma shape key: slider 0..100 com o valor ao lado. */
export function MorphSlider({ label, value, onChange, compact }: MorphSliderProps) {
  return (
    <label className={compact ? 'morph-slider morph-slider-compact' : 'morph-slider'}>
      {!compact && <span>{label}</span>}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{Math.round(value * 100)}</output>
    </label>
  );
}
