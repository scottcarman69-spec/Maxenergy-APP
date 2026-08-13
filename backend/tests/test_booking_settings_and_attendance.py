"""Backend tests for the NEW features added in this iteration:
  1. GET /api/admin/settings  (returns {cancel_window_hours}; default 24 when unset)
  2. PUT /api/admin/settings  (validates 1..168; persists; admin only)
  3. GET /api/settings/booking (any authenticated member)
  4. Admin guards on /api/admin/settings (403 for non-admin)
  5. GET /api/admin/attendance/roster (admin) — structure of sessions & totals
  6. Cancel/Reschedule endpoints reflect configured window_hours in error copy
  7. Regression: GET /api/classes still exposes spots_left + capacity for fixed-time classes
"""
import pytest


ADMIN_EMAIL = "admin@maxenergy.com.au"
ADMIN_PASSWORD = "MaxAdmin123!"
MEMBER_EMAIL = "testmember@gmail.com"
MEMBER_PASSWORD = "Test!1234"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token(api_client, base_url):
    r = api_client.post(f"{base_url}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    d = r.json()
    assert d["user"].get("is_admin") is True
    return d["token"]


@pytest.fixture(scope="module")
def member_token(api_client, base_url):
    r = api_client.post(f"{base_url}/api/auth/login",
                        json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD})
    assert r.status_code == 200, f"Member login failed: {r.text}"
    d = r.json()
    assert d["user"].get("is_admin") is False
    return d["token"]


@pytest.fixture(scope="module", autouse=True)
def _reset_cancel_window(api_client, base_url, admin_token):
    """Always leave cancel_window_hours = 24 when tests finish."""
    yield
    api_client.put(f"{base_url}/api/admin/settings",
                   json={"cancel_window_hours": 24},
                   headers={"Authorization": f"Bearer {admin_token}"})


# ---------- Booking Settings ----------
class TestAdminBookingSettings:
    def test_admin_get_settings_returns_hours(self, api_client, base_url, admin_token):
        r = api_client.get(f"{base_url}/api/admin/settings",
                           headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "cancel_window_hours" in body
        assert isinstance(body["cancel_window_hours"], int)
        assert 1 <= body["cancel_window_hours"] <= 168

    def test_member_get_admin_settings_forbidden(self, api_client, base_url, member_token):
        r = api_client.get(f"{base_url}/api/admin/settings",
                           headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 403, r.text

    def test_member_put_admin_settings_forbidden(self, api_client, base_url, member_token):
        r = api_client.put(f"{base_url}/api/admin/settings",
                           json={"cancel_window_hours": 12},
                           headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 403, r.text

    def test_no_token_forbidden(self, api_client, base_url):
        r_get = api_client.get(f"{base_url}/api/admin/settings")
        r_put = api_client.put(f"{base_url}/api/admin/settings",
                               json={"cancel_window_hours": 12})
        assert r_get.status_code in (401, 403)
        assert r_put.status_code in (401, 403)

    @pytest.mark.parametrize("bad_value", [0, 200, -5, 169])
    def test_admin_put_invalid_values_400(self, api_client, base_url, admin_token, bad_value):
        r = api_client.put(f"{base_url}/api/admin/settings",
                           json={"cancel_window_hours": bad_value},
                           headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 400, f"Expected 400 for {bad_value}, got {r.status_code}: {r.text}"

    def test_admin_put_valid_persists_and_is_readable(self, api_client, base_url, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        # set to 48
        r = api_client.put(f"{base_url}/api/admin/settings",
                           json={"cancel_window_hours": 48}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        assert r.json().get("cancel_window_hours") == 48
        # verify via admin GET
        g = api_client.get(f"{base_url}/api/admin/settings", headers=h)
        assert g.status_code == 200
        assert g.json()["cancel_window_hours"] == 48
        # verify via member GET
        r2 = api_client.put(f"{base_url}/api/admin/settings",
                            json={"cancel_window_hours": 24}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["cancel_window_hours"] == 24


class TestMemberBookingSettings:
    def test_settings_booking_authed(self, api_client, base_url, member_token):
        r = api_client.get(f"{base_url}/api/settings/booking",
                           headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "cancel_window_hours" in body
        assert isinstance(body["cancel_window_hours"], int)

    def test_settings_booking_unauth_rejected(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/settings/booking")
        assert r.status_code in (401, 403)

    def test_settings_booking_reflects_admin_change(self, api_client, base_url, admin_token, member_token):
        ah = {"Authorization": f"Bearer {admin_token}"}
        mh = {"Authorization": f"Bearer {member_token}"}
        # Set to 48
        api_client.put(f"{base_url}/api/admin/settings",
                       json={"cancel_window_hours": 48}, headers=ah)
        r = api_client.get(f"{base_url}/api/settings/booking", headers=mh)
        assert r.status_code == 200
        assert r.json()["cancel_window_hours"] == 48
        # Set to 12
        api_client.put(f"{base_url}/api/admin/settings",
                       json={"cancel_window_hours": 12}, headers=ah)
        r = api_client.get(f"{base_url}/api/settings/booking", headers=mh)
        assert r.status_code == 200
        assert r.json()["cancel_window_hours"] == 12
        # reset
        api_client.put(f"{base_url}/api/admin/settings",
                       json={"cancel_window_hours": 24}, headers=ah)


# ---------- Attendance roster ----------
class TestAttendanceRoster:
    def test_admin_roster_shape(self, api_client, base_url, admin_token):
        r = api_client.get(f"{base_url}/api/admin/attendance/roster",
                           headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "sessions" in body and isinstance(body["sessions"], list)
        assert "totals" in body and isinstance(body["totals"], dict)
        for k in ("attended", "no_shows", "sessions"):
            assert k in body["totals"] and isinstance(body["totals"][k], int)
        # sessions field checks
        for s in body["sessions"]:
            for k in ("class_name", "date", "time", "attended", "no_shows",
                      "attended_count", "no_show_count", "booked_count"):
                assert k in s, f"missing {k} in session {s}"
            assert isinstance(s["attended"], list)
            assert isinstance(s["no_shows"], list)
            assert s["booked_count"] == s["attended_count"] + s["no_show_count"]
        # totals.sessions matches list length (may be capped at 120)
        assert body["totals"]["sessions"] == len(body["sessions"])

    def test_member_roster_forbidden(self, api_client, base_url, member_token):
        r = api_client.get(f"{base_url}/api/admin/attendance/roster",
                           headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 403


# ---------- Cancel/Reschedule dynamic-window error copy ----------
class TestCancelWindowIsDynamic:
    def _first_upcoming_class_booking(self, api_client, base_url, member_token):
        r = api_client.get(f"{base_url}/api/bookings",
                           headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 200
        bookings = r.json()["bookings"]
        # non-appointment, not-cancelled
        for b in bookings:
            if b.get("by_appointment"):
                continue
            if b.get("status") in ("cancelled",):
                continue
            return b
        return None

    def test_reschedule_error_mentions_configured_hours(self, api_client, base_url, admin_token, member_token):
        """Set window very large (168h) then try a reschedule to 'now-ish' → 409 mentioning 168."""
        ah = {"Authorization": f"Bearer {admin_token}"}
        mh = {"Authorization": f"Bearer {member_token}"}
        # Push window to 168
        r = api_client.put(f"{base_url}/api/admin/settings",
                           json={"cancel_window_hours": 168}, headers=ah)
        assert r.status_code == 200
        try:
            b = self._first_upcoming_class_booking(api_client, base_url, member_token)
            if not b:
                pytest.skip("No upcoming class booking for testmember")
            # Try to reschedule to a time only 1 hour from now (well within 168h) → should reject
            from datetime import datetime, timedelta, timezone
            # requested_at is naive Queensland local time (server does now_utc + 10h)
            target_local = (datetime.now(timezone.utc) + timedelta(hours=10) + timedelta(hours=1))
            requested_at = target_local.replace(tzinfo=None, second=0, microsecond=0).isoformat()
            payload = {
                "requested_time": "Test dynamic-window copy",
                "requested_at": requested_at,
                "note": "TEST_dynamic_window",
            }
            rr = api_client.post(f"{base_url}/api/bookings/{b['booking_id']}/reschedule",
                                 json=payload, headers=mh)
            # Booking might already be reschedule_requested from an earlier run → 409 with a different message.
            # Accept either: 409 mentioning 168, or 409 saying "already have a reschedule request pending".
            assert rr.status_code == 409, rr.text
            detail = rr.json().get("detail", "")
            assert ("168 hours" in detail) or ("reschedule request pending" in detail.lower()), \
                f"Expected dynamic-window copy or pending-request copy, got: {detail}"
        finally:
            api_client.put(f"{base_url}/api/admin/settings",
                           json={"cancel_window_hours": 24}, headers=ah)

    def test_reschedule_still_works_within_policy(self, api_client, base_url, admin_token, member_token):
        """With window=24 (default) and an upcoming booking >24h out, reschedule to a safe time should succeed."""
        ah = {"Authorization": f"Bearer {admin_token}"}
        mh = {"Authorization": f"Bearer {member_token}"}
        # Ensure window is 24
        api_client.put(f"{base_url}/api/admin/settings",
                       json={"cancel_window_hours": 24}, headers=ah)

        b = self._first_upcoming_class_booking(api_client, base_url, member_token)
        if not b:
            pytest.skip("No upcoming class booking for testmember")
        # If already in reschedule_requested, expect 409 pending-message rather than failure
        from datetime import datetime, timedelta, timezone
        safe_local = (datetime.now(timezone.utc) + timedelta(hours=10) + timedelta(hours=72))
        requested_at = safe_local.replace(tzinfo=None, second=0, microsecond=0).isoformat()
        payload = {
            "requested_time": "TEST_safe reschedule",
            "requested_at": requested_at,
            "note": "TEST_safe_window",
        }
        rr = api_client.post(f"{base_url}/api/bookings/{b['booking_id']}/reschedule",
                             json=payload, headers=mh)
        assert rr.status_code in (200, 409), rr.text
        if rr.status_code == 409:
            assert "pending" in rr.json().get("detail", "").lower()
        else:
            # Verify persisted
            g = api_client.get(f"{base_url}/api/bookings", headers=mh)
            updated = next(x for x in g.json()["bookings"] if x["booking_id"] == b["booking_id"])
            assert updated["status"] == "reschedule_requested"


# ---------- Regression: /api/classes exposes spots_left ----------
class TestClassesSpotsLeft:
    def test_classes_have_spots_left_and_capacity(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/classes")
        assert r.status_code == 200
        rows = r.json()["classes"]
        # Only fixed-time classes (by_appointment != true) must expose spots_left+capacity
        fixed = [c for c in rows if not c.get("by_appointment")]
        assert len(fixed) > 0, "No fixed-time classes returned"
        for c in fixed[:10]:
            assert "capacity" in c, f"capacity missing on class {c.get('class_id')}"
            assert "spots_left" in c, f"spots_left missing on class {c.get('class_id')}"
            assert isinstance(c["capacity"], int) and c["capacity"] > 0
            assert isinstance(c["spots_left"], int) and c["spots_left"] >= 0
            assert c["spots_left"] <= c["capacity"]
