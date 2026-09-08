#!/bin/bash
# deploy-ibmcloud.sh — Despliega Agile Team Hub en IBM Cloud Code Engine
# Ejecutar desde la carpeta raíz: bash deploy-ibmcloud.sh
# Requisito: IBM Cloud CLI instalado (ibmcloud)

set -e

# ── Configuración ────────────────────────────────────────────────
REGION="us-south"
RESOURCE_GROUP="Default"
PROJECT_NAME="agile-team-hub"
REGISTRY="us.icr.io"
NAMESPACE="agile-team-hub"
BACKEND_APP="ath-backend"
FRONTEND_APP="ath-frontend"
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/ath-backend:latest"
FRONTEND_IMAGE="${REGISTRY}/${NAMESPACE}/ath-frontend:latest"

echo ""
echo "=============================================="
echo "  Agile Team Hub — Deploy en IBM Cloud"
echo "=============================================="
echo ""

# ── Login ────────────────────────────────────────
echo "1. Autenticando en IBM Cloud..."
ibmcloud login --sso -r ${REGION} -g ${RESOURCE_GROUP}

# ── Instalar plugins necesarios ──────────────────
echo "2. Verificando plugins..."
ibmcloud plugin install code-engine -f 2>/dev/null || true
ibmcloud plugin install container-registry -f 2>/dev/null || true

# ── Container Registry ───────────────────────────
echo "3. Configurando Container Registry..."
ibmcloud cr region-set ${REGION}
ibmcloud cr namespace-create ${NAMESPACE} 2>/dev/null || echo "   Namespace ya existe"
ibmcloud cr login

# ── Build y push backend ─────────────────────────
echo "4. Construyendo imagen del backend..."
cd backend
docker build -t ${BACKEND_IMAGE} .
docker push ${BACKEND_IMAGE}
cd ..

# ── Build y push frontend ────────────────────────
echo "5. Construyendo imagen del frontend..."
# La URL del backend en Code Engine se define después del primer deploy
# Por ahora usamos una variable de entorno que se actualiza post-deploy
cd frontend
docker build \
  --build-arg REACT_APP_BACKEND_URL=https://${BACKEND_APP}.${PROJECT_NAME}.${REGION}.codeengine.appdomain.cloud \
  -t ${FRONTEND_IMAGE} .
docker push ${FRONTEND_IMAGE}
cd ..

# ── Code Engine project ──────────────────────────
echo "6. Configurando Code Engine..."
ibmcloud ce project create --name ${PROJECT_NAME} 2>/dev/null || \
  ibmcloud ce project select --name ${PROJECT_NAME}

# ── Secrets del backend ──────────────────────────
echo "7. Creando secrets..."
# Lee variables del .env del backend
source <(grep -v '^#' backend/.env | grep -v '^$' | sed 's/^/export /')

ibmcloud ce secret create --name ath-secrets \
  --from-literal WATSONX_API_KEY="${WATSONX_API_KEY}" \
  --from-literal WATSONX_PROJECT_ID="${WATSONX_PROJECT_ID}" \
  --from-literal MONDAY_API_TOKEN="${MONDAY_API_TOKEN}" \
  --from-literal MONDAY_SESSIONS_BOARD_ID="${MONDAY_SESSIONS_BOARD_ID}" \
  --from-literal MONDAY_BLOCKERS_BOARD_ID="${MONDAY_BLOCKERS_BOARD_ID}" \
  --from-literal MONDAY_ITERATIONS_BOARD_ID="${MONDAY_ITERATIONS_BOARD_ID}" \
  --from-literal MONDAY_SHOWCASE_BOARD_ID="${MONDAY_SHOWCASE_BOARD_ID}" \
  --from-literal MONDAY_RETRO_BOARD_ID="${MONDAY_RETRO_BOARD_ID}" \
  --from-literal JWT_SECRET="${JWT_SECRET}" \
  --from-literal SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}" \
  2>/dev/null || \
ibmcloud ce secret update --name ath-secrets \
  --from-literal WATSONX_API_KEY="${WATSONX_API_KEY}" \
  --from-literal JWT_SECRET="${JWT_SECRET}"

# ── Deploy backend ───────────────────────────────
echo "8. Desplegando backend..."
FRONTEND_URL="https://${FRONTEND_APP}.${PROJECT_NAME}.${REGION}.codeengine.appdomain.cloud"

ibmcloud ce application create \
  --name ${BACKEND_APP} \
  --image ${BACKEND_IMAGE} \
  --port 3001 \
  --min-scale 1 \
  --max-scale 2 \
  --cpu 0.5 \
  --memory 1G \
  --env NODE_ENV=production \
  --env HOST=0.0.0.0 \
  --env PORT=3001 \
  --env WATSONX_MODEL_ID=meta-llama/llama-3-3-70b-instruct \
  --env WATSONX_REGION=us-south \
  --env WATSONX_API_VERSION=2024-05-31 \
  --env WATSONX_TIMEOUT=120000 \
  --env MONDAY_API_VERSION=2024-10 \
  --env AUDIT_LOG_ENABLED=true \
  --env CORS_ORIGIN="${FRONTEND_URL}" \
  --env-from-secret ath-secrets \
  2>/dev/null || \
ibmcloud ce application update \
  --name ${BACKEND_APP} \
  --image ${BACKEND_IMAGE} \
  --env CORS_ORIGIN="${FRONTEND_URL}"

# Obtener URL del backend
BACKEND_URL=$(ibmcloud ce application get --name ${BACKEND_APP} --output json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status']['url'])" 2>/dev/null || echo "https://${BACKEND_APP}.${PROJECT_NAME}.${REGION}.codeengine.appdomain.cloud")
echo "   Backend URL: ${BACKEND_URL}"

# ── Deploy frontend ──────────────────────────────
echo "9. Desplegando frontend..."
ibmcloud ce application create \
  --name ${FRONTEND_APP} \
  --image ${FRONTEND_IMAGE} \
  --port 3000 \
  --min-scale 1 \
  --max-scale 2 \
  --cpu 0.25 \
  --memory 0.5G \
  2>/dev/null || \
ibmcloud ce application update \
  --name ${FRONTEND_APP} \
  --image ${FRONTEND_IMAGE}

FRONTEND_FINAL_URL=$(ibmcloud ce application get --name ${FRONTEND_APP} --output json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status']['url'])" 2>/dev/null || echo "https://${FRONTEND_APP}.${PROJECT_NAME}.${REGION}.codeengine.appdomain.cloud")

echo ""
echo "=============================================="
echo "  ✅ DESPLIEGUE COMPLETADO"
echo "=============================================="
echo ""
echo "  Frontend: ${FRONTEND_FINAL_URL}"
echo "  Backend:  ${BACKEND_URL}"
echo ""
echo "  Comparte esta URL con tu equipo:"
echo "  ${FRONTEND_FINAL_URL}"
echo ""
echo "  Para actualizar el manifest de Teams:"
echo "  Edita teams-app/manifest.json y reemplaza"
echo "  la URL con: ${FRONTEND_FINAL_URL}"
echo "=============================================="
