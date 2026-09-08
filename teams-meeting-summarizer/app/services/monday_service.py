"""
Servicio Monday.com — crea tablero completo con:
- Grupo "Resumen & Decisiones"
- Grupo "Action Items"
- Grupo "Bloqueantes"
- Grupo "Próximos Pasos"
Usa la API GraphQL v2 de Monday.com (gratuita con cuenta existente).
"""
import json
import logging
from datetime import datetime
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)
MONDAY_API_URL = "https://api.monday.com/v2"


class MondayService:
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": settings.monday_api_key,
            "Content-Type": "application/json",
            "API-Version": "2024-01",
        }

    async def _query(self, query: str, variables: dict | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(MONDAY_API_URL, json=payload, headers=self._headers())
            resp.raise_for_status()
            result = resp.json()
        if "errors" in result:
            raise RuntimeError(f"Monday API error: {result['errors']}")
        return result.get("data", {})

    async def _create_board(self, name: str) -> str:
        data = await self._query(
            """mutation ($n: String!, $w: ID!, $k: BoardKind!) {
                 create_board(board_name:$n, workspace_id:$w, board_kind:$k) { id }
               }""",
            {"n": name, "w": settings.monday_workspace_id, "k": "public"},
        )
        return data["create_board"]["id"]

    async def _create_group(self, board_id: str, name: str) -> str:
        data = await self._query(
            """mutation ($b: ID!, $g: String!) {
                 create_group(board_id:$b, group_name:$g) { id }
               }""",
            {"b": board_id, "g": name},
        )
        return data["create_group"]["id"]

    async def _create_item(self, board_id: str, group_id: str, name: str) -> str:
        data = await self._query(
            """mutation ($b: ID!, $g: String!, $n: String!) {
                 create_item(board_id:$b, group_id:$g, item_name:$n) { id }
               }""",
            {"b": board_id, "g": group_id, "n": name},
        )
        return data["create_item"]["id"]

    async def _add_update(self, item_id: str, body: str) -> None:
        await self._query(
            """mutation ($i: ID!, $b: String!) {
                 create_update(item_id:$i, body:$b) { id }
               }""",
            {"i": item_id, "b": body},
        )

    async def sync_full_meeting(
        self,
        subject: str,
        meeting_date: datetime,
        organizer: str,
        resumen_ejecutivo: str,
        puntos_clave: list[str],
        decisiones: list[str],
        action_items: list[dict],
        bloqueantes: list[dict],   # [{description, owner, status}]
        proximos_pasos: list[dict], # [{description, owner, due_date}]
    ) -> tuple[str, str]:
        """
        Crea el tablero completo en Monday.com.
        Retorna (board_id, board_url).
        """
        date_str = meeting_date.strftime("%Y-%m-%d")
        board_name = f"Reunión: {subject} ({date_str})"
        board_id = await self._create_board(board_name)
        board_url = f"https://app.monday.com/boards/{board_id}"

        # ── Grupo 1: Resumen ────────────────────────────────────────
        g_resumen = await self._create_group(board_id, "📋 Resumen & Decisiones")
        item_id = await self._create_item(board_id, g_resumen, f"Resumen — {subject}")

        body = (
            f"**Organizador:** {organizer}\n"
            f"**Fecha:** {date_str}\n\n"
            f"**Resumen ejecutivo:**\n{resumen_ejecutivo}\n\n"
            f"**Puntos clave:**\n" + "\n".join(f"- {p}" for p in puntos_clave) + "\n\n"
            f"**Decisiones:**\n" + "\n".join(f"- {d}" for d in decisiones)
        )
        await self._add_update(item_id, body)

        # ── Grupo 2: Action Items ────────────────────────────────────
        if action_items:
            g_actions = await self._create_group(board_id, "✅ Action Items")
            for item in action_items:
                label = item.get("tarea", "Tarea")
                if item.get("responsable"):
                    label = f"[{item['responsable']}] {label}"
                ai_id = await self._create_item(board_id, g_actions, label)
                if item.get("fecha_limite"):
                    await self._add_update(ai_id, f"📅 Fecha límite: {item['fecha_limite']}")

        # ── Grupo 3: Bloqueantes ─────────────────────────────────────
        if bloqueantes:
            g_block = await self._create_group(board_id, "🚧 Bloqueantes")
            for b in bloqueantes:
                desc = b.get("description", "Bloqueante")
                status = b.get("status", "open")
                owner = b.get("owner", "")
                label = f"[{status.upper()}] {desc}"
                if owner:
                    label = f"[{status.upper()}] [{owner}] {desc}"
                await self._create_item(board_id, g_block, label)

        # ── Grupo 4: Próximos Pasos ──────────────────────────────────
        if proximos_pasos:
            g_next = await self._create_group(board_id, "🎯 Próximos Pasos")
            for ns in proximos_pasos:
                desc = ns.get("description", "Paso")
                owner = ns.get("owner", "")
                due = ns.get("due_date", "")
                label = desc
                if owner:
                    label = f"[{owner}] {label}"
                ns_id = await self._create_item(board_id, g_next, label)
                if due:
                    await self._add_update(ns_id, f"📅 Fecha: {due}")

        logger.info("Tablero Monday.com creado: %s", board_url)
        return board_id, board_url


monday_service = MondayService()
