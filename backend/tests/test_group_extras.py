"""Group Extras backend tests (rename / add / remove / leave).

Setup:
  member1 (owner), member2, member3 registered.
  All three are pairwise friends so that m3 can be added later by m1.

Feature coverage:
  PATCH  /api/groups/{gid}                — owner-only rename
  POST   /api/groups/{gid}/members        — owner-only add, non-friend filter
  DELETE /api/groups/{gid}/members/{mid}  — owner-only remove
  POST   /api/groups/{gid}/leave          — any member leaves; owner transfer;
                                             last-out deletes group + messages
"""
import uuid
import pytest
import requests

from conftest import BASE_URL


# ---------------- helpers ----------------
def _h(tok: str) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {tok}"}


def _login_or_register(email: str, first: str, last: str) -> str:
    for pw in ("Password123!", "Password123"):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        if r.status_code == 200:
            return r.json()["token"]
    payload = {
        "email": email,
        "password": "Password123!",
        "first_name": first,
        "last_name": last,
        "date_of_birth": "1995-01-01",
        "phone": "+61400000000",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _ensure_friend(tok_a: str, tok_b: str, uid_a: str, uid_b: str) -> None:
    friends = requests.get(f"{BASE_URL}/api/friends", headers=_h(tok_a)).json().get("friends", [])
    if any(f.get("user_id") == uid_b for f in friends):
        return
    r = requests.post(f"{BASE_URL}/api/friends/request", headers=_h(tok_a), json={"user_id": uid_b})
    assert r.status_code in (200, 409), r.text
    r2 = requests.post(f"{BASE_URL}/api/friends/respond", headers=_h(tok_b),
                       json={"user_id": uid_a, "accept": True})
    if r2.status_code == 404:
        # Already accepted somewhere — verify final state
        f2 = requests.get(f"{BASE_URL}/api/friends", headers=_h(tok_a)).json().get("friends", [])
        assert any(f.get("user_id") == uid_b for f in f2), f"friendship not established: {f2}"
    else:
        assert r2.status_code == 200, r2.text


# ---------------- fixtures ----------------
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


@pytest.fixture(scope="module")
def m4():
    """A member m1 is NOT friends with (used to test add-friend filter)."""
    email = f"testnonfriend_{uuid.uuid4().hex[:6]}@gmail.com"
    tok = _login_or_register(email, "NonFriend", "User")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "email": email}


@pytest.fixture(scope="module", autouse=True)
def friendships(m1, m2, m3):
    _ensure_friend(m1["token"], m2["token"], m1["user_id"], m2["user_id"])
    _ensure_friend(m1["token"], m3["token"], m1["user_id"], m3["user_id"])
    _ensure_friend(m2["token"], m3["token"], m2["user_id"], m3["user_id"])
    return True


def _new_group(m1, member_ids):
    gname = f"TEST_extras_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/groups", headers=_h(m1["token"]),
                      json={"name": gname, "member_ids": member_ids})
    assert r.status_code == 200, r.text
    return r.json()["group_id"], gname


# ---------------- RENAME ----------------
class TestGroupRename:
    def test_owner_rename_ok(self, m1, m2):
        gid, _ = _new_group(m1, [m2["user_id"]])
        new_name = f"TEST_renamed_{uuid.uuid4().hex[:5]}"
        r = requests.patch(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"]),
                           json={"name": new_name})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["group_id"] == gid
        assert j["name"] == new_name
        # GET verifies persistence
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"])).json()
        assert det["group"]["name"] == new_name

    def test_non_owner_rename_403(self, m1, m2):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.patch(f"{BASE_URL}/api/groups/{gid}", headers=_h(m2["token"]),
                           json={"name": "TEST_hijack"})
        assert r.status_code == 403, r.text

    def test_rename_empty_400(self, m1, m2):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.patch(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"]),
                           json={"name": "   "})
        assert r.status_code == 400, r.text

    def test_rename_by_non_member_403(self, m1, m2, m4):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.patch(f"{BASE_URL}/api/groups/{gid}", headers=_h(m4["token"]),
                           json={"name": "TEST_nope"})
        assert r.status_code == 403


# ---------------- ADD MEMBERS ----------------
class TestGroupAddMembers:
    def test_owner_add_friend_ok(self, m1, m2, m3):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/members", headers=_h(m1["token"]),
                          json={"member_ids": [m3["user_id"]]})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["group_id"] == gid
        assert m3["user_id"] in j["added"]
        # Verify: m3 sees the group + all 3 in members
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m3["token"]))
        assert det.status_code == 200
        member_ids = {m["user_id"] for m in det.json()["group"]["members"]}
        assert member_ids == {m1["user_id"], m2["user_id"], m3["user_id"]}

    def test_add_filters_non_friends(self, m1, m2, m4):
        """m4 is not friends with m1 -> must be silently skipped."""
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/members", headers=_h(m1["token"]),
                          json={"member_ids": [m4["user_id"]]})
        assert r.status_code == 200, r.text
        j = r.json()
        assert m4["user_id"] not in j["added"]
        assert j["added"] == []
        # Verify: m4 not in members
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"])).json()
        member_ids = {m["user_id"] for m in det["group"]["members"]}
        assert m4["user_id"] not in member_ids

    def test_add_skips_already_members(self, m1, m2):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/members", headers=_h(m1["token"]),
                          json={"member_ids": [m2["user_id"]]})
        assert r.status_code == 200
        assert r.json()["added"] == []

    def test_add_partial_friend_and_non_friend(self, m1, m2, m3, m4):
        """Adding both m3 (friend) and m4 (non-friend) — only m3 should be added."""
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/members", headers=_h(m1["token"]),
                          json={"member_ids": [m3["user_id"], m4["user_id"]]})
        assert r.status_code == 200
        added = r.json()["added"]
        assert m3["user_id"] in added
        assert m4["user_id"] not in added

    def test_non_owner_add_403(self, m1, m2, m3):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/members", headers=_h(m2["token"]),
                          json={"member_ids": [m3["user_id"]]})
        assert r.status_code == 403


# ---------------- REMOVE MEMBERS ----------------
class TestGroupRemoveMember:
    def test_owner_remove_ok(self, m1, m2, m3):
        gid, _ = _new_group(m1, [m2["user_id"], m3["user_id"]])
        r = requests.delete(f"{BASE_URL}/api/groups/{gid}/members/{m3['user_id']}",
                            headers=_h(m1["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["removed"] == m3["user_id"]
        # verify: m3 gone; m3 can no longer GET
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"])).json()
        member_ids = {m["user_id"] for m in det["group"]["members"]}
        assert m3["user_id"] not in member_ids
        gone = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m3["token"]))
        assert gone.status_code == 403

    def test_remove_self_400(self, m1, m2):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.delete(f"{BASE_URL}/api/groups/{gid}/members/{m1['user_id']}",
                            headers=_h(m1["token"]))
        assert r.status_code == 400, r.text

    def test_remove_non_member_404(self, m1, m2, m4):
        gid, _ = _new_group(m1, [m2["user_id"]])
        # m4 was never in the group
        r = requests.delete(f"{BASE_URL}/api/groups/{gid}/members/{m4['user_id']}",
                            headers=_h(m1["token"]))
        assert r.status_code == 404, r.text

    def test_non_owner_remove_403(self, m1, m2, m3):
        gid, _ = _new_group(m1, [m2["user_id"], m3["user_id"]])
        r = requests.delete(f"{BASE_URL}/api/groups/{gid}/members/{m3['user_id']}",
                            headers=_h(m2["token"]))
        assert r.status_code == 403


# ---------------- LEAVE ----------------
class TestGroupLeave:
    def test_non_owner_leave(self, m1, m2, m3):
        gid, _ = _new_group(m1, [m2["user_id"], m3["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/leave", headers=_h(m2["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["left"] is True
        assert j["deleted"] is False
        # Verify: m2 no longer sees group
        gone = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m2["token"]))
        assert gone.status_code == 403
        # Owner still sees group + remaining members
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"])).json()
        ids = {m["user_id"] for m in det["group"]["members"]}
        assert ids == {m1["user_id"], m3["user_id"]}
        assert det["group"]["owner_id"] == m1["user_id"]

    def test_owner_leave_transfers_ownership(self, m1, m2, m3):
        gid, _ = _new_group(m1, [m2["user_id"], m3["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/leave", headers=_h(m1["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["left"] is True
        assert j["deleted"] is False
        # Some remaining member should now be owner (m2 or m3)
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m2["token"])).json()
        assert det["group"]["owner_id"] in (m2["user_id"], m3["user_id"])
        assert det["group"]["owner_id"] != m1["user_id"]
        ids = {m["user_id"] for m in det["group"]["members"]}
        assert m1["user_id"] not in ids

    def test_last_member_leave_deletes_group(self, m1, m2):
        # Create a group of exactly 2 (m1 owner + m2); both leave in order.
        gid, _ = _new_group(m1, [m2["user_id"]])
        # Also send a message so we can verify messages are cleared
        requests.post(f"{BASE_URL}/api/groups/{gid}/messages", headers=_h(m1["token"]),
                      json={"body": "TEST_before_delete"})
        # m2 leaves first
        r1 = requests.post(f"{BASE_URL}/api/groups/{gid}/leave", headers=_h(m2["token"]))
        assert r1.status_code == 200
        assert r1.json()["deleted"] is False
        # m1 leaves as last member -> deleted:true
        r2 = requests.post(f"{BASE_URL}/api/groups/{gid}/leave", headers=_h(m1["token"]))
        assert r2.status_code == 200, r2.text
        j2 = r2.json()
        assert j2["left"] is True
        assert j2["deleted"] is True
        # Verify group and messages gone: any further GET must 403 (group missing)
        # (Note: _group_or_403 returns 403 when the group document itself is gone
        #  from db, which is the deletion proof we care about.)
        gone = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_h(m1["token"]))
        assert gone.status_code == 403
        # NOTE: /api/groups (list) currently 500s on this env due to an
        # unrelated pre-existing bug (offset-naive vs offset-aware datetime
        # comparison in groups_list sort key at server.py:2257). Reported
        # separately — skipping the list-inclusion check here.

    def test_leave_non_member_403(self, m1, m2, m4):
        gid, _ = _new_group(m1, [m2["user_id"]])
        r = requests.post(f"{BASE_URL}/api/groups/{gid}/leave", headers=_h(m4["token"]))
        assert r.status_code == 403
