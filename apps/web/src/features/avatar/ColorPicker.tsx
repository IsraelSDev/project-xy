import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { HEX_COLOR, hexToHsv, hsvToHex, type Hsv } from './color';

interface ColorPickerProps {
  /** Cor atual, como hex `#rrggbb`. */
  value: string;
  /** Cor escolhida, sempre hex `#rrggbb`. */
  onChange: (hex: string) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Seletor de cor visual: um quadro de saturação/brilho e uma faixa de tons.
 *
 * Sem canais RGB numerados — quem não entende de cor só toca/arrasta no quadro até achar a cor que
 * quer. O degradê da faixa mostra o resultado antes mesmo de soltar o dedo.
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const current = HEX_COLOR.test(value) ? value.toLowerCase() : '#c68e68';
  const hsv = hexToHsv(current);
  // Preto, branco e cinza não têm matiz no HSV. Guardamos o último matiz escolhido para o quadro
  // não pular para o vermelho quando o brilho ou a saturação chegam a zero.
  const [hue, setHue] = useState(hsv.h);
  const hueRef = useRef(hsv.h);

  // Cor vinda de fora (paleta, troca de peça): acompanha o matiz quando ele existe na cor.
  useEffect(() => {
    if (hsv.s === 0 || Math.abs(hsv.h - hueRef.current) < 1) return;
    hueRef.current = hsv.h;
    setHue(hsv.h);
  }, [hsv.h, hsv.s]);

  const emit = (next: Hsv) => {
    hueRef.current = next.h;
    setHue(next.h);
    onChange(hsvToHex(next));
  };

  const pickAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    emit({
      h: hue,
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100,
      v: (1 - clamp((event.clientY - rect.top) / rect.height, 0, 1)) * 100,
    });
  };

  // Teclado: setas andam 2% (10% com Shift), para o quadro não ser exclusivo do mouse.
  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    emit({ h: hue, s: clamp(hsv.s + move[0], 0, 100), v: clamp(hsv.v + move[1], 0, 100) });
  };

  return (
    <div className="color-picker-panel">
      <div
        className="color-picker-square"
        role="slider"
        tabIndex={0}
        aria-label="Cor: arraste no quadro ou use as setas"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v)}
        aria-valuetext={`${current.toUpperCase()}, intensidade ${Math.round(
          hsv.s,
        )}% e brilho ${Math.round(hsv.v)}%`}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pickAt(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pickAt(event);
        }}
        onKeyDown={nudge}
      >
        <span
          className="color-picker-thumb"
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: current }}
        />
      </div>

      <input
        className="color-picker-hue"
        type="range"
        min={0}
        max={359}
        value={Math.round(hue)}
        aria-label="Tom da cor"
        onChange={(event) => {
          // Num cinza puro o matiz não aparece; parte de uma cor viva para o degradê fazer sentido.
          emit({ h: Number(event.target.value), s: hsv.s === 0 ? 100 : hsv.s, v: hsv.v });
        }}
      />

      <div className="color-picker-foot">
        <span className="color-picker-current" style={{ background: current }} aria-hidden="true" />
        <code>{current.toUpperCase()}</code>
        <span className="color-picker-hint">arraste para escolher</span>
      </div>
    </div>
  );
}
