import json
import logging
from typing import Any

import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis | None:
    global _redis
    if _redis is None:
        try:
            _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
            await _redis.ping()
        except Exception:
            _redis = None
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None


async def cache_get(key: str) -> Any | None:
    try:
        client = await get_redis()
        if client is None:
            return None
        raw = await client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis cache_get failed: %s", exc)
        return None


async def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    try:
        client = await get_redis()
        if client is None:
            return
        ttl = ttl or settings.ai_cache_ttl_seconds
        await client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as exc:
        logger.warning("Redis cache_set failed: %s", exc)


async def publish_event(channel: str, message: dict[str, Any]) -> None:
    try:
        client = await get_redis()
        if client is None:
            return
        await client.publish(channel, json.dumps(message, default=str))
    except Exception as exc:
        logger.warning("Redis publish failed: %s", exc)
