import { useEffect, useRef, useState } from 'react';
import { REALTIME_URL } from '../../app/config';
import { createGame, isWebGLSupported, type GameView } from '../../game/engine/game';
import { RoomPanel } from '../rooms/RoomPanel';

const INITIAL_VIEW: GameView = { status: { state: 'connecting' }, players: [] };

/**
 * Canvas do mundo 3D e painel da sala. O jogo é criado uma vez por montagem e liberado ao
 * desmontar; renderizações do React não recriam nada.
 */
export function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported] = useState(isWebGLSupported);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(INITIAL_VIEW);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!supported || !canvas) return;

    const game = createGame(canvas, {
      realtimeUrl: REALTIME_URL,
      onReady: () => {
        setReady(true);
      },
      onViewChange: setView,
    });
    return () => {
      game.dispose();
      setReady(false);
      setView(INITIAL_VIEW);
    };
  }, [supported]);

  if (!supported) {
    return (
      <p className="world-error" role="alert">
        Seu navegador não suporta WebGL, necessário para exibir o mundo 3D. Tente um navegador
        desktop atualizado com aceleração de hardware ativa.
      </p>
    );
  }

  return (
    <>
      <canvas ref={canvasRef} className="world-canvas" aria-label="Mundo 3D" tabIndex={0} />
      {!ready && (
        <p className="world-loading" role="status">
          Carregando o mundo…
        </p>
      )}
      <div className="hud hud-bottom-start">
        <RoomPanel view={view} />
      </div>
    </>
  );
}
