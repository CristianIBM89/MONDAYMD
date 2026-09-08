import { z } from 'zod';

// ─── Acción pendiente ────────────────────────────────────────────
export const pendingActionSchema = z.object({
  descripcion: z.string(),
  responsable: z.string().default('Pendiente por definir'),
  fecha_limite: z.string().default('Pendiente por definir'),
  estado: z.string().default('Pendiente'),
});

// ─── Bloqueante sugerido por IA ──────────────────────────────────
export const suggestedBlockerSchema = z.object({
  descripcion: z.string(),
  tipo: z.string().default('Pendiente por definir'),
  impacto: z.string().default('Pendiente por definir'),
  urgencia_sugerida: z.string().default('Pendiente por definir'),
});

// ─── Versión corta para Slack ────────────────────────────────────
export const slackVersionSchema = z.object({
  encabezado: z.string(),
  puntos_clave: z.array(z.string()).max(5),
  decisiones: z.array(z.string()),
  acciones_con_responsable: z.array(z.string()),
  bloqueantes_relevantes: z.array(z.string()),
  proxima_sesion: z.string().default('Pendiente por definir'),
});

// ─── Respuesta principal de watsonx ─────────────────────────────
export const watsonxResponseSchema = z.object({
  resumen_ejecutivo: z.string(),
  temas_tratados: z.array(z.string()),
  decisiones_tomadas: z.array(z.string()),
  acuerdos: z.array(z.string()),
  acciones_pendientes: z.array(pendingActionSchema),
  bloqueantes_identificados: z.array(suggestedBlockerSchema),
  riesgos: z.array(z.string()),
  dependencias: z.array(z.string()),
  problemas_operativos: z.array(z.string()),
  preguntas_abiertas: z.array(z.string()),
  proximos_pasos: z.array(z.string()),
  info_showcase: z.string().default('Pendiente por definir'),
  conclusiones_retrospectiva: z.array(z.string()),
  requiere_atencion_gerencial: z.object({
    aplica: z.boolean(),
    motivo: z.string().default(''),
  }),
  version_slack: slackVersionSchema,
});

export type WatsonxResponse = z.infer<typeof watsonxResponseSchema>;
export type PendingAction = z.infer<typeof pendingActionSchema>;
export type SuggestedBlocker = z.infer<typeof suggestedBlockerSchema>;
export type SlackVersion = z.infer<typeof slackVersionSchema>;

// ─── Request: procesar resumen ───────────────────────────────────
export const processSummaryRequestSchema = z.object({
  sessionType: z.enum([
    'reunion_general',
    'sesion_agile',
    'retrospectiva',
    'showcase',
    'otra',
  ]),
  iterationId: z.string().optional().default('sin-iteracion'),   // optional — user may not have an active iteration yet
  iterationName: z.string().min(1),
  sessionName: z.string().min(1),
  sessionDate: z.string().min(1),
  teamsLink: z.string().url().optional(),
  summaryText: z.string().min(10, 'El resumen no puede estar vacío'),
  manualIcaResult: z.string().optional(),
});

export type ProcessSummaryRequest = z.infer<typeof processSummaryRequestSchema>;

// ─── Request: enviar a Monday ────────────────────────────────────
export const sendToMondayRequestSchema = z.object({
  summaryId: z.string().min(1),
  approvedData: watsonxResponseSchema,
  sessionName: z.string().min(1),
  sessionDate: z.string().min(1),
  sessionType: z.string().min(1),
  iterationName: z.string().min(1),
  iterationManagerName: z.string().default('Pendiente por definir'),
  participants: z.array(z.string()),
  teamsLink: z.string().optional(),
});

export type SendToMondayRequest = z.infer<typeof sendToMondayRequestSchema>;

// ─── Request: bloqueante ─────────────────────────────────────────
export const blockerRequestSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  tipo: z.enum([
    'operativo',
    'tecnico',
    'acceso',
    'herramienta',
    'dependencia',
    'capacidad',
    'otro',
  ]),
  impacto: z.enum(['bajo', 'medio', 'alto', 'critico']),
  urgencia: z.enum(['normal', 'urgente', 'bloqueante_total']),
  iteracionId: z.string().optional().default('sin-iteracion'),
  iteracionNombre: z.string().min(1),
  procesoAfectado: z.string().default(''),
  responsableSugerido: z.string().default('Pendiente por definir'),
  fechaEsperadaSolucion: z.string().default('Pendiente por definir'),
  requiereEscalamiento: z.boolean().default(false),
  comentarios: z.string().default(''),
  idempotencyKey: z.string().uuid(),
});

export type BlockerRequest = z.infer<typeof blockerRequestSchema>;

// ─── Request: showcase ───────────────────────────────────────────
export const showcaseRequestSchema = z.object({
  iteracionNombre: z.string().min(1),
  entregable: z.string().min(1),
  descripcion: z.string().min(1),
  responsable: z.string().min(1),
  presentador: z.string().min(1),
  fecha: z.string().min(1),
  resultado: z.string().default(''),
  valorNegocio: z.string().default(''),
  estado: z.string().default('En preparación'),
  retroalimentacion: z.string().default(''),
  proximoPaso: z.string().default(''),
  idempotencyKey: z.string().uuid(),
});

export type ShowcaseRequest = z.infer<typeof showcaseRequestSchema>;

// ─── Request: retrospectiva ──────────────────────────────────────
export const retroRequestSchema = z.object({
  categoria: z.enum(['bien', 'mal', 'mejorar', 'preguntas']),
  comentario: z.string().min(1),
  autor: z.string().optional(),
  iteracionNombre: z.string().min(1),
  fecha: z.string().min(1),
  prioridad: z.number().int().min(0).default(0),
  accionMejora: z.string().default(''),
  responsableMejora: z.string().default(''),
  fechaCumplimiento: z.string().default(''),
  estado: z.string().default('Abierto'),
  idempotencyKey: z.string().uuid(),
});

export type RetroRequest = z.infer<typeof retroRequestSchema>;
