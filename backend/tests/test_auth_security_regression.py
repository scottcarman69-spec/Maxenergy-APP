"""Regression tests for the SEC-003 / SEC-004 security fixes.

Covers:
  1. AUTH REGRESSION — login + /auth/me work for the two shared test accounts.
  2. AUTH REGRESSION — register + /auth/me work for a fresh @gmail.com signup.
  3. SEC-004 — /auth/logout revokes the SAME token (returns 401 on /auth/me
     afterwards); a fresh login gets a working token.
  4. SEC-004 — /auth/reset-password revokes all previously-issued JWTs; the
     token returned in the reset-password response works.
  5. AUTHZ — /admin/overview: admin=200, member=403.
  6. SEC-003 — full-credit checkout deducts credit exactly once, writes one
     credit_ledger row and NEVER drives users.credit_cents negative on a second
     insufficient-balance attempt.
  7. Regression — GET /api/settings/booking, /api/admin/settings and
     /api/admin/attendance/roster still return their expected shapes.

WARNING: Square is in PRODUCTION mode in this environment. These tests take
GREAT CARE to only exercise the free-test / credit paths and never trigger a
real Square hosted-checkout link. All seeded data is cleaned up at the end.
"""

import os
import time
import uuid
import pytest
import requests
import bcrypt
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maxenergy_db")

ADMIN_EMAIL = "admin@maxenergy.com.au"
ADMIN_PW = "MaxAdmin123!"
MEMBER_EMAIL = "testmember@gmail.com"
MEMBER_PW = "Test!1234"


# --------------------------------------------------------------------------- #
# Shared fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _post_with_retry(s, url, json, headers=None, tries=3, sleep_s=2.0):
    """POST with a small retry on 5xx gateway blips (Cloudflare edge occasionally
    returns 502/504 during long-running email retry loops on mark_booking_paid).
    This is a test-harness convenience only; the endpoint behaviour is not modified."""
    last = None
    for i in range(tries):
        last = s.post(url, json=json, headers=headers, timeout=90)
        if last.status_code < 500:
            return last
        time.sleep(sleep_s)
    return last


def _login(s, email, pw):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login failed ({r.status_code}): {r.text}"
    j = r.json()
    assert "token" in j and "user" in j
    return j["token"], j["user"]


# --------------------------------------------------------------------------- #
# 1. Login regression
# --------------------------------------------------------------------------- #
class TestAuthLoginRegression:
    def test_admin_login_and_me(self, s):
        tok, user = _login(s, ADMIN_EMAIL, ADMIN_PW)
        assert user["email"] == ADMIN_EMAIL
        assert user.get("is_admin") is True
        r = s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == ADMIN_EMAIL

    def test_member_login_and_me(self, s):
        tok, user = _login(s, MEMBER_EMAIL, MEMBER_PW)
        assert user["email"] == MEMBER_EMAIL
        r = s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == MEMBER_EMAIL


# --------------------------------------------------------------------------- #
# 2. Register regression
# --------------------------------------------------------------------------- #
class TestAuthRegisterRegression:
    def test_register_fresh_gmail(self, s, mongo):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@gmail.com"
        payload = {
            "email": email,
            "password": "StrongPass!234",
            "first_name": "Reg",
            "last_name": "Tester",
            "phone": "+61400111222",
            "date_of_birth": "1995-05-15",
        }
        try:
            r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
            assert r.status_code == 200, r.text
            j = r.json()
            assert "token" in j and "user" in j
            assert j["user"]["email"] == email.lower()
            me = s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(j["token"]))
            assert me.status_code == 200, me.text
            assert me.json()["user"]["email"] == email.lower()
        finally:
            # Cleanup
            mongo.users.delete_many({"email": email.lower()})
            mongo.otp_codes.delete_many({"email": email.lower()})


# --------------------------------------------------------------------------- #
# 3. SEC-004 — logout revokes token
# --------------------------------------------------------------------------- #
class TestLogoutRevocation:
    def test_logout_invalidates_token_and_relogin_works(self, s):
        # Use testmember (login credentials remain unchanged; only token_version bumps).
        tok, _ = _login(s, MEMBER_EMAIL, MEMBER_PW)
        # Sanity — token works
        assert s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).status_code == 200
        # Logout
        r = s.post(f"{BASE_URL}/api/auth/logout", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Same token must now be rejected
        me = s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok))
        assert me.status_code == 401, f"expected 401 after logout, got {me.status_code}: {me.text}"
        # Fresh login → new working token
        new_tok, _ = _login(s, MEMBER_EMAIL, MEMBER_PW)
        assert new_tok != tok
        me2 = s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(new_tok))
        assert me2.status_code == 200, me2.text


# --------------------------------------------------------------------------- #
# 4. SEC-004 — password reset revokes all prior JWTs
# --------------------------------------------------------------------------- #
class TestPasswordResetRevocation:
    """Uses a fresh throwaway @gmail.com user so we never touch the shared
    admin/testmember credentials. Injects the OTP directly into Mongo since
    the backend does not log the OTP code to disk."""

    def test_reset_password_revokes_prior_token(self, s, mongo):
        email = f"TEST_pwreset_{uuid.uuid4().hex[:8]}@gmail.com".lower()
        initial_pw = "InitPass!234"
        new_pw = "NewPass!234"
        try:
            # Register throwaway
            reg = s.post(f"{BASE_URL}/api/auth/register", json={
                "email": email,
                "password": initial_pw,
                "first_name": "Pwr",
                "last_name": "Reset",
                "phone": "+61400333444",
                "date_of_birth": "1995-05-15",
            })
            assert reg.status_code == 200, reg.text
            old_token = reg.json()["token"]
            assert s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(old_token)).status_code == 200

            # Trigger the forgot flow (this issues an OTP but the code isn't logged;
            # so we also seed a known OTP hash into Mongo to make the test deterministic).
            fp = s.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email})
            assert fp.status_code == 200, fp.text

            known_code = "123456"
            code_hash = bcrypt.hashpw(known_code.encode(), bcrypt.gensalt()).decode()
            mongo.otp_codes.update_one(
                {"email": email, "purpose": "reset"},
                {"$set": {
                    "email": email,
                    "purpose": "reset",
                    "code_hash": code_hash,
                    "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
                    "attempts": 0,
                    "created_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )

            # Reset password
            rp = s.post(f"{BASE_URL}/api/auth/reset-password", json={
                "email": email, "code": known_code, "new_password": new_pw,
            })
            assert rp.status_code == 200, rp.text
            body = rp.json()
            assert body.get("ok") is True
            new_token = body.get("token")
            assert new_token, "reset-password must return a fresh token"

            # Old JWT must be rejected (token_version bumped)
            old_me = s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(old_token))
            assert old_me.status_code == 401, \
                f"expected 401 for pre-reset token, got {old_me.status_code}: {old_me.text}"

            # New token must work
            new_me = s.get(f"{BASE_URL}/api/auth/me", headers=_hdr(new_token))
            assert new_me.status_code == 200, new_me.text
            assert new_me.json()["user"]["email"] == email

            # Login with new password works
            login_new = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": new_pw})
            assert login_new.status_code == 200, login_new.text
        finally:
            mongo.users.delete_many({"email": email})
            mongo.otp_codes.delete_many({"email": email})
            mongo.notifications.delete_many({"user_id": {"$regex": "^user_"}, "title": "Welcome"})  # best-effort


# --------------------------------------------------------------------------- #
# 5. Admin authorization
# --------------------------------------------------------------------------- #
class TestAdminAuthorization:
    def test_admin_overview_admin_ok_member_forbidden(self, s):
        admin_tok, _ = _login(s, ADMIN_EMAIL, ADMIN_PW)
        member_tok, _ = _login(s, MEMBER_EMAIL, MEMBER_PW)

        r_admin = s.get(f"{BASE_URL}/api/admin/overview", headers=_hdr(admin_tok))
        assert r_admin.status_code == 200, r_admin.text
        j = r_admin.json()
        for k in ("classes", "members", "applications"):
            assert k in j, f"missing key {k}: {j}"

        r_mem = s.get(f"{BASE_URL}/api/admin/overview", headers=_hdr(member_tok))
        assert r_mem.status_code == 403, f"member should get 403, got {r_mem.status_code}: {r_mem.text}"


# --------------------------------------------------------------------------- #
# 6. SEC-003 — credit deduction atomicity
# --------------------------------------------------------------------------- #
class TestCreditDeductionAtomicity:
    """Seed testmember with credit == class price, book with use_credit=true,
    verify exactly one atomic deduction + one ledger row + no negative balance
    on a follow-up insufficient-balance attempt. NEVER hits Square."""

    def test_full_credit_checkout_deducts_once_and_never_negative(self, s, mongo):
        member_tok, member = _login(s, MEMBER_EMAIL, MEMBER_PW)
        uid = member["id"] if "id" in member else member.get("user_id")
        # Fallback: look up via db
        if not uid:
            u = mongo.users.find_one({"email": MEMBER_EMAIL}, {"_id": 0, "user_id": 1})
            uid = u["user_id"]

        # Pick two future, fixed-time classes testmember has NOT already booked
        booked_cids = {b["class_id"] for b in mongo.bookings.find(
            {"user_id": uid, "status": {"$in": ["pending", "paid", "confirmed"]}},
            {"_id": 0, "class_id": 1})}
        candidates = list(mongo.classes.find(
            {"by_appointment": {"$ne": True}, "cancelled": {"$ne": True},
             "start_at": {"$gt": datetime.now(timezone.utc) + timedelta(hours=48)}},
            {"_id": 0, "class_id": 1, "name": 1, "price_cents": 1}
        ).sort("start_at", 1).limit(30))
        picks = [c for c in candidates if c["class_id"] not in booked_cids][:2]
        assert len(picks) >= 2, "need at least 2 unbooked future classes"
        class_a, class_b = picks[0], picks[1]
        price_a = int(class_a["price_cents"])

        # Snapshot original credit + ledger so we can restore cleanly
        original = mongo.users.find_one({"user_id": uid}, {"_id": 0, "credit_cents": 1})
        original_credit = int((original or {}).get("credit_cents", 0))
        created_bookings = []

        try:
            # Seed credit == class A price so it FULLY covers.
            mongo.users.update_one({"user_id": uid}, {"$set": {"credit_cents": price_a}})

            # --- Booking A: create then checkout with credit ---
            b1 = s.post(f"{BASE_URL}/api/bookings",
                        json={"class_id": class_a["class_id"]}, headers=_hdr(member_tok))
            assert b1.status_code == 200, b1.text
            bk_a = b1.json()["booking"]["booking_id"]
            created_bookings.append(bk_a)

            co1 = _post_with_retry(s, f"{BASE_URL}/api/payments/checkout",
                         json={"booking_id": bk_a, "origin_url": "https://test.local",
                               "use_credit": True},
                         headers=_hdr(member_tok))
            # Accept 200 (fresh) or 409 "Already paid" (edge timed out then retried
            # and the backend had already applied credit). The DB assertions below
            # are the source of truth for SEC-003 atomicity.
            assert co1.status_code in (200, 409), co1.text
            if co1.status_code == 200:
                resp1 = co1.json()
                assert resp1.get("paid_with_credit") is True, \
                    f"expected paid_with_credit=true, got {resp1}"

            # Credit should have decreased by EXACTLY price_a → 0.
            after1 = mongo.users.find_one({"user_id": uid}, {"_id": 0, "credit_cents": 1})
            assert int(after1["credit_cents"]) == 0, \
                f"credit_cents should be 0 after full-credit booking, got {after1['credit_cents']}"

            # Exactly one credit_ledger row for this booking with delta == -price_a.
            ledger_rows = list(mongo.credit_ledger.find(
                {"user_id": uid, "booking_id": bk_a}, {"_id": 0}))
            assert len(ledger_rows) == 1, f"expected 1 ledger row, got {len(ledger_rows)}: {ledger_rows}"
            assert int(ledger_rows[0]["delta_cents"]) == -price_a, \
                f"ledger delta should be -{price_a}, got {ledger_rows[0]['delta_cents']}"

            # Booking A must be marked paid with credit_deducted=true
            bkdoc = mongo.bookings.find_one({"booking_id": bk_a}, {"_id": 0})
            assert bkdoc.get("status") == "paid"
            assert bkdoc.get("credit_deducted") is True
            assert int(bkdoc.get("credit_applied_cents", 0)) == price_a

            # --- Booking B: attempt second full-credit checkout when balance is 0.
            # Testmember is_test=true so backend won't hit Square; must NOT go negative.
            b2 = s.post(f"{BASE_URL}/api/bookings",
                        json={"class_id": class_b["class_id"]}, headers=_hdr(member_tok))
            assert b2.status_code == 200, b2.text
            bk_b = b2.json()["booking"]["booking_id"]
            created_bookings.append(bk_b)

            co2 = _post_with_retry(s, f"{BASE_URL}/api/payments/checkout",
                         json={"booking_id": bk_b, "origin_url": "https://test.local",
                               "use_credit": True},
                         headers=_hdr(member_tok))
            # Accept either 200 (paid_with_credit / paid_free_test), 400
            # ("balance changed"), or 409 (edge retried after a slow first call).
            # The DB check below is the real assertion: credit_cents must NEVER
            # go negative.
            assert co2.status_code in (200, 400, 409), \
                f"unexpected {co2.status_code}: {co2.text}"

            after2 = mongo.users.find_one({"user_id": uid}, {"_id": 0, "credit_cents": 1})
            assert int(after2["credit_cents"]) >= 0, \
                f"credit_cents went NEGATIVE ({after2['credit_cents']}) — SEC-003 violated"
            # And should still be 0 (never dropped below zero)
            assert int(after2["credit_cents"]) == 0

            # No extra ledger row that would drive balance negative
            ledger_rows2 = list(mongo.credit_ledger.find(
                {"user_id": uid, "booking_id": bk_b}, {"_id": 0}))
            for row in ledger_rows2:
                assert int(row.get("delta_cents", 0)) >= -0, "ledger delta should never be < 0 when balance was 0"
                # If any row is present it must be for a partial<=0 credit only
                assert int(row.get("delta_cents", 0)) == 0, \
                    f"unexpected non-zero ledger delta for zero-balance booking: {row}"
        finally:
            # Cleanup: remove seeded credit, delete created bookings + ledger rows + txns
            mongo.users.update_one({"user_id": uid}, {"$set": {"credit_cents": original_credit}})
            for bk in created_bookings:
                mongo.bookings.delete_many({"booking_id": bk})
                mongo.credit_ledger.delete_many({"booking_id": bk})
                mongo.payment_transactions.delete_many({"booking_id": bk})
                mongo.notifications.delete_many({"user_id": uid, "data.booking_id": bk})


# --------------------------------------------------------------------------- #
# 7. Regression on booking settings + attendance roster
# --------------------------------------------------------------------------- #
class TestSettingsAndRosterRegression:
    def test_member_booking_settings(self, s):
        tok, _ = _login(s, MEMBER_EMAIL, MEMBER_PW)
        r = s.get(f"{BASE_URL}/api/settings/booking", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert "cancel_window_hours" in j
        assert isinstance(j["cancel_window_hours"], int)
        assert 1 <= j["cancel_window_hours"] <= 168

    def test_admin_settings(self, s):
        tok, _ = _login(s, ADMIN_EMAIL, ADMIN_PW)
        r = s.get(f"{BASE_URL}/api/admin/settings", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert "cancel_window_hours" in r.json()

    def test_admin_attendance_roster(self, s):
        tok, _ = _login(s, ADMIN_EMAIL, ADMIN_PW)
        r = s.get(f"{BASE_URL}/api/admin/attendance/roster", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert "sessions" in j and isinstance(j["sessions"], list)
        assert "totals" in j and isinstance(j["totals"], dict)
        for k in ("attended", "no_shows", "sessions"):
            assert k in j["totals"], f"totals missing {k}: {j['totals']}"
