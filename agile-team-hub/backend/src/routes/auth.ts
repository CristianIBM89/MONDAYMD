import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateJWT } from '../middleware/auth';
import { config } from '../config';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/dev-token — ONLY available in development mode
  // Generates a signed JWT for local frontend development without Teams
  app.post('/dev-token', async (req: FastifyRequest, reply: FastifyReply) => {
    if (config.NODE_ENV !== 'development') {
      reply.status(404).send({ error: 'Not found' });
      return;
    }
    const body = req.body as { email?: string; name?: string };
    const email = body?.email ?? 'dev@ibm.com';
    const name = body?.name ?? 'Dev User';
    const token = generateJWT(email, name);
    reply.send({ token });
  });
}
