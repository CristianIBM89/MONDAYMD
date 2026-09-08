// Dev-only helper — generates a signed JWT using SubtleCrypto (Web Crypto API).
// ONLY works when NODE_ENV=development.
// The secret used here MUST match JWT_SECRET in the backend .env file.
// NEVER use this pattern in production — secrets must stay server-side.

const DEV_JWT_SECRET = process.env.REACT_APP_DEV_JWT_SECRET ?? 'AgileTeamHubIBM2024SecretKeyParaAutenticacion';

async function hmacSign(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64url(obj: object): string {
  // Use TextEncoder to handle UTF-8 characters correctly before base64 encoding
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateDevToken(email: string, name: string): Promise<string> {
  if (process.env.NODE_ENV !== 'development') return '';
  const header  = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub: email, email, name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 8 * 3600,
  });
  const sig = await hmacSign(DEV_JWT_SECRET, `${header}.${payload}`);
  return `${header}.${payload}.${sig}`;
}
