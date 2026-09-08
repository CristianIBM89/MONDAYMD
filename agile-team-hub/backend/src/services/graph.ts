import { config } from '../config';

interface GraphToken {
  access_token: string;
  expires_in: number;
  expiresAt: number;
}

let graphTokenCache: GraphToken | null = null;

async function getGraphToken(userAccessToken?: string): Promise<string> {
  // If user token is provided (delegated), use it directly
  if (userAccessToken) return userAccessToken;

  // Application token (requires GRAPH_CLIENT_ID/SECRET/TENANT)
  if (!config.GRAPH_ENABLED) {
    throw new Error('Microsoft Graph no está configurado. Completa GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET y GRAPH_TENANT_ID.');
  }

  const now = Date.now();
  if (graphTokenCache && graphTokenCache.expiresAt > now + 60_000) {
    return graphTokenCache.access_token;
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${config.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.GRAPH_CLIENT_ID,
        client_secret: config.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) throw new Error(`Error obteniendo token de Graph: ${res.status}`);
  const data = (await res.json()) as GraphToken;
  graphTokenCache = { ...data, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

export interface MeetingMetadata {
  id: string;
  subject: string;
  startDateTime: string;
  organizer: string;
  attendees: string[];
  joinUrl: string;
}

export async function getRecentMeetings(userAccessToken: string): Promise<MeetingMetadata[]> {
  const token = await getGraphToken(userAccessToken);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();
  const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${since}&endDateTime=${until}&$top=20&$select=subject,start,organizer,attendees,onlineMeeting&$orderby=start/dateTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Graph calendarView error: ${res.status}`);
  const data = (await res.json()) as { value: unknown[] };

  return (data.value ?? []).map((ev: unknown) => {
    const e = ev as Record<string, unknown>;
    const organizer = (e.organizer as Record<string, unknown>)?.emailAddress as Record<string, string> | undefined;
    const attendees = (e.attendees as Array<Record<string, unknown>> | undefined)?.map(
      (a) => ((a.emailAddress as Record<string, string>)?.address ?? '')
    ) ?? [];
    const onlineMeeting = (e.onlineMeeting as Record<string, string> | undefined);
    return {
      id: e.id as string ?? '',
      subject: e.subject as string ?? '',
      startDateTime: ((e.start as Record<string, string>)?.dateTime ?? '').slice(0, 10),
      organizer: organizer?.address ?? '',
      attendees,
      joinUrl: onlineMeeting?.joinUrl ?? '',
    };
  });
}
