import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props { user: AppUser; iteration: ActiveIteration | null; serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean }; }

export default function IterationPage({ user, iteration }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isMarbles = params.get('marbles') === '1';
  const isManager = params.get('manager') === '1';

  const [comentario, setComentario] = useState('');
  const [enlace, setEnlace] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);

  const onDrop = useCallback((files: File[]) => setFile(files[0] ?? null), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/png': [], 'image/jpeg': [], 'image/gif': [], 'image/webp': [] }, maxFiles: 1,
  });

  async function handleSubmitMarbles() {
    if (!iteration) { setError('No hay iteración activa.'); return; }
    setSending(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('comentario', comentario);
      if (enlace) fd.append('enlace', enlace);
      if (file) fd.append('file', file);
      await api.attachMarblesEvidence(iteration.id, fd);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error adjuntando evidencia');
    } finally {
      setSending(false);
    }
  }

  if (isManager) {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader title="Gerente de iteración" />
          {iteration ? (
            <div className="ath-card">
              <ul className="ath-list">
                <li className="ath-list-item"><span className="ath-list-label">Iteración activa</span><span className="ath-list-value">{iteration.nombre}</span></li>
                <li className="ath-list-item"><span className="ath-list-label">Gerente</span><span className="ath-list-value">{iteration.gerenteNombre || 'Sin asignar'}</span></li>
                <li className="ath-list-item"><span className="ath-list-label">Correo</span><span className="ath-list-value">{iteration.gerenteEmail || '—'}</span></li>
                <li className="ath-list-item"><span className="ath-list-label">Inicio</span><span className="ath-list-value">{iteration.fechaInicio || '—'}</span></li>
                <li className="ath-list-item"><span className="ath-list-label">Fin</span><span className="ath-list-value">{iteration.fechaFin || '—'}</span></li>
                <li className="ath-list-item"><span className="ath-list-label">Estado</span><span className="ath-list-value">{iteration.estado}</span></li>
              </ul>
            </div>
          ) : <div className="ath-alert ath-alert-warn">No hay iteración activa en Monday.</div>}
          <div className="ath-alert ath-alert-info" style={{ marginTop: 12 }}>Para cambiar el gerente de iteración, actualiza el elemento correspondiente en el tablero de Iteraciones en Monday directamente.</div>
        </div></div>
      </div>
    );
  }

  if (isMarbles) {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader title="Evidencia de canicas del humor" subtitle="Adjunta la captura del resultado de la votación externa" />
          <div className="ath-alert ath-alert-info">
            La votación de canicas del humor se realiza en una página externa. Aquí puedes adjuntar opcionalmente la captura del resultado para registrarla en Monday junto a la iteración.
            <br /><strong>La evidencia es completamente opcional.</strong>
          </div>
          {error && <div className="ath-alert ath-alert-error">{error}</div>}
          {success ? (
            <div className="ath-alert ath-alert-ok">✅ Evidencia registrada en Monday. <button className="ath-back" onClick={() => navigate('/')}>Volver al inicio</button></div>
          ) : (
            <div className="ath-form">
              <div className="ath-form-row">
                <label className="ath-label">Captura del resultado (imagen, opcional)</label>
                <div {...getRootProps()} className={`ath-dropzone ${isDragActive ? 'drag-active' : ''}`}>
                  <input {...getInputProps()} />
                  {file ? `✅ ${file.name}` : isDragActive ? 'Suelta la imagen aquí...' : 'Arrastra una imagen o haz clic para seleccionarla (PNG, JPG, GIF, WEBP)'}
                </div>
                {file && <button className="ath-add-btn" onClick={() => setFile(null)} style={{ marginTop: 6 }}>× Quitar imagen</button>}
              </div>
              <div className="ath-form-row"><label className="ath-label">Enlace a la página de resultados (opcional)</label><input className="ath-input" value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://..." /></div>
              <div className="ath-form-row"><label className="ath-label">Comentario (opcional)</label><textarea className="ath-textarea" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Observaciones sobre el resultado de las canicas..." /></div>
              <div className="ath-btn-row">
                <button className="ath-btn ath-btn-primary" onClick={handleSubmitMarbles} disabled={sending || !iteration}>{sending ? 'Guardando...' : 'Guardar en Monday'}</button>
                <button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>Omitir</button>
              </div>
            </div>
          )}
        </div></div>
      </div>
    );
  }

  // Default: iteration info
  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app"><div className="ath-page">
        <PageHeader title="Iteración actual" />
        {iteration ? (
          <div className="ath-card">
            <ul className="ath-list">
              <li className="ath-list-item"><span className="ath-list-label">Nombre</span><span className="ath-list-value">{iteration.nombre}</span></li>
              <li className="ath-list-item"><span className="ath-list-label">Gerente</span><span className="ath-list-value">{iteration.gerenteNombre || 'Sin asignar'}</span></li>
              <li className="ath-list-item"><span className="ath-list-label">Estado</span><span className="ath-list-value">{iteration.estado}</span></li>
            </ul>
          </div>
        ) : <div className="ath-alert ath-alert-warn">No hay iteración activa.</div>}
      </div></div>
    </div>
  );
}
