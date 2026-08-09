"""Backend tests for NEW features (Jan 2026):
- Membership PDF download link (public capability URL)
- Membership apply stores pdf_base64 + returns a downloadable form
- Admin members export CSV download link
- Messaging: member <-> gym (bi-directional)
- Admin overview includes unread_messages

IMPORTANT: Only submits ONE membership application to avoid Resend/Emergent
email rate limit on the fork. Public download endpoints require NO auth.
"""
import uuid
import pytest


# ------------- Fixtures -------------
@pytest.fixture(scope="module")
def admin_token(api_client, base_url):
    r = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": "info@maxenergy.com.au", "password": "maxenergy12@"},
    )
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    d = r.json()
    assert d["user"]["is_admin"] is True
    return d["token"]


@pytest.fixture(scope="module")
def member(api_client, base_url):
    email = f"testmsg+{uuid.uuid4().hex[:8]}@gmail.com"
    password = "Password123"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"name": "Test Msg User", "email": email, "password": password},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "password": password, "token": d["token"], "user": d["user"]}


# ------------- Membership PDF download link -------------
class TestMembershipPDFDownload:
    def test_apply_creates_pdf_and_downloadable(self, api_client, base_url, member):
        """POST /api/membership/apply creates an app, stores pdf_base64,
        and the public /api/membership/forms/{id}.pdf endpoint serves the PDF."""
        plans = api_client.get(f"{base_url}/api/membership/plans").json()["plans"]
        plan = next((p for p in plans if p["name"] == "Adult Casual"), plans[0])
        h = {"Authorization": f"Bearer {member['token']}"}
        payload = {
            "plan_id": plan["plan_id"],
            "full_name": "PDF Test User",
            "phone": "0400111222",
            "category": "Adult",
            "experience": "Beginner",
            "message": "Testing PDF download link",
            "details": {
                "membership_type": "Casual",
                "term": "Month-to-month",
                "how_found": "Google",
                "medical": {"medications": {}, "conditions": {}, "notes": ""},
                "media_consent": True,
                "waiver_agreed": True,
            },
        }
        r = api_client.post(f"{base_url}/api/membership/apply", json=payload, headers=h)
        assert r.status_code == 200, r.text
        app_doc = r.json()["application"]
        aid = app_doc["application_id"]
        member["application_id"] = aid
        assert app_doc["status"] == "pending"
        assert app_doc["plan_id"] == plan["plan_id"]

        # Download the PDF via public capability URL (no auth)
        pdf_resp = api_client.get(f"{base_url}/api/membership/forms/{aid}.pdf")
        assert pdf_resp.status_code == 200, pdf_resp.text[:200]
        ctype = pdf_resp.headers.get("content-type", "")
        assert "application/pdf" in ctype, f"Wrong content-type: {ctype}"
        assert pdf_resp.content[:4] == b"%PDF", (
            f"Not a valid PDF (magic bytes): {pdf_resp.content[:20]!r}"
        )
        assert len(pdf_resp.content) > 500, "PDF suspiciously small"

    def test_download_missing_application_returns_404(self, api_client, base_url):
        fake_id = "app_" + uuid.uuid4().hex[:12]
        r = api_client.get(f"{base_url}/api/membership/forms/{fake_id}.pdf")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text[:200]}"


# ------------- Admin members export CSV download link -------------
class TestAdminExportCSV:
    def test_export_returns_download_url_and_csv_downloads(self, api_client, base_url, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = api_client.post(f"{base_url}/api/admin/members/export", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "download_url" in d, f"No download_url in response: {d}"
        assert d["download_url"], "download_url is empty"
        assert "count" in d and isinstance(d["count"], int)
        # ok flag may be False if Resend rate-limits/rejects, but download URL should still work
        assert "/api/admin/exports/" in d["download_url"]
        assert d["download_url"].endswith(".csv")

        # Public capability URL (no auth) should serve the CSV
        csv_resp = api_client.get(d["download_url"])
        assert csv_resp.status_code == 200, csv_resp.text[:200]
        ctype = csv_resp.headers.get("content-type", "")
        assert "text/csv" in ctype, f"Wrong content-type: {ctype}"
        body = csv_resp.text
        # Header row present
        assert "Name" in body and "Email" in body and "Application Status" in body

    def test_export_download_404(self, api_client, base_url):
        fake_id = "exp_" + uuid.uuid4().hex[:12]
        r = api_client.get(f"{base_url}/api/admin/exports/{fake_id}.csv")
        assert r.status_code == 404


# ------------- Messaging: member <-> gym -------------
class TestMessagingRoundtrip:
    def test_member_send_and_list(self, api_client, base_url, member):
        h = {"Authorization": f"Bearer {member['token']}"}
        text = f"Hello from member {uuid.uuid4().hex[:6]}"
        r = api_client.post(f"{base_url}/api/messages", json={"body": text}, headers=h)
        assert r.status_code == 200, r.text
        msg = r.json()["message"]
        assert msg["body"] == text
        assert msg["sender_is_admin"] is False
        assert msg["thread_user_id"] == member["user"]["user_id"]
        member["last_msg_body"] = text
        member["last_msg_id"] = msg["message_id"]

        # GET /api/messages returns it
        lr = api_client.get(f"{base_url}/api/messages", headers=h)
        assert lr.status_code == 200
        rows = lr.json()["messages"]
        assert any(m["message_id"] == msg["message_id"] for m in rows)

    def test_member_empty_message_rejected(self, api_client, base_url, member):
        h = {"Authorization": f"Bearer {member['token']}"}
        r = api_client.post(f"{base_url}/api/messages", json={"body": "   "}, headers=h)
        assert r.status_code == 400

    def test_admin_threads_lists_thread_with_unread(self, api_client, base_url, admin_token, member):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = api_client.get(f"{base_url}/api/admin/threads", headers=h)
        assert r.status_code == 200
        threads = r.json()["threads"]
        uid = member["user"]["user_id"]
        t = next((t for t in threads if t["user_id"] == uid), None)
        assert t is not None, f"Member thread missing: {[x['user_id'] for x in threads]}"
        # Since admin has not yet opened the thread, unread should be >= 1
        assert t["unread"] >= 1, f"Expected unread >=1, got {t['unread']}"
        assert t.get("email") == member["email"]
        assert t.get("last_body") == member["last_msg_body"]

    def test_admin_get_thread_marks_read_and_returns_member(self, api_client, base_url, admin_token, member):
        h = {"Authorization": f"Bearer {admin_token}"}
        uid = member["user"]["user_id"]
        r = api_client.get(f"{base_url}/api/admin/threads/{uid}", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "messages" in d and isinstance(d["messages"], list)
        assert len(d["messages"]) >= 1
        assert d["member"]["email"] == member["email"]
        # after fetching thread, unread count for admin should be 0
        rt = api_client.get(f"{base_url}/api/admin/threads", headers=h)
        t = next(t for t in rt.json()["threads"] if t["user_id"] == uid)
        assert t["unread"] == 0, f"Unread not cleared after admin view: {t['unread']}"

    def test_admin_reply_appears_in_member_inbox(self, api_client, base_url, admin_token, member):
        h = {"Authorization": f"Bearer {admin_token}"}
        uid = member["user"]["user_id"]
        reply_text = f"Reply from admin {uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{base_url}/api/admin/threads/{uid}",
            json={"body": reply_text},
            headers=h,
        )
        assert r.status_code == 200, r.text
        msg = r.json()["message"]
        assert msg["sender_is_admin"] is True
        assert msg["body"] == reply_text

        # Member GET /api/messages should see the reply
        mh = {"Authorization": f"Bearer {member['token']}"}
        lr = api_client.get(f"{base_url}/api/messages", headers=mh)
        assert lr.status_code == 200
        rows = lr.json()["messages"]
        found = next((m for m in rows if m["message_id"] == msg["message_id"]), None)
        assert found is not None, "Admin reply did not appear in member inbox"
        assert found["sender_is_admin"] is True
        assert found["body"] == reply_text

    def test_admin_reply_to_unknown_member_404(self, api_client, base_url, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = api_client.post(
            f"{base_url}/api/admin/threads/usr_{uuid.uuid4().hex[:10]}",
            json={"body": "hello"},
            headers=h,
        )
        assert r.status_code == 404


# ------------- Admin overview: unread_messages -------------
class TestAdminOverviewUnread:
    def test_overview_includes_unread_messages(self, api_client, base_url, admin_token, member):
        h = {"Authorization": f"Bearer {admin_token}"}
        # Send a fresh member message to guarantee unread > 0 for admin
        mh = {"Authorization": f"Bearer {member['token']}"}
        r0 = api_client.post(
            f"{base_url}/api/messages",
            json={"body": f"Ping {uuid.uuid4().hex[:5]}"},
            headers=mh,
        )
        assert r0.status_code == 200

        r = api_client.get(f"{base_url}/api/admin/overview", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "unread_messages" in d, f"unread_messages missing: {list(d.keys())}"
        assert isinstance(d["unread_messages"], int)
        assert d["unread_messages"] >= 1, f"Expected unread >=1, got {d['unread_messages']}"


# ------------- Auth guards on new endpoints -------------
class TestNewEndpointsAuthGuards:
    def test_messages_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/messages")
        assert r.status_code in (401, 403)

    def test_admin_threads_requires_admin(self, api_client, base_url, member):
        h = {"Authorization": f"Bearer {member['token']}"}
        r = api_client.get(f"{base_url}/api/admin/threads", headers=h)
        assert r.status_code == 403

    def test_admin_export_requires_admin(self, api_client, base_url, member):
        h = {"Authorization": f"Bearer {member['token']}"}
        r = api_client.post(f"{base_url}/api/admin/members/export", headers=h)
        assert r.status_code == 403

    def test_pdf_download_is_public(self, api_client, base_url, member):
        # Verify PDF download endpoint requires no auth. The download itself is
        # already covered in TestMembershipPDFDownload (api_client carries no
        # Authorization header). Under pytest-xdist workers this class may run
        # on a different worker so we skip if no aid was populated on this
        # worker's `member` fixture.
        aid = member.get("application_id")
        if not aid:
            pytest.skip("application_id not populated in this xdist worker")
        r = api_client.get(f"{base_url}/api/membership/forms/{aid}.pdf")
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
