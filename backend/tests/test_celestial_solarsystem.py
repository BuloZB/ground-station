from datetime import datetime, timezone

from celestial.solarsystem import compute_solar_system_snapshot


def test_snapshot_includes_explicit_body_type_and_counts():
    meta, bodies = compute_solar_system_snapshot(datetime.now(timezone.utc))

    body_type_counts = meta.get("body_type_counts")
    assert body_type_counts == {"planet": 8, "moon": 9}

    planets = [body for body in bodies if body.get("body_type") == "planet"]
    moons = [body for body in bodies if body.get("body_type") == "moon"]

    assert len(planets) == 8
    assert len(moons) == 9
    assert all("parent_id" not in planet for planet in planets)
    assert all(moon.get("parent_id") for moon in moons)
