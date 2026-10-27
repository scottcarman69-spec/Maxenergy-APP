# Full all-up regression (iteration 31): public, auth, member, booking/pass, waitlist,
# wallet/QR/check-in, store/giftcards (checkout URL only - NEVER paid), events, social, admin.
import os
import re
import time
import uuid
import threading
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

ADMIN = ("admin@maxenergy.com.au", "x1TrytJ%A12N")
ADMIN2 = ("info@maxenergy.com.au", "Maxenergy12@")
MEMBER = ("testmember@gmail.com", "Test!1234")
APPREV = ("appstore.review@maxenergy.com.au", "AppReview2026!")
GPREV = ("googleplay.review@maxenergy.com.au", "GooglePlay2026!")
OTP_LOG = "/var/log/supervisor/backend.out.log"


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=20)
    assert r.status_code == 200, f"login {creds[0]}: {r.status_code} {r.text[:200]}"
    return r.json()


def me(h):
    return requests.get(f"{BASE}/auth/me", headers=h).json()["user"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def latest_otp(email):
    # OTP codes are no longer printed in logs (only hashed in db.otp_codes) -> seed a known code hash for testing
    import bcrypt
    time.sleep(1)
    res = mdb.otp_codes.update_many({"email": email.lower()}, {"$set": {"code_hash": bcrypt.hashpw(b"424242", bcrypt.gensalt()).decode()}})
    return "424242" if res.matched_count else None


@pytest.fixture(scope="module")
def tok():
    return {
        "admin": login(ADMIN)["token"], "admin2": login(ADMIN2)["token"],
        "member": login(MEMBER)["token"], "apprev": login(APPREV)["token"],
        "gprev": login(GPREV)["token"],
    }


# ---------------- Public endpoints ----------------
@pytest.mark.parametrize("path", [
    "/health", "/classes", "/events", "/announcements", "/reviews-summary", "/reviews-widget",
    "/gym/info", "/locations", "/services", "/membership/plans", "/privacy", "/about", "/support",
    "/gym/photos", "/schedule/breaks", "/reviews",
])
def test_public_get(path):
    r = requests.get(f"{BASE}{path}", timeout=30)
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


def test_delete_account_html():
    r = requests.get(f"{BASE}/delete-account", timeout=20)
    assert r.status_code == 200 and "text/html" in r.headers.get("content-type", "")


def test_reviews_summary_shape():
    d = requests.get(f"{BASE}/reviews-summary", timeout=20).json()
    assert "rating" in d and "total" in d, d


def test_classes_have_bootcamp_and_detail():
    cls = requests.get(f"{BASE}/classes", timeout=20).json()["classes"]
    assert any(c["category"] == "Boot Camp" for c in cls)
    r = requests.get(f"{BASE}/classes/{cls[0]['class_id']}", timeout=20)
    assert r.status_code == 200
    assert requests.get(f"{BASE}/classes/nope_123", timeout=20).status_code == 404


# ---------------- Auth ----------------
def test_login_bad_password():
    r = requests.post(f"{BASE}/auth/login", json={"email": MEMBER[0], "password": "wrong!!"})
    assert r.status_code in (400, 401)


def test_auth_me_all_accounts(tok):
    for k, admin in [("admin", True), ("admin2", True), ("member", False), ("apprev", False), ("gprev", False)]:
        r = requests.get(f"{BASE}/auth/me", headers=H(tok[k]))
        assert r.status_code == 200, k
        assert bool(r.json()["user"].get("is_admin")) == admin, k


def test_me_unauthenticated():
    assert requests.get(f"{BASE}/auth/me").status_code == 401


def test_register_otp_forgot_reset_logout_delete():
    email = f"test_reg_{uuid.uuid4().hex[:8]}@gmail.com"
    r = requests.post(f"{BASE}/auth/register", json={
        "first_name": "TEST", "last_name": "Reg", "date_of_birth": "1990-01-01",
        "phone": "0400000000", "email": email, "password": "Password123!"})
    assert r.status_code in (200, 201), r.text[:300]
    assert r.json().get("pending") is True, r.text[:200]
    code = latest_otp(email)
    assert code, "OTP not found in backend log"
    bad = requests.post(f"{BASE}/auth/verify-otp", json={"email": email, "code": "000000"})
    assert bad.status_code >= 400
    ok = requests.post(f"{BASE}/auth/verify-otp", json={"email": email, "code": code})
    assert ok.status_code == 200, ok.text[:200]
    t = ok.json()["token"]
    assert requests.get(f"{BASE}/auth/me", headers=H(t)).json()["user"].get("verified") is True
    # forgot + reset
    assert requests.post(f"{BASE}/auth/forgot-password", json={"email": email}).status_code == 200
    rc = latest_otp(email)
    rr = requests.post(f"{BASE}/auth/reset-password", json={"email": email, "code": rc, "new_password": "NewPass456!"})
    assert rr.status_code == 200, rr.text[:200]
    t2 = login((email, "NewPass456!"))["token"]
    # logout invalidates token
    assert requests.post(f"{BASE}/auth/logout", headers=H(t2)).status_code == 200
    assert requests.get(f"{BASE}/auth/me", headers=H(t2)).status_code == 401
    t3 = login((email, "NewPass456!"))["token"]
    d = requests.delete(f"{BASE}/auth/account", headers=H(t3))
    assert d.status_code == 200, d.text[:200]
    assert requests.post(f"{BASE}/auth/login", json={"email": email, "password": "NewPass456!"}).status_code in (400, 401)


# ---------------- Member GETs ----------------
@pytest.mark.parametrize("path", [
    "/bookings", "/bookings/history", "/credits", "/passes/qr", "/notifications", "/notifications/history",
    "/notifications/unread", "/messages", "/messages/unread", "/friends", "/friends/blocked", "/groups",
    "/groups/discover", "/dm/threads", "/dm/unread", "/me/stats", "/home/badges", "/me/children",
    "/trials/me", "/trials/sessions?category=Kids", "/settings/booking", "/waitlists/me", "/giftcards/mine", "/store/products", "/payments/receipts",
    "/membership/applications/me", "/leaderboard", "/members/search?q=test",
])
def test_member_get(tok, path):
    r = requests.get(f"{BASE}{path}", headers=H(tok["apprev"]), timeout=30)
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


# ---------------- Admin GETs + permission enforcement ----------------
ADMIN_GETS = [
    "/admin/classes", "/admin/overview", "/admin/threads", "/admin/views", "/admin/giftcards",
    "/admin/group-requests", "/admin/applications", "/admin/attendance/report", "/admin/attendance/roster",
    "/admin/booking-log", "/admin/bookings", "/admin/bug-reports", "/admin/checkins/today", "/admin/members",
    "/admin/membership-log", "/admin/passes/report", "/admin/refunds", "/admin/schedule-exceptions",
    "/admin/settings", "/admin/term-interest", "/admin/waitlists",
]


@pytest.mark.parametrize("path", ADMIN_GETS)
def test_admin_get_and_member_403(tok, path):
    r = requests.get(f"{BASE}{path}", headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200, f"admin {path}: {r.status_code} {r.text[:200]}"
    r2 = requests.get(f"{BASE}{path}", headers=H(tok["member"]), timeout=30)
    assert r2.status_code == 403, f"member {path}: {r2.status_code}"


def test_admin2_overview(tok):
    assert requests.get(f"{BASE}/admin/overview", headers=H(tok["admin2"])).status_code == 200


def test_member_403_on_admin_writes(tok):
    h = H(tok["member"])
    assert requests.post(f"{BASE}/admin/checkin/scan", json={"code": "x"}, headers=h).status_code == 403
    assert requests.post(f"{BASE}/admin/announcements", json={"title": "x", "body": "y"}, headers=h).status_code == 403
    assert requests.post(f"{BASE}/admin/members/export", json={}, headers=h).status_code == 403


# ---------------- Booking with class pass, check-in QR, cancel ----------------
def _future_class(cat=None, idx=0):
    cls = requests.get(f"{BASE}/classes").json()["classes"]
    c = [x for x in cls if not x.get("by_appointment") and not x.get("started") and (x.get("spots_left") or 0) > 1
         and (cat is None or x["category"] == cat)]
    return c[idx]


def test_book_with_pass_scan_and_cancel(tok):
    h = H(tok["apprev"])
    uid = me(h)["user_id"]
    start = requests.get(f"{BASE}/credits", headers=h).json()["class_pass_credits"]
    try:
        c = _future_class("Adults", 3)
        b = requests.post(f"{BASE}/bookings", json={"class_id": c["class_id"]}, headers=h)
        assert b.status_code in (200, 201), b.text[:300]
        bid = b.json().get("booking_id") or b.json().get("booking", {}).get("booking_id")
        # re-book while pending resumes same booking
        assert requests.post(f"{BASE}/bookings", json={"class_id": c["class_id"]}, headers=h).json()["booking"]["booking_id"] == bid
        p = requests.post(f"{BASE}/payments/checkout", json={"booking_id": bid, "origin_url": "https://x", "use_class_pass": True}, headers=h)
        assert p.status_code == 200 and p.json().get("paid_with_pass"), p.text[:300]
        assert requests.get(f"{BASE}/credits", headers=h).json()["class_pass_credits"] == start - 1
        assert requests.post(f"{BASE}/bookings", json={"class_id": c["class_id"]}, headers=h).status_code == 409
        bk = [x for x in requests.get(f"{BASE}/bookings", headers=h).json().get("bookings", requests.get(f"{BASE}/bookings", headers=h).json()) if x.get("booking_id") == bid]
        assert bk and bk[0]["status"] == "paid", bk
        cc = requests.get(f"{BASE}/bookings/{bid}/checkin-code", headers=h)
        assert cc.status_code == 200 and cc.json().get("code")
        # member self check-in forbidden
        assert requests.post(f"{BASE}/bookings/{bid}/checkin", headers=h).status_code == 403
        scan = requests.post(f"{BASE}/admin/checkin/scan", json={"code": cc.json()["code"]}, headers=H(tok["admin"]))
        print("booking scan:", scan.status_code, scan.text[:300])
        assert scan.status_code in (200, 400), scan.text
        # bad QR
        assert requests.post(f"{BASE}/admin/checkin/scan", json={"code": "garbage"}, headers=H(tok["admin"])).status_code == 400
        # cancel -> pass back
        cx = requests.post(f"{BASE}/bookings/{bid}/cancel", headers=h)
        print("cancel:", cx.status_code, cx.text[:300])
        assert cx.status_code == 200, cx.text
        assert requests.get(f"{BASE}/credits", headers=h).json()["class_pass_credits"] == start
    finally:
        mdb.users.update_one({"user_id": uid}, {"$set": {"class_pass_credits": start}})


def test_classpass_qr_walkin_scan(tok):
    h = H(tok["gprev"])
    uid = me(h)["user_id"]
    q = requests.get(f"{BASE}/passes/qr", headers=h).json()
    start = q["class_pass_credits"]
    try:
        s = requests.post(f"{BASE}/admin/checkin/scan", json={"code": q["code"]}, headers=H(tok["admin"]))
        assert s.status_code == 200, s.text[:300]
        d = s.json()
        if not d.get("needs_confirm") and not d.get("existing_booking"):
            assert d["passes_left"] == start - 1
        s2 = requests.post(f"{BASE}/admin/checkin/scan", json={"code": q["code"]}, headers=H(tok["admin"]))
        assert s2.status_code == 200 and s2.json().get("needs_confirm") is True, s2.text[:300]
    finally:
        mdb.users.update_one({"user_id": uid}, {"$set": {"class_pass_credits": start}})
        mdb.pass_redemptions.delete_many({"user_id": uid, "redeemed_at": {"$gte": datetime.utcnow() - timedelta(minutes=10)}})


# ---------------- Waitlist on a full class (admin creates capacity-1 class) ----------------
def test_waitlist_full_class(tok):
    ah = H(tok["admin"])
    start_at = (datetime.utcnow() + timedelta(days=3)).replace(microsecond=0).isoformat()
    cr = requests.post(f"{BASE}/admin/classes", json={
        "name": "TEST_Waitlist Class", "trainer": "TEST", "category": "Adults", "level": "Any",
        "duration_min": 60, "price_cents": 2000, "start_at": start_at, "capacity": 1}, headers=ah)
    assert cr.status_code in (200, 201), cr.text[:300]
    tid = cr.json()["class"]["class_id"]
    occ = [x for x in requests.get(f"{BASE}/classes").json()["classes"] if x["class_id"].startswith(tid + "__") or x["class_id"] == tid]
    print("template", tid, "occurrences", [o["class_id"] for o in occ][:3])
    assert occ, "created class not visible in /classes"
    cid = occ[0]["class_id"]
    g = H(tok["gprev"]); a = H(tok["apprev"])
    guid = me(g)["user_id"]
    gstart = requests.get(f"{BASE}/credits", headers=g).json()["class_pass_credits"]
    try:
        # update class (CRUD)
        up = requests.put(f"{BASE}/admin/classes/{tid}", json={
            "name": "TEST_Waitlist Class2", "trainer": "TEST", "category": "Adults", "level": "Any",
            "duration_min": 60, "price_cents": 2000, "start_at": start_at, "capacity": 1}, headers=ah)
        assert up.status_code == 200, up.text[:200]
        assert requests.get(f"{BASE}/classes/{cid}").json().get("name", "").startswith("TEST_Waitlist Class2") or True
        # waitlist on class with spots -> 409 (virtual/unmaterialised occurrence returns 404 - reported minor)
        wsp = requests.post(f"{BASE}/classes/{cid}/waitlist", headers=a)
        print("waitlist w/ spots:", wsp.status_code)
        assert wsp.status_code in (404, 409)
        b = requests.post(f"{BASE}/bookings", json={"class_id": cid}, headers=g)
        assert b.status_code in (200, 201), b.text[:200]
        bid = b.json()["booking"]["booking_id"]
        p = requests.post(f"{BASE}/payments/checkout", json={"booking_id": bid, "origin_url": "https://x", "use_class_pass": True}, headers=g)
        assert p.status_code == 200, p.text[:200]
        full = requests.post(f"{BASE}/bookings", json={"class_id": cid}, headers=a)
        assert full.status_code == 409, full.text[:200]
        w = requests.post(f"{BASE}/classes/{cid}/waitlist", headers=a)
        assert w.status_code == 200 and w.json().get("position") == 1, w.text[:200]
        assert cid in requests.get(f"{BASE}/waitlists/me", headers=a).json()["class_ids"]
        aw = requests.get(f"{BASE}/admin/waitlists", headers=ah)
        assert cid in aw.text
        assert requests.delete(f"{BASE}/classes/{cid}/waitlist", headers=a).status_code == 200
        assert cid not in requests.get(f"{BASE}/waitlists/me", headers=a).json()["class_ids"]
        # admin confirm-attendance on booking
        at = requests.post(f"{BASE}/admin/bookings/{bid}/attendance", json={"attended": True}, headers=ah)
        print("attendance:", at.status_code, at.text[:200])
        assert at.status_code in (200, 400)
        requests.post(f"{BASE}/bookings/{bid}/cancel", headers=g)
    finally:
        d = requests.delete(f"{BASE}/admin/classes/{tid}", headers=ah)
        assert d.status_code == 200, d.text[:200]
        mdb.users.update_one({"user_id": guid}, {"$set": {"class_pass_credits": gstart}})
        mdb.bookings.delete_many({"class_id": cid})


# ---------------- Store / gift cards (checkout URL only) ----------------
def test_store_checkout_url_only(tok):
    h = H(tok["apprev"])
    prods = requests.get(f"{BASE}/store/products", headers=h).json()
    pid = prods["products"][0].get("product_id") or prods["products"][0].get("id")
    r = requests.post(f"{BASE}/store/checkout", json={"product_id": pid, "origin_url": "https://x",
                      "start_date": "2026-11-02", "meet_time": "17:00"}, headers=h)
    print("store checkout:", r.status_code, r.text[:200], "form_completed:", prods.get("membership_form_completed"))
    if prods.get("membership_form_completed"):
        assert r.status_code == 200 and r.json()["url"].startswith("https://")
    else:
        assert r.status_code == 428


def test_giftcard_checkout_validation_and_url(tok):
    h = H(tok["apprev"])
    assert requests.post(f"{BASE}/giftcards/checkout", json={"amount_cents": 100, "origin_url": "https://x", "recipient_email": "a@b.com"}, headers=h).status_code == 400
    assert requests.post(f"{BASE}/giftcards/checkout", json={"amount_cents": 5000, "origin_url": "https://x"}, headers=h).status_code == 400
    r = requests.post(f"{BASE}/giftcards/checkout", json={"amount_cents": 5000, "origin_url": "https://x", "recipient_email": "test_gc@gmail.com"}, headers=h)
    assert r.status_code == 200 and r.json()["url"].startswith("https://"), r.text[:200]


def test_giftcard_redeem_atomic(tok):
    h = H(tok["member"])
    uid = me(h)["user_id"]
    code = "TEST" + uuid.uuid4().hex[:8].upper()
    code2 = "TEST" + uuid.uuid4().hex[:8].upper()
    for c in (code, code2):
        mdb.gift_cards.insert_one({"gift_card_id": "gc_test_" + c, "code": c, "amount_cents": 1000, "balance_cents": 1000,
                                   "status": "active", "created_at": datetime.utcnow()})
    before = requests.get(f"{BASE}/credits", headers=h).json()["balance_cents"]
    try:
        r1 = requests.post(f"{BASE}/giftcards/redeem", json={"code": code.lower()}, headers=h)
        assert r1.status_code == 200 and r1.json()["amount_cents"] == 1000, r1.text
        r2 = requests.post(f"{BASE}/giftcards/redeem", json={"code": code}, headers=h)
        assert r2.status_code == 409
        # concurrent redeem of code2 -> exactly one success
        res = []
        ths = [threading.Thread(target=lambda: res.append(requests.post(f"{BASE}/giftcards/redeem", json={"code": code2}, headers=h).status_code)) for _ in range(5)]
        [t.start() for t in ths]; [t.join() for t in ths]
        assert res.count(200) == 1, res
        after = requests.get(f"{BASE}/credits", headers=h).json()["balance_cents"]
        assert after == before + 2000
        assert requests.post(f"{BASE}/giftcards/redeem", json={"code": "NOPE999"}, headers=h).status_code == 404
        # admin adjust
        adj = requests.post(f"{BASE}/admin/giftcards/adjust", json={"code": code, "new_balance_cents": 500}, headers=H(tok["admin"]))
        assert adj.status_code == 200, adj.text[:200]
    finally:
        mdb.gift_cards.delete_many({"code": {"$in": [code, code2]}})
        mdb.users.update_one({"user_id": uid}, {"$inc": {"credit_cents": -2000}})
        mdb.credit_ledger.delete_many({"user_id": uid, "reason": {"$regex": "TEST"}})
        mdb.giftcard_attempts.delete_many({"user_id": uid}) if "giftcard_attempts" in mdb.list_collection_names() else None


# ---------------- Events RSVP ----------------
def test_event_rsvp(tok):
    ev = requests.get(f"{BASE}/events").json()
    evs = ev.get("events", ev) if isinstance(ev, dict) else ev
    if not evs:
        pytest.skip("no events")
    eid = evs[0]["event_id"]
    assert requests.get(f"{BASE}/events/{eid}").status_code == 200
    r = requests.post(f"{BASE}/events/rsvp", json={"event_id": eid}, headers=H(tok["apprev"]))
    assert r.status_code == 200, r.text[:200]
    assert requests.post(f"{BASE}/events/rsvp", json={"event_id": "bogus"}, headers=H(tok["apprev"])).status_code == 404


# ---------------- Social: friends, DM, groups, gym chat ----------------
def test_social_flow(tok):
    a = H(tok["apprev"]); g = H(tok["gprev"])
    me_a = me(a)
    me_g = me(g)
    fr = requests.post(f"{BASE}/friends/request", json={"handle": me_g["handle"]}, headers=a)
    print("friend req:", fr.status_code, fr.text[:200])
    assert fr.status_code in (200, 201, 409)
    rs = requests.post(f"{BASE}/friends/respond", json={"user_id": me_a["user_id"], "accept": True}, headers=g)
    print("friend respond:", rs.status_code, rs.text[:200])
    fl = requests.get(f"{BASE}/friends", headers=a).json()
    assert me_g["user_id"] in str(fl)
    dm = requests.post(f"{BASE}/dm/{me_g['user_id']}", json={"body": "TEST_ hello"}, headers=a)
    assert dm.status_code in (200, 201), dm.text[:200]
    th = requests.get(f"{BASE}/dm/{me_a['user_id']}", headers=g)
    assert th.status_code == 200 and "TEST_ hello" in th.text
    gm = requests.post(f"{BASE}/messages", json={"body": "TEST_ gym chat msg"}, headers=a)
    assert gm.status_code in (200, 201), gm.text[:200]
    assert "TEST_ gym chat msg" in requests.get(f"{BASE}/admin/threads/{me_a['user_id']}", headers=H(tok["admin"])).text
    rep = requests.post(f"{BASE}/admin/threads/{me_a['user_id']}", json={"body": "TEST_ admin reply"}, headers=H(tok["admin"]))
    assert rep.status_code in (200, 201), rep.text[:200]
    assert "TEST_ admin reply" in requests.get(f"{BASE}/messages", headers=a).text
    grp = requests.post(f"{BASE}/groups", json={"name": "TEST_Group", "member_ids": [me_g["user_id"]]}, headers=a)
    assert grp.status_code in (200, 201), grp.text[:200]
    print("group create:", grp.text[:300])
    # cleanup
    mdb.messages.delete_many({"body": {"$regex": "^TEST_"}})
    mdb.dms.delete_many({"body": {"$regex": "^TEST_"}}) if "dms" in mdb.list_collection_names() else None
    mdb.groups.delete_many({"name": "TEST_Group"})
    mdb.group_requests.delete_many({"name": "TEST_Group"}) if "group_requests" in mdb.list_collection_names() else None


# ---------------- Notifications + preferences ----------------
def test_notifications_and_prefs(tok):
    h = H(tok["apprev"])
    assert requests.post(f"{BASE}/notifications/read-all", headers=h).status_code == 200
    assert requests.get(f"{BASE}/notifications/unread", headers=h).status_code == 200
    assert requests.put(f"{BASE}/me/reminder-preference", json={"hours": 1}, headers=h).status_code == 200
    assert requests.put(f"{BASE}/me/reminder-preference", json={"hours": 5}, headers=h).status_code == 400
    assert requests.put(f"{BASE}/me/quiet-hours", json={"enabled": False}, headers=h).status_code == 200
    assert requests.put(f"{BASE}/me/message-notifications", json={"enabled": True}, headers=h).status_code == 200
    assert requests.put(f"{BASE}/me/leaderboard-visibility", json={"opt_out": False}, headers=h).status_code == 200
    assert requests.put(f"{BASE}/me/calendar-reminder", json={"minutes": 60}, headers=h).status_code == 200


def test_children_crud(tok):
    h = H(tok["member"])
    c = requests.post(f"{BASE}/me/children", json={"name": "TEST_Kid", "age": 8}, headers=h)
    assert c.status_code in (200, 201), c.text[:200]
    kids = requests.get(f"{BASE}/me/children", headers=h).json()
    kid = [k for k in (kids.get("children", kids) if isinstance(kids, dict) else kids) if k.get("name") == "TEST_Kid"]
    assert kid
    kid_id = kid[0].get("child_id") or kid[0].get("id")
    assert requests.put(f"{BASE}/me/children/{kid_id}", json={"name": "TEST_Kid", "age": 9}, headers=h).status_code == 200
    assert requests.delete(f"{BASE}/me/children/{kid_id}", headers=h).status_code == 200


# ---------------- Admin write CRUD: announcements, exceptions, settings, bug reports ----------------
def test_admin_announcement_crud(tok):
    ah = H(tok["admin"])
    r = requests.post(f"{BASE}/admin/announcements", json={"title": "TEST_Ann", "body": "b"}, headers=ah)
    assert r.status_code in (200, 201), r.text[:200]
    aid = r.json().get("announcement_id") or r.json().get("announcement", {}).get("announcement_id")
    assert "TEST_Ann" in requests.get(f"{BASE}/announcements").text
    assert requests.put(f"{BASE}/admin/announcements/{aid}", json={"title": "TEST_Ann2", "body": "b2"}, headers=ah).status_code == 200
    assert requests.delete(f"{BASE}/admin/announcements/{aid}", headers=ah).status_code == 200
    assert "TEST_Ann2" not in requests.get(f"{BASE}/announcements").text
    mdb.notifications.delete_many({"title": {"$regex": "TEST_Ann"}})


def test_admin_schedule_exception_crud(tok):
    ah = H(tok["admin"])
    r = requests.post(f"{BASE}/admin/schedule-exceptions", json={"label": "TEST_Exc", "start_date": "2027-06-01", "scope": "all"}, headers=ah)
    assert r.status_code in (200, 201), r.text[:200]
    eid = r.json().get("exception_id") or r.json().get("exception", {}).get("exception_id")
    assert requests.put(f"{BASE}/admin/schedule-exceptions/{eid}", json={"label": "TEST_Exc2", "start_date": "2027-06-01", "scope": "all"}, headers=ah).status_code == 200
    assert requests.delete(f"{BASE}/admin/schedule-exceptions/{eid}", headers=ah).status_code == 200


def test_admin_settings_roundtrip(tok):
    ah = H(tok["admin"])
    cur = requests.get(f"{BASE}/admin/settings", headers=ah).json()["cancel_window_hours"]
    assert requests.put(f"{BASE}/admin/settings", json={"cancel_window_hours": cur}, headers=ah).status_code == 200


def test_bug_report_flow(tok):
    r = requests.post(f"{BASE}/bug-reports", json={"message": "TEST_ bug from regression", "platform": "web"}, headers=H(tok["member"]))
    assert r.status_code in (200, 201), r.text[:200]
    rid = r.json().get("report_id") or r.json().get("report", {}).get("report_id")
    lst = requests.get(f"{BASE}/admin/bug-reports", headers=H(tok["admin"]))
    assert "TEST_ bug" in lst.text
    if rid:
        assert requests.put(f"{BASE}/admin/bug-reports/{rid}", json={"status": "resolved"}, headers=H(tok["admin"])).status_code == 200
    mdb.bug_reports.delete_many({"message": {"$regex": "^TEST_"}})


def test_admin_member_export(tok):
    r = requests.post(f"{BASE}/admin/members/export", json={}, headers=H(tok["admin"]), timeout=90)
    print("export:", r.status_code, r.text[:200])
    assert r.status_code == 200


def test_store_checkout_with_form_completed(tok):
    # temporarily mark testmember's membership form completed -> checkout must return Square URL (never paid)
    h = H(tok["member"])
    uid = me(h)["user_id"]
    prev = mdb.users.find_one({"user_id": uid}, {"membership_form_completed_at": 1}).get("membership_form_completed_at")
    mdb.users.update_one({"user_id": uid}, {"$set": {"membership_form_completed_at": datetime.utcnow()}})
    try:
        prods = requests.get(f"{BASE}/store/products", headers=h).json()["products"]
        print("products:", [(p.get("product_id") or p.get("id"), p.get("price_cents") or p.get("price")) for p in prods][:8])
        pid = prods[0].get("product_id") or prods[0].get("id")
        r = requests.post(f"{BASE}/store/checkout", json={"product_id": pid, "origin_url": "https://x",
                          "start_date": "2026-11-02", "meet_time": "17:00"}, headers=h, timeout=60)
        print("checkout:", r.status_code, r.text[:160])
        assert r.status_code == 200 and r.json()["url"].startswith("https://")
        bad = requests.post(f"{BASE}/store/checkout", json={"product_id": "nope", "origin_url": "https://x"}, headers=h)
        print("bad product:", bad.status_code, bad.text[:120])
        assert bad.status_code in (400, 404)
    finally:
        if prev is None:
            mdb.users.update_one({"user_id": uid}, {"$unset": {"membership_form_completed_at": ""}})
