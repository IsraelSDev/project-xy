import { MAX_BIO_LENGTH, type PublicProfile } from '@3dx/contracts';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from '../../app/api';
import { identityColor, initialOf } from '../../app/identity-color';
import { StaffBadge } from '../../app/StaffBadge';

interface ProfileDialogProps {
  /** Sem id = o próprio perfil (com edição da bio); com id = perfil de outro membro. */
  userId?: string;
  onClose: () => void;
}

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof Error && caught.message ? caught.message : fallback;

/** Data de criação da conta, só o dia, no fuso de quem lê. */
const memberSince = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Perfil de um membro: nome, selo da equipe, verificação de idade e bio. No próprio perfil a bio é
 * editável (texto puro, até `MAX_BIO_LENGTH`); nos outros, só leitura.
 */
export function ProfileDialog({ userId, onClose }: ProfileDialogProps) {
  const own = userId === undefined;
  const [profile, setProfile] = useState<PublicProfile>();
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<PublicProfile>(own ? '/profiles/me' : `/profiles/${userId}`)
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setBio(data.bio ?? '');
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught, 'Não foi possível carregar o perfil.'));
      });
    return () => {
      cancelled = true;
    };
  }, [own, userId]);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const updated = await api<PublicProfile>('/profiles/me', {
        method: 'PATCH',
        json: { bio: bio.trim() === '' ? null : bio },
      });
      setProfile(updated);
      setBio(updated.bio ?? '');
      setSaved(true);
    } catch (caught) {
      setError(messageOf(caught, 'Não foi possível salvar o perfil.'));
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <h2 id="profile-title">{own ? 'Meu perfil' : 'Perfil'}</h2>

        {error && <p role="alert">{error}</p>}
        {!profile && !error && <p>Carregando…</p>}

        {profile && (
          <>
            <div className="profile-head">
              <span
                className="avatar-dot"
                style={{ '--dot': identityColor(profile.id) } as CSSProperties}
                aria-hidden="true"
              >
                {initialOf(profile.displayName)}
              </span>
              <div>
                <p className="profile-name">
                  <strong>{profile.displayName}</strong>
                  <StaffBadge role={profile.role} />
                  {profile.verifiedAdult && (
                    <span className="badge badge-ok" title="Idade verificada por provedor">
                      18+ verificado
                    </span>
                  )}
                </p>
                <p className="hint">Na casa desde {memberSince(profile.createdAt)}</p>
              </div>
            </div>

            {own ? (
              <form onSubmit={submit}>
                <label>
                  Bio
                  <textarea
                    value={bio}
                    maxLength={MAX_BIO_LENGTH}
                    rows={4}
                    placeholder="Conte um pouco sobre você (opcional)"
                    onChange={(event) => setBio(event.target.value)}
                  />
                </label>
                <p className="hint">
                  {bio.length}/{MAX_BIO_LENGTH} caracteres
                </p>
                <div className="dialog-actions">
                  <button type="button" onClick={onClose} disabled={saving}>
                    Fechar
                  </button>
                  <button type="submit" className="primary" disabled={saving}>
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
                {saved && (
                  <p className="hint" role="status">
                    Bio salva.
                  </p>
                )}
              </form>
            ) : (
              <>
                <p className="profile-bio">{profile.bio ?? 'Sem bio.'}</p>
                <div className="dialog-actions">
                  <button type="button" onClick={onClose}>
                    Fechar
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
