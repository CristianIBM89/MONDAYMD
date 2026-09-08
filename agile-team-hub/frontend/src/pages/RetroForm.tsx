import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props { user: AppUser; iteration: ActiveIteration | null; serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean }; }

const CATEGORIAS = [
  { value: 'bien', label: '✅ ¿Qué hicimos bien?' },
  { value: 'mal', label: '❌ ¿Qué salió mal?' },
  { value: 'mejorar', label: '🔧 ¿Qué podemos mejorar?' },
  { value: 'preguntas', label: '❓ Preguntas abiertas' },
] as const;

export default function RetroForm({ user, iteration }: Props) {
  const navigate = useNavigate();
  const [categoria, setCategoria] = useState<'bien' | 'mal' | 'mejorar' | 'preguntas'>('bien');
  const [comentario, setComentario] = useState('');
  const [autor, setAutor] = useState(user.name);
  const [iteracionNombre, setIteracionNombre] = useState(iteration?.nombre ?? '');
  const [esAccion, setEsAccion] = useState(false);
  const [accionMejora, setAccionMejora] = useState('');
  const [responsableMejora, setResponsableMejora] = useState('');
  const [fechaCumplimiento, setFechaCumplimiento] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    setSending(true); setError(null);
    try {
      const result = await api.createRetro({
        categoria, comentario, autor: autor || undefined,
        iteracionNombre: iteracionNombre || 'Sin especificar',
        fecha: new Date().toISOString().split('T')[0],
        prioridad: 0,
        accionMejora: esAccion ? accionMejora : '',
        responsableMejora: esAccion ? responsableMejora : '',
        fechaCumplimiento: esAccion ? fechaCumplimiento : '',
        estado: 'Abierto',
        idempotencyKey: uuid(),
      });
      setSuccess({ id: result.mondayItemId });
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar la retrospectiva');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app"><div className="ath-page">
        <PageHeader title="Retrospectiva" subtitle="Agrega un comentario por categoría" />
        {error && <div className="ath-alert ath-alert-error">{error}</div>}
        {success ? (
          <div className="ath-alert ath-alert-ok">
            ✅ Registro de retrospectiva guardado en Monday (ID: {success.id})
            <div className="ath-btn-row" style={{ marginTop: 12 }}>
              <button className="ath-btn ath-btn-secondary" onClick={() => { setSuccess(null); setComentario(''); setAccionMejora(''); setEsAccion(false); }}>Agregar otro</button>
              <button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>Inicio</button>
            </div>
          </div>
        ) : (
          <div className="ath-form">
            <div className="ath-form-row"><label className="ath-label">Categoría *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {CATEGORIAS.map((c) => (
                  <button key={c.value} className={`ath-btn ${categoria === c.value ? 'ath-btn-primary' : 'ath-btn-ghost'}`} style={{ justifyContent: 'flex-start' }} onClick={() => setCategoria(c.value)}>{c.label}</button>
                ))}
              </div>
            </div>
            <div className="ath-form-row"><label className="ath-label">Iteración</label><input className="ath-input" value={iteracionNombre} onChange={(e) => setIteracionNombre(e.target.value)} /></div>
            <div className="ath-form-row"><label className="ath-label">Comentario *</label><textarea className="ath-textarea" value={comentario} onChange={(e) => setComentario(e.target.value)} /></div>
            <div className="ath-form-row"><label className="ath-label">Autor (opcional, deja en blanco para anónimo)</label><input className="ath-input" value={autor} onChange={(e) => setAutor(e.target.value)} /></div>
            <div className="ath-form-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="esAccion" checked={esAccion} onChange={(e) => setEsAccion(e.target.checked)} />
              <label htmlFor="esAccion" style={{ fontSize: 13, cursor: 'pointer' }}>Convertir en acción de mejora</label>
            </div>
            {esAccion && (
              <div style={{ background: 'var(--ath-gray-10)', padding: 16, borderRadius: 4, marginBottom: 16 }}>
                <div className="ath-form-row"><label className="ath-label">Descripción de la acción de mejora *</label><textarea className="ath-textarea" value={accionMejora} onChange={(e) => setAccionMejora(e.target.value)} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="ath-form-row"><label className="ath-label">Responsable</label><input className="ath-input" value={responsableMejora} onChange={(e) => setResponsableMejora(e.target.value)} /></div>
                  <div className="ath-form-row"><label className="ath-label">Fecha de cumplimiento</label><input type="date" className="ath-input" value={fechaCumplimiento} onChange={(e) => setFechaCumplimiento(e.target.value)} /></div>
                </div>
              </div>
            )}
            <button className="ath-btn ath-btn-primary" onClick={() => setShowConfirm(true)} disabled={!comentario.trim()}>Revisar y guardar</button>
          </div>
        )}
        {showConfirm && (
          <div className="ath-modal-overlay"><div className="ath-modal">
            <h3>¿Guardar este registro de retrospectiva en Monday?</h3>
            <p>Categoría: <strong>{CATEGORIAS.find((c) => c.value === categoria)?.label}</strong></p>
            <p>{comentario.slice(0, 150)}</p>
            {esAccion && <p>Se creará como acción de mejora. Responsable: {responsableMejora || 'Pendiente por definir'}</p>}
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
