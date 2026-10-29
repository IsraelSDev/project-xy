import { MAX_BIO_LENGTH, type PublicProfile } from '@3dx/contracts';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from '../../app/api';
import { identityColor, initialOf } from '../../app/identity-color';
import { StaffBadge } from '../../app/StaffBadge';
import { ReportDialog } from '../safety/ReportDialog';

interface ProfileDialogProps {
  /** Sem id = o próprio perfil (com edição da bio, do nome e da foto); com id = perfil de outro. */
  userId?: string;
  /** Chamado quando algo do perfil é salvo (nome/foto), para a sessão/topo acompanharem. */
  onSaved?: (profile: PublicProfile) => void;
  onClose: () => void;
}

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof Error && caught.message ? caught.message : fallback;

/** Data de criação da conta, só o dia, no fuso de quem lê. */
const memberSince = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/** Lado máximo da foto do perfil (o servidor limita por bytes; aqui é o redimensionamento). */
const MAX_PHOTO_SIDE = 512;

/**
 * Redimensiona a imagem no cliente e devolve JPEG em base64 (sem `data:`). A API recusa corpos que
 * não sejam JSON, então a foto viaja dentro do JSON — não há upload multipart.
 */
async function toPhotoPayload(file: File): Promise<{ mime: 'image/jpeg'; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível processar a imagem.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

/**
 * Perfil de um membro: foto, nome, selo da equipe, verificação de idade e bio. No próprio perfil a
 * bio e a foto são editáveis; nos outros, só leitura.
 */
export function ProfileDialog({ userId, onSaved, onClose }: ProfileDialogProps) {
  const own = userId === undefined;
  const [profile, setProfile] = useState<PublicProfile>();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reporting, setReporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api<PublicProfile>(own ? '/profiles/me' : `/profiles/${userId}`)
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setName(data.displayName);
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
    const previousName = profile?.displayName;
    const trimmed = name.trim();
    try {
      const updated = await api<PublicProfile>('/profiles/me', {
        method: 'PATCH',
        json: {
          bio: bio.trim() === '' ? null : bio,
          // Só manda o nome quando mudou: assim o intervalo mínimo não é gasto à toa.
          ...(trimmed && trimmed !== previousName ? { displayName: trimmed } : {}),
        },
      });
      setProfile(updated);
      setName(updated.displayName);
      setBio(updated.bio ?? '');
      setSaved(true);
      onSaved?.(updated);
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

  const changePhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      const payload = await toPhotoPayload(file);
      const updated = await api<PublicProfile>('/profiles/me/photo', { json: payload });
      setProfile(updated);
      onSaved?.(updated);
    } catch (caught) {
      setError(messageOf(caught, 'Não foi possível enviar a foto.'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePhoto = async () => {
    setUploading(true);
    setError(undefined);
    try {
      const updated = await api<PublicProfile>('/profiles/me/photo', { method: 'DELETE' });
      setProfile(updated);
      onSaved?.(updated);
    } catch (caught) {
      setError(messageOf(caught, 'Não foi possível remover a foto.'));
    } finally {
      setUploading(false);
    }
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
              <span className="profile-photo">
                {profile.photoUpdatedAt ? (
                  <img
                    src={`/api/profiles/${profile.id}/photo?v=${encodeURIComponent(profile.photoUpdatedAt)}`}
                    alt={`Foto de ${profile.displayName}`}
                  />
                ) : (
                  <span
                    className="avatar-dot"
                    style={{ '--dot': identityColor(profile.id) } as CSSProperties}
                    aria-hidden="true"
                  >
                    {initialOf(profile.displayName)}
                  </span>
                )}
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

            {own && (
              <div className="profile-photo-actions">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(event) => void changePhoto(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                >
                  {uploading
                    ? 'Enviando…'
                    : profile.photoUpdatedAt
                      ? 'Trocar foto'
                      : 'Adicionar foto'}
                </button>
                {profile.photoUpdatedAt && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void removePhoto()}
                    disabled={uploading}
                  >
                    Remover foto
                  </button>
                )}
              </div>
            )}

            {own ? (
              <form onSubmit={submit}>
                <label>
                  Nome
                  <input
                    value={name}
                    minLength={3}
                    maxLength={24}
                    required
                    autoComplete="nickname"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
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
                  {bio.length}/{MAX_BIO_LENGTH} caracteres · o nome pode ser trocado uma vez por dia
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
                  <button type="button" className="ghost" onClick={() => setReporting(true)}>
                    Denunciar perfil
                  </button>
                  <button type="button" onClick={onClose}>
                    Fechar
                  </button>
                </div>
                {reporting && (
                  <ReportDialog
                    target={{ userId: profile.id, name: profile.displayName }}
                    context="PROFILE"
                    onClose={() => setReporting(false)}
                  />
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
