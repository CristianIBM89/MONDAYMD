import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props {
  user: AppUser;
  iteration: ActiveIteration | null;
  serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean };
}

interface SessionRecord {
  id: string;
  nombre: string;
  fecha: string;
  tipo: string;
  iteracion: string;
  gerente: string;
  participantes: string;
  resumenEjecutivo: string;
  decisiones: string;
  acuerdos: string;
  acciones: string;
  bloqueantes: string;
  riesgos: string;
  proximosPasos: string;
  exportadoPor: string;
  fechaExportacion: string;
  publicadoEnSlack: boolean;
  requiereAtencionGerencial: boolean;
  estado: string;
}

const TIPO_LABEL: Record<string, string> = {
  sesion_agile: 'Sesión Agile',
  reunion_general: 'Reunión general',
  retrospectiva: 'Retrospectiva',
  showcase: 'Showcase',
  otra: 'Otra',
};

function Field({ label, value }: { label: string; value?: string }) {
  if (!value || value.trim() === '' || value === 'Pendiente por definir') return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{value}</div>
    </div>
  );
}

function SessionCard({ session }: { session: SessionRecord }) {
  const [expanded, setExpanded] = useState(false);

  const tipoLabel = TIPO_LABEL[session.tipo] ?? session.tipo ?? '—';
  const hasAlert = session.requiereAtencionGerencial;

  return (
    <div
      className="ath-card"
      style={{ marginBottom: 12, borderLeft: hasAlert ? '3px solid #e53935' : '3px solid var(--ath-blue)' }}
    >
      {/* Header row — always visible */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', gap: 12 }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{session.nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--ath-gray-50)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>{session.fecha || '—'}</span>
            <span>{tipoLabel}</span>
            {session.iteracion && <span>{session.iteracion}</span>}
            {session.gerente && <span>Gerente: {session.gerente}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {hasAlert && (
            <span style={{ fontSize: 11, background: '#ffebee', color: '#c62828', padding: '2px 8px', borderRadius: 10 }}>
              ⚠ Gerencia
            </span>
          )}
          {session.publicadoEnSlack && (
            <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 10 }}>
              Slack ✓
            </span>
          )}
          <span style={{ fontSize: 18, color: 'var(--ath-blue)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            ▾
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--ath-gray-10)', paddingTop: 16 }}>
          <Field label="Resumen ejecutivo" value={session.resumenEjecutivo} />
          <Field label="Participantes" value={session.participantes} />
          <Field label="Decisiones tomadas" value={session.decisiones} />
          <Field label="Acuerdos" value={session.acuerdos} />
          <Field label="Acciones pendientes" value={session.acciones} />
          <Field label="Bloqueantes identificados" value={session.bloqueantes} />
          <Field label="Riesgos" value={session.riesgos} />
          <Field label="Próximos pasos" value={session.proximosPasos} />
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ath-gray-10)', fontSize: 12, color: 'var(--ath-gray-50)' }}>
            Exportado por {session.exportadoPor || '—'} · {session.fechaExportacion || '—'}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionsHistory({ iteration }: Props) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');

  useEffect(() => {
    api.getSessions()
      .then((r) => setSessions((r.sessions ?? []) as SessionRecord[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = sessions.filter((s) => {
    const matchSearch =
      !search ||
      s.nombre.toLowerCase().includes(search.toLowerCase()) ||
      s.iteracion.toLowerCase().includes(search.toLowerCase()) ||
      s.resumenEjecutivo.toLowerCase().includes(search.toLowerCase());
    const matchTipo = !filterTipo || s.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app">
        <div className="ath-page">
          <PageHeader
            title="Resúmenes de sesiones"
            subtitle="Registros guardados en Monday — consulta y detalle"
          />

          {/* Iteration context */}
          {iteration && (
            <div className="ath-card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Iteración activa</div>
                  <strong>{iteration.nombre}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Gerente</div>
                  <strong>{iteration.gerenteNombre || 'Sin asignar'}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              className="ath-input"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="Buscar por nombre, iteración o resumen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="ath-select"
              style={{ minWidth: 160 }}
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              <option value="sesion_agile">Sesión Agile</option>
              <option value="reunion_general">Reunión general</option>
              <option value="retrospectiva">Retrospectiva</option>
              <option value="showcase">Showcase</option>
              <option value="otra">Otra</option>
            </select>
            <button className="ath-btn ath-btn-secondary" onClick={() => { setSearch(''); setFilterTipo(''); }}>
              Limpiar
            </button>
          </div>

          {loading && (
            <div className="ath-loading"><div className="ath-spinner" /><p>Cargando sesiones desde Monday...</p></div>
          )}

          {error && (
            <div className="ath-alert ath-alert-error">{error}</div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="ath-alert ath-alert-info">
              {sessions.length === 0
                ? 'No hay sesiones registradas en Monday todavía. Procesa y aprueba un resumen para que aparezca aquí.'
                : 'Ninguna sesión coincide con los filtros aplicados.'}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--ath-gray-50)', marginBottom: 10 }}>
                {filtered.length} sesión{filtered.length !== 1 ? 'es' : ''} · Haz clic en cualquiera para ver el detalle
              </div>
              {filtered.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button className="ath-back" onClick={() => navigate('/')}>← Volver al menú</button>
          </div>
        </div>
      </div>
    </div>
  );
}
