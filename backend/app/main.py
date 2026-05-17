import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import (
    admin,
    ai,
    analytics,
    approvals,
    auth,
    blockchain,
    checkins,
    cycles,
    escalations,
    goals,
    notifications,
    reminders,
    reports,
    shared_goals,
    sso,
    system,
    users,
    websocket,
)
from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.redis_client import close_redis, get_redis
import app.models  # noqa: F401

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO if settings.debug else logging.WARNING)
    if settings.database_url.startswith("sqlite"):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await close_redis()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(cycles.router, prefix="/api/v1")
    app.include_router(goals.router, prefix="/api/v1")
    app.include_router(approvals.router, prefix="/api/v1")
    app.include_router(checkins.router, prefix="/api/v1")
    app.include_router(shared_goals.router, prefix="/api/v1")
    app.include_router(ai.router, prefix="/api/v1")
    app.include_router(blockchain.router, prefix="/api/v1")
    app.include_router(reports.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")
    app.include_router(escalations.router, prefix="/api/v1")
    app.include_router(notifications.router, prefix="/api/v1")
    app.include_router(reminders.router, prefix="/api/v1")
    app.include_router(sso.router, prefix="/api/v1")
    app.include_router(system.router, prefix="/api/v1")
    app.include_router(websocket.router)

    @app.get("/health")
    async def health():
        db_ok = False
        redis_ok = False
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception as exc:
            logger.error("DB health check failed: %s", exc)
        try:
            redis = await get_redis()
            redis_ok = redis is not None and await redis.ping()
        except Exception as exc:
            logger.error("Redis health check failed: %s", exc)
        status_code = 200 if db_ok else 503
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=status_code,
            content={"status": "ok" if status_code == 200 else "degraded", "database": db_ok, "redis": redis_ok},
        )

    return app


app = create_app()
