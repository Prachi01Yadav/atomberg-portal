import hashlib
import json
import logging
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.core.redis_client import cache_get, cache_set

logger = logging.getLogger(__name__)
settings = get_settings()


def _cache_key(prefix: str, payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"ai:{prefix}:{digest}"


async def _call_claude(system: str, user_msg: str) -> str:
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    return msg.content[0].text if msg.content else "{}"


async def score_goal(payload: dict[str, Any]) -> dict[str, Any]:
    key = _cache_key("score", payload)
    cached = await cache_get(key)
    if cached:
        return cached

    fallback = {
        "score": 7,
        "issues": [],
        "suggestions": ["Add measurable target and deadline for stronger SMART alignment."],
    }
    try:
        text = await _call_claude(
            "Return JSON only: {score:0-10, issues:[], suggestions:[]}",
            json.dumps(payload),
        )
        result = json.loads(text)
    except Exception as exc:
        logger.warning("AI score_goal fallback: %s", exc)
        result = fallback

    await cache_set(key, result)
    return result


async def parse_natural_language(text: str) -> dict[str, Any]:
    key = _cache_key("parse", {"text": text})
    cached = await cache_get(key)
    if cached:
        return cached

    fallback = {
        "title": text[:80],
        "uom_type": "numeric_min",
        "target_value": 10,
        "thrust_area_suggestion": "Operations",
    }
    try:
        raw = await _call_claude(
            "Extract goal fields as JSON: title, uom_type (numeric_min|numeric_max|timeline|zero), target_value, thrust_area_suggestion",
            text,
        )
        result = json.loads(raw)
    except Exception as exc:
        logger.warning("AI parse fallback: %s", exc)
        result = fallback

    await cache_set(key, result)
    return result


async def risk_analysis(goals_payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    key = _cache_key("risk", {"n": len(goals_payload)})
    cached = await cache_get(key)
    if cached:
        return cached

    fallback = [
        {
            "goal_title": g.get("title", "Goal"),
            "risk_level": "medium",
            "reasoning": "Insufficient trajectory data; monitor Q2 actuals.",
        }
        for g in goals_payload[:3]
    ]
    try:
        raw = await _call_claude(
            "Return JSON array: [{goal_title, risk_level: high|medium|low, reasoning}]",
            json.dumps(goals_payload),
        )
        result = json.loads(raw)
    except Exception as exc:
        logger.warning("AI risk fallback: %s", exc)
        result = fallback

    await cache_set(key, result)
    return result


async def checkin_insights(payload: dict[str, Any]) -> dict[str, Any]:
    key = _cache_key("insight", payload)
    cached = await cache_get(key)
    if cached:
        return cached

    fallback = {
        "tone": "neutral",
        "summary": "Employee reports steady progress.",
        "action_items": ["Review blockers in 1:1"],
        "needs_support": False,
    }
    try:
        raw = await _call_claude(
            "Return JSON: {tone, summary, action_items:[], needs_support:bool}",
            json.dumps(payload),
        )
        result = json.loads(raw)
    except Exception as exc:
        logger.warning("AI checkin insight fallback: %s", exc)
        result = fallback

    await cache_set(key, result)
    return result
