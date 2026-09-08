import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
): void {
  // Zod validation errors
  if (error.validation) {
    reply.status(400).send({
      error: 'Datos de entrada inválidos',
      detail: error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'Validación fallida',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  // Rate limit
  if (error.statusCode === 429) {
    reply.status(429).send({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' });
    return;
  }

  // Default — never expose internal stack traces
  const statusCode = error.statusCode ?? 500;
  const isClientError = statusCode >= 400 && statusCode < 500;

  reply.status(statusCode).send({
    error: isClientError ? error.message : 'Error interno del servidor.',
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
  });
}
