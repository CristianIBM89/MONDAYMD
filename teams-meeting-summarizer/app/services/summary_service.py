"""
Servicio de resúmenes usando IBM watsonx.ai
Modelo: ibm/granite-13b-instruct-v2 (plan Lite — gratuito con cuenta corporativa IBM)

El plan Lite incluye 50 000 tokens/mes sin coste.
Autenticación vía IBM IAM (API key de cuenta corporativa @ibm.com).
"""
import json
import logging
import re
from dataclasses import dataclass, field

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Endpoints IBM watsonx.ai
IAM_TOKEN_URL = "https://iam.cloud.ibm.com/identity/token"

WATSONX_URL_TEMPLATE = (
    "https://{region}.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29"
)

PROMPT_TEMPLATE = """<|system|>
Eres un asistente experto en análisis de reuniones corporativas de IBM.
Recibirás la transcripción de una reunión de Microsoft Teams.
Tu tarea es generar un resumen estructurado en español.

Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta (sin texto adicional):
{{
  "resumen_ejecutivo": "párrafo de 3 a 5 oraciones resumiendo la reunión",
  "puntos_clave": ["punto 1", "punto 2", "punto 3"],
  "decisiones": ["decisión 1", "decisión 2"],
  "action_items": [
    {{"tarea": "descripción", "responsable": "nombre o vacío", "fecha_limite": "fecha o vacío"}}
  ],
  "proximos_pasos": ["paso 1", "paso 2"],
  "bloqueantes": ["bloqueante 1", "bloqueante 2"]
}}
<|user|>
Reunión: {subject}

TRANSCRIPCIÓN:
{transcript}
<|assistant|>"""


@dataclass
class MeetingSummary:
    resumen_ejecutivo: str = ""
    puntos_clave: list[str] = field(default_factory=list)
    decisiones: list[str] = field(default_factory=list)
    action_items: list[dict] = field(default_factory=list)
    proximos_pasos: list[str] = field(default_factory=list)
    bloqueantes: list[str] = field(default_factory=list)


def parse_vtt(vtt_text: str) -> str:
    """Extrae texto limpio de un archivo .vtt, eliminando timestamps y metadata."""
    lines = vtt_text.splitlines()
    clean: list[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("WEBVTT") or line.startswith("NOTE"):
            continue
        if re.match(r"^\d{2}:\d{2}[:\.]\d{2}", line):
            continue
        if re.match(r"^\d+$", line):
            continue
        line = re.sub(r"<[^>]+>", "", line).strip()
        if line:
            clean.append(line)
    return "\n".join(clean)


def _extract_json(text: str) -> dict:
    """Extrae el primer bloque JSON del texto de respuesta del LLM."""
    match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    start = text.find("{")
    if start == -1:
        raise ValueError("No se encontró JSON en la respuesta del modelo.")
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start: i + 1])
    raise ValueError("JSON incompleto en la respuesta del modelo.")


async def _get_iam_token() -> str:
    """Obtiene un token IAM de IBM Cloud usando la API key."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            IAM_TOKEN_URL,
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": settings.ibm_api_key,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def generate_summary(vtt_or_plain_text: str, meeting_subject: str = "") -> MeetingSummary:
    """
    Envía la transcripción a IBM watsonx.ai y retorna el resumen estructurado.
    Usa el modelo Granite (ibm/granite-13b-instruct-v2), incluido en el plan Lite gratuito.
    """
    if not settings.ibm_api_key or not settings.ibm_project_id:
        logger.warning("IBM watsonx.ai no configurado. Revisa IBM_API_KEY e IBM_PROJECT_ID en .env")
        return MeetingSummary(
            resumen_ejecutivo=(
                "⚠️ IBM watsonx.ai no está configurado. "
                "Agrega IBM_API_KEY e IBM_PROJECT_ID en el archivo .env"
            )
        )

    clean_text = parse_vtt(vtt_or_plain_text)

    # Granite-13b tiene ~8192 tokens de contexto; ~5000 chars de transcripción es seguro
    if len(clean_text) > 12_000:
        logger.warning("Transcripción larga (%d chars), truncando.", len(clean_text))
        clean_text = clean_text[:12_000] + "\n[TRANSCRIPCIÓN TRUNCADA]"

    prompt = PROMPT_TEMPLATE.format(
        subject=meeting_subject,
        transcript=clean_text,
    )

    try:
        token = await _get_iam_token()
        url = WATSONX_URL_TEMPLATE.format(region=settings.ibm_region)

        payload = {
            "model_id": settings.ibm_model_id,
            "input": prompt,
            "project_id": settings.ibm_project_id,
            "parameters": {
                "decoding_method": "greedy",
                "max_new_tokens": 1200,
                "min_new_tokens": 50,
                "repetition_penalty": 1.1,
            },
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            resp.raise_for_status()
            result = resp.json()

        generated = result["results"][0]["generated_text"]
        logger.info("watsonx.ai respondió (%d chars)", len(generated))

        data = _extract_json(generated)
        return MeetingSummary(
            resumen_ejecutivo=data.get("resumen_ejecutivo", ""),
            puntos_clave=data.get("puntos_clave", []),
            decisiones=data.get("decisiones", []),
            action_items=data.get("action_items", []),
            proximos_pasos=data.get("proximos_pasos", []),
            bloqueantes=data.get("bloqueantes", []),
        )

    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 401:
            logger.error("IBM watsonx.ai: API key inválida o expirada.")
            return MeetingSummary(resumen_ejecutivo="❌ IBM API key inválida. Verifica IBM_API_KEY en .env")
        if status == 403:
            logger.error("IBM watsonx.ai: sin acceso al proyecto o modelo.")
            return MeetingSummary(resumen_ejecutivo="❌ Sin acceso. Verifica IBM_PROJECT_ID y permisos.")
        logger.exception("HTTP error %d de watsonx.ai", status)
        return MeetingSummary(resumen_ejecutivo=f"❌ Error HTTP {status} al llamar a watsonx.ai")
    except Exception as exc:
        logger.exception("Error generando resumen: %s", exc)
        return MeetingSummary(resumen_ejecutivo=f"❌ Error inesperado: {exc}")
