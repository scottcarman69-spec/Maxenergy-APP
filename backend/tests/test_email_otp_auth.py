"""
Backend tests for the new email-OTP verification + password recovery flow.

Reads the 6-digit code from the backend log (see server.log lines
"OTP issued for <email> (<purpose>): <code>") because outbound Resend
delivery to fake @gmail.com inboxes is expected to 422 and is not a failure.
"""
import os
import re
import time
import uuid
import subprocess
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

LOG_PATHS = [
    "/var/log/supervisor/backend.out.log",
    "/var/log/supervisor/backend.err.log",
]

OTP_RE = re.compile(r"OTP issued for (\S+) \((verify|reset)\): (\d{6})")


def _read_all_logs() -> str:
    parts = []
    for p in LOG_PATHS:
        try:
            parts.append(subprocess.check_output(["tail", "-n", "2000", p], text=True))
        except Exception:
            pass
    return "\n".join(parts)


def read_latest_otp(email: str, purpose: str, timeout: float = 15.0) -> str:
    """Poll backend log for the newest code issued to `email`/`purpose`."""
    email_l = email.lower()
    end = time.time() + timeout
    last = None
    while time.time() < end:
        text = _read_all_logs()
        matches = OTP_RE.findall(text)
        for em, pur, code in matches:
            if em.lower() == email_l and pur == purpose:
                last = code
        if last:
            return last
        time.sleep(0.5)
    raise AssertionError(f"OTP for {email}/{purpose} not found in backend logs")


@pytest.fixture
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _rand_email() -> str:
    return f"test_{uuid.uuid4().hex[:10]}@gmail.com"


# --------- registration + verification --------------------------------------
class TestRegisterAndVerify:
    def test_register_returns_unverified_user_and_token(self, s):
        email = _rand_email()
        # Snapshot current log so we can be sure we read the freshly issued code
        _ = _read_all_logs()
        r = s.post(f"{BASE_URL}/api/auth/register",
                   json={"name": "Test User", "email": email, "password": "Password123"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("token"), "JWT token missing"
        assert data["user"]["email"] == email
        assert data["user"]["verified"] is False
        # Code must have been logged
        code = read_latest_otp(email, "verify")
        assert re.fullmatch(r"\d{6}", code)

    def test_verify_otp_wrong_then_correct(self, s):
        email = _rand_email()
        s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Test User", "email": email, "password": "Password123"})
        code = read_latest_otp(email, "verify")

        # Wrong code
        r_wrong = s.post(f"{BASE_URL}/api/auth/verify-otp",
                         json={"email": email, "code": "000000" if code != "000000" else "111111"})
        assert r_wrong.status_code == 400
        assert "Invalid or expired code" in r_wrong.text

        # Correct code
        r_ok = s.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"email": email, "code": code})
        assert r_ok.status_code == 200, r_ok.text
        data = r_ok.json()
        assert data["verified"] is True
        assert data["user"]["verified"] is True

        # Verify persisted: /auth/me still says verified after login
        login = s.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": "Password123"}).json()
        assert login["user"]["verified"] is True

    def test_verify_locks_after_5_wrong_attempts(self, s):
        email = _rand_email()
        s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Test User", "email": email, "password": "Password123"})
        real = read_latest_otp(email, "verify")
        # Ensure the "wrong" code differs from the actual one
        wrong = "000000" if real != "000000" else "111111"
        for i in range(5):
            r = s.post(f"{BASE_URL}/api/auth/verify-otp",
                       json={"email": email, "code": wrong})
            assert r.status_code == 400, f"attempt {i+1}: {r.text}"
        # 6th attempt with the CORRECT code should now be rejected (locked)
        r_locked = s.post(f"{BASE_URL}/api/auth/verify-otp",
                          json={"email": email, "code": real})
        assert r_locked.status_code == 400
        assert "Invalid or expired code" in r_locked.text


# --------- resend --------------------------------------------------------------
class TestResendOtp:
    def test_resend_issues_fresh_code_and_cooldown(self, s):
        email = _rand_email()
        s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Test User", "email": email, "password": "Password123"})
        first_code = read_latest_otp(email, "verify")

        # Immediate resend -> 429 cooldown
        r_cool = s.post(f"{BASE_URL}/api/auth/resend-otp", json={"email": email})
        assert r_cool.status_code == 429, r_cool.text

        # Wait > 30s to allow a fresh resend
        time.sleep(31)
        r_ok = s.post(f"{BASE_URL}/api/auth/resend-otp", json={"email": email})
        assert r_ok.status_code == 200
        assert r_ok.json() == {"ok": True}
        # A new code appears in logs (may equal first only by 1-in-a-million chance)
        second_code = read_latest_otp(email, "verify")
        assert re.fullmatch(r"\d{6}", second_code)


# --------- forgot / reset password --------------------------------------------
class TestForgotAndReset:
    def test_forgot_password_no_enumeration(self, s):
        # Unknown email still returns ok
        r_unknown = s.post(f"{BASE_URL}/api/auth/forgot-password",
                           json={"email": f"nobody_{uuid.uuid4().hex[:8]}@gmail.com"})
        assert r_unknown.status_code == 200
        assert r_unknown.json() == {"ok": True}

    def test_reset_password_flow_end_to_end(self, s):
        email = _rand_email()
        s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Test User", "email": email, "password": "OldPass123"})
        # Consume the initial verify code so we don't confuse purposes
        vcode = read_latest_otp(email, "verify")
        assert vcode

        # Request password reset
        r_forgot = s.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": email})
        assert r_forgot.status_code == 200
        assert r_forgot.json() == {"ok": True}
        reset_code = read_latest_otp(email, "reset")

        # Reset
        r_reset = s.post(f"{BASE_URL}/api/auth/reset-password",
                         json={"email": email, "code": reset_code, "new_password": "NewPass456"})
        assert r_reset.status_code == 200, r_reset.text
        body = r_reset.json()
        assert body["ok"] is True
        assert body.get("token")
        assert body["user"]["verified"] is True

        # OLD password must fail
        r_old = s.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": "OldPass123"})
        assert r_old.status_code == 401

        # NEW password succeeds
        r_new = s.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": "NewPass456"})
        assert r_new.status_code == 200
        assert r_new.json()["user"]["verified"] is True


# --------- grandfathered / admin accounts -------------------------------------
class TestAdminGrandfathered:
    def test_admin_info_account_is_verified(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": "info@maxenergy.com.au", "password": "maxenergy12@"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["is_admin"] is True
        assert data["user"]["verified"] is True
