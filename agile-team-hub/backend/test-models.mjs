/**
 * test-models.mjs — Verifica cuáles modelos están activos en tu cuenta watsonx
 * Uso: node test-models.mjs
 */
import { readFileSync } from 'fs';

// Load .env manually
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);

const API_KEY    = env.WATSONX_API_KEY;
const PROJECT_ID = env.WATSONX_PROJECT_ID;
const REGION     = env.WATSONX_REGION || 'us-south';

// Get IAM token
const tokenRes = await fetch('https://iam.cloud.ibm.com/identity/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${API_KEY}`,
});
const { access_token } = await tokenRes.json();
console.log('✅ IAM token obtained\n');

// Models to test
const MODELS = [
  'meta-llama/llama-3-3-70b-instruct',
  'meta-llama/llama-3-2-11b-vision-instruct',
  'meta-llama/llama-3-1-8b-instruct',
  'ibm/granite-3-2-8b-instruct',
  'ibm/granite-3-1-8b-instruct',
  'ibm/granite-13b-instruct-v2',
  'ibm/granite-3-8b-instruct',
  'mistralai/mistral-large',
];

const endpoint = `https://${REGION}.ml.cloud.ibm.com/ml/v1/text/generation?version=2024-05-31`;
const testPrompt = 'Responde solo con: {"ok":true}';

console.log('Testing models...\n');
for (const model of MODELS) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: model,
        input: testPrompt,
        parameters: { max_new_tokens: 10 },
        project_id: PROJECT_ID,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ ${model}`);
    } else {
      console.log(`❌ ${model} — ${data.errors?.[0]?.code}: ${data.errors?.[0]?.message?.slice(0,80)}`);
    }
  } catch (e) {
    console.log(`⚠️  ${model} — timeout/error`);
  }
}
