"""
Tests for the Bug Report / Feedback feature.

Endpoints under test:
  - POST /api/bug-reports                 (member — require_user)
  - GET  /api/admin/bug-reports           (admin  — require_admin)
  - PUT  /api/admin/bug-reports/{report_id} (admin — require_admin)
  - GET  /api/admin/overview              (admin) — bug_reports_open field

Focus: authorization boundaries + payload edge cases.
"""

import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASSWORD = "Maxenergy12@"
MEMBER_EMAIL = "appstore.review@maxenergy.com.au"
MEMBER_PASSWORD = "AppReview2026!"

# The bug-report POST handler calls send_email() inline with up to 4 retries
# against the Emergent email integration. When that integration is
# rate-limited (429), a single request can legitimately take 30-60s before
# returning. Use a generous timeout on submissions so we don't confuse
# email-provider throttling with product failure.
POST_TIMEOUT = 120


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=POST_TIMEOUT)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    d = r.json()
    assert "token" in d, f"No token in login response for {email}"
    return d["token"], d.get("user", {})


@pytest.fixture(scope="module")
def admin_token(s):
    token, user = _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert user.get("is_admin") is True, f"Expected admin user, got: {user}"
    return token


@pytest.fixture(scope="module")
def member_token(s):
    token, user = _login(s, MEMBER_EMAIL, MEMBER_PASSWORD)
    assert user.get("is_admin") in (False, None), f"Expected non-admin user, got: {user}"
    return token


@pytest.fixture(scope="module")
def created_report(s, member_token):
    """A valid report created by the member; used later by admin update/list tests."""
    h = {"Authorization": f"Bearer {member_token}"}
    payload = {
        "message": "TEST_ Testing bug report submission from pytest — this is a valid message.",
        "screenshot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "platform": "ios-pytest",
        "app_version": "1.0.0-test",
    }
    r = s.post(f"{BASE_URL}/api/bug-reports", json=payload, headers=h, timeout=POST_TIMEOUT)
    assert r.status_code == 200, f"Failed to create seed report: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("ok") is True
    assert "report_id" in d and d["report_id"]
    return d["report_id"]


# ---------- POST /api/bug-reports ----------

class TestSubmitBugReport:
    def test_requires_auth(self, s):
        r = s.post(f"{BASE_URL}/api/bug-reports", json={"message": "no auth test message here"}, timeout=POST_TIMEOUT)
        assert r.status_code in (401, 403), f"Expected 401/403 without token, got {r.status_code}: {r.text}"

    def test_valid_submission(self, s, member_token):
        h = {"Authorization": f"Bearer {member_token}"}
        payload = {"message": "TEST_ valid submission message from pytest"}
        r = s.post(f"{BASE_URL}/api/bug-reports", json=payload, headers=h, timeout=POST_TIMEOUT)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("ok") is True
        assert isinstance(d.get("report_id"), str) and d["report_id"]

    def test_message_too_short_returns_400(self, s, member_token):
        h = {"Authorization": f"Bearer {member_token}"}
        r = s.post(f"{BASE_URL}/api/bug-reports", json={"message": "hi"}, headers=h, timeout=POST_TIMEOUT)
        assert r.status_code == 400, f"Expected 400 for short msg, got {r.status_code}: {r.text}"

    def test_message_too_long_truncated_still_200(self, s, member_token):
        h = {"Authorization": f"Bearer {member_token}"}
        long_msg = "A" * 5000  # > 4000, should be truncated but still succeed
        r = s.post(f"{BASE_URL}/api/bug-reports", json={"message": long_msg}, headers=h, timeout=POST_TIMEOUT)
        assert r.status_code == 200, f"Expected 200 (truncated), got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("ok") is True
        assert d.get("report_id")

    def test_screenshot_data_uri_accepted(self, s, member_token):
        h = {"Authorization": f"Bearer {member_token}"}
        payload = {
            "message": "TEST_ with screenshot attached from pytest",
            "screenshot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "platform": "android",
            "app_version": "2.3.4",
        }
        r = s.post(f"{BASE_URL}/api/bug-reports", json=payload, headers=h, timeout=POST_TIMEOUT)
        assert r.status_code == 200, f"Expected 200 with screenshot, got {r.status_code}: {r.text}"
        assert r.json().get("ok") is True

    def test_screenshot_too_large_returns_400(self, s, member_token):
        h = {"Authorization": f"Bearer {member_token}"}
        oversized = "data:image/png;base64," + ("A" * 3_000_001)
        payload = {"message": "TEST_ oversized screenshot check", "screenshot": oversized}
        r = s.post(f"{BASE_URL}/api/bug-reports", json=payload, headers=h, timeout=POST_TIMEOUT)
        assert r.status_code == 400, f"Expected 400 for oversized screenshot, got {r.status_code}: {r.text}"


# ---------- GET /api/admin/bug-reports ----------

class TestAdminListBugReports:
    def test_non_admin_forbidden(self, s, member_token):
        h = {"Authorization": f"Bearer {member_token}"}
        r = s.get(f"{BASE_URL}/api/admin/bug-reports", headers=h, timeout=POST_TIMEOUT)
        assert r.status_code in (401, 403), f"Non-admin should be blocked, got {r.status_code}: {r.text}"

    def test_no_auth_forbidden(self, s):
        r = s.get(f"{BASE_URL}/api/admin/bug-reports", timeout=POST_TIMEOUT)
        assert r.status_code in (401, 403), f"No auth should be blocked, got {r.status_code}"

    def test_admin_can_list(self, s, admin_token, created_report):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = s.get(f"{BASE_URL}/api/admin/bug-reports", headers=h, timeout=POST_TIMEOUT)
        assert r.status_code == 200, f"Admin list failed: {r.status_code} {r.text}"
        d = r.json()
        assert "reports" in d and isinstance(d["reports"], list), f"Missing/invalid 'reports' key: {d.keys()}"
        assert "open_count" in d and isinstance(d["open_count"], int), f"Missing/invalid 'open_count': {d.keys()}"

        # Locate our seeded report and validate all required fields.
        target = next((x for x in d["reports"] if x.get("report_id") == created_report), None)
        assert target is not None, f"Seeded report {created_report} not returned by admin list"

        required = ["user_name", "user_email", "message", "screenshot", "platform", "app_version", "status", "created_at"]
        missing = [k for k in required if k not in target]
        assert not missing, f"Report missing fields: {missing}. Report keys: {list(target.keys())}"

        # created_at is ISO string
        assert isinstance(target["created_at"], str) and "T" in target["created_at"], \
            f"created_at should be ISO string, got: {target['created_at']!r}"

        # No mongo _id leakage
        assert "_id" not in target, "MongoDB _id leaked in admin response"

        # user_email matches the member who submitted
        assert target["user_email"] == MEMBER_EMAIL, f"user_email mismatch: {target['user_email']}"

        # status is one of the allowed values
        assert target["status"] in ("open", "resolved")


# ---------- PUT /api/admin/bug-reports/{report_id} ----------

class TestAdminUpdateBugReport:
    def test_non_admin_forbidden(self, s, member_token, created_report):
        h = {"Authorization": f"Bearer {member_token}"}
        r = s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "resolved"},
            headers=h,
            timeout=POST_TIMEOUT,
        )
        assert r.status_code in (401, 403), f"Non-admin should be blocked, got {r.status_code}: {r.text}"

    def test_no_auth_forbidden(self, s, created_report):
        r = s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "resolved"},
            timeout=POST_TIMEOUT,
        )
        assert r.status_code in (401, 403), f"No auth should be blocked, got {r.status_code}"

    def test_resolve_and_reopen_persist(self, s, admin_token, created_report):
        h = {"Authorization": f"Bearer {admin_token}"}

        # Resolve
        r = s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "resolved"},
            headers=h,
            timeout=POST_TIMEOUT,
        )
        assert r.status_code == 200, f"Resolve failed: {r.status_code} {r.text}"
        assert r.json().get("status") == "resolved"

        # Verify persistence via list
        list_r = s.get(f"{BASE_URL}/api/admin/bug-reports", headers=h, timeout=POST_TIMEOUT).json()
        rec = next((x for x in list_r["reports"] if x["report_id"] == created_report), None)
        assert rec and rec["status"] == "resolved", f"Resolve did not persist. Got {rec}"

        # Re-open
        r2 = s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "open"},
            headers=h,
            timeout=POST_TIMEOUT,
        )
        assert r2.status_code == 200, f"Reopen failed: {r2.status_code} {r2.text}"
        assert r2.json().get("status") == "open"

        list_r2 = s.get(f"{BASE_URL}/api/admin/bug-reports", headers=h, timeout=POST_TIMEOUT).json()
        rec2 = next((x for x in list_r2["reports"] if x["report_id"] == created_report), None)
        assert rec2 and rec2["status"] == "open", f"Reopen did not persist. Got {rec2}"

    def test_invalid_status_returns_400(self, s, admin_token, created_report):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "banana"},
            headers=h,
            timeout=POST_TIMEOUT,
        )
        assert r.status_code == 400, f"Expected 400 for invalid status, got {r.status_code}: {r.text}"

    def test_unknown_id_returns_404(self, s, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = s.put(
            f"{BASE_URL}/api/admin/bug-reports/bug_does_not_exist_xyz",
            json={"status": "open"},
            headers=h,
            timeout=POST_TIMEOUT,
        )
        assert r.status_code == 404, f"Expected 404 for unknown id, got {r.status_code}: {r.text}"


# ---------- GET /api/admin/overview.bug_reports_open ----------

class TestAdminOverviewBugCount:
    def test_overview_includes_bug_reports_open(self, s, admin_token, created_report):
        """Overview must expose bug_reports_open and it must reflect status='open' count.

        Note: uses delta comparisons instead of absolute counts to tolerate
        concurrent test runs (pytest-xdist) or pre-existing reports.
        """
        h = {"Authorization": f"Bearer {admin_token}"}

        # Ensure our seed report is 'open' first.
        s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "open"},
            headers=h,
            timeout=POST_TIMEOUT,
        )

        ov = s.get(f"{BASE_URL}/api/admin/overview", headers=h, timeout=POST_TIMEOUT)
        assert ov.status_code == 200, f"Overview failed: {ov.status_code} {ov.text}"
        ov_json = ov.json()
        assert "bug_reports_open" in ov_json, f"Missing bug_reports_open field. Keys: {list(ov_json.keys())}"
        before = ov_json["bug_reports_open"]
        assert isinstance(before, int)
        assert before >= 1, f"Expected >=1 open reports, got {before}"

        # Resolve our seed report -> overview open count must decrement by exactly 1.
        s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "resolved"},
            headers=h,
            timeout=POST_TIMEOUT,
        )
        ov2 = s.get(f"{BASE_URL}/api/admin/overview", headers=h, timeout=POST_TIMEOUT).json()
        after = ov2["bug_reports_open"]
        assert after == before - 1, \
            f"Expected bug_reports_open to decrement by 1 after resolve. before={before} after={after}"

        # Re-open -> count restored to `before` (or close to it under concurrency).
        s.put(
            f"{BASE_URL}/api/admin/bug-reports/{created_report}",
            json={"status": "open"},
            headers=h,
            timeout=POST_TIMEOUT,
        )
        ov3 = s.get(f"{BASE_URL}/api/admin/overview", headers=h, timeout=POST_TIMEOUT).json()
        assert ov3["bug_reports_open"] >= after + 1, \
            f"Expected bug_reports_open to grow after reopen. after={after} restored={ov3['bug_reports_open']}"
