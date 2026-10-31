import type { Vec2 } from '@3dx/game-core';

type Direction = 'forward' | 'back' | 'left' | 'right';

/** Usa `KeyboardEvent.code` (posição física da tecla): WASD funciona em qualquer layout. */
const BINDINGS: Readonly<Record<string, Direction>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Converter as teclas pressionadas em intenção de movimento (x = direita, z = frente). */
export function axisFromKeys(pressed: ReadonlySet<string>): Vec2 {
  const held = (direction: Direction) =>
    [...pressed].some((code) => BINDINGS[code] === direction) ? 1 : 0;
  return { x: held('right') - held('left'), z: held('forward') - held('back') };
}

/** SHIFT corre. O servidor só libera a velocidade extra para ADMIN; aqui só coletamos o pedido. */
const SPRINT_KEYS: ReadonlySet<string> = new Set(['ShiftLeft', 'ShiftRight']);

export function sprintFromKeys(pressed: ReadonlySet<string>): boolean {
  return [...pressed].some((code) => SPRINT_KEYS.has(code));
}

export interface KeyboardInput {
  axis(): Vec2;
  /** SHIFT está pressionado (pedido de corrida). */
  sprint(): boolean;
  dispose(): void;
}

/** Acompanha as teclas de movimento na janela. Ignora digitação em campos de texto (chat futuro). */
export function createKeyboardInput(target: Window): KeyboardInput {
  const pressed = new Set<string>();

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditable(event.target)) return;
    if (event.code in BINDINGS) {
      pressed.add(event.code);
      event.preventDefault();
    } else if (SPRINT_KEYS.has(event.code)) {
      // Shift não tem ação padrão a bloquear (e Shift+Tab ainda deve navegar).
      pressed.add(event.code);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    pressed.delete(event.code);
  };
  // Sem isso, trocar de aba com a tecla pressionada deixa o avatar andando sozinho.
  const onBlur = () => {
    pressed.clear();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    axis: () => axisFromKeys(pressed),
    sprint: () => sprintFromKeys(pressed),
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      pressed.clear();
    },
  };
}

/** Foco em campo de texto: teclas são do campo (chat, formulários), não do jogo. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
