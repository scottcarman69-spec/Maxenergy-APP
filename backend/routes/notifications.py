"""Member notifications: list, history, unread count, read / clear."""
from fastapi import APIRouter, Depends

from server import db, require_user, now_utc

router = APIRouter()


# NOTE: static paths are declared BEFORE the dynamic /{nid} routes so they match first.
@router.get("/notifications")
async def notifications_list(u: dict = Depends(require_user)):
    rows = await db.notifications.find(
        {"user_id": u["user_id"], "cleared": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"notifications": rows}


@router.get("/notifications/history")
async def notifications_history(u: dict = Depends(require_user)):
    # Full saved log — includes notifications the member has cleared.
    rows = await db.notifications.find(
        {"user_id": u["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"notifications": rows}


@router.get("/notifications/unread")
async def notifications_unread(u: dict = Depends(require_user)):
    count = await db.notifications.count_documents(
        {"user_id": u["user_id"], "read": {"$ne": True}, "cleared": {"$ne": True}}
    )
    return {"count": count}


@router.post("/notifications/read-all")
async def notifications_read_all(u: dict = Depends(require_user)):
    await db.notifications.update_many({"user_id": u["user_id"], "read": {"$ne": True}}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/clear-all")
async def notifications_clear_all(u: dict = Depends(require_user)):
    # Soft-clear: remove from the active list but keep in the saved history/log.
    res = await db.notifications.update_many(
        {"user_id": u["user_id"], "cleared": {"$ne": True}},
        {"$set": {"cleared": True, "read": True, "cleared_at": now_utc()}},
    )
    return {"ok": True, "cleared": res.modified_count}


@router.post("/notifications/{nid}/read")
async def notifications_read(nid: str, u: dict = Depends(require_user)):
    await db.notifications.update_one({"notification_id": nid, "user_id": u["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.delete("/notifications/{nid}")
async def notifications_delete(nid: str, u: dict = Depends(require_user)):
    # Soft-clear so the notification stays in the member's saved history/log.
    await db.notifications.update_one(
        {"notification_id": nid, "user_id": u["user_id"]},
        {"$set": {"cleared": True, "read": True, "cleared_at": now_utc()}},
    )
    return {"ok": True}
