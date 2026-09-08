"""
Rutas API — Reuniones, Bloqueantes, Próximos Pasos y Monday.com
"""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Body
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import (
    Meeting, MeetingStatus,
    Blocker, BlockerStatus,
    NextStep,
    get_session,
)
from app.services.summary_service import generate_summary
from app.services.export_service import summary_to_json, summary_to_csv, all_action_items_to_csv
from app.services.monday_service import monday_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/meetings", tags=["meetings"])


# ── PYDANTIC SCHEMAS ────────────────────────────────────────────────────────

class BlockerCreate(BaseModel):
    description: str
    owner: str = ""
    status: str = "open"

class BlockerUpdate(BaseModel):
    description: str | None = None
    owner: str | None = None
    status: str | None = None

class NextStepCreate(BaseModel):
    description: str
    owner: str = ""
    due_date: str = ""

class NextStepUpdate(BaseModel):
    description: str | None = None
    owner: str | None = None
    due_date: str | None = None
    done: bool | None = None


# ── LISTAR REUNIONES ────────────────────────────────────────────────────────

@router.get("/")
async def list_meetings(
    status: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_session),
):
    stmt = select(Meeting).order_by(desc(Meeting.start_time)).limit(limit)
    if status:
        stmt = stmt.where(Meeting.status == status)
    result = await db.execute(stmt)
    return [_meeting_to_dict(m) for m in result.scalars().all()]


# ── DETALLE ─────────────────────────────────────────────────────────────────

@router.get("/{meeting_id}")
async def get_meeting(meeting_id: int, db: AsyncSession = Depends(get_session)):
    meeting = await _get_or_404(meeting_id, db, load_relations=True)
    return _meeting_to_dict(meeting, full=True)


# ── UPLOAD + GENERAR RESUMEN ────────────────────────────────────────────────

@router.post("/upload")
async def upload_transcript(
    file: UploadFile = File(...),
    subject: str = Form("Reunión de Teams"),
    organizer: str = Form(""),
    meeting_date: str = Form(""),
    db: AsyncSession = Depends(get_session),
):
    if not file.filename.endswith((".vtt", ".txt", ".srt")):
        raise HTTPException(400, "Formato no soportado. Sube un archivo .vtt, .txt o .srt.")

    raw = await file.read()
    vtt_text = raw.decode("utf-8", errors="replace")

    try:
        start_time = datetime.fromisoformat(meeting_date) if meeting_date else datetime.utcnow()
    except ValueError:
        start_time = datetime.utcnow()

    meeting = Meeting(
        teams_meeting_id=f"local-{datetime.utcnow().timestamp()}",
        subject=subject,
        organizer_name=organizer or None,
        start_time=start_time,
        status=MeetingStatus.PROCESSING,
        transcript_text=vtt_text,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    # Generar resumen con IBM watsonx.ai
    summary = await generate_summary(vtt_text, subject)

    # Persistir resumen
    meeting.summary_text = json.dumps({
        "resumen_ejecutivo": summary.resumen_ejecutivo,
        "puntos_clave": summary.puntos_clave,
        "decisiones": summary.decisiones,
    }, ensure_ascii=False)
    meeting.action_items = json.dumps(summary.action_items, ensure_ascii=False)
    meeting.proximos_pasos = json.dumps(summary.proximos_pasos, ensure_ascii=False)
    meeting.bloqueantes_ia = json.dumps(summary.bloqueantes, ensure_ascii=False)
    meeting.status = MeetingStatus.SUMMARIZED
    await db.commit()

    # Poblar tablas relacionadas desde la IA
    for b_text in summary.bloqueantes:
        db.add(Blocker(meeting_id=meeting.id, description=b_text, from_ai=True))
    for ns_text in summary.proximos_pasos:
        db.add(NextStep(meeting_id=meeting.id, description=ns_text, from_ai=True))
    await db.commit()

    await db.refresh(meeting)
    return {"message": "Resumen generado.", "meeting": _meeting_to_dict(meeting)}


# ── REPROCESAR ──────────────────────────────────────────────────────────────

@router.post("/{meeting_id}/reprocess")
async def reprocess(meeting_id: int, db: AsyncSession = Depends(get_session)):
    meeting = await _get_or_404(meeting_id, db)
    if not meeting.transcript_text:
        raise HTTPException(400, "Sin transcripción guardada.")
    meeting.status = MeetingStatus.PROCESSING
    await db.commit()

    summary = await generate_summary(meeting.transcript_text, meeting.subject)
    meeting.summary_text = json.dumps({
        "resumen_ejecutivo": summary.resumen_ejecutivo,
        "puntos_clave": summary.puntos_clave,
        "decisiones": summary.decisiones,
    }, ensure_ascii=False)
    meeting.action_items = json.dumps(summary.action_items, ensure_ascii=False)
    meeting.proximos_pasos = json.dumps(summary.proximos_pasos, ensure_ascii=False)
    meeting.bloqueantes_ia = json.dumps(summary.bloqueantes, ensure_ascii=False)
    meeting.status = MeetingStatus.SUMMARIZED
    await db.commit()
    return {"message": "Resumen regenerado.", "meeting": _meeting_to_dict(meeting)}


# ── BLOQUEANTES CRUD ────────────────────────────────────────────────────────

@router.get("/{meeting_id}/blockers")
async def list_blockers(meeting_id: int, db: AsyncSession = Depends(get_session)):
    await _get_or_404(meeting_id, db)
    result = await db.execute(
        select(Blocker).where(Blocker.meeting_id == meeting_id).order_by(Blocker.created_at)
    )
    return [_blocker_to_dict(b) for b in result.scalars().all()]


@router.post("/{meeting_id}/blockers")
async def create_blocker(
    meeting_id: int,
    body: BlockerCreate,
    db: AsyncSession = Depends(get_session),
):
    await _get_or_404(meeting_id, db)
    b = Blocker(
        meeting_id=meeting_id,
        description=body.description,
        owner=body.owner,
        status=body.status,
        from_ai=False,
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return _blocker_to_dict(b)


@router.patch("/{meeting_id}/blockers/{blocker_id}")
async def update_blocker(
    meeting_id: int,
    blocker_id: int,
    body: BlockerUpdate,
    db: AsyncSession = Depends(get_session),
):
    result = await db.execute(
        select(Blocker).where(Blocker.id == blocker_id, Blocker.meeting_id == meeting_id)
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Bloqueante no encontrado.")
    if body.description is not None:
        b.description = body.description
    if body.owner is not None:
        b.owner = body.owner
    if body.status is not None:
        b.status = body.status
    await db.commit()
    await db.refresh(b)
    return _blocker_to_dict(b)


@router.delete("/{meeting_id}/blockers/{blocker_id}")
async def delete_blocker(
    meeting_id: int, blocker_id: int, db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(Blocker).where(Blocker.id == blocker_id, Blocker.meeting_id == meeting_id)
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Bloqueante no encontrado.")
    await db.delete(b)
    await db.commit()
    return {"message": "Eliminado."}


# ── PRÓXIMOS PASOS CRUD ─────────────────────────────────────────────────────

@router.get("/{meeting_id}/next-steps")
async def list_next_steps(meeting_id: int, db: AsyncSession = Depends(get_session)):
    await _get_or_404(meeting_id, db)
    result = await db.execute(
        select(NextStep).where(NextStep.meeting_id == meeting_id).order_by(NextStep.created_at)
    )
    return [_next_step_to_dict(ns) for ns in result.scalars().all()]


@router.post("/{meeting_id}/next-steps")
async def create_next_step(
    meeting_id: int,
    body: NextStepCreate,
    db: AsyncSession = Depends(get_session),
):
    await _get_or_404(meeting_id, db)
    ns = NextStep(
        meeting_id=meeting_id,
        description=body.description,
        owner=body.owner,
        due_date=body.due_date,
        from_ai=False,
    )
    db.add(ns)
    await db.commit()
    await db.refresh(ns)
    return _next_step_to_dict(ns)


@router.patch("/{meeting_id}/next-steps/{ns_id}")
async def update_next_step(
    meeting_id: int,
    ns_id: int,
    body: NextStepUpdate,
    db: AsyncSession = Depends(get_session),
):
    result = await db.execute(
        select(NextStep).where(NextStep.id == ns_id, NextStep.meeting_id == meeting_id)
    )
    ns = result.scalar_one_or_none()
    if not ns:
        raise HTTPException(404, "Próximo paso no encontrado.")
    if body.description is not None:
        ns.description = body.description
    if body.owner is not None:
        ns.owner = body.owner
    if body.due_date is not None:
        ns.due_date = body.due_date
    if body.done is not None:
        ns.done = body.done
    await db.commit()
    await db.refresh(ns)
    return _next_step_to_dict(ns)


@router.delete("/{meeting_id}/next-steps/{ns_id}")
async def delete_next_step(
    meeting_id: int, ns_id: int, db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(NextStep).where(NextStep.id == ns_id, NextStep.meeting_id == meeting_id)
    )
    ns = result.scalar_one_or_none()
    if not ns:
        raise HTTPException(404, "Próximo paso no encontrado.")
    await db.delete(ns)
    await db.commit()
    return {"message": "Eliminado."}


# ── SINCRONIZAR CON MONDAY.COM ──────────────────────────────────────────────

@router.post("/{meeting_id}/sync-monday")
async def sync_monday(meeting_id: int, db: AsyncSession = Depends(get_session)):
    meeting = await _get_or_404(meeting_id, db, load_relations=True)
    if not meeting.summary_text:
        raise HTTPException(400, "La reunión no tiene resumen aún.")
    if meeting.monday_board_id:
        return {"message": "Ya sincronizado.", "board_id": meeting.monday_board_id, "board_url": meeting.monday_board_url}

    s = json.loads(meeting.summary_text or "{}")
    actions = json.loads(meeting.action_items or "[]")
    blockers = [_blocker_to_dict(b) for b in meeting.blockers]
    next_steps = [_next_step_to_dict(ns) for ns in meeting.next_steps]

    board_id, board_url = await monday_service.sync_full_meeting(
        subject=meeting.subject,
        meeting_date=meeting.start_time,
        organizer=meeting.organizer_name or "",
        resumen_ejecutivo=s.get("resumen_ejecutivo", ""),
        puntos_clave=s.get("puntos_clave", []),
        decisiones=s.get("decisiones", []),
        action_items=actions,
        bloqueantes=blockers,
        proximos_pasos=next_steps,
    )

    meeting.monday_board_id = board_id
    meeting.monday_board_url = board_url
    meeting.status = MeetingStatus.SYNCED_MONDAY
    await db.commit()
    return {"message": "Tablero creado en Monday.com.", "board_id": board_id, "board_url": board_url}


# ── ELIMINAR ────────────────────────────────────────────────────────────────

@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: int, db: AsyncSession = Depends(get_session)):
    meeting = await _get_or_404(meeting_id, db)
    await db.delete(meeting)
    await db.commit()
    return {"message": "Reunión eliminada."}


# ── EXPORTACIÓN ─────────────────────────────────────────────────────────────

@router.get("/{meeting_id}/export/json")
async def export_json(meeting_id: int, db: AsyncSession = Depends(get_session)):
    meeting = await _get_or_404(meeting_id, db, load_relations=True)
    content = summary_to_json(_meeting_to_dict(meeting, full=True))
    return Response(content, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="resumen_{meeting_id}.json"'})


@router.get("/{meeting_id}/export/csv")
async def export_csv(meeting_id: int, db: AsyncSession = Depends(get_session)):
    meeting = await _get_or_404(meeting_id, db)
    content = summary_to_csv(_meeting_to_dict(meeting))
    return Response(content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="action_items_{meeting_id}.csv"'})


@router.get("/export/all-action-items")
async def export_all_csv(db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(Meeting).where(Meeting.status.in_([MeetingStatus.SUMMARIZED, MeetingStatus.SYNCED_MONDAY]))
        .order_by(desc(Meeting.start_time))
    )
    meetings = [_meeting_to_dict(m) for m in result.scalars().all()]
    content = all_action_items_to_csv(meetings)
    return Response(content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="todos_action_items.csv"'})


# ── HELPERS ──────────────────────────────────────────────────────────────────

async def _get_or_404(meeting_id: int, db: AsyncSession, load_relations: bool = False) -> Meeting:
    stmt = select(Meeting).where(Meeting.id == meeting_id)
    if load_relations:
        stmt = stmt.options(
            selectinload(Meeting.blockers),
            selectinload(Meeting.next_steps),
        )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Reunión no encontrada.")
    return meeting


def _meeting_to_dict(meeting: Meeting, full: bool = False) -> dict:
    summary = {}
    if meeting.summary_text:
        try:
            summary = json.loads(meeting.summary_text)
        except Exception:
            pass

    actions = []
    if meeting.action_items:
        try:
            actions = json.loads(meeting.action_items)
        except Exception:
            pass

    d = {
        "id": meeting.id,
        "subject": meeting.subject,
        "organizer_name": meeting.organizer_name,
        "start_time": meeting.start_time.isoformat() if meeting.start_time else None,
        "status": meeting.status,
        "summary": summary,
        "action_items": actions,
        "monday_board_id": meeting.monday_board_id,
        "monday_board_url": meeting.monday_board_url,
        "created_at": meeting.created_at.isoformat() if meeting.created_at else None,
    }

    if full and hasattr(meeting, "blockers"):
        d["blockers"] = [_blocker_to_dict(b) for b in (meeting.blockers or [])]
        d["next_steps"] = [_next_step_to_dict(ns) for ns in (meeting.next_steps or [])]

    return d


def _blocker_to_dict(b: Blocker) -> dict:
    return {
        "id": b.id,
        "description": b.description,
        "owner": b.owner or "",
        "status": b.status,
        "from_ai": b.from_ai,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def _next_step_to_dict(ns: NextStep) -> dict:
    return {
        "id": ns.id,
        "description": ns.description,
        "owner": ns.owner or "",
        "due_date": ns.due_date or "",
        "done": ns.done,
        "from_ai": ns.from_ai,
        "created_at": ns.created_at.isoformat() if ns.created_at else None,
    }
