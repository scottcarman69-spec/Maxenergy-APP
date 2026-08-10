"""Verify Muay Thai - Kids class image is a WebP base64 data URI + no regressions.

Reviewed change: DB `image` field for all `Muay Thai - Kids` class docs was
replaced with a base64 data URI (data:image/webp;base64,...). No code changed.
"""
import base64
import os
import re

import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


# ---- classes API ----
@pytest.fixture(scope="module")
def classes():
    r = requests.get(f"{BASE_URL}/api/classes", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("classes"), list) and len(data["classes"]) > 0
    return data["classes"]


class TestMuayThaiKidsImage:
    def test_classes_endpoint_ok(self, classes):
        # sanity: expected class names all present
        names = {c["name"] for c in classes}
        assert "Muay Thai - Kids" in names
        assert "Muay Thai - Adults" in names
        assert "Kickboxing" in names

    def test_muay_thai_kids_image_is_webp_data_uri(self, classes):
        kids = [c for c in classes if c["name"] == "Muay Thai - Kids"]
        assert kids, "No Muay Thai - Kids classes returned by /api/classes"
        for c in kids:
            img = c.get("image", "")
            assert isinstance(img, str) and img, f"missing image for {c.get('class_id')}"
            assert img.startswith("data:image/webp;base64,"), (
                f"Muay Thai - Kids image is not a webp data URI: prefix={img[:40]!r}"
            )
            # should NOT be the old unsplash URL
            assert "unsplash" not in img.lower()

    def test_muay_thai_kids_base64_payload_valid(self, classes):
        kids = [c for c in classes if c["name"] == "Muay Thai - Kids"]
        first = kids[0]
        img = first["image"]
        b64 = img.split(",", 1)[1]
        # Must be valid base64
        raw = base64.b64decode(b64, validate=True)
        # Must be a real WebP file (RIFF....WEBP header)
        assert raw[:4] == b"RIFF", f"header not RIFF: {raw[:12]!r}"
        assert raw[8:12] == b"WEBP", f"format not WEBP: {raw[:12]!r}"
        assert len(raw) > 1000, f"payload too small: {len(raw)} bytes"

    def test_all_muay_thai_kids_share_same_image(self, classes):
        kids = [c for c in classes if c["name"] == "Muay Thai - Kids"]
        assert len(kids) >= 1
        imgs = {c.get("image") for c in kids}
        assert len(imgs) == 1, "Not all Muay Thai - Kids rows share the same image"

    def test_other_classes_unchanged(self, classes):
        # regression: other classes should still have http(s) image URLs (not empty)
        for name in ("Muay Thai - Adults", "Kickboxing"):
            rows = [c for c in classes if c["name"] == name]
            assert rows, f"missing class {name}"
            for c in rows:
                img = c.get("image", "")
                assert isinstance(img, str) and img, f"empty image for {name}"
                # Not a data URI (unchanged upstream URL is expected)
                assert img.startswith("http"), f"{name} image is not an http url: {img[:40]!r}"

    def test_class_detail_endpoint_returns_same_image(self, classes):
        # pick a Muay Thai - Kids class and verify GET /api/classes/{id} returns same image
        kids = [c for c in classes if c["name"] == "Muay Thai - Kids"][0]
        cid = kids["class_id"]
        r = requests.get(f"{BASE_URL}/api/classes/{cid}", timeout=30)
        assert r.status_code == 200, r.text
        detail = r.json()
        assert detail.get("image") == kids["image"]
        assert detail["image"].startswith("data:image/webp;base64,")


# ---- booking flow regression (create member -> book kids class -> verify) ----
class TestBookingRegression:
    @pytest.fixture(scope="class")
    def member_token(self):
        import uuid
        email = f"testmt+{uuid.uuid4().hex[:10]}@gmail.com"
        payload = {"email": email, "password": "Password123", "name": "Test MT"}
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=30)
        if r.status_code not in (200, 201):
            pytest.skip(f"register failed: {r.status_code} {r.text}")
        tok = r.json().get("token") or r.json().get("access_token")
        assert tok, f"no token in register response: {r.json()}"
        return tok

    def _headers(self, tok):
        return {"Content-Type": "application/json", "Authorization": f"Bearer {tok}"}

    def test_book_muay_thai_kids_class(self, classes, member_token):
        kids = [c for c in classes if c["name"] == "Muay Thai - Kids"]
        assert kids
        cid = kids[0]["class_id"]
        r = requests.post(
            f"{BASE_URL}/api/bookings",
            json={"class_id": cid},
            headers=self._headers(member_token),
            timeout=30,
        )
        # 200/201 success, or 409/400 if already booked/full — but a 5xx is a bug
        assert r.status_code < 500, f"server error booking Muay Thai - Kids: {r.status_code} {r.text}"
        # If successful, verify booking listed
        if r.status_code in (200, 201):
            r2 = requests.get(
                f"{BASE_URL}/api/bookings", headers=self._headers(member_token), timeout=30
            )
            assert r2.status_code == 200
            bookings = r2.json().get("bookings", [])
            assert any(b.get("class_id") == cid for b in bookings), "booking not persisted"

    def test_book_muay_thai_adults_still_works(self, classes, member_token):
        adults = [c for c in classes if c["name"] == "Muay Thai - Adults"]
        assert adults
        cid = adults[0]["class_id"]
        r = requests.post(
            f"{BASE_URL}/api/bookings",
            json={"class_id": cid},
            headers=self._headers(member_token),
            timeout=30,
        )
        assert r.status_code < 500, f"server error: {r.status_code} {r.text}"
