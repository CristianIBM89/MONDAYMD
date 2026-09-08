import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { validateBoardIds } from '../services/monday';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        watsonx: {
          configured: Boolean(config.WATSONX_API_KEY),
          region: config.WATSONX_REGION,
          model: config.WATSONX_MODEL_ID,
        },
        monday: { configured: Boolean(config.MONDAY_API_TOKEN) },
        slack: { configured: config.SLACK_ENABLED },
        graph: { configured: config.GRAPH_ENABLED },
      },
    });
  });

  // Dry-run: validate Monday board IDs (protected — registered AFTER auth hook)
  // URL is /api/diagnostics/monday to avoid the /api/health skip in authMiddleware
  app.get('/diagnostics/monday', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) { reply.status(401).send({ error: 'No autorizado' }); return; }
    const results = await validateBoardIds();
    reply.send({ boards: results });
  });
}
