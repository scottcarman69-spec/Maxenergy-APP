"""Admin dashboard overview + class (recurring template & by-appointment) CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta

from server import (
    db, require_admin, new_id, now_utc,
    _make_template_id, _cap_limit, DEFAULT_CLASS_IMAGE,
)
from models import ClassUpsert

router = APIRouter()


@router.get("/admin/overview")
async def admin_overview(u: dict = Depends(require_admin)):
    classes = await db.classes.count_documents({})
    apps = await db.membership_applications.count_documents({})
    pending = await db.membership_applications.count_documents({"status": "pending"})
    ann = await db.announcements.count_documents({})
    members = await db.users.count_documents({})
    pending_bookings = await db.bookings.count_documents({"status": {"$in": ["pending", "reschedule_requested"]}})
    session_requests = await db.bookings.count_documents({"by_appointment": True, "status": {"$in": ["pending", "reschedule_requested"]}})
    trials = await db.free_trials.count_documents({})
    unread_messages = await db.messages.count_documents({"sender_is_admin": False, "read_by_admin": {"$ne": True}})
    refunds_pending = await db.bookings.count_documents({"refund_status": "pending"})
    group_requests = (await db.group_requests.count_documents({"status": "pending"})) + (await db.group_join_requests.count_documents({"status": "pending"}))
    bug_reports_open = await db.bug_reports.count_documents({"status": "open"})
    return {"classes": classes, "applications": apps, "pending_applications": pending, "announcements": ann, "members": members, "pending_bookings": pending_bookings, "session_requests": session_requests, "trials": trials, "unread_messages": unread_messages, "refunds_pending": refunds_pending, "group_requests": group_requests, "bug_reports_open": bug_reports_open}


@router.get("/admin/classes")
async def admin_classes(u: dict = Depends(require_admin)):
    # Recurring weekly templates + by-appointment classes. Templates are shown with a
    # computed next occurrence so the existing UI can render them.
    tmpls = await db.class_templates.find({}, {"_id": 0}).sort([("weekday", 1), ("hour", 1)]).to_list(500)
    today = ((now_utc() + timedelta(hours=10)).replace(tzinfo=None)).date()
    out = []
    for t in tmpls:
        wd = int(t.get("weekday", 0))
        d = today + timedelta(days=(wd - today.weekday()) % 7)
        nxt = datetime(d.year, d.month, d.day, int(t.get("hour") or 0), int(t.get("minute") or 0))
        row = dict(t)
        row["class_id"] = t["template_id"]
        row["is_template"] = True
        row["recurring"] = True
        row["start_at"] = nxt
        row["start_time"] = f"{int(t.get('hour') or 0):02d}:{int(t.get('minute') or 0):02d}"
        out.append(row)
    appts = await db.classes.find({"by_appointment": True}, {"_id": 0}).sort("start_at", 1).to_list(200)
    out.extend(appts)
    return {"classes": out}


def _parse_dt(s: str) -> datetime:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        raise HTTPException(400, "Invalid start_at datetime")


def _weekday_hour_from(body: ClassUpsert) -> tuple:
    """Resolve (weekday, hour, minute) for a recurring class from explicit fields or
    from a provided start_at datetime."""
    if isinstance(body.weekday, int) and body.start_time:
        try:
            hh, mm = body.start_time.split(":")
            return int(body.weekday), int(hh), int(mm)
        except Exception:
            raise HTTPException(400, "Invalid start time")
    if body.start_at:
        dt = _parse_dt(body.start_at)
        dt = dt.replace(tzinfo=None) if dt.tzinfo else dt
        return dt.weekday(), dt.hour, dt.minute
    raise HTTPException(400, "Choose a day and time for the class")


@router.post("/admin/classes")
async def admin_class_create(body: ClassUpsert, u: dict = Depends(require_admin)):
    by_appt = bool(body.by_appointment)
    if by_appt:
        doc = {
            "class_id": new_id("cls"), "name": body.name, "trainer": body.trainer,
            "category": body.category, "level": body.level, "duration_min": body.duration_min,
            "price_cents": body.price_cents, "currency": "aud",
            "image": body.image or DEFAULT_CLASS_IMAGE, "description": body.description or "",
            "color": "#FF7A00", "start_at": now_utc(), "capacity": 1, "by_appointment": True,
            "min_age": body.min_age if isinstance(body.min_age, int) else None,
            "max_age": body.max_age if isinstance(body.max_age, int) else None,
            "created_at": now_utc(),
        }
        await db.classes.insert_one(doc)
        doc.pop("_id", None)
        return {"class": doc}
    # Recurring weekly template
    wd, hour, minute = _weekday_hour_from(body)
    tid = _make_template_id(body.name, body.category, wd, hour, minute)
    if await db.class_templates.find_one({"template_id": tid}):
        tid = f"{tid}_{new_id('t')[:6]}"
    tmpl = {
        "template_id": tid, "name": body.name, "trainer": body.trainer, "category": body.category,
        "level": body.level, "duration_min": body.duration_min, "price_cents": body.price_cents,
        "currency": "aud", "image": body.image or DEFAULT_CLASS_IMAGE, "description": body.description or "",
        "program": "", "color": "#FF7A00", "weekday": wd, "hour": hour, "minute": minute,
        "capacity": min(int(body.capacity or 16), _cap_limit(body.name)), "by_appointment": False,
        "min_age": body.min_age if isinstance(body.min_age, int) else None,
        "max_age": body.max_age if isinstance(body.max_age, int) else None,
        "active": True, "created_at": now_utc(),
    }
    await db.class_templates.insert_one(tmpl)
    tmpl.pop("_id", None)
    tmpl["class_id"] = tid
    tmpl["is_template"] = True
    return {"class": tmpl}


@router.put("/admin/classes/{class_id}")
async def admin_class_update(class_id: str, body: ClassUpsert, u: dict = Depends(require_admin)):
    if class_id.startswith("tmpl_"):
        upd = {
            "name": body.name, "trainer": body.trainer, "category": body.category,
            "level": body.level, "duration_min": body.duration_min, "price_cents": body.price_cents,
            "capacity": min(int(body.capacity or 16), _cap_limit(body.name)),
        }
        if isinstance(body.weekday, int) or body.start_time or body.start_at:
            wd, hour, minute = _weekday_hour_from(body)
            upd.update({"weekday": wd, "hour": hour, "minute": minute})
        if body.image:
            upd["image"] = body.image
        if body.description is not None:
            upd["description"] = body.description
        upd["min_age"] = body.min_age if isinstance(body.min_age, int) else None
        upd["max_age"] = body.max_age if isinstance(body.max_age, int) else None
        r = await db.class_templates.update_one({"template_id": class_id}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(404, "Class not found")
        c = await db.class_templates.find_one({"template_id": class_id}, {"_id": 0})
        c["class_id"] = class_id
        c["is_template"] = True
        return {"class": c}
    # By-appointment class stored in classes
    upd = {
        "name": body.name, "trainer": body.trainer, "category": body.category,
        "level": body.level, "duration_min": body.duration_min, "price_cents": body.price_cents,
    }
    if body.image:
        upd["image"] = body.image
    if body.description is not None:
        upd["description"] = body.description
    upd["min_age"] = body.min_age if isinstance(body.min_age, int) else None
    upd["max_age"] = body.max_age if isinstance(body.max_age, int) else None
    r = await db.classes.update_one({"class_id": class_id}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Class not found")
    c = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    return {"class": c}


@router.delete("/admin/classes/{class_id}")
async def admin_class_delete(class_id: str, u: dict = Depends(require_admin)):
    if class_id.startswith("tmpl_"):
        await db.class_templates.delete_one({"template_id": class_id})
    else:
        await db.classes.delete_one({"class_id": class_id})
    return {"ok": True}
