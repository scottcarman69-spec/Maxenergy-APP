"""
Tests for the new Recurring weekly schedule + Schedule Exceptions feature.

Covers:
- GET /api/classes rolling window (365 days) with recurring weekly instances
- Class instance id shape: `{template_id}__YYYY-MM-DD`
- Schedule exceptions hiding Kids category during QLD Term 3 holidays
- GET /api/classes/{class_id} resolves virtual instances, 404s on blocked dates
- POST /api/bookings materializes a real class doc for a virtual instance
- Admin Schedule Exceptions CRUD + auth gating
- Admin recurring template CRUD via /api/admin/classes
- Cancel on recurring template returns 400 with helpful message
- Regression: admin overview includes bug_reports_open + my bookings list
"""
import os
from datetime import datetime, date, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASS = "Maxenergy12@"
MEMBER_EMAIL = "appstore.review@maxenergy.com.au"
MEMBER_PASS = "AppReview2026!"

QLD_T3_START = date(2026, 9, 19)
QLD_T3_END = date(2026, 10, 5)


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(s):
    return _login(s, ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def member_token(s):
    return _login(s, MEMBER_EMAIL, MEMBER_PASS)


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- feature 1: /api/classes rolling window ----------
class TestClassesRecurringList:
    def test_rolling_365d_returns_recurring_instances(self, s):
        r = s.get(f"{BASE_URL}/api/classes?days=365&include_ended=true", timeout=60)
        assert r.status_code == 200, r.text[:300]
        classes = r.json().get("classes", [])
        assert len(classes) > 100, f"Expected many instances across 12 months, got {len(classes)}"
        # Non-appointment ids should match the {template_id}__YYYY-MM-DD shape
        scheduled = [c for c in classes if not c.get("by_appointment")]
        assert scheduled, "No scheduled (non-appointment) instances returned"
        bad = [c["class_id"] for c in scheduled if "__" not in c["class_id"]]
        # Materialised legacy docs may still exist; but virtual ones must have __ separator.
        # Accept mix but require > 50% match the template__date shape.
        matches = [c for c in scheduled if "__" in c["class_id"] and c["class_id"].startswith("tmpl_")]
        assert len(matches) / max(len(scheduled), 1) > 0.5, (
            f"Fewer than half instances use template__date shape (matches={len(matches)}/{len(scheduled)})"
        )

    def test_same_class_repeats_weekly(self, s):
        r = s.get(f"{BASE_URL}/api/classes?days=90&include_ended=true", timeout=60)
        classes = r.json()["classes"]
        # Group by template_id (from class_id prefix)
        from collections import Counter
        template_counts = Counter()
        for c in classes:
            if c.get("by_appointment"):
                continue
            cid = c.get("class_id", "")
            if "__" in cid and cid.startswith("tmpl_"):
                tmpl = cid.split("__")[0]
                template_counts[tmpl] += 1
        # At least one template should have multiple weekly occurrences within 90 days
        max_count = max(template_counts.values()) if template_counts else 0
        assert max_count >= 8, f"Expected same template to recur 8+ times in 90d, max={max_count}"

    def test_includes_by_appointment_classes(self, s):
        r = s.get(f"{BASE_URL}/api/classes?days=365&include_ended=true", timeout=60)
        classes = r.json()["classes"]
        appt = [c for c in classes if c.get("by_appointment")]
        assert appt, "Expected at least one by_appointment class (e.g., Personal Training)"


# ---------- feature 2: Schedule Exceptions hide Kids classes during holidays ----------
class TestQLDHolidayExceptions:
    def _instances_in_range(self, classes, start_d, end_d, category=None):
        out = []
        for c in classes:
            if c.get("by_appointment"):
                continue
            if category and c.get("category") != category:
                continue
            sa = c.get("start_at")
            if not sa:
                continue
            try:
                dt = datetime.fromisoformat(sa.replace("Z", "+00:00")) if isinstance(sa, str) else sa
            except Exception:
                continue
            d = (dt.date() if hasattr(dt, "date") else dt)
            if start_d <= d <= end_d:
                out.append(c)
        return out

    def test_zero_kids_classes_during_qld_t3(self, s):
        r = s.get(f"{BASE_URL}/api/classes?days=365&include_ended=true&category=Kids", timeout=60)
        assert r.status_code == 200
        classes = r.json()["classes"]
        hit = self._instances_in_range(classes, QLD_T3_START, QLD_T3_END, "Kids")
        assert hit == [], f"Kids classes should be hidden during {QLD_T3_START}..{QLD_T3_END}, got {len(hit)}: {[c.get('class_id') for c in hit[:3]]}"

    def test_adults_still_run_during_qld_t3(self, s):
        r = s.get(f"{BASE_URL}/api/classes?days=365&include_ended=true&category=Adults", timeout=60)
        assert r.status_code == 200
        classes = r.json()["classes"]
        hit = self._instances_in_range(classes, QLD_T3_START, QLD_T3_END, "Adults")
        assert len(hit) > 0, "Adults classes should still run during Kids holiday exception"


# ---------- feature 3: /api/classes/{class_id} resolves virtual ids ----------
class TestClassDetailVirtual:
    def _pick_upcoming(self, classes, category, exclude_dates=()):
        for c in classes:
            if c.get("by_appointment"):
                continue
            if c.get("category") != category:
                continue
            cid = c.get("class_id", "")
            if "__" not in cid:
                continue
            d = cid.split("__")[1]
            if d in exclude_dates:
                continue
            return c
        return None

    def test_resolve_virtual_adults_instance(self, s):
        r = s.get(f"{BASE_URL}/api/classes?days=365&include_ended=true&category=Adults", timeout=60)
        cls_ = self._pick_upcoming(r.json()["classes"], "Adults")
        assert cls_, "no Adults virtual instance found to test"
        cid = cls_["class_id"]
        rr = s.get(f"{BASE_URL}/api/classes/{cid}", timeout=30)
        assert rr.status_code == 200, rr.text[:300]
        got = rr.json()
        assert got.get("class_id") == cid
        assert got.get("name") == cls_["name"]

    def test_blocked_kids_date_returns_404(self, s):
        # Find any Kids template, then hand-craft an instance id on a blocked date.
        r = s.get(f"{BASE_URL}/api/classes?days=30&include_ended=true", timeout=60)
        kids = next(
            (c for c in r.json()["classes"]
             if c.get("category") == "Kids" and "__" in c.get("class_id", "")),
            None,
        )
        assert kids, "no Kids virtual instance found to derive template_id"
        tmpl_id = kids["class_id"].split("__")[0]
        # Any date in QLD Term 3 window regardless of weekday — _resolve_class only
        # checks the exception hit, not weekday match, so this is the direct check.
        blocked_id = f"{tmpl_id}__{QLD_T3_START.isoformat()}"
        rr = s.get(f"{BASE_URL}/api/classes/{blocked_id}", timeout=30)
        assert rr.status_code == 404, f"expected 404 for blocked Kids date, got {rr.status_code}: {rr.text[:200]}"


# ---------- feature 4: Booking materializes real class doc ----------
class TestBookingMaterialization:
    def test_book_virtual_instance_creates_pending(self, s, member_token):
        # Pick an upcoming Adults virtual instance (member has passes).
        r = s.get(f"{BASE_URL}/api/classes?days=60&include_ended=false&category=Adults", timeout=60)
        cls_ = next(
            (c for c in r.json()["classes"]
             if not c.get("by_appointment") and "__" in c.get("class_id", "")
             and not c.get("started") and not c.get("ended")),
            None,
        )
        assert cls_, "no upcoming Adults virtual instance available for booking test"
        cid = cls_["class_id"]

        # Ensure no dupe (best-effort clear via cancel if exists is complex; use a unique instance).
        rr = s.post(
            f"{BASE_URL}/api/bookings",
            json={"class_id": cid},
            headers=_auth(member_token),
            timeout=30,
        )
        assert rr.status_code == 200, f"booking failed: {rr.status_code} {rr.text[:300]}"
        bk = rr.json().get("booking", {})
        assert bk.get("class_id") == cid
        assert bk.get("status") in ("pending", "paid", "confirmed")
        booking_id = bk.get("booking_id")

        # Verify class was materialized (subsequent GET returns 200 even if exception applied later).
        detail = s.get(f"{BASE_URL}/api/classes/{cid}", timeout=30)
        assert detail.status_code == 200, "materialized class should be fetchable"

        # Cleanup: cancel the booking so the test is repeatable.
        s.post(
            f"{BASE_URL}/api/bookings/{booking_id}/cancel",
            headers=_auth(member_token),
            timeout=30,
        )

    def test_booking_blocked_kids_date_rejected(self, s, member_token):
        r = s.get(f"{BASE_URL}/api/classes?days=30&include_ended=true", timeout=60)
        kids = next(
            (c for c in r.json()["classes"]
             if c.get("category") == "Kids" and "__" in c.get("class_id", "")),
            None,
        )
        assert kids, "no Kids virtual instance found"
        tmpl_id = kids["class_id"].split("__")[0]
        blocked_id = f"{tmpl_id}__{QLD_T3_START.isoformat()}"
        rr = s.post(
            f"{BASE_URL}/api/bookings",
            json={"class_id": blocked_id, "child_age": 10, "child_name": "TEST Kid"},
            headers=_auth(member_token),
            timeout=30,
        )
        assert rr.status_code in (404, 409), (
            f"expected 404/409 for blocked Kids booking, got {rr.status_code}: {rr.text[:200]}"
        )


# ---------- feature 5: Admin Schedule Exceptions CRUD ----------
class TestAdminScheduleExceptionsCRUD:
    def test_non_admin_forbidden(self, s, member_token):
        r = s.get(f"{BASE_URL}/api/admin/schedule-exceptions", headers=_auth(member_token), timeout=30)
        assert r.status_code in (401, 403), f"non-admin should be blocked, got {r.status_code}"

    def test_unauthenticated_forbidden(self, s):
        r = s.get(f"{BASE_URL}/api/admin/schedule-exceptions", timeout=30)
        assert r.status_code in (401, 403)

    def test_list_returns_metadata(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/admin/schedule-exceptions", headers=_auth(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "exceptions" in data
        assert "categories" in data
        assert "class_names" in data
        assert isinstance(data["categories"], list)
        assert isinstance(data["class_names"], list)
        # Should include seeded QLD holidays
        labels = [e.get("label", "") for e in data["exceptions"]]
        assert any("QLD" in l for l in labels), "expected seeded QLD holiday exceptions"

    def test_crud_flow_single_and_range_active_toggle(self, s, admin_token):
        # CREATE single-date (only start_date)
        payload_single = {
            "label": "TEST_single_exc",
            "start_date": "2027-03-15",
            "scope": "selected",
            "categories": ["Kids"],
            "active": True,
        }
        r = s.post(
            f"{BASE_URL}/api/admin/schedule-exceptions",
            json=payload_single,
            headers=_auth(admin_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        e1 = r.json()["exception"]
        assert e1["start_date"] == "2027-03-15"
        assert e1["end_date"] == "2027-03-15", "end_date should default to start_date for single-day"
        assert e1["active"] is True
        eid1 = e1["exception_id"]

        # CREATE range
        payload_range = {
            "label": "TEST_range_exc",
            "start_date": "2027-04-01",
            "end_date": "2027-04-07",
            "scope": "all",
            "active": True,
        }
        r2 = s.post(
            f"{BASE_URL}/api/admin/schedule-exceptions",
            json=payload_range,
            headers=_auth(admin_token),
            timeout=30,
        )
        assert r2.status_code == 200
        e2 = r2.json()["exception"]
        eid2 = e2["exception_id"]

        # Verify it's blocking classes (all-scope means no classes in that week)
        cls_r = s.get(f"{BASE_URL}/api/classes?days=365&include_ended=true", timeout=60)
        classes = cls_r.json()["classes"]
        blocked_range = [
            c for c in classes
            if not c.get("by_appointment") and "__" in c.get("class_id", "")
            and "2027-04-01" <= c["class_id"].split("__")[1] <= "2027-04-07"
        ]
        assert blocked_range == [], f"scope=all exception should hide all classes, got {len(blocked_range)}"

        # PUT — toggle active=false and verify classes reappear
        payload_range["active"] = False
        r3 = s.put(
            f"{BASE_URL}/api/admin/schedule-exceptions/{eid2}",
            json=payload_range,
            headers=_auth(admin_token),
            timeout=30,
        )
        assert r3.status_code == 200
        assert r3.json()["exception"]["active"] is False

        cls_r2 = s.get(f"{BASE_URL}/api/classes?days=365&include_ended=true", timeout=60)
        classes2 = cls_r2.json()["classes"]
        reopened = [
            c for c in classes2
            if not c.get("by_appointment") and "__" in c.get("class_id", "")
            and "2027-04-01" <= c["class_id"].split("__")[1] <= "2027-04-07"
        ]
        assert len(reopened) > 0, "active=false exception should not hide classes"

        # DELETE both
        for eid in (eid1, eid2):
            rd = s.delete(
                f"{BASE_URL}/api/admin/schedule-exceptions/{eid}",
                headers=_auth(admin_token),
                timeout=30,
            )
            assert rd.status_code == 200

        # Verify deletion
        r_final = s.get(f"{BASE_URL}/api/admin/schedule-exceptions", headers=_auth(admin_token), timeout=30)
        remaining = [e for e in r_final.json()["exceptions"] if e["exception_id"] in (eid1, eid2)]
        assert remaining == [], "deleted exceptions should not remain"


# ---------- feature 6: Admin classes backed by templates ----------
class TestAdminClassesTemplates:
    def test_admin_classes_returns_templates(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/admin/classes", headers=_auth(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        classes = r.json()["classes"]
        templates = [c for c in classes if c.get("is_template")]
        assert len(templates) > 0, "expected recurring templates"
        for t in templates[:5]:
            assert "weekday" in t
            assert "start_time" in t
            assert t.get("recurring") is True
        # By-appointment classes still returned
        appt = [c for c in classes if c.get("by_appointment")]
        assert appt, "expected by_appointment classes in admin list"

    def test_create_edit_delete_recurring_template(self, s, admin_token):
        # Compute a start_at 5 days ahead at 09:15
        future = datetime.utcnow() + timedelta(days=5)
        future = future.replace(hour=9, minute=15, second=0, microsecond=0)
        payload = {
            "name": "TEST_Recurring",
            "trainer": "Coach Test",
            "category": "Adults",
            "level": "Any level",
            "duration_min": 45,
            "price_cents": 2000,
            "capacity": 10,
            "start_at": future.isoformat(),
            "description": "TEST recurring template",
        }
        r = s.post(f"{BASE_URL}/api/admin/classes", json=payload, headers=_auth(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        cls = r.json()["class"]
        assert cls.get("is_template") is True
        assert cls.get("weekday") == future.weekday()
        assert int(cls.get("hour")) == 9 and int(cls.get("minute")) == 15
        tid = cls["class_id"]
        assert tid.startswith("tmpl_")

        # EDIT
        payload["price_cents"] = 2500
        payload["capacity"] = 12
        r2 = s.put(f"{BASE_URL}/api/admin/classes/{tid}", json=payload, headers=_auth(admin_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["class"]["price_cents"] == 2500

        # CANCEL on template -> 400 with helpful message
        rc = s.post(
            f"{BASE_URL}/api/admin/classes/{tid}/cancel",
            json={"reason": "test", "auto_return_passes": False},
            headers=_auth(admin_token),
            timeout=30,
        )
        assert rc.status_code == 400, f"expected 400 on recurring cancel, got {rc.status_code}"
        assert "recurring" in rc.text.lower() or "closed date" in rc.text.lower() or "exception" in rc.text.lower()

        # DELETE
        rd = s.delete(f"{BASE_URL}/api/admin/classes/{tid}", headers=_auth(admin_token), timeout=30)
        assert rd.status_code == 200

        # Ensure gone
        r_after = s.get(f"{BASE_URL}/api/admin/classes", headers=_auth(admin_token), timeout=30)
        remaining = [c for c in r_after.json()["classes"] if c.get("class_id") == tid]
        assert remaining == []


# ---------- feature 7: Regression ----------
class TestRegression:
    def test_my_bookings_list(self, s, member_token):
        r = s.get(f"{BASE_URL}/api/bookings", headers=_auth(member_token), timeout=30)
        assert r.status_code == 200
        assert "bookings" in r.json()

    def test_admin_overview_has_bug_reports_open(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/admin/overview", headers=_auth(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "bug_reports_open" in data
        assert isinstance(data["bug_reports_open"], int)
        # Also sanity check that classes count is populated
        assert "classes" in data
