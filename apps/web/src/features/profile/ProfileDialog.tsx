import {
  MAX_BIO_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_STATUS_LENGTH,
  PROFILE_INTERESTS,
  PROFILE_LANGUAGES,
  PROFILE_LOOKING_FOR,
  PROFILE_PRONOUNS,
  type NameChangeSummary,
  type ProfileInterest,
  type ProfileLanguage,
  type ProfileLookingFor,
  type ProfilePronouns,
  type PublicProfile,
} from '@3dx/contracts';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Icon } from '../../app/Icon';
import { api } from '../../app/api';
import { identityColor, initialOf } from '../../app/identity-color';
import { StaffBadge } from '../../app/StaffBadge';
import { ReportDialog } from '../safety/ReportDialog';

interface ProfileDialogProps {
  /** Sem id = o próprio perfil (com edição da bio, do nome e da foto); com id = perfil de outro. */
  userId?: string;
  /** Chamado quando algo do perfil é salvo (nome/foto), para a sessão/topo acompanharem. */
  onSaved?: (profile: PublicProfile) => void;
  /** Retrato 3D do avatar a partir da cena atual; `undefined` quando não está carregado. */
  portraitOf?: (userId: string) => Promise<string | undefined>;
  /** Moderação: mostra os nomes anteriores do membro (histórico de trocas). */
  canModerate?: boolean;
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

/** Rótulo de uma opção pelo id (os catálogos do contrato são a fonte). */
const labelOf = (options: readonly { id: string; label: string }[], id: string) =>
  options.find((option) => option.id === id)?.label ?? id;

/** Aniversário sem ano: "12 de maio". */
const birthdayLabel = (birthday: { day: number; month: number }) =>
  new Date(Date.UTC(2000, birthday.month - 1, birthday.day)).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  });

/**
 * Perfil de um membro: foto, nome, selo da equipe, verificação de idade e bio. No próprio perfil a
 * bio e a foto são editáveis; nos outros, só leitura.
 */
export function ProfileDialog({
  userId,
  onSaved,
  portraitOf,
  canModerate,
  onClose,
}: ProfileDialogProps) {
  const own = userId === undefined;
  const [profile, setProfile] = useState<PublicProfile>();
  const [portrait, setPortrait] = useState<string>();
  const [names, setNames] = useState<NameChangeSummary[]>();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [lookingFor, setLookingFor] = useState<ProfileLookingFor | ''>('');
  const [pronouns, setPronouns] = useState<ProfilePronouns | ''>('');
  const [interests, setInterests] = useState<ProfileInterest[]>([]);
  const [languages, setLanguages] = useState<ProfileLanguage[]>([]);
  const [showBirthday, setShowBirthday] = useState(false);
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
        setLocation(data.location ?? '');
        setStatus(data.status ?? '');
        setLookingFor(data.lookingFor ?? '');
        setPronouns(data.pronouns ?? '');
        setInterests(data.interests);
        setLanguages(data.languages);
        setShowBirthday(data.birthday !== null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught, 'Não foi possível carregar o perfil.'));
      });
    return () => {
      cancelled = true;
    };
  }, [own, userId]);

  // Retrato do avatar: só se ele estiver na cena (mesma sala). Fora isso fica a foto ou as iniciais.
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId || !portraitOf) return;
    let cancelled = false;
    portraitOf(profileId)
      .then((data) => {
        if (!cancelled && data) setPortrait(data);
      })
      .catch(() => {
        /* sem retrato: segue com foto/iniciais */
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, portraitOf]);

  // Moderação: histórico de nomes do membro (só para a equipe, e não no próprio perfil).
  useEffect(() => {
    if (!profileId || own || !canModerate) return;
    let cancelled = false;
    api<NameChangeSummary[]>(`/admin/users/${profileId}/names`)
      .then((list) => {
        if (!cancelled) setNames(list);
      })
      .catch(() => {
        /* sem permissão ou falha momentânea: a seção não aparece */
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, own, canModerate]);

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
          location: location.trim() === '' ? null : location,
          status: status.trim() === '' ? null : status,
          lookingFor: lookingFor === '' ? null : lookingFor,
          pronouns: pronouns === '' ? null : pronouns,
          interests,
          languages,
          showBirthday,
          // Só manda o nome quando mudou: assim o intervalo mínimo não é gasto à toa.
          ...(trimmed && trimmed !== previousName ? { displayName: trimmed } : {}),
        },
      });
      setProfile(updated);
      setName(updated.displayName);
      setBio(updated.bio ?? '');
      setLocation(updated.location ?? '');
      setStatus(updated.status ?? '');
      setLookingFor(updated.lookingFor ?? '');
      setPronouns(updated.pronouns ?? '');
      setInterests(updated.interests);
      setLanguages(updated.languages);
      setShowBirthday(updated.birthday !== null);
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

  const toggleInterest = (id: ProfileInterest) => {
    setInterests((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 6
          ? current
          : [...current, id],
    );
  };

  const toggleLanguage = (id: ProfileLanguage) => {
    setLanguages((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 3
          ? current
          : [...current, id],
    );
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
            {portrait && (
              <img
                className="profile-portrait"
                src={portrait}
                alt={`Avatar de ${profile.displayName}`}
              />
            )}
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
                {(profile.location || profile.birthday) && (
                  <p className="profile-facts">
                    {profile.location && (
                      <span>
                        <Icon name="pin" size={13} /> {profile.location}
                      </span>
                    )}
                    {profile.birthday && (
                      <span>
                        <Icon name="cake" size={13} /> {birthdayLabel(profile.birthday)}
                      </span>
                    )}
                  </p>
                )}
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

            {profile.status && <p className="profile-status">“{profile.status}”</p>}
            {(profile.lookingFor || profile.pronouns) && (
              <p className="profile-tags">
                {profile.lookingFor && (
                  <span className="badge badge-accent">
                    Procurando {labelOf(PROFILE_LOOKING_FOR, profile.lookingFor).toLowerCase()}
                  </span>
                )}
                {profile.pronouns && (
                  <span className="badge">{labelOf(PROFILE_PRONOUNS, profile.pronouns)}</span>
                )}
              </p>
            )}
            {profile.interests.length > 0 && (
              <ul className="profile-chips" aria-label="Interesses">
                {profile.interests.map((id) => (
                  <li key={id}>{labelOf(PROFILE_INTERESTS, id)}</li>
                ))}
              </ul>
            )}
            {profile.languages.length > 0 && (
              <p className="hint">
                Idiomas: {profile.languages.map((id) => labelOf(PROFILE_LANGUAGES, id)).join(' · ')}
              </p>
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
                <label>
                  Localização
                  <input
                    value={location}
                    maxLength={MAX_LOCATION_LENGTH}
                    placeholder="Cidade/região (opcional)"
                    autoComplete="address-level2"
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </label>
                <label className="profile-check">
                  <input
                    type="checkbox"
                    checked={showBirthday}
                    onChange={(event) => setShowBirthday(event.target.checked)}
                  />
                  Mostrar aniversário (dia e mês) no perfil
                </label>
                <label>
                  Status
                  <input
                    value={status}
                    maxLength={MAX_STATUS_LENGTH}
                    placeholder="Uma frase curta sobre o seu momento (opcional)"
                    onChange={(event) => setStatus(event.target.value)}
                  />
                </label>
                <div className="profile-pair">
                  <label>
                    Procurando
                    <select
                      value={lookingFor}
                      onChange={(event) =>
                        setLookingFor(event.target.value as ProfileLookingFor | '')
                      }
                    >
                      <option value="">Prefiro não dizer</option>
                      {PROFILE_LOOKING_FOR.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Pronomes
                    <select
                      value={pronouns}
                      onChange={(event) => setPronouns(event.target.value as ProfilePronouns | '')}
                    >
                      <option value="">Prefiro não dizer</option>
                      {PROFILE_PRONOUNS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <fieldset className="profile-choices">
                  <legend>
                    Interesses <span className="hint">({interests.length}/6)</span>
                  </legend>
                  <div className="chips">
                    {PROFILE_INTERESTS.map((option) => {
                      const active = interests.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={active ? 'chip chip-on' : 'chip'}
                          aria-pressed={active}
                          disabled={!active && interests.length >= 6}
                          onClick={() => toggleInterest(option.id)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="profile-choices">
                  <legend>
                    Idiomas <span className="hint">({languages.length}/3)</span>
                  </legend>
                  <div className="chips">
                    {PROFILE_LANGUAGES.map((option) => {
                      const active = languages.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={active ? 'chip chip-on' : 'chip'}
                          aria-pressed={active}
                          disabled={!active && languages.length >= 3}
                          onClick={() => toggleLanguage(option.id)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
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
                    Perfil salvo.
                  </p>
                )}
              </form>
            ) : (
              <>
                <p className="profile-bio">{profile.bio ?? 'Sem bio.'}</p>
                {canModerate && names && (
                  <section className="profile-names" aria-label="Histórico de nomes">
                    <h3>Nomes anteriores</h3>
                    {names.length === 0 ? (
                      <p className="hint">Sem trocas de nome.</p>
                    ) : (
                      <ul>
                        {names.slice(0, 10).map((change) => (
                          <li key={change.changedAt}>
                            {change.previousName}
                            <span className="hint">
                              {' '}
                              até {new Date(change.changedAt).toLocaleDateString('pt-BR')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
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
