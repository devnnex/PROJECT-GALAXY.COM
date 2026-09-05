import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, MailCheck, Orbit } from 'lucide-react';
import { api } from '../services/api';
import { CONFIG } from '../config';
import NeuralCanvas from './NeuralCanvas';

export default function AuthGate({ onAuthenticated, onBack }) {
  const invitationAccess = new URLSearchParams(location.search).has('invite') || new URLSearchParams(location.search).has('meeting');
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('registration') || '');
  const [invitation, setInvitation] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [mode, setMode] = useState(token ? 'register' : 'login');
  useEffect(() => {
    if (!token) return;
    let active = true;
    api.inspectInvitation(token).then(data => { if (active) { setInvitation(data); setForm(form => ({ ...form, email: data.email })); } }).catch(err => { if (active) setError(err.message); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); };
  }, [token]);
  const seconds = invitation ? Math.max(0, Math.ceil((new Date(invitation.expires_at).getTime() - now) / 1000)) : 0;
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState('');

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await (mode === 'login' ? api.login(form) : api.register({ ...form, token }));
      if (result.registered) { setMode('login'); setError('Cuenta creada. Inicia sesión con tu contraseña.'); return; }
      if (result.requiresConfirmation) { setConfirmationEmail(result.email); return; }
      onAuthenticated(result.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return <main className="auth-page">
    <NeuralCanvas />
    <button className="ghost-button auth-back" onClick={onBack}><ArrowLeft size={17} /> Inicio</button>
    <section className="auth-card glass">
      <div className="brand auth-brand"><span className="brand-mark"><Orbit /></span><span>{CONFIG.APP_NAME}</span></div>
      {confirmationEmail ? <div className="auth-confirmation" role="status">
        <span className="auth-confirmation-icon"><MailCheck /></span>
        <p className="eyebrow">ACCESO CREADO</p>
        <h1>Confirma tu acceso.</h1>
        <p className="muted">Enviamos un acceso seguro a <strong>{confirmationEmail}</strong>. Abre el correo de PROJECT GALAXY y confirma tu cuenta.</p>
        <button className="primary-button auth-submit" onClick={() => { setConfirmationEmail(''); setMode('login'); }}>Ir a iniciar sesión <ArrowRight size={18} /></button>
      </div> : <>
      <p className="eyebrow">XAUUSD TRADING DESK</p>
      <h1>{mode === 'login' ? 'Vuelve al mercado.' : 'Crea tu acceso al desk.'}</h1>
      <p className="muted">{mode === 'login' ? 'Tus operativas en vivo, análisis y herramientas de liquidez te esperan.' : 'Una cuenta para acompañar el estudio de XAUUSD, liquidez y Kill Zones.'}</p>
      {invitationAccess && <div className="mode-note">Inicia sesión con tu cuenta para entrar a la reunión. Las cuentas nuevas requieren una invitación del administrador.</div>}
      {token && mode === 'register' && <div className="mode-note">{invitation ? seconds > 0 ? invitation.plan_code + ' · Invitación: ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : 'La invitación venció. Solicita una nueva al administrador.' : error ? 'No se pudo validar esta invitación.' : 'Validando invitación…'}</div>}

      <form onSubmit={submit}>
        {mode === 'register' && <div className="field-row"><label>Nombre<input required name="name" value={form.name} onChange={update} placeholder="Tu nombre" /></label><label>Usuario<input required minLength="3" name="username" value={form.username} onChange={update} placeholder="usuario" /></label></div>}
        <label>Correo electrónico<input required type="email" readOnly={mode === 'register'} name="email" value={form.email} onChange={update} autoComplete="email" /></label>
        <label>Contraseña<div className="password-field"><input required minLength="10" type={show ? 'text' : 'password'} name="password" value={form.password} onChange={update} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShow(!show)} aria-label="Mostrar contraseña">{show ? <EyeOff /> : <Eye />}</button></div></label>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy || (mode === 'register' && (!invitation || seconds <= 0))}>{busy ? <LoaderCircle className="spin" /> : <>{mode === 'login' ? 'Entrar al trading desk' : 'Crear acceso'} <ArrowRight size={18} /></>}</button>
      </form>
      {mode === 'register' ? <button className="text-button" onClick={() => { setMode('login'); setError(''); }}>Ya tengo una cuenta</button> : <p className="muted">El registro está disponible únicamente por invitación del administrador.</p>}

      </>}
    </section>
    <p className="auth-foot">Cifrado en tránsito · Sesiones revocables · Control de acceso</p>
  </main>;
}
