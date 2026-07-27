// enviar-dashboard.js
// Abre Outlook con el dashboard listo para enviar a nrincon@ibm.com
// Uso: node enviar-dashboard.js

const { execSync } = require("child_process");
const path = require("path");
const fs   = require("fs");

const DASHBOARD_FILE = path.join(__dirname, "dashboard-md-workspace.html");
const DESTINATARIO   = "nrincon@ibm.com";

if (!fs.existsSync(DASHBOARD_FILE)) {
  console.error("❌ No se encontró el dashboard. Corre primero: node generate-dashboard-md.js");
  process.exit(1);
}

// Obtener la fecha actual en español
const hoy = new Date().toLocaleDateString("es-CO", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  timeZone: "America/Bogota"
});
const hoyCorto = new Date().toLocaleDateString("es-CO", {
  year: "numeric", month: "2-digit", day: "2-digit",
  timeZone: "America/Bogota"
});

const DASHBOARD_URL = "https://cristianibm89.github.io/MONDAYMD/";

const asunto = encodeURIComponent(
  `Dashboard MD Workspace - Resumen Semanal ${hoyCorto}`
);

const cuerpo = encodeURIComponent(
  `Hola Natalia,\n\n` +
  `Aquí está el dashboard actualizado con el estado semanal del equipo MD al ${hoy}.\n\n` +
  `Puedes consultarlo en cualquier momento desde este link:\n` +
  `${DASHBOARD_URL}\n\n` +
  `El dashboard incluye:\n` +
  `• MD-Time / HR Zone / Success Factors — estado de documentación por persona\n` +
  `• Request OFF — solicitudes y aprobadas de la semana\n\n` +
  `Se actualiza automáticamente cada martes y jueves a las 5:00 p.m.\n\n` +
  `Saludos,\nCristian Avilan`
);

// Construir comando para abrir Outlook con mailto
const mailto = `mailto:${DESTINATARIO}?subject=${asunto}&body=${cuerpo}`;

console.log(`📧 Abriendo Outlook con correo para ${DESTINATARIO}...`);
console.log(`📎 Recuerda adjuntar manualmente: dashboard-md-workspace.html`);
console.log(`   Ruta: ${DASHBOARD_FILE}`);

// Abrir Outlook con el mailto
execSync(`start "" "${mailto}"`, { shell: true });

console.log(`\n✅ Listo. Outlook se abrió con el correo redactado.`);
console.log(`   El link del dashboard ya está incluido en el mensaje.`);
console.log(`   Solo haz clic en Enviar.`);
