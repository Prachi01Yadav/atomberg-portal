import asyncio
import json
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.redis_client import get_redis
from app.core.websocket_manager import ws_manager

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(tags=["websocket"])


def _decode_ws_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except JWTError:
        return None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None) -> None:
    if not token:
        auth = websocket.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
        else:
            token = websocket.query_params.get("token")

    user_id = _decode_ws_token(token) if token else None
    if not user_id:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, user_id)
    redis = await get_redis()
    listener = None
    pubsub = None
    channel = f"ws:user:{user_id}"

    if redis is not None:
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)

        async def redis_listener() -> None:
            try:
                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue
                    data = json.loads(message["data"])
                    await ws_manager.send_to_user(user_id, data)
            except asyncio.CancelledError:
                pass

        listener = asyncio.create_task(redis_listener())

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if listener:
            listener.cancel()
        if pubsub:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
        ws_manager.disconnect(user_id)
