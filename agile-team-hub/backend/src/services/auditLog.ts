import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  detail: string;
  result: 'success' | 'error';
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');

export async function auditLog(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
  if (!config.AUDIT_LOG_ENABLED) return;
  const record: AuditEntry = { timestamp: new Date().toISOString(), ...entry };
  // Sanitize: never log tokens or secrets
  record.detail = record.detail.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');

  const line = JSON.stringify(record) + '\n';
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {
    // Don't fail the request if logging fails
    console.error('[AuditLog] Error escribiendo log:', record.action);
  }
}
