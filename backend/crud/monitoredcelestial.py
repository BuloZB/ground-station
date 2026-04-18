# Copyright (c) 2025 Efstratios Goudelis
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""CRUD helpers for monitored celestial targets."""

from __future__ import annotations

import re
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from common.common import logger, serialize_object
from db.models import MonitoredCelestial

UNIQUE_CONSTRAINT_PATTERN = re.compile(r"UNIQUE constraint failed: \w+\.(\w+)")


def _normalize_entry(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "display_name": row.get("display_name") or "",
        "command": row.get("command") or "",
        "enabled": bool(row.get("enabled", True)),
        "last_refresh_at": row.get("last_refresh_at"),
        "last_error": row.get("last_error"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


async def fetch_monitored_celestial(
    session: AsyncSession,
    target_id: Optional[str] = None,
    enabled_only: bool = False,
) -> dict:
    """Fetch one monitored target by ID, or all targets."""
    try:
        if target_id:
            stmt = select(MonitoredCelestial).where(MonitoredCelestial.id == target_id)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if not row:
                return {"success": True, "data": None, "error": None}
            return {
                "success": True,
                "data": _normalize_entry(serialize_object(row)),
                "error": None,
            }

        stmt = select(MonitoredCelestial)
        if enabled_only:
            stmt = stmt.where(MonitoredCelestial.enabled.is_(True))
        stmt = stmt.order_by(MonitoredCelestial.created_at)

        result = await session.execute(stmt)
        rows = result.scalars().all()
        data = [_normalize_entry(serialize_object(row)) for row in rows]
        return {"success": True, "data": data, "error": None}

    except Exception as e:
        logger.error(f"Error fetching monitored celestial targets: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_monitored_celestial(session: AsyncSession, data: dict) -> dict:
    """Create a monitored celestial target."""
    try:
        target_id = data.get("id") or str(uuid.uuid4())
        command = str(data.get("command") or "").strip()
        display_name = str(data.get("display_name") or data.get("displayName") or command).strip()

        if not command:
            return {"success": False, "error": "Command is required"}
        if not display_name:
            return {"success": False, "error": "Display name is required"}

        payload = {
            "id": target_id,
            "display_name": display_name,
            "command": command,
            "enabled": bool(data.get("enabled", True)),
            "last_refresh_at": data.get("last_refresh_at"),
            "last_error": data.get("last_error"),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }

        stmt = insert(MonitoredCelestial).values(**payload).returning(MonitoredCelestial)
        result = await session.execute(stmt)
        await session.commit()

        row = result.scalar_one()
        return {
            "success": True,
            "data": _normalize_entry(serialize_object(row)),
            "error": None,
        }

    except IntegrityError as e:
        await session.rollback()
        logger.warning(f"Database integrity error creating monitored celestial target: {e}")
        error_str = str(e.orig) if hasattr(e, "orig") else str(e)
        match = UNIQUE_CONSTRAINT_PATTERN.search(error_str)
        if match and match.group(1) == "command":
            return {
                "success": False,
                "error": "A target with this command already exists.",
            }
        return {"success": False, "error": f"Database constraint violation: {error_str}"}
    except Exception as e:
        await session.rollback()
        logger.error(f"Error creating monitored celestial target: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_monitored_celestial(session: AsyncSession, data: dict) -> dict:
    """Update a monitored celestial target."""
    try:
        target_id = data.get("id")
        if not target_id:
            return {"success": False, "error": "Target ID is required"}

        update_data: Dict[str, Any] = {}
        if "display_name" in data or "displayName" in data:
            update_data["display_name"] = str(
                data.get("display_name") or data.get("displayName") or ""
            ).strip()
        if "command" in data:
            update_data["command"] = str(data.get("command") or "").strip()
        if "enabled" in data:
            update_data["enabled"] = bool(data.get("enabled"))
        if "last_refresh_at" in data:
            update_data["last_refresh_at"] = data.get("last_refresh_at")
        if "last_error" in data:
            update_data["last_error"] = data.get("last_error")

        if "command" in update_data and not update_data["command"]:
            return {"success": False, "error": "Command is required"}
        if "display_name" in update_data and not update_data["display_name"]:
            return {"success": False, "error": "Display name is required"}

        update_data["updated_at"] = datetime.now(timezone.utc)

        stmt = (
            update(MonitoredCelestial)
            .where(MonitoredCelestial.id == target_id)
            .values(**update_data)
            .returning(MonitoredCelestial)
        )
        result = await session.execute(stmt)
        await session.commit()

        row = result.scalar_one_or_none()
        if not row:
            return {"success": False, "error": "Monitored celestial target not found"}

        return {
            "success": True,
            "data": _normalize_entry(serialize_object(row)),
            "error": None,
        }

    except IntegrityError as e:
        await session.rollback()
        logger.warning(f"Database integrity error updating monitored celestial target: {e}")
        error_str = str(e.orig) if hasattr(e, "orig") else str(e)
        match = UNIQUE_CONSTRAINT_PATTERN.search(error_str)
        if match and match.group(1) == "command":
            return {
                "success": False,
                "error": "A target with this command already exists.",
            }
        return {"success": False, "error": f"Database constraint violation: {error_str}"}
    except Exception as e:
        await session.rollback()
        logger.error(f"Error updating monitored celestial target: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_monitored_celestial(session: AsyncSession, ids: List[str]) -> dict:
    """Delete one or more monitored celestial targets."""
    try:
        if not ids:
            return {"success": False, "error": "IDs are required"}

        stmt = delete(MonitoredCelestial).where(MonitoredCelestial.id.in_(ids))
        result = await session.execute(stmt)
        await session.commit()

        return {
            "success": True,
            "data": {"deleted": result.rowcount or 0, "ids": ids},
            "error": None,
        }
    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting monitored celestial targets: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def toggle_monitored_celestial_enabled(
    session: AsyncSession,
    target_id: str,
    enabled: bool,
) -> dict:
    """Toggle monitored celestial target enabled state."""
    try:
        stmt = (
            update(MonitoredCelestial)
            .where(MonitoredCelestial.id == target_id)
            .values(enabled=enabled, updated_at=datetime.now(timezone.utc))
        )
        result = await session.execute(stmt)
        await session.commit()

        if result.rowcount == 0:
            return {"success": False, "error": "Monitored celestial target not found"}

        return {"success": True, "data": {"id": target_id, "enabled": enabled}, "error": None}
    except Exception as e:
        await session.rollback()
        logger.error(f"Error toggling monitored celestial target: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def update_monitored_celestial_refresh_state(
    session: AsyncSession,
    updates: List[dict],
) -> dict:
    """Persist refresh timestamp/error metadata for monitored celestial targets."""
    try:
        now_utc = datetime.now(timezone.utc)
        for item in updates:
            target_id = item.get("id")
            if not target_id:
                continue

            stmt = (
                update(MonitoredCelestial)
                .where(MonitoredCelestial.id == str(target_id))
                .values(
                    last_refresh_at=item.get("last_refresh_at"),
                    last_error=item.get("last_error"),
                    updated_at=now_utc,
                )
            )
            await session.execute(stmt)

        await session.commit()
        return {"success": True, "error": None}
    except Exception as e:
        await session.rollback()
        logger.error(f"Error updating monitored celestial refresh state: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
