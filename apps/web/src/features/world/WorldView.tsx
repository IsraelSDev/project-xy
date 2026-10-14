import { useEffect, useRef, useState } from 'react';
import { createGame, isWebGLSupported } from '../../game/engine/game';

/**
 * Canvas do mundo 3D. A cena é criada uma vez por montagem e liberada ao desmontar;
 * renderizações do React não recriam nada.
 */
export function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported] = useState(isWebGLSupported);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!supported || !canvas) return;

    const game = createGame(canvas, () => {
      setReady(true);
    });
    return () => {
      game.dispose();
      setReady(false);
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
    </>
  );
}
