import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { clampPanelPosition, parseStoredPosition, type PanelPoint } from './panel-position';

interface DraggablePanelProps {
  /** Chave da posição salva (`localStorage`), por painel. */
  id: string;
  /** Posição inicial (canto superior esquerdo em px), calculada no primeiro render. */
  initial: () => PanelPoint;
  /** Topo mínimo: os painéis não cobrem a barra superior do app. */
  minY?: number;
  className?: string;
  children: ReactNode;
}

const STORAGE_PREFIX = '3dx:hud:';
/** Abaixo disso o gesto ainda é um clique (abrir/fechar o painel), não um arraste. */
const DRAG_THRESHOLD_PX = 4;

const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const savePosition = (key: string, position: PanelPoint) => {
  try {
    localStorage.setItem(key, JSON.stringify(position));
  } catch {
    // Modo privado/quota: o painel continua arrastável, só não lembra na próxima visita.
  }
};

/**
 * Painel flutuante que pode ser arrastado pelo cabeçalho (`.drag-handle`). A posição fica salva
 * por painel e é limitada à janela (inclusive quando o painel abre e cresce).
 */
export function DraggablePanel({
  id,
  initial,
  minY = 8,
  className,
  children,
}: DraggablePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PanelPoint>(() => {
    const stored = parseStoredPosition(readStored(`${STORAGE_PREFIX}${id}`));
    return stored ?? initial();
  });
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<
    | {
        pointerId: number;
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        x: number;
        y: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  /** O clique que fecha o gesto de arraste não deve abrir/fechar o painel. */
  const suppressClick = useRef(false);

  const clamp = useCallback(
    (point: PanelPoint): PanelPoint => {
      const element = ref.current;
      return clampPanelPosition(
        point,
        { width: element?.offsetWidth ?? 0, height: element?.offsetHeight ?? 0 },
        { width: window.innerWidth, height: window.innerHeight },
        { y: minY },
      );
    },
    [minY],
  );

  // Tela redimensionada ou painel aberto/fechado (muda de altura): mantém tudo visível.
  useEffect(() => {
    const keepVisible = () => setPosition((current) => clamp(current));
    keepVisible();
    window.addEventListener('resize', keepVisible);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(keepVisible);
    if (observer && ref.current) observer.observe(ref.current);
    return () => {
      window.removeEventListener('resize', keepVisible);
      observer?.disconnect();
    };
  }, [clamp]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement;
    const handle = target.closest('.drag-handle');
    if (!handle || !ref.current?.contains(handle)) return;
    // Botões/selects/links dentro do cabeçalho continuam clicáveis (ex.: "Salas", pose).
    if (target.closest('select, input, textarea, a, button:not(.drag-handle)')) return;
    suppressClick.current = false;
    // Captura no próprio cabeçalho: o clique continua indo para o botão que abre/fecha o painel.
    // Em eventos sintéticos o ponteiro pode não existir mais; o arraste segue sem captura.
    try {
      (handle as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* sem captura: o arraste vale enquanto o ponteiro estiver sobre o painel */
    }
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      x: position.x,
      y: position.y,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!current.moved) {
      current.moved = true;
      setDragging(true);
    }
    const next = clamp({ x: current.originX + dx, y: current.originY + dy });
    current.x = next.x;
    current.y = next.y;
    setPosition(next);
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = undefined;
    setDragging(false);
    if (current.moved) {
      suppressClick.current = true;
      savePosition(`${STORAGE_PREFIX}${id}`, { x: current.x, y: current.y });
    }
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className={['world-panel', className, dragging ? 'is-dragging' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ left: position.x, top: position.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
