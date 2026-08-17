"""Regression tests for the enumeration-safe verify-then-login sign-up flow.

- /auth/register with brand-new email -> {pending: True, email}, NO user doc, NO token.
- /auth/register with EXISTING email -> IDENTICAL {pending: True, email} response.
- /auth/verify-otp with wrong code -> 400 "Invalid or expired code".
- /auth/verify-otp with correct code -> {verified: True, token, user}, user created.
- /auth/login with new credentials -> 200 with token.
- Existing admin can still log in normally.
"""

import datetime as dt
import os
import time
import uuid

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASSWORD = "SInEf5!4AvEj"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def fresh_email():
    return f"test_verify_{uuid.uuid4().hex[:10]}@gmail.com"


def _payload(email: str, password: str = "Abc123!"):
    return {
        "first_name": "Test",
        "last_name": "Verify",
        "date_of_birth": "1995-01-15",
        "phone": "0412345678",
        "email": email,
        "password": password,
    }


def _get_db():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url:
        # Fallback: read backend/.env
        from pathlib import Path
        for line in Path("/app/backend/.env").read_text().splitlines():
            if line.startswith("MONGO_URL="):
                mongo_url = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("DB_NAME="):
                db_name = line.split("=", 1)[1].strip().strip('"')
    client = MongoClient(mongo_url)
    return client[db_name]


def _hash_pw(pw: str) -> str:
    import bcrypt
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _inject_otp(email: str, code: str = "654321"):
    """Inject a known OTP hash directly into the DB."""
    db = _get_db()
    now = dt.datetime.utcnow()
    db.otp_codes.update_one(
        {"email": email, "purpose": "verify"},
        {"$set": {
            "email": email,
            "purpose": "verify",
            "code_hash": _hash_pw(code),
            "expires_at": now + dt.timedelta(minutes=10),
            "attempts": 0,
            "created_at": now,
        }},
        upsert=True,
    )


def _cleanup(email: str):
    try:
        db = _get_db()
        db.users.delete_many({"email": email})
        db.pending_registrations.delete_many({"email": email})
        db.otp_codes.delete_many({"email": email})
    except Exception:
        pass


class TestVerifyThenLogin:
    """Enumeration-safe register + verify-then-login regression."""

    def test_1_register_new_email_returns_generic_pending(self, api_client, fresh_email):
        r = api_client.post(f"{BASE_URL}/api/auth/register", json=_payload(fresh_email))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("pending") is True
        assert data.get("email") == fresh_email
        assert "token" not in data
        assert "user" not in data

    def test_2_no_users_doc_yet(self, fresh_email):
        # Register should NOT create a users record yet
        db = _get_db()
        u = db.users.find_one({"email": fresh_email})
        p = db.pending_registrations.find_one({"email": fresh_email})
        assert u is None, "users doc should NOT exist before verification"
        assert p is not None, "pending_registrations doc should exist"

    def test_3_register_existing_email_identical_response(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/register", json=_payload(ADMIN_EMAIL, password="Abc123!"))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"pending": True, "email": ADMIN_EMAIL}, f"leaky response: {data}"

    def test_4_verify_wrong_code_generic_error(self, api_client, fresh_email):
        r = api_client.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": fresh_email, "code": "000000"},
        )
        assert r.status_code == 400, r.text
        assert "Invalid or expired code" in r.text

    def test_5_verify_wrong_code_for_nonexistent_email_same_error(self, api_client):
        # Wait a bit to avoid rate limit sharing with previous
        time.sleep(1)
        r = api_client.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": f"nobody_{uuid.uuid4().hex[:8]}@gmail.com", "code": "111111"},
        )
        assert r.status_code == 400, r.text
        assert "Invalid or expired code" in r.text

    def test_6_verify_correct_code_creates_user_and_token(self, api_client, fresh_email):
        _inject_otp(fresh_email, "654321")
        r = api_client.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": fresh_email, "code": "654321"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("verified") is True
        assert data.get("token"), "expected token"
        assert data.get("user", {}).get("email") == fresh_email

        # Verify /me works with token
        me = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {data['token']}"},
        )
        assert me.status_code == 200
        assert me.json()["user"]["email"] == fresh_email

    def test_7_pending_cleared_after_verify(self, fresh_email):
        db = _get_db()
        u = db.users.find_one({"email": fresh_email})
        p = db.pending_registrations.find_one({"email": fresh_email})
        assert u is not None, "users doc should now exist"
        assert p is None, "pending_registrations should be cleared"

    def test_8_login_new_account(self, api_client, fresh_email):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": fresh_email, "password": "Abc123!"},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("token")

    def test_9_admin_login_regression(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("token")

    def test_z_cleanup(self, fresh_email):
        _cleanup(fresh_email)
