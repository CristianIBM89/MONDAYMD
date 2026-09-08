import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props { user: AppUser; iteration: ActiveIteration | null; serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean }; }

export default function Dashboard({ iteration }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<{ sessions?: unknown[]; status?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDashboard()
      .then((d) => setData(d as { sessions?: unknown[] }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <header className="ath-header"><h1>Agile Team Hub</h1></header>
      <div className="ath-app">
        <div className="ath-page">
          <PageHeader title="Dashboard" subtitle="Consulta el estado actual desde Monday" />
          {iteration && (
            <div className="ath-card">
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Iteración</div><strong>{iteration.nombre}</strong></div>
                <div><div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Gerente</div><strong>{iteration.gerenteNombre || 'Sin asignar'}</strong></div>
                <div><div style={{ fontSize: 11, color: 'var(--ath-gray-50)', textTransform: 'uppercase' }}>Estado</div><strong>{iteration.estado}</strong></div>
              </div>
            </div>
          )}
          {loading && <div className="ath-loading"><div className="ath-spinner" /><p>Cargando datos de Monday...</p></div>}
          {error && <div className="ath-alert ath-alert-error">{error}</div>}
          {!loading && !error && (
            <div className="ath-alert ath-alert-info">
              Los datos del dashboard se cargan directamente desde Monday. Para el panel gerencial completo ve a <button className="ath-back" onClick={() => navigate('/manager')}>Panel del gerente →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
