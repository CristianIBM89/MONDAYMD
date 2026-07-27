// slack-bot.js
// Publica el dashboard MD completo (persona por persona) en Slack
// Requiere: SLACK_WEBHOOK_URL y MONDAY_TOKEN en .env
// Prueba inmediata: node slack-bot.js

const https  = require("https");
const { URL } = require("url");

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const MONDAY_TOKEN  = process.env.MONDAY_TOKEN;

// ── Monday API ────────────────────────────────────────────────────────────────
function mondayQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: "api.monday.com", path: "/v2", method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Authorization":  MONDAY_TOKEN,
        "API-Version":    "2024-01",
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
    req.write(body); req.end();
  });
}

// ── Enviar bloque a Slack ──────────────────────────────────────────────────────
function postSlack(payload) {
  if (!SLACK_WEBHOOK) throw new Error("SLACK_WEBHOOK_URL no definida en .env");
  const parsed = new URL(SLACK_WEBHOOK);
  const body   = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname, path: parsed.pathname + parsed.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, res => {
      let data = ""; res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

// ── Semana actual ──────────────────────────────────────────────────────────────
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

// ── Icono por estado ───────────────────────────────────────────────────────────
function icon(text) {
  if (!text || !text.trim()) return "⬜";
  const t = text.toLowerCase();
  if (t === "enviado")   return "✅";
  if (t === "pendiente") return "🔴";
  if (t === "en proceso" || t === "working on it") return "🟡";
  return "🔵";
}

// ── Construir y publicar ───────────────────────────────────────────────────────
async function publishToSlack() {
  // -- MD-Time: semana actual, todos los integrantes --
  const TIME_COL    = "status_1_mkn1az5h";
  const HRZONE_COL  = "status_1_mkn1ntp1";
  const MYHOURS_COL = "color_mknvzcn3";

  const d0 = await mondayQuery(`{ boards(ids:[8443645710]) { groups { id title } } }`);
  const allGroups = d0.boards[0].groups;
  const cur = getCurrentWeekGroup(allGroups);
  const weekLabel = cur ? cur.title : "—";

  const dMD = await mondayQuery(`{
    boards(ids:[8443645710]) {
      groups(ids:["${cur.id}"]) {
        items_page(limit:200) {
          items { name column_values(ids:["${TIME_COL}","${HRZONE_COL}","${MYHOURS_COL}"]) { id text } }
        }
      }
    }
  }`);
  const personas = dMD.boards[0].groups[0].items_page.items.map(item => {
    const cv = {};
    item.column_values.forEach(c => { cv[c.id] = c.text || ""; });
    return { name: item.name, time: cv[TIME_COL], hrzone: cv[HRZONE_COL], myhours: cv[MYHOURS_COL] };
  });

  const total    = personas.length;
  const timeOk   = personas.filter(p => p.time   === "Enviado").length;
  const hrzOk    = personas.filter(p => p.hrzone  === "Enviado").length;
  const myhOk    = personas.filter(p => p.myhours === "Enviado").length;
  const pendientes = personas.filter(p => p.time !== "Enviado" || p.hrzone !== "Enviado");

  // -- Request OFF --
  const dOff = await mondayQuery(`{
    boards(ids:[8488385355]) {
      groups(ids:["topics","new_group_mkn8gp5j"]) {
        title
        items_page(limit:200) {
          items {
            name
            column_values(ids:["status_1_mkn5yhzg","cronograma_mkn6bx9b","n_meros_mkn6cwvj","status_mkn825jf"]) { id text }
          }
        }
      }
    }
  }`);
  const solicitudes = dOff.boards[0].groups.find(g => g.title === "Solicitudes" || g.title === "topics")
    || dOff.boards[0].groups[0];
  const aprobadas = dOff.boards[0].groups.find(g => g.title === "Aprobadas" || g.title === "new_group_mkn8gp5j")
    || dOff.boards[0].groups[1];

  const solItems = solicitudes.items_page.items;
  const aprItems = aprobadas?.items_page?.items || [];

  // -- Fecha --
  const hoy = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Bogota"
  });

  // ── Bloque 1: Encabezado ────────────────────────────────────────────────────
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "📊 Dashboard MD Workspace — Resumen Semanal", emoji: true }
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Semana:* ${weekLabel}   •   ${hoy}` }]
    },
    { type: "divider" },

    // ── Resumen numérico MD-Time ─────────────────────────────────────────────
    {
      type: "section",
      text: { type: "mrkdwn", text: "*⏱ MD-Time / HR Zone / My Hours — Estado de la semana*" }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*MD-Time*\n✅ Enviado: *${timeOk}/${total}*\n⬜ Pendiente: *${total - timeOk}*` },
        { type: "mrkdwn", text: `*HR Zone*\n✅ Enviado: *${hrzOk}/${total}*\n⬜ Pendiente: *${total - hrzOk}*` },
        { type: "mrkdwn", text: `*My Hours*\n✅ Enviado: *${myhOk}/${total}*\n⬜ Pendiente: *${total - myhOk}*` }
      ]
    },
    { type: "divider" },

    // ── Tabla persona por persona ────────────────────────────────────────────
    {
      type: "section",
      text: { type: "mrkdwn", text: "*👤 Estado por persona*\n_Time · HR Zone · My Hours_" }
    }
  ];

  // Dividir personas en grupos de 10 (límite visual de Slack)
  const chunks = [];
  for (let i = 0; i < personas.length; i += 10) chunks.push(personas.slice(i, i + 10));

  for (const chunk of chunks) {
    const lines = chunk.map(p =>
      `${icon(p.time)} ${icon(p.hrzone)} ${icon(p.myhours)}   *${p.name}*`
    ).join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines } });
  }

  // ── Pendientes con alerta ─────────────────────────────────────────────────
  if (pendientes.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🔴 Pendientes (${pendientes.length})*` }
    });
    const pendLines = pendientes.map(p => {
      const faltantes = [];
      if (p.time    !== "Enviado") faltantes.push("Time");
      if (p.hrzone  !== "Enviado") faltantes.push("HR Zone");
      if (p.myhours !== "Enviado") faltantes.push("My Hours");
      return `• *${p.name}* — falta: ${faltantes.join(", ")}`;
    }).join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: pendLines } });
  }

  // ── Request OFF ──────────────────────────────────────────────────────────
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*🗓 Request OFF — Solicitudes (${solItems.length})*` }
  });

  if (solItems.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "_Sin solicitudes esta semana_" } });
  } else {
    const solLines = solItems.map(item => {
      const cv = {};
      item.column_values.forEach(c => { cv[c.id] = c.text || ""; });
      const estado = cv["status_mkn825jf"] || "—";
      const fechas = cv["cronograma_mkn6bx9b"] || "—";
      const dias   = cv["n_meros_mkn6cwvj"]   || "—";
      const motivo = cv["status_1_mkn5yhzg"]  || "—";
      return `• *${item.name}* — ${motivo} | ${fechas} | ${dias} días | _${estado}_`;
    }).join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: solLines } });
  }

  if (aprItems.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*✅ Aprobadas (${aprItems.length})*` }
    });
    const aprLines = aprItems.map(item => {
      const cv = {};
      item.column_values.forEach(c => { cv[c.id] = c.text || ""; });
      const fechas = cv["cronograma_mkn6bx9b"] || "—";
      const dias   = cv["n_meros_mkn6cwvj"]   || "—";
      return `• *${item.name}* — ${fechas} | ${dias} días`;
    }).join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: aprLines } });
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "✅ = Enviado   🔴 = Pendiente   🟡 = En proceso   ⬜ = Sin datos" }]
  });

  await postSlack({ blocks });
  console.log(`[Slack] Resumen completo publicado — ${new Date().toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}`);
}

// ── Exportar para server.js ───────────────────────────────────────────────────
module.exports = { publishToSlack };

// ── Ejecución directa: node slack-bot.js ─────────────────────────────────────
if (require.main === module) {
  if (!MONDAY_TOKEN) { console.error("❌ MONDAY_TOKEN no definido en .env"); process.exit(1); }
  if (!SLACK_WEBHOOK) { console.error("❌ SLACK_WEBHOOK_URL no definido en .env"); process.exit(1); }
  publishToSlack().catch(err => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
}
