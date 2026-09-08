import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getActiveIteration,
  getAllIterations,
  attachFileToBlocker,
  createIterationInMonday,
  closeIterationInMonday,
  updateIterationInMonday,
} from '../services/monday';
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

  // POST /api/iterations — crear nueva iteración
  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      nombre:        z.string().min(1),
      gerenteNombre: z.string().min(1),
      gerenteEmail:  z.string().email(),
      fechaInicio:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fechaFin:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { reply.status(400).send({ error: 'Datos inválidos', issues: parsed.error.issues }); return; }

    const result = await createIterationInMonday({ ...parsed.data, userEmail: req.user!.email });
    await auditLog({ user: req.user!.email, action: 'CREATE_ITERATION', detail: `id=${result.id}`, result: 'success' });
    reply.status(201).send({ success: true, id: result.id });
  });

  // PATCH /api/iterations/:id/close — cerrar iteración activa
  app.patch('/:id/close', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await closeIterationInMonday(req.params.id, req.user!.email);
    reply.send({ success: true });
  });

  // PATCH /api/iterations/:id/update — editar gerente / fechas
  app.patch('/:id/update', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const schema = z.object({
      gerenteNombre: z.string().optional(),
      gerenteEmail:  z.string().email().optional(),
      fechaInicio:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      fechaFin:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { reply.status(400).send({ error: 'Datos inválidos', issues: parsed.error.issues }); return; }

    await updateIterationInMonday(req.params.id, parsed.data, req.user!.email);
    reply.send({ success: true });
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
