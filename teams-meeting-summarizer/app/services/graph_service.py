"""
Servicio Microsoft Graph API
Maneja autenticación MSAL y consultas a reuniones de Teams,
grabaciones y transcripciones.
"""
import logging
from typing import Any
from datetime import datetime, timezone

import httpx
import msal

from app.config import settings

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
GRAPH_BETA = "https://graph.microsoft.com/beta"

# Scopes para client credentials (app-only)
SCOPES = ["https://graph.microsoft.com/.default"]


class GraphService:
    def __init__(self) -> None:
        self._app = msal.ConfidentialClientApplication(
            client_id=settings.azure_client_id,
            authority=f"https://login.microsoftonline.com/{settings.azure_tenant_id}",
            client_credential=settings.azure_client_secret,
        )

    def _get_token(self) -> str:
        """Obtiene access token usando Client Credentials Flow."""
        result = self._app.acquire_token_for_client(scopes=SCOPES)
        if "access_token" not in result:
            error = result.get("error_description", "Unknown error")
            raise RuntimeError(f"No se pudo obtener token de Graph API: {error}")
        return result["access_token"]

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    #  REUNIONES
    # ------------------------------------------------------------------

    async def list_online_meetings(self, user_id: str) -> list[dict[str, Any]]:
        """Lista reuniones en línea de un usuario (últimas 50)."""
        url = f"{GRAPH_BASE}/users/{user_id}/onlineMeetings"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
        return data.get("value", [])

    async def get_online_meeting(self, user_id: str, meeting_id: str) -> dict[str, Any]:
        """Obtiene detalle de una reunión por ID."""
        url = f"{GRAPH_BASE}/users/{user_id}/onlineMeetings/{meeting_id}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
        return resp.json()

    async def get_call_record(self, call_id: str) -> dict[str, Any]:
        """Obtiene el registro de llamada (grabación, participantes)."""
        url = f"{GRAPH_BASE}/communications/callRecords/{call_id}?$expand=sessions($expand=segments)"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    #  TRANSCRIPCIONES
    # ------------------------------------------------------------------

    async def list_transcripts(self, user_id: str, meeting_id: str) -> list[dict[str, Any]]:
        """Lista transcripciones disponibles para una reunión."""
        url = f"{GRAPH_BASE}/users/{user_id}/onlineMeetings/{meeting_id}/transcripts"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers())
            if resp.status_code == 404:
                logger.warning("No se encontraron transcripciones para meeting_id=%s", meeting_id)
                return []
            resp.raise_for_status()
        return resp.json().get("value", [])

    async def get_transcript_text(self, user_id: str, meeting_id: str, transcript_id: str) -> str:
        """Descarga el texto plano de la transcripción."""
        url = (
            f"{GRAPH_BASE}/users/{user_id}/onlineMeetings/{meeting_id}"
            f"/transcripts/{transcript_id}/content?$format=text/vtt"
        )
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
        return resp.text

    # ------------------------------------------------------------------
    #  CALENDARIO  (para sincronizar reuniones programadas)
    # ------------------------------------------------------------------

    async def list_calendar_events(
        self,
        user_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Lista eventos de calendario con información de Teams."""
        if start is None:
            start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
        if end is None:
            from datetime import timedelta
            end = start + timedelta(days=7)

        start_str = start.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = end.strftime("%Y-%m-%dT%H:%M:%SZ")

        url = (
            f"{GRAPH_BASE}/users/{user_id}/calendarView"
            f"?startDateTime={start_str}&endDateTime={end_str}"
            f"&$filter=isOnlineMeeting eq true"
            f"&$select=id,subject,start,end,organizer,attendees,onlineMeeting"
            f"&$orderby=start/dateTime"
            f"&$top=50"
        )
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
        return resp.json().get("value", [])

    # ------------------------------------------------------------------
    #  WEBHOOK / SUBSCRIPCIONES (para recibir notificaciones de Teams)
    # ------------------------------------------------------------------

    async def create_call_records_subscription(self, notification_url: str) -> dict[str, Any]:
        """
        Crea una suscripción de webhook para recibir notificaciones
        cuando una llamada de Teams termina.
        """
        from datetime import timedelta

        expiry = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        payload = {
            "changeType": "created",
            "notificationUrl": f"{notification_url}/api/webhooks/teams",
            "resource": "/communications/callRecords",
            "expirationDateTime": expiry,
            "clientState": settings.app_secret_key,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{GRAPH_BASE}/subscriptions",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
        return resp.json()

    async def renew_subscription(self, subscription_id: str) -> None:
        """Renueva una suscripción existente (expiran cada ~4230 min)."""
        from datetime import timedelta

        expiry = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.patch(
                f"{GRAPH_BASE}/subscriptions/{subscription_id}",
                json={"expirationDateTime": expiry},
                headers=self._headers(),
            )
            resp.raise_for_status()

    # ------------------------------------------------------------------
    #  PARTICIPANTES
    # ------------------------------------------------------------------

    async def get_meeting_attendees(
        self, user_id: str, meeting_id: str
    ) -> list[dict[str, Any]]:
        """Obtiene participantes de una reunión vía attendance report (beta)."""
        url = (
            f"{GRAPH_BETA}/users/{user_id}/onlineMeetings/{meeting_id}"
            "/attendanceReports?$expand=attendanceRecords"
        )
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers())
            if resp.status_code in (404, 403):
                return []
            resp.raise_for_status()
        reports = resp.json().get("value", [])
        if not reports:
            return []
        return reports[0].get("attendanceRecords", [])


graph_service = GraphService()
