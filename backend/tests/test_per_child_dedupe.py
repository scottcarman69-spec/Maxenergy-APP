"""
Per-child booking dedupe regression test.

Scenario:
- Parent with multiple saved children can book EACH child separately into the
  SAME age-gated Kids class (e.g. cls_a38f3d888984 = Kids Muay Thai, min 8 / max 16).
- SAME child cannot be booked into the same class twice (per-child, once each).
- A 2nd POST with the same paid child returns HTTP 409.
- An unpaid (pending) same-child re-POST resumes (returns) the pending row.
- A POST with a DIFFERENT child_id succeeds.
"""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

KIDS_CLASS_ID = "cls_a38f3d888984"
PARENT_EMAIL = "info@maxenergy.com.au"
PARENT_PASSWORD = "SInEf5!4AvEj"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def parent_token():
    return _login(PARENT_EMAIL, PARENT_PASSWORD)


@pytest.fixture(scope="module")
def children_pair(parent_token):
    """Ensure TWO test children exist on the parent and return their ids.
    Cleans up children (and any residual bookings) at the end.
    """
    h = _auth(parent_token)

    # Snapshot & clean any existing TEST_* children so we start deterministic
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=10).json()
    for c in (me.get("user") or {}).get("children", []) or []:
        if str(c.get("name", "")).startswith("TEST_"):
            requests.delete(f"{BASE_URL}/api/me/children/{c['child_id']}", headers=h, timeout=10)

    r1 = requests.post(f"{BASE_URL}/api/me/children", headers=h, json={"name": "TEST_Alice", "age": 10}, timeout=10)
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{BASE_URL}/api/me/children", headers=h, json={"name": "TEST_Bob", "age": 12}, timeout=10)
    assert r2.status_code == 200, r2.text

    kids = r2.json().get("children", [])
    a = next(c for c in kids if c["name"] == "TEST_Alice")
    b = next(c for c in kids if c["name"] == "TEST_Bob")

    created_booking_ids: list[str] = []

    yield {"a": a, "b": b, "bookings": created_booking_ids}

    # Cleanup any bookings we created (admin cancel), then delete children.
    admin_tok = _login(PARENT_EMAIL, PARENT_PASSWORD)  # info@ is admin
    ah = _auth(admin_tok)
    for bid in created_booking_ids:
        try:
            requests.post(f"{BASE_URL}/api/admin/bookings/{bid}/cancel", headers=ah, timeout=10)
        except Exception:
            pass
    for cid in (a["child_id"], b["child_id"]):
        try:
            requests.delete(f"{BASE_URL}/api/me/children/{cid}", headers=h, timeout=10)
        except Exception:
            pass


class TestPerChildDedupe:

    def test_pending_same_child_resumes(self, parent_token, children_pair):
        """Booking child A twice while first is still pending -> returns same pending row."""
        h = _auth(parent_token)
        a = children_pair["a"]
        payload = {"class_id": KIDS_CLASS_ID, "child_id": a["child_id"], "child_name": a["name"], "child_age": a["age"]}
        r1 = requests.post(f"{BASE_URL}/api/bookings", headers=h, json=payload, timeout=15)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()["booking"]
        children_pair["bookings"].append(b1["booking_id"])
        assert b1["status"] == "pending"
        assert b1.get("child_id") == a["child_id"]
        assert b1.get("child_name") == "TEST_Alice"
        assert b1.get("child_age") == 10

        # 2nd POST for same child while still pending -> resume the same row
        r2 = requests.post(f"{BASE_URL}/api/bookings", headers=h, json=payload, timeout=15)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()["booking"]
        assert b2["booking_id"] == b1["booking_id"], "pending re-post must resume, not create new"

    def test_paid_same_child_409(self, parent_token, children_pair):
        """After marking A's booking paid, re-POSTing A returns 409 with the child's name."""
        h = _auth(parent_token)
        a = children_pair["a"]
        # Fast-forward: use a class pass to complete the pending A booking.
        # Fallback: directly mark it paid via admin.
        booking_id = children_pair["bookings"][0]
        # Complete via class-pass checkout (info@ has passes; no card charge).
        rc = requests.post(
            f"{BASE_URL}/api/payments/checkout",
            headers=h,
            json={"booking_id": booking_id, "origin_url": BASE_URL, "use_class_pass": True},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        assert rc.json().get("paid_with_pass"), rc.text
        # Verify booking is now paid
        mb = requests.get(f"{BASE_URL}/api/bookings", headers=h, timeout=10).json()
        row = next((x for x in mb.get("bookings", []) if x["booking_id"] == booking_id), None)
        assert row is not None, f"booking {booking_id} missing from /api/bookings"
        assert row["status"] == "paid", f"expected paid, got {row['status']}"

        # 2nd POST for same paid child -> 409 with name in error
        payload = {"class_id": KIDS_CLASS_ID, "child_id": a["child_id"], "child_name": a["name"], "child_age": a["age"]}
        r2 = requests.post(f"{BASE_URL}/api/bookings", headers=h, json=payload, timeout=15)
        assert r2.status_code == 409, r2.text
        detail = (r2.json() or {}).get("detail", "")
        assert "TEST_Alice" in detail, f"expected 'TEST_Alice' in {detail!r}"
        assert "already booked" in detail.lower()

    def test_different_child_succeeds(self, parent_token, children_pair):
        """Different child_id (B) into the SAME class returns 200 with a new booking."""
        h = _auth(parent_token)
        b = children_pair["b"]
        payload = {"class_id": KIDS_CLASS_ID, "child_id": b["child_id"], "child_name": b["name"], "child_age": b["age"]}
        r = requests.post(f"{BASE_URL}/api/bookings", headers=h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        row = r.json()["booking"]
        assert row.get("child_id") == b["child_id"]
        assert row.get("child_name") == "TEST_Bob"
        assert row.get("child_age") == 12
        children_pair["bookings"].append(row["booking_id"])

    def test_admin_bookings_shows_both_children(self, parent_token, children_pair):
        """Both children appear as distinct booking rows in /api/admin/bookings for this class."""
        h = _auth(parent_token)
        r = requests.get(f"{BASE_URL}/api/admin/bookings", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        rows = [b for b in r.json().get("bookings", []) if b.get("class_id") == KIDS_CLASS_ID]
        alice_rows = [b for b in rows if b.get("child_name") == "TEST_Alice" and b.get("status") == "paid"]
        bob_rows = [b for b in rows if b.get("child_name") == "TEST_Bob" and b.get("status") in ("pending", "paid")]
        assert alice_rows, "expected a paid TEST_Alice row in admin bookings"
        assert bob_rows, "expected a TEST_Bob row in admin bookings"
        # Distinct child_ids
        assert alice_rows[0].get("child_id") != bob_rows[0].get("child_id")

    def test_under_min_age_blocked(self, parent_token):
        """Backend still blocks < min_age children."""
        h = _auth(parent_token)
        # add temp under-8 child
        r = requests.post(f"{BASE_URL}/api/me/children", headers=h, json={"name": "TEST_Tiny", "age": 5}, timeout=10)
        assert r.status_code == 200, r.text
        tiny = next(c for c in r.json()["children"] if c["name"] == "TEST_Tiny")
        try:
            bad = requests.post(
                f"{BASE_URL}/api/bookings",
                headers=h,
                json={"class_id": KIDS_CLASS_ID, "child_id": tiny["child_id"], "child_name": tiny["name"], "child_age": 5},
                timeout=15,
            )
            assert bad.status_code == 400, bad.text
            assert "ages 8" in (bad.json().get("detail", "").lower()) or "under 8" in bad.json().get("detail", "").lower()
        finally:
            requests.delete(f"{BASE_URL}/api/me/children/{tiny['child_id']}", headers=h, timeout=10)
