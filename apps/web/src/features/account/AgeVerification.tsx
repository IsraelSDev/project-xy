import { useEffect, useState } from 'react';
import { AgeVerificationMethod, type AgeVerificationStatus } from '@3dx/contracts';
import { api } from '../../app/api';

const METHODS: Record<AgeVerificationMethod, string> = {
  documento: 'Documento de identidade',
  selfie: 'Selfie com documento',
};

type Stage = 'status' | 'request' | 'confirm';

/** Verificação de idade da própria conta: status, solicitação e confirmação da referência. */
export function AgeVerificationPanel() {
  const [status, setStatus] = useState<AgeVerificationStatus | null>(null);
  const [stage, setStage] = useState<Stage>('status');
  const [method, setMethod] = useState<AgeVerificationMethod>('documento');
  const [reference, setReference] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<AgeVerificationStatus>('/age-verification/me')
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const verified = status?.ageAssurance === 'VERIFIED';
  if (status?.ageAssurance === 'VERIFIED' && status.ageVerifiedAt) {
    return (
      <section className="dialog-section">
        <h3>Verificação de idade</h3>
        <p>
          Idade verificada em {new Date(status.ageVerifiedAt).toLocaleDateString('pt-BR')} pelo
          método {METHODS[status.ageVerificationMethod ?? 'documento']}.
        </p>
      </section>
    );
  }

  const request = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const { reference: ref } = await api<{ reference: string; expiresAt: string }>(
        '/age-verification/request',
        { json: { method } },
      );
      setReference(ref);
      setStage('confirm');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível iniciar a verificação.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!reference) return;
    setError(undefined);
    setBusy(true);
    try {
      await api<AgeVerificationStatus>('/age-verification/complete', {
        json: { reference, method },
      });
      setStage('status');
      setReference(undefined);
      // Recarrega o status para mostrar "verificada".
      const data = await api<AgeVerificationStatus>('/age-verification/me');
      setStatus(data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível confirmar a verificação.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dialog-section">
      <h3>Verificação de idade</h3>
      <p>
        Sua idade foi apenas declarada (data de nascimento). Para acessar áreas adultas da
        plataforma, verifique com um provedor de identidade.
      </p>
      {stage === 'status' && (
        <>
          <label>
            Método
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as AgeVerificationMethod)}
            >
              <option value="documento">{METHODS.documento}</option>
              <option value="selfie">{METHODS.selfie}</option>
            </select>
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={() => void request()} disabled={busy}>
              Solicitar verificação
            </button>
          </div>
        </>
      )}
      {stage === 'confirm' && (
        <>
          <p>
            A referência de verificação é <code>{reference}</code>. Informe-a para confirmar (no
            fluxo real, o provedor a devolve após validar seu documento).
          </p>
          <label>
            Referência
            <input
              name="reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={() => setStage('status')} disabled={busy}>
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              className="primary"
              disabled={busy || !reference}
            >
              Confirmar verificação
            </button>
          </div>
        </>
      )}
      {!verified && stage === 'status' && error && <p role="alert">{error}</p>}
    </section>
  );
}
