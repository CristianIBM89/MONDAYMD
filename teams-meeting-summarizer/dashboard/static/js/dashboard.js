/* ================================================================
   Teams Meeting Summarizer — Dashboard JS
   Flujo: Teams .vtt → IBM watsonx.ai → Dashboard → Monday.com
   ================================================================ */

const API = "";
let allMeetings = [];
let currentMeetingId = null;
let currentTab = "resumen";
let editingBlockerId = null;  // null = modo agregar, número = modo editar

// ── NAVEGACIÓN ────────────────────────────────────────────────────

document.querySelectorAll(".nav-item").forEach(l =>
  l.addEventListener("click", e => { e.preventDefault(); navigate(l.dataset.view); })
);

function navigate(view) {
  document.querySelectorAll(".nav-item").forEach(l => l.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add("active");
  document.getElementById(`view-${view}`)?.classList.add("active");
  const titles = { dashboard:"Dashboard", upload:"Subir Reunión", meetings:"Reuniones", "action-items":"Action Items" };
  document.getElementById("page-title").textContent = titles[view] || "";
  if (view === "meetings")      renderMeetingsView();
  if (view === "action-items")  renderActionItemsView();
}

// ── FETCH ─────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchMeetings(status = "") {
  try { return await api(`/api/meetings/${status ? `?status=${status}` : ""}`); }
  catch { return []; }
}

// ── DASHBOARD ─────────────────────────────────────────────────────

async function loadDashboard() {
  allMeetings = await fetchMeetings();
  set("kpi-total",     allMeetings.length);
  set("kpi-summarized", allMeetings.filter(m => m.status === "summarized").length);
  set("kpi-monday",    allMeetings.filter(m => m.status === "synced_monday").length);

  // Contar bloqueantes abiertos (necesita full detail — usamos los que ya cargamos)
  let openBlockers = 0;
  for (const m of allMeetings) {
    if (m.blockers) openBlockers += m.blockers.filter(b => b.status === "open").length;
  }
  set("kpi-blockers", openBlockers || "—");

  const container = document.getElementById("recent-meetings-list");
  const recent = allMeetings.slice(0, 8);
  container.innerHTML = recent.length
    ? recent.map(meetingCardHTML).join("")
    : `<div class="empty-state">Aún no hay reuniones.<br>Ve a <b>Subir Reunión</b> para comenzar.</div>`;
  bindCardClicks(container);
}

function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── UPLOAD ────────────────────────────────────────────────────────

const dropzone  = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => showFileName(fileInput.files[0]));
dropzone.addEventListener("dragover",  e => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", e => {
  e.preventDefault(); dropzone.classList.remove("dragover");
  const f = e.dataTransfer.files[0];
  if (f) { const dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files; showFileName(f); }
});

function showFileName(file) {
  if (!file) return;
  document.getElementById("drop-label").classList.add("hidden");
  const lbl = document.getElementById("drop-filename");
  lbl.textContent = `📄 ${file.name}`;
  lbl.classList.remove("hidden");
}

document.getElementById("upload-form").addEventListener("submit", async e => {
  e.preventDefault();
  const file = fileInput.files[0];
  if (!file) { toast("Selecciona un archivo .vtt primero", "error"); return; }

  const btn    = document.getElementById("btn-upload");
  const prog   = document.getElementById("upload-progress");
  const fill   = document.getElementById("progress-fill");
  const label  = document.getElementById("progress-label");

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Enviando a IBM watsonx.ai…`;
  prog.classList.remove("hidden");

  let pct = 5;
  const iv = setInterval(() => {
    pct = Math.min(pct + Math.random() * 3, 88);
    fill.style.width = pct + "%";
    if (pct > 25) label.textContent = "Procesando con IBM Granite…";
    if (pct > 55) label.textContent = "Extrayendo action items y bloqueantes…";
    if (pct > 78) label.textContent = "Finalizando resumen…";
  }, 900);

  const fd = new FormData(e.target);
  fd.set("file", file);

  try {
    const data = await api("/api/meetings/upload", { method: "POST", body: fd });
    clearInterval(iv);
    fill.style.width = "100%";
    label.textContent = "¡Listo!";
    toast("✅ Resumen generado con IBM watsonx.ai", "success");

    setTimeout(() => {
      prog.classList.add("hidden"); fill.style.width = "0%";
      btn.disabled = false; btn.innerHTML = "🤖 Generar Resumen con IBM watsonx.ai";
      e.target.reset();
      document.getElementById("drop-label").classList.remove("hidden");
      document.getElementById("drop-filename").classList.add("hidden");
    }, 1200);

    allMeetings = await fetchMeetings();
    // Abre el modal de la reunión creada, en la pestaña de bloqueantes
    // para que el usuario los revise/edite antes de enviar a Monday.com
    setTimeout(() => {
      navigate("meetings");
      openMeetingModal(data.meeting.id, "blockers");
    }, 1500);

  } catch (err) {
    clearInterval(iv);
    prog.classList.add("hidden"); fill.style.width = "0%";
    btn.disabled = false; btn.innerHTML = "🤖 Generar Resumen con IBM watsonx.ai";
    toast("❌ " + err.message, "error");
  }
});

// ── VISTA REUNIONES ───────────────────────────────────────────────

function renderMeetingsView() { renderMeetings(allMeetings); }

function renderMeetings(list) {
  const c = document.getElementById("meetings-list");
  c.innerHTML = list.length
    ? list.map(meetingCardHTML).join("")
    : `<div class="empty-state">No hay reuniones que coincidan.</div>`;
  bindCardClicks(c);
}

document.getElementById("filter-status").addEventListener("change", applyFilters);
document.getElementById("filter-search").addEventListener("input",  applyFilters);
function applyFilters() {
  const s = document.getElementById("filter-status").value;
  const q = document.getElementById("filter-search").value.toLowerCase();
  renderMeetings(allMeetings.filter(m =>
    (!s || m.status === s) && (!q || m.subject?.toLowerCase().includes(q))
  ));
}

// ── VISTA ACTION ITEMS ────────────────────────────────────────────

function renderActionItemsView() {
  const c = document.getElementById("action-items-list");
  const meetings = allMeetings.filter(m => m.action_items?.length);
  if (!meetings.length) { c.innerHTML = `<div class="empty-state">Aún no hay action items.</div>`; return; }
  c.innerHTML = meetings.map(m => `
    <div class="action-group">
      <div class="action-group-header">${esc(m.subject)} <span style="font-weight:400;color:var(--muted);margin-left:6px">${fmtDate(m.start_time)}</span></div>
      ${m.action_items.map(item => `
        <div class="action-item">
          <div class="action-check"></div>
          <div class="action-text">${esc(item.tarea || "")}${item.responsable ? `<div class="action-responsible">👤 ${esc(item.responsable)}</div>` : ""}</div>
          ${item.fecha_limite ? `<div class="action-deadline">📅 ${esc(item.fecha_limite)}</div>` : ""}
        </div>`).join("")}
    </div>`).join("");
}

// ── MEETING CARD ──────────────────────────────────────────────────

function meetingCardHTML(m) {
  const openB = (m.blockers || []).filter(b => b.status === "open").length;
  return `
    <div class="meeting-card" data-id="${m.id}">
      <div class="meeting-info">
        <div class="meeting-subject">${esc(m.subject)}</div>
        <div class="meeting-meta">${m.organizer_name ? `👤 ${esc(m.organizer_name)} · ` : ""}📅 ${fmtDate(m.start_time)}${m.action_items?.length ? ` · ✅ ${m.action_items.length} tasks` : ""}</div>
        ${openB ? `<div class="meeting-tags"><span class="badge badge-blocker">🚧 ${openB} bloqueante${openB>1?"s":""}</span></div>` : ""}
      </div>
      ${statusBadge(m.status)}
      ${m.monday_board_url ? `<a href="${m.monday_board_url}" target="_blank" class="badge badge-monday" style="text-decoration:none" onclick="event.stopPropagation()">📊 Monday</a>` : ""}
    </div>`;
}

function statusBadge(s) {
  const map = { pending:["badge-pending","⏳ Pendiente"], processing:["badge-processing","⚙️ Procesando"],
    summarized:["badge-summarized","✅ Resumido"], synced_monday:["badge-monday","📊 Monday.com"], error:["badge-error","❌ Error"] };
  const [cls, lbl] = map[s] || ["badge-pending", s];
  return `<span class="badge ${cls}">${lbl}</span>`;
}

function bindCardClicks(c) {
  c.querySelectorAll(".meeting-card").forEach(card =>
    card.addEventListener("click", () => openMeetingModal(Number(card.dataset.id)))
  );
}

// ── MODAL PRINCIPAL ───────────────────────────────────────────────

async function openMeetingModal(id, tab = "resumen") {
  currentMeetingId = id;
  currentTab = tab;
  const overlay = document.getElementById("modal-overlay");
  overlay.classList.remove("hidden");
  document.getElementById("modal-body").innerHTML =
    `<div style="text-align:center;padding:32px"><span class="spinner"></span></div>`;
  ["modal-btn-csv","modal-btn-json","modal-btn-reprocess","modal-btn-monday","modal-btn-delete"].forEach(hide);

  try {
    const m = await api(`/api/meetings/${id}`);
    document.getElementById("modal-title").textContent = m.subject;
    document.getElementById("modal-meta").textContent =
      `${m.organizer_name ? m.organizer_name + " · " : ""}${fmtDate(m.start_time)}`;

    // Badges de pestañas
    const openB = (m.blockers || []).filter(b => b.status === "open").length;
    document.getElementById("tab-blockers-count").textContent  = openB || "";
    document.getElementById("tab-nextsteps-count").textContent = (m.next_steps || []).filter(ns => !ns.done).length || "";

    // Activar pestaña correcta
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add("active");
    renderModalTab(m, tab);

    if (m.status === "summarized" || m.status === "synced_monday") {
      show("modal-btn-csv");
      show("modal-btn-json");
      document.getElementById("modal-btn-csv").href  = `/api/meetings/${id}/export/csv`;
      document.getElementById("modal-btn-json").href = `/api/meetings/${id}/export/json`;
      show("modal-btn-reprocess");
      if (m.status !== "synced_monday") show("modal-btn-monday");
    }
    show("modal-btn-delete");

  } catch (err) {
    document.getElementById("modal-body").innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
  }
}

function renderModalTab(m, tab) {
  const body = document.getElementById("modal-body");
  if (tab === "resumen")     body.innerHTML = renderResumen(m);
  else if (tab === "blockers")    body.innerHTML = renderBlockers(m);
  else if (tab === "next-steps")  body.innerHTML = renderNextSteps(m);
}

// Cambio de pestaña dentro del modal
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!currentMeetingId) return;
    currentTab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const m = await api(`/api/meetings/${currentMeetingId}`);
    renderModalTab(m, currentTab);
  });
});

// ── RENDER PESTAÑA: RESUMEN ───────────────────────────────────────

function renderResumen(m) {
  const s = m.summary || {};
  if (!s.resumen_ejecutivo) {
    if (m.status === "processing") return `<div class="empty-state"><span class="spinner"></span><br><br>IBM watsonx.ai está procesando…</div>`;
    return `<div class="empty-state">Sin resumen aún. Usa ↺ Re-procesar.</div>`;
  }
  let html = `<div class="summary-section"><h3>Resumen ejecutivo</h3><p class="summary-text">${esc(s.resumen_ejecutivo)}</p></div>`;
  if (s.puntos_clave?.length)
    html += `<div class="summary-section"><h3>Puntos clave</h3><ul class="summary-list">${s.puntos_clave.map(p=>`<li>${esc(p)}</li>`).join("")}</ul></div>`;
  if (s.decisiones?.length)
    html += `<div class="summary-section"><h3>Decisiones</h3><ul class="summary-list">${s.decisiones.map(d=>`<li>${esc(d)}</li>`).join("")}</ul></div>`;
  if (m.action_items?.length) {
    html += `<div class="summary-section"><h3>Action items (${m.action_items.length})</h3>`;
    m.action_items.forEach(item => {
      html += `<div class="action-item" style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div class="action-check"></div>
        <div class="action-text">${esc(item.tarea||"")}${item.responsable?`<div class="action-responsible">👤 ${esc(item.responsable)}</div>`:""}</div>
        ${item.fecha_limite?`<div class="action-deadline">📅 ${esc(item.fecha_limite)}</div>`:""}
      </div>`;
    });
    html += `</div>`;
  }
  return html;
}

// ── RENDER PESTAÑA: BLOQUEANTES ───────────────────────────────────

function renderBlockers(m) {
  const list = m.blockers || [];
  if (!list.length)
    return `<div class="empty-state">Sin bloqueantes detectados.<br>Puedes abrirlos desde el botón <b>🚧 Bloqueantes</b> en la tarjeta.</div>`;
  return list.map(b => `
    <div class="blocker-row" data-bid="${b.id}">
      <div class="row-text">
        ${esc(b.description)}
        ${b.owner ? `<div class="row-sub">👤 ${esc(b.owner)}</div>` : ""}
        ${b.from_ai ? `<span class="status-pill pill-open" style="font-size:10px;margin-left:4px">IA</span>` : ""}
      </div>
      <span class="status-pill pill-${b.status}">${pillLabel(b.status)}</span>
      <button class="btn-icon" onclick="openBlockersModal(${currentMeetingId})" title="Gestionar bloqueantes">✏️</button>
    </div>`).join("") +
    `<div style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="openBlockersModal(${currentMeetingId})">＋ Agregar / Editar bloqueantes</button></div>`;
}

// ── RENDER PESTAÑA: PRÓXIMOS PASOS ────────────────────────────────

function renderNextSteps(m) {
  const list = m.next_steps || [];
  if (!list.length)
    return `<div class="empty-state">Sin próximos pasos definidos.<br><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openNextStepsModal(${currentMeetingId})">＋ Agregar próximos pasos</button></div>`;
  return list.map(ns => `
    <div class="ns-row" data-nsid="${ns.id}">
      <div class="action-check${ns.done ? " done" : ""}" style="cursor:pointer" onclick="toggleNextStep(${currentMeetingId}, ${ns.id}, ${!ns.done})"></div>
      <div class="row-text" style="${ns.done ? "text-decoration:line-through;color:var(--muted)" : ""}">
        ${esc(ns.description)}
        ${ns.owner ? `<div class="row-sub">👤 ${esc(ns.owner)}</div>` : ""}
      </div>
      ${ns.due_date ? `<div class="action-deadline">📅 ${esc(ns.due_date)}</div>` : ""}
      ${ns.from_ai ? `<span class="status-pill" style="background:#f1f3f5;color:var(--muted);font-size:10px">IA</span>` : ""}
    </div>`).join("") +
    `<div style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="openNextStepsModal(${currentMeetingId})">＋ Agregar / Editar próximos pasos</button></div>`;
}

async function toggleNextStep(meetingId, nsId, done) {
  try {
    await api(`/api/meetings/${meetingId}/next-steps/${nsId}`, {
      method: "PATCH",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ done }),
    });
    const m = await api(`/api/meetings/${meetingId}`);
    renderModalTab(m, "next-steps");
  } catch(e) { toast("❌ " + e.message, "error"); }
}

// ── MODAL BLOQUEANTES ─────────────────────────────────────────────

async function openBlockersModal(meetingId) {
  currentMeetingId = meetingId;
  editingBlockerId = null;
  const overlay = document.getElementById("blockers-overlay");
  overlay.classList.remove("hidden");
  const m = allMeetings.find(x => x.id === meetingId);
  document.getElementById("blockers-meeting-name").textContent = m?.subject || "";
  resetBlockerForm();
  await refreshBlockersList(meetingId);
}

async function refreshBlockersList(meetingId) {
  const blockers = await api(`/api/meetings/${meetingId}/blockers`);
  const c = document.getElementById("blockers-list");
  c.innerHTML = blockers.length
    ? blockers.map(b => `
      <div class="blocker-row">
        <div class="row-text">${esc(b.description)}${b.owner?`<div class="row-sub">👤 ${esc(b.owner)}</div>`:""}</div>
        <span class="status-pill pill-${b.status}">${pillLabel(b.status)}</span>
        <button class="btn-icon" onclick="startEditBlocker(${b.id},'${esc(b.description)}','${esc(b.owner)}','${b.status}')" title="Editar">✏️</button>
        <button class="btn-icon" onclick="deleteBlocker(${b.id})" title="Eliminar" style="color:var(--error)">🗑</button>
      </div>`).join("")
    : `<div class="empty-state" style="padding:16px">No hay bloqueantes. Añade uno abajo.</div>`;
}

function startEditBlocker(id, desc, owner, status) {
  editingBlockerId = id;
  document.getElementById("blocker-desc").value   = desc;
  document.getElementById("blocker-owner").value  = owner;
  document.getElementById("blocker-status").value = status;
  document.getElementById("blocker-save-btn").textContent = "✔ Guardar cambios";
  document.getElementById("blocker-desc").focus();
}

function resetBlockerForm() {
  editingBlockerId = null;
  document.getElementById("blocker-desc").value   = "";
  document.getElementById("blocker-owner").value  = "";
  document.getElementById("blocker-status").value = "open";
  document.getElementById("blocker-save-btn").textContent = "＋ Agregar";
}

document.getElementById("blocker-save-btn").addEventListener("click", async () => {
  const desc   = document.getElementById("blocker-desc").value.trim();
  const owner  = document.getElementById("blocker-owner").value.trim();
  const status = document.getElementById("blocker-status").value;
  if (!desc) { toast("Escribe la descripción del bloqueante", "error"); return; }

  try {
    if (editingBlockerId) {
      await api(`/api/meetings/${currentMeetingId}/blockers/${editingBlockerId}`, {
        method: "PATCH",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ description: desc, owner, status }),
      });
      toast("Bloqueante actualizado ✅", "success");
    } else {
      await api(`/api/meetings/${currentMeetingId}/blockers`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ description: desc, owner, status }),
      });
      toast("Bloqueante agregado ✅", "success");
    }
    resetBlockerForm();
    await refreshBlockersList(currentMeetingId);
  } catch(e) { toast("❌ " + e.message, "error"); }
});

async function deleteBlocker(bid) {
  if (!confirm("¿Eliminar este bloqueante?")) return;
  try {
    await api(`/api/meetings/${currentMeetingId}/blockers/${bid}`, { method: "DELETE" });
    await refreshBlockersList(currentMeetingId);
  } catch(e) { toast("❌ " + e.message, "error"); }
}

document.getElementById("blockers-close").addEventListener("click", closeBlockers);
document.getElementById("blockers-done").addEventListener("click", async () => {
  closeBlockers();
  // Refresca el modal principal si está abierto
  if (document.getElementById("modal-overlay").classList.contains("hidden") === false) {
    const m = await api(`/api/meetings/${currentMeetingId}`);
    renderModalTab(m, currentTab);
    document.getElementById("tab-blockers-count").textContent =
      (m.blockers||[]).filter(b=>b.status==="open").length || "";
  }
  allMeetings = await fetchMeetings();
});
document.getElementById("blockers-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("blockers-overlay")) closeBlockers();
});
function closeBlockers() { document.getElementById("blockers-overlay").classList.add("hidden"); }

// ── MODAL PRÓXIMOS PASOS ──────────────────────────────────────────

async function openNextStepsModal(meetingId) {
  currentMeetingId = meetingId;
  const overlay = document.getElementById("nextsteps-overlay");
  overlay.classList.remove("hidden");
  const m = allMeetings.find(x => x.id === meetingId);
  document.getElementById("nextsteps-meeting-name").textContent = m?.subject || "";
  resetNsForm();
  await refreshNextStepsList(meetingId);
}

async function refreshNextStepsList(meetingId) {
  const steps = await api(`/api/meetings/${meetingId}/next-steps`);
  const c = document.getElementById("nextsteps-list");
  c.innerHTML = steps.length
    ? steps.map(ns => `
      <div class="ns-row">
        <div class="action-check${ns.done?" done":""}" style="cursor:pointer" onclick="toggleNextStep(${meetingId},${ns.id},${!ns.done})"></div>
        <div class="row-text" style="${ns.done?"text-decoration:line-through;color:var(--muted)":""}">
          ${esc(ns.description)}${ns.owner?`<div class="row-sub">👤 ${esc(ns.owner)}</div>`:""}
        </div>
        ${ns.due_date?`<div class="action-deadline">📅 ${esc(ns.due_date)}</div>`:""}
        <button class="btn-icon" onclick="deleteNextStep(${ns.id})" title="Eliminar" style="color:var(--error)">🗑</button>
      </div>`).join("")
    : `<div class="empty-state" style="padding:16px">Sin próximos pasos. Añade uno abajo.</div>`;
}

function resetNsForm() {
  document.getElementById("ns-desc").value  = "";
  document.getElementById("ns-owner").value = "";
  document.getElementById("ns-due").value   = "";
}

document.getElementById("ns-save-btn").addEventListener("click", async () => {
  const desc  = document.getElementById("ns-desc").value.trim();
  const owner = document.getElementById("ns-owner").value.trim();
  const due   = document.getElementById("ns-due").value.trim();
  if (!desc) { toast("Escribe la descripción del próximo paso", "error"); return; }
  try {
    await api(`/api/meetings/${currentMeetingId}/next-steps`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ description: desc, owner, due_date: due }),
    });
    toast("Próximo paso agregado ✅", "success");
    resetNsForm();
    await refreshNextStepsList(currentMeetingId);
  } catch(e) { toast("❌ " + e.message, "error"); }
});

async function deleteNextStep(nsId) {
  if (!confirm("¿Eliminar este próximo paso?")) return;
  try {
    await api(`/api/meetings/${currentMeetingId}/next-steps/${nsId}`, { method: "DELETE" });
    await refreshNextStepsList(currentMeetingId);
  } catch(e) { toast("❌ " + e.message, "error"); }
}

document.getElementById("nextsteps-close").addEventListener("click", closeNextSteps);
document.getElementById("nextsteps-done").addEventListener("click", async () => {
  closeNextSteps();
  if (!document.getElementById("modal-overlay").classList.contains("hidden")) {
    const m = await api(`/api/meetings/${currentMeetingId}`);
    renderModalTab(m, currentTab);
    document.getElementById("tab-nextsteps-count").textContent =
      (m.next_steps||[]).filter(ns=>!ns.done).length || "";
  }
  allMeetings = await fetchMeetings();
});
document.getElementById("nextsteps-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("nextsteps-overlay")) closeNextSteps();
});
function closeNextSteps() { document.getElementById("nextsteps-overlay").classList.add("hidden"); }

// ── ACCIONES MODAL PRINCIPAL ──────────────────────────────────────

document.getElementById("modal-btn-reprocess").addEventListener("click", async () => {
  const btn = document.getElementById("modal-btn-reprocess");
  btn.textContent = "Procesando…"; btn.disabled = true;
  try {
    await api(`/api/meetings/${currentMeetingId}/reprocess`, { method: "POST" });
    toast("✅ Resumen regenerado", "success");
    allMeetings = await fetchMeetings();
    await openMeetingModal(currentMeetingId, "resumen");
  } catch(e) { toast("❌ " + e.message, "error"); }
  finally { btn.textContent = "↺ Re-procesar"; btn.disabled = false; }
});

document.getElementById("modal-btn-monday").addEventListener("click", async () => {
  const btn = document.getElementById("modal-btn-monday");
  btn.textContent = "Creando tablero…"; btn.disabled = true;
  try {
    const data = await api(`/api/meetings/${currentMeetingId}/sync-monday`, { method: "POST" });
    toast("📊 Tablero creado en Monday.com ✅", "success");
    if (data.board_url) window.open(data.board_url, "_blank");
    allMeetings = await fetchMeetings();
    await openMeetingModal(currentMeetingId, "resumen");
  } catch(e) {
    toast("❌ " + e.message, "error");
    btn.textContent = "📊 Enviar a Monday.com"; btn.disabled = false;
  }
});

document.getElementById("modal-btn-delete").addEventListener("click", async () => {
  if (!confirm("¿Eliminar esta reunión?")) return;
  try {
    await api(`/api/meetings/${currentMeetingId}`, { method: "DELETE" });
    closeModal(); toast("Reunión eliminada", "success");
    allMeetings = await fetchMeetings();
    await loadDashboard();
  } catch(e) { toast("❌ " + e.message, "error"); }
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-btn-cancel").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
});
function closeModal() { document.getElementById("modal-overlay").classList.add("hidden"); currentMeetingId = null; }

// ── REFRESH ───────────────────────────────────────────────────────

document.getElementById("btn-refresh").addEventListener("click", async () => {
  allMeetings = await fetchMeetings();
  const active = document.querySelector(".view.active")?.id;
  if      (active === "view-dashboard")    await loadDashboard();
  else if (active === "view-meetings")     renderMeetingsView();
  else if (active === "view-action-items") renderActionItemsView();
  toast("Datos actualizados");
});

// ── HEALTH ────────────────────────────────────────────────────────

async function checkHealth() {
  try { await fetch(`${API}/health`); }
  catch {
    document.querySelector(".dot").className = "dot dot-err";
    document.getElementById("api-status").innerHTML = `<span class="dot dot-err"></span>&nbsp;App offline`;
  }
}

// ── UTILS ─────────────────────────────────────────────────────────

function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function pillLabel(s) {
  return { open:"🔴 Abierto", in_progress:"🟡 En progreso", resolved:"🟢 Resuelto" }[s] || s;
}
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }
function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function toast(msg, type="") {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = `toast${type?" "+type:""}`;
  t.classList.remove("hidden");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 3500);
}

// ── INIT ──────────────────────────────────────────────────────────

window.openBlockersModal  = openBlockersModal;
window.openNextStepsModal = openNextStepsModal;
window.toggleNextStep     = toggleNextStep;
window.deleteBlocker      = deleteBlocker;
window.deleteNextStep     = deleteNextStep;
window.startEditBlocker   = startEditBlocker;

(async () => { await checkHealth(); await loadDashboard(); })();
