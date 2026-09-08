import * as microsoftTeams from '@microsoft/teams-js';

let initialized = false;
let isInsideTeams = false;

export async function initTeams(): Promise<boolean> {
  if (initialized) return isInsideTeams;
  try {
    await microsoftTeams.app.initialize();
    isInsideTeams = true;
    initialized = true;
    return true;
  } catch {
    isInsideTeams = false;
    initialized = true;
    return false;
  }
}

export function getIsInsideTeams(): boolean {
  return isInsideTeams;
}

export async function getTeamsContext(): Promise<microsoftTeams.app.Context | null> {
  if (!isInsideTeams) return null;
  try {
    return await microsoftTeams.app.getContext();
  } catch {
    return null;
  }
}

export async function getTeamsAuthToken(): Promise<string | null> {
  if (!isInsideTeams) return null;
  try {
    return await microsoftTeams.authentication.getAuthToken();
  } catch {
    return null;
  }
}

export function notifyTeamsAppLoaded(): void {
  if (!isInsideTeams) return;
  try { microsoftTeams.app.notifyAppLoaded(); } catch { /* ignore */ }
  try { microsoftTeams.app.notifySuccess(); } catch { /* ignore */ }
}
