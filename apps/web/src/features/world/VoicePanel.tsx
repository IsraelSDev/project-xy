import { useState } from 'react';
import type { VoiceState } from '../../game/voice/voice-chat';

interface VoicePanelProps {
  state?: VoiceState;
  onEnable: () => void;
  onDisable: () => void;
  onMute: (muted: boolean) => void;
  onVolume: (volume: number) => void;
  onPeerMute: (userId: string, muted: boolean) => void;
}

/**
 * Voz por proximidade: ligar o microfone, mudo próprio, volume geral e a lista de quem está na
 * voz — com um ponto verde em quem está falando e um botão para silenciar cada pessoa.
 */
export function VoicePanel({
  state,
  onEnable,
  onDisable,
  onMute,
  onVolume,
  onPeerMute,
}: VoicePanelProps) {
  const [open, setOpen] = useState(false);
  const active = state?.status === 'on' || state?.status === 'connecting';
  const near = state?.peers.filter((peer) => peer.inRange).length ?? 0;
  const speaking = state?.peers.some((peer) => peer.speaking) ?? false;

  return (
    <div className={`hud-panel voice-panel${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="voice-header drag-handle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`voice-dot${active ? (speaking ? ' is-speaking' : ' is-on') : ''}`} />
        <span>Voz</span>
        <span className="voice-summary">
          {state?.status === 'connecting' ? 'ligando…' : active ? `${near} por perto` : 'desligada'}
        </span>
      </button>

      {open && (
        <div className="voice-body">
          {state?.status === 'error' && state.error && (
            <p className="voice-error" role="alert">
              {state.error}
            </p>
          )}

          {!active ? (
            <button type="button" className="primary" onClick={onEnable}>
              Ligar microfone
            </button>
          ) : (
            <>
              <div className="voice-row">
                <button
                  type="button"
                  className={state?.muted ? 'ghost' : 'primary'}
                  aria-pressed={state?.muted === true}
                  onClick={() => onMute(!state?.muted)}
                  disabled={state?.status !== 'on'}
                >
                  {state?.muted ? 'Falar' : 'Mudo'}
                </button>
                <button type="button" className="ghost" onClick={onDisable}>
                  Sair da voz
                </button>
              </div>
              <label className="voice-volume">
                <span>Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((state?.volume ?? 1) * 100)}
                  onChange={(event) => onVolume(Number(event.target.value) / 100)}
                />
              </label>
              <ul className="voice-peers">
                {state?.peers.length === 0 && <li className="voice-empty">Ninguém na voz aqui.</li>}
                {state?.peers.map((peer) => (
                  <li key={peer.userId}>
                    <span
                      className={`voice-dot${peer.speaking ? ' is-speaking' : peer.inRange ? ' is-near' : ''}`}
                      aria-label={peer.speaking ? 'falando' : undefined}
                    />
                    <span className="voice-name">{peer.name}</span>
                    {!peer.inRange && <span className="voice-far">longe</span>}
                    <button
                      type="button"
                      className="ghost voice-peer-mute"
                      aria-pressed={peer.muted}
                      aria-label={peer.muted ? `Ouvir ${peer.name}` : `Silenciar ${peer.name}`}
                      onClick={() => onPeerMute(peer.userId, !peer.muted)}
                    >
                      {peer.muted ? 'Ouvir' : 'Silenciar'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="voice-hint">
            A voz chega mais forte de perto e some com a distância. Ao bloquear alguém, o áudio dela
            para de ser repassado.
          </p>
        </div>
      )}
    </div>
  );
}
