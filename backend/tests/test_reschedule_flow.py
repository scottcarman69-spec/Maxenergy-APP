"""Reschedule flow tests (bookings /bookings/{id}/reschedule).

Covers:
- Class booking (bk_rs_class) reschedule with a real class session preferred_time.
- Appointment booking (bk_rs_appt) reschedule with a day+time preferred_time.
- Regression: 24h cutoff still returns 409 when booking is inside the 24h window.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL not set")

MEMBER_EMAIL = "member1@gmail.com"
MEMBER_PASSWORD = "Password123"


@pytest.fixture(scope="module")
def member_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"member login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(member_token):
    return {"Authorization": f"Bearer {member_token}", "Content-Type": "application/json"}


# ---------- pre-seeded bookings must exist ----------
def test_preseeded_bookings_present(auth_headers):
    r = requests.get(f"{BASE_URL}/api/bookings", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    ids = {b["booking_id"] for b in r.json().get("bookings", [])}
    assert "bk_rs_class" in ids, "Pre-seeded class booking bk_rs_class missing"
    assert "bk_rs_appt" in ids, "Pre-seeded appointment booking bk_rs_appt missing"


# ---------- reschedule class booking (>72h out, should succeed) ----------
def test_reschedule_class_booking_success(auth_headers):
    payload = {"requested_time": "Kickboxing · Mon 25 Aug · 5:30 PM", "note": "prefer evening"}
    r = requests.post(
        f"{BASE_URL}/api/bookings/bk_rs_class/reschedule",
        json=payload,
        headers=auth_headers,
        timeout=60,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    b = body.get("booking") or body
    assert b.get("status") == "reschedule_requested", b
    assert b.get("requested_time") == payload["requested_time"], b

    # Verify persistence via GET
    g = requests.get(f"{BASE_URL}/api/bookings", headers=auth_headers, timeout=30)
    assert g.status_code == 200
    match = next((x for x in g.json().get("bookings", []) if x["booking_id"] == "bk_rs_class"), None)
    assert match, "bk_rs_class disappeared after reschedule"
    assert match.get("status") == "reschedule_requested"


# ---------- reschedule appointment booking (>72h out, should succeed) ----------
def test_reschedule_appointment_booking_success(auth_headers):
    payload = {"requested_time": "Monday 25 Aug · 10:30 AM", "note": "morning is easier"}
    r = requests.post(
        f"{BASE_URL}/api/bookings/bk_rs_appt/reschedule",
        json=payload,
        headers=auth_headers,
        timeout=60,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    b = body.get("booking") or body
    assert b.get("status") == "reschedule_requested", b
    assert b.get("requested_time") == payload["requested_time"], b

    # Verify persistence via GET
    g = requests.get(f"{BASE_URL}/api/bookings", headers=auth_headers, timeout=30)
    match = next((x for x in g.json().get("bookings", []) if x["booking_id"] == "bk_rs_appt"), None)
    assert match, "bk_rs_appt disappeared after reschedule"
    assert match.get("status") == "reschedule_requested"


# ---------- regression: 24h cutoff ----------
def test_reschedule_within_24h_returns_409(auth_headers):
    """Create an appointment booking whose requested_at is within 24h and confirm 409."""
    from datetime import datetime, timedelta

    # Create booking via appointment request endpoint (fallback: direct booking is member-only)
    # We reuse existing pre-seeded structure: try to force via /api/bookings/appointment (if any),
    # otherwise mark this test as expected to skip when we can't seed.
    # Simplest deterministic path: request a new class booking would be Square-gated (SKIP that).
    # Instead: attempt to reschedule an existing booking that's within 24h if one exists.
    r = requests.get(f"{BASE_URL}/api/bookings", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    bookings = r.json().get("bookings", [])

    def parse(dt):
        if not dt:
            return None
        try:
            return datetime.fromisoformat(dt.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None

    now = datetime.utcnow() + timedelta(hours=10)  # AEST-ish, matches server logic
    inside_24h = None
    for b in bookings:
        start = parse(b.get("requested_at") or b.get("class_start"))
        if start is not None and start - timedelta(hours=24) <= now < start:
            inside_24h = b
            break

    if not inside_24h:
        # Seed a booking within 24h directly in Mongo, then reschedule -> expect 409, then clean up.
        try:
            from pymongo import MongoClient
        except Exception:
            pytest.skip("pymongo unavailable and no naturally in-24h booking exists.")
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "maxenergy_db")
        c = MongoClient(mongo_url)
        db = c[db_name]
        start_utc = (datetime.utcnow() + timedelta(hours=6)).replace(microsecond=0)
        doc = {
            "booking_id": "TEST_bk_within24h",
            "user_id": "user_936beba757e7",
            "class_name": "TEST Kickboxing",
            "class_id": None,
            "by_appointment": True,
            "requested_at": start_utc.isoformat(),
            "status": "confirmed",
            "amount": 0,
            "booking_no": 99999,
        }
        db.bookings.delete_one({"booking_id": doc["booking_id"]})
        db.bookings.insert_one(doc)
        try:
            r2 = requests.post(
                f"{BASE_URL}/api/bookings/{doc['booking_id']}/reschedule",
                json={"requested_time": "Any time", "note": "test"},
                headers=auth_headers,
                timeout=30,
            )
            assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.text}"
            detail = (r2.json().get("detail") or "")
            assert "24 hours" in detail, f"Expected 24h message, got: {detail}"
        finally:
            db.bookings.delete_one({"booking_id": doc["booking_id"]})
        return

    r2 = requests.post(
        f"{BASE_URL}/api/bookings/{inside_24h['booking_id']}/reschedule",
        json={"requested_time": "Any time", "note": "test"},
        headers=auth_headers,
        timeout=30,
    )
    assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.text}"
    assert "24 hours" in (r2.json().get("detail") or "").lower() or "24" in r2.text
