"""Tests for admin confirm booking + Custom Programs pricing."""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "admin@maxenergy.com.au"
ADMIN_PASSWORD = "MaxAdmin123!"
MEMBER_EMAIL = "member1@gmail.com"
MEMBER_PASSWORD = "Password123"
SEED_BOOKING_ID = "test_6b0d1cda"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def member_token():
    # ensure member exists
    reg = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": MEMBER_EMAIL, "password": MEMBER_PASSWORD, "name": "Member One"
    })
    # If exists, login
    r = _login(MEMBER_EMAIL, MEMBER_PASSWORD)
    assert r.status_code == 200, f"member login failed: {r.status_code} {r.text} (reg was {reg.status_code})"
    return r.json()["token"]


def _reset_seed_booking_to_paid():
    """Reset seeded booking directly in Mongo so we can test the confirm flow deterministically."""
    async def _r():
        c = AsyncIOMotorClient(MONGO_URL)
        db = c[DB_NAME]
        b = await db.bookings.find_one({"booking_id": SEED_BOOKING_ID})
        if not b:
            # recreate the booking
            await db.bookings.insert_one({
                "booking_id": SEED_BOOKING_ID,
                "user_id": "user_03f8f4dd09d9",
                "class_id": "test_cp",
                "class_name": "Custom Programs",
                "amount": 6000,
                "currency": "aud",
                "by_appointment": True,
                "duration_min": 30,
                "status": "paid",
                "requested_time": "Wed 17 Jun · 11:00 am",
                "requested_at": "2026-06-17T11:00:00",
            })
        else:
            await db.bookings.update_one(
                {"booking_id": SEED_BOOKING_ID},
                {"$set": {"status": "paid"}, "$unset": {"confirmed_at": "", "confirmed_by": ""}},
            )
        c.close()
    asyncio.get_event_loop().run_until_complete(_r()) if False else asyncio.run(_r())


# ---------- Custom Programs class pricing ----------

class TestCustomProgramsClass:
    def test_custom_programs_in_classes(self):
        r = requests.get(f"{BASE_URL}/api/classes")
        assert r.status_code == 200
        classes = r.json().get("classes", [])
        cp = [c for c in classes if c.get("name") == "Custom Programs"]
        assert len(cp) >= 1, "Custom Programs class not found in /api/classes"
        c = cp[0]
        assert c.get("by_appointment") is True, f"by_appointment should be True, got {c.get('by_appointment')}"
        assert c.get("price_cents") == 6000, f"price_cents expected 6000, got {c.get('price_cents')}"
        assert c.get("duration_min") == 30, f"duration_min expected 30, got {c.get('duration_min')}"
        appts = c.get("appt_durations")
        assert isinstance(appts, list) and len(appts) >= 1
        # find 30-min entry
        thirty = [a for a in appts if a.get("minutes") == 30]
        assert len(thirty) == 1, f"expected exactly one 30-min appt_durations entry, got {appts}"
        assert thirty[0].get("price_cents") == 6000, f"30-min price_cents expected 6000, got {thirty[0].get('price_cents')}"


# ---------- Admin confirm booking ----------

class TestAdminConfirmBooking:
    def test_non_admin_forbidden(self, member_token):
        _reset_seed_booking_to_paid()
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{SEED_BOOKING_ID}/confirm",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert r.status_code == 403, f"non-admin expected 403, got {r.status_code} {r.text}"

    def test_no_auth_forbidden(self):
        r = requests.post(f"{BASE_URL}/api/admin/bookings/{SEED_BOOKING_ID}/confirm")
        assert r.status_code in (401, 403), f"unauth expected 401/403, got {r.status_code}"

    def test_admin_confirm_paid_appt_booking(self, admin_token):
        _reset_seed_booking_to_paid()
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{SEED_BOOKING_ID}/confirm",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, f"confirm failed: {r.status_code} {r.text}"
        data = r.json()
        assert "booking" in data, f"response missing 'booking': {data}"
        b = data["booking"]
        assert b["booking_id"] == SEED_BOOKING_ID
        assert b["status"] == "confirmed", f"status expected 'confirmed', got {b.get('status')}"
        assert b.get("confirmed_at"), "confirmed_at should be set"

    def test_admin_confirm_persists(self, admin_token):
        # After previous test, booking should be confirmed. Verify via GET /api/admin/bookings.
        r = requests.get(
            f"{BASE_URL}/api/admin/bookings",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        rows = r.json().get("bookings", [])
        row = next((x for x in rows if x["booking_id"] == SEED_BOOKING_ID), None)
        assert row is not None, "seeded booking not found in admin listing"
        assert row["status"] == "confirmed", f"expected confirmed after admin confirm, got {row['status']}"

    def test_confirm_already_confirmed_conflict(self, admin_token):
        # booking already confirmed from previous test; endpoint should reject
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{SEED_BOOKING_ID}/confirm",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 409, f"expected 409 on already-confirmed, got {r.status_code} {r.text}"

    def test_confirm_unknown_booking_404(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/does_not_exist_zzz/confirm",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


def teardown_module(module):
    """Leave the booking in 'paid' state for the frontend UI test to consume."""
    _reset_seed_booking_to_paid()
