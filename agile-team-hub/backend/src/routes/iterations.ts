import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getActiveIteration, getAllIterations, attachFileToBlocker } from '../services/monday';
import { z } from 'zod';
import { auditLog } from '../services/auditLog';
import { MultipartFile } from '@fastify/multipart';

export async function iterationRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/iterations/active
  app.get('/active', async (_req: FastifyRequest, reply: FastifyReply) => {
    const iteration = await getActiveIteration();
    if (!iteration) {
      reply.send({ iteration: null, warning: 'No hay iteración activa en Monday. Crea un elemento con estado "Activo" en el tablero de iteraciones.' });
      return;
    }
    reply.send({ iteration });
  });

  // GET /api/iterations
  app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    const iterations = await getAllIterations();
    reply.send({ iterations });
  });

  // POST /api/iterations/:id/marbles — attach canicas evidence
  app.post('/:id/marbles', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const bodySchema = z.object({
      comentario: z.string().default(''),
      enlace: z.string().url().optional(),
    });
    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) { reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues }); return; }

    // The canicas attachment is optional — never block the flow
    let file: MultipartFile | undefined;
    try { file = await req.file(); } catch { /* no file is fine */ }

    if (file) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        reply.status(400).send({ error: 'Solo se permiten imágenes (PNG, JPG, GIF, WEBP) para la evidencia de canicas.' });
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      await attachFileToBlocker(req.params.id, 'file_canicas', buffer, file.filename);
    }

    await auditLog({ user: req.user!.email, action: 'MARBLES_EVIDENCE', detail: `iteracion=${req.params.id} hasFile=${Boolean(file)}`, result: 'success' });
    reply.send({ success: true, fileAttached: Boolean(file), comment: body.data.comentario });
  });
}
