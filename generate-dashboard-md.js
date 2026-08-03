// generate-dashboard-md.js
// Genera dashboard-md-workspace.html con datos de:
//   1. MD-Time · HR Zone · Success Factors  (por semana)
//   2. Request OFF  (grupos: Solicitudes + Aprobadas)
// Uso: node generate-dashboard-md.js

const https  = require("https");
const fs     = require("fs");
const path   = require("path");
const { execSync } = require("child_process");

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

// ── Fetch MD-Time (ALL weeks) ──────────────────────────────────────────────
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
  // Descargar TODOS los grupos (no solo los últimos 8)
  const recentGroups = allGroups;
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

// ── Fetch Request OFF (ALL groups) ────────────────────────────────────────
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

  // Descargar TODOS los grupos del tablero automáticamente
  const d0 = await mondayQuery(`{ boards(ids:[8488385355]) { groups { id title } } }`);
  const TARGET_GROUPS = d0.boards[0].groups.map(g => ({ id: g.id, label: g.title }));

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
      if (!row.cv["file_mm1ht7j7"] || row.cv["file_mm1ht7j7"].trim() === "")
        offAlerts.push({ name: row.name });
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

  const curWeekTitle = curWeek ? esc(curWeek.title) : "";

  // ── Alert cards HTML ──
  const mdAlertCards = mdAlerts.length
    ? mdAlerts.sort((a,b) => b.missing.length - a.missing.length).map(a =>
        '<div class="alert-card">' +
        '<div class="ac-board">MD-Time \xb7 HR Zone</div>' +
        '<div class="ac-name">' + esc(a.name) + '</div>' +
        '<div class="ac-detail">Falta: ' + a.missing.map(esc).join(' \xb7 ') + '</div></div>'
      ).join("")
    : '<div style="color:var(--muted);font-size:12px">Sin pendientes \u2713</div>';

  const offAlertCards = offAlerts.length
    ? offAlerts.map(a =>
        '<div class="alert-card cal">' +
        '<div class="ac-board">Request OFF \xb7 Solicitudes</div>' +
        '<div class="ac-name">' + esc(a.name) + '</div>' +
        '<div class="ac-detail">Sin archivo de soporte</div></div>'
      ).join("")
    : '<div style="color:var(--muted);font-size:12px">Sin pendientes \u2713</div>';

  // ── Cover chips HTML ──
  const coverChips =
    (totalAlerts > 0  ? '<span class="chip chip-red">\u26a0 ' + totalAlerts + ' pendientes</span>' : '') +
    (mdAlerts.length  ? '<span class="chip chip-red">\u23f1 ' + mdAlerts.length + ' en MD-Time</span>' : '') +
    (offAlerts.length ? '<span class="chip chip-red">\ud83d\uddd3 ' + offAlerts.length + ' en Request OFF</span>' : '');

  // ── Nav badges ──
  const mdBadge  = mdAlerts.length  ? '<span class="nav-badge">' + mdAlerts.length  + '</span>' : '';
  const offBadge = offAlerts.length ? '<span class="nav-badge">' + offAlerts.length + '</span>' : '';

  // ── Client-side JS (written as plain string to avoid template-literal conflicts) ──
  const clientJS = [
    'const MDTIME_DATA=' + JSON.stringify(mdTime.weeksData) + ';',
    'const MDTIME_COLS=' + JSON.stringify(mdTime.colDefs) + ';',
    'const MDTIME_CUR='  + JSON.stringify(mdTime.currentGroupId) + ';',
    'const OFF_DATA='    + JSON.stringify(requestOff.groupsData) + ';',
    '',
    'function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}',
    'function kpi(c,n,l){return \'<div class="kpi \'+c+\'"><div class="kpi-num">\'+n+\'</div><div class="kpi-lbl">\'+l+\'</div></div>\'}',
    'function b(c,t){return \'<span class="b \'+c+\'">\'+esc(t)+\'</span>\'}',
    '',
    'let current=0;const TOTAL=4;',
    'function goTo(n){',
    '  const prev=document.getElementById("slide-"+current);',
    '  prev.classList.remove("active");prev.classList.add("out");',
    '  setTimeout(()=>prev.classList.remove("out"),350);',
    '  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));',
    '  current=((n%TOTAL)+TOTAL)%TOTAL;',
    '  document.getElementById("slide-"+current).classList.add("active");',
    '  document.getElementById("nav-"+current).classList.add("active");',
    '}',
    'document.getElementById("btn-prev").addEventListener("click",()=>goTo(current-1));',
    'document.getElementById("btn-next").addEventListener("click",()=>goTo(current+1));',
    'document.addEventListener("keydown",e=>{',
    '  if(e.key==="ArrowRight"||e.key==="ArrowDown")goTo(current+1);',
    '  if(e.key==="ArrowLeft"||e.key==="ArrowUp")goTo(current-1);',
    '});',
    '',
    'function renderMDTime(gid){',
    '  const wk=MDTIME_DATA[gid];if(!wk)return;',
    '  document.getElementById("mdtime-cur-badge").style.display=gid===MDTIME_CUR?"":"none";',
    '  document.getElementById("mdtime-table-sub").textContent="Semana "+wk.title;',
    '  const rows=[...wk.items].sort((a,b)=>a.name.localeCompare(b.name));',
    '  let done=0,partial=0,none=0,pending=[],tbody="";',
    '  rows.forEach(r=>{',
    '    let f=0,m=[];',
    '    MDTIME_COLS.forEach(c=>{const v=r.cv[c.key];v&&v.trim()?f++:m.push(c.label);});',
    '    f===MDTIME_COLS.length?done++:f===0?none++:partial++;',
    '    if(m.length)pending.push({name:r.name,missing:m});',
    '    tbody+=\'<tr><td class="cell-name">\'+esc(r.name)+\'</td>\';',
    '    MDTIME_COLS.forEach(c=>{const v=r.cv[c.key],has=v&&v.trim();',
    '      tbody+=\'<td>\'+(c.type==="status"?(has?b("b-ok",v):b("b-pending","Falta")):(has?b("b-file","Archivo"):b("b-no-file","Falta")))+\'</td>\';',
    '    });',
    '    tbody+="</tr>";',
    '  });',
    '  document.getElementById("mdtime-tbody").innerHTML=tbody;',
    '  document.getElementById("mdtime-cards").innerHTML=kpi("kpi-blue",rows.length,"Total")+kpi("kpi-ok",done,"Completos")+kpi("kpi-warn",partial,"Parciales")+kpi("kpi-red",none,"Sin datos");',
    '  const ab=document.getElementById("mdtime-alerts");',
    '  if(!pending.length){ab.style.display="none";return;}',
    '  ab.style.display="";',
    '  document.getElementById("mdtime-alert-title").textContent="\\u26a0 "+pending.length+" persona(s) con documentaci\\u00f3n pendiente";',
    '  document.getElementById("mdtime-alert-list").innerHTML=pending.sort((a,b)=>b.missing.length-a.missing.length).map(p=>\'<li><div class="dot-sm"></div><div><div class="aname">\'+esc(p.name)+\'</div><div class="adetail">Falta: \'+p.missing.map(esc).join(" \\u00b7 ")+\'</div></div></li>\').join("");',
    '}',
    '',
    'function renderRequestOff(gid){',
    '  const grp=OFF_DATA[gid];if(!grp)return;',
    '  document.getElementById("off-table-sub").textContent=grp.title+" \\u2014 "+grp.items.length+" registros";',
    '  const rows=[...grp.items].sort((a,b)=>(b.cv["date4"]||"").localeCompare(a.cv["date4"]||""));',
    '  let aprobadas=0,pendientes=0,sinSoporte=0,alerts=[],tbody="";',
    '  rows.forEach(r=>{',
    '    const est=r.cv["status_mkn825jf"]||"",sop=r.cv["file_mm1ht7j7"]||"";',
    '    est.toLowerCase().includes("aprobad")?aprobadas++:pendientes++;',
    '    if(!sop){sinSoporte++;alerts.push({name:r.name});}',
    '    const sol=r.cv["people_mkn8wds0"]||"",mot=r.cv["status_1_mkn5yhzg"]||"",fec=r.cv["cronograma_mkn6bx9b"]||"",dias=r.cv["n_meros_mkn6cwvj"]||"",obs=r.cv["text_mkn8yf9q"]||"";',
    '    const eCls=est.toLowerCase().includes("aprobad")?"b-ok":est.toLowerCase().includes("rechazo")?"b-pending":"b-date";',
    '    tbody+=\'<tr>\'+',
    '      \'<td class="cell-name">\'+esc(r.name)+\'</td>\'+',
    '      \'<td>\'+b("b-people",sol?sol.split("@")[0]:"\\u2014")+\'</td>\'+',
    '      \'<td>\'+(mot?b("b-date",mot):\'<span class="cell-muted">\\u2014</span>\')+\'</td>\'+',
    '      \'<td>\'+(fec?b("b-date",fec):\'<span class="cell-muted">\\u2014</span>\')+\'</td>\'+',
    '      \'<td>\'+(dias?b("b-num",dias+" d"):\'<span class="cell-muted">\\u2014</span>\')+\'</td>\'+',
    '      \'<td>\'+(est?b(eCls,est):\'<span class="cell-muted">\\u2014</span>\')+\'</td>\'+',
    '      \'<td>\'+(sop?b("b-file","Archivo"):b("b-no-file","Falta"))+\'</td>\'+',
    '      \'<td>\'+(obs?\'<span style="font-size:11px">\'+esc(obs.substring(0,50))+(obs.length>50?"\\u2026":"")+\'</span>\':\'<span class="cell-muted">\\u2014</span>\')+\'</td>\'+',
    '    \'</tr>\';',
    '  });',
    '  document.getElementById("off-tbody").innerHTML=tbody;',
    '  document.getElementById("off-cards").innerHTML=kpi("kpi-blue",rows.length,"Total")+kpi("kpi-ok",aprobadas,"Aprobadas")+kpi("kpi-warn",pendientes,"Pendientes")+kpi("kpi-red",sinSoporte,"Sin soporte");',
    '  const ab=document.getElementById("off-alerts");',
    '  if(!alerts.length){ab.style.display="none";return;}',
    '  ab.style.display="";',
    '  document.getElementById("off-alert-title").textContent="\\u26a0 "+alerts.length+" solicitud(es) sin soporte adjunto";',
    '  document.getElementById("off-alert-list").innerHTML=alerts.map(a=>\'<li><div class="dot-sm"></div><div><div class="aname">\'+esc(a.name)+\'</div><div class="adetail">Sin archivo de soporte</div></div></li>\').join("");',
    '}',
    '',
    'function changeWeek(gid){',
    '  document.getElementById("cover-week-select").value=gid;',
    '  document.getElementById("alerts-week-select").value=gid;',
    '  const wk=MDTIME_DATA[gid];',
    '  const mdAlerts=[];',
    '  if(wk){',
    '    [...wk.items].forEach(r=>{',
    '      const missing=[];',
    '      MDTIME_COLS.forEach(c=>{const v=r.cv[c.key];if(!(v&&v.trim()))missing.push(c.label);});',
    '      if(missing.length)mdAlerts.push({name:r.name,missing});',
    '    });',
    '    mdAlerts.sort((a,b_)=>b_.missing.length-a.missing.length);',
    '  }',
    '  const offAlertsData=[];',
    '  const solData=OFF_DATA["topics"];',
    '  if(solData){solData.items.forEach(r=>{if(!(r.cv["file_mm1ht7j7"]&&r.cv["file_mm1ht7j7"].trim()))offAlertsData.push({name:r.name});});}',
    '  const weekTitle=wk?wk.title:gid;',
    '  const isCur=gid===MDTIME_CUR;',
    '  const total=mdAlerts.length+offAlertsData.length;',
    '  document.getElementById("cover-sub-week").innerHTML="Semana "+esc(weekTitle)+" \\u00a0\\u00b7\\u00a0 Estado de documentaci\\u00f3n y solicitudes";',
    '  document.getElementById("cover-cur-badge").style.display=isCur?"":"none";',
    '  const chips=',
    '    (total>0?\'<span class="chip chip-red">\\u26a0 \'+total+\' pendientes</span>\':"")+',
    '    (mdAlerts.length?\'<span class="chip chip-red">\\u23f1 \'+mdAlerts.length+\' en MD-Time</span>\':"")+',
    '    (offAlertsData.length?\'<span class="chip chip-red">\\ud83d\\uddd3 \'+offAlertsData.length+\' en Request OFF</span>\':"")',
    '    ||\'<span class="chip chip-blue">\\u2713 Sin pendientes</span>\';',
    '  document.getElementById("cover-chips").innerHTML=chips;',
    '  document.getElementById("alerts-total-badge").textContent=total+" pendientes";',
    '  document.getElementById("alerts-sec-time").textContent="\\u23f1 MD-Time \\u00b7 Semana "+weekTitle+" \\u2014 "+mdAlerts.length+" pendientes";',
    '  document.getElementById("alerts-sec-off").textContent="\\ud83d\\uddd3 Request OFF \\u00b7 Sin soporte \\u2014 "+offAlertsData.length+" pendientes";',
    '  document.getElementById("alert-grid-time").innerHTML=mdAlerts.length',
    '    ?mdAlerts.map(a=>\'<div class="alert-card"><div class="ac-board">MD-Time \\u00b7 HR Zone</div><div class="ac-name">\'+esc(a.name)+\'</div><div class="ac-detail">Falta: \'+a.missing.map(esc).join(" \\u00b7 ")+\'</div></div>\').join("")',
    '    :\'<div style="color:var(--muted);font-size:12px">\\u2713 Sin pendientes para esta semana</div>\';',
    '  document.getElementById("alert-grid-off").innerHTML=offAlertsData.length',
    '    ?offAlertsData.map(a=>\'<div class="alert-card cal"><div class="ac-board">Request OFF \\u00b7 Solicitudes</div><div class="ac-name">\'+esc(a.name)+\'</div><div class="ac-detail">Sin archivo de soporte</div></div>\').join("")',
    '    :\'<div style="color:var(--muted);font-size:12px">\\u2713 Sin pendientes</div>\';',
    '}',
    '',
    'renderMDTime(MDTIME_CUR);',
    'renderRequestOff("topics");',
    'changeWeek(MDTIME_CUR);',
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard MD · Workspace IBM</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --blue:#0f62fe;--blue-dark:#0043ce;--blue-light:#d0e2ff;
  --surface:#f4f4f4;--white:#ffffff;--border:#e0e0e0;--border2:#c6c6c6;
  --text:#161616;--muted:#6f6f6f;--ok:#24a148;--ok-bg:#defbe6;
  --warn-bg:#fdf6dd;--danger:#da1e28;--danger-bg:#fff1f1;
  --topbar-h:60px;--nav-h:50px;
}
html,body{height:100%;overflow:hidden}
body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.6;background:var(--surface);color:var(--text);display:flex;flex-direction:column}
.topbar{background:#fff;height:var(--topbar-h);min-height:var(--topbar-h);display:flex;align-items:center;padding:0 28px;gap:18px;border-bottom:2px solid var(--blue);flex-shrink:0;z-index:10;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.topbar-divider{width:1px;height:32px;background:var(--border2);flex-shrink:0}
.topbar-info{flex:1}
.topbar-title{font-size:15px;font-weight:700;color:var(--text);letter-spacing:.01em}
.topbar-sub{font-size:11px;color:var(--muted)}
.topbar-date{font-size:11px;color:var(--muted);white-space:nowrap}
.deck{flex:1;position:relative;overflow:hidden}
.slide{position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;pointer-events:none;transform:translateX(48px);transition:opacity .3s ease,transform .3s ease;overflow-y:auto;background:var(--surface)}
.slide.active{opacity:1;pointer-events:auto;transform:translateX(0)}
.slide.out{opacity:0;transform:translateX(-48px)}
.slide-cover{background:#fff;align-items:center;justify-content:center;text-align:center;gap:0}
.cover-logo-wrap{margin-bottom:32px}
.cover-title{font-size:38px;font-weight:800;color:var(--text);line-height:1.15;letter-spacing:-.02em}
.cover-title em{color:var(--blue);font-style:normal}
.cover-sub{font-size:15px;color:var(--muted);margin-top:12px}
.cover-chips{display:flex;gap:10px;justify-content:center;margin-top:28px;flex-wrap:wrap}
.chip{padding:5px 15px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid}
.chip-red{border-color:#da1e28;color:#da1e28;background:#fff1f1}
.cover-hint{margin-top:44px;font-size:12px;color:#a0a0a0;display:flex;align-items:center;gap:8px}
.slide-inner{padding:28px 36px 20px;display:flex;flex-direction:column;gap:18px;flex:1}
.slide-heading{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:1.5px solid var(--border);flex-shrink:0}
.s-icon{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.s-icon-red{background:#fff1f1;border:1.5px solid #ffd7d9}
.s-icon-blue{background:#eff4ff;border:1.5px solid var(--blue-light)}
.s-icon-purple{background:#f5f0ff;border:1.5px solid #d4bbff}
.slide-eyebrow{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:2px}
.slide-title{font-size:20px;font-weight:700;color:var(--text)}
.s-badge{margin-left:auto;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;white-space:nowrap}
.s-badge-red{background:#fff1f1;color:#da1e28;border:1.5px solid #ffd7d9}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;flex-shrink:0}
.kpi{background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;border-top:3px solid var(--border)}
.kpi-num{font-size:38px;font-weight:800;line-height:1}
.kpi-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-top:4px}
.kpi-blue{border-top-color:var(--blue)}.kpi-blue .kpi-num{color:var(--blue)}
.kpi-ok{border-top-color:var(--ok)}.kpi-ok .kpi-num{color:var(--ok)}
.kpi-warn{border-top-color:#e07b00}.kpi-warn .kpi-num{color:#e07b00}
.kpi-red{border-top-color:var(--danger)}.kpi-red .kpi-num{color:var(--danger)}
.alert-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px;overflow-y:auto;flex:1;padding-bottom:4px}
.alert-card{background:#fff;border:1px solid var(--border);border-radius:8px;padding:12px 14px;border-left:3px solid var(--danger)}
.alert-card.cal{border-left-color:#8a3ffc}
.ac-board{font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
.ac-name{font-size:13px;font-weight:700;color:var(--text)}
.ac-detail{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.4}
.sec-div{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);display:flex;align-items:center;gap:10px;flex-shrink:0}
.sec-div::after{content:'';flex:1;height:1px;background:var(--border)}
.tbl-wrap{background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;flex:1;display:flex;flex-direction:column}
.tbl-bar{padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.tbl-bar .ttl{font-size:13px;font-weight:700}
.tbl-bar .sub{font-size:11px;color:var(--muted)}
.tbl-scroll{overflow:auto;flex:1}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:var(--surface);padding:8px 12px;text-align:left;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#525252;border-bottom:1.5px solid var(--border);white-space:nowrap;position:sticky;top:0}
tbody td{padding:8px 12px;border-bottom:1px solid #f4f4f4;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#f9f9f9}
.cell-name{font-weight:600;white-space:nowrap}
.cell-muted{color:#c6c6c6;font-size:11px}
.b{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap}
.b-ok{background:var(--ok-bg);color:#0d6e30}
.b-pending{background:var(--danger-bg);color:#a2191f}
.b-file{background:var(--blue-light);color:var(--blue-dark)}
.b-no-file{background:var(--warn-bg);color:#7d4a00}
.b-people{background:#f4f4f4;color:#525252;font-size:10px}
.b-date{background:#f5f0ff;color:#4a1d96}
.b-num{background:var(--ok-bg);color:#0d6e30}
.alert-inline{background:var(--danger-bg);border:1px solid #ffd7d9;border-radius:8px;padding:12px 16px;flex-shrink:0}
.alert-inline-title{font-size:12px;font-weight:700;color:var(--danger);margin-bottom:8px}
.alist{list-style:none}
.alist li{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #ffd7d9;align-items:flex-start}
.alist li:last-child{border-bottom:none}
.dot-sm{width:5px;height:5px;border-radius:50%;background:var(--danger);margin-top:7px;flex-shrink:0}
.aname{font-weight:600;font-size:12px}
.adetail{font-size:11px;color:var(--muted)}
.sel-row{display:flex;align-items:center;gap:8px}
.sel-row label{font-size:12px;font-weight:500;color:var(--muted)}
.sel-row select{background:#fff;border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;outline:none}
.sel-row select:focus{border-color:var(--blue)}
.badge-cur{background:var(--blue-light);color:var(--blue-dark);font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px}
.cover-week-row{display:flex;align-items:center;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap}
.cover-week-row label{font-size:12px;font-weight:500;color:var(--muted)}
.cover-week-row select{background:#fff;border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;outline:none}
.cover-week-row select:focus{border-color:var(--blue)}
.arrow-btn{position:fixed;top:50%;width:38px;height:38px;border-radius:50%;background:#fff;border:1.5px solid var(--border2);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);font-size:16px;transform:translateY(-50%);z-index:20;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.arrow-btn:hover{border-color:var(--blue);color:var(--blue)}
.arrow-left{left:8px}.arrow-right{right:8px}
.nav-bar{height:var(--nav-h);min-height:var(--nav-h);background:#fff;border-top:1.5px solid var(--border);display:flex;align-items:stretch;justify-content:center;flex-shrink:0;z-index:10}
.nav-btn{display:flex;align-items:center;gap:8px;padding:0 22px;cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);border-right:1px solid var(--border);user-select:none;white-space:nowrap;position:relative}
.nav-btn:last-child{border-right:none}
.nav-btn:hover{background:var(--surface);color:var(--text)}
.nav-btn.active{color:var(--blue);background:#f0f4ff}
.nav-btn.active::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--blue)}
.nav-btn.active.nav-alert-btn::after{background:var(--danger)}
.nav-btn.active.nav-alert-btn{color:var(--danger);background:var(--danger-bg)}
.nav-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.nd-blue{background:var(--blue)}.nd-red{background:var(--danger)}.nd-purple{background:#8a3ffc}
.nav-badge{font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;background:#fff1f1;color:var(--danger)}
@media(max-width:600px){.kpi-row{grid-template-columns:repeat(2,1fr)}.slide-inner{padding:16px 14px 12px}.cover-title{font-size:26px}.arrow-btn{display:none}}
</style>
</head>
<body>

<header class="topbar">
  <svg xmlns="http://www.w3.org/2000/svg" width="148" height="44" viewBox="0 0 370 110" aria-label="IBM">
    <ellipse cx="50" cy="68" rx="34" ry="34" fill="#c8a87a"/>
    <circle cx="50" cy="68" r="13" fill="#111"/>
    <path d="M16 56 Q50 6 84 56" fill="none" stroke="#d2691e" stroke-width="18" stroke-linecap="round"/>
    <ellipse cx="133" cy="46" rx="28" ry="12" fill="#2e8b2e" transform="rotate(-30 133 46)"/>
    <ellipse cx="193" cy="46" rx="28" ry="12" fill="#2e8b2e" transform="rotate(30 193 46)"/>
    <ellipse cx="163" cy="28" rx="13" ry="11" fill="#f5c518"/>
    <circle cx="156" cy="23" r="6" fill="#e8a0b8"/>
    <circle cx="170" cy="23" r="6" fill="#e8a0b8"/>
    <rect x="148" y="38" width="30" height="10" rx="2" fill="#f5c518"/>
    <rect x="148" y="48" width="30" height="10" rx="2" fill="#fff"/>
    <rect x="148" y="58" width="30" height="10" rx="2" fill="#f5c518"/>
    <rect x="148" y="68" width="30" height="10" rx="2" fill="#fff"/>
    <rect x="148" y="78" width="30" height="10" rx="2" fill="#f5c518"/>
    <ellipse cx="163" cy="90" rx="15" ry="7" fill="#f5c518"/>
    <rect x="220" y="18" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="220" y="30" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="220" y="42" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="220" y="54" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="220" y="66" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="220" y="78" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="220" y="90" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="240" y="18" width="16" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="244" y="30" width="12" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="248" y="42" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="252" y="54" width="4"  height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="248" y="66" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="244" y="78" width="12" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="240" y="90" width="16" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="318" y="18" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="318" y="30" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="318" y="42" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="318" y="54" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="318" y="66" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="318" y="78" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="318" y="90" width="18" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="300" y="18" width="16" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="300" y="30" width="12" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="300" y="42" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="300" y="66" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="300" y="78" width="12" height="7" rx="1.5" fill="#4a90d9"/>
    <rect x="300" y="90" width="16" height="7" rx="1.5" fill="#4a90d9"/>
  </svg>
  <div class="topbar-divider"></div>
  <div class="topbar-info">
    <div class="topbar-title">Dashboard · Workspace MD</div>
    <div class="topbar-sub">ibm.monday.com &nbsp;·&nbsp; 2 tableros monitoreados</div>
  </div>
  <div class="topbar-date">${updatedAt}</div>
</header>

<div class="deck">

  <!-- SLIDE 0: PORTADA -->
  <div class="slide slide-cover active" id="slide-0">
    <div class="cover-logo-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" width="260" height="80" viewBox="0 0 370 110" aria-label="IBM">
        <ellipse cx="50" cy="68" rx="34" ry="34" fill="#c8a87a"/>
        <circle cx="50" cy="68" r="13" fill="#111"/>
        <path d="M16 56 Q50 6 84 56" fill="none" stroke="#d2691e" stroke-width="18" stroke-linecap="round"/>
        <ellipse cx="133" cy="46" rx="28" ry="12" fill="#2e8b2e" transform="rotate(-30 133 46)"/>
        <ellipse cx="193" cy="46" rx="28" ry="12" fill="#2e8b2e" transform="rotate(30 193 46)"/>
        <ellipse cx="163" cy="28" rx="13" ry="11" fill="#f5c518"/>
        <circle cx="156" cy="23" r="6" fill="#e8a0b8"/>
        <circle cx="170" cy="23" r="6" fill="#e8a0b8"/>
        <rect x="148" y="38" width="30" height="10" rx="2" fill="#f5c518"/>
        <rect x="148" y="48" width="30" height="10" rx="2" fill="#fff" stroke="#e0e0e0" stroke-width="0.5"/>
        <rect x="148" y="58" width="30" height="10" rx="2" fill="#f5c518"/>
        <rect x="148" y="68" width="30" height="10" rx="2" fill="#fff" stroke="#e0e0e0" stroke-width="0.5"/>
        <rect x="148" y="78" width="30" height="10" rx="2" fill="#f5c518"/>
        <ellipse cx="163" cy="90" rx="15" ry="7" fill="#f5c518"/>
        <rect x="220" y="18" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="220" y="30" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="220" y="42" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="220" y="54" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="220" y="66" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="220" y="78" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="220" y="90" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="240" y="18" width="16" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="244" y="30" width="12" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="248" y="42" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="252" y="54" width="4"  height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="248" y="66" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="244" y="78" width="12" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="240" y="90" width="16" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="318" y="18" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="318" y="30" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="318" y="42" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="318" y="54" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="318" y="66" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="318" y="78" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="318" y="90" width="18" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="300" y="18" width="16" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="300" y="30" width="12" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="300" y="42" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="300" y="66" width="8"  height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="300" y="78" width="12" height="7" rx="1.5" fill="#4a90d9"/>
        <rect x="300" y="90" width="16" height="7" rx="1.5" fill="#4a90d9"/>
      </svg>
    </div>
    <div class="cover-title">Workspace <em>MD</em><br>Monday Dashboard</div>
    <div class="cover-sub" id="cover-sub-week">${curWeekTitle ? 'Semana ' + curWeekTitle + ' &nbsp;\xb7&nbsp; ' : ''}Estado de documentaci\xf3n y solicitudes</div>
    <div class="cover-week-row">
      <label>Semana:</label>
      <select id="cover-week-select" onchange="changeWeek(this.value)">
        ${weekOpts}
      </select>
      <span class="badge-cur" id="cover-cur-badge">Semana actual</span>
    </div>
    <div class="cover-chips" id="cover-chips">${coverChips}</div>
    <div class="cover-hint"><span>←</span> Navega con las flechas o el menú inferior <span>→</span></div>
  </div>

  <!-- SLIDE 1: ALERTAS -->
  <div class="slide" id="slide-1">
    <div class="slide-inner">
      <div class="slide-heading">
        <div class="s-icon s-icon-red">🔔</div>
        <div>
          <div class="slide-eyebrow">Resumen global</div>
          <div class="slide-title">Panel de Alertas</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:10px;align-items:center">
          <div class="sel-row">
            <label>Semana:</label>
            <select id="alerts-week-select" onchange="changeWeek(this.value)">
              ${weekOpts}
            </select>
          </div>
          <span class="s-badge s-badge-red" id="alerts-total-badge">${totalAlerts} pendientes</span>
        </div>
      </div>
      <div class="sec-div" id="alerts-sec-time">\u23f1 MD-Time \xb7 Semana ${curWeekTitle} \u2014 ${mdAlerts.length} pendientes</div>
      <div class="alert-grid" id="alert-grid-time">
        ${mdAlertCards}
      </div>
      <div class="sec-div" id="alerts-sec-off">\ud83d\uddd3 Request OFF \xb7 Sin soporte \u2014 ${offAlerts.length} pendientes</div>
      <div class="alert-grid" id="alert-grid-off" style="flex:0 0 auto">
        ${offAlertCards}
      </div>
    </div>
  </div>

  <!-- SLIDE 2: MD-TIME -->
  <div class="slide" id="slide-2">
    <div class="slide-inner">
      <div class="slide-heading">
        <div class="s-icon s-icon-blue">⏱</div>
        <div>
          <div class="slide-eyebrow">Tablero · ibm.monday.com</div>
          <div class="slide-title">MD-Time · HR Zone · Success Factors</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:10px;align-items:center">
          <div class="sel-row">
            <label>Semana:</label>
            <select id="mdtime-select" onchange="renderMDTime(this.value)">
              ${weekOpts}
            </select>
          </div>
          <span class="badge-cur" id="mdtime-cur-badge">Semana actual</span>
        </div>
      </div>
      <div class="kpi-row" id="mdtime-cards"></div>
      <div id="mdtime-alerts" class="alert-inline" style="display:none">
        <div class="alert-inline-title" id="mdtime-alert-title"></div>
        <ul class="alist" id="mdtime-alert-list"></ul>
      </div>
      <div class="tbl-wrap">
        <div class="tbl-bar">
          <span class="ttl">Detalle por persona</span>
          <span class="sub" id="mdtime-table-sub"></span>
        </div>
        <div class="tbl-scroll">
          <table>
            <thead><tr>
              <th>Nombre</th>
              <th>Time</th><th>TIME/Pant.</th>
              <th>HR Zone</th><th>HRZ/Pant.</th>
              <th>My Hours</th><th>MyHours/Pant.</th>
            </tr></thead>
            <tbody id="mdtime-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- SLIDE 3: REQUEST OFF -->
  <div class="slide" id="slide-3">
    <div class="slide-inner">
      <div class="slide-heading">
        <div class="s-icon s-icon-purple">🗓</div>
        <div>
          <div class="slide-eyebrow">Tablero · ibm.monday.com</div>
          <div class="slide-title">Request OFF</div>
        </div>
        <div style="margin-left:auto">
          <div class="sel-row">
            <label>Grupo:</label>
            <select id="off-select" onchange="renderRequestOff(this.value)">
              ${groupOpts}
            </select>
          </div>
        </div>
      </div>
      <div class="kpi-row" id="off-cards"></div>
      <div id="off-alerts" class="alert-inline" style="display:none">
        <div class="alert-inline-title" id="off-alert-title"></div>
        <ul class="alist" id="off-alert-list"></ul>
      </div>
      <div class="tbl-wrap">
        <div class="tbl-bar">
          <span class="ttl">Detalle de solicitudes</span>
          <span class="sub" id="off-table-sub"></span>
        </div>
        <div class="tbl-scroll">
          <table>
            <thead><tr>
              <th>Nombre</th><th>Solicitante</th><th>Motivo</th>
              <th>Fechas</th><th>Días</th><th>Estado</th>
              <th>Soporte</th><th>Observaciones</th>
            </tr></thead>
            <tbody id="off-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

</div>

<div class="arrow-btn arrow-left" id="btn-prev">&#8592;</div>
<div class="arrow-btn arrow-right" id="btn-next">&#8594;</div>

<nav class="nav-bar">
  <div class="nav-btn active" id="nav-0" onclick="goTo(0)">
    <span class="nav-dot nd-blue"></span> Inicio
  </div>
  <div class="nav-btn nav-alert-btn" id="nav-1" onclick="goTo(1)">
    <span class="nav-dot nd-red"></span> Alertas
    <span class="nav-badge">${totalAlerts}</span>
  </div>
  <div class="nav-btn" id="nav-2" onclick="goTo(2)">
    <span class="nav-dot nd-blue"></span> MD-Time
    ${mdBadge}
  </div>
  <div class="nav-btn" id="nav-3" onclick="goTo(3)">
    <span class="nav-dot nd-purple"></span> Request OFF
    ${offBadge}
  </div>
</nav>

<script>
${clientJS}
</script>
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

  // ── Publicar en GitHub Pages (solo cuando se corre localmente) ────────
  if (process.env.SKIP_GH_PUSH === "1") {
    console.log("\n⏭️  Push a GitHub Pages omitido (modo GitHub Actions).");
  } else {
    console.log("\n🌐 Publicando en GitHub Pages...");
    const tmpDir = path.join(__dirname, ".gh-pages-tmp");
    try {
      const remote    = "https://github.com/CristianIBM89/MONDAYMD.git";
      const commitMsg = `Dashboard update: ${updatedAt}`;

      if (fs.existsSync(tmpDir)) {
        execSync(`git worktree remove "${tmpDir}" --force`, { cwd: __dirname, stdio: "pipe" });
      }
      execSync(`git worktree add "${tmpDir}" gh-pages`, { cwd: __dirname, stdio: "pipe" });
      fs.copyFileSync(OUTPUT_FILE, path.join(tmpDir, "index.html"));
      execSync(`git add index.html`,                         { cwd: tmpDir, stdio: "pipe" });
      execSync(`git commit -m "${commitMsg}" --allow-empty`, { cwd: tmpDir, stdio: "pipe" });
      execSync(`git push ${remote} gh-pages`,                { cwd: tmpDir, stdio: "pipe" });
      execSync(`git worktree remove "${tmpDir}" --force`, { cwd: __dirname, stdio: "pipe" });
      console.log("✅ Publicado en: https://cristianibm89.github.io/MONDAYMD/");
    } catch(e) {
      console.warn("⚠️  No se pudo publicar en GitHub Pages:", e.message.split("\n")[0]);
      try { execSync(`git worktree remove "${tmpDir}" --force`, { cwd: __dirname, stdio: "pipe" }); } catch(_) {}
    }
  }
}

main().catch(err => { console.error("\n❌ Error:", err.message); process.exit(1); });
