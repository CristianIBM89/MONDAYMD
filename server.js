// server.js
// Servidor local del Dashboard MD Workspace
// Uso: node server.js
// Accede en: http://localhost:3000

require("dotenv").config();
const https  = require("https");
const http   = require("http");
const PORT   = process.env.PORT || 3000;

// Token de Monday.com — configurar en .env (local) o en Railway Environment
const MONDAY_TOKEN = (process.env.MONDAY_TOKEN || process.env.MONDAY_KEY || process.env.MONDAY_API_KEY || "").trim();
if (!MONDAY_TOKEN) {
  console.error("WARN: Variable de entorno MONDAY_TOKEN no definida. El dashboard mostrará error al cargar datos.");
}
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ── Slack cron: martes y jueves 5pm Bogotá ─────────────────────────────────
// Solo activo si SLACK_WEBHOOK_URL está definido
if (process.env.SLACK_WEBHOOK_URL) {
  const { publishToSlack } = require("./slack-bot");

  // Cron manual sin dependencias externas — verifica cada minuto
  setInterval(() => {
    const now  = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const day  = now.getDay();   // 2 = martes, 4 = jueves
    const hour = now.getHours();
    const min  = now.getMinutes();
    if ((day === 2 || day === 4) && hour === 17 && min === 0) {
      console.log("[Slack] Ejecutando publicación programada...");
      publishToSlack().catch(err => console.error("[Slack] Error:", err.message));
    }
  }, 60 * 1000);

  console.log("  Slack  : activo — publica mar/jue 5pm Bogotá");
} else {
  console.log("  Slack  : no configurado (agrega SLACK_WEBHOOK_URL para activar)");
}

// ── Caché ──────────────────────────────────────────────────────────────────
let cache = { html: null, builtAt: 0 };

// ── Monday API ─────────────────────────────────────────────────────────────
function mondayQuery(query) {
  const token = (process.env.MONDAY_TOKEN || process.env.MONDAY_KEY || process.env.MONDAY_API_KEY || MONDAY_TOKEN || "").trim();
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: "api.monday.com", path: "/v2", method: "POST",
      headers: {
        "Authorization": token, "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body), "API-Version": "2024-01"
      }
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(d);
          if (json.errors) return reject(new Error(json.errors.map(e => e.message).join(", ")));
          resolve(json.data);
        } catch(e) { reject(e); }
      });
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function getCurrentWeekGroup(groups) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dated = groups
    .filter(g => /^\d{4}\/\d{2}\/\d{2}$/.test(g.title))
    .map(g => { const [y,m,d] = g.title.split("/").map(Number); return { ...g, date: new Date(y,m-1,d) }; })
    .sort((a,b) => a.date - b.date);
  let best = dated[0];
  for (const g of dated) { if (g.date <= today) best = g; else break; }
  return best;
}

// ── Fetch MD-Time ──────────────────────────────────────────────────────────
async function fetchMDTime() {
  const COL_IDS = ["status_1_mkn1az5h","files_mkn19bev","status_1_mkn1ntp1","files_1_mkn1q1sz","color_mknvzcn3","file_mknvemd2"];
  const COL_DEFS = [
    { key: "status_1_mkn1az5h", label: "Time",         type: "status" },
    { key: "files_mkn19bev",    label: "TIME/Pantalla", type: "file"   },
    { key: "status_1_mkn1ntp1", label: "HR Zone",       type: "status" },
    { key: "files_1_mkn1q1sz",  label: "HRZ/Pantalla",  type: "file"   },
    { key: "color_mknvzcn3",    label: "My Hours",       type: "status" },
    { key: "file_mknvemd2",     label: "MyHours/Pant.",  type: "file"   },
  ];
  const d0 = await mondayQuery(`{ boards(ids:[8443645710]) { groups { id title } } }`);
  const allGroups = d0.boards[0].groups;
  const recentGroups = allGroups.slice(-8);
  const colStr = COL_IDS.map(c => `"${c}"`).join(",");
  const weeksData = {};
  for (const g of recentGroups) {
    const d = await mondayQuery(`{ boards(ids:[8443645710]) { groups(ids:["${g.id}"]) {
      title items_page(limit:200) { items { name column_values(ids:[${colStr}]) { id text } } }
    } } }`);
    const items = d.boards[0].groups[0].items_page.items;
    weeksData[g.id] = {
      title: g.title,
      items: items.map(item => { const cv={}; item.column_values.forEach(c=>{cv[c.id]=c.text||"";}); return {name:item.name,cv}; })
    };
  }
  const cur = getCurrentWeekGroup(allGroups);
  return { colDefs: COL_DEFS, weeksData, currentGroupId: cur ? cur.id : recentGroups[recentGroups.length-1].id };
}

// ── Fetch Request OFF ──────────────────────────────────────────────────────
async function fetchRequestOff() {
  const COL_IDS = ["people_mkn8wds0","date4","status_mkn825jf","status_1_mkn5yhzg","cronograma_mkn6bx9b","n_meros_mkn6cwvj","file_mm1ht7j7","text_mkn8yf9q"];
  const colStr = COL_IDS.map(c => `"${c}"`).join(",");
  const TARGET = [{ id:"topics", label:"Solicitudes" }, { id:"new_group_mkn8gp5j", label:"Aprobadas" }];
  const groupsData = {};
  for (const tg of TARGET) {
    const d = await mondayQuery(`{ boards(ids:[8488385355]) { groups(ids:["${tg.id}"]) {
      title items_page(limit:200) { items { name column_values(ids:[${colStr}]) { id text } } }
    } } }`);
    const items = d.boards[0].groups[0].items_page.items;
    groupsData[tg.id] = {
      title: tg.label,
      items: items.map(item => { const cv={}; item.column_values.forEach(c=>{cv[c.id]=c.text||"";}); return {name:item.name,cv}; })
    };
  }
  return { groupsData, defaultGroup: "topics" };
}

// ── Build HTML ─────────────────────────────────────────────────────────────
function buildHtml(mdTime, requestOff, updatedAt, nextRefresh) {

  const curWeek = mdTime.weeksData[mdTime.currentGroupId];
  const mdAlerts = [];
  if (curWeek) {
    curWeek.items.forEach(row => {
      const missing = mdTime.colDefs
        .filter(c => c.type !== "people" && (!row.cv[c.key] || !row.cv[c.key].trim()))
        .map(c => c.label);
      if (missing.length) mdAlerts.push({ name: row.name, missing });
    });
  }

  const solData = requestOff.groupsData["topics"];
  const offAlerts = [];
  if (solData) {
    solData.items.forEach(row => {
      if (!row.cv["file_mm1ht7j7"] || !row.cv["file_mm1ht7j7"].trim())
        offAlerts.push({ name: row.name, missing: ["Soporte"] });
    });
  }

  const totalAlerts = mdAlerts.length + offAlerts.length;

  const weekOpts = Object.entries(mdTime.weeksData).reverse().map(([gid,gd]) =>
    `<option value="${gid}"${gid===mdTime.currentGroupId?" selected":""}>${esc(gd.title)}</option>`
  ).join("\n");

  const groupOpts = Object.entries(requestOff.groupsData).map(([gid,gd]) =>
    `<option value="${gid}"${gid===requestOff.defaultGroup?" selected":""}>${esc(gd.title)}</option>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard MD Workspace</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1f2328;background:#f0f2f5;display:flex;flex-direction:column;min-height:100vh}
/* ── Botones acción Request OFF ── */
.action-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.btn-solicitar{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;background:#f5f0ff;color:#6929c4;border:1.5px solid #d4bbff;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background .15s}
.btn-solicitar:hover{background:#ede5ff;border-color:#b28dff}
.btn-manager{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;background:#defbe6;color:#0d6e30;border:1.5px solid #a7f0ba;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background .15s}
.btn-manager:hover{background:#c8f0d1;border-color:#6fdc8c}
/* ── Modal ── */
.modal-overlay{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.modal-overlay.hidden{display:none}
.modal-box{background:#fff;border-radius:10px;width:100%;max-width:500px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.modal-head{padding:14px 18px 12px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;flex-shrink:0}
.modal-head-icon{font-size:20px}
.modal-head-titles{flex:1}
.modal-head-title{font-size:14px;font-weight:700}
.modal-head-sub{font-size:11px;color:#57606a}
.modal-x{background:none;border:1px solid #e5e7eb;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:14px;color:#57606a;display:flex;align-items:center;justify-content:center}
.modal-x:hover{background:#f7f8fa}
.modal-body{padding:16px 18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:13px}
.form-note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 12px;font-size:12px;color:#1d4ed8}
.form-field{display:flex;flex-direction:column;gap:3px}
.form-field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151}
.req{color:#dc2626}
.form-field input,.form-field select,.form-field textarea{border:1px solid #d1d5db;border-radius:5px;padding:7px 10px;font-size:13px;color:#1f2328;background:#fff;outline:none;font-family:inherit}
.form-field input:focus,.form-field select:focus,.form-field textarea:focus{border-color:#6929c4;box-shadow:0 0 0 2px #ede5ff}
.form-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field-err{color:#dc2626;font-size:11px;margin-top:1px;display:none}
.monday-link-small{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#3b82d4;text-decoration:none;margin-top:5px}
.monday-link-small:hover{text-decoration:underline}
.modal-foot{padding:12px 18px;border-top:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}
.btn-cancel{padding:6px 14px;border-radius:5px;font-size:12px;font-weight:600;background:#fff;color:#57606a;border:1px solid #d1d5db;cursor:pointer}
.btn-cancel:hover{background:#f7f8fa}
.btn-submit{padding:6px 16px;border-radius:5px;font-size:12px;font-weight:600;background:#6929c4;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;gap:5px}
.btn-submit:hover{background:#551eab}
.success-card{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:18px;text-align:center;display:none}
.success-card .sc-title{font-size:15px;font-weight:700;color:#15803d;margin-bottom:5px}
.success-card .sc-sub{font-size:12px;color:#166534}
@media(max-width:500px){.form-row2{grid-template-columns:1fr}}
.topbar{background:#1f2328;color:#fff;padding:13px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;flex-shrink:0}
.topbar-left .title{font-size:16px;font-weight:700}
.topbar-left .meta{font-size:11px;color:#9ca3af;margin-top:1px}
.topbar-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.updated-label{font-size:11px;color:#6b7280}
.refresh-btn{background:#3b82d4;color:#fff;border:none;border-radius:5px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px}
.refresh-btn:hover{background:#2563b0}
.spinner{width:11px;height:11px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:none}
.loading .spinner{display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.layout{display:flex;flex:1;overflow:hidden}
.sidebar{width:230px;background:#fff;border-right:1px solid #e5e7eb;overflow-y:auto;flex-shrink:0}
.sidebar-section{padding:10px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af}
.nav-item{display:flex;align-items:center;gap:9px;padding:9px 14px;cursor:pointer;border-left:3px solid transparent;user-select:none}
.nav-item:hover{background:#f7f8fa}
.nav-item.active{background:#eff6ff;border-left-color:#3b82d4}
.nav-alerts.active{background:#fff5f5;border-left-color:#dc2626}
.nav-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center}
.nav-label{font-size:12px;font-weight:500;flex:1;line-height:1.3}
.nav-badge{font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;flex-shrink:0}
.badge-red{background:#fee2e2;color:#991b1b}
.badge-green{background:#dcfce7;color:#15803d}
.content{flex:1;overflow-y:auto;padding:20px}
.panel{display:none}.panel.active{display:block}
.board-header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.board-icon-lg{font-size:26px}
.board-title{font-size:17px;font-weight:700}
.board-link{font-size:11px;color:#3b82d4;text-decoration:none}
.board-link:hover{text-decoration:underline}
.selector-row{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.selector-row label{font-size:13px;font-weight:500;color:#57606a;white-space:nowrap}
.selector-row select{border:1px solid #d1d5db;border-radius:5px;padding:5px 10px;font-size:13px;background:#fff;cursor:pointer;min-width:170px}
.badge-current{background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:600;padding:2px 9px;border-radius:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin-bottom:20px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center}
.card .num{font-size:30px;font-weight:700;line-height:1}
.card .lbl{font-size:11px;color:#57606a;margin-top:3px}
.c-total .num{color:#3b82d4}.c-ok .num{color:#16a34a}.c-warn .num{color:#d97706}.c-danger .num{color:#dc2626}
.alert-box{background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:20px}
.alert-box-title{font-size:13px;font-weight:700;color:#dc2626;margin-bottom:10px}
.alist{list-style:none}
.alist li{padding:5px 0;border-bottom:1px solid #fee2e2;display:flex;gap:9px;align-items:flex-start}
.alist li:last-child{border-bottom:none}
.dot{width:7px;height:7px;border-radius:50%;background:#dc2626;margin-top:6px;flex-shrink:0}
.aname{font-weight:600;font-size:13px}.adetail{font-size:11px;color:#57606a}
.table-wrap{background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.table-header{padding:11px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between}
.table-header span{font-size:14px;font-weight:600}
.table-header .sub{font-size:12px;color:#57606a;font-weight:400}
.table-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:#f7f8fa;padding:8px 11px;text-align:left;font-weight:600;border-bottom:2px solid #e5e7eb;white-space:nowrap;color:#374151}
tbody td{padding:7px 11px;border-bottom:1px solid #f0f2f5;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#f7f8fa}
.cell-name{font-weight:500;white-space:nowrap}
.cell-muted{color:#9ca3af;font-size:11px}
.b{display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap}
.b-ok{background:#dcfce7;color:#15803d}.b-pending{background:#fee2e2;color:#991b1b}
.b-file{background:#dbeafe;color:#1d4ed8}.b-no-file{background:#fef9c3;color:#854d0e}
.b-people{background:#f3f4f6;color:#374151;font-size:10px}
.b-date{background:#ede9fe;color:#5b21b6}.b-num{background:#f0fdf4;color:#166534}
.alert-panel-title{font-size:16px;font-weight:700;margin-bottom:18px}
.alert-section-title{font-size:13px;font-weight:700;color:#57606a;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.04em}
.global-alert-item{display:flex;gap:12px;align-items:flex-start;padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:7px;margin-bottom:7px}
.ga-icon{font-size:20px;flex-shrink:0;margin-top:2px}
.ga-board{font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.ga-name{font-weight:600;font-size:13px}.ga-detail{font-size:11px;color:#57606a}
.all-good{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center;color:#15803d;font-weight:600}
.loading-overlay{position:fixed;inset:0;background:rgba(255,255,255,.8);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:999;display:none}
.loading-overlay.show{display:flex}
.big-spinner{width:36px;height:36px;border:4px solid #e5e7eb;border-top-color:#3b82d4;border-radius:50%;animation:spin .8s linear infinite}
.loading-text{font-size:14px;color:#57606a}
footer{text-align:center;font-size:11px;color:#9ca3af;padding:10px;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0}
@media(max-width:640px){.sidebar{display:none}.content{padding:12px}}
</style>
</head>
<body>

<!-- Loading overlay -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="big-spinner"></div>
  <div class="loading-text">Consultando Monday.com…</div>
</div>

<div class="topbar">
  <div class="topbar-left">
    <div class="title">🏢 Dashboard · Workspace MD</div>
    <div class="meta">ibm.monday.com · datos en vivo · caché 5 min</div>
  </div>
  <div class="topbar-right">
    <span class="updated-label">Actualizado: ${updatedAt}</span>
    <span class="updated-label" style="color:#4ade80">Próx. refresco: ${nextRefresh}</span>
    <button class="refresh-btn" id="refreshBtn" onclick="forceRefresh()">
      <div class="spinner"></div>
      Actualizar ahora
    </button>
  </div>
</div>

<div class="layout">
  <nav class="sidebar">
    <div class="sidebar-section">General</div>
    <div class="nav-item nav-alerts active" id="nav-alerts" onclick="show('alerts')">
      <span class="nav-icon">🔔</span>
      <span class="nav-label">Panel de Alertas</span>
      <span class="nav-badge ${totalAlerts > 0 ? "badge-red" : "badge-green"}">${totalAlerts}</span>
    </div>
    <div class="sidebar-section">Tableros</div>
    <div class="nav-item" id="nav-mdtime" onclick="show('mdtime')">
      <span class="nav-icon">⏱</span>
      <span class="nav-label">MD-Time · HR Zone</span>
      <span class="nav-badge ${mdAlerts.length > 0 ? "badge-red" : "badge-green"}">${mdAlerts.length > 0 ? mdAlerts.length : "✓"}</span>
    </div>
    <div class="nav-item" id="nav-requestoff" onclick="show('requestoff')">
      <span class="nav-icon">🗓</span>
      <span class="nav-label">Request OFF</span>
      <span class="nav-badge ${offAlerts.length > 0 ? "badge-red" : "badge-green"}">${offAlerts.length > 0 ? offAlerts.length : "✓"}</span>
    </div>
  </nav>

  <main class="content">

    <!-- Alertas -->
    <div class="panel active" id="panel-alerts">
      <div class="alert-panel-title">🔔 Panel de Alertas — ${totalAlerts} pendiente(s)</div>
      ${totalAlerts === 0 ? '<div class="all-good">✅ Sin alertas en ningún tablero</div>' : ""}
      ${mdAlerts.length > 0 ? `
        <div class="alert-section-title">⏱ MD-Time · Semana ${esc(curWeek ? curWeek.title : "")} — ${mdAlerts.length} pendiente(s)</div>
        ${mdAlerts.sort((a,b)=>b.missing.length-a.missing.length).map(a=>`
        <div class="global-alert-item">
          <span class="ga-icon">⏱</span>
          <div>
            <div class="ga-board">MD-Time · HR Zone</div>
            <div class="ga-name">${esc(a.name)}</div>
            <div class="ga-detail">Falta: ${a.missing.map(esc).join(" · ")}</div>
          </div>
        </div>`).join("")}` : ""}
      ${offAlerts.length > 0 ? `
        <div class="alert-section-title">🗓 Request OFF · Sin soporte — ${offAlerts.length} pendiente(s)</div>
        ${offAlerts.map(a=>`
        <div class="global-alert-item">
          <span class="ga-icon">🗓</span>
          <div>
            <div class="ga-board">Request OFF · Solicitudes</div>
            <div class="ga-name">${esc(a.name)}</div>
            <div class="ga-detail">Falta: archivo de soporte</div>
          </div>
        </div>`).join("")}` : ""}
    </div>

    <!-- MD-Time -->
    <div class="panel" id="panel-mdtime">
      <div class="board-header">
        <span class="board-icon-lg">⏱</span>
        <div>
          <div class="board-title">MD-Time · HR Zone · Success Factors</div>
          <a class="board-link" href="https://ibm.monday.com/boards/8443645710" target="_blank">Ver en Monday.com ↗</a>
        </div>
      </div>
      <div class="selector-row">
        <label>Semana:</label>
        <select id="mdtime-select" onchange="renderMDTime(this.value)">
          ${weekOpts}
        </select>
        <span class="badge-current" id="mdtime-cur-badge">Semana actual</span>
      </div>
      <div id="mdtime-alerts" class="alert-box" style="display:none">
        <div class="alert-box-title" id="mdtime-alert-title"></div>
        <ul class="alist" id="mdtime-alert-list"></ul>
      </div>
      <div class="cards" id="mdtime-cards"></div>
      <div class="table-wrap">
        <div class="table-header">
          <span>Detalle por persona</span>
          <span class="sub" id="mdtime-table-sub"></span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr>
              <th>Nombre</th><th>Time</th><th>TIME/Pantalla</th>
              <th>HR Zone</th><th>HRZ/Pantalla</th><th>My Hours</th><th>MyHours/Pant.</th>
            </tr></thead>
            <tbody id="mdtime-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Request OFF -->
    <div class="panel" id="panel-requestoff">
      <div class="board-header">
        <span class="board-icon-lg">🗓</span>
        <div>
          <div class="board-title">Request OFF</div>
          <a class="board-link" href="https://ibm.monday.com/boards/8488385355" target="_blank">Ver en Monday.com ↗</a>
        </div>
      </div>
      <div class="selector-row">
        <label>Grupo:</label>
        <select id="off-select" onchange="renderRequestOff(this.value);syncActionBar()">
          ${groupOpts}
        </select>
      </div>

      <!-- ── Barra de acciones: solo visible en grupo Solicitudes ── -->
      <div class="action-bar" id="off-action-bar" style="display:flex">
        <button class="btn-solicitar" onclick="openSolModal()">
          ✏️ Solicitar Ausencia
        </button>
        <a href="https://ibm.monday.com/boards/8488385355/views/202780769" target="_blank" rel="noopener" class="btn-manager">
          ✅ Aprobar en Monday &nbsp;<small style="font-weight:400;opacity:.7">(Solo Natalia Rincón)</small>
        </a>
      </div>

      <div id="off-alerts" class="alert-box" style="display:none">
        <div class="alert-box-title" id="off-alert-title"></div>
        <ul class="alist" id="off-alert-list"></ul>
      </div>
      <div class="cards" id="off-cards"></div>
      <div class="table-wrap">
        <div class="table-header">
          <span>Detalle de solicitudes</span>
          <span class="sub" id="off-table-sub"></span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr>
              <th>Nombre</th><th>Solicitante</th><th>Motivo</th>
              <th>Fechas</th><th>Días</th><th>Estado</th><th>Soporte</th><th>Observaciones</th>
            </tr></thead>
            <tbody id="off-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

  </main>
</div>

<!-- ══ MODAL NUEVA SOLICITUD ══ -->
<div class="modal-overlay hidden" id="sol-modal" onclick="closeSolModalOverlay(event)">
  <div class="modal-box">
    <div class="modal-head">
      <span class="modal-head-icon">🗓</span>
      <div class="modal-head-titles">
        <div class="modal-head-title">Nueva Solicitud de Ausencia</div>
        <div class="modal-head-sub">Grupo: Solicitudes · ibm.monday.com</div>
      </div>
      <button class="modal-x" onclick="closeSolModal()">✕</button>
    </div>

    <div class="modal-body" id="sol-form">
      <div class="form-note">
        ℹ️ Completa todos los campos (<strong>*</strong>). La aprobación final la realizan únicamente <strong>Natalia Rincón</strong> y <strong>Cristian Avilán</strong> en el tablero de Monday.
      </div>
      <div class="form-field">
        <label>Elemento (nombre del ítem) <span class="req">*</span></label>
        <input type="text" id="sol-elemento" placeholder="Ej: Vacaciones agosto – Nombre Apellido" maxlength="120">
        <span class="field-err" id="err-elemento">Este campo es obligatorio.</span>
      </div>
      <div class="form-field">
        <label>Persona (correo IBM) <span class="req">*</span></label>
        <input type="email" id="sol-people" placeholder="nombre@ibm.com">
        <span class="field-err" id="err-people">Ingresa un correo IBM válido.</span>
      </div>
      <div class="form-row2">
        <div class="form-field">
          <label>Fecha de Solicitud <span class="req">*</span></label>
          <input type="date" id="sol-fecha">
          <span class="field-err" id="err-fecha">Selecciona una fecha.</span>
        </div>
        <div class="form-field">
          <label>Motivo <span class="req">*</span></label>
          <select id="sol-motivo">
            <option value="">— Seleccionar —</option>
            <option>Vacaciones</option>
            <option>Chequeo Médico</option>
            <option>Día de cumpleaños</option>
            <option>Festivo Col</option>
            <option>Medio día votaciones</option>
            <option>Licencia</option>
            <option>Otro</option>
          </select>
          <span class="field-err" id="err-motivo">Selecciona un motivo.</span>
        </div>
      </div>
      <div class="form-row2">
        <div class="form-field">
          <label>Cronograma Desde <span class="req">*</span></label>
          <input type="date" id="sol-desde">
          <span class="field-err" id="err-cronograma">Completa las fechas.</span>
        </div>
        <div class="form-field">
          <label>Cronograma Hasta <span class="req">*</span></label>
          <input type="date" id="sol-hasta">
        </div>
      </div>
      <div class="form-field">
        <label>Aprobación — estado inicial <span class="req">*</span></label>
        <select id="sol-aprobacion">
          <option value="">— Seleccionar —</option>
          <option value="Solicitado">Solicitado</option>
          <option value="En espera">En espera</option>
        </select>
        <span class="field-err" id="err-aprobacion">Selecciona el estado.</span>
        <a href="https://ibm.monday.com/boards/8488385355/views/202780769" target="_blank" rel="noopener" class="monday-link-small">
          🔗 Ir al tablero de aprobación en Monday ↗
        </a>
      </div>
    </div>

    <div class="success-card" id="sol-success">
      <div class="sc-title">✅ Solicitud registrada</div>
      <div class="sc-sub">Recuerda que la aprobación final la realiza <strong>Natalia Rincón</strong> o <strong>Cristian Avilán</strong> directamente en Monday.</div>
      <a href="https://ibm.monday.com/boards/8488385355/views/202780769" target="_blank" rel="noopener" class="monday-link-small" style="justify-content:center;margin-top:10px">
        🔗 Ver tablero de aprobación ↗
      </a>
    </div>

    <div class="modal-foot" id="sol-foot">
      <a href="https://ibm.monday.com/boards/8488385355/views/202780769" target="_blank" rel="noopener" class="monday-link-small">🔗 Tablero Monday</a>
      <div style="display:flex;gap:8px">
        <button class="btn-cancel" onclick="closeSolModal()">Cancelar</button>
        <button class="btn-submit" onclick="submitSol()">✔ Registrar Solicitud</button>
      </div>
    </div>
  </div>
</div>

<footer>Made with IBM Bob · Workspace MD · ibm.monday.com</footer>

<script>
const MDTIME_DATA = ${JSON.stringify(mdTime.weeksData)};
const MDTIME_COLS = ${JSON.stringify(mdTime.colDefs)};
const MDTIME_CUR  = ${JSON.stringify(mdTime.currentGroupId)};
const OFF_DATA    = ${JSON.stringify(requestOff.groupsData)};

function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function card(cls,n,l){ return '<div class="card '+cls+'"><div class="num">'+n+'</div><div class="lbl">'+l+'</div></div>'; }
function b(cls,t){ return '<span class="b '+cls+'">'+esc(t)+'</span>'; }

function show(panel) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('panel-'+panel).classList.add('active');
  document.getElementById('nav-'+panel).classList.add('active');
  if(panel==='requestoff') syncActionBar();
}

function forceRefresh() {
  document.getElementById('loadingOverlay').classList.add('show');
  document.getElementById('refreshBtn').classList.add('loading');
  window.location.href = '/?refresh=1';
}

function renderMDTime(groupId) {
  const week = MDTIME_DATA[groupId]; if(!week) return;
  document.getElementById('mdtime-cur-badge').style.display = groupId===MDTIME_CUR?'':'none';
  document.getElementById('mdtime-table-sub').textContent = 'Semana '+week.title;
  const rows = [...week.items].sort((a,b)=>a.name.localeCompare(b.name));
  let done=0,partial=0,none=0; const pending=[]; let tbody='';
  rows.forEach(row=>{
    let filled=0,missing=[];
    MDTIME_COLS.forEach(col=>{ const v=row.cv[col.key]; if(v&&v.trim()) filled++; else missing.push(col.label); });
    if(filled===MDTIME_COLS.length) done++; else if(filled===0) none++; else partial++;
    if(missing.length) pending.push({name:row.name,missing});
    tbody += '<tr><td class="cell-name">'+esc(row.name)+'</td>';
    MDTIME_COLS.forEach(col=>{
      const v=row.cv[col.key]; const has=v&&v.trim();
      if(col.type==='status') tbody+='<td>'+(has?b('b-ok',v):b('b-pending','Falta'))+'</td>';
      else tbody+='<td>'+(has?b('b-file','Archivo'):b('b-no-file','Falta'))+'</td>';
    });
    tbody += '</tr>';
  });
  document.getElementById('mdtime-tbody').innerHTML=tbody;
  document.getElementById('mdtime-cards').innerHTML=card('c-total',rows.length,'Total')+card('c-ok',done,'Completos')+card('c-warn',partial,'Parciales')+card('c-danger',none,'Sin datos');
  const ab=document.getElementById('mdtime-alerts');
  if(!pending.length){ab.style.display='none';return;}
  ab.style.display='';
  document.getElementById('mdtime-alert-title').textContent='⚠ '+pending.length+' persona(s) con documentación pendiente';
  let al='';
  pending.sort((a,b)=>b.missing.length-a.missing.length).forEach(p=>{
    al+='<li><div class="dot"></div><div><div class="aname">'+esc(p.name)+'</div><div class="adetail">Falta: '+p.missing.map(esc).join(' · ')+'</div></div></li>';
  });
  document.getElementById('mdtime-alert-list').innerHTML=al;
}

function renderRequestOff(groupId) {
  const grp=OFF_DATA[groupId]; if(!grp) return;
  document.getElementById('off-table-sub').textContent=grp.title+' — '+grp.items.length+' registros';
  const rows=[...grp.items].sort((a,b)=>(b.cv['date4']||'').localeCompare(a.cv['date4']||''));
  let aprobadas=0,pendientes=0,sinSoporte=0; const alerts=[]; let tbody='';
  rows.forEach(row=>{
    const estado=row.cv['status_mkn825jf']||'';
    const soporte=row.cv['file_mm1ht7j7']||'';
    if(estado.toLowerCase().includes('aprobad')) aprobadas++; else pendientes++;
    if(!soporte){sinSoporte++;alerts.push({name:row.name});}
    tbody+='<tr><td class="cell-name">'+esc(row.name)+'</td>';
    const sol=row.cv['people_mkn8wds0']||'';
    tbody+='<td>'+b('b-people',sol?sol.split('@')[0]:'—')+'</td>';
    const mot=row.cv['status_1_mkn5yhzg']||'';
    tbody+='<td>'+(mot?b('b-date',mot):'<span class="cell-muted">—</span>')+'</td>';
    const fec=row.cv['cronograma_mkn6bx9b']||'';
    tbody+='<td>'+(fec?b('b-date',fec):'<span class="cell-muted">—</span>')+'</td>';
    const dias=row.cv['n_meros_mkn6cwvj']||'';
    tbody+='<td>'+(dias?b('b-num',dias+' d'):'<span class="cell-muted">—</span>')+'</td>';
    const est=row.cv['status_mkn825jf']||'';
    const ec=est.toLowerCase().includes('aprobad')?'b-ok':est.toLowerCase().includes('rechazo')?'b-pending':'b-date';
    tbody+='<td>'+(est?b(ec,est):'<span class="cell-muted">—</span>')+'</td>';
    tbody+='<td>'+(soporte?b('b-file','Archivo'):b('b-no-file','Falta'))+'</td>';
    const obs=row.cv['text_mkn8yf9q']||'';
    tbody+='<td>'+(obs?'<span style="font-size:11px">'+esc(obs.substring(0,60))+(obs.length>60?'…':'')+'</span>':'<span class="cell-muted">—</span>')+'</td>';
    tbody+='</tr>';
  });
  document.getElementById('off-tbody').innerHTML=tbody;
  document.getElementById('off-cards').innerHTML=card('c-total',rows.length,'Total')+card('c-ok',aprobadas,'Aprobadas')+card('c-warn',pendientes,'Pendientes')+card('c-danger',sinSoporte,'Sin soporte');
  const ab=document.getElementById('off-alerts');
  if(!alerts.length){ab.style.display='none';return;}
  ab.style.display='';
  document.getElementById('off-alert-title').textContent='⚠ '+alerts.length+' solicitud(es) sin soporte adjunto';
  let al='';
  alerts.forEach(a=>{al+='<li><div class="dot"></div><div><div class="aname">'+esc(a.name)+'</div><div class="adetail">Sin archivo de soporte</div></div></li>';});
  document.getElementById('off-alert-list').innerHTML=al;
}

renderMDTime(MDTIME_CUR);
renderRequestOff('topics');

// ── Barra de acciones: solo en grupo Solicitudes ──────────────────────
function syncActionBar(){
  var bar=document.getElementById('off-action-bar');
  if(!bar)return;
  bar.style.display=document.getElementById('off-select').value==='topics'?'flex':'none';
}
syncActionBar();

// ── Modal Nueva Solicitud ─────────────────────────────────────────────
function openSolModal(){
  var ids=['sol-elemento','sol-people','sol-fecha','sol-motivo','sol-desde','sol-hasta','sol-aprobacion'];
  ids.forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var today=new Date();
  var ts=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  var fe=document.getElementById('sol-fecha');if(fe)fe.value=ts;
  document.querySelectorAll('.field-err').forEach(function(e){e.style.display='none';});
  document.getElementById('sol-form').style.display='';
  document.getElementById('sol-success').style.display='none';
  document.getElementById('sol-foot').style.display='';
  document.getElementById('sol-modal').classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeSolModal(){
  document.getElementById('sol-modal').classList.add('hidden');
  document.body.style.overflow='';
}
function closeSolModalOverlay(e){
  if(e.target===document.getElementById('sol-modal'))closeSolModal();
}
function ferr(id,show){var el=document.getElementById(id);if(el)el.style.display=show?'block':'none';}
function submitSol(){
  var ok=true;
  var el=(document.getElementById('sol-elemento').value||'').trim();
  ferr('err-elemento',!el);if(!el)ok=false;
  var pe=(document.getElementById('sol-people').value||'').trim();
  var eok=pe&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pe);
  ferr('err-people',!eok);if(!eok)ok=false;
  var fe=(document.getElementById('sol-fecha').value||'').trim();
  ferr('err-fecha',!fe);if(!fe)ok=false;
  var mo=(document.getElementById('sol-motivo').value||'').trim();
  ferr('err-motivo',!mo);if(!mo)ok=false;
  var ds=(document.getElementById('sol-desde').value||'').trim();
  var ha=(document.getElementById('sol-hasta').value||'').trim();
  ferr('err-cronograma',!ds||!ha);if(!ds||!ha)ok=false;
  var ap=(document.getElementById('sol-aprobacion').value||'').trim();
  ferr('err-aprobacion',!ap);if(!ap)ok=false;
  if(!ok)return;
  document.getElementById('sol-form').style.display='none';
  document.getElementById('sol-success').style.display='';
  document.getElementById('sol-foot').style.display='none';
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&!document.getElementById('sol-modal').classList.contains('hidden'))closeSolModal();
});
<\/script>
</body>
</html>`;
}

// ── Build data and HTML ────────────────────────────────────────────────────
async function buildCache() {
  console.log(`[${new Date().toLocaleTimeString()}] Consultando Monday.com...`);
  const [mdTime, requestOff] = await Promise.all([fetchMDTime(), fetchRequestOff()]);
  const now = new Date();
  const updatedAt   = now.toLocaleString("es-CO", { dateStyle:"medium", timeStyle:"short", timeZone:"America/Bogota" });
  const nextRefresh = new Date(now.getTime() + CACHE_TTL_MS).toLocaleTimeString("es-CO", { timeStyle:"short", timeZone:"America/Bogota" });
  const html = buildHtml(mdTime, requestOff, updatedAt, nextRefresh);
  cache = { html, builtAt: Date.now() };
  console.log(`[${new Date().toLocaleTimeString()}] Caché actualizado. Próx. en 5 min.`);
  return html;
}

// ── HTTP Server ────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  // ── CORS para GitHub Pages ──────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── POST /api/solicitud — crear ítem en Monday ──────────────────────
  if (req.method === "POST" && req.url === "/api/solicitud") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        // Buscar el token en cualquier variable de entorno que contenga MONDAY o TOKEN
        let activeToken = (process.env.MONDAY_TOKEN || process.env.MONDAY_KEY || process.env.MONDAY_API_KEY || MONDAY_TOKEN || "").trim();
        if (!activeToken) {
          const keys = Object.keys(process.env).filter(k => k.toUpperCase().includes("MONDAY") || k.toUpperCase().includes("TOKEN"));
          for (const k of keys) {
            if (process.env[k] && process.env[k].startsWith("eyJ")) {
              activeToken = process.env[k].trim();
              console.log(`[Solicitud] Token encontrado dinámicamente en variable process.env.${k}`);
              break;
            }
          }
        }

        if (!activeToken) {
          const availableEnvKeys = Object.keys(process.env).sort().join(", ");
          console.error(`[Solicitud] MONDAY_TOKEN no encontrado. Variables disponibles en process.env: ${availableEnvKeys}`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: false,
            error: "La variable MONDAY_TOKEN no está activa en el contenedor de Railway. Por favor ve a Deployments en Railway y haz clic en 'Redeploy' para aplicar la variable."
          }));
          return;
        }
        const d = JSON.parse(body);
        // Construir mutation de Monday para crear el ítem en grupo "topics"
        const columnValues = JSON.stringify({
          people_mkn8wds0:   { personsAndTeams: [] }, // people se gestiona desde Monday
          date4:             { date: d.fecha || "" },
          status_mkn825jf:   { label: "Solicitado" },
          status_1_mkn5yhzg: { label: d.motivo || "" },
          cronograma_mkn6bx9b: { from: d.desde || "", to: d.hasta || "" },
          people_mkn5pkbz:   d.aprobacion || "nrincon@ibm.com",
          text_mkn8yf9q:     d.observaciones || ""
        }).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

        const mutation = `mutation {
          create_item(
            board_id: 8488385355,
            group_id: "topics",
            item_name: "${(d.elemento||"").replace(/"/g,'\\"')}",
            column_values: "${columnValues}"
          ) { id name }
        }`;

        const result = await mondayQuery(mutation);
        const itemId = result.create_item ? result.create_item.id : null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, itemId }));
        console.log(`[Solicitud] Creado ítem "${d.elemento}" id=${itemId}`);
      } catch(err) {
        console.error("[Solicitud] Error:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // ── GET / — Dashboard ───────────────────────────────────────────────
  if (req.url !== "/" && req.url !== "/?refresh=1" && !req.url.startsWith("/?")) {
    res.writeHead(404); res.end("Not found"); return;
  }

  const forceRefresh = req.url.includes("refresh=1");
  const cacheExpired = (Date.now() - cache.builtAt) > CACHE_TTL_MS;

  try {
    let html;
    if (!cache.html || cacheExpired || forceRefresh) {
      html = await buildCache();
    } else {
      html = cache.html;
      console.log(`[${new Date().toLocaleTimeString()}] Sirviendo desde caché.`);
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch(err) {
    console.error("Error:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<html><body style="font-family:sans-serif;padding:40px">
      <h2 style="color:#dc2626">Error al conectar con Monday.com</h2>
      <pre style="color:#57606a">${err.message}</pre>
      <p><a href="/">Reintentar</a></p>
    </body></html>`);
  }
});

server.listen(PORT, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Dashboard MD Workspace — Servidor");
  console.log(`  URL: http://localhost:${PORT}`);
  console.log("  Caché: 5 minutos");
  console.log("  Ctrl+C para detener");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  // Pre-calentar caché al arrancar
  buildCache().catch(console.error);
});
