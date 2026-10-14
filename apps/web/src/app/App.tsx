import { WorldView } from '../features/world/WorldView';
import { ServiceStatusPanel } from './ServiceStatusPanel';

export function App() {
  return (
    <div className="app">
      <WorldView />
      <header className="hud hud-start">
        <div className="hud-panel">
          <h1>3DXChat Web</h1>
          <p>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> ou setas: andar · arrastar: girar a câmera · roda: zoom
          </p>
        </div>
      </header>
      <aside className="hud hud-end">
        <ServiceStatusPanel />
      </aside>
    </div>
  );
}
