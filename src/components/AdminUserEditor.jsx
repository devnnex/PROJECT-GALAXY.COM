import { useEffect, useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import ConstellationAvatar from './ConstellationAvatar';
import ProfilePhotoCropper from './ProfilePhotoCropper';

export default function AdminUserEditor({ account, onClose, onSaved }) {
  const [name, setName] = useState(account.name);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [crop, setCrop] = useState(null);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const close = () => { if (!busy) onClose(); };
  const choose = (event) => {
    const image = event.target.files?.[0]; event.target.value = '';
    if (!image) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || !image.size || image.size > 5 * 1024 * 1024) {
      setError('Elige una imagen JPG, PNG o WebP de hasta 5 MB.'); return;
    }
    setError(''); setCrop(image);
  };
  const save = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const updated = await api.adminUpdateUserProfile({ userId: account.id, name, file, remove, previousAvatar: account.avatar });
      onSaved(updated); onClose();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={close}><section className="profile-editor glass" role="dialog" aria-modal="true" aria-labelledby="admin-profile-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">USUARIOS</p><h2 id="admin-profile-title">Editar nombre y foto</h2><p>{account.email}</p></div><button className="icon-button" disabled={busy} type="button" onClick={close} aria-label="Cerrar"><X /></button></div>
    <div className="profile-editor-avatar"><ConstellationAvatar seed={account.id} name={name} src={preview || (remove ? '' : account.avatar)} membership={account.membership} /><div className="profile-avatar-choice"><p>Foto de perfil del usuario</p><div><label className="secondary-button avatar-upload-button"><ImagePlus /> Elegir imagen<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={choose} /></label>{(account.avatar || file) && !remove && <button className="secondary-button avatar-remove-button" disabled={busy} type="button" onClick={() => { setFile(null); setPreview(''); setRemove(true); }}><Trash2 /> Eliminar</button>}</div><small>JPG, PNG o WebP · máximo 5 MB</small></div></div>
    <form onSubmit={save} aria-busy={busy}><label>Nombre<input required autoFocus minLength="2" maxLength="100" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>{error && <div className="inline-error" role="alert">{error}</div>}<div className="modal-actions"><button className="secondary-button" disabled={busy} type="button" onClick={close}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div></form>
  </section>{crop && <ProfilePhotoCropper file={crop} onCancel={() => setCrop(null)} onApply={(image) => { setFile(image); setPreview(URL.createObjectURL(image)); setRemove(false); setCrop(null); }} />}</div>;
}
