import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDashboardData, getSessions, getBlockersList } from '../services/monday';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/dashboard — manager dashboard data from Monday
  app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await getDashboardData();
    reply.send(data);
  });

  // GET /api/dashboard/sessions — sesiones guardadas en Monday, mapeadas con nombres reales
  app.get('/sessions', async (_req: FastifyRequest, reply: FastifyReply) => {
    const sessions = await getSessions();
    reply.send({ sessions });
  });

  // GET /api/dashboard/blockers — bloqueantes registrados en Monday
  app.get('/blockers', async (_req: FastifyRequest, reply: FastifyReply) => {
    const blockers = await getBlockersList();
    reply.send({ blockers });
  });
}
