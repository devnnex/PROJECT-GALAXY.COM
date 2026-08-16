import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, Orbit } from 'lucide-react';
import { api } from '../services/api';
import { CONFIG } from '../config';
import NeuralCanvas from './NeuralCanvas';

export default function AuthGate({ onAuthenticated, onBack }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await (mode === 'login' ? api.login(form) : api.register(form));
      onAuthenticated(result.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return <main className="auth-page">
    <NeuralCanvas />
    <button className="ghost-button auth-back" onClick={onBack}><ArrowLeft size={17} /> Inicio</button>
    <section className="auth-card glass">
      <div className="brand auth-brand"><span className="brand-mark"><Orbit /></span><span>{CONFIG.APP_NAME}</span></div>
      <p className="eyebrow">IDENTITY PORTAL</p>
      <h1>{mode === 'login' ? 'Continúa tu trayectoria.' : 'Crea tu coordenada.'}</h1>
      <p className="muted">{mode === 'login' ? 'Tu espacio, conexiones y herramientas te esperan.' : 'Una identidad para todo el ecosistema.'}</p>
      <form onSubmit={submit}>
        {mode === 'register' && <div className="field-row"><label>Nombre<input required name="name" value={form.name} onChange={update} placeholder="Tu nombre" /></label><label>Usuario<input required minLength="3" name="username" value={form.username} onChange={update} placeholder="usuario" /></label></div>}
        <label>Correo electrónico<input required type="email" name="email" value={form.email} onChange={update} autoComplete="email" /></label>
        <label>Contraseña<div className="password-field"><input required minLength="10" type={show ? 'text' : 'password'} name="password" value={form.password} onChange={update} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShow(!show)} aria-label="Mostrar contraseña">{show ? <EyeOff /> : <Eye />}</button></div></label>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <>{mode === 'login' ? 'Entrar al ecosistema' : 'Crear identidad'} <ArrowRight size={18} /></>}</button>
      </form>
      <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? '¿Aún no tienes una identidad? Crear cuenta' : 'Ya tengo una cuenta'}
      </button>
    </section>
    <p className="auth-foot">Cifrado en tránsito · Sesiones revocables · Control de acceso</p>
  </main>;
}
