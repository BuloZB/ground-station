# Copyright (c) 2026 Efstratios Goudelis

import logging

import pytest

from handlers.entities import tracking


def _valid_new_tracker_value():
    return {
        "norad_id": 25544,
        "group_id": "grp-1",
        "rotator_state": "disconnected",
        "rig_state": "disconnected",
        "rig_id": "none",
        "rotator_id": "none",
    }


@pytest.mark.asyncio
async def test_set_tracking_state_rejects_target_slot_above_limit(monkeypatch):
    monkeypatch.setattr(tracking.arguments, "max_tracker_targets", 10, raising=False)
    monkeypatch.setattr(tracking, "get_tracker_instances_payload", lambda: {"instances": []})

    called = {"update": False}

    async def _unexpected_update(*_args, **_kwargs):
        called["update"] = True
        return {"success": True}

    monkeypatch.setattr(tracking, "update_tracking_state_with_ownership", _unexpected_update)

    result = await tracking.set_tracking_state(
        sio=None,
        data={"tracker_id": "target-11", "value": _valid_new_tracker_value()},
        logger=logging.getLogger("test-tracking-limit"),
        sid="sid-limit",
    )

    assert result["success"] is False
    assert result["error"] == "tracker_slot_limit_reached"
    assert result["data"]["reason"] == "slot_out_of_range"
    assert called["update"] is False


@pytest.mark.asyncio
async def test_set_tracking_state_rejects_new_target_when_active_count_at_limit(monkeypatch):
    monkeypatch.setattr(tracking.arguments, "max_tracker_targets", 10, raising=False)

    existing_instances = [{"tracker_id": f"target-{slot}"} for slot in range(2, 12)]
    existing_instances.append({"tracker_id": "obs-running-1"})
    monkeypatch.setattr(
        tracking,
        "get_tracker_instances_payload",
        lambda: {"instances": existing_instances},
    )

    called = {"update": False}

    async def _unexpected_update(*_args, **_kwargs):
        called["update"] = True
        return {"success": True}

    monkeypatch.setattr(tracking, "update_tracking_state_with_ownership", _unexpected_update)

    result = await tracking.set_tracking_state(
        sio=None,
        data={"tracker_id": "target-1", "value": _valid_new_tracker_value()},
        logger=logging.getLogger("test-tracking-limit"),
        sid="sid-limit-active",
    )

    assert result["success"] is False
    assert result["error"] == "tracker_slot_limit_reached"
    assert result["data"]["reason"] == "active_limit_reached"
    assert result["data"]["active_targets"] == 10
    assert called["update"] is False
