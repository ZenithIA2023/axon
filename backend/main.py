import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from apscheduler.schedulers.background import BackgroundScheduler
from routers import classify, chat, conversations, projects, auth, profile, google_auth, tasks, dashboard, notifications, daily_log, insights, routines, objectives, subtasks, account, voice, task_tags
from limiter import limiter
from database import supabase
from services import planning_scheduler

_env = os.getenv("ENV", "production")
app = FastAPI(
    title="Axon API",
    docs_url="/docs" if _env == "development" else None,
    redoc_url="/redoc" if _env == "development" else None,
    openapi_url="/openapi.json" if _env == "development" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
_extra_origins = [u.strip() for u in os.getenv("CORS_ORIGINS", "").split(",") if u.strip()]
_origins = list({FRONTEND_URL, "http://localhost:5173"} | set(_extra_origins))

# Só em desenvolvimento: cobre os subdomínios do GitHub Codespaces sem depender de env vars.
# Em produção fica None — qualquer Codespace conseguiria fazer requests com credenciais (SEC-001).
_dev_origin_regex = r"https://[^.]+\.app\.github\.dev" if _env == "development" else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_dev_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Timezone"],
)


# Cabeçalhos de segurança em toda resposta. Esta é uma API JSON (não serve HTML),
# então o conjunto é enxuto: sem CSP (não protege JSON e só arriscaria quebrar o
# /docs em dev). O HSTS só entra em produção — em localhost forçaria HTTPS e
# atrapalharia o desenvolvimento.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if _env != "development":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response

app.include_router(classify.router)
app.include_router(conversations.router)
app.include_router(projects.router)
app.include_router(chat.router)
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(google_auth.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)
app.include_router(daily_log.router)
app.include_router(insights.router)
app.include_router(routines.router)
app.include_router(objectives.router)
app.include_router(subtasks.router)
app.include_router(account.router)
app.include_router(voice.router)
app.include_router(task_tags.router)


_scheduler = BackgroundScheduler(timezone="UTC")


@app.on_event("startup")
def _on_startup():
    try:
        buckets = supabase.storage.list_buckets()
        names = [b.name for b in buckets]
        if "avatars" not in names:
            supabase.storage.create_bucket("avatars", options={"public": True})
    except Exception:
        pass

    _scheduler.add_job(planning_scheduler.run, "cron", minute="*/5")
    _scheduler.start()
    print("[scheduler] Planning scheduler iniciado.", flush=True)


@app.on_event("shutdown")
def _on_shutdown():
    _scheduler.shutdown(wait=False)


@app.get("/")
def root():
    return {"status": "ok"}
