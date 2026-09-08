# Agile Team Hub

**Gestión Agile del equipo IBM** — Resúmenes de Teams + IBM watsonx.ai + Monday.com + Slack  
Versión 1.0.0 · Node.js 22 + TypeScript + React

---

## Arquitectura

```
Microsoft Teams (recap manual)
  → Frontend React (Teams Tab)
  → Backend Fastify (Node.js 22 + TypeScript)
     ├── watsonx.ai API  → extracción estructurada
     ├── Monday GraphQL API → repositorio oficial
     └── Slack Webhook/API  → publicación opcional
```

Ninguna información se envía a Monday o Slack sin confirmación humana explícita.

---

## Estructura del proyecto

```
agile-team-hub/
├── backend/          Node.js 22 + TypeScript + Fastify
│   ├── src/
│   │   ├── server.ts
│   │   ├── config.ts
│   │   ├── schemas/       Zod schemas (watsonx, requests)
│   │   ├── services/      watsonx, monday, slack, graph, auditLog
│   │   ├── routes/        summary, blockers, iterations, showcase, retro, slack, dashboard, health
│   │   └── middleware/    auth (JWT), errorHandler
│   ├── tests/             Jest tests
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
│
├── frontend/         React 18 + TypeScript + Teams JS SDK
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/         MainMenu, SummaryFlow, Dashboard, BlockerForm,
│   │   │                  IterationPage, ShowcaseForm, RetroForm, SlackPreview, ManagerDashboard
│   │   ├── components/    PageHeader
│   │   ├── services/      api.ts, teams.ts
│   │   └── utils/         devToken.ts
│   ├── public/            index.html, privacy.html, terms.html, tab-config.html
│   └── package.json
│
└── teams-app/        Paquete Microsoft Teams
    ├── manifest.json
    ├── icon-color.png   (192x192)
    ├── icon-outline.png (32x32)
    ├── generate-icons.py
    └── build-teams-package.py
```

---

## Requisitos previos

- Node.js 22+
- Python 3.8+ (solo para generar iconos y el ZIP de Teams)
- Cuenta IBM Cloud con proyecto watsonx.ai
- Monday.com Basic (cuenta corporativa IBM)
- Microsoft Teams con cuenta IBM corporativa
- Slack Enterprise Grid IBM (opcional)

---

## Configuración inicial

### 1. Backend

```bash
cd agile-team-hub/backend
npm install
cp .env.example .env
# Edita .env con tus credenciales reales
```

Variables obligatorias en `.env`:
| Variable | Descripción |
|---|---|
| `WATSONX_API_KEY` | API Key de IBM Cloud (Manage → Access → API Keys) |
| `WATSONX_PROJECT_ID` | ID del proyecto en watsonx.ai |
| `WATSONX_MODEL_ID` | Modelo activo (ej. `ibm/granite-3-8b-instruct`) |
| `MONDAY_API_TOKEN` | Token de Monday (Perfil → Developers → API) |
| `MONDAY_SESSIONS_BOARD_ID` | ID del tablero "Sesiones y Resúmenes" |
| `MONDAY_BLOCKERS_BOARD_ID` | ID del tablero "Bloqueantes" |
| `MONDAY_ITERATIONS_BOARD_ID` | ID del tablero "Iteraciones" |
| `MONDAY_SHOWCASE_BOARD_ID` | ID del tablero "Showcase" |
| `MONDAY_RETRO_BOARD_ID` | ID del tablero "Retrospectiva" |
| `JWT_SECRET` | String aleatorio de mínimo 32 caracteres |

Variables opcionales:
| Variable | Descripción |
|---|---|
| `SLACK_WEBHOOK_URL` | Incoming Webhook de Slack |
| `SLACK_BOT_TOKEN` | Bot token alternativo |
| `GRAPH_CLIENT_ID` | Azure App Registration (para metadatos de reuniones) |

### 2. Verificar IDs de tableros Monday (dry-run)

```bash
cd backend
npm run build
node dist/server.js &
# En otro terminal:
curl -H "Authorization: Bearer TU_JWT" http://localhost:3001/api/health/monday
```

Verifica que todos los tableros devuelvan `true`.

### 3. Frontend

```bash
cd agile-team-hub/frontend
npm install
cp .env.example .env
# Edita: REACT_APP_BACKEND_URL=https://tu-backend-domain
npm start
```

---

## Desarrollo local

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm start
```

El frontend queda en `http://localhost:3000`, el backend en `http://localhost:3001`.  
En modo `development`, el frontend genera un token de desarrollo automáticamente.

---

## Pruebas

```bash
cd backend
npm test
# Con cobertura:
npm test -- --coverage
```

Los tests cubren:
- Validación de schema de watsonx (incluye defaults, JSON inválido, campos extra)
- Auth middleware (token inválido, expirado, válido)
- Endpoints de resumen (texto vacío, campos faltantes, modo ICA)
- Bloqueantes (validación de enums, campos requeridos)
- Slack deshabilitado (status + publish)
- Retrospectiva (categoría inválida)
- Envío a Monday sin summaryId previo

---

## Despliegue con Docker

```bash
cd backend
docker build -t agile-team-hub-backend:1.0.0 .
docker run -d \
  --name ath-backend \
  -p 3001:3001 \
  --env-file .env \
  agile-team-hub-backend:1.0.0
```

El contenedor corre como usuario no-root (`athub`). Incluye healthcheck.

### IBM Cloud Code Engine

```bash
# Build y push a IBM Container Registry
ibmcloud cr login
docker tag agile-team-hub-backend:1.0.0 icr.io/TU_NAMESPACE/ath-backend:1.0.0
docker push icr.io/TU_NAMESPACE/ath-backend:1.0.0

# Deploy en Code Engine
ibmcloud ce application create \
  --name ath-backend \
  --image icr.io/TU_NAMESPACE/ath-backend:1.0.0 \
  --port 3001 \
  --env-from-secret ath-secrets
```

---

## Paquete de Microsoft Teams

### Generar iconos y ZIP

```bash
cd teams-app
python generate-icons.py      # genera icon-color.png y icon-outline.png
```

Antes de generar el ZIP, edita `manifest.json` y reemplaza:
- `REPLACE_WITH_NEW_GUID` → genera uno en https://guidgenerator.com
- `REPLACE_WITH_YOUR_APP_URL` → URL HTTPS de tu frontend desplegado
- `REPLACE_WITH_YOUR_APP_DOMAIN` → dominio (sin https://)
- `REPLACE_WITH_AZURE_APP_CLIENT_ID` → Client ID de tu Azure App Registration (para SSO, opcional en MVP)

```bash
python build-teams-package.py  # genera AgileTeamHub.zip
```

### Método A — Enviar a la organización (recomendado)

1. Abre Microsoft Teams
2. Barra lateral → **Apps**
3. **Administrar tus aplicaciones** (abajo a la izquierda)
4. **Enviar una aplicación a su organización**
5. Sube `AgileTeamHub.zip`
6. Agrega descripción y contacto de soporte
7. Haz clic en **Enviar**
8. TI recibirá la solicitud. Una vez aprobada, aparecerá en el catálogo interno.

### Método B — Instalación personal (si la política lo permite)

1. Teams → Apps → Administrar tus aplicaciones
2. **Cargar una aplicación personalizada** → **Cargar para mí o para mis equipos**
3. Sube `AgileTeamHub.zip`
4. La app queda instalada para tu usuario

### Método C — Pestaña web (sin instalación, disponible inmediatamente)

1. Ve al canal Agile en Teams
2. Haz clic en **+** (agregar pestaña)
3. Selecciona **Sitio web**
4. URL: `https://tu-frontend-url`
5. Nombre: **Agile Hub**
6. Guardar

> ⚠️ La aprobación final depende de las políticas del tenant IBM. No se garantiza que la instalación sea inmediata.

---

## Configuración de tableros Monday

### Tablero 1 — Sesiones y Resúmenes
IDs de columnas esperados por el backend:
`date4`, `text_tipo`, `text_iter`, `text_manager`, `text_participantes`,
`long_text_resumen`, `long_text_decisiones`, `long_text_acuerdos`, `long_text_acciones`,
`long_text_bloqueantes`, `long_text_riesgos`, `long_text_proximos`, `link_teams`,
`text_exportado_por`, `date_exportacion`, `status`, `checkbox_gerente`, `person_col`,
`checkbox_slack`, `date_slack`, `text_slack_por`

### Tablero 2 — Bloqueantes
`long_text_desc`, `status_tipo`, `status_impacto`, `status_urgencia`,
`text_iteracion`, `text_proceso`, `text_reportado_por`, `text_correo`,
`text_responsable`, `date_reporte`, `date_solucion`, `status`, `checkbox_escalar`,
`long_text_comentarios`, `text_idempotency`, `person_col`, `file_column`

### Tablero 3 — Iteraciones y Gerente
`text_gerente`, `text_correo`, `date_inicio`, `date_fin`, `status`, `file_canicas`

### Tablero 4 — Showcase
`text_iteracion`, `long_text_desc`, `text_responsable`, `text_presentador`,
`date_showcase`, `long_text_resultado`, `long_text_valor`, `status`,
`long_text_retro`, `long_text_proximo`, `text_idempotency`, `file_evidence`

### Tablero 5 — Retrospectiva (grupos: `group_bien`, `group_mal`, `group_mejorar`, `group_preguntas`)
`status_categoria`, `long_text_comentario`, `text_autor`, `text_iteracion`,
`date_retro`, `numbers_prioridad`, `long_text_accion`, `text_responsable`,
`date_cumplimiento`, `status`, `text_idempotency`

> Los IDs de columna se pueden obtener desde Monday: Settings del tablero → Columns.  
> Si los IDs difieren, actualiza los servicios correspondientes en `backend/src/services/monday.ts`.

---

## Permisos necesarios para TI

Lista para presentar al equipo de TI IBM:

| Recurso | Permiso | Propósito |
|---|---|---|
| Microsoft Teams | Cargar app personalizada o aprobar desde catálogo | Instalar Agile Team Hub como Tab |
| Azure App Registration | `OnlineMeetings.Read` (delegado, opcional) | Obtener metadatos de reuniones |
| IBM Cloud | Crear proyecto watsonx.ai + generar API Key | Motor de IA para resúmenes |
| Monday.com | API Token con permisos de lectura/escritura en tableros del equipo | Repositorio Agile |
| Slack Enterprise Grid | Crear Incoming Webhook o App Slack en el workspace del equipo | Publicaciones opcionales |
| Servidor/Code Engine | Desplegar contenedor Docker en red interna IBM | Hosting del backend |

---

## Pendientes que dependen de credenciales o aprobación

- [ ] Completar WATSONX_API_KEY y WATSONX_PROJECT_ID (IBM Cloud → cloud.ibm.com)
- [ ] Completar todos los MONDAY_*_BOARD_ID (Monday → tablero → Settings → Board ID en la URL)
- [ ] Completar JWT_SECRET (generar string aleatorio, mínimo 32 chars)
- [ ] Definir GUID en manifest.json (https://guidgenerator.com)
- [ ] Configurar URL HTTPS del frontend desplegado en manifest.json
- [ ] Aprobación de TI IBM para cargar app en el catálogo de Teams
- [ ] (Opcional) Azure App Registration para Microsoft Graph (metadatos de reuniones)
- [ ] (Opcional) Configurar Slack Webhook en el canal del equipo
- [ ] Crear los 5 tableros en Monday con los IDs de columna documentados
- [ ] Crear primer elemento de iteración con estado "Activo" en el tablero de Iteraciones

---

## Seguridad

- Todas las llamadas a watsonx, Monday y Slack se realizan desde el backend.
- El frontend nunca tiene acceso a tokens ni API keys.
- El paquete ZIP de Teams no contiene ninguna credencial.
- Los tokens se almacenan como variables de entorno del servidor (no en código).
- Logs de auditoría en `logs/audit.log` (servidor interno).
- Usuarios corren como `athub` (non-root) en el contenedor Docker.

---

*Agile Team Hub — IBM Internal Tool — v1.0.0*
