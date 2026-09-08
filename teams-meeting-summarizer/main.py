"""
Punto de entrada de la aplicación.
Sin dependencias externas de pago — solo FastAPI + SQLite + Ollama local.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request

from app.models.database import init_db
from app.routes.meetings import router as meetings_router
from app.routes.teams_tab import router as teams_tab_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando aplicación — creando tablas si no existen...")
    await init_db()
    logger.info("Base de datos lista.")
    yield
    logger.info("Aplicación cerrada.")


app = FastAPI(
    title="Teams Meeting Summarizer",
    description="Resúmenes de reuniones de Teams — 100% local y gratuito",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="dashboard/static"), name="static")
templates = Jinja2Templates(directory="dashboard/templates")

app.include_router(meetings_router)
app.include_router(teams_tab_router)


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
