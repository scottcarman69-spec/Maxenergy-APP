"""Tests for GET /api/about after content edits (bug-fix iteration 7).

Verifies:
- Team excludes Andrew Roussety
- Team has Alex Honorato, Jamie Blackman, Scott Carman
- Jamie's first qualification is "Personal trainer" (not "World-level competitor")
- Jamie's bio starts with "With over 20 years of Muay Thai experience"
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ["EXPO_BACKEND_URL"]
BASE_URL = BASE_URL.rstrip("/")


@pytest.fixture(scope="module")
def about_data():
    r = requests.get(f"{BASE_URL}/api/about", timeout=15)
    assert r.status_code == 200, f"/api/about -> {r.status_code}: {r.text[:200]}"
    return r.json()


def test_about_has_team_key(about_data):
    assert "team" in about_data and isinstance(about_data["team"], list)


def test_team_size_is_three(about_data):
    assert len(about_data["team"]) == 3, [m["name"] for m in about_data["team"]]


def test_team_members_expected(about_data):
    names = [m["name"] for m in about_data["team"]]
    assert names == ["Alex Honorato", "Jamie Blackman", "Scott Carman"], names


def test_andrew_roussety_removed(about_data):
    names = [m["name"] for m in about_data["team"]]
    assert "Andrew Roussety" not in names


def test_jamie_first_qualification(about_data):
    jamie = next(m for m in about_data["team"] if m["name"] == "Jamie Blackman")
    assert jamie["quals"][0] == "Personal trainer", jamie["quals"]
    assert "World-level competitor" not in jamie["quals"]


def test_jamie_bio_updated(about_data):
    jamie = next(m for m in about_data["team"] if m["name"] == "Jamie Blackman")
    assert jamie["bio"].startswith("With over 20 years of Muay Thai experience"), jamie["bio"][:80]
