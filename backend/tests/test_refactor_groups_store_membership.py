"""
Backend regression tests for iteration-30 route refactor:
GROUPS (routes/groups.py), STORE/GIFTCARDS (routes/store.py), MEMBERSHIP (routes/membership.py).
Also quick core sanity (auth login, /classes, /bookings, /payments/receipts, /gym/photos, /events, /admin/overview).

SAFETY: Square is in PRODUCTION — these tests NEVER complete a checkout.
Only route-registration is verified for POST /api/store/checkout and POST /api/giftcards/checkout.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "info@maxenergy.com.au"
ADMIN_PASSWORD = "Maxenergy12@"
MEMBER_EMAIL = "testmember@gmail.com"
MEMBER_PASSWORD = "Test!1234"


# ------------------- fixtures -------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "token" in data
    return data["token"], data.get("user", {})


@pytest.fixture(scope="module")
def admin_auth(api):
    token, user = _login(api, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert user.get("is_admin") is True
    return {"Authorization": f"Bearer {token}"}, user


@pytest.fixture(scope="module")
def member_auth(api):
    token, user = _login(api, MEMBER_EMAIL, MEMBER_PASSWORD)
    return {"Authorization": f"Bearer {token}"}, user


# ===================================================================
# CORE SANITY (still in server.py)
# ===================================================================
class TestCoreSanity:
    def test_auth_login_admin(self, api):
        token, user = _login(api, ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token and user.get("is_admin") is True

    def test_auth_login_member(self, api):
        token, user = _login(api, MEMBER_EMAIL, MEMBER_PASSWORD)
        assert token and user.get("email") == MEMBER_EMAIL

    def test_classes_list(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/classes", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "classes" in data and isinstance(data["classes"], list)
        if data["classes"]:
            c0 = data["classes"][0]
            # Enrichment keys
            assert "spots_left" in c0 or "booked" in c0 or "class_id" in c0

    def test_bookings_me(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/bookings", headers=headers, timeout=20)
        assert r.status_code == 200
        assert "bookings" in r.json()

    def test_payments_receipts(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/payments/receipts", headers=headers, timeout=20)
        assert r.status_code == 200
        assert "receipts" in r.json() or isinstance(r.json(), (list, dict))

    def test_gym_photos(self, api):
        r = api.get(f"{BASE_URL}/api/gym/photos", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)

    def test_events_list(self, api):
        r = api.get(f"{BASE_URL}/api/events", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_admin_overview(self, api, admin_auth):
        headers, _ = admin_auth
        r = api.get(f"{BASE_URL}/api/admin/overview", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        for k in ("classes", "members", "session_requests"):
            assert k in data, f"admin/overview missing {k}: {data}"


# ===================================================================
# GROUPS (routes/groups.py)
# ===================================================================
class TestGroups:
    def test_groups_list_member(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/groups", headers=headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "groups" in data and isinstance(data["groups"], list)

    def test_groups_discover_member(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/groups/discover", headers=headers, timeout=20)
        assert r.status_code == 200
        assert "groups" in r.json()

    def test_group_get_bogus_id(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/groups/grp_doesnotexist_xyz", headers=headers, timeout=20)
        # Expect 403 (not a member) or 404; MUST NOT 500
        assert r.status_code in (403, 404), f"bogus group id -> {r.status_code}: {r.text[:200]}"

    def test_group_create_route_responds(self, api, member_auth):
        """Route must be registered. Empty name -> 400. Valid name but non-friend
        member_ids -> accepted (members filtered to self; admin flow would create,
        member flow creates a pending request). We just confirm it doesn't 404/500."""
        headers, _ = member_auth
        # Empty name -> 400
        r = api.post(f"{BASE_URL}/api/groups", json={"name": "", "member_ids": []}, headers=headers, timeout=20)
        assert r.status_code == 400, f"empty name should be 400, got {r.status_code}: {r.text[:200]}"
        # Valid name, no members (will be a pending admin request for a non-admin)
        r2 = api.post(f"{BASE_URL}/api/groups",
                      json={"name": "TEST_refactor_grp_delete_me", "member_ids": []},
                      headers=headers, timeout=20)
        assert r2.status_code in (200, 201), f"create group -> {r2.status_code}: {r2.text[:200]}"
        body = r2.json()
        # Non-admin should return pending=True, group_id=None
        assert body.get("pending") is True

    def test_admin_group_requests(self, api, admin_auth):
        headers, _ = admin_auth
        r = api.get(f"{BASE_URL}/api/admin/group-requests", headers=headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        for k in ("create_requests", "join_requests", "count"):
            assert k in data

    def test_admin_group_requests_cleanup(self, api, admin_auth):
        """Decline any TEST_refactor_grp_delete_me group-create requests this test created."""
        headers, _ = admin_auth
        r = api.get(f"{BASE_URL}/api/admin/group-requests", headers=headers, timeout=20)
        assert r.status_code == 200
        for req in r.json().get("create_requests", []):
            if req.get("name", "").startswith("TEST_refactor_grp_delete_me"):
                rid = req["request_id"]
                dr = api.post(f"{BASE_URL}/api/admin/group-requests/{rid}/decline",
                              headers=headers, timeout=20)
                assert dr.status_code == 200

    def test_admin_group_requests_member_forbidden(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/admin/group-requests", headers=headers, timeout=20)
        assert r.status_code == 403, f"member must be forbidden, got {r.status_code}"

    def test_admin_threads_list(self, api, admin_auth):
        headers, _ = admin_auth
        r = api.get(f"{BASE_URL}/api/admin/threads", headers=headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        assert "threads" in r.json()

    def test_admin_threads_for_user(self, api, admin_auth, member_auth):
        headers, _ = admin_auth
        _, muser = member_auth
        uid = muser.get("user_id")
        assert uid, "member user_id missing"
        r = api.get(f"{BASE_URL}/api/admin/threads/{uid}", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "messages" in data


# ===================================================================
# STORE / GIFTCARDS (routes/store.py)
# ===================================================================
class TestStore:
    def test_store_products(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/store/products", headers=headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "products" in data and isinstance(data["products"], list)
        assert len(data["products"]) > 0
        for key in ("keytag_cents", "class_pass_credits", "membership_form_completed"):
            assert key in data
        # Products should include types we expect (membership/pass/keytag).
        types = {p.get("type") for p in data["products"]}
        assert types, "no product types found"

    def test_credits(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/credits", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        for k in ("balance_cents", "entries", "class_pass_credits", "pass_entries"):
            assert k in data

    def test_giftcards_mine(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/giftcards/mine", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        for k in ("purchased", "redeemed", "min_cents", "max_cents"):
            assert k in data

    def test_announcements_public(self, api):
        # route has no auth dep — but just in case, verify public access returns 200
        r = api.get(f"{BASE_URL}/api/announcements", timeout=20)
        assert r.status_code == 200
        assert "announcements" in r.json()

    def test_admin_giftcards_list(self, api, admin_auth):
        headers, _ = admin_auth
        r = api.get(f"{BASE_URL}/api/admin/giftcards", headers=headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        assert "gift_cards" in r.json()

    def test_admin_giftcards_member_forbidden(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/admin/giftcards", headers=headers, timeout=20)
        assert r.status_code == 403

    def test_admin_giftcards_adjust_validation(self, api, admin_auth):
        """Validate without side-effects: use a bogus code -> 404 (not 500)."""
        headers, _ = admin_auth
        r = api.post(f"{BASE_URL}/api/admin/giftcards/adjust",
                     json={"code": "TEST_NOT_A_REAL_CODE_XYZ", "new_balance_cents": 100, "note": "refactor-test"},
                     headers=headers, timeout=20)
        assert r.status_code == 404, f"bogus adjust -> {r.status_code}: {r.text[:200]}"

    def test_store_status_bogus(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/store/status/nonexistent_session_xyz", headers=headers, timeout=20)
        assert r.status_code == 404, f"bogus store/status -> {r.status_code}"

    def test_giftcards_status_bogus(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/giftcards/status/nonexistent_session_xyz", headers=headers, timeout=20)
        assert r.status_code == 404, f"bogus giftcards/status -> {r.status_code}"

    # ---- Route registration only — DO NOT COMPLETE A SQUARE CHECKOUT ----
    def test_store_checkout_registered_unauth(self, api):
        """No auth header -> must NOT be 404 (route exists)."""
        r = api.post(f"{BASE_URL}/api/store/checkout",
                     json={"product_id": "fake", "origin_url": "https://x.test"}, timeout=20)
        assert r.status_code != 404, f"route missing (404). Got {r.status_code}"
        assert r.status_code in (401, 403, 422), f"unexpected: {r.status_code} {r.text[:150]}"

    def test_store_checkout_registered_bad_body(self, api, member_auth):
        headers, _ = member_auth
        r = api.post(f"{BASE_URL}/api/store/checkout", json={}, headers=headers, timeout=20)
        assert r.status_code != 404
        # Missing required product_id/origin_url -> 422 validation (not 500)
        assert r.status_code in (400, 422, 428), f"got {r.status_code}: {r.text[:150]}"

    def test_giftcards_checkout_registered_unauth(self, api):
        r = api.post(f"{BASE_URL}/api/giftcards/checkout",
                     json={"amount_cents": 2500, "origin_url": "https://x.test",
                           "recipient_email": "x@y.com"}, timeout=20)
        assert r.status_code != 404
        assert r.status_code in (401, 403, 422)

    def test_giftcards_checkout_registered_bad_body(self, api, member_auth):
        headers, _ = member_auth
        r = api.post(f"{BASE_URL}/api/giftcards/checkout", json={}, headers=headers, timeout=20)
        assert r.status_code != 404
        assert r.status_code in (400, 422)


# ===================================================================
# MEMBERSHIP (routes/membership.py)
# ===================================================================
class TestMembership:
    def test_plans_public(self, api):
        r = api.get(f"{BASE_URL}/api/membership/plans", timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "plans" in data and isinstance(data["plans"], list)
        assert len(data["plans"]) > 0, "no membership plans seeded"

    def test_applications_me(self, api, member_auth):
        headers, _ = member_auth
        r = api.get(f"{BASE_URL}/api/membership/applications/me", headers=headers, timeout=20)
        assert r.status_code == 200
        assert "applications" in r.json()

    def test_vigyr_report_completed(self, api, member_auth):
        headers, _ = member_auth
        r = api.post(f"{BASE_URL}/api/membership/vigyr-report",
                     json={"completed": True}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data.get("ok") is True

    def test_vigyr_report_not_completed(self, api, member_auth):
        headers, _ = member_auth
        r = api.post(f"{BASE_URL}/api/membership/vigyr-report",
                     json={"completed": False}, headers=headers, timeout=20)
        assert r.status_code == 200
        assert r.json().get("reported") is False

    def test_pdf_bogus_id(self, api):
        # No auth and no token -> 403; with bogus ID even if authed by token not possible
        r = api.get(f"{BASE_URL}/api/membership/forms/app_bogus_xyz.pdf", timeout=20)
        assert r.status_code in (403, 404), f"bogus PDF -> {r.status_code}"

    def test_apply_then_pdf_and_in_me(self, api, member_auth):
        """Submit a minimal valid application (safe — Vigyr/manual, NO payment),
        then verify PDF download and that it appears in applications/me."""
        headers, _ = member_auth
        plans_r = api.get(f"{BASE_URL}/api/membership/plans", timeout=20)
        plans = plans_r.json().get("plans", [])
        assert plans, "no plans available"
        plan_id = plans[0]["plan_id"]

        payload = {
            "plan_id": plan_id,
            "full_name": "TEST_refactor Member",
            "phone": "0400000000",
            "category": "Adult",
            "experience": "Beginner",
            "message": "TEST_refactor_apply_delete_me",
            "details": {
                "membership_type": "Full",
                "term": "Month-to-month",
                "submitted_date": "2026-01-01",
                "title": "Mr", "sex": "M", "dob": "1990-01-01",
                "address": "1 Test St", "suburb": "Smithfield", "postcode": "4878",
                "emergency_name": "Test Contact", "emergency_phone": "0400111222",
                "consent_marketing": False, "how_found": "Test",
                "medical": {"medications": {}, "conditions": {}, "notes": ""},
                "media_consent": False, "waiver_agreed": True, "signature": "TEST",
            },
        }
        r = api.post(f"{BASE_URL}/api/membership/apply", json=payload, headers=headers, timeout=60)
        assert r.status_code == 200, f"apply -> {r.status_code}: {r.text[:300]}"
        app_doc = r.json().get("application", {})
        app_id = app_doc.get("application_id")
        assert app_id, "no application_id returned"
        print(f"\n[refactor-test] created application_id={app_id}")

        # PDF should download for the owner via bearer auth
        pdf_r = api.get(f"{BASE_URL}/api/membership/forms/{app_id}.pdf", headers=headers, timeout=30)
        assert pdf_r.status_code == 200, f"pdf GET -> {pdf_r.status_code}: {pdf_r.text[:200]}"
        assert pdf_r.headers.get("content-type", "").startswith("application/pdf"), \
            f"wrong content-type: {pdf_r.headers.get('content-type')}"
        assert pdf_r.content[:5] == b"%PDF-", "response is not a PDF"

        # applications/me must include this one
        me_r = api.get(f"{BASE_URL}/api/membership/applications/me", headers=headers, timeout=20)
        assert me_r.status_code == 200
        ids = {a.get("application_id") for a in me_r.json().get("applications", [])}
        assert app_id in ids, f"new application {app_id} not in /me list"
