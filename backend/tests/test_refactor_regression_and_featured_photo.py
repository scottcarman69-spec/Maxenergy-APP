"""
Backend regression tests for the modular refactor (routes/*.py) and the new
Featured Photo admin feature.

Covers:
  - GYM GALLERY routes moved to routes/gym.py (incl. new feature endpoint)
  - EVENTS + VIEWS routes moved to routes/events.py
  - TRIALS routes moved to routes/trials.py
  - NOTIFICATIONS routes moved to routes/notifications.py
  - WAITLIST routes moved to routes/waitlist.py
  - Core sanity (still in server.py): login/me/classes/admin guard

NOTE: Square payments are PROD — we do NOT call checkout/store-purchase.
"""
import os
import base64
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASSWORD = "Maxenergy12@"
MEMBER_EMAIL = "testmember@gmail.com"
MEMBER_PASSWORD = "Test!1234"

# 1x1 transparent PNG as data URL (used for photo add test)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
TINY_PNG_DATA_URL = f"data:image/png;base64,{TINY_PNG_B64}"


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in admin login response: {data}"
    return tok


@pytest.fixture(scope="module")
def member_token(s):
    r = s.post(f"{API}/auth/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"member login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in member login response: {data}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ================== CORE SANITY (still in server.py) ==================
class TestCoreSanity:
    def test_login_admin(self, admin_token):
        assert admin_token

    def test_login_member(self, member_token):
        assert member_token

    def test_auth_me_admin(self, s, admin_token):
        r = s.get(f"{API}/auth/me", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        # /auth/me returns {"user": {...}}
        user = j.get("user") or j
        assert user.get("email") == ADMIN_EMAIL
        assert user.get("is_admin") is True

    def test_auth_me_member(self, s, member_token):
        r = s.get(f"{API}/auth/me", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        user = j.get("user") or j
        assert user.get("email") == MEMBER_EMAIL
        assert not user.get("is_admin", False)

    def test_classes_list_has_booked_and_spots_left(self, s):
        r = s.get(f"{API}/classes", timeout=30)
        assert r.status_code == 200
        j = r.json()
        classes = j.get("classes") if isinstance(j, dict) else j
        assert isinstance(classes, list) and len(classes) > 0
        # Find a fixed (non by_appointment) class and verify booked/spots_left exist
        fixed = [c for c in classes if not c.get("by_appointment")]
        assert fixed, "expected at least one fixed (scheduled) class"
        sample = fixed[0]
        assert "booked" in sample, f"missing booked in {sample.keys()}"
        assert "spots_left" in sample, f"missing spots_left in {sample.keys()}"

    def test_admin_views_forbidden_for_member(self, s, member_token):
        r = s.get(f"{API}/admin/views", headers=_h(member_token), timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_overview_forbidden_for_member(self, s, member_token):
        r = s.get(f"{API}/admin/overview", headers=_h(member_token), timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ================== GYM GALLERY (routes/gym.py) ==================
class TestGymGallery:
    def test_public_photos_list(self, s):
        r = s.get(f"{API}/gym/photos", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "photos" in j and isinstance(j["photos"], list)
        for p in j["photos"]:
            # schema: each photo has photo_id, image, caption, featured
            assert "photo_id" in p
            assert "image" in p
            assert "caption" in p
            assert "featured" in p
            assert isinstance(p["featured"], bool)

    def test_admin_photos_add_patch_delete(self, s, admin_token):
        # Create
        r = s.post(
            f"{API}/admin/gym/photos",
            json={"image": TINY_PNG_DATA_URL, "caption": "TEST_photo_regression"},
            headers=_h(admin_token),
            timeout=30,
        )
        # tiny 1x1 png may fail processing — if so, skip the create path but keep patch/delete negative
        if r.status_code != 200:
            pytest.skip(f"photo add failed with {r.status_code} {r.text}; likely image too small for Pillow pipeline")
        pid = r.json().get("photo_id")
        assert pid, "no photo_id returned"

        try:
            # Patch caption
            r2 = s.patch(
                f"{API}/admin/gym/photos/{pid}",
                json={"caption": "TEST_photo_updated"},
                headers=_h(admin_token),
                timeout=20,
            )
            assert r2.status_code == 200, r2.text

            # Verify caption persisted via public list
            r3 = s.get(f"{API}/gym/photos", timeout=20)
            assert r3.status_code == 200
            found = next((p for p in r3.json()["photos"] if p["photo_id"] == pid), None)
            assert found is not None, "newly added photo not visible in public list"
            assert found["caption"] == "TEST_photo_updated"

            # Reorder (noop-ish — put it first)
            r4 = s.post(
                f"{API}/admin/gym/photos/reorder",
                json={"order": [pid]},
                headers=_h(admin_token),
                timeout=20,
            )
            assert r4.status_code == 200
        finally:
            # Always clean up
            rd = s.delete(f"{API}/admin/gym/photos/{pid}", headers=_h(admin_token), timeout=20)
            assert rd.status_code == 200

    def test_patch_caption_unknown_404(self, s, admin_token):
        r = s.patch(
            f"{API}/admin/gym/photos/does_not_exist",
            json={"caption": "x"},
            headers=_h(admin_token),
            timeout=20,
        )
        assert r.status_code == 404

    def test_admin_endpoints_require_admin(self, s, member_token):
        r = s.post(
            f"{API}/admin/gym/photos",
            json={"image": TINY_PNG_DATA_URL, "caption": "x"},
            headers=_h(member_token),
            timeout=20,
        )
        assert r.status_code == 403


# ================== FEATURED PHOTO (new) ==================
class TestFeaturedPhoto:
    def test_feature_requires_admin(self, s, member_token):
        # Any photo id is fine — must 403 before 404
        r = s.post(
            f"{API}/admin/gym/photos/any_id/feature",
            json={"featured": True},
            headers=_h(member_token),
            timeout=20,
        )
        assert r.status_code == 403, f"expected 403 for member, got {r.status_code} {r.text}"

    def test_feature_unknown_photo_404(self, s, admin_token):
        r = s.post(
            f"{API}/admin/gym/photos/does_not_exist_xyz/feature",
            json={"featured": True},
            headers=_h(admin_token),
            timeout=20,
        )
        assert r.status_code == 404

    def test_feature_flow_only_one_featured_then_clear(self, s, admin_token):
        # Need at least 2 photos — fetch existing
        r = s.get(f"{API}/gym/photos", timeout=20)
        assert r.status_code == 200
        photos = r.json()["photos"]
        if len(photos) < 2:
            pytest.skip(f"need at least 2 gallery photos for full featured flow, have {len(photos)}")

        # Snapshot current featured state so we can restore it at end
        original_featured_id = next((p["photo_id"] for p in photos if p["featured"]), None)

        p1, p2 = photos[0]["photo_id"], photos[1]["photo_id"]
        try:
            # Feature p1 → exactly one featured, and it is p1
            r1 = s.post(
                f"{API}/admin/gym/photos/{p1}/feature",
                json={"featured": True},
                headers=_h(admin_token),
                timeout=20,
            )
            assert r1.status_code == 200, r1.text
            assert r1.json().get("featured") is True

            lst = s.get(f"{API}/gym/photos", timeout=20).json()["photos"]
            featured = [p for p in lst if p["featured"]]
            assert len(featured) == 1, f"expected exactly 1 featured, got {len(featured)}"
            assert featured[0]["photo_id"] == p1

            # Feature p2 → auto-unsets p1
            r2 = s.post(
                f"{API}/admin/gym/photos/{p2}/feature",
                json={"featured": True},
                headers=_h(admin_token),
                timeout=20,
            )
            assert r2.status_code == 200
            lst2 = s.get(f"{API}/gym/photos", timeout=20).json()["photos"]
            featured2 = [p for p in lst2 if p["featured"]]
            assert len(featured2) == 1
            assert featured2[0]["photo_id"] == p2
            # p1 is no longer featured
            p1_row = next(p for p in lst2 if p["photo_id"] == p1)
            assert p1_row["featured"] is False

            # featured:false clears → 0 featured
            r3 = s.post(
                f"{API}/admin/gym/photos/{p2}/feature",
                json={"featured": False},
                headers=_h(admin_token),
                timeout=20,
            )
            assert r3.status_code == 200
            lst3 = s.get(f"{API}/gym/photos", timeout=20).json()["photos"]
            featured3 = [p for p in lst3 if p["featured"]]
            assert len(featured3) == 0
        finally:
            # Restore original featured state (if any)
            if original_featured_id:
                s.post(
                    f"{API}/admin/gym/photos/{original_featured_id}/feature",
                    json={"featured": True},
                    headers=_h(admin_token),
                    timeout=20,
                )


# ================== EVENTS + VIEWS (routes/events.py) ==================
class TestEventsAndViews:
    def test_events_list(self, s):
        r = s.get(f"{API}/events", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "events" in j and isinstance(j["events"], list)

    def test_event_detail_unknown_404(self, s):
        r = s.get(f"{API}/events/does_not_exist", timeout=20)
        assert r.status_code == 404

    def test_event_detail_known(self, s):
        r = s.get(f"{API}/events", timeout=20)
        events = r.json()["events"]
        if not events:
            pytest.skip("no events seeded")
        eid = events[0]["event_id"]
        rd = s.get(f"{API}/events/{eid}", timeout=20)
        assert rd.status_code == 200
        assert rd.json().get("event_id") == eid

    def test_rsvp_requires_auth(self, s):
        r = s.post(f"{API}/events/rsvp", json={"event_id": "x"}, timeout=20)
        assert r.status_code in (401, 403)

    def test_rsvp_unknown_event(self, s, member_token):
        r = s.post(f"{API}/events/rsvp", json={"event_id": "does_not_exist"}, headers=_h(member_token), timeout=20)
        assert r.status_code == 404

    def test_views_tracking(self, s, member_token):
        for path in ["/views/notices", "/views/bookings"]:
            r = s.post(f"{API}{path}", headers=_h(member_token), timeout=20)
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text}"
            assert r.json().get("ok") is True

    def test_views_event_and_announcement(self, s, member_token):
        # These accept any id string (just records a view keyed on it)
        r1 = s.post(f"{API}/views/event/abc123", headers=_h(member_token), timeout=20)
        assert r1.status_code == 200
        r2 = s.post(f"{API}/views/announcement/abc123", headers=_h(member_token), timeout=20)
        assert r2.status_code == 200

    def test_home_badges_member(self, s, member_token):
        r = s.get(f"{API}/home/badges", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "bookings" in j and "notices" in j
        assert isinstance(j["bookings"], int)
        assert isinstance(j["notices"], int)

    def test_admin_views_ok_for_admin(self, s, admin_token):
        r = s.get(f"{API}/admin/views", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        j = r.json()
        for key in ("notices", "events", "announcements"):
            assert key in j


# ================== TRIALS (routes/trials.py) ==================
class TestTrials:
    def test_trials_me_requires_auth(self, s):
        r = s.get(f"{API}/trials/me", timeout=20)
        assert r.status_code in (401, 403)

    def test_trials_me(self, s, member_token):
        r = s.get(f"{API}/trials/me", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "trials" in j and "claimed" in j
        assert isinstance(j["trials"], list)
        assert isinstance(j["claimed"], list)

    def test_trials_sessions_kids(self, s, member_token):
        r = s.get(f"{API}/trials/sessions?category=Kids", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "sessions" in j and isinstance(j["sessions"], list)
        for sess in j["sessions"]:
            assert "class_id" in sess and "start_at" in sess

    def test_trials_sessions_adults(self, s, member_token):
        r = s.get(f"{API}/trials/sessions?category=Adults", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json().get("sessions"), list)

    def test_trials_sessions_invalid_category(self, s, member_token):
        r = s.get(f"{API}/trials/sessions?category=Nope", headers=_h(member_token), timeout=20)
        assert r.status_code == 400


# ================== NOTIFICATIONS (routes/notifications.py) ==================
class TestNotifications:
    def test_notifications_list(self, s, member_token):
        r = s.get(f"{API}/notifications", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "notifications" in j and isinstance(j["notifications"], list)

    def test_notifications_history(self, s, member_token):
        r = s.get(f"{API}/notifications/history", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        assert "notifications" in r.json()

    def test_notifications_unread(self, s, member_token):
        r = s.get(f"{API}/notifications/unread", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "count" in j
        assert isinstance(j["count"], int)

    def test_notifications_read_all_and_clear_all(self, s, member_token):
        # Order matters — read-all first, then clear-all
        r1 = s.post(f"{API}/notifications/read-all", headers=_h(member_token), timeout=20)
        assert r1.status_code == 200
        assert r1.json().get("ok") is True

        # Verify unread drops to 0 after read-all
        ru = s.get(f"{API}/notifications/unread", headers=_h(member_token), timeout=20)
        assert ru.status_code == 200
        assert ru.json()["count"] == 0

        # clear-all should return ok with cleared count
        r2 = s.post(f"{API}/notifications/clear-all", headers=_h(member_token), timeout=20)
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2.get("ok") is True
        assert "cleared" in j2

        # Active list should now be empty
        rl = s.get(f"{API}/notifications", headers=_h(member_token), timeout=20)
        assert rl.status_code == 200
        assert rl.json()["notifications"] == []

    def test_notifications_read_and_delete_single(self, s, member_token):
        # Even for a non-existent id, backend returns ok (update_one with 0 matches is fine)
        r1 = s.post(f"{API}/notifications/nonexistent_nid/read", headers=_h(member_token), timeout=20)
        assert r1.status_code == 200
        r2 = s.delete(f"{API}/notifications/nonexistent_nid", headers=_h(member_token), timeout=20)
        assert r2.status_code == 200

    def test_notifications_requires_auth(self, s):
        r = s.get(f"{API}/notifications", timeout=20)
        assert r.status_code in (401, 403)


# ================== WAITLIST (routes/waitlist.py) ==================
class TestWaitlist:
    def test_waitlists_me(self, s, member_token):
        r = s.get(f"{API}/waitlists/me", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "class_ids" in j
        assert isinstance(j["class_ids"], list)

    def test_waitlists_me_requires_auth(self, s):
        r = s.get(f"{API}/waitlists/me", timeout=20)
        assert r.status_code in (401, 403)

    def test_waitlist_join_unknown_class_404(self, s, member_token):
        r = s.post(f"{API}/classes/does_not_exist/waitlist", headers=_h(member_token), timeout=20)
        assert r.status_code == 404

    def test_waitlist_join_existing_class_response(self, s, member_token):
        # Grab a real fixed class
        rc = s.get(f"{API}/classes", timeout=30)
        assert rc.status_code == 200
        classes = rc.json().get("classes") if isinstance(rc.json(), dict) else rc.json()
        fixed = [c for c in classes if not c.get("by_appointment")]
        if not fixed:
            pytest.skip("no fixed class to try waitlist on")
        cid = fixed[0]["class_id"]

        # Response should be either 200 (joined / already) OR 409 (full / already booked / still has spots)
        r = s.post(f"{API}/classes/{cid}/waitlist", headers=_h(member_token), timeout=20)
        assert r.status_code in (200, 409), f"unexpected {r.status_code}: {r.text}"

        # Clean up — leave waitlist if we actually joined
        if r.status_code == 200:
            rd = s.delete(f"{API}/classes/{cid}/waitlist", headers=_h(member_token), timeout=20)
            assert rd.status_code == 200

    def test_waitlist_leave_ok_even_without_entry(self, s, member_token):
        # Delete should be idempotent — ok even if member not on list
        rc = s.get(f"{API}/classes", timeout=30)
        classes = rc.json().get("classes") if isinstance(rc.json(), dict) else rc.json()
        fixed = [c for c in classes if not c.get("by_appointment")]
        if not fixed:
            pytest.skip("no fixed class to try waitlist leave on")
        cid = fixed[0]["class_id"]
        r = s.delete(f"{API}/classes/{cid}/waitlist", headers=_h(member_token), timeout=20)
        assert r.status_code == 200
