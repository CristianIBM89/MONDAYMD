import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { publishToSlack, generateSlackPreview } from '../services/slack';
import { updateSessionSlackStatus } from '../services/monday';
import { auditLog } from '../services/auditLog';
import { config } from '../config';

const slackPayloadSchema = z.object({
  mondayItemId: z.string().min(1),
  sessionName: z.string().min(1),
  sessionDate: z.string().min(1),
  mondayUrl: z.string().url(),
  message: z.object({
    header: z.string(),
    puntosClaves: z.array(z.string()).max(5),
    decisiones: z.array(z.string()),
    accionesConResponsable: z.array(z.string()),
    bloqueantesRelevantes: z.array(z.string()),
    proximaSesion: z.string(),
  }),
});

export async function slackRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/slack/status
  app.get('/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send({ enabled: config.SLACK_ENABLED, hasWebhook: Boolean(config.SLACK_WEBHOOK_URL), hasBotToken: Boolean(config.SLACK_BOT_TOKEN) });
  });

  // POST /api/slack/preview — generate preview without publishing
  app.post('/preview', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = slackPayloadSchema.safeParse(req.body);
    if (!body.success) { reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues }); return; }
    const preview = generateSlackPreview({ ...body.data.message, mondayUrl: body.data.mondayUrl, sessionName: body.data.sessionName, sessionDate: body.data.sessionDate });
    reply.send({ preview });
  });

  // POST /api/slack/publish — confirmed publish
  app.post('/publish', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!config.SLACK_ENABLED) {
      reply.status(503).send({ error: 'Slack no está configurado en este entorno.' });
      return;
    }
    const body = slackPayloadSchema.safeParse(req.body);
    if (!body.success) { reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues }); return; }
    const user = req.user!;

    await publishToSlack({ ...body.data.message, mondayUrl: body.data.mondayUrl, sessionName: body.data.sessionName, sessionDate: body.data.sessionDate }, user.email);
    await updateSessionSlackStatus(body.data.mondayItemId, user.email);
    await auditLog({ user: user.email, action: 'SLACK_PUBLISHED', detail: `session=${body.data.sessionName}`, result: 'success' });
    reply.send({ success: true });
  });
}
