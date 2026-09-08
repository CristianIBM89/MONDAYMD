import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props { user: AppUser; iteration: ActiveIteration | null; serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean }; }

interface BlockerRecord {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  impacto: string;
  urgencia: string;
  iteracion: string;
  proceso: string;
  reportadoPor: string;
  responsable: string;
  fechaReporte: string;
  fechaSolucion: string;
  escalamiento: boolean;
  comentarios: string;
  estado: string;
}

interface SessionRecord {
  id: string;
  nombre: string;
  fecha: string;
  tipo: string;
  iteracion: string;
  gerente: string;
  estado: string;
  requiereAtencionGerencial: boolean;
  decisiones: string;
  acciones: string;
}

const IMPACTO_COLOR: Record<string, string> = {
  'Stuck': '#c62828',
  'Working on it': '#e65100',
};

export default function ManagerDashboard({ iteration }: Props) {
  const navigate = useNavigate();
  const [blockers, setBlockers] = useState<BlockerRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBlocker, setExpandedBlocker] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getBlockersList().then((r) => setBlockers((r.blockers ?? []) as BlockerRecord[])),
      api.getSessions().then((r) => setSessions((r.sessions ?? []) as SessionRecord[])),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openBlockers    = blockers.filter((b) => b.estado !== 'Done');
  const criticalBlockers = blockers.filter((b) => b.impacto === 'Stuck' || b.escalamiento);
  const gerenciaRequired = blockers.filter((b) => b.escalamiento);
  const recentSessions  = sessions.slice(0, 5);
  const gerenciaSessions = sessions.filter((s) => s.requiereAtencionGerencial);

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app"><div className="ath-page">
        <PageHeader title="Panel del gerente" subtitle="Vista ejecutiva — datos en tiempo real desde Monday" />

        {/* Iteration summary card */}
        {iteration && (
          <div className="ath-card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Iteración activa</div>
                <strong style={{ fontSize: 15 }}>{iteration.nombre}</strong>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Gerente de iteración</div>
                <strong>{iteration.gerenteNombre || 'Sin asignar'}</strong>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Periodo</div>
                <strong>{iteration.fechaInicio} → {iteration.fechaFin}</strong>
              </div>
            </div>
          </div>
        )}

        {loading && <div className="ath-loading"><div className="ath-spinner" /><p>Cargando desde Monday...</p></div>}
        {error && <div className="ath-alert ath-alert-error">{error}</div>}

        {!loading && !error && (
          <div>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
              <KpiCard label="Bloqueantes abiertos" value={openBlockers.length} color={openBlockers.length > 0 ? '#e65100' : '#2e7d32'} />
              <KpiCard label="Críticos / escalados" value={criticalBlockers.length} color={criticalBlockers.length > 0 ? '#c62828' : '#2e7d32'} />
              <KpiCard label="Requieren gerencia" value={gerenciaRequired.length} color={gerenciaRequired.length > 0 ? '#c62828' : '#2e7d32'} />
              <KpiCard label="Sesiones registradas" value={sessions.length} color="var(--ath-blue)" />
              <KpiCard label="Alertas en sesiones" value={gerenciaSessions.length} color={gerenciaSessions.length > 0 ? '#e65100' : '#2e7d32'} />
            </div>

            {/* Bloqueantes abiertos */}
            <div className="ath-card" style={{ marginBottom: 12 }}>
              <div className="ath-card-title" style={{ marginBottom: 10 }}>
                🚧 Bloqueantes abiertos ({openBlockers.length})
              </div>
              {openBlockers.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ath-gray-50)' }}>Sin bloqueantes abiertos. ✓</p>
              ) : (
                openBlockers.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid var(--ath-gray-10)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedBlocker(expandedBlocker === b.id ? null : b.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13 }}>{b.nombre}</strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {b.escalamiento && (
                          <span style={{ fontSize: 11, background: '#ffebee', color: '#c62828', padding: '1px 7px', borderRadius: 10 }}>
                            ⚠ Escalar
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            background: '#f5f5f5',
                            color: IMPACTO_COLOR[b.impacto] ?? '#555',
                            padding: '1px 7px',
                            borderRadius: 10,
                          }}
                        >
                          {b.impacto || 'impacto ?'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ath-gray-50)', marginTop: 2 }}>
                      {b.iteracion && <span>{b.iteracion} · </span>}
                      {b.reportadoPor && <span>Reportado por {b.reportadoPor}</span>}
                      {b.responsable && <span> · Responsable: {b.responsable}</span>}
                      {b.fechaReporte && <span> · {b.fechaReporte}</span>}
                    </div>
                    {expandedBlocker === b.id && (
                      <div style={{ marginTop: 8, fontSize: 13, color: '#333', background: 'var(--ath-surface)', padding: 10, borderRadius: 6 }}>
                        {b.descripcion && <p style={{ margin: '0 0 6px' }}>{b.descripcion}</p>}
                        {b.comentarios && <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--ath-gray-50)' }}>{b.comentarios}</p>}
                        {b.fechaSolucion && <p style={{ margin: '6px 0 0', fontSize: 12 }}>Fecha esperada: {b.fechaSolucion}</p>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Sesiones recientes */}
            <div className="ath-card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="ath-card-title">📋 Últimas sesiones ({recentSessions.length})</div>
                <button className="ath-btn ath-btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate('/sessions')}>
                  Ver todas →
                </button>
              </div>
              {recentSessions.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ath-gray-50)' }}>Sin sesiones registradas todavía.</p>
              ) : (
                recentSessions.map((s) => (
                  <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--ath-gray-10)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 13 }}>{s.nombre}</strong>
                      {s.requiereAtencionGerencial && (
                        <span style={{ fontSize: 11, background: '#ffebee', color: '#c62828', padding: '1px 7px', borderRadius: 10 }}>
                          ⚠ Gerencia
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ath-gray-50)', marginTop: 2 }}>
                      {s.fecha} · {s.iteracion || '—'} · {s.gerente || '—'}
                    </div>
                    {s.decisiones && (
                      <div style={{ fontSize: 12, marginTop: 4, color: '#333' }}>
                        <span style={{ color: 'var(--ath-gray-50)' }}>Decisiones:</span> {s.decisiones.split('\n')[0]}
                        {s.decisiones.split('\n').length > 1 && <span style={{ color: 'var(--ath-gray-50)' }}> +{s.decisiones.split('\n').length - 1} más</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Alertas de sesiones */}
            {gerenciaSessions.length > 0 && (
              <div className="ath-card" style={{ borderLeft: '3px solid #c62828' }}>
                <div className="ath-card-title" style={{ color: '#c62828', marginBottom: 8 }}>
                  ⚠ Sesiones que requieren atención gerencial ({gerenciaSessions.length})
                </div>
                {gerenciaSessions.map((s) => (
                  <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--ath-gray-10)', fontSize: 13 }}>
                    <strong>{s.nombre}</strong>
                    <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--ath-gray-50)' }}>{s.fecha} · {s.iteracion}</span>
                    {s.acciones && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>Acciones: {s.acciones.split('\n')[0]}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="ath-back" onClick={() => navigate('/')}>← Volver al menú</button>
        </div>
      </div></div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="ath-card" style={{ textAlign: 'center', padding: '14px 8px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ath-gray-50)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
