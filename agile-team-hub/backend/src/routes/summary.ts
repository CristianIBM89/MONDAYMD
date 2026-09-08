import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { processWithWatsonx, prepareIcaPrompt } from '../services/watsonx';
import { createSessionInMonday } from '../services/monday';
import {
  processSummaryRequestSchema,
  sendToMondayRequestSchema,
  watsonxResponseSchema,
} from '../schemas';
import { auditLog } from '../services/auditLog';
import { getRecentMeetings } from '../services/graph';

// In-memory store for pending summaries (keyed by summaryId)
// In production: use a persistent store (Redis / DB)
const pendingSummaries = new Map<
  string,
  {
    id: string;
    originalText: string;
    watsonxResult?: unknown;
    status: string;
    userEmail: string;
    createdAt: string;
    sessionName: string;
    sessionType: string;
    iterationName: string;
    sessionDate: string;
    teamsLink?: string;
  }
>();

export async function summaryRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/summary/process — send to watsonx
  app.post('/process', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = processSummaryRequestSchema.safeParse(req.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues });
      return;
    }
    const { summaryText, sessionType, iterationName, sessionDate, sessionName, teamsLink } =
      body.data;
    const user = req.user!;
    const summaryId = uuid();

    // Store as pending
    pendingSummaries.set(summaryId, {
      id: summaryId,
      originalText: summaryText,
      status: 'Procesando',
      userEmail: user.email,
      createdAt: new Date().toISOString(),
      sessionName,
      sessionType,
      iterationName,
      sessionDate,
      teamsLink,
    });

    await auditLog({ user: user.email, action: 'SUMMARY_PROCESS_START', detail: sessionName, result: 'success' });

    let watsonxResult;
    try {
      watsonxResult = await processWithWatsonx(
        summaryText,
        sessionType,
        iterationName,
        sessionDate,
        user.email
      );
      const entry = pendingSummaries.get(summaryId)!;
      entry.watsonxResult = watsonxResult;
      entry.status = 'Procesado';
    } catch (err) {
      const entry = pendingSummaries.get(summaryId)!;
      entry.status = 'Error';
      await auditLog({ user: user.email, action: 'SUMMARY_PROCESS_ERROR', detail: String(err), result: 'error' });
      reply.status(502).send({
        error: err instanceof Error ? err.message : 'Error procesando con watsonx',
        summaryId,
        mode: 'manual_ica_available',
        icaPrompt: prepareIcaPrompt(summaryText, sessionType, iterationName, sessionDate),
      });
      return;
    }

    reply.send({ summaryId, status: 'Procesado', watsonxResult });
  });

  // POST /api/summary/ica-result — user pastes ICA JSON result manually
  app.post('/ica-result', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({ summaryId: z.string(), icaJson: z.string() }).safeParse(req.body);
    if (!body.success) { reply.status(400).send({ error: 'summaryId e icaJson requeridos' }); return; }
    const entry = pendingSummaries.get(body.data.summaryId);
    if (!entry) { reply.status(404).send({ error: 'summaryId no encontrado' }); return; }

    let parsed: unknown;
    try { parsed = JSON.parse(body.data.icaJson); } catch {
      reply.status(400).send({ error: 'El JSON pegado no es válido.' }); return;
    }
    const validated = watsonxResponseSchema.safeParse(parsed);
    if (!validated.success) {
      reply.status(400).send({ error: 'El JSON no cumple el schema esperado', issues: validated.error.issues }); return;
    }
    entry.watsonxResult = validated.data;
    entry.status = 'Procesado';
    reply.send({ summaryId: body.data.summaryId, status: 'Procesado', watsonxResult: validated.data });
  });

  // GET /api/summary/:id — get a pending summary
  app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const entry = pendingSummaries.get(req.params.id);
    if (!entry) { reply.status(404).send({ error: 'Resumen no encontrado' }); return; }
    if (entry.userEmail !== req.user!.email) { reply.status(403).send({ error: 'No tienes acceso a este resumen' }); return; }
    reply.send(entry);
  });

  // GET /api/summary/ica-prompt/:id — get ready-to-copy prompt for ICA
  app.get('/ica-prompt/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const entry = pendingSummaries.get(req.params.id);
    if (!entry) { reply.status(404).send({ error: 'Resumen no encontrado' }); return; }
    const prompt = prepareIcaPrompt(entry.originalText, entry.sessionType, entry.iterationName, entry.sessionDate);
    reply.send({ prompt });
  });

  // POST /api/summary/send-monday — approve and send to Monday
  app.post('/send-monday', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = sendToMondayRequestSchema.safeParse(req.body);
    if (!body.success) { reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues }); return; }

    const entry = pendingSummaries.get(body.data.summaryId);
    if (!entry) { reply.status(404).send({ error: 'Resumen no encontrado. No se puede enviar sin haber procesado primero.' }); return; }
    if (entry.userEmail !== req.user!.email) { reply.status(403).send({ error: 'No tienes permisos para enviar este resumen.' }); return; }

    const data = body.data.approvedData;
    const actions = data.acciones_pendientes
      .map((a) => `• ${a.descripcion} — ${a.responsable} (${a.fecha_limite})`)
      .join('\n');

    const result = await createSessionInMonday({
      sessionName: body.data.sessionName,
      sessionDate: body.data.sessionDate,
      sessionType: body.data.sessionType,
      iterationName: body.data.iterationName,
      iterationManagerName: body.data.iterationManagerName,
      participants: body.data.participants,
      executiveSummary: data.resumen_ejecutivo,
      decisions: data.decisiones_tomadas,
      agreements: data.acuerdos,
      actions,
      blockers: data.bloqueantes_identificados.map((b) => b.descripcion),
      risks: data.riesgos,
      nextSteps: data.proximos_pasos,
      teamsLink: body.data.teamsLink,
      exportedByEmail: req.user!.email,
      exportedByName: req.user!.name,
      requiresManagerAttention: data.requiere_atencion_gerencial.aplica,
    });

    entry.status = 'Enviado a Monday';
    await auditLog({ user: req.user!.email, action: 'SUMMARY_SENT_MONDAY', detail: `item=${result.id}`, result: 'success' });
    reply.send({ success: true, mondayItemId: result.id, mondayUrl: result.url });
  });

  // GET /api/summary/meetings — recent Teams meetings from Graph API
  app.get('/meetings', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization ?? '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    try {
      const meetings = await getRecentMeetings(userToken);
      reply.send({ meetings });
    } catch (err) {
      reply.send({ meetings: [], warning: 'Microsoft Graph no disponible. Completa los datos manualmente.', detail: String(err) });
    }
  });
}
