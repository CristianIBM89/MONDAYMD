// slack-bot.js
// Publica un resumen del Dashboard MD en Slack cada martes y jueves a las 5pm (Bogotá)
// Requiere: SLACK_WEBHOOK_URL en .env
// Uso standalone: node slack-bot.js  (envía inmediatamente, útil para probar)

const https   = require("https");
const { URL }  = require("url");

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const DASHBOARD_URL = process.env.RAILWAY_STATIC_URL
  ? `https://${process.env.RAILWAY_STATIC_URL}`
  : (process.env.DASHBOARD_URL || "https://mondaymd-dashboard.up.railway.app");

// ── Monday API (misma firma que server.js) ────────────────────────────────────
const MONDAY_TOKEN = process.env.MONDAY_TOKEN;

function mondayQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: "api.monday.com", path: "/v2", method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": MONDAY_TOKEN,
        "API-Version":   "2024-01",
        "Content-Length": Buffer.byteLength(body)
      }
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.errors) return reject(new Error(json.errors[0].message));
          resolve(json.data);
        } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Enviar mensaje a Slack ─────────────────────────────────────────────────────
function postSlack(payload) {
  if (!SLACK_WEBHOOK) throw new Error("SLACK_WEBHOOK_URL no definida en .env");
  const parsed = new URL(SLACK_WEBHOOK);
  const body   = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname, path: parsed.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, res => {
      let data = ""; res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

// ── Obtener resumen de la semana actual ───────────────────────────────────────
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

async function buildSummary() {
  // MD-Time: contar cuántas personas tienen cada estado en la semana actual
  const STATUS_COL = "status_1_mkn1az5h";   // columna "Time"
  const HRZONE_COL = "status_1_mkn1ntp1";   // columna "HR Zone"

  const d0 = await mondayQuery(`{ boards(ids:[8443645710]) { groups { id title } } }`);
  const allGroups = d0.boards[0].groups;
  const cur = getCurrentWeekGroup(allGroups);
  const weekLabel = cur ? cur.title : "semana actual";

  const d = await mondayQuery(`{
    boards(ids:[8443645710]) {
      groups(ids:["${cur.id}"]) {
        items_page(limit:200) {
          items { name column_values(ids:["${STATUS_COL}","${HRZONE_COL}"]) { id text } }
        }
      }
    }
  }`);
  const items = d.boards[0].groups[0].items_page.items;
  const total = items.length;

  const timeOk    = items.filter(i => i.column_values.find(c => c.id === STATUS_COL)?.text === "Enviado").length;
  const timePend  = total - timeOk;
  const hrzOk     = items.filter(i => i.column_values.find(c => c.id === HRZONE_COL)?.text === "Enviado").length;
  const hrzPend   = total - hrzOk;

  // Request OFF: contar solicitudes pendientes
  const dOff = await mondayQuery(`{
    boards(ids:[8488385355]) {
      groups(ids:["topics"]) {
        items_page(limit:200) { items { name } }
      }
    }
  }`);
  const solicitudes = dOff.boards[0].groups[0].items_page.items.length;

  return { weekLabel, total, timeOk, timePend, hrzOk, hrzPend, solicitudes };
}

// ── Construir y publicar el mensaje ──────────────────────────────────────────
async function publishToSlack() {
  const { weekLabel, total, timeOk, timePend, hrzOk, hrzPend, solicitudes } = await buildSummary();

  const hoy = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota"
  });

  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📊 Dashboard MD Workspace — Resumen Semanal", emoji: true }
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `*Semana:* ${weekLabel}  •  *Actualizado:* ${hoy}` }]
      },
      { type: "divider" },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*⏱ MD-Time*\n✅ Enviado: *${timeOk}/${total}*\n⏳ Pendiente: *${timePend}*` },
          { type: "mrkdwn", text: `*🏢 HR Zone*\n✅ Enviado: *${hrzOk}/${total}*\n⏳ Pendiente: *${hrzPend}*` }
        ]
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*🗓 Request OFF*\nSolicitudes activas esta semana: *${solicitudes}*` }
      },
      { type: "divider" },
      {
        type: "actions",
        elements: [{
          type: "button",
          text: { type: "plain_text", text: "Ver dashboard completo →", emoji: true },
          url: DASHBOARD_URL,
          style: "primary"
        }]
      }
    ]
  };

  await postSlack(payload);
  console.log(`[Slack] Resumen publicado correctamente — ${new Date().toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}`);
}

// ── Exportar para uso desde server.js / cron ──────────────────────────────────
module.exports = { publishToSlack };

// ── Ejecución directa: node slack-bot.js ─────────────────────────────────────
if (require.main === module) {
  publishToSlack().catch(err => {
    console.error("❌ Error publicando en Slack:", err.message);
    process.exit(1);
  });
}
