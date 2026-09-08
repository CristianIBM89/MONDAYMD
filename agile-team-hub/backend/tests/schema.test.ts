import { watsonxResponseSchema } from '../src/schemas';

const validResponse = {
  resumen_ejecutivo: 'El equipo revisó los avances del sprint 22.',
  temas_tratados: ['Revisión de acciones', 'Bloqueantes técnicos'],
  decisiones_tomadas: ['Se prioriza el módulo de pagos'],
  acuerdos: ['Entregar PRD el viernes'],
  acciones_pendientes: [
    { descripcion: 'Revisar API de pagos', responsable: 'Ana López', fecha_limite: '2024-11-20', estado: 'Pendiente' },
  ],
  bloqueantes_identificados: [
    { descripcion: 'Acceso a ambiente QA bloqueado', tipo: 'acceso', impacto: 'alto', urgencia_sugerida: 'urgente' },
  ],
  riesgos: ['Retraso en entrega si no se resuelve el acceso QA'],
  dependencias: ['Equipo de infraestructura'],
  problemas_operativos: [],
  preguntas_abiertas: ['¿Cuándo estará disponible el entorno?'],
  proximos_pasos: ['Escalar bloqueo de acceso a gerencia'],
  info_showcase: 'Pendiente por definir',
  conclusiones_retrospectiva: [],
  requiere_atencion_gerencial: { aplica: true, motivo: 'Bloqueo de acceso a QA sin fecha de resolución' },
  version_slack: {
    encabezado: 'Sprint 22 — Sesión Agile',
    puntos_clave: ['Se priorizó módulo de pagos', 'Bloqueo en QA pendiente'],
    decisiones: ['Priorizar módulo de pagos'],
    acciones_con_responsable: ['Ana López: Revisar API de pagos para el 20/11'],
    bloqueantes_relevantes: ['Acceso QA bloqueado'],
    proxima_sesion: 'Pendiente por definir',
  },
};

describe('watsonxResponseSchema', () => {
  it('validates a correct response', () => {
    const result = watsonxResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('fills defaults for missing optional fields', () => {
    const minimal = {
      ...validResponse,
      acciones_pendientes: [{ descripcion: 'Task A' }],
    };
    const result = watsonxResponseSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.acciones_pendientes[0].responsable).toBe('Pendiente por definir');
      expect(result.data.acciones_pendientes[0].fecha_limite).toBe('Pendiente por definir');
    }
  });

  it('rejects non-array fields', () => {
    const invalid = { ...validResponse, temas_tratados: 'not an array' };
    const result = watsonxResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing required top-level fields', () => {
    const { resumen_ejecutivo: _, ...withoutRequired } = validResponse;
    const result = watsonxResponseSchema.safeParse(withoutRequired);
    expect(result.success).toBe(false);
  });

  it('caps version_slack puntos_clave at 5', () => {
    const tooMany = {
      ...validResponse,
      version_slack: {
        ...validResponse.version_slack,
        puntos_clave: ['1', '2', '3', '4', '5', '6'],
      },
    };
    const result = watsonxResponseSchema.safeParse(tooMany);
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON string (simulates raw watsonx response)', () => {
    const rawText = 'Here is the summary: { broken json';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeNull();
  });

  it('parses JSON embedded in text (simulates real watsonx response)', () => {
    const rawText = `Sure! Here is the output:\n${JSON.stringify(validResponse)}\nEnd.`;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();
    const result = watsonxResponseSchema.safeParse(JSON.parse(jsonMatch![0]));
    expect(result.success).toBe(true);
  });
});
