import { INTERACTION_LABELS, type InteractionType } from '@3dx/contracts';

interface WorldPosePanelProps {
  /** Título do grupo ("Sofá", "Cama", "Em pé"…). */
  title: string;
  /** Cenas que o par aceita agora (a ordem é a do menu). */
  scenes: readonly InteractionType[];
  /** Cena em execução. */
  current: InteractionType;
  onSwitch: (type: InteractionType) => void;
  onEnd: () => void;
  onClose: () => void;
}

/**
 * Painel lateral de poses do par em andamento: troca a cena sem encerrar a interação. Fica aberto
 * entre as trocas (o item atual muda de lugar) e fecha no ×, no Esc ou no "Encerrar".
 */
export function WorldPosePanel({
  title,
  scenes,
  current,
  onSwitch,
  onEnd,
  onClose,
}: WorldPosePanelProps) {
  return (
    <aside className="hud-panel pose-panel" aria-label={`Poses de ${title.toLowerCase()}`}>
      <header className="pose-panel-header">
        <span className="pose-panel-title">{title}</span>
        <button type="button" className="icon ghost" aria-label="Fechar poses" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="pose-panel-grid" role="listbox" aria-label="Poses disponíveis">
        {scenes.map((type, index) => {
          const active = type === current;
          return (
            <button
              key={type}
              type="button"
              role="option"
              aria-selected={active}
              className={active ? 'pose-card pose-card-active' : 'pose-card'}
              onClick={() => {
                if (!active) onSwitch(type);
              }}
            >
              <span className="pose-card-number">{index + 1}</span>
              <span className="pose-card-name">{INTERACTION_LABELS[type]}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="ghost pose-panel-end" onClick={onEnd}>
        Encerrar
      </button>
    </aside>
  );
}
