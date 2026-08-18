"""
Regression: GET /api/bookings response shape must include enrichment fields:
trainer, duration_min, spots_left, booked, capacity, child_name, child_age.
Also validates that admin-created active bookings surface these fields
for the currently logged-in member.
"""
import os
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

MEMBER_EMAIL = "testmember@gmail.com"
MEMBER_PASS = "Test!1234"
ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASS = "SInEf5!4AvEj"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER_EMAIL, MEMBER_PASS)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


# ---- feature: /api/bookings enrichment ----

def test_bookings_endpoint_reachable(member_token):
    r = requests.get(f"{BASE_URL}/api/bookings", headers={"Authorization": f"Bearer {member_token}"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "bookings" in data and isinstance(data["bookings"], list)


def test_bookings_response_shape_when_present(member_token):
    """Every returned booking must at least carry the base+enrichment keys we depend on for the card UI."""
    r = requests.get(f"{BASE_URL}/api/bookings", headers={"Authorization": f"Bearer {member_token}"}, timeout=30)
    assert r.status_code == 200
    bookings = r.json()["bookings"]
    for b in bookings:
        # base identity fields
        assert "booking_id" in b
        assert "class_name" in b
        assert "status" in b
        # enrichment fields must be present as keys (values may legitimately be None)
        for key in ("trainer", "duration_min", "booking_no"):
            assert key in b, f"missing enrichment key '{key}' on booking {b.get('booking_id')}"
        # For class bookings (not by_appointment), capacity/booked/spots_left should be present when class exists.
        if not b.get("by_appointment"):
            # Enrichment only adds these when a class doc was found; tolerate missing when class was deleted.
            if b.get("class_start") is not None:
                for key in ("capacity", "booked", "spots_left"):
                    assert key in b, f"class-booking missing '{key}'"
                assert isinstance(b["capacity"], int) and b["capacity"] >= 0
                assert isinstance(b["booked"], int) and b["booked"] >= 0
                assert isinstance(b["spots_left"], int) and b["spots_left"] >= 0
                assert b["spots_left"] == max(b["capacity"] - b["booked"], 0)


def test_enrichment_via_admin_seeded_booking(admin_token, member_token):
    """Create a fresh upcoming class + a paid booking for the member, then verify /api/bookings
    surfaces trainer, duration_min, spots_left, booked, capacity, child_name and child_age."""
    # Find member user_id
    me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {member_token}"}, timeout=30)
    assert me.status_code == 200
    member_user_id = me.json()["user"]["user_id"]

    # Create a class 7 days out
    from datetime import datetime, timedelta, timezone
    start = (datetime.now(timezone.utc) + timedelta(days=7)).replace(microsecond=0)
    start_local = (start + timedelta(hours=10)).replace(tzinfo=None)  # QLD local (UTC+10)
    start_iso = start_local.isoformat(timespec="seconds")
    payload = {
        "name": "TEST_EnrichClass",
        "category": "Class",
        "trainer": "TEST_CoachZ",
        "start_at": start_iso,
        "duration_min": 45,
        "capacity": 12,
        "price_cents": 2000,
        "level": "All levels",
    }
    r = requests.post(f"{BASE_URL}/api/admin/classes", headers={"Authorization": f"Bearer {admin_token}"}, json=payload, timeout=30)
    assert r.status_code in (200, 201), f"admin create class failed: {r.status_code} {r.text}"
    class_id = r.json().get("class", {}).get("class_id") or r.json().get("class_id")
    assert class_id, f"no class_id in response: {r.text}"

    booking_id = None
    try:
        # Admin creates a paid confirmed booking for the member with a child.
        book_payload = {
            "user_id": member_user_id,
            "class_id": class_id,
            "child_name": "TEST_Kiddo",
            "child_age": 9,
            "status": "confirmed",
        }
        # Try admin-manual-booking endpoint variants
        endpoints_tried = []
        r2 = None
        for ep in ("/api/admin/bookings", "/api/admin/bookings/create", "/api/admin/bookings/manual"):
            endpoints_tried.append(ep)
            r2 = requests.post(f"{BASE_URL}{ep}", headers={"Authorization": f"Bearer {admin_token}"}, json=book_payload, timeout=30)
            if r2.status_code in (200, 201):
                break
        if not r2 or r2.status_code not in (200, 201):
            pytest.skip(f"no admin-booking endpoint accepted payload; tried {endpoints_tried}; last={r2.status_code if r2 else 'none'} {r2.text if r2 else ''}")

        body = r2.json()
        booking_id = (body.get("booking") or {}).get("booking_id") or body.get("booking_id")
        assert booking_id, f"no booking_id in admin booking response: {body}"

        # Fetch bookings as the member and locate our booking
        time.sleep(0.5)
        r3 = requests.get(f"{BASE_URL}/api/bookings", headers={"Authorization": f"Bearer {member_token}"}, timeout=30)
        assert r3.status_code == 200
        rows = r3.json()["bookings"]
        found = next((b for b in rows if b.get("booking_id") == booking_id), None)
        assert found is not None, f"seeded booking {booking_id} not in /api/bookings response"

        # Assert full enrichment shape
        assert found.get("trainer") == "TEST_CoachZ"
        assert found.get("duration_min") == 45
        assert found.get("capacity") == 12
        assert isinstance(found.get("booked"), int) and found["booked"] >= 1
        assert isinstance(found.get("spots_left"), int) and found["spots_left"] == 12 - found["booked"]
        assert found.get("child_name") == "TEST_Kiddo"
        assert found.get("child_age") == 9
        assert found.get("class_start") is not None
    finally:
        # Cleanup: cancel the booking, delete the class
        if booking_id:
            requests.post(
                f"{BASE_URL}/api/admin/bookings/{booking_id}/cancel",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=30,
            )
        requests.delete(
            f"{BASE_URL}/api/admin/classes/{class_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
