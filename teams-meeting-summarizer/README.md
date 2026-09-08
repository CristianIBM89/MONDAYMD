# Teams Meeting Summarizer

**Flujo completo:**  
Teams `.vtt` → **IBM watsonx.ai** (Granite) → Dashboard → Bloqueantes & Próximos Pasos → **Monday.com**

---

## Flujo paso a paso

```
1. Reunión en Microsoft Teams
        │
        ▼ (exportar transcripción .vtt)
2. Dashboard — "Subir Reunión"
        │
        ▼ (IBM watsonx.ai / Granite-13b)
3. Resumen automático generado:
   · Resumen ejecutivo
   · Puntos clave & Decisiones
   · Action Items
   · 🚧 Bloqueantes detectados por IA  ──► VENTANA EMERGENTE para revisar/editar/añadir
   · 🎯 Próximos Pasos detectados por IA ──► VENTANA EMERGENTE para revisar/editar/añadir
        │
        ▼ (botón "📊 Enviar a Monday.com")
4. Tablero creado automáticamente en Monday.com con:
   · Grupo: 📋 Resumen & Decisiones
   · Grupo: ✅ Action Items
   · Grupo: 🚧 Bloqueantes
   · Grupo: 🎯 Próximos Pasos
```

---

## Requisitos

- Python 3.11+
- Cuenta IBM corporativa (`@ibm.com`) → IBM watsonx.ai plan **Lite** (gratis)
- Cuenta Monday.com (plan gratuito con API)

---

## Setup

### 1. IBM watsonx.ai (gratis con cuenta corporativa IBM)

1. Ve a **[cloud.ibm.com](https://cloud.ibm.com)** con tu email corporativo `@ibm.com`
2. Busca **"watsonx.ai"** → crea una instancia → **Plan Lite** (50 000 tokens/mes gratis)
3. En la instancia → **Service credentials** → **New credential** → copia `apikey` → `IBM_API_KEY`
4. Ve a **[dataplatform.cloud.ibm.com/wx/home](https://dataplatform.cloud.ibm.com/wx/home)**
5. Crea un proyecto → copia el **Project ID** de la URL → `IBM_PROJECT_ID`

### 2. Monday.com API (gratis con cuenta existente)

1. Abre Monday.com → **perfil (esquina inferior izquierda)** → **Developers**
2. **My Access Tokens** → copia el token → `MONDAY_API_KEY`
3. URL del workspace: `app.monday.com/boards?workspaceId=XXXXX` → `MONDAY_WORKSPACE_ID`

### 3. Instalar y arrancar

```bash
cd teams-meeting-summarizer
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edita .env con IBM_API_KEY, IBM_PROJECT_ID, MONDAY_API_KEY, MONDAY_WORKSPACE_ID

uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Abre: **http://127.0.0.1:8000**

---

## Exportar transcripción de Teams

1. Durante la reunión → panel **Transcripción** (ícono superior)
2. **(···)** → **"Descargar (.vtt)"**
3. Sube el archivo en el dashboard → **Subir Reunión**

> ⚠️ Requiere que el organizador haya activado la transcripción en la reunión.  
> En Teams: **Más opciones → Iniciar transcripción**

---

## Uso del dashboard

| Sección | Descripción |
|---------|-------------|
| **Dashboard** | KPIs: reuniones, resumidas, Monday.com, bloqueantes abiertos |
| **Subir Reunión** | Upload .vtt + IBM watsonx.ai genera el resumen |
| **Reuniones** | Listado con filtros. Tarjetas muestran bloqueantes abiertos |
| **Action Items** | Todos los action items de todas las reuniones |

### Modal de reunión — 3 pestañas

| Pestaña | Contenido |
|---------|-----------|
| **📋 Resumen** | Resumen ejecutivo, puntos clave, decisiones, action items |
| **🚧 Bloqueantes** | Bloqueantes detectados por IA + agregar/editar/cambiar estado |
| **🎯 Próximos Pasos** | Pasos detectados por IA + agregar/editar/marcar como hecho |

### Ventanas emergentes post-resumen

Después de generar el resumen, automáticamente se abre la ventana de **Bloqueantes** para que el equipo:
- Revise los bloqueantes detectados por IA
- Cambie su estado: 🔴 Abierto → 🟡 En progreso → 🟢 Resuelto
- Añada bloqueantes manuales
- Lo mismo aplica para **Próximos Pasos**

### Enviar a Monday.com

El botón **📊 Enviar a Monday.com** crea el tablero con los datos finales (incluyendo ediciones manuales).  
Se abre el tablero automáticamente al terminar.

---

## Estructura

```
teams-meeting-summarizer/
├── main.py
├── requirements.txt          # 9 paquetes
├── .env.example
├── app/
│   ├── config.py
│   ├── models/database.py    # Meeting + Blocker + NextStep (SQLite)
│   ├── routes/meetings.py    # CRUD reuniones, bloqueantes, próximos pasos, Monday
│   └── services/
│       ├── summary_service.py  # IBM watsonx.ai (Granite-13b)
│       ├── monday_service.py   # Monday.com GraphQL (4 grupos)
│       └── export_service.py   # JSON + CSV
└── dashboard/
    ├── templates/dashboard.html
    └── static/
        ├── css/dashboard.css
        └── js/dashboard.js
```

---

## Solución de problemas

**401 IBM API key inválida**  
→ Verifica `IBM_API_KEY` en `.env`. Las claves de IAM no expiran, pero asegúrate de copiar el campo `apikey` de las credenciales del servicio.

**403 sin acceso al proyecto**  
→ Verifica `IBM_PROJECT_ID`. El Project ID está en la URL de watsonx.ai: `dataplatform.cloud.ibm.com/projects/PROJECT_ID`

**Monday.com: workspace no encontrado**  
→ Verifica que `MONDAY_WORKSPACE_ID` es el ID numérico (no el nombre). Puedes consultarlo con:  
```graphql
query { workspaces { id name } }
```
en [monday.com/developers/v2](https://monday.com/developers/v2).
