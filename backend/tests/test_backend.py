"""Backend integration tests for Maxenergy Fitness API.

Covers: auth (register/login/me/logout), classes, events, bookings,
Stripe checkout + status, event RSVP, notifications.
"""
import uuid
import time
import pytest


# ---------- Health ----------
class TestHealth:
    def test_root(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Auth ----------
@pytest.fixture(scope="module")
def user_ctx(api_client, base_url):
    email = f"TEST_user_{uuid.uuid4().hex[:10]}@example.com"
    password = "TestPass123!"
    name = "Test User"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == email.lower()
    return {"email": email, "password": password, "name": name,
            "token": data["token"], "user": data["user"]}


class TestAuth:
    def test_register_duplicate_returns_409(self, api_client, base_url, user_ctx):
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"name": user_ctx["name"], "email": user_ctx["email"],
                  "password": user_ctx["password"]},
        )
        assert r.status_code == 409

    def test_login_success(self, api_client, base_url, user_ctx):
        r = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": user_ctx["email"], "password": user_ctx["password"]},
        )
        assert r.status_code == 200
        d = r.json()
        assert "token" in d
        assert d["user"]["email"] == user_ctx["email"].lower()

    def test_login_wrong_password(self, api_client, base_url, user_ctx):
        r = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": user_ctx["email"], "password": "WrongPass!"},
        )
        assert r.status_code == 401

    def test_me_with_token(self, api_client, base_url, user_ctx):
        r = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {user_ctx['token']}"},
        )
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == user_ctx["email"].lower()
        assert "password_hash" not in u

    def test_me_without_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_logout(self, api_client, base_url, user_ctx):
        r = api_client.post(
            f"{base_url}/api/auth/logout",
            headers={"Authorization": f"Bearer {user_ctx['token']}"},
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Classes ----------
class TestClasses:
    def test_list_classes(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/classes")
        assert r.status_code == 200
        classes = r.json()["classes"]
        assert isinstance(classes, list)
        assert len(classes) >= 70, f"Expected >=70 classes, got {len(classes)}"
        first = classes[0]
        for k in ("class_id", "name", "trainer", "price_cents", "start_at"):
            assert k in first, f"Missing field {k}"

    def test_get_class_detail(self, api_client, base_url):
        classes = api_client.get(f"{base_url}/api/classes").json()["classes"]
        cid = classes[0]["class_id"]
        r = api_client.get(f"{base_url}/api/classes/{cid}")
        assert r.status_code == 200
        assert r.json()["class_id"] == cid

    def test_get_class_not_found(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/classes/cls_doesnotexist")
        assert r.status_code == 404


# ---------- Events ----------
class TestEvents:
    def test_list_events(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/events")
        assert r.status_code == 200
        events = r.json()["events"]
        assert len(events) >= 4
        assert "event_id" in events[0] and "title" in events[0]

    def test_get_event_detail(self, api_client, base_url):
        events = api_client.get(f"{base_url}/api/events").json()["events"]
        eid = events[0]["event_id"]
        r = api_client.get(f"{base_url}/api/events/{eid}")
        assert r.status_code == 200
        assert r.json()["event_id"] == eid


# ---------- Bookings ----------
class TestBookings:
    def test_bookings_require_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/bookings", json={"class_id": "x"})
        assert r.status_code == 401

    def test_booking_create_and_idempotent(self, api_client, base_url, user_ctx):
        # Fresh login token (logout invalidated the previous session for google but jwt still valid)
        login = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": user_ctx["email"], "password": user_ctx["password"]},
        ).json()
        token = login["token"]
        user_ctx["token"] = token
        classes = api_client.get(f"{base_url}/api/classes").json()["classes"]
        cid = classes[0]["class_id"]
        user_ctx["class_id"] = cid
        h = {"Authorization": f"Bearer {token}"}
        r1 = api_client.post(f"{base_url}/api/bookings", json={"class_id": cid}, headers=h)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()["booking"]
        assert b1["status"] == "pending"
        assert b1["class_id"] == cid
        user_ctx["booking_id"] = b1["booking_id"]
        # Idempotent
        r2 = api_client.post(f"{base_url}/api/bookings", json={"class_id": cid}, headers=h)
        assert r2.status_code == 200
        b2 = r2.json()["booking"]
        assert b2["booking_id"] == b1["booking_id"]


# ---------- Payments ----------
class TestPayments:
    def test_checkout_and_status(self, api_client, base_url, user_ctx):
        assert user_ctx.get("booking_id"), "prev test failed"
        h = {"Authorization": f"Bearer {user_ctx['token']}"}
        r = api_client.post(
            f"{base_url}/api/payments/checkout",
            json={"booking_id": user_ctx["booking_id"], "origin_url": base_url},
            headers=h,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("url", "").startswith("https://")
        assert d.get("session_id")
        user_ctx["session_id"] = d["session_id"]
        # status
        s = api_client.get(
            f"{base_url}/api/payments/status/{d['session_id']}",
            headers=h,
        )
        assert s.status_code == 200
        sj = s.json()
        assert "payment_status" in sj and "status" in sj


# ---------- RSVP + Notifications ----------
class TestRsvpAndNotifications:
    def test_rsvp_and_notifications_flow(self, api_client, base_url, user_ctx):
        h = {"Authorization": f"Bearer {user_ctx['token']}"}
        events = api_client.get(f"{base_url}/api/events").json()["events"]
        eid = events[0]["event_id"]
        r = api_client.post(f"{base_url}/api/events/rsvp",
                            json={"event_id": eid}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Idempotent second RSVP
        r2 = api_client.post(f"{base_url}/api/events/rsvp",
                             json={"event_id": eid}, headers=h)
        assert r2.status_code == 200

        # Notifications should now include event notification
        time.sleep(1)
        nr = api_client.get(f"{base_url}/api/notifications", headers=h)
        assert nr.status_code == 200
        notifs = nr.json()["notifications"]
        assert len(notifs) >= 1
        event_notifs = [n for n in notifs if n.get("type") == "event"]
        assert len(event_notifs) >= 1, "No event notification created"

        nid = event_notifs[0]["notification_id"]
        assert event_notifs[0]["read"] is False
        mr = api_client.post(f"{base_url}/api/notifications/{nid}/read", headers=h)
        assert mr.status_code == 200

        # verify read=True
        nr2 = api_client.get(f"{base_url}/api/notifications", headers=h)
        after = [n for n in nr2.json()["notifications"] if n["notification_id"] == nid]
        assert after and after[0]["read"] is True
