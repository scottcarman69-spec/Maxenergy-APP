"""Quick check: email reduction changes (digest, merged receipt, no chat emails, single group-request email)."""
import asyncio, sys
sys.path.insert(0, "/app/backend")
import server
from routes import groups

sent = []


async def fake_send(recipient, subject, html, attachments=None):
    sent.append((recipient, subject, html))
    return True

server.send_email = fake_send
groups.send_email = fake_send


async def main():
    db = server.db
    # 1) digest: notify_admins with digest -> no email, row stored
    sent.clear()
    await db.admin_digest.delete_many({"line": {"$regex": "^TEST_"}})
    await server.notify_admins("t", "b", digest="cancellations", digest_line="TEST_cancel line")
    await server.notify_admins("t", "b", digest="bookings", digest_line="TEST_booking line")
    assert not sent, sent
    n = await server.send_admin_digest(force=True)
    assert n >= 2 and len(sent) == 1, (n, sent)
    assert "TEST_cancel line" in sent[0][2] and "TEST_booking line" in sent[0][2]
    print("digest OK:", sent[0][1])
    # no double send
    sent.clear()
    assert await server.send_admin_digest(force=True) == 0 and not sent
    # 2) email_on=False -> no email
    u = await db.users.find_one({"email": "testmember@gmail.com"})
    await server.notify_user(u["user_id"], u["email"], "TEST chat", "x", "message", email_on=False)
    assert not sent
    print("chat no-email OK")
    # 3) group request -> one email to gym only
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1, "email": 1}).to_list(50)
    await groups._notify_all_admins(admins, "TEST group req", "x", ["line"], "admin_group_requests")
    assert len(sent) == 1 and sent[0][0] == server.GYM_ADMIN_EMAIL, sent
    print("group request single email OK")
    # 4) merged receipt: claim once, second claim None, standalone receipt no-ops
    sent.clear()
    sid = "TEST_sess_" + server.new_id("x")
    tx = {"session_id": sid, "provider": "square", "user_id": u["user_id"], "kind": "store",
          "product_id": "pass_1class", "amount": 2500, "currency": "aud"}
    await db.payment_transactions.insert_one(dict(tx))
    rc = await server._claim_receipt(tx)
    assert rc and any("Payment receipt" in l for l in rc["lines"]), rc
    assert await server._claim_receipt(tx) is None
    await server.send_payment_receipt(tx)
    assert not sent, sent
    print("merged receipt OK")
    await db.payment_transactions.delete_one({"session_id": sid})
    for a in admins:
        await db.notifications.delete_many({"user_id": a["user_id"], "title": {"$in": ["t", "TEST group req"]}})
    await db.notifications.delete_many({"title": "TEST chat"})
    await db.admin_digest.delete_many({"line": {"$regex": "^TEST_"}})
    print("ALL OK")

asyncio.run(main())
