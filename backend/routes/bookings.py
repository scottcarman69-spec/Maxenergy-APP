"""Member booking lifecycle: create, list/history, cancel, reschedule,
attendance, check-in QR code, class-pass QR and member stats.

Shared helpers used here (mark_booking_paid, sync_square_payment,
make_checkin_code, notify_waitlist_spot) stay in server.py and are imported.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone, timedelta
import jwt

from server import (
    db, require_user, require_admin, new_id, now_utc,
    mark_booking_paid, sync_square_payment, make_checkin_code, reconcile_user_payments,
    notify_user, notify_admins, create_notification, notify_waitlist_spot,
    send_push, send_email, _email_shell, esc, _public_base, _download_button,
    _calendar_buttons_html, _qld_naive_to_utc, GYM_INFO, JWT_SECRET, JWT_ALGO,
    ADMIN_NAV, APPT_ACTIVE_STATUSES, _booking_start_utc, _materialize_class,
    booking_ref_no, check_appt_window, coach_photo, get_cancel_window_hours, log,
)
from models import BookingCreate, RescheduleReq

router = APIRouter()


@router.post("/bookings")
async def booking_create(body: BookingCreate, u: dict = Depends(require_user)):
    cls = await db.classes.find_one({"class_id": body.class_id}, {"_id": 0})
    if not cls:
        # Virtual recurring instance — validate it's a real, non-blocked date, then
        # materialise it into a concrete class record so the booking can attach to it.
        cls = await _materialize_class(body.class_id)
    if not cls:
        raise HTTPException(404, "Class not found")
    if cls.get("cancelled"):
        raise HTTPException(409, "This class has been cancelled.")
    # Bookings close once a fixed (scheduled) class has started.
    if not cls.get("by_appointment"):
        start = cls.get("start_at")
        if isinstance(start, datetime):
            s = start.replace(tzinfo=None) if start.tzinfo else start
            now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)
            if s <= now_local:
                raise HTTPException(409, "This class has already started — online bookings are closed.")
    # Minimum-age requirement (e.g. Kids Muay Thai is 8+). Enforced server-side so it
    # can't be bypassed; the app collects the child's age before booking.
    min_age = cls.get("min_age")
    if isinstance(min_age, int) and isinstance(body.child_age, int) and body.child_age < min_age:
        raise HTTPException(400, f"Sorry, {cls['name']} is for ages {min_age} and over. Children under {min_age} can't be booked into this class.")
    # One active booking per fixed class instance. For age-gated Kids classes a parent
    # may book MULTIPLE children into the SAME class — so the uniqueness key becomes
    # (member + class + child). Each child can only be booked ONCE per class. For all
    # other (non-child) classes the rule stays one booking per member per class.
    # Class-pass bookings count too (paid/pending/confirmed/reschedule_requested).
    # Appointments are excluded — a member may book several PT/program sessions.
    if not cls.get("by_appointment"):
        dupe_q = {
            "user_id": u["user_id"], "class_id": body.class_id,
            "status": {"$in": ["paid", "pending", "confirmed", "reschedule_requested"]},
        }
        if body.child_id:
            dupe_q["child_id"] = body.child_id
        existing = await db.bookings.find_one(dupe_q, {"_id": 0})
        if existing:
            if existing.get("status") == "pending":
                return {"booking": existing}  # resume an unfinished (unpaid) booking
            if body.child_id:
                who = (body.child_name or "This child").strip() or "This child"
                raise HTTPException(409, f"{who} is already booked into this class.")
            raise HTTPException(409, "You've already booked this class.")
    booking_id = new_id("bk")
    is_appt = bool(cls.get("by_appointment"))
    # Appointment classes may offer multiple session lengths (e.g. 30 / 60 min).
    appt_options = cls.get("appt_durations") or []
    chosen_amount = cls["price_cents"]
    chosen_minutes = cls.get("duration_min")
    display_name = cls["name"]
    if is_appt and appt_options:
        opt = next((o for o in appt_options if int(o.get("minutes")) == int(body.duration_min or 0)), None)
        if not opt:
            raise HTTPException(400, "Please choose a session length.")
        chosen_amount = int(opt["price_cents"])
        chosen_minutes = int(opt["minutes"])
        display_name = f"{cls['name']} ({chosen_minutes} min)"
    if not is_appt:
        cap = cls.get("capacity") or 0
        if cap > 0:
            booked = await db.bookings.count_documents({"class_id": body.class_id, "status": {"$in": ["paid", "confirmed"]}})
            if booked >= cap:
                raise HTTPException(409, "This class is full.")
    if is_appt:
        if not body.requested_at:
            raise HTTPException(400, "Please choose a preferred time.")
        try:
            datetime.fromisoformat(body.requested_at)
        except Exception:
            raise HTTPException(400, "Invalid preferred time.")
        # Enforce day/time availability (Mon–Thu, 10:30am–4:00pm).
        check_appt_window(body.requested_at)
        # Only one appointment (PT or Program) can occupy a given day/time.
        slot_taken = await db.bookings.find_one({
            "by_appointment": True,
            "requested_at": body.requested_at,
            "status": {"$in": APPT_ACTIVE_STATUSES},
        })
        if slot_taken:
            raise HTTPException(409, "That time has just been taken. Please choose another slot.")
    doc = {
        "booking_id": booking_id,
        "user_id": u["user_id"],
        "class_id": body.class_id,
        "class_name": display_name,
        "amount": chosen_amount,
        "currency": cls.get("currency", "aud"),
        "by_appointment": is_appt,
        "duration_min": chosen_minutes,
        "class_start": cls.get("start_at"),
        "cal_reminder_minutes": 1440 if int(body.cal_reminder_minutes or u.get("cal_reminder_default") or 60) == 1440 else 60,
        "child_age": (int(body.child_age) if isinstance(body.child_age, int) or (isinstance(body.child_age, str) and str(body.child_age).isdigit()) else None),
        "child_name": ((body.child_name or "").strip()[:40] or None),
        "child_id": (body.child_id or None),
        "status": "pending",
        "created_at": now_utc(),
    }
    if is_appt:
        doc["requested_time"] = body.requested_time
        doc["requested_at"] = body.requested_at
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    # Remember the child's age on the parent's profile so they don't re-enter it.
    if isinstance(doc.get("child_age"), int):
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"child_age_default": doc["child_age"]}})
    if is_appt:
        member_name = u.get("name") or u.get("email")
        pref = body.requested_time or "a time to be confirmed"
        # In-app alert for admins (no email here) — the gym gets ONE combined email
        # with the full booker + payment details once payment is completed
        # (see mark_booking_paid → "New PT/Program booking — needs confirmation").
        admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1}).to_list(100)
        for a in admins:
            await create_notification(
                a["user_id"],
                "New session request",
                f"{member_name} requested a {display_name} session — preferred: {pref}.",
                "booking",
                {"nav": ADMIN_NAV.get("booking")},
            )
        await create_notification(
            u["user_id"],
            "Session request received",
            f"We received your request for {display_name} ({pref}). We'll confirm shortly.",
            "booking",
        )
    return {"booking": doc}


@router.get("/bookings")
async def bookings_list(u: dict = Depends(require_user)):
    # Reconcile any payments that completed on Square but weren't confirmed live.
    await reconcile_user_payments(u["user_id"])
    rows = await db.bookings.find(
        {"user_id": u["user_id"], "cleared": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    await _enrich_bookings(rows)
    return {"bookings": rows}


@router.post("/payments/reconcile")
async def payments_reconcile(u: dict = Depends(require_user)):
    """Force-sync pending Square payments for the current user. Returns booking_ids now paid."""
    paid = await reconcile_user_payments(u["user_id"])
    return {"paid_booking_ids": paid}


async def _enrich_bookings(rows: list) -> None:
    """Attach current class details (time, coach, duration) to each booking row."""
    for r in rows:
        r["booking_no"] = booking_ref_no(r.get("booking_id", ""))
    class_ids = list({r.get("class_id") for r in rows if r.get("class_id")})
    if not class_ids:
        return
    classes = {
        c["class_id"]: c
        for c in await db.classes.find({"class_id": {"$in": class_ids}}, {"_id": 0}).to_list(1000)
    }
    # Live spots-left per class (active bookings only) so members see how full their class is.
    agg = await db.bookings.aggregate([
        {"$match": {"class_id": {"$in": class_ids}, "status": {"$in": ["paid", "confirmed"]}}},
        {"$group": {"_id": "$class_id", "n": {"$sum": 1}}},
    ]).to_list(5000)
    booked_map = {a["_id"]: a["n"] for a in agg}
    for r in rows:
        c = classes.get(r.get("class_id")) or {}
        if c.get("start_at") is not None:
            r["class_start"] = c["start_at"]
        r["trainer"] = c.get("trainer")
        r["trainer_photo"] = coach_photo(c.get("trainer"))
        r["duration_min"] = c.get("duration_min")
        r["level"] = c.get("level")
        r["category"] = c.get("category")
        if c and not c.get("by_appointment"):
            cap = c.get("capacity") or 0
            booked = booked_map.get(r.get("class_id"), 0)
            r["capacity"] = cap
            r["booked"] = booked
            r["spots_left"] = max(cap - booked, 0)


@router.get("/bookings/history")
async def bookings_history(u: dict = Depends(require_user)):
    # Full saved booking log — includes bookings the member has cleared.
    rows = await db.bookings.find(
        {"user_id": u["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    await _enrich_bookings(rows)
    return {"bookings": rows}


@router.post("/bookings/clear-all")
async def bookings_clear_all(u: dict = Depends(require_user)):
    # Soft-clear: remove from the active list but keep in the saved history/log.
    res = await db.bookings.update_many(
        {"user_id": u["user_id"], "cleared": {"$ne": True}},
        {"$set": {"cleared": True, "cleared_at": now_utc()}},
    )
    return {"ok": True, "cleared": res.modified_count}


@router.post("/bookings/{booking_id}/clear")
async def booking_clear(booking_id: str, u: dict = Depends(require_user)):
    # Soft-clear so the booking stays in the member's saved history/log.
    await db.bookings.update_one(
        {"booking_id": booking_id, "user_id": u["user_id"]},
        {"$set": {"cleared": True, "cleared_at": now_utc()}},
    )
    return {"ok": True}


@router.post("/bookings/{booking_id}/cancel")
async def booking_cancel(booking_id: str, u: dict = Depends(require_user)):
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") == "cancelled":
        return {"booking": b}
    # cancellation cutoff: members can only cancel at least N hours before the
    # scheduled start (Queensland time). Admin-configurable. Applies to classes and appointments.
    cancel_window = await get_cancel_window_hours()
    now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)
    start_local = None
    ra = b.get("requested_at")
    if ra:
        try:
            start_local = datetime.fromisoformat(ra).replace(tzinfo=None)
        except Exception:
            start_local = None
    else:
        cs = None
        if b.get("class_id"):
            c = await db.classes.find_one({"class_id": b["class_id"]}, {"_id": 0, "start_at": 1})
            cs = (c or {}).get("start_at")
        cs = cs or b.get("class_start")
        if isinstance(cs, str):
            try:
                cs = datetime.fromisoformat(cs.replace("Z", "+00:00"))
            except Exception:
                cs = None
        if isinstance(cs, datetime):
            start_local = cs.replace(tzinfo=None) if cs.tzinfo else cs
    if start_local is not None and now_local >= (start_local - timedelta(hours=cancel_window)):
        hr_txt = f"{cancel_window} hour{'s' if cancel_window != 1 else ''}"
        raise HTTPException(
            409,
            f"Bookings can only be cancelled at least {hr_txt} before the start time. Please contact the gym on 07 4057 9005 if you need help.",
        )
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "cancelled", "cancelled_at": now_utc(), "cancelled_by": "member"}})
    member_name = u.get("name") or u.get("email")

    # Auto reward for cancelling within policy (>=24h before start):
    #  - if the booking was paid with a class pass -> return the pass
    #  - else if money was paid -> add in-app credit for the amount paid
    was_paid = b.get("status") in ("paid", "confirmed")
    amount = int(b.get("amount", 0) or 0)
    reward_line = ""
    if was_paid and b.get("paid_with_pass"):
        fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "class_pass_credits": 1})
        left = int((fresh or {}).get("class_pass_credits", 0)) + 1
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"class_pass_credits": left}})
        await db.pass_ledger.insert_one({
            "pass_ledger_id": new_id("pl"), "user_id": u["user_id"], "delta": 1,
            "reason": f"Pass returned — {b.get('class_name')} cancelled by member", "balance_after": left,
            "created_at": now_utc(),
        })
        await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"cancel_reward": "class_pass"}})
        reward_line = f"Your class pass has been returned — you now have <b>{left}</b> pass{'es' if left != 1 else ''}."
    elif was_paid and amount > 0:
        await db.users.update_one({"user_id": u["user_id"]}, {"$inc": {"credit_cents": amount}})
        await db.credit_ledger.insert_one({
            "ledger_id": new_id("cl"), "user_id": u["user_id"], "delta_cents": amount,
            "reason": f"Credit for cancelled {b.get('class_name')}", "booking_id": booking_id, "created_at": now_utc(),
        })
        await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"cancel_reward": "credit", "cancel_credit_cents": amount}})
        reward_line = f"We've added <b>${amount/100:.2f}</b> in account credit to use toward your next booking."

    body_lines = [f"Your booking for <b>{b['class_name']}</b> has been cancelled."]
    if reward_line:
        body_lines.append(reward_line)
    body_lines.append("We hope to see you back on the mats soon!")
    notif_body = f"Your booking for {b['class_name']} has been cancelled."
    if reward_line:
        notif_body += " " + reward_line.replace("<b>", "").replace("</b>", "")
    await notify_user(
        u["user_id"], u.get("email"),
        "Booking cancelled",
        notif_body,
        "booking",
        email_lines=body_lines,
    )
    await notify_admins(
        "Booking cancelled by member",
        f"{member_name} cancelled their {b['class_name']} booking.",
        "booking",
        email_lines=[f"<b>{esc(member_name)}</b> cancelled their <b>{esc(b['class_name'])}</b> booking."],
    )
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    # A spot just freed up on a fixed class — offer it to the next member on the waitlist.
    if b and b.get("class_id") and not b.get("by_appointment"):
        try:
            await notify_waitlist_spot(b["class_id"])
        except Exception as e:
            log.error(f"waitlist notify failed for {b.get('class_id')}: {e}")
    return {"booking": b}


@router.post("/bookings/{booking_id}/reschedule")
async def booking_reschedule(booking_id: str, body: RescheduleReq, u: dict = Depends(require_user)):
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") == "cancelled":
        raise HTTPException(400, "This booking is cancelled and cannot be rescheduled.")
    if b.get("status") == "reschedule_requested":
        raise HTTPException(409, "You already have a reschedule request pending. The gym will confirm a new time shortly.")
    # The NEW chosen time must be at least N hours from now (Queensland time).
    cancel_window = await get_cancel_window_hours()
    now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)
    if body.requested_at:
        try:
            new_local = datetime.fromisoformat(body.requested_at).replace(tzinfo=None)
        except Exception:
            new_local = None
        if new_local is not None and new_local < (now_local + timedelta(hours=cancel_window)):
            hr_txt = f"{cancel_window} hour{'s' if cancel_window != 1 else ''}"
            raise HTTPException(
                409,
                f"Please choose a new time at least {hr_txt} from now. Pick a later day or time, or call the gym on 07 4057 9005.",
            )
    set_fields = {"status": "reschedule_requested", "requested_time": body.requested_time,
                  "reschedule_note": body.note, "reschedule_requested_at": now_utc()}
    if body.requested_at:
        set_fields["requested_at"] = body.requested_at
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": set_fields},
    )
    member_name = u.get("name") or u.get("email")
    note_txt = f" Note: {body.note}" if body.note else ""
    await create_notification(
        u["user_id"],
        "Reschedule requested",
        f"We received your reschedule request for {b['class_name']} ({body.requested_time}). We'll confirm shortly.",
        "booking",
    )
    await notify_admins(
        "Reschedule request",
        f"{member_name} asked to reschedule {b['class_name']} to: {body.requested_time}.{note_txt}",
        "booking",
        email_lines=[
            f"<b>{esc(member_name)}</b> requested to reschedule their <b>{esc(b['class_name'])}</b> booking.",
            f"Preferred time: <b>{esc(body.requested_time)}</b>",
            (f"Note: {esc(body.note)}" if body.note else ""),
            "Open Admin → Bookings to confirm the new time.",
        ],
    )
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    return {"booking": b}


@router.post("/bookings/{booking_id}/checkin")
async def booking_checkin(booking_id: str, u: dict = Depends(require_user)):
    # Self check-in is disabled — members are checked in only when gym staff scan their entry QR.
    raise HTTPException(403, "Check-in is done by gym staff scanning your entry QR code.")


@router.post("/bookings/{booking_id}/confirm-attendance")
async def booking_confirm_attendance(booking_id: str, u: dict = Depends(require_user)):
    """Member self-confirms they attended (used when the entry QR wasn't scanned during
    class). Marks the booking attended for everyone — once either the member OR an admin
    confirms, the other side no longer needs to."""
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") not in ("paid", "confirmed"):
        raise HTTPException(400, "This booking can't be confirmed.")
    if b.get("attended"):
        return {"ok": True, "attended": True}
    start = await _booking_start_utc(b)
    if start and now_utc() < start:
        raise HTTPException(400, "You can confirm attendance once the class has started.")
    name = u.get("name") or u.get("email") or "Member"
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"attended": True, "checked_in_at": now_utc(), "checked_in_by": name,
                  "checked_in_by_id": u["user_id"], "checked_in_method": "member"}},
    )
    return {"ok": True, "attended": True}


@router.get("/bookings/{booking_id}/checkin-code")
async def booking_checkin_code(booking_id: str, u: dict = Depends(require_user)):
    """Return a signed QR payload the member displays for door check-in."""
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") not in ("paid", "confirmed"):
        raise HTTPException(400, "Only paid or confirmed bookings have a check-in code.")
    # Expiry is tied to the CLASS (start + 2 days), not when the code is opened, so an old
    # code can't be reused after the class. By-appointment sessions (no fixed start) fall
    # back to a long window. Single-use (attended flag) + class-day lock are the primary guards.
    cls = await db.classes.find_one({"class_id": b.get("class_id")}, {"_id": 0, "start_at": 1}) or {}
    start = cls.get("start_at") or b.get("class_start")
    if isinstance(start, str):
        try:
            start = datetime.fromisoformat(start.replace("Z", "+00:00"))
        except Exception:
            start = None
    if isinstance(start, datetime):
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        exp = start + timedelta(days=2)
    else:
        exp = datetime.now(timezone.utc) + timedelta(days=120)
    code = make_checkin_code(booking_id, u["user_id"], exp)
    return {"code": code, "booking_id": booking_id}


@router.get("/passes/qr")
async def class_pass_qr(u: dict = Depends(require_user)):
    """Signed QR the member shows on arrival; admin scans it to redeem one class pass."""
    fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "class_pass_credits": 1})
    payload = {
        "uid": u["user_id"],
        "typ": "classpass",
        "exp": datetime.now(timezone.utc) + timedelta(days=2),
    }
    code = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)
    return {"code": code, "class_pass_credits": int((fresh or {}).get("class_pass_credits", 0))}


@router.get("/me/stats")
async def me_stats(u: dict = Depends(require_user)):
    """Lightweight member stats for the home screen (e.g. classes attended this month)."""
    QLD = timedelta(hours=10)  # Queensland time (no DST)
    # Start of the current QLD month, converted to UTC for the query.
    now_local = (now_utc() + QLD)
    month_start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_start_utc = (month_start_local - QLD).replace(tzinfo=timezone.utc)
    attended_this_month = await db.bookings.count_documents({
        "user_id": u["user_id"],
        "attended": True,
        "checked_in_at": {"$gte": month_start_utc},
    })
    return {"attended_this_month": int(attended_this_month), "month": now_local.strftime("%B")}
