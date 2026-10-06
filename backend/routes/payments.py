"""Square card payments: checkout (class pass / credit / card), status sync,
and member receipts. All Square + payment helpers (sync_square_payment,
mark_booking_paid, _reuse_open_square_checkout, low_pass_nudge, booking_ref_code,
SQUARE_* config) stay in server.py and are imported here.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone, timedelta
import httpx

from server import (
    db, require_user, now_utc, new_id, mark_booking_paid, sync_square_payment,
    low_pass_nudge, _public_base, _reuse_open_square_checkout, booking_ref_code,
    booking_ref_no, coach_photo, esc, _email_shell, GYM_INFO, log,
    SQUARE_LOCATION_ID, SQUARE_ACCESS_TOKEN, SQUARE_VERSION, SQUARE_BASE,
)
from models import CheckoutCreate

router = APIRouter()


@router.post("/payments/checkout")
async def payments_checkout(body: CheckoutCreate, request: Request, u: dict = Depends(require_user)):
    booking = await db.bookings.find_one({"booking_id": body.booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking["status"] == "paid":
        raise HTTPException(409, "Already paid")

    amount_cents = int(booking["amount"])
    currency = (booking.get("currency") or "AUD").upper()

    # ----- Pay with a class pass (deduct 1 pass, no card) -----
    if body.use_class_pass:
        # Pay with a class pass — works for both fixed classes and appointments.
        if booking.get("status") == "paid" or booking.get("paid_with_pass"):
            return {"paid_with_pass": True, "booking_id": booking["booking_id"]}
        now = now_utc()
        # Claim this booking atomically so a double-tap can't deduct two passes.
        claim = await db.bookings.update_one(
            {"booking_id": booking["booking_id"], "paid_with_pass": {"$ne": True}, "status": {"$ne": "paid"}},
            {"$set": {"paid_with_pass": True}},
        )
        if claim.modified_count != 1:
            return {"paid_with_pass": True, "booking_id": booking["booking_id"]}
        # Atomic guarded decrement prevents concurrent double-spend across bookings.
        res = await db.users.update_one(
            {"user_id": u["user_id"], "class_pass_credits": {"$gte": 1}},
            {"$inc": {"class_pass_credits": -1}},
        )
        if res.modified_count != 1:
            # No pass available — roll back the claim and report.
            await db.bookings.update_one({"booking_id": booking["booking_id"]}, {"$unset": {"paid_with_pass": ""}})
            raise HTTPException(400, "You have no class passes left.")
        fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "class_pass_credits": 1})
        left = int((fresh or {}).get("class_pass_credits", 0))
        await db.pass_ledger.insert_one({
            "pass_ledger_id": new_id("pl"), "user_id": u["user_id"], "delta": -1,
            "reason": f"Booked {booking['class_name']} with a class pass", "balance_after": left,
            "created_at": now,
        })
        await db.payment_transactions.insert_one({
            "session_id": f"pass_{booking['booking_id']}",
            "provider": "class_pass",
            "booking_id": booking["booking_id"],
            "user_id": u["user_id"],
            "amount": booking["amount"],
            "currency": currency.lower(),
            "payment_status": "paid",
            "status": "paid",
            "created_at": now,
        })
        await mark_booking_paid(booking["booking_id"])
        await low_pass_nudge(u["user_id"], u.get("email"), left, base_url=_public_base(request))
        return {"paid_with_pass": True, "passes_left": left, "booking_id": booking["booking_id"]}

    # ----- Apply in-app credit if requested -----
    credit_applied = 0
    if body.use_credit:
        fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "credit_cents": 1})
        avail = int((fresh or {}).get("credit_cents", 0))
        credit_applied = min(avail, amount_cents)
        remainder = amount_cents - credit_applied
        if remainder <= 0:
            # Fully covered by credit — deduct atomically up-front (guarded) so two
            # concurrent bookings can't spend the same credit twice.
            res = await db.users.update_one(
                {"user_id": u["user_id"], "credit_cents": {"$gte": credit_applied}},
                {"$inc": {"credit_cents": -credit_applied}},
            )
            if res.modified_count != 1:
                raise HTTPException(400, "Your credit balance changed. Please refresh and try again.")
            # Mark as applied AND already-deducted so mark_booking_paid won't deduct again.
            await db.bookings.update_one(
                {"booking_id": booking["booking_id"]},
                {"$set": {"credit_applied_cents": credit_applied, "credit_deducted": True}},
            )
            left = int((fresh or {}).get("credit_cents", 0)) - credit_applied
            await db.credit_ledger.insert_one({
                "ledger_id": new_id("cl"), "user_id": u["user_id"], "delta_cents": -credit_applied,
                "reason": f"Used toward {booking.get('class_name')}", "booking_id": booking["booking_id"],
                "balance_after": max(0, left), "created_at": now_utc(),
            })
            await db.payment_transactions.insert_one({
                "session_id": f"credit_{booking['booking_id']}",
                "provider": "credit",
                "booking_id": booking["booking_id"],
                "user_id": u["user_id"],
                "amount": booking["amount"],
                "currency": currency.lower(),
                "credit_applied_cents": credit_applied,
                "payment_status": "paid",
                "status": "paid",
                "created_at": now_utc(),
            })
            await mark_booking_paid(booking["booking_id"])
            return {"paid_with_credit": True, "booking_id": booking["booking_id"]}
        # Partial credit — reserve the applied amount on the booking; the actual
        # deduction happens once (atomically) in mark_booking_paid when the card clears.
        if credit_applied > 0:
            await db.bookings.update_one(
                {"booking_id": booking["booking_id"]},
                {"$set": {"credit_applied_cents": credit_applied}},
            )
        amount_cents = remainder  # charge only the remainder on the card

    redirect_url = f"{body.origin_url.rstrip('/')}/payment-return?status=success&booking_id={booking['booking_id']}"
    # Guard against double charges: if there's already an OPEN Square checkout for this
    # booking (same credit applied), reuse it instead of creating a second order. If that
    # pending order turns out to be already paid, settle the booking — don't recharge.
    reuse_url, reuse_sid, paid_tx = await _reuse_open_square_checkout({
        "booking_id": booking["booking_id"],
        "user_id": u["user_id"],
        "credit_applied_cents": credit_applied,
    })
    if paid_tx is not None:
        return {"already_paid": True, "booking_id": booking["booking_id"], "session_id": reuse_sid}
    if reuse_url:
        return {"url": reuse_url, "session_id": reuse_sid, "reused": True}

    payload = {
        "idempotency_key": f"co_{booking['booking_id']}_{amount_cents}",
        "quick_pay": {
            "name": booking["class_name"],
            "price_money": {"amount": amount_cents, "currency": currency},
            "location_id": SQUARE_LOCATION_ID,
        },
        "payment_note": f"{booking['class_name']} — {booking_ref_code(booking['booking_id'])} — {u.get('name') or u.get('email') or 'Member'} (App Booking)",
        "pre_populated_data": {"buyer_email": u.get("email", "")},
        "checkout_options": {"redirect_url": redirect_url},
    }
    headers = {
        "Authorization": f"Bearer {SQUARE_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{SQUARE_BASE}/online-checkout/payment-links", headers=headers, json=payload)
    if resp.status_code >= 400:
        log.error(f"square checkout error {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(502, "Unable to create Square checkout")
    link = resp.json().get("payment_link", {})
    order_id = link.get("order_id")
    checkout_url = link.get("url")
    if not order_id or not checkout_url:
        raise HTTPException(502, "Invalid Square response")

    await db.payment_transactions.insert_one(
        {
            "session_id": order_id,  # Square order id used as our session identifier
            "square_order_id": order_id,
            "square_payment_link_id": link.get("id"),
            "checkout_url": checkout_url,
            "provider": "square",
            "booking_id": booking["booking_id"],
            "user_id": u["user_id"],
            "amount": booking["amount"],
            "currency": currency.lower(),
            "credit_applied_cents": credit_applied,
            "payment_status": "initiated",
            "status": "open",
            "created_at": now_utc(),
        }
    )
    await db.bookings.update_one({"booking_id": booking["booking_id"]}, {"$set": {"square_order_id": order_id}})
    return {"url": checkout_url, "session_id": order_id}


@router.get("/payments/status/{session_id}")
async def payments_status(session_id: str, request: Request, u: dict = Depends(require_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["user_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Session not found")
    payment_status, status = await sync_square_payment(tx)
    return {
        "payment_status": payment_status,
        "status": status,
        "amount_total": tx.get("amount"),
        "currency": (tx.get("currency", "aud")).lower(),
    }


@router.get("/payments/receipt/{booking_id}")
async def payment_receipt(booking_id: str, u: dict = Depends(require_user)):
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") not in ("paid", "confirmed"):
        # The web redirect can arrive before any status poll ran — sync with Square now.
        # A booking can have MORE THAN ONE Square order (e.g. checkout tapped twice); sync
        # every open transaction and stop as soon as one is detected paid.
        txs = await db.payment_transactions.find({"booking_id": booking_id}, {"_id": 0}).to_list(20)
        for t in txs:
            if t.get("payment_status") == "paid":
                continue
            try:
                ps, _ = await sync_square_payment(t)
                if ps == "paid":
                    break
            except Exception as e:
                log.error(f"receipt sync error for {booking_id}: {e}")
        b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if b.get("status") not in ("paid", "confirmed"):
        raise HTTPException(409, "Booking not paid")
    cls = await db.classes.find_one({"class_id": b["class_id"]}, {"_id": 0}) or {}
    tx = await db.payment_transactions.find_one({"booking_id": booking_id, "payment_status": "paid"}, {"_id": 0}) \
        or await db.payment_transactions.find_one({"booking_id": booking_id}, {"_id": 0}) or {}
    start = cls.get("start_at") or b.get("class_start")
    paid_at = b.get("paid_at")
    # Reflect how it was actually paid.
    gross = int(b.get("amount", 0))
    credit_used = int(b.get("credit_applied_cents", 0))
    if b.get("paid_with_pass"):
        method, amount_cents = "Class Pass (1 used)", 0
    elif credit_used >= gross and gross > 0:
        # Fully covered by account credit — show the class value (not $0) so the member
        # can see what the credit was worth.
        method, amount_cents = "Account credit", gross
    else:
        method, amount_cents = "Square", gross
    return {
        "booking_id": booking_id,
        "receipt_number": booking_id.replace("bk_", "").upper()[:10],
        "booking_no": booking_ref_no(booking_id),
        "class_name": b.get("class_name"),
        "trainer": cls.get("trainer"),
        "class_start": start.isoformat() if isinstance(start, datetime) else start,
        "by_appointment": bool(b.get("by_appointment")),
        "requested_time": b.get("requested_time"),
        "amount_cents": amount_cents,
        "gross_cents": gross,
        "credit_applied_cents": credit_used,
        "currency": (b.get("currency") or "aud").upper(),
        "paid_at": paid_at.isoformat() if isinstance(paid_at, datetime) else paid_at,
        "payment_method": method,
        "order_id": tx.get("square_order_id"),
        "member_name": u.get("name") or u.get("email"),
        "member_email": u.get("email"),
        "location": GYM_INFO["address"],
        "child_age": b.get("child_age"),
        "child_name": b.get("child_name"),
    }


@router.get("/payments/receipts")
async def my_receipts(u: dict = Depends(require_user)):
    """List all of the member's paid receipts (most recent first)."""
    rows = await db.bookings.find(
        {"user_id": u["user_id"], "status": "paid"}, {"_id": 0}
    ).to_list(1000)
    class_ids = list({r.get("class_id") for r in rows if r.get("class_id")})
    classes = {}
    if class_ids:
        async for c in db.classes.find({"class_id": {"$in": class_ids}}, {"_id": 0}):
            classes[c["class_id"]] = c
    out = []
    for b in rows:
        cls = classes.get(b.get("class_id"), {})
        start = cls.get("start_at") or b.get("class_start")
        paid_at = b.get("paid_at")
        out.append({
            "booking_id": b["booking_id"],
            "receipt_number": b["booking_id"].replace("bk_", "").upper()[:10],
            "booking_no": booking_ref_no(b["booking_id"]),
            "class_name": b.get("class_name"),
            "trainer": cls.get("trainer"),
            "class_start": start.isoformat() if isinstance(start, datetime) else start,
            "by_appointment": bool(b.get("by_appointment")),
            "amount_cents": b.get("amount", 0),
            "currency": (b.get("currency") or "aud").upper(),
            "paid_at": paid_at.isoformat() if isinstance(paid_at, datetime) else paid_at,
        })
    out.sort(key=lambda x: x.get("paid_at") or "", reverse=True)
    return {"receipts": out}
