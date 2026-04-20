"""backfill tracker_id in scheduler rotator hardware config

Revision ID: a2b4c6d8e0f1
Revises: 9d8f3d9aa2b7, fc7f37f92b40
Create Date: 2026-04-19 14:40:00.000000

"""

import json
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2b4c6d8e0f1"
down_revision: Union[str, Sequence[str], None] = ("9d8f3d9aa2b7", "fc7f37f92b40")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _decode_json_dict(raw_value):
    if raw_value is None:
        return {}
    if isinstance(raw_value, dict):
        return dict(raw_value)
    if isinstance(raw_value, str):
        try:
            decoded = json.loads(raw_value)
            return decoded if isinstance(decoded, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _normalize_tracker_id(candidate) -> str:
    if candidate is None:
        return ""
    tracker_id = str(candidate).strip()
    if not tracker_id or tracker_id.lower() == "none":
        return ""
    return tracker_id


def _backfill_table(connection, table_name: str) -> None:
    rows = connection.exec_driver_sql(
        f"SELECT id, rotator_id, hardware_config FROM {table_name}"
    ).fetchall()
    now_utc = datetime.now(timezone.utc)

    for row in rows:
        row_id = row[0]
        rotator_id = row[1]
        hardware_config = _decode_json_dict(row[2])
        if not isinstance(hardware_config, dict):
            continue

        rotator_config = hardware_config.get("rotator")
        if not isinstance(rotator_config, dict):
            rotator_config = {}

        tracker_id = _normalize_tracker_id(rotator_config.get("tracker_id"))
        if tracker_id:
            continue

        fallback_tracker_id = _normalize_tracker_id(rotator_config.get("id"))
        if not fallback_tracker_id:
            fallback_tracker_id = _normalize_tracker_id(rotator_id)
        if not fallback_tracker_id:
            continue

        rotator_config["tracker_id"] = fallback_tracker_id
        if _normalize_tracker_id(rotator_config.get("id")) == "":
            rotator_config["id"] = fallback_tracker_id

        hardware_config["rotator"] = rotator_config
        connection.exec_driver_sql(
            f"UPDATE {table_name} SET hardware_config = ?, updated_at = ? WHERE id = ?",
            (json.dumps(hardware_config), now_utc, row_id),
        )


def upgrade() -> None:
    connection = op.get_bind()
    _backfill_table(connection, "monitored_satellites")
    _backfill_table(connection, "scheduled_observations")


def downgrade() -> None:
    # Data backfill only; no schema change to reverse.
    pass
