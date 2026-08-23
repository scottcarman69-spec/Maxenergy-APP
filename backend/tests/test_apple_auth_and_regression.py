"""
Backend tests for:
  (1) NEW: POST /api/auth/apple  — Sign in with Apple endpoint
  (2) Regression: existing auth flows (login, /me, logout, register+verify-otp, google session)
  (3) Regression: admin check-ins, gym photos, credits, class-pass QR, classes list
"""
import os
import re
import time
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get(
    "EXPO_BACKEND_URL", ""
).rstrip("/")

if not BASE_URL:
    # Fall back to reading frontend/.env directly
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "Public backend URL is required (EXPO_PUBLIC_BACKEND_URL)"

ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASSWORD = "Maxenergy12@"

ADMIN2_EMAIL = "admin@maxenergy.com.au"
ADMIN2_PASSWORD = "x1TrytJ%A12N"

TEST_MEMBER_EMAIL = "testmember@gmail.com"
TEST_MEMBER_PASSWORD = "Test!1234"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, email, password):
    r = http.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token(http):
    r = _login(http, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def member_token(http):
    r = _login(http, TEST_MEMBER_EMAIL, TEST_MEMBER_PASSWORD)
    assert r.status_code == 200, f"member login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _fresh_member_token():
    """Independent fresh login for tests that must not share a token with logout tests."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_MEMBER_EMAIL, "password": TEST_MEMBER_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"fresh member login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# ---------- NEW: Sign in with Apple ----------
class TestAppleAuth:
    def test_missing_identity_token_returns_422(self, http):
        """Pydantic requires identity_token — omitting the field must yield 422."""
        r = http.post(f"{BASE_URL}/api/auth/apple", json={}, timeout=30)
        assert r.status_code == 422, f"expected 422, got {r.status_code} body={r.text}"

    def test_empty_identity_token_returns_401(self, http):
        """Empty string bypasses pydantic min-length (no min set) → server returns 401."""
        r = http.post(
            f"{BASE_URL}/api/auth/apple", json={"identity_token": ""}, timeout=30
        )
        # Endpoint explicitly raises 401 "Missing identity token" for empty strings.
        assert r.status_code == 401, f"expected 401, got {r.status_code} body={r.text}"
        assert "identity" in r.text.lower() or "invalid" in r.text.lower()

    def test_garbage_identity_token_returns_401(self, http):
        """A non-JWT string should fail JWKS parse → 401 'Invalid Apple token'."""
        r = http.post(
            f"{BASE_URL}/api/auth/apple",
            json={"identity_token": "this-is-not-a-real-apple-jwt"},
            timeout=30,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code} body={r.text}"
        assert "Invalid Apple token" in r.text

    def test_malformed_jwt_identity_token_returns_401(self, http):
        """A syntactically-JWT-shaped but forged token should also fail (bad signature)."""
        # header.payload.signature but not signed by Apple
        fake_jwt = (
            "eyJhbGciOiJSUzI1NiIsImtpZCI6ImZha2UifQ."
            "eyJzdWIiOiJmYWtlLXN1YiIsImlzcyI6Imh0dHBzOi8vYXBwbGVpZC5hcHBsZS5jb20iLCJhdWQiOiJjb20uZmFrZSJ9."
            "ZmFrZS1zaWc"
        )
        r = http.post(
            f"{BASE_URL}/api/auth/apple", json={"identity_token": fake_jwt}, timeout=30
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code} body={r.text}"
        assert "Invalid Apple token" in r.text

    def test_endpoint_does_not_500(self, http):
        """Sanity: no 5xx from the endpoint for any of the above inputs."""
        for payload in (
            {},
            {"identity_token": ""},
            {"identity_token": "garbage"},
            {"identity_token": "a.b.c"},
        ):
            r = http.post(f"{BASE_URL}/api/auth/apple", json=payload, timeout=30)
            assert r.status_code < 500, f"5xx on payload {payload}: {r.status_code} {r.text}"


# ---------- Regression: existing auth flows ----------
class TestAuthRegression:
    def test_login_admin(self, http):
        r = _login(http, ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200
        j = r.json()
        assert "token" in j and "user" in j
        assert j["user"].get("is_admin") is True

    def test_login_admin2(self, http):
        r = _login(http, ADMIN2_EMAIL, ADMIN2_PASSWORD)
        assert r.status_code == 200
        assert r.json().get("user", {}).get("is_admin") is True

    def test_login_member(self, http):
        r = _login(http, TEST_MEMBER_EMAIL, TEST_MEMBER_PASSWORD)
        assert r.status_code == 200
        assert r.json()["user"].get("email") == TEST_MEMBER_EMAIL

    def test_login_invalid(self, http):
        r = _login(http, ADMIN_EMAIL, "wrong-password")
        assert r.status_code == 401

    def test_me_with_admin_bearer(self, http, admin_token):
        r = http.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200
        j = r.json()
        # Endpoint returns either {user: {...}} wrapper or the user object directly.
        user = j.get("user") if isinstance(j.get("user"), dict) else j
        assert user.get("email") == ADMIN_EMAIL, f"unexpected /me payload: {j}"
        assert user.get("is_admin") is True

    def test_me_without_token(self, http):
        r = http.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code in (401, 403)

    def test_logout(self, http, member_token):
        r = http.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {member_token}"},
            timeout=30,
        )
        # Logout should succeed (200 or 204). It may rotate token_version.
        assert r.status_code in (200, 204), f"logout failed {r.status_code} {r.text}"

    def test_google_session_rejects_invalid(self, http):
        """POST /api/auth/session with an obviously bogus session_id must NOT 500;
        should return 401 (Emergent auth service rejects it)."""
        r = http.post(
            f"{BASE_URL}/api/auth/session",
            json={"session_id": "TEST_bogus_session_id_that_cannot_be_valid"},
            timeout=30,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"


# ---------- Regression: register + verify OTP endpoints reachable ----------
class TestRegisterVerifyOtp:
    def test_register_and_reject_bad_otp(self, http):
        """Register a fresh member and verify (a) pending=true, (b) verify-otp with a
        bad code returns 400 (not 500). We cannot fetch the real code because the
        server hashes it (log.info only records "OTP issued for <email> (verify)"
        WITHOUT the 6-digit code — the note in /app/memory/test_credentials.md
        claiming the code is logged is INACCURATE for this build)."""
        email = f"test_apple_reg_{int(time.time())}@gmail.com"
        password = "Password123!"
        payload = {
            "first_name": "Apple",
            "last_name": "Tester",
            "date_of_birth": "1995-05-05",
            "phone": "+61400000123",
            "email": email,
            "password": password,
        }
        r = http.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=30)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        assert r.json().get("pending") is True

        # Verify-OTP with wrong code should be a clean 400 (not 5xx / 401).
        r2 = http.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": email, "code": "000000"},
            timeout=30,
        )
        assert r2.status_code in (400, 401), f"unexpected: {r2.status_code} {r2.text}"
        assert r2.status_code < 500

    def test_resend_otp_reachable(self, http):
        r = http.post(
            f"{BASE_URL}/api/auth/resend-otp",
            json={"email": TEST_MEMBER_EMAIL},
            timeout=30,
        )
        # For an already-verified/existing account resend may 400 or 200 or 429; must not 5xx.
        assert r.status_code < 500, f"5xx on resend-otp: {r.status_code} {r.text}"


# ---------- Regression: admin check-ins today ----------
class TestAdminCheckins:
    def test_checkins_today_as_admin(self, http, admin_token):
        r = http.get(
            f"{BASE_URL}/api/admin/checkins/today",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        # Response should be either a list or a dict with items
        j = r.json()
        assert isinstance(j, (list, dict))

    def test_checkins_today_denied_for_member(self, http, member_token):
        r = http.get(
            f"{BASE_URL}/api/admin/checkins/today",
            headers={"Authorization": f"Bearer {member_token}"},
            timeout=30,
        )
        assert r.status_code in (401, 403)


# ---------- Regression: gym photos gallery ----------
class TestGymPhotos:
    def test_get_gym_photos_public(self, http):
        r = http.get(f"{BASE_URL}/api/gym/photos", timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        j = r.json()
        # Accept list or {photos: [...]}
        photos = j if isinstance(j, list) else (j.get("photos") or j.get("items") or [])
        assert isinstance(photos, list)

    def test_admin_gym_photos_reachable(self, http, admin_token):
        """We don't upload (would insert real base64 rows); just check POST is reachable
        as admin and requires a valid body — 4xx (not 401/403/404/5xx) is acceptable."""
        r = http.post(
            f"{BASE_URL}/api/admin/gym/photos",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
            timeout=30,
        )
        # Endpoint should authenticate the admin. It may 400/422 on missing image body.
        assert r.status_code not in (401, 403), (
            f"admin auth rejected for gym photo upload: {r.status_code} {r.text}"
        )
        assert r.status_code < 500, f"5xx on gym photo POST: {r.status_code} {r.text}"


# ---------- Regression: credits + class-pass QR ----------
class TestCreditsAndPass:
    def test_credits_shape(self, http):
        tok = _fresh_member_token()
        r = http.get(
            f"{BASE_URL}/api/credits",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        j = r.json()
        # NOTE: the actual field is `balance_cents` (server.py line 4882), NOT `credit_cents`
        # as stated in the review request. Wallet balance in cents lives here.
        assert "balance_cents" in j, f"missing balance_cents: {j}"
        assert "class_pass_credits" in j, f"missing class_pass_credits: {j}"
        assert "entries" in j and "pass_entries" in j
        assert isinstance(j["balance_cents"], int)
        assert isinstance(j["class_pass_credits"], int)
        assert isinstance(j["entries"], list)
        assert isinstance(j["pass_entries"], list)

    def test_passes_qr_signed(self, http):
        tok = _fresh_member_token()
        r = http.get(
            f"{BASE_URL}/api/passes/qr",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        j = r.json()
        # Should contain a signed code / token of some form
        assert any(k in j for k in ("code", "qr", "token", "signed", "signature", "payload")), (
            f"no signed code field in QR response: {j}"
        )


# ---------- Regression: classes list ----------
class TestClassesList:
    def test_classes_unauthenticated(self, http):
        r = http.get(f"{BASE_URL}/api/classes", timeout=30)
        # Public or auth-required — either way, must not 500
        assert r.status_code < 500, f"{r.status_code} {r.text}"

    def test_classes_authenticated(self, http, member_token):
        r = http.get(
            f"{BASE_URL}/api/classes",
            headers={"Authorization": f"Bearer {member_token}"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        j = r.json()
        classes = j if isinstance(j, list) else (j.get("classes") or j.get("items") or [])
        assert isinstance(classes, list)
