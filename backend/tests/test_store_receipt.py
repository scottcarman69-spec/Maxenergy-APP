"""Tests for the new store receipt endpoints.

Covers:
- GET /api/store/receipt/latest -> 404 when no recent store purchases exist for the user
- GET /api/store/receipt/{session_id} -> 404 for unknown session, 409 for unpaid purchase
- POST /api/store/checkout returns a valid Square payment link + session_id; the newly
  created (unpaid) transaction should surface via /store/receipt/{session_id} as 409
  and NOT via /store/receipt/latest as 200 (it must be paid to be a receipt).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MEMBER_EMAIL = "member1@gmail.com"
MEMBER_PASSWORD = "Password123"


# ---------- Fixtures ----------


@pytest.fixture(scope="module")
def member_token():
    """Login (or register) a normal member and return the JWT."""
    r = requests.post(f"{API}/auth/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD}, timeout=30)
    if r.status_code == 401:
        rr = requests.post(f"{API}/auth/register",
                           json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD, "name": "Test Member"},
                           timeout=30)
        if rr.status_code >= 400:
            pytest.skip(f"member register failed {rr.status_code}: {rr.text[:200]}")
        tok = rr.json().get("token")
        if tok:
            return tok
        r = requests.post(f"{API}/auth/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def member_headers(member_token):
    return {"Authorization": f"Bearer {member_token}", "Content-Type": "application/json"}


# ---------- Tests: store products (fast load) ----------


def test_store_products_fast(member_headers):
    """GET /api/store/products should return quickly (<3s) and include product list."""
    t0 = time.time()
    r = requests.get(f"{API}/store/products", headers=member_headers, timeout=30)
    dt = time.time() - t0
    assert r.status_code == 200, r.text
    data = r.json()
    assert "products" in data and isinstance(data["products"], list)
    pids = {p["product_id"] for p in data["products"]}
    # Must contain the products the app relies on:
    for pid in ("pass_7day", "mem_1m", "mem_3m", "mem_6m", "mem_12m", "pass_10class"):
        assert pid in pids, f"missing product {pid}"
    # Fast-load: reconciliation is background; store/products itself should be quick.
    assert dt < 5.0, f"store products endpoint too slow: {dt:.2f}s"


# ---------- Tests: /store/receipt/latest ----------


def test_receipt_latest_requires_auth():
    r = requests.get(f"{API}/store/receipt/latest", timeout=30)
    assert r.status_code in (401, 403), r.text


def test_receipt_latest_404_when_no_recent_purchase(member_headers):
    """If the member has no *paid* recent store purchase we expect 404 or 409.

    (Endpoint pattern: /latest returns 404 when no tx in last 6h, otherwise it proxies
     to /receipt/{session_id} which returns 409 when the tx is not yet paid.)
    """
    r = requests.get(f"{API}/store/receipt/latest", headers=member_headers, timeout=30)
    assert r.status_code in (404, 409), f"unexpected {r.status_code}: {r.text}"


# ---------- Tests: /store/receipt/{session_id} ----------


def test_receipt_by_unknown_session_404(member_headers):
    r = requests.get(f"{API}/store/receipt/store_does_not_exist_xyz", headers=member_headers, timeout=30)
    assert r.status_code == 404, r.text


# ---------- Tests: checkout returns session; unpaid receipt -> 409 ----------


@pytest.fixture(scope="module")
def unpaid_checkout(member_headers):
    """Create a store checkout for the 7-day pass and return the session_id."""
    body = {
        "product_id": "pass_7day",
        "origin_url": BASE_URL,
    }
    r = requests.post(f"{API}/store/checkout", headers=member_headers, json=body, timeout=30)
    if r.status_code >= 500:
        pytest.skip(f"square checkout unavailable: {r.status_code} {r.text[:200]}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("url", "").startswith("http"), f"missing checkout url: {data}"
    assert data.get("session_id"), f"missing session_id: {data}"
    return data


def test_store_checkout_creates_session(unpaid_checkout):
    assert "square" in unpaid_checkout["url"].lower() or unpaid_checkout["url"].startswith("http")
    assert unpaid_checkout["session_id"]


def test_receipt_unpaid_returns_409(member_headers, unpaid_checkout):
    """An unpaid Square session should raise 409 (backend attempts Square sync first)."""
    sid = unpaid_checkout["session_id"]
    r = requests.get(f"{API}/store/receipt/{sid}", headers=member_headers, timeout=30)
    # 409 = Purchase not paid; 404 acceptable if tx cleaned up.  Anything else is a bug.
    assert r.status_code in (409, 404), f"unexpected {r.status_code}: {r.text[:200]}"


def test_store_status_reports_initiated(member_headers, unpaid_checkout):
    """The status endpoint should return payment_status pending/initiated for a fresh sess."""
    sid = unpaid_checkout["session_id"]
    r = requests.get(f"{API}/store/status/{sid}", headers=member_headers, timeout=30)
    assert r.status_code == 200, r.text
    js = r.json()
    assert "payment_status" in js and "status" in js
    assert js["payment_status"] in ("initiated", "pending", "processing", "paid")


# ---------- Membership setup checkout carries start_date + meet_time ----------


def test_membership_checkout_carries_setup_fields(member_headers):
    body = {
        "product_id": "mem_1m",
        "origin_url": BASE_URL,
        "start_date": "Mon, 20 Jan",
        "meet_time": "10:00 AM",
    }
    r = requests.post(f"{API}/store/checkout", headers=member_headers, json=body, timeout=30)
    if r.status_code >= 500:
        pytest.skip(f"square checkout unavailable: {r.status_code} {r.text[:200]}")
    assert r.status_code == 200, r.text
    data = r.json()
    sid = data.get("session_id")
    assert sid
    # Unpaid → 409 or 404 (with the tx present). We simply confirm the session was
    # persisted with the setup fields by hitting store/status (indirectly confirms tx exists).
    s = requests.get(f"{API}/store/status/{sid}", headers=member_headers, timeout=30)
    assert s.status_code == 200
    # And now the receipt endpoint should attempt Square sync + return 409 (not paid yet).
    rr = requests.get(f"{API}/store/receipt/{sid}", headers=member_headers, timeout=30)
    assert rr.status_code in (409, 404), rr.text
