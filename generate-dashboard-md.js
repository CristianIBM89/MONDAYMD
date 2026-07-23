// generate-dashboard-md.js
// Genera dashboard-md-workspace.html con datos de:
//   1. MD-Time · HR Zone · Success Factors  (por semana)
//   2. Request OFF  (grupos: Solicitudes + Aprobadas)
// Uso: node generate-dashboard-md.js

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// Token desde variable de entorno o archivo .env
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
if (!MONDAY_TOKEN) { console.error("ERROR: MONDAY_TOKEN no definido en .env"); process.exit(1); }
const OUTPUT_FILE  = path.join(__dirname, "dashboard-md-workspace.html");

// ── Monday API ─────────────────────────────────────────────────────────────
function mondayQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: "api.monday.com", path: "/v2", method: "POST",
      headers: {
        "Authorization": MONDAY_TOKEN, "Content-Type": "application/json",
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

// ── Fetch MD-Time (last 8 weeks) ───────────────────────────────────────────
async function fetchMDTime() {
  const COL_IDS = ["status_1_mkn1az5h","files_mkn19bev","status_1_mkn1ntp1","files_1_mkn1q1sz","color_mknvzcn3","file_mknvemd2"];
  const COL_DEFS = [
    { key: "status_1_mkn1az5h", label: "Time",          type: "status" },
    { key: "files_mkn19bev",    label: "TIME/Pantalla",  type: "file"   },
    { key: "status_1_mkn1ntp1", label: "HR Zone",        type: "status" },
    { key: "files_1_mkn1q1sz",  label: "HRZ/Pantalla",   type: "file"   },
    { key: "color_mknvzcn3",    label: "My Hours",        type: "status" },
    { key: "file_mknvemd2",     label: "MyHours/Pant.",   type: "file"   },
  ];

  const d0 = await mondayQuery(`{ boards(ids:[8443645710]) { groups { id title } } }`);
  const allGroups = d0.boards[0].groups;
  const recentGroups = allGroups.slice(-8);
  const colStr = COL_IDS.map(c => `"${c}"`).join(",");
  const weeksData = {};

  for (const g of recentGroups) {
    process.stdout.write(`  ⏱  semana ${g.title} ... `);
    const d = await mondayQuery(`{
      boards(ids:[8443645710]) {
        groups(ids:["${g.id}"]) {
          title
          items_page(limit:200) {
            items { name column_values(ids:[${colStr}]) { id text } }
          }
        }
      }
    }`);
    const items = d.boards[0].groups[0].items_page.items;
    weeksData[g.id] = {
      title: g.title,
      items: items.map(item => {
        const cv = {};
        item.column_values.forEach(c => { cv[c.id] = c.text || ""; });
        return { name: item.name, cv };
      })
    };
    console.log(`${items.length} personas`);
  }

  const cur = getCurrentWeekGroup(allGroups);
  return {
    id: "8443645710",
    name: "MD-Time · HR Zone · Success Factors",
    icon: "⏱",
    colDefs: COL_DEFS,
    allGroups,
    weeksData,
    currentGroupId: cur ? cur.id : recentGroups[recentGroups.length - 1].id
  };
}

// ── Fetch Request OFF (Solicitudes + Aprobadas) ────────────────────────────
async function fetchRequestOff() {
  const COL_IDS = ["people_mkn8wds0","date4","status_mkn825jf","status_1_mkn5yhzg","cronograma_mkn6bx9b","n_meros_mkn6cwvj","file_mm1ht7j7","people_mkn5pkbz","text_mkn8yf9q"];
  const COL_DEFS = [
    { key: "people_mkn8wds0",    label: "Solicitante",  type: "people"   },
    { key: "status_1_mkn5yhzg",  label: "Motivo",       type: "status"   },
    { key: "cronograma_mkn6bx9b",label: "Fechas",       type: "date"     },
    { key: "n_meros_mkn6cwvj",   label: "Días",         type: "number"   },
    { key: "status_mkn825jf",    label: "Estado",       type: "status"   },
    { key: "file_mm1ht7j7",      label: "Soporte",      type: "file"     },
    { key: "text_mkn8yf9q",      label: "Observaciones",type: "text"     },
  ];

  const TARGET_GROUPS = [
    { id: "topics",              label: "Solicitudes" },
    { id: "new_group_mkn8gp5j", label: "Aprobadas"   },
  ];

  const colStr = COL_IDS.map(c => `"${c}"`).join(",");
  const groupsData = {};

  for (const tg of TARGET_GROUPS) {
    process.stdout.write(`  🗓  grupo "${tg.label}" ... `);
    const d = await mondayQuery(`{
      boards(ids:[8488385355]) {
        groups(ids:["${tg.id}"]) {
          title
          items_page(limit:200) {
            items { name column_values(ids:[${colStr}]) { id text } }
          }
        }
      }
    }`);
    const grp = d.boards[0].groups[0];
    const items = grp.items_page.items;
    groupsData[tg.id] = {
      title: tg.label,
      items: items.map(item => {
        const cv = {};
        item.column_values.forEach(c => { cv[c.id] = c.text || ""; });
        return { name: item.name, cv };
      })
    };
    console.log(`${items.length} items`);
  }

  return {
    id: "8488385355",
    name: "Request OFF",
    icon: "🗓",
    colDefs: COL_DEFS,
    groupsData,
    defaultGroup: "topics"
  };
}

// ── Build full HTML ────────────────────────────────────────────────────────
function buildHtml(mdTime, requestOff, updatedAt) {

  // ── Compute alerts for MD-Time (current week) ──
  const curWeek = mdTime.weeksData[mdTime.currentGroupId];
  const mdAlerts = [];
  if (curWeek) {
    curWeek.items.forEach(row => {
      const missing = mdTime.colDefs
        .filter(c => c.type !== "people" && (!row.cv[c.key] || row.cv[c.key].trim() === ""))
        .map(c => c.label);
      if (missing.length > 0) mdAlerts.push({ name: row.name, missing });
    });
  }

  // ── Compute alerts for Request OFF (Solicitudes sin soporte) ──
  const solData = requestOff.groupsData["topics"];
  const offAlerts = [];
  if (solData) {
    solData.items.forEach(row => {
      const missing = [];
      const soporte = row.cv["file_mm1ht7j7"];
      if (!soporte || soporte.trim() === "") missing.push("Soporte");
      if (missing.length > 0) offAlerts.push({ name: row.name, missing });
    });
  }

  const totalAlerts = mdAlerts.length + offAlerts.length;

  // ── Week options for MD-Time ──
  const weekOpts = Object.entries(mdTime.weeksData).reverse().map(([gid, gd]) => {
    const sel = gid === mdTime.currentGroupId ? " selected" : "";
    return `<option value="${gid}"${sel}>${esc(gd.title)}</option>`;
  }).join("\n");

  // ── Group options for Request OFF ──
  const groupOpts = Object.entries(requestOff.groupsData).map(([gid, gd]) => {
    const sel = gid === requestOff.defaultGroup ? " selected" : "";
    return `<option value="${gid}"${sel}>${esc(gd.title)}</option>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard MD Workspace</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1f2328;background:#f0f2f5;display:flex;flex-direction:column;min-height:100vh}

/* Topbar */
.topbar{background:#1f2328;color:#fff;padding:13px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;flex-shrink:0}
.topbar-title{font-size:16px;font-weight:700}
.topbar-meta{font-size:11px;color:#9ca3af;margin-top:1px}
.topbar-updated{font-size:11px;color:#6b7280}

/* Layout */
.layout{display:flex;flex:1;overflow:hidden}

/* Sidebar */
.sidebar{width:230px;background:#fff;border-right:1px solid #e5e7eb;overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column}
.sidebar-section{padding:10px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af}
.nav-item{display:flex;align-items:center;gap:9px;padding:9px 14px;cursor:pointer;border-left:3px solid transparent;user-select:none}
.nav-item:hover{background:#f7f8fa}
.nav-item.active{background:#eff6ff;border-left-color:#3b82d4}
.nav-alerts.active{background:#fff5f5;border-left-color:#dc2626}
.nav-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center}
.nav-label{font-size:12px;font-weight:500;flex:1;line-height:1.3}
.nav-badge{font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;flex-shrink:0}
.badge-red{background:#fee2e2;color:#991b1b}
.badge-green{background:#dcfce7;color:#15803d}

/* Content */
.content{flex:1;overflow-y:auto;padding:20px}

/* Panel */
.panel{display:none}
.panel.active{display:block}

/* Board header */
.board-header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.board-icon-lg{font-size:26px}
.board-title{font-size:17px;font-weight:700}
.board-link{font-size:11px;color:#3b82d4;text-decoration:none}
.board-link:hover{text-decoration:underline}

/* Selector row */
.selector-row{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.selector-row label{font-size:13px;font-weight:500;color:#57606a;white-space:nowrap}
.selector-row select{border:1px solid #d1d5db;border-radius:5px;padding:5px 10px;font-size:13px;background:#fff;cursor:pointer;min-width:170px}
.badge-current{background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:600;padding:2px 9px;border-radius:12px}

/* Summary cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin-bottom:20px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center}
.card .num{font-size:30px;font-weight:700;line-height:1}
.card .lbl{font-size:11px;color:#57606a;margin-top:3px}
.c-total .num{color:#3b82d4}.c-ok .num{color:#16a34a}.c-warn .num{color:#d97706}.c-danger .num{color:#dc2626}

/* Alert box */
.alert-box{background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:20px}
.alert-box-title{font-size:13px;font-weight:700;color:#dc2626;margin-bottom:10px}
.alist{list-style:none}
.alist li{padding:5px 0;border-bottom:1px solid #fee2e2;display:flex;gap:9px;align-items:flex-start}
.alist li:last-child{border-bottom:none}
.dot{width:7px;height:7px;border-radius:50%;background:#dc2626;margin-top:6px;flex-shrink:0}
.aname{font-weight:600;font-size:13px}
.adetail{font-size:11px;color:#57606a}

/* Table */
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
.cell-group{font-size:11px;color:#57606a;white-space:nowrap}
.cell-muted{color:#9ca3af;font-size:11px}

/* Badges */
.b{display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap}
.b-ok{background:#dcfce7;color:#15803d}
.b-pending{background:#fee2e2;color:#991b1b}
.b-file{background:#dbeafe;color:#1d4ed8}
.b-no-file{background:#fef9c3;color:#854d0e}
.b-people{background:#f3f4f6;color:#374151;font-size:10px}
.b-date{background:#ede9fe;color:#5b21b6}
.b-num{background:#f0fdf4;color:#166534}
.b-muted{background:#f3f4f6;color:#9ca3af}

/* Global alerts panel */
.alert-panel-title{font-size:16px;font-weight:700;margin-bottom:18px;display:flex;align-items:center;gap:8px}
.alert-section-title{font-size:13px;font-weight:700;color:#57606a;margin:18px 0 8px;text-transform:uppercase;letter-spacing:0.04em}
.global-alert-item{display:flex;gap:12px;align-items:flex-start;padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:7px;margin-bottom:7px}
.ga-icon{font-size:20px;flex-shrink:0;margin-top:2px}
.ga-board{font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
.ga-name{font-weight:600;font-size:13px}
.ga-detail{font-size:11px;color:#57606a}
.all-good{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center;color:#15803d;font-weight:600}

footer{text-align:center;font-size:11px;color:#9ca3af;padding:10px;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0}

@media(max-width:640px){.sidebar{display:none}.content{padding:12px}}
</style>
</head>
<body>

<div class="topbar">
  <div>
    <div class="topbar-title">🏢 Dashboard · Workspace MD</div>
    <div class="topbar-meta">ibm.monday.com · 2 tableros monitoreados</div>
  </div>
  <div class="topbar-updated">Generado: ${updatedAt}</div>
</div>

<div class="layout">

  <!-- ── Sidebar ── -->
  <nav class="sidebar">
    <div class="sidebar-section">General</div>

    <div class="nav-item nav-alerts active" id="nav-alerts" onclick="show('alerts')">
      <span class="nav-icon">🔔</span>
      <span class="nav-label">Panel de Alertas</span>
      <span class="nav-badge ${totalAlerts > 0 ? 'badge-red' : 'badge-green'}">${totalAlerts}</span>
    </div>

    <div class="sidebar-section">Tableros</div>

    <div class="nav-item" id="nav-mdtime" onclick="show('mdtime')">
      <span class="nav-icon">⏱</span>
      <span class="nav-label">MD-Time · HR Zone</span>
      <span class="nav-badge ${mdAlerts.length > 0 ? 'badge-red' : 'badge-green'}">${mdAlerts.length > 0 ? mdAlerts.length : '✓'}</span>
    </div>

    <div class="nav-item" id="nav-requestoff" onclick="show('requestoff')">
      <span class="nav-icon">🗓</span>
      <span class="nav-label">Request OFF</span>
      <span class="nav-badge ${offAlerts.length > 0 ? 'badge-red' : 'badge-green'}">${offAlerts.length > 0 ? offAlerts.length : '✓'}</span>
    </div>
  </nav>

  <!-- ── Content ── -->
  <main class="content">

    <!-- ── Panel de Alertas ── -->
    <div class="panel active" id="panel-alerts">
      <div class="alert-panel-title">🔔 Panel de Alertas — ${totalAlerts} pendiente(s)</div>

      ${totalAlerts === 0 ? '<div class="all-good">✅ Sin alertas en ningún tablero</div>' : ''}

      ${mdAlerts.length > 0 ? `
      <div class="alert-section-title">⏱ MD-Time · Semana ${esc(curWeek ? curWeek.title : '')} — ${mdAlerts.length} pendiente(s)</div>
      ${mdAlerts.sort((a,b) => b.missing.length - a.missing.length).map(a => `
      <div class="global-alert-item">
        <span class="ga-icon">⏱</span>
        <div>
          <div class="ga-board">MD-Time · HR Zone</div>
          <div class="ga-name">${esc(a.name)}</div>
          <div class="ga-detail">Falta: ${a.missing.map(esc).join(" · ")}</div>
        </div>
      </div>`).join("")}` : ''}

      ${offAlerts.length > 0 ? `
      <div class="alert-section-title">🗓 Request OFF · Solicitudes sin soporte — ${offAlerts.length} pendiente(s)</div>
      ${offAlerts.map(a => `
      <div class="global-alert-item">
        <span class="ga-icon">🗓</span>
        <div>
          <div class="ga-board">Request OFF · Solicitudes</div>
          <div class="ga-name">${esc(a.name)}</div>
          <div class="ga-detail">Falta: ${a.missing.map(esc).join(" · ")}</div>
        </div>
      </div>`).join("")}` : ''}
    </div>

    <!-- ── MD-Time panel ── -->
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
              <th>Nombre</th>
              <th>Time</th><th>TIME/Pantalla</th>
              <th>HR Zone</th><th>HRZ/Pantalla</th>
              <th>My Hours</th><th>MyHours/Pant.</th>
            </tr></thead>
            <tbody id="mdtime-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── Request OFF panel ── -->
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
        <select id="off-select" onchange="renderRequestOff(this.value)">
          ${groupOpts}
        </select>
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
              <th>Nombre</th>
              <th>Solicitante</th>
              <th>Motivo</th>
              <th>Fechas</th>
              <th>Días</th>
              <th>Estado</th>
              <th>Soporte</th>
              <th>Observaciones</th>
            </tr></thead>
            <tbody id="off-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

  </main>
</div>

<footer>Made with IBM Bob · Workspace MD · ibm.monday.com</footer>

<script>
// ── Embedded data ──────────────────────────────────────────────────────────
const MDTIME_DATA    = ${JSON.stringify(mdTime.weeksData)};
const MDTIME_COLS    = ${JSON.stringify(mdTime.colDefs)};
const MDTIME_CUR     = ${JSON.stringify(mdTime.currentGroupId)};
const OFF_DATA       = ${JSON.stringify(requestOff.groupsData)};

function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function card(cls,num,lbl){ return '<div class="card '+cls+'"><div class="num">'+num+'</div><div class="lbl">'+lbl+'</div></div>'; }
function b(cls,txt){ return '<span class="b '+cls+'">'+esc(txt)+'</span>'; }

// ── Navigation ─────────────────────────────────────────────────────────────
function show(panel) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + panel).classList.add('active');
  document.getElementById('nav-'   + panel).classList.add('active');
}

// ── MD-Time render ─────────────────────────────────────────────────────────
function renderMDTime(groupId) {
  const week = MDTIME_DATA[groupId];
  if (!week) return;
  const isCurrent = groupId === MDTIME_CUR;
  document.getElementById('mdtime-cur-badge').style.display = isCurrent ? '' : 'none';
  document.getElementById('mdtime-table-sub').textContent   = 'Semana ' + week.title;
  const rows = [...week.items].sort((a,b) => a.name.localeCompare(b.name));
  let done=0, partial=0, none=0;
  const pending=[];
  let tbody='';
  rows.forEach(row => {
    let filled=0, missing=[];
    MDTIME_COLS.forEach(col => {
      const v = row.cv[col.key];
      if (v && v.trim()) filled++; else missing.push(col.label);
    });
    if (filled===MDTIME_COLS.length) done++;
    else if (filled===0) none++;
    else partial++;
    if (missing.length) pending.push({name:row.name, missing});
    tbody += '<tr><td class="cell-name">'+esc(row.name)+'</td>';
    MDTIME_COLS.forEach(col => {
      const v = row.cv[col.key];
      const has = v && v.trim();
      if (col.type==='status') tbody += '<td>'+(has?b('b-ok',v):b('b-pending','Falta'))+'</td>';
      else                     tbody += '<td>'+(has?b('b-file','Archivo'):b('b-no-file','Falta'))+'</td>';
    });
    tbody += '</tr>';
  });
  document.getElementById('mdtime-tbody').innerHTML = tbody;
  document.getElementById('mdtime-cards').innerHTML =
    card('c-total',rows.length,'Total')+card('c-ok',done,'Completos')+
    card('c-warn',partial,'Parciales')+card('c-danger',none,'Sin datos');
  const ab = document.getElementById('mdtime-alerts');
  if (pending.length===0) { ab.style.display='none'; return; }
  ab.style.display='';
  document.getElementById('mdtime-alert-title').textContent = '⚠ '+pending.length+' persona(s) con documentación pendiente';
  let al='';
  pending.sort((a,b)=>b.missing.length-a.missing.length).forEach(p => {
    al += '<li><div class="dot"></div><div><div class="aname">'+esc(p.name)+'</div><div class="adetail">Falta: '+p.missing.map(esc).join(' · ')+'</div></div></li>';
  });
  document.getElementById('mdtime-alert-list').innerHTML = al;
}

// ── Request OFF render ─────────────────────────────────────────────────────
function renderRequestOff(groupId) {
  const grp = OFF_DATA[groupId];
  if (!grp) return;
  document.getElementById('off-table-sub').textContent = grp.title + ' — ' + grp.items.length + ' registros';
  const rows = [...grp.items].sort((a,b) => {
    // sort by date desc
    const da = a.cv['date4'] || '';
    const db = b.cv['date4'] || '';
    return db.localeCompare(da);
  });
  let aprobadas=0, pendientes=0, sinSoporte=0;
  const alerts=[];
  let tbody='';
  rows.forEach(row => {
    const estado = row.cv['status_mkn825jf'] || '';
    const soporte= row.cv['file_mm1ht7j7']  || '';
    if (estado.toLowerCase().includes('aprobad')) aprobadas++;
    else pendientes++;
    if (!soporte) { sinSoporte++; alerts.push({name:row.name}); }
    tbody += '<tr>';
    tbody += '<td class="cell-name">'+esc(row.name)+'</td>';
    // Solicitante
    const sol = row.cv['people_mkn8wds0']||'';
    tbody += '<td>'+b('b-people', sol ? sol.split('@')[0] : '—')+'</td>';
    // Motivo
    const motivo = row.cv['status_1_mkn5yhzg']||'';
    tbody += '<td>'+(motivo?b('b-date',motivo):'<span class="cell-muted">—</span>')+'</td>';
    // Fechas
    const fechas = row.cv['cronograma_mkn6bx9b']||'';
    tbody += '<td>'+(fechas?b('b-date',fechas):'<span class="cell-muted">—</span>')+'</td>';
    // Días
    const dias = row.cv['n_meros_mkn6cwvj']||'';
    tbody += '<td>'+(dias?b('b-num',dias+' d'):'<span class="cell-muted">—</span>')+'</td>';
    // Estado
    const est = row.cv['status_mkn825jf']||'';
    const estCls = est.toLowerCase().includes('aprobad') ? 'b-ok' : est.toLowerCase().includes('rechazo') ? 'b-pending' : 'b-date';
    tbody += '<td>'+(est?b(estCls,est):'<span class="cell-muted">—</span>')+'</td>';
    // Soporte
    tbody += '<td>'+(soporte?b('b-file','Archivo'):b('b-no-file','Falta'))+'</td>';
    // Observaciones
    const obs = row.cv['text_mkn8yf9q']||'';
    tbody += '<td>'+(obs?'<span style="font-size:11px">'+esc(obs.substring(0,60))+(obs.length>60?'…':'')+'</span>':'<span class="cell-muted">—</span>')+'</td>';
    tbody += '</tr>';
  });
  document.getElementById('off-tbody').innerHTML = tbody;
  document.getElementById('off-cards').innerHTML =
    card('c-total',rows.length,'Total')+
    card('c-ok',aprobadas,'Aprobadas')+
    card('c-warn',pendientes,'Pendientes')+
    card('c-danger',sinSoporte,'Sin soporte');
  const ab = document.getElementById('off-alerts');
  if (alerts.length===0) { ab.style.display='none'; return; }
  ab.style.display='';
  document.getElementById('off-alert-title').textContent = '⚠ '+alerts.length+' solicitud(es) sin soporte adjunto';
  let al='';
  alerts.forEach(a => {
    al += '<li><div class="dot"></div><div><div class="aname">'+esc(a.name)+'</div><div class="adetail">Sin archivo de soporte</div></div></li>';
  });
  document.getElementById('off-alert-list').innerHTML = al;
}

// ── Init ───────────────────────────────────────────────────────────────────
renderMDTime(MDTIME_CUR);
renderRequestOff('topics');
<\/script>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Dashboard MD Workspace ===\n");

  console.log("📅 Cargando MD-Time · HR Zone...");
  const mdTime = await fetchMDTime();

  console.log("\n📋 Cargando Request OFF...");
  const requestOff = await fetchRequestOff();

  const updatedAt = new Date().toLocaleString("es-CO", {
    dateStyle: "full", timeStyle: "short", timeZone: "America/Bogota"
  });

  console.log("\n⚙️  Generando HTML...");
  const html = buildHtml(mdTime, requestOff, updatedAt);
  fs.writeFileSync(OUTPUT_FILE, html, "utf8");

  console.log(`\n✅ Listo: ${OUTPUT_FILE}`);
  console.log(`   MD-Time alertas  : ${mdTime.weeksData[mdTime.currentGroupId] ?
    mdTime.weeksData[mdTime.currentGroupId].items.filter(r =>
      mdTime.colDefs.some(c => c.type !== 'people' && (!r.cv[c.key] || !r.cv[c.key].trim()))
    ).length : 0}`);
  console.log(`   Request OFF items: ${Object.values(requestOff.groupsData).reduce((s,g)=>s+g.items.length,0)}`);
  console.log(`   Actualizado      : ${updatedAt}`);
}

main().catch(err => { console.error("\n❌ Error:", err.message); process.exit(1); });
