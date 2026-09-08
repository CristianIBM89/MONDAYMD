import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateJWT } from '../middleware/auth';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/dev-token — generates a signed JWT for web standalone mode or development
  app.post('/dev-token', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { email?: string; name?: string } | undefined;
    const email = body?.email || 'usuario@ibm.com';
    const name = body?.name || 'Usuario IBM';
    const token = generateJWT(email, name);
    reply.send({ token });
  });
}
