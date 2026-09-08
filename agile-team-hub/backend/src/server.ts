import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config';
import { summaryRoutes } from './routes/summary';
import { blockerRoutes } from './routes/blockers';
import { iterationRoutes } from './routes/iterations';
import { showcaseRoutes } from './routes/showcase';
import { retroRoutes } from './routes/retro';
import { slackRoutes } from './routes/slack';
import { dashboardRoutes } from './routes/dashboard';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Security headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: [
          "'self'",
          'https://teams.microsoft.com',
          'https://*.teams.microsoft.com',
          'https://*.skype.com',
        ],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) ||
        origin.endsWith('.trycloudflare.com') ||
        origin.endsWith('.onrender.com') ||
        origin.includes('localhost');
      if (isAllowed) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
    credentials: true,
  });

  // Rate limiting
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Multipart (file uploads)
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE_BYTES,
      files: 1,
    },
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Public routes — registered BEFORE the auth hook so they are not protected
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Protected routes — validate JWT on every request via global preHandler
  app.addHook('preHandler', authMiddleware);

  await app.register(healthRoutes, { prefix: '/api' });        // /api/health (public via skip) + /api/diagnostics/monday (protected)
  await app.register(summaryRoutes, { prefix: '/api/summary' });
  await app.register(blockerRoutes, { prefix: '/api/blockers' });
  await app.register(iterationRoutes, { prefix: '/api/iterations' });
  await app.register(showcaseRoutes, { prefix: '/api/showcase' });
  await app.register(retroRoutes, { prefix: '/api/retro' });
  await app.register(slackRoutes, { prefix: '/api/slack' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

  return app;
}

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(
      `Agile Team Hub Backend iniciado en http://${config.HOST}:${config.PORT}`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
