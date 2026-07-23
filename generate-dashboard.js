// generate-dashboard.js
// Uso: node generate-dashboard.js
// Genera dashboard-md-time.html con datos actualizados de Monday.com

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// Token desde variable de entorno o archivo .env
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
if (!MONDAY_TOKEN) { console.error("ERROR: MONDAY_TOKEN no definido en .env"); process.exit(1); }
const BOARD_ID     = "8443645710";
const OUTPUT_FILE  = path.join(__dirname, "dashboard-md-time.html");

const COL_DEFS = [
  { key: "status_1_mkn1az5h", label: "Time",          type: "status" },
  { key: "files_mkn19bev",    label: "TIME/Pantalla",  type: "file"   },
  { key: "status_1_mkn1ntp1", label: "HR Zone",        type: "status" },
  { key: "files_1_mkn1q1sz",  label: "HRZ/Pantalla",   type: "file"   },
  { key: "color_mknvzcn3",    label: "My Hours",        type: "status" },
  { key: "file_mknvemd2",     label: "MyHours/Pant.",   type: "file"   },
];

// ── Monday API helper ─────────────────────────────────────────────────────
function mondayQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: "api.monday.com",
      path:     "/v2",
      method:   "POST",
      headers: {
        "Authorization": MONDAY_TOKEN,
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(body),
        "API-Version":   "2024-01",
      }
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.errors) return reject(new Error(json.errors.map(e => e.message).join(", ")));
          resolve(json.data);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Find current week ─────────────────────────────────────────────────────
function getCurrentWeekGroup(groups) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dated = groups
    .filter(g => /^\d{4}\/\d{2}\/\d{2}$/.test(g.title))
    .map(g => {
      const [y,m,d] = g.title.split("/").map(Number);
      return { ...g, date: new Date(y, m-1, d) };
    })
    .sort((a,b) => a.date - b.date);
  let best = dated[0];
  for (const g of dated) { if (g.date <= today) best = g; else break; }
  return best;
}

// ── Escape HTML ───────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Build badge HTML ──────────────────────────────────────────────────────
function badge(val, type) {
  const has = val && val.trim() !== "";
  if (type === "status") {
    return has ? `<span class="b b-ok">${esc(val)}</span>`
               : `<span class="b b-no-status">Falta</span>`;
  } else {
    return has ? `<span class="b b-file-ok">Archivo</span>`
               : `<span class="b b-file-no">Falta</span>`;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("Consultando grupos del tablero...");
  const d1 = await mondayQuery(`{ boards(ids:[${BOARD_ID}]) { groups { id title } } }`);
  const allGroups = d1.boards[0].groups;
  const current   = getCurrentWeekGroup(allGroups);
  console.log("Semana actual detectada:", current.title);

  // Build options HTML for all groups
  const optionsHtml = allGroups.slice().reverse().map(g => {
    const sel = g.id === current.id ? " selected" : "";
    return `<option value="${g.id}"${sel}>${esc(g.title)}</option>`;
  }).join("\n        ");

  // Fetch all groups data (last 8 weeks for quick switching)
  const recentGroups = allGroups.slice(-8);
  console.log(`Descargando datos de ${recentGroups.length} semanas...`);

  const colIds = COL_DEFS.map(c => `"${c.key}"`).join(",");
  const allData = {};

  for (const g of recentGroups) {
    process.stdout.write(`  → ${g.title} ... `);
    const q = `{
      boards(ids:[${BOARD_ID}]) {
        groups(ids:["${g.id}"]) {
          title
          items_page(limit:200) {
            items {
              id name
              column_values(ids:[${colIds}]) { id text }
            }
          }
        }
      }
    }`;
    const d = await mondayQuery(q);
    const items = d.boards[0].groups[0].items_page.items;
    allData[g.id] = {
      title: g.title,
      items: items.map(item => {
        const cv = {};
        item.column_values.forEach(c => { cv[c.id] = c.text || ""; });
        return { name: item.name, cv };
      })
    };
    console.log(`${items.length} personas`);
  }

  const updatedAt = new Date().toLocaleString("es-CO", {
    dateStyle: "full", timeStyle: "short", timeZone: "America/Bogota"
  });

  console.log("Generando HTML...");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MD-Time · HR Zone Dashboard</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.6;background:#f0f2f5;color:#1f2328;min-height:100vh}
  .topbar{background:#1f2328;color:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .topbar-title{font-size:16px;font-weight:600}
  .topbar-meta{font-size:12px;color:#9ca3af}
  .topbar-updated{font-size:11px;color:#6b7280;text-align:right}
  .week-bar{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .week-bar label{font-size:13px;font-weight:500;color:#57606a;white-space:nowrap}
  .week-bar select{border:1px solid #e5e7eb;border-radius:5px;padding:5px 10px;font-size:13px;background:#f7f8fa;color:#1f2328;cursor:pointer;min-width:160px}
  .badge-week{background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px}
  .main{max-width:900px;margin:0 auto;padding:24px 16px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center}
  .card .num{font-size:32px;font-weight:700;line-height:1}
  .card .lbl{font-size:12px;color:#57606a;margin-top:4px}
  .card.c-ok .num{color:#16a34a}.card.c-warn .num{color:#d97706}.card.c-danger .num{color:#dc2626}.card.c-total .num{color:#3b82d4}
  .pending-box{background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:24px}
  .pending-box h2{font-size:14px;font-weight:600;color:#dc2626;margin-bottom:10px}
  .pending-list{list-style:none}
  .pending-list li{padding:6px 0;border-bottom:1px solid #fee2e2;display:flex;gap:10px;align-items:flex-start}
  .pending-list li:last-child{border-bottom:none}
  .dot{width:7px;height:7px;border-radius:50%;background:#dc2626;margin-top:6px;flex-shrink:0}
  .pname{font-weight:600;font-size:13px}.pdetail{font-size:12px;color:#57606a}
  .table-wrap{background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
  .table-header{padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:space-between}
  .table-header .sub{font-size:12px;color:#57606a;font-weight:400}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead th{background:#f7f8fa;padding:9px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e7eb;white-space:nowrap}
  tbody td{padding:8px 12px;border-bottom:1px solid #f0f2f5;vertical-align:middle}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover td{background:#f7f8fa}
  .pname-cell{font-weight:500;white-space:nowrap}
  .b{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap}
  .b-ok{background:#dcfce7;color:#15803d}.b-no-status{background:#fee2e2;color:#991b1b}
  .b-file-ok{background:#dbeafe;color:#1d4ed8}.b-file-no{background:#fef9c3;color:#854d0e}
  @media(max-width:600px){table{font-size:11px}thead th,tbody td{padding:6px 8px}}
</style>
</head>
<body>

<div class="topbar">
  <div>
    <div class="topbar-title">MD-Time · HR Zone · Success Factors</div>
    <div class="topbar-meta">ibm.monday.com/boards/8443645710</div>
  </div>
  <div class="topbar-updated">Generado: ${updatedAt}</div>
</div>

<div class="week-bar">
  <label>Semana:</label>
  <select id="weekSelect" onchange="renderWeek(this.value)">
        ${optionsHtml}
  </select>
  <span class="badge-week" id="weekBadge">Semana actual</span>
</div>

<div class="main">
  <div class="cards">
    <div class="card c-total"><div class="num" id="cTotal">—</div><div class="lbl">Total personas</div></div>
    <div class="card c-ok">  <div class="num" id="cComplete">—</div><div class="lbl">Completaron todo</div></div>
    <div class="card c-warn"><div class="num" id="cPartial">—</div><div class="lbl">Parcialmente</div></div>
    <div class="card c-danger"><div class="num" id="cNone">—</div><div class="lbl">Sin documentación</div></div>
  </div>

  <div class="pending-box" id="pendingBox">
    <h2 id="pendingTitle">Personas con documentación pendiente</h2>
    <ul class="pending-list" id="pendingList"></ul>
  </div>

  <div class="table-wrap">
    <div class="table-header">
      <span>Detalle por persona</span>
      <span class="sub" id="tableWeekLabel"></span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Time</th><th>TIME/Pantalla</th>
          <th>HR Zone</th><th>HRZ/Pantalla</th>
          <th>My Hours</th><th>MyHours/Pant.</th>
        </tr>
      </thead>
      <tbody id="tableBody"></tbody>
    </table>
  </div>
</div>

<script>
const DATA     = ${JSON.stringify(allData)};
const COL_DEFS = ${JSON.stringify(COL_DEFS)};
const CURRENT_GROUP = "${current.id}";

function esc(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function renderWeek(groupId) {
  const week = DATA[groupId];
  if (!week) { document.getElementById("tableBody").innerHTML = "<tr><td colspan='7'>Sin datos para esta semana</td></tr>"; return; }

  document.getElementById("tableWeekLabel").textContent = "Semana " + week.title;
  document.getElementById("weekBadge").textContent = (groupId === CURRENT_GROUP) ? "Semana actual" : "";

  const rows = [...week.items].sort((a,b) => a.name.localeCompare(b.name));
  let cComplete=0, cPartial=0, cNone=0;
  const pending=[];

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  rows.forEach(row => {
    const missing = [];
    let doneCount = 0;
    COL_DEFS.forEach(col => {
      const has = row.cv[col.key] && row.cv[col.key].trim() !== "";
      if (has) doneCount++; else missing.push(col.label);
    });
    if (doneCount === COL_DEFS.length) cComplete++;
    else if (doneCount === 0) cNone++;
    else cPartial++;
    if (missing.length > 0) pending.push({ name: row.name, missing });

    let html = '<td class="pname-cell">' + esc(row.name) + '</td>';
    COL_DEFS.forEach(col => {
      const val = row.cv[col.key];
      const has = val && val.trim() !== "";
      if (col.type === "status") {
        html += has ? '<td><span class="b b-ok">'+esc(val)+'</span></td>'
                    : '<td><span class="b b-no-status">Falta</span></td>';
      } else {
        html += has ? '<td><span class="b b-file-ok">Archivo</span></td>'
                    : '<td><span class="b b-file-no">Falta</span></td>';
      }
    });
    const tr = document.createElement("tr");
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  document.getElementById("cTotal").textContent    = rows.length;
  document.getElementById("cComplete").textContent = cComplete;
  document.getElementById("cPartial").textContent  = cPartial;
  document.getElementById("cNone").textContent     = cNone;

  const ul = document.getElementById("pendingList");
  ul.innerHTML = "";
  document.getElementById("pendingTitle").textContent = "Personas con documentación pendiente (" + pending.length + ")";
  document.getElementById("pendingBox").style.display = pending.length === 0 ? "none" : "";
  pending.sort((a,b)=>b.missing.length-a.missing.length).forEach(p => {
    const li = document.createElement("li");
    li.innerHTML = '<div class="dot"></div><div><div class="pname">'+esc(p.name)+'</div><div class="pdetail">Falta: '+p.missing.map(esc).join(" · ")+'</div></div>';
    ul.appendChild(li);
  });
}

renderWeek(document.getElementById("weekSelect").value);
<\/script>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_FILE, html, "utf8");
  console.log("\nDashboard generado:", OUTPUT_FILE);
  console.log("Actualizado:", updatedAt);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
