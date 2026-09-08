import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props { user: AppUser; iteration: ActiveIteration | null; serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean }; }

export default function SlackPreview({ user }: Props) {
  const navigate = useNavigate();
  const { summaryId } = useParams<{ summaryId: string }>();
  const [mondayItemId] = useState(summaryId ?? '');
  const [mondayUrl, setMondayUrl] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [encabezado, setEncabezado] = useState('');
  const [puntosClaves, setPuntosClaves] = useState(['']);
  const [decisiones, setDecisiones] = useState(['']);
  const [acciones, setAcciones] = useState(['']);
  const [bloqueantes, setBloqueantes] = useState(['']);
  const [proximaSesion, setProximaSesion] = useState('Pendiente por definir');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState<boolean | null>(null);

  React.useEffect(() => {
    api.getSlackStatus().then((s) => setSlackEnabled(s.enabled)).catch(() => setSlackEnabled(false));
  }, []);

  const updateList = (setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number, val: string) =>
    setter((prev) => prev.map((v, i) => (i === idx ? val : v)));
  const addItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => setter((p) => [...p, '']);
  const removeItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number) =>
    setter((p) => p.filter((_, i) => i !== idx));

  async function handlePublish() {
    setSending(true); setError(null);
    try {
      await api.publishSlack({
        mondayItemId, sessionName, sessionDate,
        mondayUrl: mondayUrl || `https://monday.com/boards/${mondayItemId}`,
        message: {
          header: encabezado, puntosClaves: puntosClaves.filter(Boolean),
          decisiones: decisiones.filter(Boolean), accionesConResponsable: acciones.filter(Boolean),
          bloqueantesRelevantes: bloqueantes.filter(Boolean), proximaSesion,
        },
      });
      setSuccess(true); setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error publicando en Slack');
    } finally {
      setSending(false);
    }
  }

  if (slackEnabled === false) {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader title="Preparar publicación para Slack" />
          <div className="ath-alert ath-alert-warn">Slack no está configurado en este entorno. Configura SLACK_WEBHOOK_URL o SLACK_BOT_TOKEN en las variables de entorno del backend.</div>
          <button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>Volver al inicio</button>
        </div></div>
      </div>
    );
  }

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app"><div className="ath-page">
        <PageHeader title="Preparar publicación para Slack" subtitle="El registro ya debe estar en Monday antes de publicar" />
        {error && <div className="ath-alert ath-alert-error">{error}</div>}
        {success ? (
          <div className="ath-alert ath-alert-ok">✅ Publicado en Slack exitosamente. Monday ha sido actualizado.<div className="ath-btn-row" style={{ marginTop: 12 }}><button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>Inicio</button></div></div>
        ) : (
          <div>
            <div className="ath-form">
              <div className="ath-form-row"><label className="ath-label">Nombre de la sesión</label><input className="ath-input" value={sessionName} onChange={(e) => setSessionName(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">Fecha</label><input type="date" className="ath-input" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">URL del registro en Monday</label><input className="ath-input" value={mondayUrl} onChange={(e) => setMondayUrl(e.target.value)} placeholder="https://monday.com/boards/..." /></div>
              <div className="ath-form-row"><label className="ath-label">Encabezado del mensaje</label><input className="ath-input" value={encabezado} onChange={(e) => setEncabezado(e.target.value)} /></div>
              <div className="ath-form-row"><label className="ath-label">Puntos clave (máx. 5)</label>
                {puntosClaves.slice(0, 5).map((v, i) => (
                  <div key={i} className="ath-edit-item" style={{ marginBottom: 6 }}>
                    <input className="ath-input" value={v} onChange={(e) => updateList(setPuntosClaves, i, e.target.value)} />
                    <button className="ath-remove-btn" onClick={() => removeItem(setPuntosClaves, i)}>×</button>
                  </div>
                ))}
                {puntosClaves.length < 5 && <button className="ath-add-btn" onClick={() => addItem(setPuntosClaves)}>+ Agregar</button>}
              </div>
              <div className="ath-form-row"><label className="ath-label">Decisiones</label>
                {decisiones.map((v, i) => <div key={i} className="ath-edit-item" style={{ marginBottom: 6 }}><input className="ath-input" value={v} onChange={(e) => updateList(setDecisiones, i, e.target.value)} /><button className="ath-remove-btn" onClick={() => removeItem(setDecisiones, i)}>×</button></div>)}
                <button className="ath-add-btn" onClick={() => addItem(setDecisiones)}>+ Agregar</button>
              </div>
              <div className="ath-form-row"><label className="ath-label">Próxima sesión</label><input className="ath-input" value={proximaSesion} onChange={(e) => setProximaSesion(e.target.value)} /></div>
            </div>
            <div className="ath-alert ath-alert-warn" style={{ marginTop: 16 }}>Esta publicación se enviará al canal de Slack configurado. Revisa el contenido antes de confirmar.</div>
            <div className="ath-btn-row">
              <button className="ath-btn ath-btn-primary" onClick={() => setShowConfirm(true)} disabled={!sessionName.trim()}>Vista previa y confirmar</button>
              <button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>Cancelar</button>
            </div>
          </div>
        )}
        {showConfirm && (
          <div className="ath-modal-overlay"><div className="ath-modal">
            <h3>Confirmar publicación en Slack</h3>
            <p>Se publicará el siguiente mensaje en el canal de Slack configurado:</p>
            <p><strong>{sessionName}</strong> · {sessionDate}</p>
            <p>{encabezado}</p>
            <p style={{ color: 'var(--ath-gray-50)', fontSize: 12 }}>Publicado por: {user.email}</p>
            <div className="ath-btn-row">
              <button className="ath-btn ath-btn-primary" onClick={handlePublish} disabled={sending}>{sending ? 'Publicando...' : 'Sí, publicar en Slack'}</button>
              <button className="ath-btn ath-btn-ghost" onClick={() => setShowConfirm(false)}>Revisar</button>
            </div>
          </div></div>
        )}
      </div></div>
    </div>
  );
}
