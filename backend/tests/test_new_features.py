"""Backend tests for NEW features in Max Energy Muay Thai Academy API:
- Admin login + is_admin flag
- Classes category filter (Kids/Adults)
- Membership plans + application
- Announcements + Gym info
- Admin CRUD (classes, announcements, applications) + admin guards
- Regression: booking + Stripe checkout
"""
import uuid
import pytest
from datetime import datetime, timedelta, timezone


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token(api_client, base_url):
    r = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": "admin@maxenergy.com.au", "password": "MaxAdmin123!"},
    )
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    d = r.json()
    assert "token" in d and "user" in d
    assert d["user"].get("is_admin") is True, f"Admin is_admin false: {d['user']}"
    return d["token"]


@pytest.fixture(scope="module")
def member(api_client, base_url):
    email = f"TEST_member_{uuid.uuid4().hex[:8]}@gmail.com"
    password = "MemberPass123!"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"name": "Test Member", "email": email, "password": password},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {
        "email": email,
        "password": password,
        "token": d["token"],
        "user": d["user"],
    }


# ---------- Admin auth ----------
class TestAdminAuth:
    def test_admin_login_returns_is_admin(self, admin_token):
        assert admin_token  # already validated in fixture

    def test_auth_me_returns_is_admin(self, api_client, base_url, admin_token):
        r = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["is_admin"] is True
        assert u["email"] == "admin@maxenergy.com.au"

    def test_member_is_not_admin(self, api_client, base_url, member):
        r = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {member['token']}"},
        )
        assert r.status_code == 200
        assert r.json()["user"]["is_admin"] is False


# ---------- Classes category filter ----------
class TestClassesCategoryFilter:
    def test_kids_filter(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/classes", params={"category": "Kids"})
        assert r.status_code == 200
        rows = r.json()["classes"]
        assert len(rows) > 0, "No Kids classes returned"
        assert all(c["category"] == "Kids" for c in rows), \
            f"Non-Kids category in Kids filter: {set(c['category'] for c in rows)}"

    def test_adults_filter(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/classes", params={"category": "Adults"})
        assert r.status_code == 200
        rows = r.json()["classes"]
        assert len(rows) > 0
        assert all(c["category"] == "Adults" for c in rows)

    def test_no_filter_returns_all(self, api_client, base_url):
        r_all = api_client.get(f"{base_url}/api/classes")
        r_kids = api_client.get(f"{base_url}/api/classes", params={"category": "Kids"})
        r_adults = api_client.get(f"{base_url}/api/classes", params={"category": "Adults"})
        n_all = len(r_all.json()["classes"])
        n_kids = len(r_kids.json()["classes"])
        n_adults = len(r_adults.json()["classes"])
        assert n_all >= n_kids + n_adults
        assert n_all > 0


# ---------- Membership plans ----------
class TestMembershipPlans:
    def test_plans_returns_4(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/membership/plans")
        assert r.status_code == 200
        plans = r.json()["plans"]
        assert len(plans) == 4, f"Expected 4 plans, got {len(plans)}"
        names = {p["name"] for p in plans}
        expected = {"Kids Unlimited", "Adult Casual", "Adult 3x / Week", "Adult Unlimited"}
        assert expected.issubset(names), f"Missing plans: {expected - names}"
        # each plan has plan_id and price_display
        for p in plans:
            assert "plan_id" in p and "price_display" in p


# ---------- Announcements ----------
class TestAnnouncements:
    def test_announcements_sorted_pinned_first(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/announcements")
        assert r.status_code == 200
        rows = r.json()["announcements"]
        assert len(rows) >= 3, f"Expected seeded announcements, got {len(rows)}"
        # pinned first
        pinned_flags = [bool(a.get("pinned")) for a in rows]
        # Ensure not (a False appears before a True)
        assert pinned_flags == sorted(pinned_flags, reverse=True), \
            f"Announcements not pinned-first: {pinned_flags}"


# ---------- Gym Info ----------
class TestGymInfo:
    def test_gym_info_fields(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/gym/info")
        assert r.status_code == 200
        d = r.json()
        for k in ("name", "phone", "email", "address", "hours", "map_url"):
            assert d.get(k), f"Missing gym info field: {k}"
        assert "Max Energy" in d["name"]


# ---------- Membership Apply (member) ----------
class TestMembershipApply:
    def test_apply_creates_application_and_notification(self, api_client, base_url, member):
        plans = api_client.get(f"{base_url}/api/membership/plans").json()["plans"]
        # pick kids plan
        kids_plan = next(p for p in plans if p["name"] == "Kids Unlimited")
        h = {"Authorization": f"Bearer {member['token']}"}
        payload = {
            "plan_id": kids_plan["plan_id"],
            "full_name": "Test Applicant",
            "phone": "0400000000",
            "category": "Child 4-16",
            "experience": "Beginner",
            "message": "Excited to join!",
            "details": {
                "membership_type": "Unlimited",
                "term": "12 months",
                "how_found": "Instagram",
                "medical": {
                    "medications": {"asthma_inhaler": True},
                    "conditions": {"asthma": True},
                    "notes": "Mild seasonal asthma",
                },
                "media_consent": True,
                "waiver_agreed": True,
            },
        }
        r = api_client.post(f"{base_url}/api/membership/apply", json=payload, headers=h)
        assert r.status_code == 200, r.text
        app_doc = r.json()["application"]
        assert app_doc["status"] == "pending"
        assert app_doc["plan_id"] == kids_plan["plan_id"]
        assert app_doc["plan_name"] == "Kids Unlimited"
        assert app_doc["details"]["media_consent"] is True
        member["application_id"] = app_doc["application_id"]

        # Verify listed in /me
        r2 = api_client.get(f"{base_url}/api/membership/applications/me", headers=h)
        assert r2.status_code == 200
        apps = r2.json()["applications"]
        assert any(a["application_id"] == app_doc["application_id"] for a in apps)

        # Verify notification created
        nr = api_client.get(f"{base_url}/api/notifications", headers=h)
        assert nr.status_code == 200
        nots = nr.json()["notifications"]
        member_notifs = [n for n in nots if n.get("type") == "membership"]
        assert len(member_notifs) >= 1, "No membership notification created"


# ---------- Admin guards ----------
class TestAdminGuards:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/api/admin/overview"),
        ("GET", "/api/admin/classes"),
        ("GET", "/api/admin/applications"),
        ("POST", "/api/admin/classes"),
        ("POST", "/api/admin/announcements"),
    ])
    def test_no_token_rejected(self, api_client, base_url, method, path):
        r = api_client.request(method, f"{base_url}{path}", json={})
        assert r.status_code in (401, 403), f"{method} {path} status={r.status_code}"

    @pytest.mark.parametrize("method,path", [
        ("GET", "/api/admin/overview"),
        ("GET", "/api/admin/classes"),
        ("GET", "/api/admin/applications"),
        ("POST", "/api/admin/classes"),
        ("POST", "/api/admin/announcements"),
    ])
    def test_member_token_rejected(self, api_client, base_url, member, method, path):
        h = {"Authorization": f"Bearer {member['token']}"}
        r = api_client.request(method, f"{base_url}{path}", json={}, headers=h)
        assert r.status_code == 403, f"{method} {path} status={r.status_code} body={r.text}"


# ---------- Admin overview + CRUD ----------
class TestAdminOverviewAndCRUD:
    def test_admin_overview(self, api_client, base_url, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = api_client.get(f"{base_url}/api/admin/overview", headers=h)
        assert r.status_code == 200
        d = r.json()
        for k in ("classes", "members", "pending_applications", "announcements"):
            assert k in d, f"missing {k}"
            assert isinstance(d[k], int)
        assert d["classes"] > 0
        assert d["members"] >= 1

    def test_admin_class_crud(self, api_client, base_url, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        start_at = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        payload = {
            "name": "TEST_Admin_Class",
            "trainer": "Coach Test",
            "category": "Adults",
            "level": "All levels",
            "duration_min": 60,
            "price_cents": 3000,
            "start_at": start_at,
            "description": "Test class from pytest",
            "capacity": 12,
        }
        c = api_client.post(f"{base_url}/api/admin/classes", json=payload, headers=h)
        assert c.status_code == 200, c.text
        cls = c.json()["class"]
        cid = cls["class_id"]
        assert cls["name"] == "TEST_Admin_Class"

        # verify in listing
        lst = api_client.get(f"{base_url}/api/admin/classes", headers=h).json()["classes"]
        assert any(x["class_id"] == cid for x in lst)

        # update
        payload["name"] = "TEST_Admin_Class_Updated"
        payload["start_at"] = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        u = api_client.put(f"{base_url}/api/admin/classes/{cid}", json=payload, headers=h)
        assert u.status_code == 200, u.text
        assert u.json()["class"]["name"] == "TEST_Admin_Class_Updated"

        # delete
        dr = api_client.delete(f"{base_url}/api/admin/classes/{cid}", headers=h)
        assert dr.status_code == 200

        # confirm gone
        detail = api_client.get(f"{base_url}/api/classes/{cid}")
        assert detail.status_code == 404

    def test_admin_announcement_crud(self, api_client, base_url, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = api_client.post(
            f"{base_url}/api/admin/announcements",
            json={"title": "TEST_Notice", "body": "Test body", "pinned": False},
            headers=h,
        )
        assert r.status_code == 200, r.text
        ann = r.json()["announcement"]
        aid = ann["announcement_id"]

        # visible in public list
        pub = api_client.get(f"{base_url}/api/announcements").json()["announcements"]
        assert any(a["announcement_id"] == aid for a in pub)

        # delete
        d = api_client.delete(f"{base_url}/api/admin/announcements/{aid}", headers=h)
        assert d.status_code == 200

        pub2 = api_client.get(f"{base_url}/api/announcements").json()["announcements"]
        assert not any(a["announcement_id"] == aid for a in pub2)


# ---------- Admin applications review ----------
class TestAdminApplications:
    def test_list_and_approve_application(self, api_client, base_url, admin_token, member):
        # member should have an application from earlier test
        assert member.get("application_id"), "No application submitted; ordering issue"
        h = {"Authorization": f"Bearer {admin_token}"}
        r = api_client.get(f"{base_url}/api/admin/applications", headers=h)
        assert r.status_code == 200
        apps = r.json()["applications"]
        assert any(a["application_id"] == member["application_id"] for a in apps)

        # Approve
        aid = member["application_id"]
        sr = api_client.post(
            f"{base_url}/api/admin/applications/{aid}/status",
            json={"status": "approved"},
            headers=h,
        )
        assert sr.status_code == 200, sr.text

        # Verify status updated
        r2 = api_client.get(f"{base_url}/api/admin/applications", headers=h)
        updated = next(a for a in r2.json()["applications"] if a["application_id"] == aid)
        assert updated["status"] == "approved"

        # Verify member got notification
        mh = {"Authorization": f"Bearer {member['token']}"}
        nr = api_client.get(f"{base_url}/api/notifications", headers=mh)
        titles = [n["title"] for n in nr.json()["notifications"]]
        assert any("approved" in t.lower() for t in titles), f"Titles: {titles}"


# ---------- Regression: bookings + stripe ----------
class TestBookingPaymentsRegression:
    def test_booking_and_checkout_flow(self, api_client, base_url, member):
        h = {"Authorization": f"Bearer {member['token']}"}
        classes = api_client.get(f"{base_url}/api/classes").json()["classes"]
        cid = classes[0]["class_id"]
        b = api_client.post(f"{base_url}/api/bookings", json={"class_id": cid}, headers=h)
        assert b.status_code == 200, b.text
        bid = b.json()["booking"]["booking_id"]

        c = api_client.post(
            f"{base_url}/api/payments/checkout",
            json={"booking_id": bid, "origin_url": base_url},
            headers=h,
        )
        assert c.status_code == 200, c.text
        d = c.json()
        assert d.get("url", "").startswith("https://")
        sid = d["session_id"]

        s = api_client.get(f"{base_url}/api/payments/status/{sid}", headers=h)
        assert s.status_code == 200
        assert "payment_status" in s.json()
