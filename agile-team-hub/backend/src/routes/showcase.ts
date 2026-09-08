import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { showcaseRequestSchema } from '../schemas';
import { createShowcaseInMonday, attachFileToBlocker } from '../services/monday';
import { auditLog } from '../services/auditLog';
import { MultipartFile } from '@fastify/multipart';

export async function showcaseRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = showcaseRequestSchema.safeParse(req.body);
    if (!body.success) { reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues }); return; }
    const user = req.user!;

    const result = await createShowcaseInMonday({ ...body.data, userEmail: user.email });

    if (result.alreadyExisted) {
      reply.send({ success: true, mondayItemId: result.id, alreadyExisted: true });
      return;
    }
    await auditLog({ user: user.email, action: 'SHOWCASE_CREATED', detail: `item=${result.id}`, result: 'success' });
    reply.status(201).send({ success: true, mondayItemId: result.id });
  });

  app.post('/:id/evidence', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    let file: MultipartFile | undefined;
    try { file = await req.file(); } catch { reply.status(400).send({ error: 'Archivo requerido.' }); return; }
    if (!file) { reply.status(400).send({ error: 'Archivo requerido.' }); return; }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    await attachFileToBlocker(req.params.id, 'file_evidence', buffer, file.filename);
    reply.send({ success: true });
  });
}
