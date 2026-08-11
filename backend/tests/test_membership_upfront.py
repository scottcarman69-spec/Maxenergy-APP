"""Backend tests for the upfront membership start_date + meet_time feature.

Verifies:
 - POST /api/store/checkout for upfront membership returns {url, session_id}
   AND the payment_transactions doc persists start_date + meet_time (kind=store).
 - Non-membership passes also return {url, session_id}.
 - GET /api/store/products lists mem_* + pass_* products (auth required).
"""
import os
import time
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

TIMEOUT = 30


@pytest.fixture(scope="module")
def member_token():
    """Register a new member (verified soft-gated) and return token."""
    email = f"TEST_upfront_{uuid.uuid4().hex[:10]}@gmail.com"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"name": "TEST Upfront Member", "email": email, "password": "Password123!"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data
    return data["token"], email


@pytest.fixture(scope="module")
def s(member_token):
    token, _email = member_token
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return sess


def test_health_ok():
    r = requests.get(f"{BASE_URL}/api/gym/info", timeout=TIMEOUT)
    assert r.status_code == 200
    assert "name" in r.json()


def test_store_products_lists_memberships_and_passes(s):
    r = s.get(f"{BASE_URL}/api/store/products", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "products" in data
    pids = {p["product_id"] for p in data["products"]}
    # Expect at least these product ids
    for pid in ("mem_1m", "mem_3m", "mem_6m", "mem_12m", "pass_7day", "pass_10class"):
        assert pid in pids, f"missing product {pid} in {pids}"
    # Membership vs pass typing
    types = {p["product_id"]: p["type"] for p in data["products"]}
    assert types["mem_1m"] == "membership"
    assert types["mem_3m"] == "membership"
    assert types["pass_10class"] != "membership"


def test_store_products_requires_auth():
    r = requests.get(f"{BASE_URL}/api/store/products", timeout=TIMEOUT)
    assert r.status_code == 401


def test_store_checkout_upfront_membership_persists_start_date_and_meet_time(s, member_token):
    """CORE: upfront membership checkout must return url+session_id AND persist start_date/meet_time."""
    _token, email = member_token
    payload = {
        "product_id": "mem_1m",
        "origin_url": BASE_URL,
        "start_date": "Mon 03 Feb 2026",
        "meet_time": "9:30am",
    }
    r = s.post(f"{BASE_URL}/api/store/checkout", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data.get("url"), f"missing url in {data}"
    assert data.get("session_id"), f"missing session_id in {data}"
    session_id = data["session_id"]

    # Verify persistence directly in Mongo
    async def check():
        c = AsyncIOMotorClient(MONGO_URL)
        try:
            doc = await c[DB_NAME].payment_transactions.find_one({"session_id": session_id})
            return doc
        finally:
            c.close()

    doc = asyncio.get_event_loop().run_until_complete(check()) if False else asyncio.new_event_loop().run_until_complete(check())
    assert doc is not None, "payment_transactions row not created"
    assert doc.get("kind") == "store"
    assert doc.get("product_id") == "mem_1m"
    assert doc.get("start_date") == "Mon 03 Feb 2026"
    assert doc.get("meet_time") == "9:30am"


def test_store_checkout_non_membership_pass_returns_url(s):
    """Passes should also return url+session_id (no start_date/meet_time required)."""
    payload = {"product_id": "pass_10class", "origin_url": BASE_URL}
    r = s.post(f"{BASE_URL}/api/store/checkout", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, f"pass checkout failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data.get("url")
    assert data.get("session_id")


def test_store_checkout_membership_without_dates_still_works_but_no_persistence(s):
    """If a client bypasses the modal, backend still creates a link but persists null dates."""
    payload = {"product_id": "mem_3m", "origin_url": BASE_URL}
    r = s.post(f"{BASE_URL}/api/store/checkout", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    async def check():
        c = AsyncIOMotorClient(MONGO_URL)
        try:
            return await c[DB_NAME].payment_transactions.find_one({"session_id": session_id})
        finally:
            c.close()

    doc = asyncio.new_event_loop().run_until_complete(check())
    assert doc is not None
    assert doc.get("kind") == "store"
    # start_date / meet_time should be None (or missing)
    assert not doc.get("start_date")
    assert not doc.get("meet_time")
