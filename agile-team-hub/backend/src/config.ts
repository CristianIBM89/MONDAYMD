import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // watsonx
  WATSONX_API_KEY: z.string().min(1),
  WATSONX_PROJECT_ID: z.string().min(1),
  WATSONX_SPACE_ID: z.string().optional().default(''),
  WATSONX_MODEL_ID: z.string().default('ibm/granite-3-8b-instruct'),
  WATSONX_REGION: z.string().default('us-south'),
  WATSONX_API_VERSION: z.string().default('2024-05-31'),
  WATSONX_TIMEOUT: z.coerce.number().default(60000),

  // Monday
  MONDAY_API_TOKEN: z.string().min(1),
  MONDAY_API_VERSION: z.string().default('2024-10'),
  MONDAY_SESSIONS_BOARD_ID: z.string().min(1),
  MONDAY_BLOCKERS_BOARD_ID: z.string().min(1),
  MONDAY_ITERATIONS_BOARD_ID: z.string().min(1),
  MONDAY_SHOWCASE_BOARD_ID: z.string().min(1),
  MONDAY_RETRO_BOARD_ID: z.string().min(1),

  // Graph (optional)
  GRAPH_CLIENT_ID: z.string().optional().default(''),
  GRAPH_CLIENT_SECRET: z.string().optional().default(''),
  GRAPH_TENANT_ID: z.string().optional().default(''),
  GRAPH_REDIRECT_URI: z.string().optional().default(''),

  // Slack (optional)
  SLACK_WEBHOOK_URL: z.string().optional().default(''),
  SLACK_BOT_TOKEN: z.string().optional().default(''),
  SLACK_CHANNEL_ID: z.string().optional().default(''),

  // Security
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('8h'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  ALLOWED_FILE_TYPES: z
    .string()
    .default(
      'text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ),

  AUDIT_LOG_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
});

function loadConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Configuración inválida en variables de entorno:');
    result.error.issues.forEach((issue) => {
      console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  return {
    ...result.data,
    MAX_FILE_SIZE_BYTES: result.data.MAX_FILE_SIZE_MB * 1024 * 1024,
    ALLOWED_FILE_TYPES_ARRAY: result.data.ALLOWED_FILE_TYPES.split(','),
    SLACK_ENABLED: Boolean(result.data.SLACK_WEBHOOK_URL || result.data.SLACK_BOT_TOKEN),
    GRAPH_ENABLED: Boolean(result.data.GRAPH_CLIENT_ID),
  };
}

export const config = loadConfig();
export type Config = typeof config;
