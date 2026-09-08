import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props {
  user: AppUser;
  iteration: ActiveIteration | null;
  serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean };
}

type Step = 'input' | 'confirm' | 'processing' | 'result' | 'ica_manual';

const SESSION_TYPES = [
  { value: 'reunion_general', label: 'Reunión general' },
  { value: 'sesion_agile', label: 'Sesión Agile' },
  { value: 'retrospectiva', label: 'Retrospectiva' },
  { value: 'showcase', label: 'Showcase' },
  { value: 'otra', label: 'Otra' },
];

export default function SummaryFlow({ user, iteration }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('input');
  const [sessionName, setSessionName] = useState('');
  const [sessionType, setSessionType] = useState('sesion_agile');
  const [selectedIterationId, setSelectedIterationId] = useState(iteration?.id ?? '');
  const [selectedIterationName, setSelectedIterationName] = useState(iteration?.nombre ?? '');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [teamsLink, setTeamsLink] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [watsonxResult, setWatsonxResult] = useState<Record<string, unknown> | null>(null);
  const [editedResult, setEditedResult] = useState<Record<string, unknown> | null>(null);
  const [icaPrompt, setIcaPrompt] = useState('');
  const [icaJsonInput, setIcaJsonInput] = useState('');
  const [mondayResult, setMondayResult] = useState<{ mondayItemId: string; mondayUrl: string } | null>(null);
  const [sendingToMonday, setSendingToMonday] = useState(false);
  const [showMondayConfirm, setShowMondayConfirm] = useState(false);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setSummaryText((e.target?.result as string) ?? '');
    reader.readAsText(file);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/plain': ['.txt'], 'application/pdf': ['.pdf'] }, maxFiles: 1 });

  async function handleProcess() {
    setError(null);
    if (!summaryText.trim()) { setError('Por favor pega o carga el resumen de Teams.'); return; }
    if (!sessionName.trim()) { setError('Ingresa el nombre de la sesión.'); return; }
    setStep('processing');
    try {
      const result = await api.processSummary({
        sessionType, iterationId: selectedIterationId || 'manual', iterationName: selectedIterationName || 'Sin iteración',
        sessionName, sessionDate, teamsLink: teamsLink || undefined, summaryText,
      });

      setSummaryId(result.summaryId ?? null);

      if (result.watsonxResult) {
        setWatsonxResult(result.watsonxResult as Record<string, unknown>);
        setEditedResult(result.watsonxResult as Record<string, unknown>);
        setStep('result');
      } else if (result.mode === 'manual_ica_available') {
        setIcaPrompt(result.icaPrompt ?? '');
        setError(result.error ?? 'watsonx no está disponible. Usa el modo ICA manual.');
        setStep('ica_manual');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setStep('input');
    }
  }

  async function handleIcaSubmit() {
    setError(null);
    try {
      const result = await api.submitIcaResult(summaryId!, icaJsonInput);
      setWatsonxResult((result as { watsonxResult: Record<string, unknown> }).watsonxResult);
      setEditedResult((result as { watsonxResult: Record<string, unknown> }).watsonxResult);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error validando el JSON de ICA');
    }
  }

  async function handleSendToMonday() {
    setSendingToMonday(true);
    setError(null);
    try {
      const result = await api.sendToMonday({
        summaryId, approvedData: editedResult,
        sessionName, sessionDate, sessionType,
        iterationName: selectedIterationName || 'Sin iteración',
        iterationManagerName: iteration?.gerenteNombre ?? 'Pendiente por definir',
        participants: [], teamsLink: teamsLink || undefined,
      });
      setMondayResult(result);
      setShowMondayConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error enviando a Monday');
    } finally {
      setSendingToMonday(false);
    }
  }

  function updateField(key: string, value: unknown) {
    setEditedResult((prev) => ({ ...(prev ?? {}), [key]: value }));
  }

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app">
        <div className="ath-page">
          <PageHeader title="Procesar resumen de Teams" onBack={() => navigate('/')} />

          {error && <div className="ath-alert ath-alert-error">{error}</div>}

          {/* ── Step: input ── */}
          {step === 'input' && (
            <div className="ath-form">
              <div className="ath-form-row">
                <label className="ath-label">Nombre de la sesión *</label>
                <input className="ath-input" value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="Ej. Sesión Agile Sprint 23" />
              </div>
              <div className="ath-form-row">
                <label className="ath-label">Tipo de sesión *</label>
                <select className="ath-select" value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
                  {SESSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="ath-form-row">
                <label className="ath-label">Iteración</label>
                <input className="ath-input" value={selectedIterationName} onChange={(e) => setSelectedIterationName(e.target.value)} placeholder={iteration?.nombre ?? 'Nombre de la iteración'} />
              </div>
              <div className="ath-form-row">
                <label className="ath-label">Fecha de la sesión *</label>
                <input type="date" className="ath-input" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
              </div>
              <div className="ath-form-row">
                <label className="ath-label">Enlace de la reunión en Teams (referencia)</label>
                <input className="ath-input" value={teamsLink} onChange={(e) => setTeamsLink(e.target.value)} placeholder="https://teams.microsoft.com/..." />
              </div>
              <div className="ath-form-row">
                <label className="ath-label">Resumen generado por Teams *</label>
                <textarea className="ath-textarea" style={{ minHeight: 180 }} value={summaryText} onChange={(e) => setSummaryText(e.target.value)} placeholder="Pega aquí el recap generado por Teams, notas de la reunión o acuerdos..." />
              </div>
              <div className="ath-form-row">
                <label className="ath-label">O carga un archivo (.txt)</label>
                <div {...getRootProps()} className={`ath-dropzone ${isDragActive ? 'drag-active' : ''}`}>
                  <input {...getInputProps()} />
                  {isDragActive ? 'Suelta el archivo aquí...' : 'Arrastra un archivo .txt o haz clic para seleccionarlo'}
                </div>
              </div>
              <div className="ath-btn-row">
                <button className="ath-btn ath-btn-primary" onClick={() => setStep('confirm')} disabled={!summaryText.trim() || !sessionName.trim()}>
                  Vista previa →
                </button>
              </div>
            </div>
          )}

          {/* ── Step: confirm ── */}
          {step === 'confirm' && (
            <div>
              <div className="ath-card">
                <div className="ath-card-title">Confirmar envío a watsonx</div>
                <ul className="ath-list">
                  <li className="ath-list-item"><span className="ath-list-label">Sesión</span><span className="ath-list-value">{sessionName}</span></li>
                  <li className="ath-list-item"><span className="ath-list-label">Tipo</span><span className="ath-list-value">{SESSION_TYPES.find((t) => t.value === sessionType)?.label}</span></li>
                  <li className="ath-list-item"><span className="ath-list-label">Iteración</span><span className="ath-list-value">{selectedIterationName || 'Sin especificar'}</span></li>
                  <li className="ath-list-item"><span className="ath-list-label">Fecha</span><span className="ath-list-value">{sessionDate}</span></li>
                  <li className="ath-list-item"><span className="ath-list-label">Texto (vista previa)</span><span className="ath-list-value">{summaryText.slice(0, 200)}{summaryText.length > 200 ? '...' : ''}</span></li>
                </ul>
              </div>
              <div className="ath-alert ath-alert-info">
                Este contenido será enviado a watsonx.ai (IBM Cloud) para extraer la información estructurada. Ningún dato se enviará a Monday sin tu aprobación posterior.
              </div>
              <div className="ath-btn-row">
                <button className="ath-btn ath-btn-primary" onClick={handleProcess}>Confirmar y procesar con IA</button>
                <button className="ath-btn ath-btn-ghost" onClick={() => setStep('input')}>Volver a editar</button>
              </div>
            </div>
          )}

          {/* ── Step: processing ── */}
          {step === 'processing' && (
            <div className="ath-loading">
              <div className="ath-spinner" />
              <p>Procesando con watsonx.ai...</p>
              <p style={{ fontSize: 12, color: 'var(--ath-gray-50)' }}>Esto puede tardar hasta 30 segundos</p>
            </div>
          )}

          {/* ── Step: ICA manual ── */}
          {step === 'ica_manual' && (
            <div>
              <div className="ath-alert ath-alert-warn">watsonx no está disponible. Puedes procesar el resumen manualmente en IBM Consulting Advantage (ICA).</div>
              <div className="ath-ica-box">
                <h4>Modo ICA manual</h4>
                <p style={{ fontSize: 13, marginBottom: 10, color: 'var(--ath-gray-70)' }}>
                  1. Copia el prompt de abajo → 2. Ve a ica.ibm.com → 3. Pega el prompt → 4. Copia el JSON resultado → 5. Pégalo en el campo inferior
                </p>
                <button className="ath-btn ath-btn-secondary" style={{ marginBottom: 10 }} onClick={() => navigator.clipboard.writeText(icaPrompt)}>Copiar prompt</button>
                <pre>{icaPrompt.slice(0, 500)}...</pre>
              </div>
              <div className="ath-form-row" style={{ marginTop: 16 }}>
                <label className="ath-label">Pega aquí el JSON resultado de ICA</label>
                <textarea className="ath-textarea" style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }} value={icaJsonInput} onChange={(e) => setIcaJsonInput(e.target.value)} placeholder='{"resumen_ejecutivo": "...", ...}' />
              </div>
              <div className="ath-btn-row">
                <button className="ath-btn ath-btn-primary" onClick={handleIcaSubmit} disabled={!icaJsonInput.trim()}>Validar y continuar</button>
                <button className="ath-btn ath-btn-ghost" onClick={() => setStep('input')}>Volver</button>
              </div>
            </div>
          )}

          {/* ── Step: result (two-panel dashboard) ── */}
          {step === 'result' && editedResult && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span className="ath-status ath-status-procesado">Procesado por IA</span>
                <span style={{ fontSize: 12, color: 'var(--ath-gray-50)' }}>Revisa y edita antes de enviar a Monday</span>
              </div>

              <div className="ath-two-panel">
                {/* Original */}
                <div className="ath-panel">
                  <div className="ath-panel-header">📄 Resumen original (Teams) — solo lectura</div>
                  <div className="ath-original-text">{summaryText}</div>
                </div>

                {/* Processed */}
                <div className="ath-panel">
                  <div className="ath-panel-header">🤖 Información extraída por watsonx — editable</div>

                  <div className="ath-form-row">
                    <label className="ath-label">Resumen ejecutivo</label>
                    <textarea className="ath-textarea" style={{ minHeight: 80 }} value={String(editedResult.resumen_ejecutivo ?? '')} onChange={(e) => updateField('resumen_ejecutivo', e.target.value)} />
                  </div>

                  <EditableStringList label="Temas tratados" field="temas_tratados" data={editedResult} onChange={updateField} />
                  <EditableStringList label="Decisiones tomadas" field="decisiones_tomadas" data={editedResult} onChange={updateField} />
                  <EditableStringList label="Acuerdos" field="acuerdos" data={editedResult} onChange={updateField} />
                  <EditableActionList label="Acciones pendientes" field="acciones_pendientes" data={editedResult} onChange={updateField} />
                  <EditableStringList label="Bloqueantes identificados" field="bloqueantes_identificados" data={editedResult} onChange={updateField} isBlockers />
                  <EditableStringList label="Riesgos" field="riesgos" data={editedResult} onChange={updateField} />
                  <EditableStringList label="Próximos pasos" field="proximos_pasos" data={editedResult} onChange={updateField} />

                  <div className="ath-form-row">
                    <label className="ath-label">Info para showcase</label>
                    <input className="ath-input" value={String(editedResult.info_showcase ?? '')} onChange={(e) => updateField('info_showcase', e.target.value)} />
                  </div>
                </div>
              </div>

              {mondayResult ? (
                <div className="ath-alert ath-alert-ok" style={{ marginTop: 16 }}>
                  ✅ Enviado a Monday exitosamente.{' '}
                  <a href={mondayResult.mondayUrl} target="_blank" rel="noreferrer">Ver registro en Monday</a>
                  {' · '}
                  <button className="ath-back" onClick={() => navigate(`/slack/${mondayResult.mondayItemId}`)}>Preparar publicación en Slack →</button>
                </div>
              ) : (
                <div className="ath-btn-row" style={{ marginTop: 16 }}>
                  <button className="ath-btn ath-btn-primary" onClick={() => setShowMondayConfirm(true)}>Aprobar y enviar a Monday</button>
                  <button className="ath-btn ath-btn-ghost" onClick={() => { setStep('input'); setEditedResult(null); setWatsonxResult(null); }}>Rechazar y volver a procesar</button>
                </div>
              )}

              {/* Monday confirmation modal */}
              {showMondayConfirm && (
                <div className="ath-modal-overlay">
                  <div className="ath-modal">
                    <h3>¿Enviar a Monday?</h3>
                    <p>Se creará un registro en el tablero <strong>Sesiones y Resúmenes</strong> con la información revisada.<br />Esta acción no puede deshacerse desde la aplicación.</p>
                    <p><strong>Sesión:</strong> {sessionName}<br /><strong>Fecha:</strong> {sessionDate}<br /><strong>Usuario:</strong> {user.email}</p>
                    <div className="ath-btn-row">
                      <button className="ath-btn ath-btn-primary" onClick={handleSendToMonday} disabled={sendingToMonday}>{sendingToMonday ? 'Enviando...' : 'Sí, enviar a Monday'}</button>
                      <button className="ath-btn ath-btn-ghost" onClick={() => setShowMondayConfirm(false)}>Revisar antes</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────

function EditableStringList({ label, field, data, onChange, isBlockers }: {
  label: string; field: string; data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void; isBlockers?: boolean;
}) {
  const raw = data[field];
  const items: string[] = Array.isArray(raw)
    ? raw.map((i) => (isBlockers && typeof i === 'object' && i !== null ? (i as Record<string, string>).descripcion ?? '' : String(i)))
    : [];

  const update = (idx: number, val: string) => {
    const next = [...items]; next[idx] = val; onChange(field, next);
  };
  const remove = (idx: number) => onChange(field, items.filter((_, i) => i !== idx));
  const add = () => onChange(field, [...items, '']);

  return (
    <div className="ath-form-row">
      <label className="ath-label">{label}</label>
      <div className="ath-edit-list">
        {items.map((item, i) => (
          <div key={i} className="ath-edit-item">
            <input className="ath-input" value={item} onChange={(e) => update(i, e.target.value)} />
            <button className="ath-remove-btn" onClick={() => remove(i)}>×</button>
          </div>
        ))}
        <button className="ath-add-btn" onClick={add}>+ Agregar</button>
      </div>
    </div>
  );
}

interface Action { descripcion: string; responsable: string; fecha_limite: string; estado: string; }

function EditableActionList({ label, field, data, onChange }: {
  label: string; field: string; data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  const raw = data[field];
  const items: Action[] = Array.isArray(raw) ? raw as Action[] : [];
  const update = (i: number, key: keyof Action, val: string) => {
    const next = items.map((a, idx) => idx === i ? { ...a, [key]: val } : a);
    onChange(field, next);
  };
  const remove = (i: number) => onChange(field, items.filter((_, idx) => idx !== i));
  const add = () => onChange(field, [...items, { descripcion: '', responsable: 'Pendiente por definir', fecha_limite: 'Pendiente por definir', estado: 'Pendiente' }]);

  return (
    <div className="ath-form-row">
      <label className="ath-label">{label}</label>
      <table className="ath-action-table">
        <thead><tr><th>Descripción</th><th>Responsable</th><th>Fecha límite</th><th></th></tr></thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={i}>
              <td><input className="ath-input" value={a.descripcion} onChange={(e) => update(i, 'descripcion', e.target.value)} /></td>
              <td><input className="ath-input" value={a.responsable} onChange={(e) => update(i, 'responsable', e.target.value)} /></td>
              <td><input className="ath-input" value={a.fecha_limite} onChange={(e) => update(i, 'fecha_limite', e.target.value)} /></td>
              <td><button className="ath-remove-btn" onClick={() => remove(i)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="ath-add-btn" onClick={add}>+ Agregar acción</button>
    </div>
  );
}
