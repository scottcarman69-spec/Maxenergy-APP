"""Class waitlist join / leave / status (member-facing).

Note: the shared helpers ``_class_is_full``, ``WAITLIST_ACTIVE_BOOKING`` and
``notify_waitlist_spot`` remain in server.py because they are also used by the
bookings flow there; this module only hosts the member-facing waitlist routes.
"""
from fastapi import APIRouter, Depends, HTTPException

from server import db, require_user, new_id, now_utc, create_notification, _class_is_full, WAITLIST_ACTIVE_BOOKING

router = APIRouter()


@router.get("/waitlists/me")
async def waitlists_me(u: dict = Depends(require_user)):
    rows = await db.waitlists.find(
        {"user_id": u["user_id"], "status": "waiting"}, {"_id": 0, "class_id": 1}
    ).to_list(200)
    return {"class_ids": [r["class_id"] for r in rows]}


@router.post("/classes/{class_id}/waitlist")
async def waitlist_join(class_id: str, u: dict = Depends(require_user)):
    cls = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if not cls or cls.get("by_appointment"):
        raise HTTPException(404, "Class not found.")
    # already booked?
    booked = await db.bookings.find_one(
        {"user_id": u["user_id"], "class_id": class_id, "status": {"$in": WAITLIST_ACTIVE_BOOKING}}, {"_id": 0}
    )
    if booked:
        raise HTTPException(409, "You're already booked into this class.")
    if not await _class_is_full(cls):
        raise HTTPException(409, "This class still has spots — you can book it now.")
    existing = await db.waitlists.find_one({"class_id": class_id, "user_id": u["user_id"], "status": "waiting"}, {"_id": 0})
    if existing:
        pos = await db.waitlists.count_documents({"class_id": class_id, "status": "waiting", "created_at": {"$lte": existing["created_at"]}})
        return {"ok": True, "position": pos, "already": True}
    doc = {"waitlist_id": new_id("wl"), "class_id": class_id, "user_id": u["user_id"], "status": "waiting", "created_at": now_utc()}
    await db.waitlists.insert_one(doc)
    pos = await db.waitlists.count_documents({"class_id": class_id, "status": "waiting"})
    await create_notification(
        u["user_id"], "You're on the waitlist",
        f"You're #{pos} on the waitlist for {cls['name']}. We'll let you know if a spot opens.", "booking",
    )
    return {"ok": True, "position": pos}


@router.delete("/classes/{class_id}/waitlist")
async def waitlist_leave(class_id: str, u: dict = Depends(require_user)):
    await db.waitlists.delete_many({"class_id": class_id, "user_id": u["user_id"], "status": "waiting"})
    return {"ok": True}
