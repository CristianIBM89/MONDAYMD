from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, DateTime, Enum, ForeignKey,
    Integer, String, Text, Boolean,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)


class Base(DeclarativeBase):
    pass


class MeetingStatus(str, PyEnum):
    PENDING    = "pending"
    PROCESSING = "processing"
    SUMMARIZED = "summarized"
    SYNCED_MONDAY = "synced_monday"
    ERROR      = "error"


class BlockerStatus(str, PyEnum):
    OPEN     = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class Meeting(Base):
    __tablename__ = "meetings"

    id                  = Column(Integer, primary_key=True, index=True)
    teams_meeting_id    = Column(String(255), unique=True, index=True)
    subject             = Column(String(512), nullable=False)
    organizer_name      = Column(String(255))
    start_time          = Column(DateTime, nullable=False)
    status              = Column(Enum(MeetingStatus), default=MeetingStatus.PENDING)
    summary_requested   = Column(Boolean, default=False)
    summary_requested_by = Column(String(255))
    transcript_text     = Column(Text)
    summary_text        = Column(Text)   # JSON: resumen_ejecutivo, puntos_clave, decisiones
    action_items        = Column(Text)   # JSON list
    proximos_pasos      = Column(Text)   # JSON list — editables por el usuario
    bloqueantes_ia      = Column(Text)   # JSON list — detectados por IA (solo lectura base)
    monday_board_id     = Column(String(128))
    monday_board_url    = Column(Text)
    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    blockers     = relationship("Blocker",     back_populates="meeting", cascade="all, delete-orphan")
    next_steps   = relationship("NextStep",    back_populates="meeting", cascade="all, delete-orphan")


class Blocker(Base):
    """Bloqueante editable — puede venir de la IA o ser creado/modificado por el usuario."""
    __tablename__ = "blockers"

    id          = Column(Integer, primary_key=True, index=True)
    meeting_id  = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    description = Column(Text, nullable=False)
    owner       = Column(String(255))        # responsable de resolverlo
    status      = Column(Enum(BlockerStatus), default=BlockerStatus.OPEN)
    from_ai     = Column(Boolean, default=False)  # True = detectado por IA
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    meeting = relationship("Meeting", back_populates="blockers")


class NextStep(Base):
    """Próximo paso editable — puede venir de la IA o ser añadido/modificado por el usuario."""
    __tablename__ = "next_steps"

    id          = Column(Integer, primary_key=True, index=True)
    meeting_id  = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    description = Column(Text, nullable=False)
    owner       = Column(String(255))
    due_date    = Column(String(64))         # fecha libre (string para flexibilidad)
    done        = Column(Boolean, default=False)
    from_ai     = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    meeting = relationship("Meeting", back_populates="next_steps")


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
