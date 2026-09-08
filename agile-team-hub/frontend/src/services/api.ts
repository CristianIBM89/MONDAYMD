// API client for Agile Team Hub backend
// All external calls (watsonx, Monday, Slack) go through the backend — never called directly from the frontend.

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ?? 'http://localhost:3001';

let authToken: string | null = null;

export function setAuthToken(token: string): void {
  authToken = token;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  customHeaders?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error HTTP ${res.status}`);
  return data;
}

export interface HealthServices {
  watsonx?: { configured?: boolean; region?: string; model?: string } | boolean;
  monday?: { configured?: boolean } | boolean;
  slack?: { configured?: boolean } | boolean;
  graph?: { configured?: boolean } | boolean;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
  services: HealthServices;
}

export const api = {
  health: () => request<HealthResponse>('GET', '/api/health'),

  // Iterations
  getActiveIteration: () => request<{ iteration: unknown }>('GET', '/api/iterations/active'),
  getAllIterations: () => request<{ iterations: unknown[] }>('GET', '/api/iterations'),
  createIteration: (payload: unknown) => request<{ success: boolean; id: string }>('POST', '/api/iterations', payload),
  closeIteration: (id: string) => request<{ success: boolean }>('PATCH', `/api/iterations/${id}/close`),
  updateIteration: (id: string, payload: unknown) => request<{ success: boolean }>('PATCH', `/api/iterations/${id}/update`, payload),

  // Summary
  processSummary: (payload: unknown) => request<{ summaryId: string; watsonxResult?: unknown; mode?: string; icaPrompt?: string; error?: string }>('POST', '/api/summary/process', payload),
  submitIcaResult: (summaryId: string, icaJson: string) => request<unknown>('POST', '/api/summary/ica-result', { summaryId, icaJson }),
  getSummary: (id: string) => request<unknown>('GET', `/api/summary/${id}`),
  getIcaPrompt: (id: string) => request<{ prompt: string }>('GET', `/api/summary/ica-prompt/${id}`),
  sendToMonday: (payload: unknown) => request<{ mondayItemId: string; mondayUrl: string }>('POST', '/api/summary/send-monday', payload),
  getRecentMeetings: () => request<{ meetings: unknown[]; warning?: string }>('GET', '/api/summary/meetings'),

  // Blockers
  createBlocker: (payload: unknown) => request<{ mondayItemId: string; mondayUrl?: string; alreadyExisted?: boolean }>('POST', '/api/blockers', payload),

  // Iterations / marbles evidence
  attachMarblesEvidence: (iterationId: string, formData: FormData) => {
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${BACKEND_URL}/api/iterations/${iterationId}/marbles`, {
      method: 'POST',
      headers,
      body: formData,
    }).then((r) => r.json());
  },

  // Showcase
  createShowcase: (payload: unknown) => request<{ mondayItemId: string }>('POST', '/api/showcase', payload),

  // Retro
  createRetro: (payload: unknown) => request<{ mondayItemId: string }>('POST', '/api/retro', payload),

  // Slack
  getSlackStatus: () => request<{ enabled: boolean }>('GET', '/api/slack/status'),
  previewSlack: (payload: unknown) => request<{ preview: unknown }>('POST', '/api/slack/preview', payload),
  publishSlack: (payload: unknown) => request<{ success: boolean }>('POST', '/api/slack/publish', payload),

  // Dashboard
  getDashboard: () => request<unknown>('GET', '/api/dashboard'),
  getSessions: () => request<{ sessions: unknown[] }>('GET', '/api/dashboard/sessions'),
  getBlockersList: () => request<{ blockers: unknown[] }>('GET', '/api/dashboard/blockers'),

  // Monday board validation (dry-run)
  validateBoards: () => request<{ boards: Record<string, boolean> }>('GET', '/api/diagnostics/monday'),
};
