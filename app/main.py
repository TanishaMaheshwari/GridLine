from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates
import os

from .database import Base, engine
from .routers import auth, accounts, limits, ea

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Gridline API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(limits.router)
app.include_router(ea.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def get_static_version():
    try:
        js = STATIC_DIR / 'js' / 'main.js'
        css = STATIC_DIR / 'css' / 'styles.css'
        times = [p.stat().st_mtime for p in (js, css) if p.exists()]
        if not times:
            return 0
        return int(max(times))
    except Exception:
        return 0


@app.get("/")
def index(request: Request):
    ctx = {
        "request": request,
        "title": os.getenv('APP_TITLE', 'Gridline'),
        "env": os.getenv('APP_ENV', 'development'),
        "api_base": os.getenv('API_BASE', '/api'),
        "account_id": None,
        "static_version": get_static_version(),
    }
    return templates.TemplateResponse("login.html", ctx)


@app.get("/login")
def login_redirect(request: Request):
    ctx = {"request": request, "title": os.getenv('APP_TITLE', 'Gridline'), "env": os.getenv('APP_ENV', 'development'), "api_base": os.getenv('API_BASE', '/api'), "account_id": None, "static_version": get_static_version()}
    return templates.TemplateResponse("login.html", ctx)


@app.get("/dashboard")
def dashboard(request: Request):
    ctx = {"request": request, "title": os.getenv('APP_TITLE', 'Gridline'), "env": os.getenv('APP_ENV', 'development'), "api_base": os.getenv('API_BASE', '/api'), "account_id": None, "static_version": get_static_version()}
    return templates.TemplateResponse("dashboard.html", ctx)


@app.get("/account/{account_id}")
def account_view(request: Request, account_id: int):
    ctx = {"request": request, "title": os.getenv('APP_TITLE', 'Gridline'), "env": os.getenv('APP_ENV', 'development'), "api_base": os.getenv('API_BASE', '/api'), "account_id": account_id, "static_version": get_static_version()}
    return templates.TemplateResponse("accounts.html", ctx)


@app.get("/history")
def history_view(request: Request, account_id: int | None = None):
    ctx = {"request": request, "title": os.getenv('APP_TITLE', 'Gridline'), "env": os.getenv('APP_ENV', 'development'), "api_base": os.getenv('API_BASE', '/api'), "account_id": account_id, "static_version": get_static_version()}
    return templates.TemplateResponse("history.html", ctx)


@app.get("/api/health")
def health():
    return {"ok": True}
