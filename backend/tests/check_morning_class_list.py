"""Quick check: morning class list email (captures email instead of sending)."""
import asyncio, sys
from datetime import timedelta
sys.path.insert(0, "/app/backend")
import server

sent = []


async def fake_send(recipient, subject, html, attachments=None):
    sent.append((recipient, subject, html))
    return True

server.send_email = fake_send


async def main():
    db = server.db
    q = server.qld_now_naive().replace(hour=9, minute=30, second=0, microsecond=0)
    u = await db.users.find_one({"email": "testmember@gmail.com"})
    cid, bid = "TEST_cls_ml", "TEST_bk_ml"
    await db.classes.insert_one({"class_id": cid, "name": "TEST Boxing", "start_at": q, "trainer": "Coach T", "capacity": 12, "by_appointment": False})
    await db.bookings.insert_one({"booking_id": bid, "class_id": cid, "user_id": u["user_id"], "class_name": "TEST Boxing", "status": "paid", "paid_with_pass": True})
    try:
        n = await server.send_morning_class_list(force=True)
        assert len(sent) == 1 and sent[0][0] == server.GYM_ADMIN_EMAIL, sent
        html = sent[0][2]
        assert "TEST Boxing" in html and "9:30 AM" in html and "Coach T" in html and "(1 / 12 booked)" in html, html
        assert (u.get("name") or u["email"]) in html
        print("class list OK:", sent[0][1], "booked:", n)
    finally:
        await db.classes.delete_one({"class_id": cid})
        await db.bookings.delete_one({"booking_id": bid})

asyncio.run(main())
