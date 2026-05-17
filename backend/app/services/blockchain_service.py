import hashlib
import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.models.goal import Goal

logger = logging.getLogger(__name__)
settings = get_settings()

# File-backed mock ledger so verification survives restarts
_MOCK_LEDGER_PATH = Path(__file__).resolve().parent.parent.parent / "mock_blockchain.json"


def _load_mock() -> dict[str, list[str]]:
    if _MOCK_LEDGER_PATH.exists():
        try:
            return json.loads(_MOCK_LEDGER_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_mock(data: dict[str, list[str]]) -> None:
    try:
        _MOCK_LEDGER_PATH.write_text(json.dumps(data), encoding="utf-8")
    except Exception as exc:
        logger.warning("Failed to persist mock ledger: %s", exc)


_mock_storage: dict[str, list[str]] = _load_mock()


def hash_goal_state(goal: Goal) -> str:
    """SHA-256 hex digest of canonical goal fields."""
    payload = {
        "id": str(goal.id),
        "employee_id": str(goal.employee_id),
        "cycle_id": str(goal.cycle_id),
        "thrust_area": goal.thrust_area,
        "title": goal.title,
        "description": goal.description,
        "uom_type": goal.uom_type.value,
        "target_value": goal.target_value,
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "weightage": goal.weightage,
        "status": goal.status.value,
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def hash_audit_payload(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _goal_id_uint(goal_id: UUID) -> int:
    return goal_id.int


async def publish_hash(goal_id: UUID, data_hash: str) -> str:
    goal_int = _goal_id_uint(goal_id)
    if settings.blockchain_mode == "mock":
        tx_hash = f"0xmock{data_hash[:16]}{goal_int % 10_000:04d}"
        _mock_storage.setdefault(str(goal_id), []).append(data_hash)
        _save_mock(_mock_storage)
        logger.info("Mock blockchain record goal_id=%s hash=%s tx=%s", goal_id, data_hash[:12], tx_hash)
        return tx_hash

    return await _publish_live(goal_int, data_hash)


async def _publish_live(goal_int: int, data_hash: str) -> str:
    try:
        from web3 import Web3

        if not settings.polygon_contract_address or not settings.polygon_private_key:
            raise ValueError("Polygon credentials not configured")

        w3 = Web3(Web3.HTTPProvider(settings.polygon_rpc_url))
        account = w3.eth.account.from_key(settings.polygon_private_key)

        abi_path = Path(__file__).resolve().parent.parent / "contracts" / "abi.json"
        with abi_path.open(encoding="utf-8") as f:
            abi = json.load(f)

        contract = w3.eth.contract(
            address=Web3.to_checksum_address(settings.polygon_contract_address),
            abi=abi,
        )
        data_bytes32 = Web3.to_bytes(hexstr="0x" + data_hash)
        tx = contract.functions.recordHash(goal_int, data_bytes32).build_transaction(
            {
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address),
                "gas": 200_000,
                "gasPrice": w3.eth.gas_price,
                "chainId": w3.eth.chain_id,
            }
        )
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash.hex()
    except Exception as exc:
        logger.exception("Live blockchain publish failed: %s", exc)
        raise


async def verify_goal_on_chain(goal_id: UUID, expected_hash: str, tx_hash: str | None = None) -> dict[str, Any]:
    goal_int = _goal_id_uint(goal_id)
    scan_base = settings.polygon_scan_base_url.rstrip("/")

    if settings.blockchain_mode == "mock":
        hashes = _mock_storage.get(str(goal_id), [])
        verified = expected_hash in hashes
        mock_tx = tx_hash or (f"0xmock{expected_hash[:16]}{goal_int % 10_000:04d}" if verified else None)
        return {
            "verified": verified,
            "tx_hash": mock_tx,
            "polygon_scan_url": f"{scan_base}/{mock_tx}" if mock_tx else None,
        }

    try:
        from web3 import Web3

        w3 = Web3(Web3.HTTPProvider(settings.polygon_rpc_url))
        abi_path = Path(__file__).resolve().parent.parent / "contracts" / "abi.json"
        with abi_path.open(encoding="utf-8") as f:
            abi = json.load(f)
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(settings.polygon_contract_address),
            abi=abi,
        )
        on_chain = contract.functions.getHashes(goal_int).call()
        expected_bytes = Web3.to_bytes(hexstr="0x" + expected_hash)
        verified = expected_bytes in on_chain
        return {
            "verified": verified,
            "tx_hash": tx_hash,
            "polygon_scan_url": f"{scan_base}/{tx_hash}" if tx_hash else None,
        }
    except Exception as exc:
        logger.exception("Blockchain verify failed: %s", exc)
        return {"verified": False, "tx_hash": tx_hash, "polygon_scan_url": None, "error": str(exc)}
