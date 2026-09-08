// setup-monday-boards.mjs
// Adds all required custom columns to the 4 ATH boards that only have defaults.
// Run ONCE with: node setup-monday-boards.mjs
// Safe to re-run — column creation is idempotent (Monday returns existing column if title matches).
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dir, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);

const TOKEN   = env.MONDAY_API_TOKEN;
const VERSION = env.MONDAY_API_VERSION || '2024-10';

async function gql(query, variables = {}) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      Authorization: TOKEN,
      'API-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function addColumn(boardId, title, columnType, defaults = '{}') {
  try {
    const data = await gql(`
      mutation($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON!) {
        create_column(board_id: $boardId, title: $title, column_type: $columnType, defaults: $defaults) {
          id title type
        }
      }
    `, { boardId, title, columnType, defaults });
    console.log(`  ✅ Created: ${data.create_column.id} | ${title} (${columnType})`);
    return data.create_column.id;
  } catch (e) {
    // If column already exists Monday returns an error — just warn and continue
    console.log(`  ⚠️  ${title}: ${e.message.substring(0, 80)}`);
    return null;
  }
}

// ─── ATH — Sesiones y Resúmenes ──────────────────────────────────────────────
async function setupSesiones() {
  const boardId = env.MONDAY_SESSIONS_BOARD_ID;
  console.log(`\n📋 Setting up ATH — Sesiones (${boardId})`);
  await addColumn(boardId, 'Tipo de sesion',        'text');
  await addColumn(boardId, 'Iteracion',             'text');
  await addColumn(boardId, 'Gerente iteracion',     'text');
  await addColumn(boardId, 'Facilitador',           'text');
  await addColumn(boardId, 'Participantes',         'long_text');
  await addColumn(boardId, 'Resumen ejecutivo',     'long_text');
  await addColumn(boardId, 'Decisiones',            'long_text');
  await addColumn(boardId, 'Acuerdos',              'long_text');
  await addColumn(boardId, 'Acciones pendientes',   'long_text');
  await addColumn(boardId, 'Bloqueantes',           'long_text');
  await addColumn(boardId, 'Riesgos',               'long_text');
  await addColumn(boardId, 'Proximos pasos',        'long_text');
  await addColumn(boardId, 'Enlace Teams',          'link');
  await addColumn(boardId, 'Exportado por',         'text');
  await addColumn(boardId, 'Fecha exportacion',     'date');
  await addColumn(boardId, 'Aprobado exportar',     'checkbox');
  await addColumn(boardId, 'Publicado en Slack',    'checkbox');
  await addColumn(boardId, 'Fecha Slack',           'date');
  await addColumn(boardId, 'Publicado por',         'text');
  await addColumn(boardId, 'Requiere atencion gerencial', 'checkbox');
}

// ─── ATH — Bloqueantes ───────────────────────────────────────────────────────
async function setupBloqueantes() {
  const boardId = env.MONDAY_BLOCKERS_BOARD_ID;
  console.log(`\n🚧 Setting up ATH — Bloqueantes (${boardId})`);
  await addColumn(boardId, 'Descripcion',           'long_text');
  await addColumn(boardId, 'Tipo',                  'status');
  await addColumn(boardId, 'Impacto',               'status');
  await addColumn(boardId, 'Urgencia',              'status');
  await addColumn(boardId, 'Iteracion',             'text');
  await addColumn(boardId, 'Proceso afectado',      'text');
  await addColumn(boardId, 'Reportado por',         'text');
  await addColumn(boardId, 'Correo reportante',     'email');
  await addColumn(boardId, 'Responsable gestion',   'text');
  await addColumn(boardId, 'Fecha reporte',         'date');
  await addColumn(boardId, 'Fecha esperada solucion', 'date');
  await addColumn(boardId, 'Dias abierto',          'numbers');
  await addColumn(boardId, 'Requiere escalamiento', 'checkbox');
  await addColumn(boardId, 'Comentarios',           'long_text');
  await addColumn(boardId, 'Enlace evidencia',      'link');
  await addColumn(boardId, 'Fecha cierre',          'date');
}

// ─── ATH — Showcase ──────────────────────────────────────────────────────────
async function setupShowcase() {
  const boardId = env.MONDAY_SHOWCASE_BOARD_ID;
  console.log(`\n🎯 Setting up ATH — Showcase (${boardId})`);
  await addColumn(boardId, 'Iteracion',             'text');
  await addColumn(boardId, 'Descripcion',           'long_text');
  await addColumn(boardId, 'Responsable',           'text');
  await addColumn(boardId, 'Presentador',           'text');
  await addColumn(boardId, 'Fecha showcase',        'date');
  await addColumn(boardId, 'Resultado',             'long_text');
  await addColumn(boardId, 'Valor para el negocio', 'long_text');
  await addColumn(boardId, 'Retroalimentacion',     'long_text');
  await addColumn(boardId, 'Proximo paso',          'long_text');
  await addColumn(boardId, 'Enlace evidencia',      'link');
}

// ─── ATH — Retrospectiva ─────────────────────────────────────────────────────
async function setupRetro() {
  const boardId = env.MONDAY_RETRO_BOARD_ID;
  console.log(`\n🔄 Setting up ATH — Retrospectiva (${boardId})`);
  await addColumn(boardId, 'Categoria',             'status');
  await addColumn(boardId, 'Comentario',            'long_text');
  await addColumn(boardId, 'Autor',                 'text');
  await addColumn(boardId, 'Iteracion',             'text');
  await addColumn(boardId, 'Fecha',                 'date');
  await addColumn(boardId, 'Prioridad',             'numbers');
  await addColumn(boardId, 'Votos',                 'numbers');
  await addColumn(boardId, 'Accion de mejora',      'long_text');
  await addColumn(boardId, 'Responsable mejora',    'text');
  await addColumn(boardId, 'Fecha cumplimiento',    'date');
  await addColumn(boardId, 'Seguimiento siguiente', 'checkbox');
}

// Run all setups
await setupSesiones();
await setupBloqueantes();
await setupShowcase();
await setupRetro();

console.log('\n✅ All boards configured! Now run: node diagnose-monday.js\n');
console.log('Then update the column IDs in backend/src/services/monday.ts\n');
