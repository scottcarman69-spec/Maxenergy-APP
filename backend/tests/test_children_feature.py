"""
Tests for the "Multiple Children" feature:
- Children CRUD (GET/POST/PUT/DELETE /api/me/children)
- Validation on POST/PUT (blank name, age <1 or >100)
- /api/auth/me returns a `children` array
- Booking a Kids class persists child_name + child_age; receipt + admin/bookings surface them
- Regression: server-side hard block for under-8 on Kids classes returns 400
"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

MEMBER_EMAIL = "testmember@gmail.com"
MEMBER_PW = "Test!1234"
ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PW = "SInEf5!4AvEj"


def _login(email: str, pw: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER_EMAIL, MEMBER_PW)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def member_headers(member_token):
    return {"Authorization": f"Bearer {member_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def cleanup_children(member_headers):
    """Delete all pre-existing children on testmember before + after this run."""
    def _wipe():
        r = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
        if r.status_code == 200:
            for c in (r.json().get("children") or []):
                requests.delete(f"{BASE_URL}/api/me/children/{c['child_id']}", headers=member_headers, timeout=30)
    _wipe()
    yield
    _wipe()


# ==================== CHILDREN CRUD ====================
class TestChildrenCRUD:
    def test_list_empty_initially(self, member_headers):
        r = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
        assert r.status_code == 200
        assert r.json() == {"children": []}

    def test_add_child_and_persist(self, member_headers):
        r = requests.post(
            f"{BASE_URL}/api/me/children",
            headers=member_headers,
            json={"name": "TEST_Alice", "age": 10},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        kids = r.json().get("children", [])
        assert len(kids) == 1
        assert kids[0]["name"] == "TEST_Alice"
        assert kids[0]["age"] == 10
        assert kids[0]["child_id"].startswith("kid_")
        # GET verifies persistence
        r2 = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["children"][0]["name"] == "TEST_Alice"

    def test_update_child(self, member_headers):
        # find the created child
        r = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
        cid = r.json()["children"][0]["child_id"]
        r2 = requests.put(
            f"{BASE_URL}/api/me/children/{cid}",
            headers=member_headers,
            json={"name": "TEST_AliceUpdated", "age": 12},
            timeout=30,
        )
        assert r2.status_code == 200
        # verify via GET
        r3 = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
        assert r3.json()["children"][0]["name"] == "TEST_AliceUpdated"
        assert r3.json()["children"][0]["age"] == 12

    def test_update_nonexistent_child_404(self, member_headers):
        r = requests.put(
            f"{BASE_URL}/api/me/children/kid_doesnotexist",
            headers=member_headers,
            json={"name": "Nope", "age": 8},
            timeout=30,
        )
        assert r.status_code == 404

    def test_delete_child(self, member_headers):
        r = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
        cid = r.json()["children"][0]["child_id"]
        r2 = requests.delete(f"{BASE_URL}/api/me/children/{cid}", headers=member_headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["children"] == []
        # verify via GET
        r3 = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
        assert r3.json()["children"] == []


# ==================== VALIDATION ====================
class TestChildrenValidation:
    def test_blank_name_rejected(self, member_headers):
        r = requests.post(f"{BASE_URL}/api/me/children", headers=member_headers,
                          json={"name": "   ", "age": 10}, timeout=30)
        assert r.status_code == 400

    def test_age_zero_rejected(self, member_headers):
        r = requests.post(f"{BASE_URL}/api/me/children", headers=member_headers,
                          json={"name": "TEST_Z", "age": 0}, timeout=30)
        assert r.status_code == 400

    def test_age_over_100_rejected(self, member_headers):
        r = requests.post(f"{BASE_URL}/api/me/children", headers=member_headers,
                          json={"name": "TEST_O", "age": 101}, timeout=30)
        assert r.status_code == 400

    def test_unauth_children_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/me/children", timeout=30)
        assert r.status_code in (401, 403)


# ==================== /auth/me returns children ====================
class TestAuthMeChildren:
    def test_auth_me_has_children_array(self, member_headers):
        # seed one child
        add = requests.post(f"{BASE_URL}/api/me/children", headers=member_headers,
                            json={"name": "TEST_AuthMeKid", "age": 9}, timeout=30)
        assert add.status_code == 200
        try:
            r = requests.get(f"{BASE_URL}/api/auth/me", headers=member_headers, timeout=30)
            assert r.status_code == 200
            body = r.json()
            # /auth/me returns { user: { ..., children: [...] } }
            user = body.get("user") or body
            assert "children" in user, f"auth/me missing 'children' key on user: {user}"
            assert isinstance(user["children"], list)
            names = [c.get("name") for c in user["children"]]
            assert "TEST_AuthMeKid" in names
        finally:
            # cleanup
            r2 = requests.get(f"{BASE_URL}/api/me/children", headers=member_headers, timeout=30)
            for c in r2.json().get("children", []):
                if c.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/me/children/{c['child_id']}", headers=member_headers, timeout=30)


# ==================== BOOKING integration with child_name ====================
def _find_kids_muay_thai_class(admin_headers):
    r = requests.get(f"{BASE_URL}/api/classes", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    now = datetime.now(timezone.utc)
    candidates = []
    for c in r.json().get("classes", []):
        if c.get("category") == "Kids" and c.get("name") == "Muay Thai" \
                and c.get("min_age") == 8 and c.get("max_age") == 16 \
                and not c.get("by_appointment") and not c.get("cancelled"):
            start = c.get("start_at")
            if not start:
                continue
            try:
                dt = datetime.fromisoformat(start.replace("Z", "+00:00")) if isinstance(start, str) else start
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if dt > now + timedelta(minutes=5):
                candidates.append((dt, c))
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1] if candidates else None


class TestBookingChildRegression:
    def test_under_8_hard_blocked(self, member_headers, admin_headers):
        cls = _find_kids_muay_thai_class(admin_headers)
        if not cls:
            pytest.skip("No upcoming Kids Muay Thai class in DB")
        r = requests.post(
            f"{BASE_URL}/api/bookings",
            headers=member_headers,
            json={"class_id": cls["class_id"], "child_name": "TEST_Under8", "child_age": 7},
            timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "8" in r.text  # message references the min age

    def test_booking_persists_child_and_receipt(self, member_headers, admin_headers):
        """Create a pending booking with child_name+age, verify it persists via receipt/admin."""
        cls = _find_kids_muay_thai_class(admin_headers)
        if not cls:
            pytest.skip("No upcoming Kids Muay Thai class in DB")

        # Ensure no active testmember booking exists on this class
        # (delete any pre-existing to avoid 409)
        booking_id = None
        try:
            r = requests.post(
                f"{BASE_URL}/api/bookings",
                headers=member_headers,
                json={"class_id": cls["class_id"], "child_name": "TEST_Bobby", "child_age": 10},
                timeout=30,
            )
            assert r.status_code in (200, 409), r.text
            if r.status_code == 409:
                pytest.skip("testmember already has an active booking on this class")
            body = r.json()
            b = body.get("booking") or body
            booking_id = b.get("booking_id")
            assert booking_id, f"no booking_id in {body}"
            assert b.get("child_name") == "TEST_Bobby"
            assert b.get("child_age") == 10

            # Verify admin/bookings returns child_name + child_age for this booking
            ab = requests.get(f"{BASE_URL}/api/admin/bookings", headers=admin_headers, timeout=30)
            assert ab.status_code == 200
            match = next((x for x in ab.json().get("bookings", []) if x.get("booking_id") == booking_id), None)
            assert match is not None, "booking not in admin/bookings"
            assert match.get("child_name") == "TEST_Bobby"
            assert match.get("child_age") == 10

        finally:
            # cleanup: cancel/delete via admin
            if booking_id:
                # try admin cancel
                requests.post(f"{BASE_URL}/api/admin/bookings/{booking_id}/cancel",
                              headers=admin_headers, timeout=30)

    def test_booking_over_16_allowed_server_side(self, member_headers, admin_headers):
        """Server only hard-blocks under min_age. Over max_age is a UX note, not a server block."""
        cls = _find_kids_muay_thai_class(admin_headers)
        if not cls:
            pytest.skip("No upcoming Kids Muay Thai class in DB")
        booking_id = None
        try:
            r = requests.post(
                f"{BASE_URL}/api/bookings",
                headers=member_headers,
                json={"class_id": cls["class_id"], "child_name": "TEST_TeenOver", "child_age": 18},
                timeout=30,
            )
            # allowed to book — server only enforces min_age
            assert r.status_code in (200, 409), r.text
            if r.status_code == 200:
                booking_id = (r.json().get("booking") or r.json()).get("booking_id")
        finally:
            if booking_id:
                requests.post(f"{BASE_URL}/api/admin/bookings/{booking_id}/cancel",
                              headers=admin_headers, timeout=30)
