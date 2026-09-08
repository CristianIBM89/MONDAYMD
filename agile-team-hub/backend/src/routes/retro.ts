import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { retroRequestSchema } from '../schemas';
import { createRetroInMonday } from '../services/monday';
import { auditLog } from '../services/auditLog';

export async function retroRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = retroRequestSchema.safeParse(req.body);
    if (!body.success) { reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues }); return; }
    const user = req.user!;

    const result = await createRetroInMonday({
      ...body.data,
      autor: body.data.autor ?? user.name,
      userEmail: user.email,
    });

    if (result.alreadyExisted) {
      reply.send({ success: true, mondayItemId: result.id, alreadyExisted: true });
      return;
    }
    await auditLog({ user: user.email, action: 'RETRO_CREATED', detail: `item=${result.id}`, result: 'success' });
    reply.status(201).send({ success: true, mondayItemId: result.id });
  });
}
