# Copyright (c) 2025 Efstratios Goudelis

import pytest

from tracker.rotatorhandler import RotatorHandler


class _DummyTracker:
    def __init__(self, azimuth_mode: str):
        self.rotator_controller = object()
        self.current_rotator_state = "tracking"
        self.rotator_details = {"azimuth_mode": azimuth_mode}
        self.rotator_data = {
            "outofbounds": False,
            "minelevation": False,
            "az": 0.0,
            "el": 0.0,
            "slewing": False,
        }
        self.azimuth_limits = (-180, 180) if azimuth_mode == "-180_180" else (0, 360)
        self.elevation_limits = (0, 90)
        self.rotator_command_state = {
            "in_flight": False,
            "target_az": None,
            "target_el": None,
            "last_command_ts": 0.0,
            "settle_hits": 0,
        }
        self.nudge_offset = {"az": 0, "el": 0}
        self.az_tolerance = 2.0
        self.el_tolerance = 2.0
        self.rotator_retarget_threshold_deg = 2.0
        self.rotator_command_refresh_sec = 6.0
        self.rotator_settle_hits_required = 2


@pytest.mark.asyncio
async def test_tracking_command_uses_negative_azimuth_when_mode_is_negative_range():
    tracker = _DummyTracker("-180_180")
    handler = RotatorHandler(tracker)
    sent = []

    async def _capture_issue(target_az, target_el):
        sent.append((target_az, target_el))

    handler._issue_rotator_command = _capture_issue

    await handler.control_rotator_position((270.0, 45.0))

    assert sent == [(-90.0, 45.0)]


@pytest.mark.asyncio
async def test_tracking_command_stays_0_to_360_in_default_mode():
    tracker = _DummyTracker("0_360")
    handler = RotatorHandler(tracker)
    sent = []

    async def _capture_issue(target_az, target_el):
        sent.append((target_az, target_el))

    handler._issue_rotator_command = _capture_issue

    await handler.control_rotator_position((270.0, 45.0))

    assert sent == [(270.0, 45.0)]
