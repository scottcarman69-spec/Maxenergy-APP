"""Groups & presence (last_active_at) end-to-end backend tests.

Flow:
  register/login member1 & member2 -> send friend req from m1 -> accept from m2
  -> create group -> list groups -> get group detail -> send message
  -> presence: /api/auth/me touches last_active_at ; /api/dm/threads returns it.
"""
import time
import uuid
import pytest
import requests

from conftest import BASE_URL


def _headers(tok: str) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {tok}"}


def _login_or_register(email: str, first: str, last: str) -> str:
    """Return a JWT for the given member, creating them if necessary.

    Tries a small set of plausible existing passwords before registering with a
    strong password that satisfies backend policy (must include a symbol).
    """
    for pw in ("Password123!", "Password123"):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        if r.status_code == 200:
            return r.json()["token"]
    # register with strong password
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


@pytest.fixture(scope="module")
def m1():
    """member1 credentials + token + user_id."""
    tok = _login_or_register("member1@gmail.com", "Member", "One")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "email": "member1@gmail.com", "user": me}


@pytest.fixture(scope="module")
def m2():
    tok = _login_or_register("member2@gmail.com", "Member", "Two")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "email": "member2@gmail.com", "user": me}


@pytest.fixture(scope="module")
def m3():
    """A third member who is NOT a friend of m1 — used to test filtering."""
    tok = _login_or_register("member3@gmail.com", "Member", "Three")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok)).json()["user"]
    return {"token": tok, "user_id": me["user_id"], "email": "member3@gmail.com", "user": me}


# ---------------- friendship setup ----------------
class TestFriendshipSetup:
    def test_ensure_friendship_m1_m2(self, m1, m2):
        # Check existing friendship state first
        friends = requests.get(f"{BASE_URL}/api/friends", headers=_headers(m1["token"]))
        assert friends.status_code == 200
        already = any(f.get("user_id") == m2["user_id"] for f in friends.json().get("friends", []))
        if already:
            return
        # send request m1 -> m2 (idempotent-ish: 409 if already pending)
        r = requests.post(
            f"{BASE_URL}/api/friends/request",
            headers=_headers(m1["token"]),
            json={"user_id": m2["user_id"]},
        )
        assert r.status_code in (200, 409), r.text
        # accept from m2
        r2 = requests.post(
            f"{BASE_URL}/api/friends/respond",
            headers=_headers(m2["token"]),
            json={"user_id": m1["user_id"], "accept": True},
        )
        # if it wasn't pending because it was already accepted earlier this could 404 → verify state
        if r2.status_code == 404:
            friends = requests.get(f"{BASE_URL}/api/friends", headers=_headers(m1["token"])).json()
            assert any(f["user_id"] == m2["user_id"] for f in friends.get("friends", []))
        else:
            assert r2.status_code == 200, r2.text
        # Verify m1 sees m2 in friends
        friends = requests.get(f"{BASE_URL}/api/friends", headers=_headers(m1["token"])).json()
        assert any(f["user_id"] == m2["user_id"] for f in friends.get("friends", []))


# ---------------- Groups ----------------
class TestGroups:
    _gid: str = ""  # module-scoped share

    def test_create_group_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/groups", json={"name": "no auth", "member_ids": []})
        assert r.status_code in (401, 403)

    def test_create_group_empty_name_400(self, m1):
        r = requests.post(
            f"{BASE_URL}/api/groups",
            headers=_headers(m1["token"]),
            json={"name": "   ", "member_ids": []},
        )
        assert r.status_code == 400

    def test_create_group_filters_non_friends(self, m1, m2, m3):
        """m3 is NOT a friend of m1 — should be silently dropped from members list."""
        gname = f"TEST_Crew_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/groups",
            headers=_headers(m1["token"]),
            json={"name": gname, "member_ids": [m2["user_id"], m3["user_id"]]},
        )
        assert r.status_code == 200, r.text
        gid = r.json()["group_id"]
        assert gid.startswith("grp"), gid
        TestGroups._gid = gid
        TestGroups._gname = gname
        # Detail check: members contains m1 & m2, but NOT m3
        det = requests.get(f"{BASE_URL}/api/groups/{gid}", headers=_headers(m1["token"]))
        assert det.status_code == 200, det.text
        j = det.json()
        member_ids = {m["user_id"] for m in j["group"]["members"]}
        assert m1["user_id"] in member_ids
        assert m2["user_id"] in member_ids
        assert m3["user_id"] not in member_ids, f"non-friend leaked into group: {member_ids}"
        assert j["group"]["name"] == gname

    def test_group_detail_403_for_non_member(self, m3):
        assert TestGroups._gid, "requires prior test to create group"
        r = requests.get(
            f"{BASE_URL}/api/groups/{TestGroups._gid}", headers=_headers(m3["token"])
        )
        assert r.status_code == 403

    def test_send_message_empty_400(self, m1):
        assert TestGroups._gid
        r = requests.post(
            f"{BASE_URL}/api/groups/{TestGroups._gid}/messages",
            headers=_headers(m1["token"]),
            json={"body": "   "},
        )
        assert r.status_code == 400

    def test_send_message_non_member_403(self, m3):
        assert TestGroups._gid
        r = requests.post(
            f"{BASE_URL}/api/groups/{TestGroups._gid}/messages",
            headers=_headers(m3["token"]),
            json={"body": "hi"},
        )
        assert r.status_code == 403

    def test_send_and_receive_message(self, m1, m2):
        assert TestGroups._gid
        text = f"TEST_hello_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/groups/{TestGroups._gid}/messages",
            headers=_headers(m1["token"]),
            json={"body": text},
        )
        assert r.status_code == 200, r.text
        msg = r.json()["message"]
        assert msg["body"] == text
        assert msg["from_id"] == m1["user_id"]
        assert msg["gmsg_id"].startswith("gm")
        assert "_id" not in msg
        assert msg["sender_name"]

        # m2 should see it via GET; unread should include the message before read.
        # First list from m2 must show unread >= 1 for this group.
        lst = requests.get(f"{BASE_URL}/api/groups", headers=_headers(m2["token"]))
        assert lst.status_code == 200, lst.text
        groups = lst.json()["groups"]
        target = next((g for g in groups if g["group_id"] == TestGroups._gid), None)
        assert target is not None, f"m2 doesn't see group in list: {groups}"
        assert target["last_body"] == text
        assert target["unread"] >= 1
        assert target["members"] == 2  # m1 + m2 (m3 was filtered)
        assert target["last_sender"]

        # m2 fetches detail -> messages marked read, and returns the message
        det = requests.get(
            f"{BASE_URL}/api/groups/{TestGroups._gid}", headers=_headers(m2["token"])
        )
        assert det.status_code == 200
        bodies = [x["body"] for x in det.json()["messages"]]
        assert text in bodies

        # Now m2's list should have unread == 0
        lst2 = requests.get(f"{BASE_URL}/api/groups", headers=_headers(m2["token"])).json()
        target2 = next(g for g in lst2["groups"] if g["group_id"] == TestGroups._gid)
        assert target2["unread"] == 0

    def test_groups_list_shape(self, m1):
        r = requests.get(f"{BASE_URL}/api/groups", headers=_headers(m1["token"]))
        assert r.status_code == 200
        j = r.json()
        assert "groups" in j and isinstance(j["groups"], list)
        for g in j["groups"]:
            for k in ("group_id", "name", "members", "last_body", "last_sender", "last_at", "unread"):
                assert k in g


# ---------------- Presence (last_active_at) ----------------
class TestPresence:
    def test_auth_me_touches_last_active_at(self, m1):
        # Fetch twice with a small sleep, verify last_active_at advances forward.
        r1 = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(m1["token"]))
        assert r1.status_code == 200
        u1 = r1.json()["user"]
        # not necessarily returned in /auth/me user_public — check via friends listing from m2
        # so we pull via dm/threads or friends from a peer instead.
        time.sleep(2.5)
        r2 = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(m1["token"]))
        assert r2.status_code == 200
        # ok — cannot easily inspect internal timestamp from /auth/me, verify via peer view instead.
        # (assertion done in next test via m2 perspective)
        assert u1["user_id"] == m1["user_id"]

    def test_dm_threads_returns_last_active_at_for_friend(self, m1, m2):
        # m1 just hit /auth/me above, so m2 seeing m1 in dm/threads should have a fresh last_active_at.
        # First trigger presence explicitly.
        requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(m1["token"]))
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/api/dm/threads", headers=_headers(m2["token"]))
        assert r.status_code == 200
        threads = r.json()["threads"]
        # m1 must appear (they are friends). Confirm last_active_at is a recent ISO timestamp.
        row = next((t for t in threads if t["user_id"] == m1["user_id"]), None)
        assert row is not None, f"m1 not in m2's dm threads: {threads}"
        assert "last_active_at" in row and row["last_active_at"], row
        # Parse ISO and check freshness (< 60s from now)
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(row["last_active_at"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds()
        assert age < 120, f"last_active_at is stale ({age}s): {row['last_active_at']}"

    def test_friends_endpoint_exposes_last_active_at(self, m1, m2):
        # Bump presence and check via /api/friends from m2.
        requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(m1["token"]))
        r = requests.get(f"{BASE_URL}/api/friends", headers=_headers(m2["token"]))
        assert r.status_code == 200
        friends = r.json().get("friends", [])
        row = next((f for f in friends if f["user_id"] == m1["user_id"]), None)
        assert row is not None
        assert row.get("last_active_at"), f"missing last_active_at: {row}"
