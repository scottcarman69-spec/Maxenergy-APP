"""Backend tests for the NEW booking-management & second-admin features:
- Second admin seed & login (info@maxenergy.com.au / maxenergy12@)
- Member: POST /api/bookings/{id}/cancel and /reschedule
- Admin: GET /api/admin/bookings, POST /accept, /cancel, /reschedule
- Admin: PUT /api/admin/announcements/{id} (edit notice)
- Notifications persisted for member on each action
"""
import uuid
import pytest


ADMIN2_EMAIL = "info@maxenergy.com.au"
ADMIN2_PASSWORD = "maxenergy12@"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin2_token(api_client, base_url):
    r = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": ADMIN2_EMAIL, "password": ADMIN2_PASSWORD},
    )
    assert r.status_code == 200, f"info@ admin login failed: {r.status_code} {r.text}"
    d = r.json()
    assert d["user"]["is_admin"] is True, f"info@ not admin: {d['user']}"
    return d["token"]


@pytest.fixture(scope="module")
def primary_admin_token(api_client, base_url):
    r = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": "admin@maxenergy.com.au", "password": "MaxAdmin123!"},
    )
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def member(api_client, base_url):
    email = f"test_bkfeat_{uuid.uuid4().hex[:8]}@gmail.com"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"name": "BK Feat Member", "email": email, "password": "MemberPass123!"},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "user": d["user"]}


def _mheaders(m):
    return {"Authorization": f"Bearer {m['token']}"}


def _aheaders(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Second admin ----------
class TestSecondAdmin:
    def test_second_admin_login_ok(self, admin2_token):
        assert admin2_token

    def test_second_admin_me_is_admin(self, api_client, base_url, admin2_token):
        r = api_client.get(f"{base_url}/api/auth/me", headers=_aheaders(admin2_token))
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == ADMIN2_EMAIL
        assert u["is_admin"] is True


# ---------- Member cancel / reschedule ----------
class TestMemberBookingActions:
    @pytest.fixture(scope="class")
    def booking_ids(self, api_client, base_url, member):
        # Create two bookings across TWO different classes because backend
        # dedupes pending bookings per (user, class).
        cls = api_client.get(f"{base_url}/api/classes").json()["classes"]
        assert len(cls) >= 2, "Need at least 2 seeded classes"
        ids = []
        for c in cls[:2]:
            b = api_client.post(
                f"{base_url}/api/bookings", json={"class_id": c["class_id"]}, headers=_mheaders(member)
            )
            assert b.status_code == 200, b.text
            ids.append(b.json()["booking"]["booking_id"])
        assert ids[0] != ids[1], "Dedup should have produced distinct booking IDs across different classes"
        return ids

    def test_member_cancel(self, api_client, base_url, member, booking_ids):
        bid = booking_ids[0]
        r = api_client.post(
            f"{base_url}/api/bookings/{bid}/cancel", headers=_mheaders(member)
        )
        assert r.status_code == 200, r.text
        assert r.json()["booking"]["status"] == "cancelled"

        # Verify via GET /bookings
        lst = api_client.get(f"{base_url}/api/bookings", headers=_mheaders(member)).json()["bookings"]
        row = next(x for x in lst if x["booking_id"] == bid)
        assert row["status"] == "cancelled"

        # Notification created
        n = api_client.get(f"{base_url}/api/notifications", headers=_mheaders(member)).json()["notifications"]
        assert any("cancel" in x["title"].lower() for x in n), [x["title"] for x in n]

    def test_member_reschedule(self, api_client, base_url, member, booking_ids):
        bid = booking_ids[1]
        r = api_client.post(
            f"{base_url}/api/bookings/{bid}/reschedule",
            json={"requested_time": "Tuesday 7:00pm", "note": "prefer evening"},
            headers=_mheaders(member),
        )
        assert r.status_code == 200, r.text
        body = r.json()["booking"]
        assert body["status"] == "reschedule_requested"
        assert body["requested_time"] == "Tuesday 7:00pm"

        # Notification present
        n = api_client.get(f"{base_url}/api/notifications", headers=_mheaders(member)).json()["notifications"]
        assert any("reschedule" in x["title"].lower() for x in n)

    def test_cancel_nonexistent_returns_404(self, api_client, base_url, member):
        r = api_client.post(
            f"{base_url}/api/bookings/bkg_does_not_exist/cancel",
            headers=_mheaders(member),
        )
        assert r.status_code == 404

    def test_cancelled_cannot_reschedule(self, api_client, base_url, member, booking_ids):
        bid = booking_ids[0]  # already cancelled
        r = api_client.post(
            f"{base_url}/api/bookings/{bid}/reschedule",
            json={"requested_time": "Wed 5pm"},
            headers=_mheaders(member),
        )
        assert r.status_code == 400


# ---------- Admin booking management ----------
class TestAdminBookings:
    @pytest.fixture(scope="class")
    def prepared_bookings(self, api_client, base_url, member):
        cls = api_client.get(f"{base_url}/api/classes").json()["classes"]
        assert len(cls) >= 3, "Need at least 3 seeded classes"
        # Booking A - to accept
        a = api_client.post(f"{base_url}/api/bookings", json={"class_id": cls[2]["class_id"]}, headers=_mheaders(member))
        # Booking B - to reschedule (member then requests reschedule -> admin confirms)
        b = api_client.post(f"{base_url}/api/bookings", json={"class_id": cls[3]["class_id"] if len(cls) > 3 else cls[2]["class_id"]}, headers=_mheaders(member))
        # Booking C - to admin-cancel
        c = api_client.post(f"{base_url}/api/bookings", json={"class_id": cls[4]["class_id"] if len(cls) > 4 else cls[2]["class_id"]}, headers=_mheaders(member))
        assert a.status_code == 200 and b.status_code == 200 and c.status_code == 200
        bid_b = b.json()["booking"]["booking_id"]
        # Member requests reschedule on booking B
        rr = api_client.post(
            f"{base_url}/api/bookings/{bid_b}/reschedule",
            json={"requested_time": "Friday 6pm"},
            headers=_mheaders(member),
        )
        assert rr.status_code == 200
        return {
            "accept": a.json()["booking"]["booking_id"],
            "reschedule": bid_b,
            "cancel": c.json()["booking"]["booking_id"],
        }

    def test_list_bookings_enriched(self, api_client, base_url, admin2_token, prepared_bookings, member):
        r = api_client.get(f"{base_url}/api/admin/bookings", headers=_aheaders(admin2_token))
        assert r.status_code == 200
        rows = r.json()["bookings"]
        assert len(rows) >= 3
        # Every row should have member fields
        for row in rows:
            assert "member_name" in row
            assert "member_email" in row
        # Our created bookings visible
        ids = {r["booking_id"] for r in rows}
        for k in prepared_bookings.values():
            assert k in ids, f"missing {k}"
        # Booking B enriched with member email matching test member
        our = next(r for r in rows if r["booking_id"] == prepared_bookings["reschedule"])
        assert our["member_email"] == member["email"]
        assert our["status"] == "reschedule_requested"
        assert our.get("requested_time") == "Friday 6pm"

    def test_admin_accept(self, api_client, base_url, admin2_token, prepared_bookings, member):
        bid = prepared_bookings["accept"]
        r = api_client.post(
            f"{base_url}/api/admin/bookings/{bid}/accept", headers=_aheaders(admin2_token)
        )
        assert r.status_code == 200, r.text
        # Verify status update via admin list
        rows = api_client.get(f"{base_url}/api/admin/bookings", headers=_aheaders(admin2_token)).json()["bookings"]
        row = next(x for x in rows if x["booking_id"] == bid)
        assert row["status"] == "confirmed"
        # Notification to member
        n = api_client.get(f"{base_url}/api/notifications", headers=_mheaders(member)).json()["notifications"]
        assert any("accept" in x["title"].lower() for x in n)

    def test_admin_reschedule_confirms(self, api_client, base_url, admin2_token, prepared_bookings, member):
        bid = prepared_bookings["reschedule"]
        r = api_client.post(
            f"{base_url}/api/admin/bookings/{bid}/reschedule",
            json={"new_time": "Saturday 10:00am", "note": "confirmed by coach"},
            headers=_aheaders(admin2_token),
        )
        assert r.status_code == 200, r.text
        rows = api_client.get(f"{base_url}/api/admin/bookings", headers=_aheaders(admin2_token)).json()["bookings"]
        row = next(x for x in rows if x["booking_id"] == bid)
        assert row["status"] == "confirmed"
        assert row.get("scheduled_time") == "Saturday 10:00am"
        # Member notification
        n = api_client.get(f"{base_url}/api/notifications", headers=_mheaders(member)).json()["notifications"]
        assert any("reschedul" in x["title"].lower() and "confirm" in x["title"].lower() for x in n) or \
               any("Saturday 10:00am" in x["body"] for x in n)

    def test_admin_cancel(self, api_client, base_url, admin2_token, prepared_bookings, member):
        bid = prepared_bookings["cancel"]
        r = api_client.post(
            f"{base_url}/api/admin/bookings/{bid}/cancel", headers=_aheaders(admin2_token)
        )
        assert r.status_code == 200, r.text
        rows = api_client.get(f"{base_url}/api/admin/bookings", headers=_aheaders(admin2_token)).json()["bookings"]
        row = next(x for x in rows if x["booking_id"] == bid)
        assert row["status"] == "cancelled"

    def test_admin_bookings_requires_admin(self, api_client, base_url, member):
        r = api_client.get(f"{base_url}/api/admin/bookings", headers=_mheaders(member))
        assert r.status_code == 403


# ---------- Announcement edit (PUT) ----------
class TestAnnouncementEdit:
    def test_edit_announcement(self, api_client, base_url, primary_admin_token):
        h = _aheaders(primary_admin_token)
        # Create
        c = api_client.post(
            f"{base_url}/api/admin/announcements",
            json={"title": "TEST_EDIT_ORIG", "body": "orig", "pinned": False},
            headers=h,
        )
        assert c.status_code == 200
        aid = c.json()["announcement"]["announcement_id"]
        # Edit
        u = api_client.put(
            f"{base_url}/api/admin/announcements/{aid}",
            json={"title": "TEST_EDIT_UPDATED", "body": "updated body", "pinned": True},
            headers=h,
        )
        assert u.status_code == 200, u.text
        upd = u.json()["announcement"]
        assert upd["title"] == "TEST_EDIT_UPDATED"
        assert upd["body"] == "updated body"
        assert upd["pinned"] is True
        # Public list reflects update
        pub = api_client.get(f"{base_url}/api/announcements").json()["announcements"]
        row = next(a for a in pub if a["announcement_id"] == aid)
        assert row["title"] == "TEST_EDIT_UPDATED"
        # Cleanup
        d = api_client.delete(f"{base_url}/api/admin/announcements/{aid}", headers=h)
        assert d.status_code == 200

    def test_edit_missing_returns_404(self, api_client, base_url, primary_admin_token):
        r = api_client.put(
            f"{base_url}/api/admin/announcements/does_not_exist",
            json={"title": "x", "body": "y", "pinned": False},
            headers=_aheaders(primary_admin_token),
        )
        assert r.status_code == 404
