import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props { user: AppUser; iteration: ActiveIteration | null; serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean }; }

export default function ShowcaseForm({ user, iteration }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ entregable: '', descripcion: '', responsable: '', presentador: user.name, fecha: new Date().toISOString().split('T')[0], resultado: '', valorNegocio: '', estado: 'En preparación', retroalimentacion: '', proximoPaso: '' });
  const [iteracionNombre, setIteracionNombre] = useState(iteration?.nombre ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleSubmit() {
    setSending(true); setError(null);
    try {
      const result = await api.createShowcase({ ...form, iteracionNombre, idempotencyKey: uuid() });
      setSuccess({ id: result.mondayItemId });
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar showcase');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app"><div className="ath-page">
        <PageHeader title="Registrar Showcase" />
        {error && <div className="ath-alert ath-alert-error">{error}</div>}
        {success ? (
          <div className="ath-alert ath-alert-ok">✅ Showcase registrado en Monday (ID: {success.id})<div className="ath-btn-row" style={{ marginTop: 12 }}><button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>Inicio</button></div></div>
        ) : (
          <div className="ath-form">
            <div className="ath-form-row"><label className="ath-label">Iteración</label><input className="ath-input" value={iteracionNombre} onChange={(e) => setIteracionNombre(e.target.value)} /></div>
            <div className="ath-form-row"><label className="ath-label">Entregable / Iniciativa *</label><input className="ath-input" value={form.entregable} onChange={set('entregable')} /></div>
            <div className="ath-form-row"><label className="ath-label">Descripción *</label><textarea className="ath-textarea" value={form.descripcion} onChange={set('descripcion')} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="ath-form-row"><label className="ath-label">Responsable *</label><input className="ath-input" value={form.responsable} onChange={set('responsable')} /></div>
              <div className="ath-form-row"><label className="ath-label">Presentador</label><input className="ath-input" value={form.presentador} onChange={set('presentador')} /></div>
            </div>
            <div className="ath-form-row"><label className="ath-label">Fecha del showcase</label><input type="date" className="ath-input" value={form.fecha} onChange={set('fecha')} /></div>
            <div className="ath-form-row"><label className="ath-label">Resultado obtenido</label><textarea className="ath-textarea" value={form.resultado} onChange={set('resultado')} /></div>
            <div className="ath-form-row"><label className="ath-label">Valor para el negocio</label><textarea className="ath-textarea" value={form.valorNegocio} onChange={set('valorNegocio')} /></div>
            <div className="ath-form-row"><label className="ath-label">Estado</label><select className="ath-select" value={form.estado} onChange={set('estado')}>{['En preparación', 'Listo', 'Presentado', 'Pospuesto'].map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="ath-form-row"><label className="ath-label">Retroalimentación recibida</label><textarea className="ath-textarea" value={form.retroalimentacion} onChange={set('retroalimentacion')} /></div>
            <div className="ath-form-row"><label className="ath-label">Próximo paso</label><input className="ath-input" value={form.proximoPaso} onChange={set('proximoPaso')} /></div>
            <div className="ath-form-row"><label className="ath-label">Evidencia (opcional)</label><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <button className="ath-btn ath-btn-primary" onClick={() => setShowConfirm(true)} disabled={!form.entregable.trim() || !form.descripcion.trim() || !form.responsable.trim()}>Revisar y confirmar</button>
          </div>
        )}
        {showConfirm && (
          <div className="ath-modal-overlay"><div className="ath-modal">
            <h3>¿Registrar showcase en Monday?</h3>
            <p><strong>{form.entregable}</strong><br />Responsable: {form.responsable} · Fecha: {form.fecha}</p>
            <div className="ath-btn-row">
              <button className="ath-btn ath-btn-primary" onClick={handleSubmit} disabled={sending}>{sending ? 'Guardando...' : 'Confirmar'}</button>
              <button className="ath-btn ath-btn-ghost" onClick={() => setShowConfirm(false)}>Revisar</button>
            </div>
          </div></div>
        )}
      </div></div>
    </div>
  );
}
