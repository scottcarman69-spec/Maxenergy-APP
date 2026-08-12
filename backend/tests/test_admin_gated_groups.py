"""Backend tests for admin-gated group creation + exclusive 'Muay Thai Academy' join flow.

Feature coverage:
  POST /api/groups (admin)            -> instant create {group_id, pending:false}
  POST /api/groups (member)           -> {group_id:null, pending:true}, creates pending greq
  GET  /api/admin/group-requests      -> create_requests[] + join_requests[] + count
  POST /api/admin/group-requests/{id}/approve  -> creates group with requester as owner
  POST /api/admin/group-requests/{id}/decline  -> no group created
  GET  /api/groups/discover           -> lists official groups with is_member + join_status
  POST /api/groups/{gid}/join         -> pending join request; already-member -> 400
  POST /api/admin/group-join-requests/{id}/approve -> member added; decline -> not added
  GET  /api/admin/overview            -> group_requests = pending create + join count
  Muay Thai Academy is auto-seeded as grp_muaythai_academy / is_official=true
"""
import uuid
import time
import pytest
import requests

from conftest import BASE_URL


ADMIN_EMAIL = "admin@maxenergy.com.au"
ADMIN_PASSWORD = "MaxAdmin123!"


def _h(tok: str) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {tok}"}


def _login_or_register(email: str, first: str, last: str) -> str:
    for pw in ("Password123!", "Password123"):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        if r.status_code == 200:
            return r.json()["token"]
    payload = {
        "email": email, "password": "Password123!",
        "first_name": first, "last_name": last,
        "date_of_birth": "1995-01-01", "phone": "+61400000000",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _admin_token() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _ensure_friend(tok_a: str, tok_b: str, uid_a: str, uid_b: str) -> None:
    friends = requests.get(f"{BASE_URL}/api/friends", headers=_h(tok_a)).json().get("friends", [])
    if any(f.get("user_id") == uid_b for f in friends):
        return
    r = requests.post(f"{BASE_URL}/api/friends/request", headers=_h(tok_a),
                      json={"user_id": uid_b})
    assert r.status_code in (200, 409), r.text
    r2 = requests.post(f"{BASE_URL}/api/friends/respond", headers=_h(tok_b),
                       json={"user_id": uid_a, "accept": True})
    if r2.status_code == 404:
        f2 = requests.get(f"{BASE_URL}/api/friends", headers=_h(tok_a)).json().get("friends", [])
        assert any(f.get("user_id") == uid_b for f in f2)
    else:
        assert r2.status_code == 200, r2.text


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin():
    tok = _admin_token()
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "is_admin": True}


@pytest.fixture(scope="module")
def m1():
    tok = _login_or_register("member1@gmail.com", "Member", "One")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "email": "member1@gmail.com"}


@pytest.fixture(scope="module")
def m2():
    tok = _login_or_register("member2@gmail.com", "Member", "Two")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "email": "member2@gmail.com"}


@pytest.fixture(scope="module")
def m3():
    tok = _login_or_register("member3@gmail.com", "Member", "Three")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "email": "member3@gmail.com"}


@pytest.fixture(scope="module", autouse=True)
def friendships(m1, m2, m3):
    _ensure_friend(m1["token"], m2["token"], m1["user_id"], m2["user_id"])
    _ensure_friend(m1["token"], m3["token"], m1["user_id"], m3["user_id"])
    return True


# ---------- helper: clean up any leftover created-group requests for m1 ----------
@pytest.fixture(scope="module", autouse=True)
def _cleanup_pending_requests_start(admin, m1):
    """Approve/decline pre-existing pending greqs for member1 so tests start clean."""
    r = requests.get(f"{BASE_URL}/api/admin/group-requests", headers=_h(admin["token"]))
    if r.status_code == 200:
        for creq in r.json().get("create_requests", []):
            # Decline anything with TEST_ prefix or member1 leftovers
            if creq.get("name", "").startswith("TEST_"):
                requests.post(
                    f"{BASE_URL}/api/admin/group-requests/{creq['request_id']}/decline",
                    headers=_h(admin["token"]))
        for jreq in r.json().get("join_requests", []):
            # Only clean TEST-owned join requests -- but grp_muaythai_academy join by m1 may exist
            # Decline any pending m1 join request so the discover/join flow starts clean
            if jreq.get("member_email") == "member1@gmail.com":
                requests.post(
                    f"{BASE_URL}/api/admin/group-join-requests/{jreq['request_id']}/decline",
                    headers=_h(admin["token"]))
    # Also ensure m1 is NOT already a member of Muay Thai Academy — if they are, leave.
    det = requests.get(f"{BASE_URL}/api/groups/grp_muaythai_academy", headers=_h(m1["token"]))
    if det.status_code == 200:
        requests.post(f"{BASE_URL}/api/groups/grp_muaythai_academy/leave",
                      headers=_h(m1["token"]))
    yield


# ================ Admin instant-create ================
class TestAdminInstantCreate:
    def test_admin_creates_group_instantly(self, admin):
        name = f"TEST_admin_grp_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/groups", headers=_h(admin["token"]),
                          json={"name": name, "member_ids": []})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["pending"] is False
        assert j["group_id"], j
        # Verify: admin can GET this group
        det = requests.get(f"{BASE_URL}/api/groups/{j['group_id']}",
                           headers=_h(admin["token"]))
        assert det.status_code == 200
        assert det.json()["group"]["name"] == name
        assert det.json()["group"]["owner_id"] == admin["user_id"]
        # cleanup
        requests.post(f"{BASE_URL}/api/groups/{j['group_id']}/leave", headers=_h(admin["token"]))


# ================ Member request flow ================
class TestMemberRequestFlow:
    def test_member_create_returns_pending(self, m1, m2, admin):
        name = f"TEST_mreq_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/groups", headers=_h(m1["token"]),
                          json={"name": name, "member_ids": [m2["user_id"]]})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["pending"] is True
        assert j["group_id"] is None
        # Verify: admin sees a pending create request with correct data
        rr = requests.get(f"{BASE_URL}/api/admin/group-requests",
                          headers=_h(admin["token"]))
        assert rr.status_code == 200
        creqs = rr.json()["create_requests"]
        mine = [c for c in creqs if c["name"] == name]
        assert mine, f"pending request not returned: {creqs}"
        c = mine[0]
        assert c["requester_name"]
        assert c["member_count"] == 2  # m1 + m2
        # Verify: member does NOT yet see this group in their list
        gl = requests.get(f"{BASE_URL}/api/groups", headers=_h(m1["token"]))
        if gl.status_code == 200:
            names = [g["name"] for g in gl.json().get("groups", [])]
            assert name not in names
        # cleanup — decline
        requests.post(
            f"{BASE_URL}/api/admin/group-requests/{c['request_id']}/decline",
            headers=_h(admin["token"]))

    def test_admin_approve_makes_requester_owner(self, m1, m2, admin):
        name = f"TEST_approve_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/groups", headers=_h(m1["token"]),
                          json={"name": name, "member_ids": [m2["user_id"]]})
        assert r.status_code == 200 and r.json()["pending"] is True
        # find our pending req_id
        rr = requests.get(f"{BASE_URL}/api/admin/group-requests",
                          headers=_h(admin["token"])).json()
        creq = next(c for c in rr["create_requests"] if c["name"] == name)
        req_id = creq["request_id"]
        # approve
        ap = requests.post(
            f"{BASE_URL}/api/admin/group-requests/{req_id}/approve",
            headers=_h(admin["token"]))
        assert ap.status_code == 200, ap.text
        gid = ap.json()["group_id"]
        assert gid
        # requester must be the owner
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"]))
        assert det.status_code == 200
        assert det.json()["group"]["owner_id"] == m1["user_id"]
        member_ids = {m["user_id"] for m in det.json()["group"]["members"]}
        assert m1["user_id"] in member_ids
        assert m2["user_id"] in member_ids
        # Approving same request again -> 404 (already handled)
        again = requests.post(
            f"{BASE_URL}/api/admin/group-requests/{req_id}/approve",
            headers=_h(admin["token"]))
        assert again.status_code == 404
        # cleanup
        requests.post(f"{BASE_URL}/api/groups/{gid}/leave", headers=_h(m2["token"]))
        requests.post(f"{BASE_URL}/api/groups/{gid}/leave", headers=_h(m1["token"]))

    def test_admin_decline_creates_no_group(self, m1, m2, admin):
        name = f"TEST_decline_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/groups", headers=_h(m1["token"]),
                          json={"name": name, "member_ids": [m2["user_id"]]})
        assert r.status_code == 200 and r.json()["pending"] is True
        rr = requests.get(f"{BASE_URL}/api/admin/group-requests",
                          headers=_h(admin["token"])).json()
        creq = next(c for c in rr["create_requests"] if c["name"] == name)
        req_id = creq["request_id"]
        dec = requests.post(
            f"{BASE_URL}/api/admin/group-requests/{req_id}/decline",
            headers=_h(admin["token"]))
        assert dec.status_code == 200
        # Verify: no group with that name for m1
        gl = requests.get(f"{BASE_URL}/api/groups", headers=_h(m1["token"]))
        if gl.status_code == 200:
            names = [g["name"] for g in gl.json().get("groups", [])]
            assert name not in names
        # Also: the request no longer appears as pending
        rr2 = requests.get(f"{BASE_URL}/api/admin/group-requests",
                           headers=_h(admin["token"])).json()
        assert not any(c["request_id"] == req_id for c in rr2["create_requests"])


# ================ Muay Thai Academy exclusive join flow ================
class TestMuayThaiAcademyJoin:
    def test_seeded_official_group_exists(self, m1):
        r = requests.get(f"{BASE_URL}/api/groups/discover", headers=_h(m1["token"]))
        assert r.status_code == 200, r.text
        gs = r.json().get("groups", [])
        mt = next((g for g in gs if g["group_id"] == "grp_muaythai_academy"), None)
        assert mt is not None, f"Muay Thai Academy not seeded: {gs}"
        assert mt["name"] == "Muay Thai Academy"
        assert mt["is_official"] is True
        assert mt.get("slug") == "muay-thai-academy"
        # m1 should not be a member yet (autouse cleanup ensures it) -> status none
        assert mt["is_member"] is False
        assert mt["join_status"] == "none"

    def test_member_join_creates_pending_then_shown_pending(self, m1):
        r = requests.post(f"{BASE_URL}/api/groups/grp_muaythai_academy/join",
                          headers=_h(m1["token"]))
        assert r.status_code == 200, r.text
        assert r.json().get("pending") is True
        # discover now shows pending
        d = requests.get(f"{BASE_URL}/api/groups/discover", headers=_h(m1["token"])).json()
        mt = next(g for g in d["groups"] if g["group_id"] == "grp_muaythai_academy")
        assert mt["join_status"] == "pending"

    def test_admin_sees_join_request(self, admin, m1):
        rr = requests.get(f"{BASE_URL}/api/admin/group-requests",
                          headers=_h(admin["token"])).json()
        joins = rr["join_requests"]
        mine = [j for j in joins if j.get("member_email") == m1["email"]
                and j.get("group_id") == "grp_muaythai_academy"]
        assert mine, f"m1 join req not visible: {joins}"
        assert mine[0]["group_name"] == "Muay Thai Academy"
        assert mine[0]["member_name"]

    def test_admin_overview_group_requests_count(self, admin):
        r = requests.get(f"{BASE_URL}/api/admin/overview", headers=_h(admin["token"]))
        assert r.status_code == 200
        assert isinstance(r.json().get("group_requests"), int)
        assert r.json()["group_requests"] >= 1  # our pending join_request

    def test_join_when_already_pending_returns_pending(self, m1):
        """Second call while pending must not error and should still return pending."""
        r = requests.post(f"{BASE_URL}/api/groups/grp_muaythai_academy/join",
                          headers=_h(m1["token"]))
        assert r.status_code == 200
        assert r.json().get("pending") is True

    def test_admin_approve_join_adds_member(self, admin, m1):
        rr = requests.get(f"{BASE_URL}/api/admin/group-requests",
                          headers=_h(admin["token"])).json()
        mine = next(j for j in rr["join_requests"]
                    if j.get("member_email") == m1["email"]
                    and j["group_id"] == "grp_muaythai_academy")
        ap = requests.post(
            f"{BASE_URL}/api/admin/group-join-requests/{mine['request_id']}/approve",
            headers=_h(admin["token"]))
        assert ap.status_code == 200, ap.text
        # m1 should now be able to GET the group
        det = requests.get(f"{BASE_URL}/api/groups/grp_muaythai_academy",
                           headers=_h(m1["token"]))
        assert det.status_code == 200
        member_ids = {m["user_id"] for m in det.json()["group"]["members"]}
        assert m1["user_id"] in member_ids
        # discover now shows member
        d = requests.get(f"{BASE_URL}/api/groups/discover", headers=_h(m1["token"])).json()
        mt = next(g for g in d["groups"] if g["group_id"] == "grp_muaythai_academy")
        assert mt["join_status"] == "member"
        assert mt["is_member"] is True

    def test_join_when_already_member_returns_400(self, m1):
        r = requests.post(f"{BASE_URL}/api/groups/grp_muaythai_academy/join",
                          headers=_h(m1["token"]))
        assert r.status_code == 400

    def test_decline_join_request_does_not_add(self, m2, m3, admin):
        """m3 requests to join -> admin declines -> m3 must NOT become a member."""
        # ensure m3 is not a member (fresh account might be, but seed only adds admins)
        # File a fresh join req
        req = requests.post(f"{BASE_URL}/api/groups/grp_muaythai_academy/join",
                            headers=_h(m3["token"]))
        assert req.status_code == 200
        # locate the pending
        rr = requests.get(f"{BASE_URL}/api/admin/group-requests",
                          headers=_h(admin["token"])).json()
        mine = next((j for j in rr["join_requests"]
                     if j.get("member_email") == m3["email"]
                     and j["group_id"] == "grp_muaythai_academy"), None)
        assert mine is not None
        dec = requests.post(
            f"{BASE_URL}/api/admin/group-join-requests/{mine['request_id']}/decline",
            headers=_h(admin["token"]))
        assert dec.status_code == 200
        # m3 must not have access
        det = requests.get(f"{BASE_URL}/api/groups/grp_muaythai_academy",
                           headers=_h(m3["token"]))
        assert det.status_code == 403
        # discover shows status back to none
        d = requests.get(f"{BASE_URL}/api/groups/discover", headers=_h(m3["token"])).json()
        mt = next(g for g in d["groups"] if g["group_id"] == "grp_muaythai_academy")
        assert mt["join_status"] == "none"
        assert mt["is_member"] is False


# ================ Cleanup: remove m1 from Muay Thai Academy at end ================
@pytest.fixture(scope="module", autouse=True)
def _teardown_m1_muaythai(m1):
    yield
    # Best-effort cleanup: m1 leaves Muay Thai Academy if they joined during tests
    requests.post(f"{BASE_URL}/api/groups/grp_muaythai_academy/leave",
                  headers=_h(m1["token"]))
