import React from 'react';
import { Link } from 'react-router-dom';
import { AppUser, ActiveIteration } from '../App';

interface Props {
  user: AppUser;
  iteration: ActiveIteration | null;
  serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean };
}

const MENU_ITEMS = [
  { to: '/summary',  icon: '📄', label: 'Procesar resumen\nde Teams' },
  { to: '/sessions', icon: '🗂️', label: 'Consultar\nresúmenes' },
  { to: '/blocker',  icon: '🚧', label: 'Registrar\nbloqueante' },
  { to: '/dashboard',icon: '🖥️', label: 'Bloqueantes\nactivos' },
  { to: '/iteration',icon: '🗓️', label: 'Iteración\nactual' },
  { to: '/iteration?marbles=1', icon: '🔵', label: 'Evidencia\nde canicas' },
  { to: '/showcase', icon: '🎯', label: 'Showcase' },
  { to: '/retro',    icon: '💬', label: 'Retrospectiva' },
  { to: '/manager',  icon: '📊', label: 'Panel del\ngerente' },
  { to: '/slack/latest', icon: '📢', label: 'Preparar\npublicación Slack' },
];

export default function MainMenu({ user, iteration, serviceStatus }: Props) {
  return (
    <div>
      <header className="ath-header">
        <h1>Agile Team Hub</h1>
        <div className="ath-header-meta">
          <div>{user.name}</div>
          <div style={{ fontSize: 11 }}>{user.email}</div>
        </div>
      </header>

      <div className="ath-app">
        <div className="ath-page">
          {/* Iteration info */}
          {iteration ? (
            <div className="ath-card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ath-gray-50)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Iteración activa</div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{iteration.nombre}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ath-gray-50)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Gerente de iteración</div>
                  <div style={{ fontWeight: 600 }}>{iteration.gerenteNombre || 'Sin asignar'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="ath-alert ath-alert-warn">
              No hay iteración activa en Monday. Crea un elemento con estado "Activo" en el tablero de iteraciones.
            </div>
          )}

          {/* Service status */}
          <div className="ath-status-bar">
            <span className={`ath-status-dot ${serviceStatus.monday ? 'ok' : 'err'}`}>Monday</span>
            <span className={`ath-status-dot ${serviceStatus.watsonx ? 'ok' : 'warn'}`}>watsonx</span>
            <span className={`ath-status-dot ${serviceStatus.slack ? 'ok' : 'warn'}`}>Slack</span>
            {!user.isInsideTeams && (
              <span className="ath-status-dot warn">Fuera de Teams (modo web)</span>
            )}
          </div>

          {/* Action grid */}
          <div className="ath-menu-grid">
            {MENU_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} className="ath-menu-card">
                <span className="ath-icon">{item.icon}</span>
                <span className="ath-label" style={{ whiteSpace: 'pre-line' }}>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
