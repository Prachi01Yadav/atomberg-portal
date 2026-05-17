import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.services.blockchain_service import hash_audit_payload, publish_hash

logger = logging.getLogger(__name__)


async def record_change(
    db: AsyncSession,
    *,
    goal_id: UUID,
    changed_by: UUID,
    change_type: str,
    field_changed: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    publish_to_chain: bool = True,
) -> AuditLog:
    audit = AuditLog(
        goal_id=goal_id,
        changed_by=changed_by,
        change_type=change_type,
        field_changed=field_changed,
        old_value=str(old_value) if old_value is not None else None,
        new_value=str(new_value) if new_value is not None else None,
    )
    db.add(audit)
    await db.flush()

    if publish_to_chain:
        try:
            payload = {
                "goal_id": str(goal_id),
                "change_type": change_type,
                "field_changed": field_changed,
                "old_value": str(old_value) if old_value is not None else None,
                "new_value": str(new_value) if new_value is not None else None,
                "by": str(changed_by),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            data_hash = hash_audit_payload(payload)
            tx_hash = await publish_hash(goal_id, data_hash)
            audit.blockchain_tx_hash = tx_hash
            await db.flush()
        except Exception as exc:
            logger.exception("Audit blockchain publish failed: %s", exc)

    return audit
