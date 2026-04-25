# Copyright (c) 2026 Efstratios Goudelis

import logging

import pytest

from handlers.entities import tracking


class _DummySessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _DummyTrackerManager:
    def __init__(self, initial_state):
        self._state = dict(initial_state or {})
        self.updates = []

    async def get_tracking_state(self):
        return dict(self._state)

    async def update_tracking_state(self, **kwargs):
        self._state.update(kwargs)
        self.updates.append(dict(kwargs))
        return {"success": True, "data": {"value": dict(self._state)}}


@pytest.mark.asyncio
async def test_swap_target_rotators_allows_move_to_unassigned_target(monkeypatch):
    manager_a = _DummyTrackerManager(
        {
            "rotator_id": "none",
            "rotator_state": "disconnected",
        }
    )
    manager_b = _DummyTrackerManager(
        {
            "rotator_id": "rot-1",
            "rotator_state": "disconnected",
        }
    )

    swap_calls = []

    monkeypatch.setattr(tracking, "AsyncSessionLocal", lambda: _DummySessionContext())

    def _get_manager(tracker_id):
        if tracker_id == "target-3":
            return manager_a
        if tracker_id == "target-1":
            return manager_b
        raise AssertionError(f"Unexpected tracker id: {tracker_id}")

    monkeypatch.setattr(tracking, "get_tracker_manager", _get_manager)
    monkeypatch.setattr(
        tracking,
        "get_assigned_rotator_for_tracker",
        lambda tracker_id: None if tracker_id == "target-3" else "rot-1",
    )

    def _swap(trackera, trackerb):
        swap_calls.append((trackera, trackerb))
        return {
            "success": True,
            "tracker_a_rotator_id": "rot-1",
            "tracker_b_rotator_id": None,
        }

    monkeypatch.setattr(tracking, "swap_rotators_between_trackers", _swap)

    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(tracking, "emit_tracker_data", _noop)
    monkeypatch.setattr(tracking, "emit_ui_tracker_values", _noop)
    monkeypatch.setattr(tracking, "emit_tracker_instances", _noop)

    result = await tracking.swap_target_rotators(
        sio=object(),
        data={"tracker_a_id": "target-3", "tracker_b_id": "target-1"},
        logger=logging.getLogger("test"),
        sid="sid-1",
    )

    assert result["success"] is True
    assert swap_calls == [("target-3", "target-1")]
    assert manager_a.updates[0]["rotator_id"] == "rot-1"
    assert manager_b.updates[0]["rotator_id"] == "none"
    assert result["data"]["tracker_a_rotator_id"] == "rot-1"
    assert result["data"]["tracker_b_rotator_id"] == "none"
