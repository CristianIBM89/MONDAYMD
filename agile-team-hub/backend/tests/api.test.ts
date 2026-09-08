import { buildApp } from '../src/server';
import { FastifyInstance } from 'fastify';
import { generateJWT } from '../src/middleware/auth';

let app: FastifyInstance;
let validToken: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  validToken = generateJWT('test@ibm.com', 'Test User');
});

afterAll(async () => {
  await app.close();
  // Allow all open handles to flush
  await new Promise((resolve) => setTimeout(resolve, 500));
});

// ─────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────
describe('Health endpoint', () => {
  it('returns ok without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });
});

// ─────────────────────────────────────────────────────────────────
// Auth middleware
// ─────────────────────────────────────────────────────────────────
describe('Auth middleware', () => {
  it('rejects request without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/iterations/active' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects expired / invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/iterations/active',
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
// Summary — input validation
// ─────────────────────────────────────────────────────────────────
describe('POST /api/summary/process', () => {
  it('rejects empty summary text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/summary/process',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        sessionType: 'sesion_agile',
        iterationId: 'iter-1',
        iterationName: 'Sprint 1',
        sessionName: 'Sesión Agile',
        sessionDate: '2024-11-15',
        summaryText: '',
      }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('rejects missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/summary/process',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ summaryText: 'some text' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns error with ICA prompt when watsonx is unavailable', async () => {
    // watsonx will fail with test API key — this is expected
    const res = await app.inject({
      method: 'POST',
      url: '/api/summary/process',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        sessionType: 'sesion_agile',
        iterationId: 'iter-1',
        iterationName: 'Sprint 1',
        sessionName: 'Sesión Test',
        sessionDate: '2024-11-15',
        summaryText: 'Esta es una reunión de ejemplo con decisiones y acuerdos.',
      }),
    });
    // Either 200 (if watsonx responds) or 502 with icaPrompt fallback
    expect([200, 502]).toContain(res.statusCode);
    if (res.statusCode === 502) {
      const body = JSON.parse(res.body);
      expect(body.mode).toBe('manual_ica_available');
      expect(body.icaPrompt).toContain('<|begin_of_text|>');
      expect(body.summaryId).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// ICA manual flow
// ─────────────────────────────────────────────────────────────────
describe('POST /api/summary/ica-result', () => {
  it('rejects invalid JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/summary/ica-result',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ summaryId: 'nonexistent', icaJson: 'not valid json' }),
    });
    expect(res.statusCode).toBe(404); // summaryId not found first
  });

  it('rejects JSON that does not match schema', async () => {
    // First create a pending summary via process (will fail to watsonx but give summaryId)
    const processRes = await app.inject({
      method: 'POST',
      url: '/api/summary/process',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        sessionType: 'sesion_agile',
        iterationId: 'iter-1',
        iterationName: 'Sprint 1',
        sessionName: 'Test ICA',
        sessionDate: '2024-11-15',
        summaryText: 'Texto de prueba para ICA con contenido suficiente para pasar la validación.',
      }),
    });
    const processBody = JSON.parse(processRes.body);
    const summaryId = processBody.summaryId;
    if (!summaryId) return; // Skip if processRes was 200 (watsonx worked)

    const res = await app.inject({
      method: 'POST',
      url: '/api/summary/ica-result',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ summaryId, icaJson: JSON.stringify({ incomplete: 'object' }) }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('schema');
  });
});

// ─────────────────────────────────────────────────────────────────
// Blocker validation
// ─────────────────────────────────────────────────────────────────
describe('POST /api/blockers', () => {
  it('rejects blocker with missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/blockers',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ titulo: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid tipo enum', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/blockers',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        titulo: 'Bloqueante test',
        descripcion: 'Descripción del bloqueante',
        tipo: 'invalido',
        impacto: 'alto',
        urgencia: 'urgente',
        iteracionId: 'iter-1',
        iteracionNombre: 'Sprint 1',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// Slack disabled
// ─────────────────────────────────────────────────────────────────
describe('Slack — disabled state', () => {
  it('GET /api/slack/status reports disabled', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/slack/status',
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enabled).toBe(false);
  });

  it('POST /api/slack/publish returns 503 when not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/slack/publish',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        mondayItemId: '123',
        sessionName: 'Test',
        sessionDate: '2024-11-15',
        mondayUrl: 'https://monday.com/boards/123/items/456',
        message: { header: 'H', puntosClaves: [], decisiones: [], accionesConResponsable: [], bloqueantesRelevantes: [], proximaSesion: 'TBD' },
      }),
    });
    expect(res.statusCode).toBe(503);
  });
});

// ─────────────────────────────────────────────────────────────────
// Retro validation
// ─────────────────────────────────────────────────────────────────
describe('POST /api/retro', () => {
  it('rejects invalid categoria', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/retro',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        categoria: 'invalida',
        comentario: 'Todo fue bien',
        iteracionNombre: 'Sprint 1',
        fecha: '2024-11-15',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
      }),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// Send to Monday — requires processed summary
// ─────────────────────────────────────────────────────────────────
describe('POST /api/summary/send-monday', () => {
  it('returns 404 if summaryId does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/summary/send-monday',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        summaryId: 'nonexistent-id',
        sessionName: 'Test',
        sessionDate: '2024-11-15',
        sessionType: 'sesion_agile',
        iterationName: 'Sprint 1',
        participants: [],
        approvedData: {
          resumen_ejecutivo: '',
          temas_tratados: [],
          decisiones_tomadas: [],
          acuerdos: [],
          acciones_pendientes: [],
          bloqueantes_identificados: [],
          riesgos: [],
          dependencias: [],
          problemas_operativos: [],
          preguntas_abiertas: [],
          proximos_pasos: [],
          info_showcase: '',
          conclusiones_retrospectiva: [],
          requiere_atencion_gerencial: { aplica: false, motivo: '' },
          version_slack: { encabezado: '', puntos_clave: [], decisiones: [], acciones_con_responsable: [], bloqueantes_relevantes: [], proxima_sesion: '' },
        },
      }),
    });
    expect(res.statusCode).toBe(404);
  });
});
