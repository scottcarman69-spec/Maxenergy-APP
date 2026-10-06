"""Free trial claims (Kids / Adults Muay Thai) linked to a real class booking."""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timedelta

from server import (
    db, require_user, new_id, now_utc, send_email, _email_shell, notify_admins,
    GYM_INFO, _calendar_buttons_html, _qld_naive_to_utc, _public_base, TrialClaimReq,
)

router = APIRouter()


@router.get("/trials/me")
async def trials_me(u: dict = Depends(require_user)):
    rows = await db.free_trials.find({"user_id": u["user_id"]}, {"_id": 0}).to_list(20)
    return {"trials": rows, "claimed": [r["category"] for r in rows]}


@router.get("/trials/sessions")
async def trials_sessions(category: str, u: dict = Depends(require_user)):
    """Upcoming Muay Thai sessions a member can pick for their free trial (real schedule)."""
    if category not in ("Kids", "Adults"):
        raise HTTPException(400, "Invalid category")
    now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)  # QLD
    rows = await db.classes.find(
        {"name": "Muay Thai", "category": category, "by_appointment": {"$ne": True}},
        {"_id": 0, "class_id": 1, "name": 1, "category": 1, "level": 1, "start_at": 1, "duration_min": 1},
    ).sort("start_at", 1).to_list(200)
    out = []
    for c in rows:
        st = c.get("start_at")
        if isinstance(st, str):
            try:
                st = datetime.fromisoformat(st.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                st = None
        if not isinstance(st, datetime):
            continue
        s = st.replace(tzinfo=None) if st.tzinfo else st
        if s <= now_local:
            continue
        out.append({
            "class_id": c["class_id"],
            "start_at": s.isoformat(),
            "label": s.strftime("%a %d %b"),
            "time": s.strftime("%-I:%M %p"),
            "weekday": s.strftime("%A"),
            "duration_min": int(c.get("duration_min") or (45 if category == "Kids" else 60)),
        })
        if len(out) >= 12:
            break
    return {"sessions": out}


@router.post("/trials/claim")
async def trials_claim(body: TrialClaimReq, request: Request, u: dict = Depends(require_user)):
    category = body.category
    if category not in ("Kids", "Adults"):
        raise HTTPException(400, "Invalid category")
    child_name = (body.child_name or "").strip()
    child_age = (body.child_age or "").strip()
    attendee_name = (body.attendee_name or "").strip()
    if category == "Kids":
        if not child_name:
            raise HTTPException(400, "Please enter the child's name.")
        if not child_age:
            raise HTTPException(400, "Please enter the child's age.")
    else:  # Adults
        if not attendee_name:
            raise HTTPException(400, "Please enter your name.")

    # The member must pick a real, upcoming Muay Thai session from the schedule.
    if not body.class_id:
        raise HTTPException(400, "Please choose a class session for your trial.")
    cls = await db.classes.find_one({"class_id": body.class_id}, {"_id": 0})
    if not cls or cls.get("name") != "Muay Thai" or cls.get("category") != category:
        raise HTTPException(400, "That session isn't available for this trial. Please pick another.")
    trial_start = cls.get("start_at")
    if isinstance(trial_start, str):
        try:
            trial_start = datetime.fromisoformat(trial_start.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            trial_start = None
    now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)
    if not isinstance(trial_start, datetime) or (trial_start.replace(tzinfo=None) if trial_start.tzinfo else trial_start) <= now_local:
        raise HTTPException(400, "That session has already passed. Please pick an upcoming class.")
    trial_start = trial_start.replace(tzinfo=None) if trial_start.tzinfo else trial_start
    preferred_day = f"{trial_start.strftime('%a %d %b')} · {trial_start.strftime('%-I:%M %p')}"
    existing = await db.free_trials.find_one({"user_id": u["user_id"], "category": category})
    if existing:
        raise HTTPException(409, f"You've already claimed your {category} free trial")
    trial = {
        "trial_id": new_id("trial"),
        "user_id": u["user_id"],
        "member_name": u.get("name") or "",
        "member_email": u.get("email"),
        "category": category,
        "child_name": child_name or None,
        "child_age": child_age or None,
        "attendee_name": attendee_name or None,
        "preferred_day": preferred_day or None,
        "status": "claimed",
        "created_at": now_utc(),
    }
    try:
        await db.free_trials.insert_one(trial)
    except Exception:
        raise HTTPException(409, f"You've already claimed your {category} free trial")

    # Create a linked booking on the CHOSEN real session so the trial flows through the
    # SAME QR + check-in + attendance system as every other class booking. Because it's a
    # real dated class booking, check-in is locked to that session's date (single-use).
    trial_display = f"Free Trial – {cls.get('name')} ({category})"
    trial_booking_id = new_id("bk")
    await db.bookings.insert_one({
        "booking_id": trial_booking_id,
        "user_id": u["user_id"],
        "class_id": cls["class_id"],
        "class_name": trial_display,
        "amount": 0,
        "currency": "aud",
        "by_appointment": False,
        "is_trial": True,
        "trial_id": trial["trial_id"],
        "trial_category": category,
        "duration_min": int(cls.get("duration_min") or (45 if category == "Kids" else 60)),
        "class_start": trial_start,
        "scheduled_time": preferred_day,
        "status": "confirmed",
        "created_at": now_utc(),
    })
    await db.free_trials.update_one(
        {"trial_id": trial["trial_id"]}, {"$set": {"booking_id": trial_booking_id, "class_id": cls["class_id"], "class_start": trial_start}}
    )
    trial["booking_id"] = trial_booking_id
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": u["user_id"],
            "title": f"{category} free trial claimed 🎉",
            "body": (
                f"{child_name}'s free Kids Muay Thai trial is booked for {preferred_day}. Show your QR code at the front desk — see you on the mats!"
                if category == "Kids" else
                f"Your free Muay Thai trial is booked for {preferred_day}. Show your QR code at the front desk — we'll see you on the mats!"
            ),
            "type": "trial",
            "read": False,
            "created_at": now_utc(),
        }
    )
    mname = u.get("name") or u.get("email")
    member_lines = [
        f"Hi {attendee_name or mname},",
        f"Welcome to Maxenergy Fitness! Your <b>free {category} trial class</b> is confirmed. Here are the details:",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
    ]
    if category == "Kids":
        member_lines += [
            f"<b>Child's name:</b> {child_name}",
            f"<b>Age:</b> {child_age}",
            f"<b>Class:</b> Kids Muay Thai",
            f"<b>Session:</b> {preferred_day}",
        ]
    else:
        member_lines += [
            f"<b>Name:</b> {attendee_name}",
            f"<b>Class:</b> Muay Thai",
            f"<b>Session:</b> {preferred_day}",
        ]
    member_lines += [
        f"<b>Trial reference:</b> {trial['trial_id']}",
        f"<b>Location:</b> {GYM_INFO['address']}",
        f"<b>Phone:</b> {GYM_INFO['phone']}",
        "<b>What to bring:</b> comfortable workout clothes, a water bottle and a towel. Gloves can be borrowed at the gym.",
        _calendar_buttons_html(
            f"Free Trial – Muay Thai ({category}) — Max Energy",
            _qld_naive_to_utc(trial_start),
            int(cls.get("duration_min") or (45 if category == "Kids" else 60)),
            GYM_INFO["address"],
            f"Free {category} Muay Thai trial at Maxenergy Fitness. Ref: {trial['trial_id']}.",
            trial_booking_id,
            _public_base(request),
        ),
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        "Turn up at your booked session and show your entry QR code at the front desk. See you on the mats! 🥊",
    ]
    await send_email(u["email"], f"Your free {category} trial at Max Energy 🎉", _email_shell(f"Your free {category} trial is confirmed!", member_lines))

    admin_lines = [f"<b>{mname}</b> ({u['email']}) claimed a free <b>{category} Muay Thai</b> trial."]
    if category == "Kids":
        admin_lines += [
            f"<b>Child's name:</b> {child_name}",
            f"<b>Age:</b> {child_age}",
            f"<b>Session:</b> {preferred_day}",
        ]
    else:
        admin_lines += [
            f"<b>Name:</b> {attendee_name}",
            f"<b>Session:</b> {preferred_day}",
        ]
    admin_lines += [
        f"Claimed: {now_utc().strftime('%A %d %B %Y')}",
        "You can view all members and trial claims in the app: Admin → Members.",
    ]
    admin_body = (
        f"{child_name} (age {child_age}) — Kids Muay Thai trial: {preferred_day}. Parent: {mname} ({u['email']})."
        if category == "Kids" else
        f"{attendee_name} — Muay Thai trial: {preferred_day} ({u['email']})."
    )
    await notify_admins(f"New free {category} trial claimed", admin_body, "trial", email_lines=admin_lines)
    trial.pop("_id", None)
    return {"trial": trial}
