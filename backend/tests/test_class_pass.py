"""Tests for the new Class Pass Credits feature.

Covers:
  - GET /api/store/products includes pass_1class and pass_10class with type=class_pass
  - POST /api/store/checkout for pass_1class returns Square checkout url + session_id
  - GET /api/passes/qr auth requirement and payload shape
  - POST /api/admin/checkin/scan for classpass codes: deduct-1 semantics, 0-pass 400 error,
    non-admin 403
  - GET /api/credits returns class_pass_credits and pass_entries
  - Regression: existing booking check-in (typ=checkin) still gets validated by scan endpoint
"""

import os
import time
import pytest
import requests
from pymongo import MongoClient
from pathlib import Path
from dotenv import load_dotenv

# Load frontend env for BASE_URL and backend env for MONGO
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

MEMBER_EMAIL = "member1@gmail.com"
MEMBER_PASSWORD = "Password123"
ADMIN_EMAIL = "admin@maxenergy.com.au"
ADMIN_PASSWORD = "MaxAdmin123!"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def member_token():
    # Try login, register if missing
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD})
    if r.status_code != 200:
        rr = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": MEMBER_EMAIL, "password": MEMBER_PASSWORD, "name": "Member One"
        })
        assert rr.status_code in (200, 201, 409), rr.text
    return _login(MEMBER_EMAIL, MEMBER_PASSWORD)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Store products ----------------

class TestStoreProducts:
    def test_products_include_class_passes(self, member_token):
        r = requests.get(f"{BASE_URL}/api/store/products", headers=_auth(member_token))
        assert r.status_code == 200, r.text
        data = r.json()
        products = data.get("products") if isinstance(data, dict) else data
        assert isinstance(products, list) and len(products) > 0

        by_id = {p.get("id") or p.get("product_id"): p for p in products}
        assert "pass_1class" in by_id, f"pass_1class missing: {list(by_id.keys())}"
        assert "pass_10class" in by_id, f"pass_10class missing: {list(by_id.keys())}"

        p1 = by_id["pass_1class"]
        p10 = by_id["pass_10class"]

        # name check
        assert "Single Class Pass" in (p1.get("name") or "")
        # type check
        assert p1.get("type") == "class_pass"
        assert p10.get("type") == "class_pass"

        # total 2500 / 20000 (either price_cents or total field)
        def total(p):
            return p.get("total") or p.get("total_cents") or p.get("price_cents")

        assert total(p1) == 2500, f"pass_1class total wrong: {p1}"
        assert total(p10) == 20000, f"pass_10class total wrong: {p10}"


# ---------------- Checkout ----------------

class TestCheckout:
    def test_checkout_pass_1class_returns_square_link(self, member_token):
        r = requests.post(
            f"{BASE_URL}/api/store/checkout",
            headers=_auth(member_token),
            json={"product_id": "pass_1class", "add_key_tag": False, "origin_url": BASE_URL},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and isinstance(data["url"], str) and data["url"].startswith("http")
        assert "session_id" in data and data["session_id"]
        # Should be a Square sandbox link
        assert "square" in data["url"].lower(), f"expected square link, got {data['url']}"


# ---------------- QR endpoint ----------------

class TestPassesQr:
    def test_qr_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/passes/qr")
        assert r.status_code == 401, r.text

    def test_qr_returns_code_and_credits(self, member_token):
        r = requests.get(f"{BASE_URL}/api/passes/qr", headers=_auth(member_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "code" in data and isinstance(data["code"], str) and len(data["code"]) > 20
        assert "class_pass_credits" in data
        assert isinstance(data["class_pass_credits"], int)


# ---------------- Credits endpoint ----------------

class TestCredits:
    def test_credits_includes_pass_fields(self, member_token):
        r = requests.get(f"{BASE_URL}/api/credits", headers=_auth(member_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "class_pass_credits" in data
        assert isinstance(data["class_pass_credits"], int)
        assert "pass_entries" in data and isinstance(data["pass_entries"], list)


# ---------------- Scan endpoint end-to-end ----------------

class TestScanClassPass:
    """Set the member to exactly 2 passes, then scan 3 times: 2->1->0->400."""

    def test_scan_deducts_and_errors_on_zero(self, member_token, admin_token, mongo):
        # Look up member
        member = mongo.users.find_one({"email": MEMBER_EMAIL})
        assert member, "member1 user not found in mongo"
        uid = member["user_id"]

        # Seed exactly 2 passes
        mongo.users.update_one({"user_id": uid}, {"$set": {"class_pass_credits": 2}})

        # Grab QR code (as member)
        qr = requests.get(f"{BASE_URL}/api/passes/qr", headers=_auth(member_token)).json()
        assert qr["class_pass_credits"] == 2
        code = qr["code"]

        # Scan #1: 2 -> 1
        s1 = requests.post(
            f"{BASE_URL}/api/admin/checkin/scan",
            headers=_auth(admin_token),
            json={"code": code},
        )
        assert s1.status_code == 200, s1.text
        d1 = s1.json()
        assert d1.get("ok") is True
        assert d1.get("class_name") == "Class Pass entry"
        assert d1.get("passes_left") == 1
        assert d1.get("when") == "1 pass left"
        assert d1.get("member_name")

        # Scan #2: 1 -> 0
        s2 = requests.post(
            f"{BASE_URL}/api/admin/checkin/scan",
            headers=_auth(admin_token),
            json={"code": code},
        )
        assert s2.status_code == 200, s2.text
        d2 = s2.json()
        assert d2.get("passes_left") == 0
        assert d2.get("when") == "0 passes left"

        # Scan #3: 0 -> 400, no deduction
        s3 = requests.post(
            f"{BASE_URL}/api/admin/checkin/scan",
            headers=_auth(admin_token),
            json={"code": code},
        )
        assert s3.status_code == 400, s3.text
        err = s3.json()
        msg = (err.get("detail") or err.get("message") or "").lower()
        assert "no class pass" in msg or "no passes" in msg or "pass" in msg, err
        # Verify DB still at 0 (no negative deduction)
        u = mongo.users.find_one({"user_id": uid}, {"class_pass_credits": 1})
        assert int(u.get("class_pass_credits", -1)) == 0

        # Verify a pass_entries deduction shows delta -1 with the expected reason
        cr = requests.get(f"{BASE_URL}/api/credits", headers=_auth(member_token)).json()
        assert cr["class_pass_credits"] == 0
        assert len(cr["pass_entries"]) >= 2
        deduct_entries = [e for e in cr["pass_entries"] if e["delta"] == -1]
        assert len(deduct_entries) >= 2
        assert any("Class pass used at the gym" in (e.get("reason") or "") for e in deduct_entries)

    def test_non_admin_gets_403(self, member_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/checkin/scan",
            headers=_auth(member_token),
            json={"code": "irrelevant"},
        )
        assert r.status_code == 403, r.text

    def test_invalid_code_400(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/checkin/scan",
            headers=_auth(admin_token),
            json={"code": "not-a-jwt"},
        )
        assert r.status_code == 400, r.text


# ---------------- Regression: booking checkin still validated ----------------

class TestBookingCheckinRegression:
    def test_invalid_checkin_code_still_400(self, admin_token):
        # If we send a random string, endpoint should reject; if we somehow send a valid
        # classpass code we've already tested above. Here we assert non-JWT input rejected.
        r = requests.post(
            f"{BASE_URL}/api/admin/checkin/scan",
            headers=_auth(admin_token),
            json={"code": ""},
        )
        assert r.status_code == 400
