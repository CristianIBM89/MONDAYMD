import { GraphQLClient, gql } from 'graphql-request';
import { config } from '../config';
import { auditLog } from './auditLog';

const mondayClient = new GraphQLClient('https://api.monday.com/v2', {
  headers: {
    Authorization: config.MONDAY_API_TOKEN,
    'API-Version': config.MONDAY_API_VERSION,
    'Content-Type': 'application/json',
  },
});

// ─── User resolution: Microsoft email → Monday user ID ──────────
const userCache = new Map<string, string | null>();

export async function getMondayUserId(email: string): Promise<string | null> {
  if (userCache.has(email)) return userCache.get(email)!;
  try {
    const query = gql`
      query GetUserByEmail($email: String!) {
        users(email: $email) { id name email }
      }
    `;
    const data = (await mondayClient.request(query, { email })) as {
      users: Array<{ id: string }>;
    };
    const id = data.users?.[0]?.id ?? null;
    userCache.set(email, id);
    return id;
  } catch {
    return null;
  }
}

async function resolvePersonColumn(
  email: string
): Promise<{ personsAndTeams?: Array<{ id: string; kind: string }> } | undefined> {
  const id = await getMondayUserId(email);
  if (!id) return undefined;
  return { personsAndTeams: [{ id, kind: 'person' }] };
}

// Idempotency via in-memory set (resets on backend restart — sufficient for MVP)
// Key = idempotencyKey string, value = Monday item ID
const idempotencyCache = new Map<string, string>();

async function findExistingItem(
  _boardId: string,
  idempotencyKey: string
): Promise<string | null> {
  return idempotencyCache.get(idempotencyKey) ?? null;
}

function cacheIdempotency(key: string, itemId: string): void {
  idempotencyCache.set(key, itemId);
}

// ─── SESSION: create summary record ─────────────────────────────
export interface SessionPayload {
  sessionName: string;
  sessionDate: string;
  sessionType: string;
  iterationName: string;
  iterationManagerName: string;
  participants: string[];
  executiveSummary: string;
  decisions: string[];
  agreements: string[];
  actions: string;
  blockers: string[];
  risks: string[];
  nextSteps: string[];
  teamsLink?: string;
  exportedByEmail: string;
  exportedByName: string;
  requiresManagerAttention: boolean;
}

// ─── Real column IDs for ATH — Sesiones (discovered via setup-monday-boards.mjs) ───
const SESIONES_COLS = {
  date:         'date4',
  tipo:         'text_mm70a4wd',
  iteracion:    'text_mm706w7z',
  gerente:      'text_mm7047jz',
  facilitador:  'text_mm705zf3',
  participantes:'long_text_mm705gjn',
  resumen:      'long_text_mm709ydh',
  decisiones:   'long_text_mm70s01t',
  acuerdos:     'long_text_mm707fg3',
  acciones:     'long_text_mm70vb5q',
  bloqueantes:  'long_text_mm70am7y',
  riesgos:      'long_text_mm70gm1n',
  proximos:     'long_text_mm705yj1',
  enlaceTeams:  'link_mm705x4g',
  exportadoPor: 'text_mm701nez',
  fechaExport:  'date_mm70b37r',
  slackCheck:   'boolean_mm70d3s4',
  fechaSlack:   'date_mm701se4',
  slackPor:     'text_mm70s4g0',
  gerencialCheck:'boolean_mm7059hb',
};

// ─── Real column IDs for ATH — Bloqueantes ────────────────────────────────────
const BLOQUEANTES_COLS = {
  descripcion:  'long_text_mm70yzwf',
  tipo:         'color_mm70gakb',
  impacto:      'color_mm70k8em',
  urgencia:     'color_mm70a043',
  iteracion:    'text_mm70vn3k',
  proceso:      'text_mm70amp6',
  reportadoPor: 'text_mm70hzz2',
  correo:       'email_mm70fxpm',
  responsable:  'text_mm70bzrf',
  fechaReporte: 'date_mm7064w3',
  fechaSolucion:'date_mm70q861',
  escalamiento: 'boolean_mm70h71x',
  comentarios:  'long_text_mm70deav',
  enlace:       'link_mm70karw',
  fechaCierre:  'date_mm706yx9',
};

// ─── Real column IDs for ATH — Showcase ──────────────────────────────────────
const SHOWCASE_COLS = {
  iteracion:    'text_mm70q729',
  descripcion:  'long_text_mm7031wr',
  responsable:  'text_mm709qjh',
  presentador:  'text_mm701307',
  fechaShowcase:'date_mm70ajex',
  resultado:    'long_text_mm70swhj',
  valor:        'long_text_mm70g96w',
  retro:        'long_text_mm70kh08',
  proximoPaso:  'long_text_mm7048qf',
  enlace:       'link_mm70h88x',
};

// ─── Real column IDs for ATH — Retrospectiva ─────────────────────────────────
const RETRO_COLS = {
  categoria:    'color_mm70ejk0',
  comentario:   'long_text_mm703e39',
  autor:        'text_mm70bzzr',
  iteracion:    'text_mm7083rs',
  fecha:        'date_mm70btc3',
  prioridad:    'numeric_mm701dt3',
  votos:        'numeric_mm70v3wb',
  accion:       'long_text_mm70tk4n',
  responsable:  'text_mm7043fv',
  fechaCumpl:   'date_mm70r4v1',
  seguimiento:  'boolean_mm70bnr3',
};

export async function createSessionInMonday(
  payload: SessionPayload
): Promise<{ id: string; url: string }> {
  const mutation = gql`
    mutation CreateSession($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id
        url: relative_link
      }
    }
  `;

  const personCol = await resolvePersonColumn(payload.exportedByEmail);

  const columnValues: Record<string, unknown> = {
    [SESIONES_COLS.date]:          { date: payload.sessionDate },
    [SESIONES_COLS.tipo]:          payload.sessionType,
    [SESIONES_COLS.iteracion]:     payload.iterationName,
    [SESIONES_COLS.gerente]:       payload.iterationManagerName,
    [SESIONES_COLS.participantes]: payload.participants.join(', '),
    [SESIONES_COLS.resumen]:       { text: payload.executiveSummary },
    [SESIONES_COLS.decisiones]:    { text: payload.decisions.join('\n') },
    [SESIONES_COLS.acuerdos]:      { text: payload.agreements.join('\n') },
    [SESIONES_COLS.acciones]:      { text: payload.actions },
    [SESIONES_COLS.bloqueantes]:   { text: payload.blockers.join('\n') },
    [SESIONES_COLS.riesgos]:       { text: payload.risks.join('\n') },
    [SESIONES_COLS.proximos]:      { text: payload.nextSteps.join('\n') },
    [SESIONES_COLS.exportadoPor]:  payload.exportedByName,
    [SESIONES_COLS.fechaExport]:   { date: new Date().toISOString().split('T')[0] },
    [SESIONES_COLS.gerencialCheck]:payload.requiresManagerAttention ? { checked: 'true' } : { checked: 'false' },
    status: { index: 1 },   // index 1 = Done (closest to "Aprobado" in default Monday statuses)
  };
  if (payload.teamsLink) {
    columnValues[SESIONES_COLS.enlaceTeams] = { url: payload.teamsLink, text: 'Ver en Teams' };
  }

  if (personCol) columnValues['person_col'] = personCol;

  const data = (await mondayClient.request(mutation, {
    boardId: config.MONDAY_SESSIONS_BOARD_ID,
    itemName: payload.sessionName,
    columnValues: JSON.stringify(columnValues),
  })) as { create_item: { id: string; url: string } };

  await auditLog({
    user: payload.exportedByEmail,
    action: 'MONDAY_CREATE_SESSION',
    detail: `item=${data.create_item.id}`,
    result: 'success',
  });

  return { id: data.create_item.id, url: `https://monday.com${data.create_item.url}` };
}

export async function updateSessionSlackStatus(
  itemId: string,
  userEmail: string
): Promise<void> {
  const mutation = gql`
    mutation UpdateSlack($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        board_id: $boardId
        item_id: $itemId
        column_values: $columnValues
      ) { id }
    }
  `;
  await mondayClient.request(mutation, {
    boardId: config.MONDAY_SESSIONS_BOARD_ID,
    itemId,
    columnValues: JSON.stringify({
      [SESIONES_COLS.slackCheck]: { checked: 'true' },
      [SESIONES_COLS.fechaSlack]: { date: new Date().toISOString().split('T')[0] },
      [SESIONES_COLS.slackPor]:   userEmail,
    }),
  });
  await auditLog({ user: userEmail, action: 'MONDAY_UPDATE_SLACK', detail: `item=${itemId}`, result: 'success' });
}

// ─── BLOCKER: create ─────────────────────────────────────────────
export interface BlockerPayload {
  titulo: string;
  descripcion: string;
  tipo: string;
  impacto: string;
  urgencia: string;
  iteracionNombre: string;
  procesoAfectado: string;
  reportadoPorEmail: string;
  reportadoPorNombre: string;
  responsableSugerido: string;
  fechaEsperadaSolucion: string;
  requiereEscalamiento: boolean;
  comentarios: string;
  idempotencyKey: string;
}

export async function createBlockerInMonday(
  payload: BlockerPayload
): Promise<{ id: string; url: string; alreadyExisted: boolean }> {
  const existing = await findExistingItem(config.MONDAY_BLOCKERS_BOARD_ID, payload.idempotencyKey);
  if (existing) {
    return { id: existing, url: '', alreadyExisted: true };
  }

  const mutation = gql`
    mutation CreateBlocker($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id url: relative_link
      }
    }
  `;

  // Monday status (color) columns: use the main "Status" column label for the visible state,
  // and store tipo/impacto/urgencia as text in the item name suffix to avoid label mismatch.
  const personCol = await resolvePersonColumn(payload.reportadoPorEmail);
  const columnValues: Record<string, unknown> = {
    [BLOQUEANTES_COLS.descripcion]:  { text: payload.descripcion },
    // Use index-based status (0=Working on it, 1=Done, 2=Stuck, 7=On Hold)
    // Tipo: operativo→0, tecnico→0, acceso→2, herramienta→0, dependencia→7, capacidad→7, otro→0
    // Impacto: bajo→0, medio→0, alto→2, critico→2
    // Urgencia: normal→0, urgente→2, bloqueante_total→2
    [BLOQUEANTES_COLS.tipo]:    (() => {
      const map: Record<string, number> = { operativo:0, tecnico:0, acceso:2, herramienta:0, dependencia:7, capacidad:7, otro:0 };
      return { index: map[payload.tipo] ?? 0 };
    })(),
    [BLOQUEANTES_COLS.impacto]: (() => {
      const map: Record<string, number> = { bajo:0, medio:0, alto:2, critico:2 };
      return { index: map[payload.impacto] ?? 0 };
    })(),
    [BLOQUEANTES_COLS.urgencia]: (() => {
      const map: Record<string, number> = { normal:0, urgente:2, bloqueante_total:2 };
      return { index: map[payload.urgencia] ?? 0 };
    })(),
    [BLOQUEANTES_COLS.iteracion]:    payload.iteracionNombre,
    [BLOQUEANTES_COLS.proceso]:      payload.procesoAfectado,
    [BLOQUEANTES_COLS.reportadoPor]: payload.reportadoPorNombre,
    [BLOQUEANTES_COLS.correo]:       { email: payload.reportadoPorEmail, text: payload.reportadoPorEmail },
    [BLOQUEANTES_COLS.responsable]:  payload.responsableSugerido,
    [BLOQUEANTES_COLS.fechaReporte]: { date: new Date().toISOString().split('T')[0] },
    [BLOQUEANTES_COLS.escalamiento]: payload.requiereEscalamiento ? { checked: 'true' } : { checked: 'false' },
    [BLOQUEANTES_COLS.comentarios]:  { text: payload.comentarios },
    status: { index: 0 },   // index 0 = Working on it (represents "Nuevo/En proceso")
  };
  if (payload.fechaEsperadaSolucion && payload.fechaEsperadaSolucion !== 'Pendiente por definir') {
    columnValues[BLOQUEANTES_COLS.fechaSolucion] = { date: payload.fechaEsperadaSolucion };
  }

  if (personCol) columnValues['person_col'] = personCol;

  const data = (await mondayClient.request(mutation, {
    boardId: config.MONDAY_BLOCKERS_BOARD_ID,
    itemName: payload.titulo,
    columnValues: JSON.stringify(columnValues),
  })) as { create_item: { id: string; url: string } };

  cacheIdempotency(payload.idempotencyKey, data.create_item.id);
  await auditLog({
    user: payload.reportadoPorEmail,
    action: 'MONDAY_CREATE_BLOCKER',
    detail: `item=${data.create_item.id}`,
    result: 'success',
  });

  return { id: data.create_item.id, url: `https://monday.com${data.create_item.url}`, alreadyExisted: false };
}

export async function attachFileToBlocker(
  itemId: string,
  columnId: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<void> {
  // Monday add_file_to_column requires multipart — use fetch directly
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  const mutation = `mutation ($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id } }`;
  form.append('query', mutation);
  form.append('variables[file]', fileBuffer, { filename: fileName });

  const res = await fetch('https://api.monday.com/v2/file', {
    method: 'POST',
    headers: {
      Authorization: config.MONDAY_API_TOKEN,
      'API-Version': config.MONDAY_API_VERSION,
      ...form.getHeaders(),
    },
    body: form as unknown as BodyInit,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Error adjuntando archivo en Monday: ${res.status}`);
}

// ─── ITERATION: get active ───────────────────────────────────────
export interface IterationInfo {
  id: string;
  nombre: string;
  gerenteNombre: string;
  gerenteEmail: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}

export async function getActiveIteration(): Promise<IterationInfo | null> {
  // Fetch all items and filter by status text "Activo" in the backend
  // This avoids dependency on Monday's internal column ID for status
  const query = gql`
    query GetActiveIteration($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: 50) {
          items {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `;
  try {
    const data = (await mondayClient.request(query, {
      boardId: [config.MONDAY_ITERATIONS_BOARD_ID],
    })) as {
      boards: Array<{ items_page: { items: Array<{ id: string; name: string; column_values: Array<{ id: string; text: string }> }> } }>;
    };
    const items = data.boards?.[0]?.items_page?.items ?? [];
    // Find the first item whose any status column contains "Activo"
    const item = items.find((i) =>
      i.column_values.some((c) => c.text?.toLowerCase() === 'activo')
    ) ?? items[0] ?? null;
    if (!item) return null;
    // Find column value by searching text in the column title name
    // Monday generates unique IDs per board so we match by searching all columns
    const colText = (titleKeyword: string) =>
      item.column_values.find((c) =>
        c.id === titleKeyword ||
        c.id.toLowerCase().includes(titleKeyword.toLowerCase())
      )?.text ?? '';

    const estado = item.column_values.find((c) => c.id === 'status')?.text ?? '';

    // Map exact IDs discovered via diagnose-monday.js
    const exactMap: Record<string, string> = {};
    item.column_values.forEach((c) => { exactMap[c.id] = c.text; });

    return {
      id: item.id,
      nombre: item.name,
      gerenteNombre: exactMap['text_mm702cc0'] ?? colText('gerente'),
      gerenteEmail:  exactMap['text_mm70nqx4'] ?? colText('correo'),
      fechaInicio:   exactMap['date_mm70p021'] ?? colText('inicio'),
      fechaFin:      exactMap['date_mm702dgs'] ?? colText('fin'),
      estado,
    };
  } catch {
    return null;
  }
}

export async function getAllIterations(): Promise<IterationInfo[]> {
  const query = gql`
    query GetIterations($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: 50) {
          items {
            id name
            column_values { id text }
          }
        }
      }
    }
  `;
  const data = (await mondayClient.request(query, {
    boardId: [config.MONDAY_ITERATIONS_BOARD_ID],
  })) as {
    boards: Array<{ items_page: { items: Array<{ id: string; name: string; column_values: Array<{ id: string; text: string }> }> } }>;
  };
  const items = data.boards?.[0]?.items_page?.items ?? [];
  return items.map((item) => {
    const col = (id: string) => item.column_values.find((c) => c.id === id)?.text ?? '';
    return {
      id: item.id,
      nombre: item.name,
      gerenteNombre: col('text_gerente'),
      gerenteEmail: col('text_correo'),
      fechaInicio: col('date_inicio'),
      fechaFin: col('date_fin'),
      estado: col('status'),
    };
  });
}

// ─── SHOWCASE: create ────────────────────────────────────────────
export async function createShowcaseInMonday(
  payload: {
    iteracionNombre: string; entregable: string; descripcion: string;
    responsable: string; presentador: string; fecha: string;
    resultado: string; valorNegocio: string; estado: string;
    retroalimentacion: string; proximoPaso: string;
    userEmail: string; idempotencyKey: string;
  }
): Promise<{ id: string; alreadyExisted: boolean }> {
  const existing = await findExistingItem(config.MONDAY_SHOWCASE_BOARD_ID, payload.idempotencyKey);
  if (existing) return { id: existing, alreadyExisted: true };

  const mutation = gql`
    mutation CreateShowcase($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) { id }
    }
  `;
  const data = (await mondayClient.request(mutation, {
    boardId: config.MONDAY_SHOWCASE_BOARD_ID,
    itemName: payload.entregable,
    columnValues: JSON.stringify({
      [SHOWCASE_COLS.iteracion]:    payload.iteracionNombre,
      [SHOWCASE_COLS.descripcion]:  { text: payload.descripcion },
      [SHOWCASE_COLS.responsable]:  payload.responsable,
      [SHOWCASE_COLS.presentador]:  payload.presentador,
      [SHOWCASE_COLS.fechaShowcase]:{ date: payload.fecha },
      [SHOWCASE_COLS.resultado]:    { text: payload.resultado },
      [SHOWCASE_COLS.valor]:        { text: payload.valorNegocio },
      [SHOWCASE_COLS.retro]:        { text: payload.retroalimentacion },
      [SHOWCASE_COLS.proximoPaso]:  { text: payload.proximoPaso },
      // Map estado text to Monday status index
      status: { index: (['En preparación','Listo','Presentado','Cancelado'].includes(payload.estado) ? ['En preparación','Listo','Presentado','Cancelado'].indexOf(payload.estado) : 0) },
    }),
  })) as { create_item: { id: string } };
  cacheIdempotency(payload.idempotencyKey, data.create_item.id);
  await auditLog({ user: payload.userEmail, action: 'MONDAY_CREATE_SHOWCASE', detail: `item=${data.create_item.id}`, result: 'success' });
  return { id: data.create_item.id, alreadyExisted: false };
}

// ─── RETRO: create ───────────────────────────────────────────────
// Category label map kept for reference but category is stored as a color index in Monday
// const RETRO_CATEGORY_MAP = { bien: '¿Qué hicimos bien?', mal: '¿Qué salió mal?', mejorar: '¿Qué podemos mejorar?', preguntas: 'Preguntas abiertas' };

export async function createRetroInMonday(
  payload: {
    categoria: string; comentario: string; autor: string;
    iteracionNombre: string; fecha: string; prioridad: number;
    accionMejora: string; responsableMejora: string;
    fechaCumplimiento: string; estado: string;
    userEmail: string; idempotencyKey: string;
  }
): Promise<{ id: string; alreadyExisted: boolean }> {
  const existing = await findExistingItem(config.MONDAY_RETRO_BOARD_ID, payload.idempotencyKey);
  if (existing) return { id: existing, alreadyExisted: true };

  const mutation = gql`
    mutation CreateRetro($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
    }
  `;
  const groupMap: Record<string, string> = {
    bien: 'group_bien',
    mal: 'group_mal',
    mejorar: 'group_mejorar',
    preguntas: 'group_preguntas',
  };
  const data = (await mondayClient.request(mutation, {
    boardId: config.MONDAY_RETRO_BOARD_ID,
    groupId: groupMap[payload.categoria] ?? 'topics',   // Monday default group ID is "topics"
    itemName: payload.comentario.slice(0, 80),
    columnValues: JSON.stringify({
      // Use index-based for category color column (no custom labels set): 0=Working on it, 1=Done, 2=Stuck
      // bien→0, mal→2, mejorar→7 (On Hold), preguntas→0
      [RETRO_COLS.categoria]:   { index: ({ bien:0, mal:2, mejorar:7, preguntas:0 } as Record<string,number>)[payload.categoria] ?? 0 },
      [RETRO_COLS.comentario]:  { text: payload.comentario },
      [RETRO_COLS.autor]:       payload.autor ?? '',
      [RETRO_COLS.iteracion]:   payload.iteracionNombre,
      [RETRO_COLS.fecha]:       { date: payload.fecha },
      [RETRO_COLS.prioridad]:   payload.prioridad,
      [RETRO_COLS.accion]:      { text: payload.accionMejora },
      [RETRO_COLS.responsable]: payload.responsableMejora,
      status: { index: 0 },   // 0 = Working on it (default for new retro items)
      ...(payload.fechaCumplimiento ? { [RETRO_COLS.fechaCumpl]: { date: payload.fechaCumplimiento } } : {}),
    }),
  })) as { create_item: { id: string } };
  cacheIdempotency(payload.idempotencyKey, data.create_item.id);
  await auditLog({ user: payload.userEmail, action: 'MONDAY_CREATE_RETRO', detail: `item=${data.create_item.id}`, result: 'success' });
  return { id: data.create_item.id, alreadyExisted: false };
}

// ─── DASHBOARD: query all boards ────────────────────────────────
export async function getDashboardData() {
  const blockerQuery = gql`
    query GetBlockers($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: 100) {
          items {
            id name
            column_values { id text }
          }
        }
      }
    }
  `;
  const sessionQuery = gql`
    query GetSessions($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: 20) {
          items {
            id name
            column_values { id text }
          }
        }
      }
    }
  `;

  const [blockersData, sessionsData, iteration] = await Promise.all([
    mondayClient.request(blockerQuery, { boardId: [config.MONDAY_BLOCKERS_BOARD_ID] }),
    mondayClient.request(sessionQuery, { boardId: [config.MONDAY_SESSIONS_BOARD_ID] }),
    getActiveIteration(),
  ]);

  return { blockersData, sessionsData, iteration };
}


// ─── SESSIONS: list for history view ────────────────────────────
export interface SessionRecord {
  id: string;
  nombre: string;
  fecha: string;
  tipo: string;
  iteracion: string;
  gerente: string;
  participantes: string;
  resumenEjecutivo: string;
  decisiones: string;
  acuerdos: string;
  acciones: string;
  bloqueantes: string;
  riesgos: string;
  proximosPasos: string;
  exportadoPor: string;
  fechaExportacion: string;
  publicadoEnSlack: boolean;
  requiereAtencionGerencial: boolean;
  estado: string;
}

export async function getSessions(): Promise<SessionRecord[]> {
  const query = gql`
    query GetSessions($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: 50) {
          items {
            id name
            column_values { id text }
          }
        }
      }
    }
  `;
  const data = (await mondayClient.request(query, {
    boardId: [config.MONDAY_SESSIONS_BOARD_ID],
  })) as { boards: Array<{ items_page: { items: Array<{ id: string; name: string; column_values: Array<{ id: string; text: string }> }> } }> };

  const items = data.boards?.[0]?.items_page?.items ?? [];
  return items
    .filter((i) => i.name && !i.name.startsWith('Item '))  // filter default empty items
    .map((item) => {
      const col = (id: string) => item.column_values.find((c) => c.id === id)?.text ?? '';
      return {
        id: item.id,
        nombre: item.name,
        fecha: col(SESIONES_COLS.date),
        tipo: col(SESIONES_COLS.tipo),
        iteracion: col(SESIONES_COLS.iteracion),
        gerente: col(SESIONES_COLS.gerente),
        participantes: col(SESIONES_COLS.participantes),
        resumenEjecutivo: col(SESIONES_COLS.resumen),
        decisiones: col(SESIONES_COLS.decisiones),
        acuerdos: col(SESIONES_COLS.acuerdos),
        acciones: col(SESIONES_COLS.acciones),
        bloqueantes: col(SESIONES_COLS.bloqueantes),
        riesgos: col(SESIONES_COLS.riesgos),
        proximosPasos: col(SESIONES_COLS.proximos),
        exportadoPor: col(SESIONES_COLS.exportadoPor),
        fechaExportacion: col(SESIONES_COLS.fechaExport),
        publicadoEnSlack: col(SESIONES_COLS.slackCheck) === 'true' || col(SESIONES_COLS.slackCheck) === 'v',
        requiereAtencionGerencial: col(SESIONES_COLS.gerencialCheck) === 'true' || col(SESIONES_COLS.gerencialCheck) === 'v',
        estado: col('status'),
      };
    });
}

// ─── BLOCKERS: list for history view ────────────────────────────
export interface BlockerRecord {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  impacto: string;
  urgencia: string;
  iteracion: string;
  proceso: string;
  reportadoPor: string;
  responsable: string;
  fechaReporte: string;
  fechaSolucion: string;
  escalamiento: boolean;
  comentarios: string;
  estado: string;
}

export async function getBlockersList(): Promise<BlockerRecord[]> {
  const query = gql`
    query GetBlockers($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: 100) {
          items {
            id name
            column_values { id text }
          }
        }
      }
    }
  `;
  const data = (await mondayClient.request(query, {
    boardId: [config.MONDAY_BLOCKERS_BOARD_ID],
  })) as { boards: Array<{ items_page: { items: Array<{ id: string; name: string; column_values: Array<{ id: string; text: string }> }> } }> };

  const items = data.boards?.[0]?.items_page?.items ?? [];
  return items
    .filter((i) => i.name && !i.name.startsWith('Item '))
    .map((item) => {
      const col = (id: string) => item.column_values.find((c) => c.id === id)?.text ?? '';
      return {
        id: item.id,
        nombre: item.name,
        descripcion: col(BLOQUEANTES_COLS.descripcion),
        tipo: col(BLOQUEANTES_COLS.tipo),
        impacto: col(BLOQUEANTES_COLS.impacto),
        urgencia: col(BLOQUEANTES_COLS.urgencia),
        iteracion: col(BLOQUEANTES_COLS.iteracion),
        proceso: col(BLOQUEANTES_COLS.proceso),
        reportadoPor: col(BLOQUEANTES_COLS.reportadoPor),
        responsable: col(BLOQUEANTES_COLS.responsable),
        fechaReporte: col(BLOQUEANTES_COLS.fechaReporte),
        fechaSolucion: col(BLOQUEANTES_COLS.fechaSolucion),
        escalamiento: col(BLOQUEANTES_COLS.escalamiento) === 'true' || col(BLOQUEANTES_COLS.escalamiento) === 'v',
        comentarios: col(BLOQUEANTES_COLS.comentarios),
        estado: col('status'),
      };
    });
}


// ─── ITERATION: create ───────────────────────────────────────────
// Column IDs for ATH — Iteraciones (discovered via diagnose-monday.js)
const ITERACIONES_COLS = {
  gerenteNombre: 'text_mm702cc0',
  gerenteEmail:  'text_mm70nqx4',
  fechaInicio:   'date_mm70p021',
  fechaFin:      'date_mm702dgs',
};

export interface IterationCreatePayload {
  nombre: string;
  gerenteNombre: string;
  gerenteEmail: string;
  fechaInicio: string;
  fechaFin: string;
  userEmail: string;
}

export async function createIterationInMonday(
  payload: IterationCreatePayload
): Promise<{ id: string }> {
  const mutation = gql`
    mutation CreateIteration($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) { id }
    }
  `;
  const columnValues: Record<string, unknown> = {
    [ITERACIONES_COLS.gerenteNombre]: payload.gerenteNombre,
    [ITERACIONES_COLS.gerenteEmail]:  payload.gerenteEmail,
    status: { index: 1 },   // index 1 = Activo
  };
  if (payload.fechaInicio) columnValues[ITERACIONES_COLS.fechaInicio] = { date: payload.fechaInicio };
  if (payload.fechaFin)    columnValues[ITERACIONES_COLS.fechaFin]    = { date: payload.fechaFin };

  const data = (await mondayClient.request(mutation, {
    boardId: config.MONDAY_ITERATIONS_BOARD_ID,
    itemName: payload.nombre,
    columnValues: JSON.stringify(columnValues),
  })) as { create_item: { id: string } };

  await auditLog({ user: payload.userEmail, action: 'MONDAY_CREATE_ITERATION', detail: `item=${data.create_item.id} nombre=${payload.nombre}`, result: 'success' });
  return { id: data.create_item.id };
}

export async function closeIterationInMonday(
  itemId: string,
  userEmail: string
): Promise<void> {
  const mutation = gql`
    mutation CloseIteration($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
    }
  `;
  await mondayClient.request(mutation, {
    boardId: config.MONDAY_ITERATIONS_BOARD_ID,
    itemId,
    columnValues: JSON.stringify({ status: { index: 0 } }),   // index 0 = Cerrado/Done
  });
  await auditLog({ user: userEmail, action: 'MONDAY_CLOSE_ITERATION', detail: `item=${itemId}`, result: 'success' });
}

export async function updateIterationInMonday(
  itemId: string,
  fields: { gerenteNombre?: string; gerenteEmail?: string; fechaInicio?: string; fechaFin?: string },
  userEmail: string
): Promise<void> {
  const mutation = gql`
    mutation UpdateIteration($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
    }
  `;
  const columnValues: Record<string, unknown> = {};
  if (fields.gerenteNombre !== undefined) columnValues[ITERACIONES_COLS.gerenteNombre] = fields.gerenteNombre;
  if (fields.gerenteEmail  !== undefined) columnValues[ITERACIONES_COLS.gerenteEmail]  = fields.gerenteEmail;
  if (fields.fechaInicio   !== undefined) columnValues[ITERACIONES_COLS.fechaInicio]   = { date: fields.fechaInicio };
  if (fields.fechaFin      !== undefined) columnValues[ITERACIONES_COLS.fechaFin]      = { date: fields.fechaFin };

  await mondayClient.request(mutation, {
    boardId: config.MONDAY_ITERATIONS_BOARD_ID,
    itemId,
    columnValues: JSON.stringify(columnValues),
  });
  await auditLog({ user: userEmail, action: 'MONDAY_UPDATE_ITERATION', detail: `item=${itemId}`, result: 'success' });
}

// ─── Dry-run: validate board IDs ─────────────────────────────────
export async function validateBoardIds(): Promise<Record<string, boolean>> {
  const boardIds = {
    sessions: config.MONDAY_SESSIONS_BOARD_ID,
    blockers: config.MONDAY_BLOCKERS_BOARD_ID,
    iterations: config.MONDAY_ITERATIONS_BOARD_ID,
    showcase: config.MONDAY_SHOWCASE_BOARD_ID,
    retro: config.MONDAY_RETRO_BOARD_ID,
  };
  const results: Record<string, boolean> = {};
  for (const [name, id] of Object.entries(boardIds)) {
    try {
      const q = gql`query { boards(ids: [${id}]) { id name } }`;
      const d = (await mondayClient.request(q)) as { boards: unknown[] };
      results[name] = (d.boards?.length ?? 0) > 0;
    } catch {
      results[name] = false;
    }
  }
  return results;
}
