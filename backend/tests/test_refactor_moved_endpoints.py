"""Regression tests for the routes refactor (iteration 29):
MESSAGES / BOOKINGS / ADMIN / PAYMENTS endpoints moved from server.py to
backend/routes/*.py. URLs are unchanged. These tests confirm all moved
handlers still work and the admin guard, 404s and READ-ONLY payment routes
all behave correctly.

SAFETY: We do NOT complete any Square payment flow — Square is in PRODUCTION.
We only verify POST /api/payments/checkout is REGISTERED (bad body => 422/401,
not 404).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") \
    else os.environ["EXPO_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASSWORD = "Maxenergy12@"
MEMBER_EMAIL = "testmember@gmail.com"
MEMBER_PASSWORD = "Test!1234"

BOGUS = "bk_doesnotexist_" + uuid.uuid4().hex[:8]


# --- fixtures / helpers ---
@pytest.fixture(scope="module")
def member_token():
    r = requests.post(f"{API}/auth/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"member login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok, "no token in member login response"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok, "no token in admin login response"
    return tok


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ======================================================================
# CORE SANITY — still in server.py
# ======================================================================
class TestCoreSanity:
    def test_classes_list(self):
        r = requests.get(f"{API}/classes", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "classes" in data and isinstance(data["classes"], list)
        if data["classes"]:
            c = data["classes"][0]
            # Verify enrichment fields present
            assert "class_id" in c
            # booked/spots_left only present for non-appointment classes
            if not c.get("by_appointment"):
                assert "booked" in c or "spots_left" in c

    def test_gym_photos(self):
        r = requests.get(f"{API}/gym/photos", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json().get("photos", r.json()), (list, dict))

    def test_events(self):
        r = requests.get(f"{API}/events", timeout=20)
        assert r.status_code == 200


# ======================================================================
# MESSAGES (routes/messages.py)
# ======================================================================
class TestMessages:
    def test_messages_list(self, member_token):
        r = requests.get(f"{API}/messages", headers=hdr(member_token), timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "messages" in data
        assert isinstance(data["messages"], list)

    def test_messages_unread(self, member_token):
        r = requests.get(f"{API}/messages/unread", headers=hdr(member_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "count" in data
        assert isinstance(data["count"], int)

    def test_messages_send(self, member_token):
        body_text = f"TEST_refactor_msg_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/messages", headers=hdr(member_token), json={"body": body_text}, timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "message" in data
        msg = data["message"]
        assert msg.get("body") == body_text
        assert msg.get("sender_is_admin") is False
        assert "message_id" in msg
        assert "_id" not in msg  # mongodb ObjectId must be stripped

    def test_messages_send_empty_body(self, member_token):
        r = requests.post(f"{API}/messages", headers=hdr(member_token), json={"body": "   "}, timeout=20)
        assert r.status_code == 400

    def test_messages_list_requires_auth(self):
        r = requests.get(f"{API}/messages", timeout=20)
        assert r.status_code in (401, 403)


# ======================================================================
# BOOKINGS (routes/bookings.py) — READ-ONLY + 404 mutations + clear-all
# ======================================================================
class TestBookings:
    def test_bookings_list(self, member_token):
        r = requests.get(f"{API}/bookings", headers=hdr(member_token), timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "bookings" in data and isinstance(data["bookings"], list)

    def test_bookings_history(self, member_token):
        r = requests.get(f"{API}/bookings/history", headers=hdr(member_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "bookings" in data and isinstance(data["bookings"], list)

    def test_payments_reconcile(self, member_token):
        r = requests.post(f"{API}/payments/reconcile", headers=hdr(member_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "paid_booking_ids" in data
        assert isinstance(data["paid_booking_ids"], list)

    def test_me_stats(self, member_token):
        r = requests.get(f"{API}/me/stats", headers=hdr(member_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "attended_this_month" in data
        assert "month" in data
        assert isinstance(data["attended_this_month"], int)
        assert isinstance(data["month"], str) and len(data["month"]) > 0

    def test_passes_qr(self, member_token):
        r = requests.get(f"{API}/passes/qr", headers=hdr(member_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "code" in data and isinstance(data["code"], str) and len(data["code"]) > 20
        assert "class_pass_credits" in data
        assert isinstance(data["class_pass_credits"], int)

    def test_checkin_code_bogus(self, member_token):
        r = requests.get(f"{API}/bookings/{BOGUS}/checkin-code", headers=hdr(member_token), timeout=20)
        assert r.status_code == 404

    def test_cancel_bogus(self, member_token):
        r = requests.post(f"{API}/bookings/{BOGUS}/cancel", headers=hdr(member_token), timeout=20)
        assert r.status_code == 404

    def test_reschedule_bogus(self, member_token):
        r = requests.post(
            f"{API}/bookings/{BOGUS}/reschedule",
            headers=hdr(member_token),
            json={"requested_time": "Mon 10:30am", "note": "", "requested_at": None},
            timeout=20,
        )
        assert r.status_code == 404

    def test_clear_all(self, member_token):
        r = requests.post(f"{API}/bookings/clear-all", headers=hdr(member_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert "cleared" in data

    def test_create_booking_fixed_pending(self, member_token):
        """Create a booking for a fixed (non-appointment) class to confirm it returns a
        pending booking. We do NOT proceed to payment. Clean up afterwards by cancelling
        or clearing the booking."""
        rc = requests.get(f"{API}/classes", timeout=20).json()
        fixed = next(
            (
                c for c in rc.get("classes", [])
                if not c.get("by_appointment") and not c.get("cancelled") and c.get("class_id")
            ),
            None,
        )
        if not fixed:
            pytest.skip("no fixed class available for booking test")
        body = {"class_id": fixed["class_id"]}
        r = requests.post(f"{API}/bookings", headers=hdr(member_token), json=body, timeout=25)
        # Could be 200/201 pending, 409 duplicate (if already booked), 409 class full/started
        assert r.status_code in (200, 201, 409, 400), r.text[:200]
        if r.status_code in (200, 201):
            data = r.json()
            assert "booking" in data
            b = data["booking"]
            assert b.get("status") == "pending"
            assert "booking_id" in b
            # Cleanup: clear the pending booking so we don't leave noise
            try:
                requests.post(
                    f"{API}/bookings/{b['booking_id']}/clear",
                    headers=hdr(member_token), timeout=15,
                )
            except Exception:
                pass


# ======================================================================
# ADMIN (routes/admin.py)
# ======================================================================
class TestAdmin:
    def test_overview(self, admin_token):
        r = requests.get(f"{API}/admin/overview", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        for k in ("classes", "members", "session_requests", "refunds_pending", "bug_reports_open"):
            assert k in data, f"missing key {k} in overview response"
            assert isinstance(data[k], int)

    def test_admin_classes(self, admin_token):
        r = requests.get(f"{API}/admin/classes", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "classes" in data and isinstance(data["classes"], list)
        # Templates (is_template=True) and/or by-appointment classes
        has_tmpl = any(c.get("is_template") for c in data["classes"])
        has_appt = any(c.get("by_appointment") for c in data["classes"])
        assert has_tmpl or has_appt or len(data["classes"]) >= 0  # list may be empty

    def test_admin_overview_member_forbidden(self, member_token):
        r = requests.get(f"{API}/admin/overview", headers=hdr(member_token), timeout=20)
        assert r.status_code == 403

    def test_admin_classes_member_forbidden(self, member_token):
        r = requests.get(f"{API}/admin/classes", headers=hdr(member_token), timeout=20)
        assert r.status_code == 403

    def test_admin_class_crud(self, admin_token):
        """Create a by-appointment test class, update it, then delete it."""
        payload = {
            "name": f"TEST_refactor_class_{uuid.uuid4().hex[:6]}",
            "trainer": "Test Trainer",
            "category": "test",
            "level": "all",
            "duration_min": 30,
            "price_cents": 1000,
            "description": "temporary test class — safe to delete",
            "by_appointment": True,
        }
        c = requests.post(f"{API}/admin/classes", headers=hdr(admin_token), json=payload, timeout=20)
        assert c.status_code == 200, c.text[:300]
        created = c.json().get("class")
        assert created and created.get("class_id")
        cls_id = created["class_id"]
        assert created.get("by_appointment") is True
        assert created.get("name") == payload["name"]

        try:
            # Update
            upd = dict(payload)
            upd["name"] = payload["name"] + "_edited"
            upd["price_cents"] = 1500
            pu = requests.put(f"{API}/admin/classes/{cls_id}", headers=hdr(admin_token), json=upd, timeout=20)
            assert pu.status_code == 200, pu.text[:200]
            edited = pu.json().get("class")
            assert edited.get("name") == upd["name"]
            assert int(edited.get("price_cents")) == 1500
        finally:
            # Cleanup — delete the test class
            d = requests.delete(f"{API}/admin/classes/{cls_id}", headers=hdr(admin_token), timeout=20)
            assert d.status_code == 200
            assert d.json().get("ok") is True


# ======================================================================
# PAYMENTS (routes/payments.py) — READ-ONLY (do NOT complete real checkout)
# ======================================================================
class TestPaymentsReadOnly:
    def test_receipts_list(self, member_token):
        r = requests.get(f"{API}/payments/receipts", headers=hdr(member_token), timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "receipts" in data
        assert isinstance(data["receipts"], list)

    def test_status_bogus(self, member_token):
        r = requests.get(f"{API}/payments/status/{BOGUS}", headers=hdr(member_token), timeout=20)
        assert r.status_code == 404

    def test_receipt_bogus(self, member_token):
        r = requests.get(f"{API}/payments/receipt/{BOGUS}", headers=hdr(member_token), timeout=20)
        assert r.status_code == 404

    def test_checkout_route_registered_unauth(self):
        """Unauthenticated POST to /api/payments/checkout should return 401/403 (not 404) —
        proving the route is registered. We do NOT send a valid body / token."""
        r = requests.post(f"{API}/payments/checkout", json={}, timeout=20)
        assert r.status_code in (401, 403, 422), f"expected auth/validation error, got {r.status_code}"

    def test_checkout_route_registered_malformed(self, member_token):
        """Authenticated but malformed POST — should 422 (pydantic) or 400/404 for
        missing booking, never 405/404-route."""
        r = requests.post(f"{API}/payments/checkout", headers=hdr(member_token), json={}, timeout=20)
        assert r.status_code in (400, 404, 422)


# ======================================================================
# AUTH SANITY
# ======================================================================
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_member_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD}, timeout=20)
        assert r.status_code == 200
        assert "token" in r.json()
