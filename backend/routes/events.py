"""Events, event RSVP, and member content-view tracking."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime

from server import db, require_user, require_admin, new_id, now_utc, send_email, _email_shell

router = APIRouter()


@router.get("/events")
async def events_list():
    rows = await db.events.find({}, {"_id": 0}).sort("start_at", 1).to_list(200)
    return {"events": rows}


@router.get("/events/{event_id}")
async def event_detail(event_id: str):
    e = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Event not found")
    return e


# -------------------- content view tracking (admin records) --------------------
async def _record_view(view_type: str, key: str, u: dict) -> None:
    """Record that a member viewed a piece of content. Unique per (type,key,user)
    so we can report distinct viewers, plus a total view count."""
    if u.get("is_admin"):
        return  # don't count staff/admin views
    await db.content_views.update_one(
        {"view_type": view_type, "key": key, "user_id": u["user_id"]},
        {
            "$set": {"last_at": now_utc(), "user_name": u.get("name"), "user_email": u.get("email")},
            "$setOnInsert": {"first_at": now_utc()},
            "$inc": {"count": 1},
        },
        upsert=True,
    )


@router.post("/views/notices")
async def track_notices_view(u: dict = Depends(require_user)):
    await _record_view("notices", "notices", u)
    return {"ok": True}


@router.post("/views/event/{event_id}")
async def track_event_view(event_id: str, u: dict = Depends(require_user)):
    await _record_view("event", event_id, u)
    return {"ok": True}


@router.post("/views/announcement/{announcement_id}")
async def track_announcement_view(announcement_id: str, u: dict = Depends(require_user)):
    await _record_view("announcement", announcement_id, u)
    return {"ok": True}


@router.post("/views/bookings")
async def track_bookings_view(u: dict = Depends(require_user)):
    await _record_view("bookings", "bookings", u)
    return {"ok": True}


@router.get("/home/badges")
async def home_badges(u: dict = Depends(require_user)):
    """Small 'something new' counts for the Home quick actions.
    - notices: announcements posted since the member last opened the Notices tab
    - bookings: bookings created/confirmed since the member last opened My Bookings
    Both clear once the member opens the relevant screen (which records a view)."""
    me = u["user_id"]
    nv = await db.content_views.find_one(
        {"view_type": "notices", "key": "notices", "user_id": me}, {"_id": 0, "last_at": 1}
    )
    since_n = nv.get("last_at") if nv else None
    notices = await db.announcements.count_documents({} if since_n is None else {"created_at": {"$gt": since_n}})

    bv = await db.content_views.find_one(
        {"view_type": "bookings", "key": "bookings", "user_id": me}, {"_id": 0, "last_at": 1}
    )
    since_b = bv.get("last_at") if bv else None
    bookings = 0
    async for b in db.bookings.find(
        {"user_id": me, "status": {"$nin": ["cancelled", "refunded", "expired", "no_show"]}},
        {"_id": 0, "created_at": 1, "confirmed_at": 1, "paid_at": 1},
    ):
        t = b.get("confirmed_at") or b.get("paid_at") or b.get("created_at")
        if since_b is None or (isinstance(t, datetime) and t > since_b):
            bookings += 1
    return {"bookings": bookings, "notices": notices}


@router.get("/admin/views")
async def admin_views(u: dict = Depends(require_admin)):
    # Notices tab: distinct viewers + total views
    notices_docs = await db.content_views.find({"view_type": "notices"}, {"_id": 0}).to_list(10000)
    notices = {
        "unique_users": len(notices_docs),
        "total_views": sum(int(d.get("count", 0)) for d in notices_docs),
    }

    async def _by_key(view_type: str) -> dict:
        docs = await db.content_views.find({"view_type": view_type}, {"_id": 0}).to_list(10000)
        agg: dict = {}
        for d in docs:
            a = agg.setdefault(d["key"], {"unique_users": 0, "total_views": 0})
            a["unique_users"] += 1
            a["total_views"] += int(d.get("count", 0))
        return agg

    # Per-event viewers
    by_event = await _by_key("event")
    events_rows = await db.events.find({}, {"_id": 0, "event_id": 1, "title": 1, "start_at": 1}).to_list(200)
    ev_map = {e["event_id"]: e for e in events_rows}
    events = []
    for k, a in by_event.items():
        meta = ev_map.get(k, {})
        events.append({
            "event_id": k,
            "title": meta.get("title", "(deleted event)"),
            "start_at": meta.get("start_at"),
            "unique_users": a["unique_users"],
            "total_views": a["total_views"],
        })
    events.sort(key=lambda x: x["unique_users"], reverse=True)

    # Per-announcement (individual notice) viewers
    by_ann = await _by_key("announcement")
    ann_rows = await db.announcements.find({}, {"_id": 0, "announcement_id": 1, "title": 1, "pinned": 1, "created_at": 1}).to_list(200)
    ann_map = {a["announcement_id"]: a for a in ann_rows}
    announcements = []
    for k, a in by_ann.items():
        meta = ann_map.get(k, {})
        announcements.append({
            "announcement_id": k,
            "title": meta.get("title", "(deleted notice)"),
            "pinned": bool(meta.get("pinned")),
            "created_at": meta.get("created_at"),
            "unique_users": a["unique_users"],
            "total_views": a["total_views"],
        })
    announcements.sort(key=lambda x: x["unique_users"], reverse=True)

    return {"notices": notices, "events": events, "announcements": announcements}


class EventRSVPReq(BaseModel):
    event_id: str


@router.post("/events/rsvp")
async def event_rsvp(body: EventRSVPReq, u: dict = Depends(require_user)):
    e = await db.events.find_one({"event_id": body.event_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Event not found")
    existing = await db.event_rsvps.find_one({"event_id": body.event_id, "user_id": u["user_id"]})
    if existing:
        return {"ok": True, "already": True}
    await db.event_rsvps.insert_one(
        {"rsvp_id": new_id("rsvp"), "event_id": body.event_id, "user_id": u["user_id"], "created_at": now_utc()}
    )
    when = e["start_at"].strftime("%a %d %b, %I:%M %p") if isinstance(e["start_at"], datetime) else str(e["start_at"])
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": u["user_id"],
            "title": f"You're going to {e['title']}",
            "body": f"{e['title']} on {when}.",
            "type": "event",
            "read": False,
            "created_at": now_utc(),
        }
    )
    html = _email_shell(
        f"You're going to {e['title']}",
        [
            "See you at Maxenergy Fitness.",
            f"<strong>When:</strong> {when}",
            f"<strong>Where:</strong> {e.get('location','Maxenergy Fitness, Smithfield')}",
            e.get("description", ""),
        ],
    )
    await send_email(u["email"], f"RSVP confirmed – {e['title']}", html)
    return {"ok": True}
