// generate-dashboard-md.js
// Genera index.html y dashboard-md-workspace.html con datos actualizados de Monday API
// y publica la versión completa con botones y modal en GitHub Pages (gh-pages)
// Uso: node generate-dashboard-md.js

const https  = require("https");
const fs     = require("fs");
const path   = require("path");
const { execSync } = require("child_process");

// Parsear .env manualmente para no depender de la librería 'dotenv'
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  envText.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      value = value.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.trim();
    }
  });
}

const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
const OUTPUT_FILE  = path.join(__dirname, "dashboard-md-workspace.html");
const INDEX_FILE   = path.join(__dirname, "index.html");

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
    colDefs: COL_DEFS,
    allGroups,
    weeksData,
    currentGroupId: cur ? cur.id : recentGroups[recentGroups.length - 1].id
  };
}

// ── Fetch Request OFF (ALL groups) ────────────────────────────────────────
async function fetchRequestOff() {
  const COL_IDS = ["people_mkn8wds0","date4","status_mkn825jf","status_1_mkn5yhzg","cronograma_mkn6bx9b","n_meros_mkn6cwvj","file_mm1ht7j7","people_mkn5pkbz","text_mkn8yf9q"];

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
    console.log(`${items.length} registros`);
  }

  return { groupsData, defaultGroup: "topics" };
}

// ── Build HTML by updating index.html template ─────────────────────────────
function buildHtml(mdTime, requestOff, updatedAt) {
  let template = fs.readFileSync(INDEX_FILE, "utf8");

  // Update topbar date
  template = template.replace(/<div class="topbar-date">[^<]*<\/div>/, `<div class="topbar-date">${updatedAt}</div>`);

  // Update embedded JSON data
  template = template.replace(/const MDTIME_DATA=[\s\S]*?;/, `const MDTIME_DATA=${JSON.stringify(mdTime.weeksData)};`);
  template = template.replace(/const MDTIME_COLS=[\s\S]*?;/, `const MDTIME_COLS=${JSON.stringify(mdTime.colDefs)};`);
  template = template.replace(/const MDTIME_CUR=[\s\S]*?;/, `const MDTIME_CUR=${JSON.stringify(mdTime.currentGroupId)};`);
  template = template.replace(/const OFF_DATA=[\s\S]*?;/, `const OFF_DATA=${JSON.stringify(requestOff.groupsData)};`);

  return template;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Dashboard MD Workspace ===\n");

  let html;
  const updatedAt = new Date().toLocaleString("es-CO", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota"
  });

  if (MONDAY_TOKEN) {
    try {
      console.log("📅 Cargando MD-Time · HR Zone desde Monday API...");
      const mdTime = await fetchMDTime();

      console.log("\n📋 Cargando Request OFF desde Monday API...");
      const requestOff = await fetchRequestOff();

      console.log("\n⚙️  Generando HTML actualizado...");
      html = buildHtml(mdTime, requestOff, updatedAt);
      fs.writeFileSync(INDEX_FILE, html, "utf8");
    } catch(err) {
      console.warn("⚠️ Error consultando Monday API:", err.message);
      console.log("Actualizando la fecha en index.html con el contenido existente...");
      html = fs.readFileSync(INDEX_FILE, "utf8");
      html = html.replace(/<div class="topbar-date">[^<]*<\/div>/, `<div class="topbar-date">${updatedAt}</div>`);
      fs.writeFileSync(INDEX_FILE, html, "utf8");
    }
  } else {
    console.log("⚠️ MONDAY_TOKEN no encontrado. Actualizando fecha en index.html...");
    html = fs.readFileSync(INDEX_FILE, "utf8");
    html = html.replace(/<div class="topbar-date">[^<]*<\/div>/, `<div class="topbar-date">${updatedAt}</div>`);
    fs.writeFileSync(INDEX_FILE, html, "utf8");
  }

  fs.writeFileSync(OUTPUT_FILE, html, "utf8");
  console.log(`\n✅ Guardado en index.html y ${OUTPUT_FILE}`);

  // ── Publicar en GitHub Pages (gh-pages) ──────────────────────────────
  if (process.env.SKIP_GH_PUSH === "1") {
    console.log("\n⏭️ Push a GitHub Pages omitido (lo realiza GitHub Actions workflow).");
  } else {
    console.log("\n🌐 Publicando en GitHub Pages (gh-pages)...");
    try {
      execSync(`git add index.html generate-dashboard-md.js server.js`, { stdio: "pipe" });
      execSync(`git commit -m "Dashboard update: ${updatedAt}" --allow-empty`, { stdio: "pipe" });
      execSync(`git push origin main`, { stdio: "pipe" });
      execSync(`git push origin main:gh-pages --force`, { stdio: "pipe" });
      console.log("✅ Publicado exitosamente en: https://cristianibm89.github.io/MONDAYMD/");
    } catch(e) {
      console.warn("⚠️ Error al publicar en gh-pages:", e.message.split("\n")[0]);
    }
  }
}

main().catch(err => {
  console.error("\n❌ Error fatal:", err.message);
  process.exit(1);
});
