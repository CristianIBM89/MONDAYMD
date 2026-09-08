import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props { user: AppUser; iteration: ActiveIteration | null; serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean }; }

const TIPOS = ['operativo', 'tecnico', 'acceso', 'herramienta', 'dependencia', 'capacidad', 'otro'] as const;
const IMPACTOS = ['bajo', 'medio', 'alto', 'critico'] as const;
const URGENCIAS = ['normal', 'urgente', 'bloqueante_total'] as const;

export default function BlockerForm({ user, iteration }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isList = params.get('list') === '1';

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<typeof TIPOS[number]>('operativo');
  const [impacto, setImpacto] = useState<typeof IMPACTOS[number]>('medio');
  const [urgencia, setUrgencia] = useState<typeof URGENCIAS[number]>('normal');
  const [iteracionNombre, setIteracionNombre] = useState(iteration?.nombre ?? '');
  const [procesoAfectado, setProcesoAfectado] = useState('');
  const [responsableSugerido, setResponsableSugerido] = useState('');
  const [fechaEsperada, setFechaEsperada] = useState('');
  const [requiereEscalamiento, setRequiereEscalamiento] = useState(false);
  const [comentarios, setComentarios] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    setSending(true); setError(null);
    try {
      const result = await api.createBlocker({
        titulo, descripcion, tipo, impacto, urgencia,
        iteracionId: iteration?.id ?? 'manual', iteracionNombre: iteracionNombre || 'Sin especificar',
        procesoAfectado, responsableSugerido: responsableSugerido || 'Pendiente por definir',
        fechaEsperadaSolucion: fechaEsperada || 'Pendiente por definir',
        requiereEscalamiento, comentarios,
        idempotencyKey: uuid(),
      });

      if (file && result.mondayItemId) {
        const fd = new FormData();
        fd.append('file', file);
        await api.attachMarblesEvidence(result.mondayItemId, fd);
      }

      setSuccess({ id: result.mondayItemId });
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el bloqueante');
    } finally {
      setSending(false);
    }
  }

  if (isList) {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader title="Bloqueantes" subtitle="Registrados en Monday" />
          <div className="ath-alert ath-alert-info">Para consultar los bloqueantes abiertos, accede directamente al tablero de Monday. El dashboard gerencial los muestra en el <button className="ath-back" onClick={() => navigate('/manager')}>Panel del gerente →</button></div>
        </div></div>
      </div>
    );
  }

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app">
        <div className="ath-page">
          <PageHeader title="Registrar bloqueante" />
          {error && <div className="ath-alert ath-alert-error">{error}</div>}
          {success ? (
            <div className="ath-alert ath-alert-ok">
              ✅ Bloqueante registrado en Monday (ID: {success.id})
              <div className="ath-btn-row" style={{ marginTop: 12 }}>
                <button className="ath-btn ath-btn-secondary" onClick={() => { setSuccess(null); setTitulo(''); setDescripcion(''); }}>Registrar otro</button>
                <button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>Inicio</button>
              </div>
            </div>
          ) : (
            <div className="ath-form">
              <div className="ath-form-row"><label className="ath-label">Título *</label><input className="ath-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">Descripción *</label><textarea className="ath-textarea" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div className="ath-form-row"><label className="ath-label">Tipo</label><select className="ath-select" value={tipo} onChange={(e) => setTipo(e.target.value as typeof TIPOS[number])}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="ath-form-row"><label className="ath-label">Impacto</label><select className="ath-select" value={impacto} onChange={(e) => setImpacto(e.target.value as typeof IMPACTOS[number])}>{IMPACTOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="ath-form-row"><label className="ath-label">Urgencia</label><select className="ath-select" value={urgencia} onChange={(e) => setUrgencia(e.target.value as typeof URGENCIAS[number])}>{URGENCIAS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              </div>
              <div className="ath-form-row"><label className="ath-label">Iteración</label><input className="ath-input" value={iteracionNombre} onChange={(e) => setIteracionNombre(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">Proceso afectado</label><input className="ath-input" value={procesoAfectado} onChange={(e) => setProcesoAfectado(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">Responsable sugerido</label><input className="ath-input" value={responsableSugerido} onChange={(e) => setResponsableSugerido(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">Fecha esperada de solución</label><input type="date" className="ath-input" value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} /></div>
              <div className="ath-form-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="escalar" checked={requiereEscalamiento} onChange={(e) => setRequiereEscalamiento(e.target.checked)} />
                <label htmlFor="escalar" style={{ fontSize: 13, cursor: 'pointer' }}>Requiere escalamiento gerencial</label>
              </div>
              <div className="ath-form-row"><label className="ath-label">Comentarios</label><textarea className="ath-textarea" value={comentarios} onChange={(e) => setComentarios(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">Evidencia (imagen o PDF, opcional)</label><input type="file" accept="image/*,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
              <div style={{ fontSize: 12, color: 'var(--ath-gray-50)', marginBottom: 10 }}>Reportado por: <strong>{user.name}</strong> ({user.email}) · Fecha: {new Date().toLocaleDateString('es-CO')}</div>
              <button className="ath-btn ath-btn-primary" onClick={() => setShowConfirm(true)} disabled={!titulo.trim() || !descripcion.trim()}>Revisar y confirmar</button>
            </div>
          )}

          {showConfirm && (
            <div className="ath-modal-overlay">
              <div className="ath-modal">
                <h3>¿Registrar este bloqueante en Monday?</h3>
                <p><strong>{titulo}</strong><br />{descripcion.slice(0, 120)}{descripcion.length > 120 ? '...' : ''}</p>
                <p>Tipo: {tipo} · Impacto: {impacto} · Urgencia: {urgencia}</p>
                {requiereEscalamiento && <p style={{ color: 'var(--ath-red)' }}>⚠️ Requiere escalamiento gerencial</p>}
                <div className="ath-btn-row">
                  <button className="ath-btn ath-btn-primary" onClick={handleSubmit} disabled={sending}>{sending ? 'Registrando...' : 'Confirmar y registrar'}</button>
                  <button className="ath-btn ath-btn-ghost" onClick={() => setShowConfirm(false)}>Revisar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
