"""
Bot de Microsoft Teams
Escucha el comando /resumen durante una reunión activa.
Cuando un usuario lo ejecuta, marca la reunión para generar resumen automáticamente
al terminar la llamada.
"""
import logging

from botbuilder.core import ActivityHandler, TurnContext, MessageFactory
from botbuilder.schema import Activity, ActivityTypes, ChannelAccount
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import Meeting, MeetingStatus, engine
from app.services.graph_service import graph_service

logger = logging.getLogger(__name__)

HELP_TEXT = """
🤖 **Bot de Resúmenes de Reuniones**

**Comandos disponibles:**

| Comando | Descripción |
|---------|-------------|
| `/resumen` | Activa la generación de resumen para esta reunión |
| `/resumen off` | Desactiva el resumen para esta reunión |
| `/estado` | Consulta el estado del resumen de esta reunión |
| `/ayuda` | Muestra este mensaje |

💡 _Cuando ejecutas `/resumen`, al terminar la llamada se generará automáticamente el resumen y se creará un tablero en Monday.com._
"""


class TeamsBot(ActivityHandler):

    async def on_message_activity(self, turn_context: TurnContext) -> None:
        text = (turn_context.activity.text or "").strip().lower()
        user = turn_context.activity.from_property
        meeting_id = self._get_meeting_id(turn_context)

        if text.startswith("/resumen"):
            await self._handle_resumen(turn_context, text, user, meeting_id)
        elif text.startswith("/estado"):
            await self._handle_estado(turn_context, meeting_id)
        elif text.startswith("/ayuda") or text.startswith("/help"):
            await turn_context.send_activity(MessageFactory.text(HELP_TEXT))
        else:
            # Responde solo si es un mensaje directo al bot
            if turn_context.activity.conversation.is_group is False:
                await turn_context.send_activity(
                    MessageFactory.text("No entendí el comando. Escribe `/ayuda` para ver los comandos disponibles.")
                )

    async def on_members_added_activity(
        self, members_added: list[ChannelAccount], turn_context: TurnContext
    ) -> None:
        for member in members_added:
            if member.id != turn_context.activity.recipient.id:
                await turn_context.send_activity(
                    MessageFactory.text(
                        "👋 ¡Hola! Soy el bot de resúmenes de reuniones.\n"
                        "Escribe `/resumen` en cualquier momento para activar el resumen automático de esta reunión."
                    )
                )

    # ------------------------------------------------------------------
    #  HANDLERS DE COMANDOS
    # ------------------------------------------------------------------

    async def _handle_resumen(
        self,
        turn_context: TurnContext,
        text: str,
        user: ChannelAccount,
        meeting_id: str | None,
    ) -> None:
        """Activa o desactiva el resumen para la reunión actual."""
        deactivate = "off" in text

        if not meeting_id:
            await turn_context.send_activity(
                MessageFactory.text(
                    "⚠️ No pude identificar el ID de esta reunión. "
                    "Asegúrate de que el bot está instalado correctamente en el canal."
                )
            )
            return

        async with AsyncSession(engine, expire_on_commit=False) as db:
            stmt = select(Meeting).where(Meeting.teams_meeting_id == meeting_id)
            result = await db.execute(stmt)
            meeting = result.scalar_one_or_none()

            if not meeting:
                # Crear registro de la reunión si no existe
                meeting = Meeting(
                    teams_meeting_id=meeting_id,
                    subject=self._get_meeting_subject(turn_context),
                    organizer_email=user.aad_object_id or user.id,
                    organizer_name=user.name,
                    start_time=turn_context.activity.timestamp,
                    status=MeetingStatus.PENDING,
                    summary_requested=False,
                )
                db.add(meeting)

            if deactivate:
                meeting.summary_requested = False
                await db.commit()
                await turn_context.send_activity(
                    MessageFactory.text(
                        f"🔕 **Resumen desactivado**\n\n"
                        f"_{user.name}_ ha desactivado la generación de resumen para esta reunión."
                    )
                )
            else:
                meeting.summary_requested = True
                meeting.summary_requested_by = user.name
                await db.commit()

                card_text = (
                    f"✅ **Resumen activado por {user.name}**\n\n"
                    f"📋 Al terminar esta reunión se generará automáticamente:\n"
                    f"- 📝 Resumen ejecutivo\n"
                    f"- ✅ Action items\n"
                    f"- 🎯 Decisiones tomadas\n"
                    f"- 📊 Tablero en Monday.com\n\n"
                    f"_Para cancelar, escribe `/resumen off`_"
                )
                await turn_context.send_activity(MessageFactory.text(card_text))
                logger.info(
                    "Resumen activado por %s para meeting_id=%s", user.name, meeting_id
                )

    async def _handle_estado(
        self, turn_context: TurnContext, meeting_id: str | None
    ) -> None:
        """Consulta el estado del resumen de la reunión actual."""
        if not meeting_id:
            await turn_context.send_activity(MessageFactory.text("⚠️ No pude identificar la reunión."))
            return

        async with AsyncSession(engine, expire_on_commit=False) as db:
            stmt = select(Meeting).where(Meeting.teams_meeting_id == meeting_id)
            result = await db.execute(stmt)
            meeting = result.scalar_one_or_none()

        if not meeting:
            await turn_context.send_activity(
                MessageFactory.text("ℹ️ Esta reunión aún no está registrada. Usa `/resumen` para activar el resumen.")
            )
            return

        status_icons = {
            MeetingStatus.PENDING: "⏳ Pendiente",
            MeetingStatus.RECORDING: "🔴 Grabando",
            MeetingStatus.PROCESSING: "⚙️ Procesando",
            MeetingStatus.SUMMARIZED: "✅ Resumen listo",
            MeetingStatus.SYNCED_MONDAY: "📊 Sincronizado en Monday.com",
            MeetingStatus.ERROR: "❌ Error al procesar",
        }
        status_text = status_icons.get(meeting.status, meeting.status)
        requested = "✅ Sí" if meeting.summary_requested else "❌ No"

        msg = (
            f"📊 **Estado de la reunión**\n\n"
            f"**Estado:** {status_text}\n"
            f"**Resumen activado:** {requested}\n"
        )
        if meeting.summary_requested_by:
            msg += f"**Activado por:** {meeting.summary_requested_by}\n"
        if meeting.monday_board_id:
            msg += f"**Monday.com Board ID:** `{meeting.monday_board_id}`\n"

        await turn_context.send_activity(MessageFactory.text(msg))

    # ------------------------------------------------------------------
    #  HELPERS
    # ------------------------------------------------------------------

    @staticmethod
    def _get_meeting_id(turn_context: TurnContext) -> str | None:
        """Extrae el ID de la reunión del contexto de Teams."""
        channel_data = turn_context.activity.channel_data or {}
        meeting = channel_data.get("meeting") or {}
        return meeting.get("id")

    @staticmethod
    def _get_meeting_subject(turn_context: TurnContext) -> str:
        """Intenta obtener el asunto de la reunión del contexto."""
        channel_data = turn_context.activity.channel_data or {}
        meeting = channel_data.get("meeting") or {}
        return meeting.get("name") or "Reunión de Teams"
