import React from 'react';
import { Link } from 'react-router-dom';
import { AppUser, ActiveIteration } from '../App';

interface Props {
  user: AppUser;
  iteration: ActiveIteration | null;
  serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean };
}

// ── Professional SVG icons (IBM Carbon-style) ─────────────────────
const Icons = {
  Summary: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <rect x="4" y="4" width="24" height="28" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="9" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2"/>
      <line x1="9" y1="17" x2="23" y2="17" stroke="currentColor" strokeWidth="2"/>
      <line x1="9" y1="22" x2="17" y2="22" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  History: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2"/>
      <polyline points="16,8 16,17 21,17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  ),
  Blocker: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2"/>
      <line x1="7.5" y1="7.5" x2="24.5" y2="24.5" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Dashboard: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <rect x="3" y="3" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="2"/>
      <rect x="18" y="3" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="2"/>
      <rect x="3" y="18" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="2"/>
      <rect x="18" y="18" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Iteration: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <rect x="4" y="5" width="24" height="22" rx="1" stroke="currentColor" strokeWidth="2"/>
      <line x1="4" y1="12" x2="28" y2="12" stroke="currentColor" strokeWidth="2"/>
      <line x1="11" y1="2" x2="11" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="21" y1="2" x2="21" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="9" y1="18" x2="14" y2="18" stroke="currentColor" strokeWidth="2"/>
      <line x1="9" y1="22" x2="14" y2="22" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Marbles: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <circle cx="10" cy="20" r="6" stroke="currentColor" strokeWidth="2"/>
      <circle cx="22" cy="20" r="6" stroke="currentColor" strokeWidth="2"/>
      <circle cx="16" cy="10" r="6" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Showcase: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <polygon points="16,4 20,13 30,13 22,19 25,28 16,22 7,28 10,19 2,13 12,13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
    </svg>
  ),
  Retro: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <path d="M4 24 C4 24 8 10 16 10 C24 10 28 24 28 24" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M4 8 C7 6 11 5 16 5 C21 5 25 6 28 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <line x1="16" y1="10" x2="16" y2="28" stroke="currentColor" strokeWidth="2"/>
      <line x1="4" y1="24" x2="28" y2="24" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Manager: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <rect x="2" y="18" width="6" height="10" stroke="currentColor" strokeWidth="2"/>
      <rect x="13" y="12" width="6" height="16" stroke="currentColor" strokeWidth="2"/>
      <rect x="24" y="6" width="6" height="22" stroke="currentColor" strokeWidth="2"/>
      <polyline points="5,18 5,8 16,8 16,12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
    </svg>
  ),
  Slack: () => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
      <path d="M12 5 C12 3.3 10.7 2 9 2 C7.3 2 6 3.3 6 5 L6 13 C6 14.7 7.3 16 9 16 C10.7 16 12 14.7 12 13 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M27 9 C28.7 9 30 7.7 30 6 C30 4.3 28.7 3 27 3 C25.3 3 24 4.3 24 6 L24 9 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M6 23 C4.3 23 3 24.3 3 26 C3 27.7 4.3 29 6 29 C7.7 29 9 27.7 9 26 L9 23 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M26 20 C26 21.7 27.3 23 29 23 C30.7 23 32 21.7 32 20 C32 18.3 30.7 17 29 17 L21 17 C19.3 17 18 18.3 18 20 C18 21.7 19.3 23 21 23 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  ),
};

const MENU_ITEMS = [
  { to: '/summary',             Icon: Icons.Summary,   label: 'Meeting\nSummary',        color: '#0f62fe' },
  { to: '/sessions',            Icon: Icons.History,   label: 'Session\nHistory',         color: '#0043ce' },
  { to: '/blocker',             Icon: Icons.Blocker,   label: 'Register\nBlocker',        color: '#da1e28' },
  { to: '/dashboard',           Icon: Icons.Dashboard, label: 'Active\nBlockers',         color: '#393939' },
  { to: '/iteration-manager',   Icon: Icons.Iteration, label: 'Manage\nIteration',        color: '#0f62fe' },
  { to: '/iteration?marbles=1', Icon: Icons.Marbles,   label: 'Mood\nMarbles',            color: '#6929c4' },
  { to: '/showcase',            Icon: Icons.Showcase,  label: 'Showcase',                 color: '#198038' },
  { to: '/retro',               Icon: Icons.Retro,     label: 'Retrospective',            color: '#9f1853' },
  { to: '/manager',             Icon: Icons.Manager,   label: 'Manager\nDashboard',       color: '#005d5d' },
  { to: '/slack/latest',        Icon: Icons.Slack,     label: 'Slack\nPublication',       color: '#4e2b79' },
];

// ── IBM logo SVG ──────────────────────────────────────────────────
const IBMLogo = () => (
  <svg width="40" height="16" viewBox="0 0 80 32" fill="white" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="4" width="12" height="4"/><rect x="0" y="12" width="12" height="4"/><rect x="0" y="20" width="12" height="4"/>
    <rect x="16" y="4" width="4" height="4"/><rect x="16" y="12" width="4" height="4"/><rect x="16" y="20" width="4" height="4"/>
    <rect x="24" y="4" width="4" height="4"/><rect x="24" y="12" width="4" height="4"/><rect x="24" y="20" width="4" height="4"/>
    <rect x="20" y="0" width="4" height="4"/><rect x="20" y="24" width="4" height="4"/>
    <rect x="32" y="4" width="12" height="20"/><rect x="40" y="0" width="4" height="4"/><rect x="40" y="24" width="4" height="4"/>
    <rect x="48" y="4" width="4" height="8"/><rect x="48" y="20" width="4" height="8"/>
    <rect x="52" y="0" width="4" height="4"/><rect x="52" y="24" width="4" height="4"/>
    <rect x="56" y="4" width="4" height="8"/><rect x="56" y="20" width="4" height="8"/>
    <rect x="60" y="12" width="4" height="8"/>
    <rect x="64" y="4" width="12" height="4"/><rect x="64" y="20" width="12" height="4"/>
    <rect x="64" y="12" width="4" height="4"/><rect x="72" y="12" width="4" height="4"/>
    <rect x="68" y="8" width="4" height="4"/><rect x="68" y="16" width="4" height="4"/>
  </svg>
);

export default function MainMenu({ user, iteration, serviceStatus }: Props) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: '"IBM Plex Sans", -apple-system, "Segoe UI", sans-serif' }}>

      {/* ── Top navigation bar ── */}
      <header style={{
        background: '#161616',
        color: 'white',
        padding: '0 24px',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 6px rgba(0,0,0,.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <IBMLogo />
          <div style={{ width: 1, height: 20, background: '#525252' }} />
          <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: '.01em', color: '#f4f4f4' }}>
            Agile Methodology
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Service status pills */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'Monday', ok: serviceStatus.monday },
              { label: 'watsonx', ok: serviceStatus.watsonx },
            ].map(s => (
              <span key={s.label} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: s.ok ? '#42be65' : '#ff8389',
                background: s.ok ? 'rgba(66,190,101,.15)' : 'rgba(255,131,137,.15)',
                padding: '2px 8px', borderRadius: 10,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.ok ? '#42be65' : '#ff8389', display: 'inline-block' }} />
                {s.label}
              </span>
            ))}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#f4f4f4' }}>{user.name}</div>
            <div style={{ fontSize: 11, color: '#8d8d8d' }}>{user.email}</div>
          </div>
        </div>
      </header>

      {/* ── Hero band ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f62fe 0%, #0043ce 100%)',
        color: 'white',
        padding: '32px 24px 28px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .75, marginBottom: 6 }}>
            IBM · Agile Practice Hub
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-.01em', marginBottom: 4 }}>
            Agile Methodology
          </h1>
          <p style={{ fontSize: 13, opacity: .8 }}>{today}</p>

          {/* Iteration card inside hero */}
          <div style={{
            marginTop: 20,
            background: 'rgba(255,255,255,.12)',
            border: '1px solid rgba(255,255,255,.2)',
            borderRadius: 4,
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            backdropFilter: 'blur(4px)',
            maxWidth: 700,
          }}>
            {iteration ? (
              <>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .7, marginBottom: 3 }}>Active Iteration</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{iteration.nombre}</div>
                  {iteration.fechaInicio && (
                    <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>
                      {iteration.fechaInicio} → {iteration.fechaFin || '—'}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .7, marginBottom: 3 }}>Iteration Manager</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{iteration.gerenteNombre || 'Unassigned'}</div>
                  {iteration.gerenteEmail && (
                    <div style={{ fontSize: 11, opacity: .65, marginTop: 2 }}>{iteration.gerenteEmail}</div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, opacity: .8 }}>
                ⚠ No active iteration found. Create one in Monday with status "Activo".
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 60px' }}>

        <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6f6f', marginBottom: 16, fontWeight: 600 }}>
          Quick Actions
        </div>

        {/* ── Menu grid ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: 12,
        }}>
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                background: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: 4,
                padding: '20px 18px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 14,
                cursor: 'pointer',
                transition: 'box-shadow .15s, border-color .15s, transform .1s',
                height: '100%',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.12)';
                (e.currentTarget as HTMLDivElement).style.borderColor = item.color;
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#e0e0e0';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
              }}
              >
                {/* Icon container */}
                <div style={{
                  width: 44,
                  height: 44,
                  background: `${item.color}12`,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: item.color,
                  flexShrink: 0,
                }}>
                  <item.Icon />
                </div>
                <div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#161616',
                    lineHeight: 1.3,
                    whiteSpace: 'pre-line',
                  }}>
                    {item.label}
                  </div>
                </div>
                {/* Bottom accent bar */}
                <div style={{ marginTop: 'auto', width: '100%', height: 2, background: `${item.color}30`, borderRadius: 1 }} />
              </div>
            </Link>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <span style={{ fontSize: 11, color: '#8d8d8d' }}>
            IBM · Agile Methodology Hub · Powered by watsonx.ai + Monday.com
          </span>
          {!user.isInsideTeams && (
            <span style={{ fontSize: 11, color: '#f1c21b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f1c21b', display: 'inline-block' }} />
              Web mode · Outside Microsoft Teams
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
