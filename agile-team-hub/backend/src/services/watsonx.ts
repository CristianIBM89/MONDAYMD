import { config } from '../config';
import { WatsonxResponse, watsonxResponseSchema } from '../schemas';
import { auditLog } from './auditLog';

const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';

interface IamTokenResponse {
  access_token: string;
  expires_in: number;
  expiration: number;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getIamToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(IAM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${config.WATSONX_API_KEY}`,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Error obteniendo IAM token: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as IamTokenResponse;
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return tokenCache.token;
}

// Granite / generic chat template tokens (works for both Llama and Granite)
const SYS_OPEN  = '<|start_of_role|>system<|end_of_role|>';
const SYS_CLOSE = '<|end_of_text|>';
const USR_OPEN  = '<|start_of_role|>user<|end_of_role|>';
const USR_CLOSE = '<|end_of_text|>';
const AST_OPEN  = '<|start_of_role|>assistant<|end_of_role|>';

const SYSTEM_INSTRUCTION = `Eres un asistente especializado en documentación ejecutiva de reuniones Agile para equipos IBM.
Tu ÚNICA función es extraer, clasificar y estructurar la información que ya existe en el texto proporcionado.
REGLAS OBLIGATORIAS:
1. Si un dato no está en el texto, usa exactamente la cadena: "Pendiente por definir"
2. No parafrasees ni cambies el sentido de ninguna decisión o acuerdo.
3. No agregues información de contexto externo.
4. Responde ÚNICAMENTE con JSON válido. Sin texto antes, sin texto después, sin markdown, sin bloques de código.
5. version_slack.puntos_clave máximo 5 elementos, lenguaje ejecutivo.
6. Todos los arrays deben ser arrays aunque tengan un solo elemento o estén vacíos.`;

const JSON_TEMPLATE = `{
  "resumen_ejecutivo": "",
  "temas_tratados": [],
  "decisiones_tomadas": [],
  "acuerdos": [],
  "acciones_pendientes": [{"descripcion":"","responsable":"Pendiente por definir","fecha_limite":"Pendiente por definir","estado":"Pendiente"}],
  "bloqueantes_identificados": [{"descripcion":"","tipo":"Pendiente por definir","impacto":"Pendiente por definir","urgencia_sugerida":"Pendiente por definir"}],
  "riesgos": [],
  "dependencias": [],
  "problemas_operativos": [],
  "preguntas_abiertas": [],
  "proximos_pasos": [],
  "info_showcase": "Pendiente por definir",
  "conclusiones_retrospectiva": [],
  "requiere_atencion_gerencial": {"aplica": false, "motivo": ""},
  "version_slack": {"encabezado":"","puntos_clave":[],"decisiones":[],"acciones_con_responsable":[],"bloqueantes_relevantes":[],"proxima_sesion":"Pendiente por definir"}
}`;

function buildPrompt(
  summaryText: string,
  sessionType: string,
  iterationName: string,
  sessionDate: string
): string {
  const userMessage = `Extrae y estructura la siguiente transcripción de reunión en el JSON indicado.

TIPO DE SESIÓN: ${sessionType}
ITERACIÓN: ${iterationName}
FECHA: ${sessionDate}

TRANSCRIPCIÓN / NOTAS:
---
${summaryText.slice(0, 12_000)}
---

Devuelve ÚNICAMENTE el siguiente JSON completado. No escribas nada más:
${JSON_TEMPLATE}`;

  return `${SYS_OPEN}${SYSTEM_INSTRUCTION}${SYS_CLOSE}${USR_OPEN}${userMessage}${USR_CLOSE}${AST_OPEN}`;
}

export async function processWithWatsonx(
  summaryText: string,
  sessionType: string,
  iterationName: string,
  sessionDate: string,
  userEmail: string
): Promise<WatsonxResponse> {
  let token = await getIamToken();
  const prompt = buildPrompt(summaryText, sessionType, iterationName, sessionDate);

  const endpoint = `https://${config.WATSONX_REGION}.ml.cloud.ibm.com/ml/v1/text/generation?version=${config.WATSONX_API_VERSION}`;

  // Model cascade — mistralai/mistral-large removed (404 - deprecated by watsonx.ai)
  // Replaced with ibm/granite-3-3-8b-instruct (Granite 3.3, actively maintained)
  const MODEL_CASCADE = [
    config.WATSONX_MODEL_ID,           // primary: meta-llama/llama-3-3-70b-instruct (or env override)
    'ibm/granite-3-2-8b-instruct',     // fallback 1: confirmed active
    'ibm/granite-3-8b-instruct',       // fallback 2: confirmed active
    'ibm/granite-3-3-8b-instruct',     // fallback 3: Granite 3.3 series, active
  ];

  const buildBody = (modelId: string) => ({
    model_id: modelId,
    input: prompt,
    parameters: {
      max_new_tokens: 4096,
      temperature: 0.05,
      top_p: 0.9,
      repetition_penalty: 1.05,
      stop_sequences: ['<|end_of_text|>', '<|eot_id|>'],
    },
    project_id: config.WATSONX_PROJECT_ID,
  });

  // Try each model; advance to next on 429 (rate limit) or 404 (model deprecated/removed)
  let res: Response | null = null;
  let usedModel = MODEL_CASCADE[0];
  for (let i = 0; i < MODEL_CASCADE.length; i++) {
    usedModel = MODEL_CASCADE[i];
    // On 429 retry same model up to 2 times with backoff before moving on
    for (let attempt = 1; attempt <= 2; attempt++) {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(usedModel)),
        signal: AbortSignal.timeout(config.WATSONX_TIMEOUT),
      });
      if (res.status === 429 && attempt < 2) {
        const waitMs = attempt * 20_000;
        await auditLog({ user: userEmail, action: 'WATSONX_RETRY', detail: `model=${usedModel} attempt=${attempt} wait=${waitMs}ms`, result: 'error' });
        await new Promise((r) => setTimeout(r, waitMs));
        token = await getIamToken();
        continue;
      }
      break;
    }
    // Move to next model on 429 (still rate limited) or 404 (model not found/deprecated)
    if (res!.status === 429 || res!.status === 404) {
      await auditLog({ user: userEmail, action: 'WATSONX_MODEL_FALLBACK', detail: `from=${usedModel} status=${res!.status}`, result: 'error' });
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    const errText = await res!.text();
    await auditLog({ user: userEmail, action: 'WATSONX_ERROR', detail: `HTTP ${res!.status}`, result: 'error' });
    // Friendly message for common errors
    let friendlyMsg = `watsonx.ai respondió con error ${res!.status}: ${errText.slice(0, 300)}`;
    if (errText.includes('consumption_limit_reached')) {
      friendlyMsg = 'Se alcanzó el límite de uso gratuito de watsonx.ai para este mes. Opciones: (1) Esperar renovación mensual, (2) Actualizar el plan en cloud.ibm.com, (3) Usar otra API Key IBM en la configuración de Render.';
    } else if (errText.includes('model_not_supported')) {
      friendlyMsg = 'El modelo de IA configurado no está disponible en tu cuenta de watsonx.ai. Contacta al administrador para actualizar WATSONX_MODEL_ID en Render.';
    }
    throw new Error(friendlyMsg);
  }

  const raw = (await res.json()) as { results?: Array<{ generated_text: string }> };
  const generatedText = raw.results?.[0]?.generated_text ?? '';

  // Extract JSON from response — handle cases where model adds extra text
  const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('La respuesta de watsonx no contiene JSON válido. Usa el modo ICA manual.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('JSON de watsonx no es parseable. Revisa el resultado manualmente.');
  }

  const validated = watsonxResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `JSON de watsonx no cumple el schema esperado: ${validated.error.issues
        .slice(0, 3)
        .map((i) => i.path.join('.') + ': ' + i.message)
        .join('; ')}`
    );
  }

  await auditLog({
    user: userEmail,
    action: 'WATSONX_PROCESS',
    detail: `model=${config.WATSONX_MODEL_ID}`,
    result: 'success',
  });

  return validated.data;
}

export function prepareIcaPrompt(
  summaryText: string,
  sessionType: string,
  iterationName: string,
  sessionDate: string
): string {
  return buildPrompt(summaryText, sessionType, iterationName, sessionDate);
}
