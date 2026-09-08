import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { AppUser, ActiveIteration } from '../App';
import PageHeader from '../components/PageHeader';

interface Props {
  user: AppUser;
  iteration: ActiveIteration | null;
  serviceStatus: { monday: boolean; watsonx: boolean; slack: boolean };
}

interface IterationRow {
  id: string;
  nombre: string;
  gerenteNombre: string;
  gerenteEmail: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}

type Mode = 'list' | 'create' | 'edit' | 'close-confirm';

export default function IterationManager({ user, iteration }: Props) {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('list');
  const [iterations, setIterations] = useState<IterationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Selected iteration for edit / close
  const [selected, setSelected] = useState<IterationRow | null>(null);

  // Create form
  const [form, setForm] = useState({
    nombre: '',
    gerenteNombre: user.name,
    gerenteEmail: user.email,
    fechaInicio: '',
    fechaFin: '',
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    gerenteNombre: '',
    gerenteEmail: '',
    fechaInicio: '',
    fechaFin: '',
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // ── Load all iterations ──────────────────────────────────────────
  async function loadIterations() {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await api.getAllIterations();
      setIterations((res.iterations ?? []) as IterationRow[]);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Error cargando iteraciones');
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { loadIterations(); }, []);

  // ── Helpers ──────────────────────────────────────────────────────
  function resetSave() { setSaveError(null); setSaveOk(false); }

  function openEdit(iter: IterationRow) {
    setSelected(iter);
    setEditForm({
      gerenteNombre: iter.gerenteNombre,
      gerenteEmail: iter.gerenteEmail,
      fechaInicio: iter.fechaInicio,
      fechaFin: iter.fechaFin,
    });
    resetSave();
    setMode('edit');
  }

  function openClose(iter: IterationRow) {
    setSelected(iter);
    resetSave();
    setMode('close-confirm');
  }

  // ── Create ────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.gerenteNombre.trim() || !form.gerenteEmail.trim() || !form.fechaInicio || !form.fechaFin) {
      setSaveError('Completa todos los campos obligatorios.');
      return;
    }
    setSaving(true); setSaveError(null); setSaveOk(false);
    try {
      await api.createIteration(form);
      setSaveOk(true);
      setForm({ nombre: '', gerenteNombre: user.name, gerenteEmail: user.email, fechaInicio: '', fechaFin: '' });
      await loadIterations();
      setTimeout(() => setMode('list'), 1500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error creando iteración');
    } finally {
      setSaving(false);
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true); setSaveError(null); setSaveOk(false);
    try {
      await api.updateIteration(selected.id, editForm);
      setSaveOk(true);
      await loadIterations();
      setTimeout(() => setMode('list'), 1500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error actualizando iteración');
    } finally {
      setSaving(false);
    }
  }

  // ── Close ─────────────────────────────────────────────────────────
  async function handleClose() {
    if (!selected) return;
    setSaving(true); setSaveError(null); setSaveOk(false);
    try {
      await api.closeIteration(selected.id);
      setSaveOk(true);
      await loadIterations();
      setTimeout(() => setMode('list'), 1500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error cerrando iteración');
    } finally {
      setSaving(false);
    }
  }

  // ── Render: LIST ─────────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader
            title="Gestión de iteraciones"
            subtitle="Crea, edita o cierra iteraciones en el tablero de Monday"
          />

          {iteration && (
            <div className="ath-card" style={{ marginBottom: 16, borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: 12, color: '#57606a', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Iteración activa ahora</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{iteration.nombre}</div>
              <div style={{ fontSize: 13, color: '#57606a', marginTop: 2 }}>
                Gerente: <strong>{iteration.gerenteNombre || 'Sin asignar'}</strong>
                {iteration.fechaInicio && ` · ${iteration.fechaInicio}`}
                {iteration.fechaFin && ` → ${iteration.fechaFin}`}
              </div>
            </div>
          )}

          <div className="ath-btn-row" style={{ marginBottom: 16 }}>
            <button
              className="ath-btn ath-btn-primary"
              onClick={() => { resetSave(); setMode('create'); }}
            >
              + Nueva iteración
            </button>
            <button className="ath-btn ath-btn-ghost" onClick={loadIterations}>↺ Actualizar</button>
            <button className="ath-btn ath-btn-ghost" onClick={() => navigate('/')}>← Inicio</button>
          </div>

          {listError && <div className="ath-alert ath-alert-error">{listError}</div>}

          {loadingList ? (
            <div className="ath-loading" style={{ minHeight: 80 }}><div className="ath-spinner" /><p>Cargando iteraciones...</p></div>
          ) : iterations.length === 0 ? (
            <div className="ath-alert ath-alert-warn">No hay iteraciones registradas en Monday. Crea la primera usando el botón de arriba.</div>
          ) : (
            <div className="ath-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f7f8fa', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={TH}>Nombre</th>
                    <th style={TH}>Gerente</th>
                    <th style={TH}>Inicio</th>
                    <th style={TH}>Fin</th>
                    <th style={TH}>Estado</th>
                    <th style={TH}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {iterations.map((iter, idx) => {
                    const esActiva = iter.estado?.toLowerCase() === 'activo' || iter.estado?.toLowerCase() === 'active';
                    return (
                      <tr
                        key={iter.id}
                        style={{
                          background: esActiva ? '#eff6ff' : (idx % 2 === 0 ? '#fff' : '#fafafa'),
                          borderBottom: '1px solid #e5e7eb',
                        }}
                      >
                        <td style={TD}>
                          <span style={{ fontWeight: esActiva ? 700 : 400 }}>{iter.nombre}</span>
                          {esActiva && <span style={BADGE_ACTIVO}>ACTIVA</span>}
                        </td>
                        <td style={TD}>
                          <div>{iter.gerenteNombre || <em style={{ color: '#888' }}>Sin asignar</em>}</div>
                          {iter.gerenteEmail && <div style={{ fontSize: 11, color: '#888' }}>{iter.gerenteEmail}</div>}
                        </td>
                        <td style={TD}>{iter.fechaInicio || '—'}</td>
                        <td style={TD}>{iter.fechaFin || '—'}</td>
                        <td style={TD}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                            background: esActiva ? '#dbeafe' : '#f3f4f6',
                            color: esActiva ? '#1d4ed8' : '#555',
                          }}>
                            {iter.estado || 'Sin estado'}
                          </span>
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <button
                            className="ath-btn ath-btn-ghost"
                            style={{ padding: '3px 10px', fontSize: 12, marginRight: 4 }}
                            onClick={() => openEdit(iter)}
                          >
                            Editar
                          </button>
                          {esActiva && (
                            <button
                              className="ath-btn"
                              style={{ padding: '3px 10px', fontSize: 12, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                              onClick={() => openClose(iter)}
                            >
                              Cerrar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div></div>
      </div>
    );
  }

  // ── Render: CREATE ────────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader title="Nueva iteración" subtitle="Crea una nueva iteración y asigna el gerente del mes" />
          {saveError && <div className="ath-alert ath-alert-error">{saveError}</div>}
          {saveOk && <div className="ath-alert ath-alert-ok">✅ Iteración creada en Monday. Volviendo...</div>}
          <form onSubmit={handleCreate} className="ath-form">
            <div className="ath-form-row">
              <label className="ath-label">Nombre de la iteración *</label>
              <input className="ath-input" placeholder="Sprint 2 — Octubre 2026" value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div className="ath-form-row">
              <label className="ath-label">Gerente de iteración (nombre) *</label>
              <input className="ath-input" placeholder="Nombre completo" value={form.gerenteNombre}
                onChange={(e) => setForm({ ...form, gerenteNombre: e.target.value })} required />
            </div>
            <div className="ath-form-row">
              <label className="ath-label">Correo del gerente *</label>
              <input className="ath-input" type="email" placeholder="nombre@ibm.com" value={form.gerenteEmail}
                onChange={(e) => setForm({ ...form, gerenteEmail: e.target.value })} required />
            </div>
            <div className="ath-form-row">
              <label className="ath-label">Fecha de inicio *</label>
              <input className="ath-input" type="date" value={form.fechaInicio}
                onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} required />
            </div>
            <div className="ath-form-row">
              <label className="ath-label">Fecha de fin *</label>
              <input className="ath-input" type="date" value={form.fechaFin}
                onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} required />
            </div>
            <div className="ath-btn-row">
              <button className="ath-btn ath-btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creando en Monday...' : '✔ Crear iteración'}
              </button>
              <button className="ath-btn ath-btn-ghost" type="button" onClick={() => setMode('list')}>Cancelar</button>
            </div>
          </form>
        </div></div>
      </div>
    );
  }

  // ── Render: EDIT ──────────────────────────────────────────────────
  if (mode === 'edit' && selected) {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader title={`Editar: ${selected.nombre}`} subtitle="Modifica el gerente o las fechas de la iteración" />
          {saveError && <div className="ath-alert ath-alert-error">{saveError}</div>}
          {saveOk && <div className="ath-alert ath-alert-ok">✅ Iteración actualizada. Volviendo...</div>}
          <form onSubmit={handleEdit} className="ath-form">
            <div className="ath-form-row">
              <label className="ath-label">Gerente de iteración (nombre)</label>
              <input className="ath-input" value={editForm.gerenteNombre}
                onChange={(e) => setEditForm({ ...editForm, gerenteNombre: e.target.value })} />
            </div>
            <div className="ath-form-row">
              <label className="ath-label">Correo del gerente</label>
              <input className="ath-input" type="email" value={editForm.gerenteEmail}
                onChange={(e) => setEditForm({ ...editForm, gerenteEmail: e.target.value })} />
            </div>
            <div className="ath-form-row">
              <label className="ath-label">Fecha de inicio</label>
              <input className="ath-input" type="date" value={editForm.fechaInicio}
                onChange={(e) => setEditForm({ ...editForm, fechaInicio: e.target.value })} />
            </div>
            <div className="ath-form-row">
              <label className="ath-label">Fecha de fin</label>
              <input className="ath-input" type="date" value={editForm.fechaFin}
                onChange={(e) => setEditForm({ ...editForm, fechaFin: e.target.value })} />
            </div>
            <div className="ath-btn-row">
              <button className="ath-btn ath-btn-primary" type="submit" disabled={saving}>
                {saving ? 'Guardando...' : '✔ Guardar cambios'}
              </button>
              <button className="ath-btn ath-btn-ghost" type="button" onClick={() => setMode('list')}>Cancelar</button>
            </div>
          </form>
        </div></div>
      </div>
    );
  }

  // ── Render: CLOSE CONFIRM ─────────────────────────────────────────
  if (mode === 'close-confirm' && selected) {
    return (
      <div>
        <header className="ath-header"><h1>Agile Team Hub</h1></header>
        <div className="ath-app"><div className="ath-page">
          <PageHeader title="Cerrar iteración" />
          {saveError && <div className="ath-alert ath-alert-error">{saveError}</div>}
          {saveOk && <div className="ath-alert ath-alert-ok">✅ Iteración cerrada en Monday. Volviendo...</div>}
          <div className="ath-card">
            <p style={{ marginBottom: 12 }}>
              ¿Confirmas que deseas <strong>cerrar</strong> la iteración <strong>"{selected.nombre}"</strong>?
            </p>
            <p style={{ fontSize: 13, color: '#57606a', marginBottom: 20 }}>
              El estado cambiará a "Cerrado" en Monday. Esta acción puede revertirse manualmente desde Monday si es necesario.
            </p>
            <div className="ath-btn-row">
              <button
                className="ath-btn"
                style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                onClick={handleClose}
                disabled={saving}
              >
                {saving ? 'Cerrando...' : '⛔ Confirmar cierre'}
              </button>
              <button className="ath-btn ath-btn-ghost" onClick={() => setMode('list')}>Cancelar</button>
            </div>
          </div>
        </div></div>
      </div>
    );
  }

  return null;
}

// ── Inline styles ─────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  color: '#57606a',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
};

const TD: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
};

const BADGE_ACTIVO: React.CSSProperties = {
  marginLeft: 6,
  padding: '1px 6px',
  borderRadius: 8,
  fontSize: 10,
  fontWeight: 700,
  background: '#3b82f6',
  color: '#fff',
  verticalAlign: 'middle',
};
