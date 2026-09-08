"""
Rutas para el panel lateral de Teams (Meeting Side Panel).
Estas rutas sirven las páginas HTML del tab y gestionan
la activación/desactivación del resumen desde dentro de la reunión.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Meeting, MeetingStatus, get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/teams-tab", tags=["teams-tab"])
templates = Jinja2Templates(directory="dashboard/templates")


# ── PÁGINAS HTML ─────────────────────────────────────────────────

@router.get("/panel", response_class=HTMLResponse)
async def tab_panel(request: Request):
    """Panel lateral que se muestra dentro de la reunión de Teams."""
    return templates.TemplateResponse("teams_tab.html", {"request": request})


@router.get("/config", response_class=HTMLResponse)
async def tab_config(request: Request):
    """Página de configuración que Teams muestra al instalar el tab."""
    return templates.TemplateResponse("teams_tab_config.html", {"request": request})


# ── API DEL PANEL ─────────────────────────────────────────────────

class ActivatePayload(BaseModel):
    meeting_id:   str
    user_name:    str = ""
    user_email:   str = ""
    meeting_name: str = "Reunión de Teams"


class DeactivatePayload(BaseModel):
    meeting_id: str


@router.post("/activate")
async def activate_summary(
    payload: ActivatePayload,
    db: AsyncSession = Depends(get_session),
):
    """
    El usuario pulsó el botón en el panel de Teams.
    Crea o actualiza el registro de la reunión marcándola para resumen.
    """
    stmt = select(Meeting).where(Meeting.teams_meeting_id == payload.meeting_id)
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()

    if not meeting:
        meeting = Meeting(
            teams_meeting_id=payload.meeting_id,
            subject=payload.meeting_name,
            organizer_name=payload.user_name or None,
            start_time=datetime.utcnow(),
            status=MeetingStatus.PENDING,
        )
        db.add(meeting)

    meeting.summary_requested = True  # type: ignore[attr-defined]
    meeting.summary_requested_by = payload.user_name  # type: ignore[attr-defined]
    await db.commit()

    logger.info(
        "Resumen activado por '%s' para meeting_id=%s",
        payload.user_name, payload.meeting_id
    )
    return {
        "ok": True,
        "message": f"Resumen activado por {payload.user_name}",
        "meeting_db_id": meeting.id,
    }


@router.post("/deactivate")
async def deactivate_summary(
    payload: DeactivatePayload,
    db: AsyncSession = Depends(get_session),
):
    """Desactiva el resumen para esta reunión."""
    stmt = select(Meeting).where(Meeting.teams_meeting_id == payload.meeting_id)
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()

    if meeting:
        meeting.summary_requested = False  # type: ignore[attr-defined]
        await db.commit()

    return {"ok": True, "message": "Resumen desactivado"}


@router.get("/status")
async def get_status(
    meeting_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Consulta si el resumen está activado para esta reunión."""
    stmt = select(Meeting).where(Meeting.teams_meeting_id == meeting_id)
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()

    if not meeting:
        return {"summary_requested": False, "activated_by": None}

    return {
        "summary_requested": getattr(meeting, "summary_requested", False),
        "activated_by":      getattr(meeting, "summary_requested_by", None),
        "status":            meeting.status,
    }
