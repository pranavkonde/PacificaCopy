import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.copy_engine import copy_engine_loop
from app.routers import pacifica, public, user

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    stop = asyncio.Event()
    task = asyncio.create_task(copy_engine_loop(stop))
    logger.info("Copy engine started (interval=%ss)", settings.copy_poll_interval_seconds)
    yield
    stop.set()
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    logger.info("Copy engine stopped")


app = FastAPI(title="PacificaCopy API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(public.router)
app.include_router(user.router)
app.include_router(pacifica.router)
