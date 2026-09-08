import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { blockerRequestSchema } from '../schemas';
import { createBlockerInMonday, attachFileToBlocker } from '../services/monday';
import { auditLog } from '../services/auditLog';
import { MultipartFile } from '@fastify/multipart';

export async function blockerRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/blockers — create a blocker in Monday
  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = blockerRequestSchema.safeParse(req.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues });
      return;
    }
    const user = req.user!;

    const result = await createBlockerInMonday({
      ...body.data,
      reportadoPorEmail: user.email,
      reportadoPorNombre: user.name,
    });

    if (result.alreadyExisted) {
      reply.send({ success: true, mondayItemId: result.id, alreadyExisted: true, message: 'Este bloqueante ya fue registrado anteriormente.' });
      return;
    }

    await auditLog({ user: user.email, action: 'BLOCKER_CREATED', detail: `item=${result.id} key=${body.data.idempotencyKey}`, result: 'success' });
    reply.status(201).send({ success: true, mondayItemId: result.id, mondayUrl: result.url });
  });

  // POST /api/blockers/:id/attachment — attach file to blocker
  app.post('/:id/attachment', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    let file: MultipartFile | undefined;
    try {
      file = await req.file();
    } catch {
      reply.status(400).send({ error: 'No se encontró archivo adjunto.' });
      return;
    }
    if (!file) { reply.status(400).send({ error: 'Archivo requerido.' }); return; }

    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.mimetype)) {
      reply.status(400).send({ error: `Tipo de archivo no permitido: ${file.mimetype}` });
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (buffer.length > 10 * 1024 * 1024) {
      reply.status(400).send({ error: 'El archivo supera el límite de 10MB.' });
      return;
    }

    await attachFileToBlocker(req.params.id, 'file_column', buffer, file.filename);
    await auditLog({ user: req.user!.email, action: 'BLOCKER_ATTACHMENT', detail: `item=${req.params.id}`, result: 'success' });
    reply.send({ success: true });
  });
}
