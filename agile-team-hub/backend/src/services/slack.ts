import { config } from '../config';
import { auditLog } from './auditLog';

export interface SlackMessage {
  header: string;
  puntosClaves: string[];
  decisiones: string[];
  accionesConResponsable: string[];
  bloqueantesRelevantes: string[];
  proximaSesion: string;
  mondayUrl: string;
  sessionName: string;
  sessionDate: string;
}

function buildSlackBlocks(msg: SlackMessage): unknown[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 ${msg.sessionName} | ${msg.sessionDate}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${msg.header}*` },
    },
    msg.puntosClaves.length > 0 && {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Puntos clave:*\n${msg.puntosClaves.map((p) => `• ${p}`).join('\n')}`,
      },
    },
    msg.decisiones.length > 0 && {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Decisiones:*\n${msg.decisiones.map((d) => `• ${d}`).join('\n')}`,
      },
    },
    msg.accionesConResponsable.length > 0 && {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Acciones:*\n${msg.accionesConResponsable.map((a) => `• ${a}`).join('\n')}`,
      },
    },
    msg.bloqueantesRelevantes.length > 0 && {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Bloqueantes:*\n${msg.bloqueantesRelevantes.map((b) => `⚠️ ${b}`).join('\n')}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Próxima sesión:* ${msg.proximaSesion}\n<${msg.mondayUrl}|Ver registro completo en Monday>`,
      },
    },
    {
      type: 'divider',
    },
  ].filter(Boolean);
}

export async function publishToSlack(
  msg: SlackMessage,
  userEmail: string
): Promise<void> {
  if (!config.SLACK_ENABLED) {
    throw new Error('Slack no está configurado. Revisa SLACK_WEBHOOK_URL o SLACK_BOT_TOKEN en las variables de entorno.');
  }

  const blocks = buildSlackBlocks(msg);
  const payload = { blocks, text: `${msg.sessionName} — ${msg.header}` };

  if (config.SLACK_WEBHOOK_URL) {
    const res = await fetch(config.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Slack webhook error ${res.status}: ${text.slice(0, 200)}`);
    }
  } else if (config.SLACK_BOT_TOKEN && config.SLACK_CHANNEL_ID) {
    const body = { channel: config.SLACK_CHANNEL_ID, ...payload };
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) throw new Error(`Slack API error: ${json.error}`);
  } else {
    throw new Error('Slack requiere SLACK_WEBHOOK_URL o (SLACK_BOT_TOKEN + SLACK_CHANNEL_ID).');
  }

  await auditLog({ user: userEmail, action: 'SLACK_PUBLISH', detail: msg.sessionName, result: 'success' });
}

export function generateSlackPreview(msg: SlackMessage): { blocks: unknown[]; text: string } {
  return { blocks: buildSlackBlocks(msg), text: `${msg.sessionName} — ${msg.header}` };
}
