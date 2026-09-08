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

// Llama 3.x chat template tokens
const SYS_OPEN  = '<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n';
const SYS_CLOSE = '\n<|eot_id|>';
const USR_OPEN  = '<|start_header_id|>user<|end_header_id|>\n';
const USR_CLOSE = '\n<|eot_id|>';
const AST_OPEN  = '<|start_header_id|>assistant<|end_header_id|>\n';

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

  const body = {
    model_id: config.WATSONX_MODEL_ID,
    input: prompt,
    parameters: {
      max_new_tokens: 4096,
      temperature: 0.05,
      top_p: 0.9,
      repetition_penalty: 1.05,
      stop_sequences: ['<|eot_id|>'],   // Stop at end-of-turn for Llama chat template
    },
    project_id: config.WATSONX_PROJECT_ID,
  };

  // Retry up to 3 times on 429 (rate limit) with exponential backoff
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.WATSONX_TIMEOUT),
    });
    if (res.status !== 429) break;
    if (attempt < 3) {
      const waitMs = attempt * 15_000;   // 15s, 30s — Llama 70B free tier needs longer recovery
      await auditLog({ user: userEmail, action: 'WATSONX_RETRY', detail: `attempt=${attempt} wait=${waitMs}ms`, result: 'success' });
      await new Promise((r) => setTimeout(r, waitMs));
      // Refresh IAM token in case it expired during wait
      token = await getIamToken();
    }
  }

  if (!res || !res.ok) {
    const errText = await res!.text();
    await auditLog({ user: userEmail, action: 'WATSONX_ERROR', detail: `HTTP ${res!.status}`, result: 'error' });
    throw new Error(`watsonx.ai respondió con error ${res!.status}: ${errText.slice(0, 300)}`);
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
