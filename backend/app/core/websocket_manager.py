import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info("WS connected user_id=%s", user_id)

    def disconnect(self, user_id: str) -> None:
        self.active_connections.pop(user_id, None)
        logger.info("WS disconnected user_id=%s", user_id)

    async def send_to_user(self, user_id: str, message: dict[str, Any]) -> None:
        ws = self.active_connections.get(user_id)
        if ws is None:
            return
        try:
            await ws.send_json(message)
        except Exception as exc:
            logger.warning("WS send failed user_id=%s: %s", user_id, exc)
            self.disconnect(user_id)

    async def broadcast_to_role(self, role: str, message: dict[str, Any], user_roles: dict[str, str]) -> None:
        for user_id, user_role in user_roles.items():
            if user_role == role:
                await self.send_to_user(user_id, message)


ws_manager = ConnectionManager()
