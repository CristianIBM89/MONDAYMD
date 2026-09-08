import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';

interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

// Simple JWT verification without jsonwebtoken dependency
// (avoids binary native module issues in Docker)
function base64UrlDecode(str: string): string {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function verifyJWT(token: string): JWTPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token inválido');

  const [headerB64, payloadB64, signatureB64] = parts;
  const payload = JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;

  // Verify expiry
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new Error('Token expirado');
  }

  // Verify signature using Node.js crypto
  const crypto = require('crypto') as typeof import('crypto');
  const expectedSig = crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (expectedSig !== signatureB64) {
    throw new Error('Firma del token inválida');
  }

  return payload;
}

// Attach user to request
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth for public endpoints
  if (request.url.startsWith('/api/health')) return;
  if (request.url.startsWith('/api/auth')) return;

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'No autorizado. Se requiere token Bearer.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    request.user = verifyJWT(token);
  } catch (err) {
    reply.status(401).send({
      error: 'Token inválido o expirado.',
      detail: err instanceof Error ? err.message : 'Error desconocido',
    });
  }
}

// Generate a JWT (used for dev/testing with internal auth endpoint)
export function generateJWT(email: string, name: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: email,
      email,
      name,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 8 * 3600,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}
