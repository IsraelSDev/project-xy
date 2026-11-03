import type { PlayerAction } from '@3dx/contracts';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameAction } from '../../game/engine/game';

interface TouchControlsProps {
  /** Ação atual do avatar (o botão de sentar vira "Levantar"). */
  localAction: PlayerAction;
  onAct: (action: GameAction) => void;
  /** Eixo do joystick (x direita, z frente), em [-1, 1]. */
  onAxis: (x: number, z: number) => void;
}

/** Abaixo disso o toque é considerado parado (evita tremor no dedo). */
const DEAD_ZONE = 0.15;

/**
 * Controles de toque para celular/tablet: joystick virtual (esquerda) e botões de ação (direita).
 * O mundo já responde a toque (andar/sentar/abrir menu); o joystick dá o controle fino de direção.
 * Só aparece em apontador grosseiro (`pointer: coarse`), então no desktop nada muda.
 */
export function TouchControls({ localAction, onAct, onAxis }: TouchControlsProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | undefined>(undefined);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  // Sobe os painéis do HUD enquanto os controles estão na tela (senão eles cobrem o joystick).
  useEffect(() => {
    document.body.classList.add('touch-ui');
    return () => document.body.classList.remove('touch-ui');
  }, []);

  const apply = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = event.clientX - (rect.left + radius);
    let dy = event.clientY - (rect.top + radius);
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      dx = (dx / distance) * radius;
      dy = (dy / distance) * radius;
    }
    setKnob({ x: dx, y: dy });
    const x = dx / radius;
    const z = -dy / radius;
    if (Math.hypot(x, z) < DEAD_ZONE) onAxis(0, 0);
    else onAxis(x, z);
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeId.current !== event.pointerId) return;
    activeId.current = undefined;
    setKnob({ x: 0, y: 0 });
    onAxis(0, 0);
  };

  return (
    <div className="touch-controls">
      <div
        ref={padRef}
        className="touch-pad"
        role="application"
        aria-label="Mover o avatar"
        onPointerDown={(event) => {
          activeId.current = event.pointerId;
          // O ponteiro pode já ter saído (dedo levantou, evento sintético): sem captura o joystick
          // continua funcionando, e o erro do navegador não interrompe o toque.
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* sem captura: o arraste vale enquanto o dedo estiver sobre o pad */
          }
          apply(event);
        }}
        onPointerMove={(event) => {
          if (activeId.current === event.pointerId) apply(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span
          className="touch-knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
          aria-hidden="true"
        />
      </div>
      <div className="touch-buttons">
        <button type="button" onClick={() => onAct('sit')}>
          {localAction === 'sit' ? 'Levantar' : 'Sentar'}
        </button>
        <button type="button" onClick={() => onAct('dance')}>
          {localAction === 'dance' ? 'Parar' : 'Dançar'}
        </button>
        <button type="button" onClick={() => onAct('dance2')}>
          {localAction === 'dance2' ? 'Parar' : 'Dançar 2'}
        </button>
      </div>
    </div>
  );
}
