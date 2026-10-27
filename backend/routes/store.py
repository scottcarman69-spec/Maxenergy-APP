"""Store (memberships & passes), gift cards, admin gift-card management,
store receipts, wallet credits, and the public announcements list."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import httpx
import uuid

from server import (
    GIFTCARD_MAX_CENTS, GIFTCARD_MIN_CENTS, GYM_INFO, KEYTAG_CENTS, SQUARE_BASE,
    SQUARE_LOCATION_ID, STORE_PRODUCTS, _giftcard_guard, _giftcard_register_fail,
    _giftcard_reset, _reuse_open_square_checkout, _square_headers, booking_ref_no,
    compute_store_price, db, log, new_id, now_utc, require_admin, require_user,
    sync_square_payment,
)

router = APIRouter()


@router.get("/store/products")
async def store_products(u: dict = Depends(require_user)):
    fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0}) or u
    items = []
    for pid, p in STORE_PRODUCTS.items():
        pricing = await compute_store_price(fresh, pid, False)
        items.append({"product_id": pid, **p, **pricing})
    return {
        "products": items,
        "keytag_cents": KEYTAG_CENTS,
        "first_purchase_available": not fresh.get("first_purchase_used"),
        "membership_expires_at": fresh.get("membership_expires_at").isoformat() if isinstance(fresh.get("membership_expires_at"), datetime) else None,
        "class_pass_credits": int(fresh.get("class_pass_credits", 0)),
        "key_tag": bool(fresh.get("key_tag")),
        "membership_form_completed": bool(fresh.get("membership_form_completed_at")),
    }


class StoreCheckoutReq(BaseModel):
    product_id: str
    origin_url: str
    start_date: Optional[str] = None
    meet_time: Optional[str] = None


@router.post("/store/checkout")
async def store_checkout(body: StoreCheckoutReq, u: dict = Depends(require_user)):
    fresh = await db.users.find_one({"user_id": u["user_id"]}) or u
    # All upfront memberships and passes require the member to complete the
    # membership form first (collected once, remembered forever).
    if not fresh.get("membership_form_completed_at"):
        raise HTTPException(status_code=428, detail="Please complete your membership form before purchasing.")
    pricing = await compute_store_price(fresh, body.product_id, False)
    if pricing["type"] == "membership" and not ((body.start_date or "").strip() and (body.meet_time or "").strip()):
        raise HTTPException(status_code=400, detail="Please choose your start date and a time to meet us for your access card.")
    order_ref = new_id("store")
    label = pricing["name"] + (" + Key Tag" if pricing["key_tag"] else "")
    redirect_url = f"{body.origin_url.rstrip('/')}/payment-return?status=success&store=1"
    # Reuse a recent OPEN checkout for the same product+amount so a refresh doesn't double-charge.
    reuse_url, reuse_sid, _paid = await _reuse_open_square_checkout({
        "user_id": u["user_id"], "kind": "store", "product_id": body.product_id,
        "amount": pricing["total"],
        "created_at": {"$gte": now_utc() - timedelta(minutes=30)},
    })
    if reuse_url:
        return {"url": reuse_url, "session_id": reuse_sid, "reused": True}
    payload = {
        "idempotency_key": str(uuid.uuid4()),
        "quick_pay": {"name": label, "price_money": {"amount": pricing["total"], "currency": "AUD"}, "location_id": SQUARE_LOCATION_ID},
        "payment_note": f"{label} — Order No. {booking_ref_no(order_ref)} — {u.get('name') or u.get('email') or 'Member'} (App Purchase)",
        "pre_populated_data": {"buyer_email": u.get("email", "")},
        "checkout_options": {"redirect_url": redirect_url},
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{SQUARE_BASE}/online-checkout/payment-links", headers={**_square_headers(), "Content-Type": "application/json"}, json=payload)
    if resp.status_code >= 400:
        log.error(f"store checkout error {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(502, "Unable to create checkout")
    link = resp.json().get("payment_link", {})
    order_id = link.get("order_id")
    if not order_id or not link.get("url"):
        raise HTTPException(502, "Invalid Square response")
    await db.payment_transactions.insert_one({
        "session_id": order_id, "square_order_id": order_id, "checkout_url": link.get("url"), "provider": "square", "kind": "store",
        "product_id": body.product_id, "user_id": u["user_id"], "amount": pricing["total"], "currency": "aud",
        "key_tag": pricing["key_tag"], "payment_status": "initiated", "status": "open", "created_at": now_utc(),
        "start_date": body.start_date, "meet_time": body.meet_time, "order_ref": order_ref,
    })
    return {"url": link.get("url"), "session_id": order_id}


@router.get("/store/status/{session_id}")
async def store_status(session_id: str, u: dict = Depends(require_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["user_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Session not found")
    payment_status, status = await sync_square_payment(tx)
    return {"payment_status": payment_status, "status": status, "product_id": tx.get("product_id")}


# -------------------- gift cards --------------------
class GiftCardCheckoutReq(BaseModel):
    amount_cents: int
    origin_url: str
    recipient_name: Optional[str] = None
    recipient_email: Optional[str] = None
    message: Optional[str] = None


@router.post("/giftcards/checkout")
async def giftcard_checkout(body: GiftCardCheckoutReq, u: dict = Depends(require_user)):
    amount = int(body.amount_cents or 0)
    if amount < GIFTCARD_MIN_CENTS or amount > GIFTCARD_MAX_CENTS:
        raise HTTPException(400, f"Gift card amount must be between ${GIFTCARD_MIN_CENTS//100} and ${GIFTCARD_MAX_CENTS//100}.")
    rname = (body.recipient_name or "").strip()[:80]
    remail = (body.recipient_email or "").strip()[:120]
    if not remail or "@" not in remail:
        raise HTTPException(400, "Please enter the recipient's email so we can send them the gift card.")
    message = (body.message or "").strip()[:300]
    order_ref = new_id("gift")
    label = f"Gift Card ${amount/100:.0f}"
    redirect_url = f"{body.origin_url.rstrip('/')}/payment-return?status=success&giftcard=1"
    # Reuse a recent OPEN gift-card checkout (same amount + recipient) to avoid a refresh double-charge.
    reuse_url, reuse_sid, _paid = await _reuse_open_square_checkout({
        "user_id": u["user_id"], "kind": "giftcard", "amount": amount, "recipient_email": remail,
        "created_at": {"$gte": now_utc() - timedelta(minutes=30)},
    })
    if reuse_url:
        return {"url": reuse_url, "session_id": reuse_sid, "reused": True}
    payload = {
        "idempotency_key": str(uuid.uuid4()),
        "quick_pay": {"name": label, "price_money": {"amount": amount, "currency": "AUD"}, "location_id": SQUARE_LOCATION_ID},
        "payment_note": f"{label} — Order No. {booking_ref_no(order_ref)} — from {u.get('name') or u.get('email') or 'Member'} (Gift Card)",
        "pre_populated_data": {"buyer_email": u.get("email", "")},
        "checkout_options": {"redirect_url": redirect_url},
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{SQUARE_BASE}/online-checkout/payment-links", headers={**_square_headers(), "Content-Type": "application/json"}, json=payload)
    if resp.status_code >= 400:
        log.error(f"giftcard checkout error {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(502, "Unable to create checkout")
    link = resp.json().get("payment_link", {})
    order_id = link.get("order_id")
    if not order_id or not link.get("url"):
        raise HTTPException(502, "Invalid Square response")
    await db.payment_transactions.insert_one({
        "session_id": order_id, "square_order_id": order_id, "checkout_url": link.get("url"), "provider": "square", "kind": "giftcard",
        "user_id": u["user_id"], "amount": amount, "currency": "aud",
        "recipient_name": rname or None, "recipient_email": remail, "gift_message": message or None,
        "payment_status": "initiated", "status": "open", "created_at": now_utc(), "order_ref": order_ref,
    })
    return {"url": link.get("url"), "session_id": order_id}


@router.get("/giftcards/status/{session_id}")
async def giftcard_status(session_id: str, u: dict = Depends(require_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["user_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Session not found")
    payment_status, status = await sync_square_payment(tx)
    fresh = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0, "gift_card_code": 1})
    return {"payment_status": payment_status, "status": status, "code": (fresh or {}).get("gift_card_code")}


class GiftCardRedeemReq(BaseModel):
    code: str


@router.post("/giftcards/redeem")
async def giftcard_redeem(body: GiftCardRedeemReq, u: dict = Depends(require_user)):
    code = (body.code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Please enter a gift card code.")
    # Brute-force protection: block if locked out from earlier wrong attempts.
    await _giftcard_guard(u["user_id"])
    gc = await db.gift_cards.find_one({"code": code})
    if not gc:
        # Wrong code — count the failure (may raise a lockout) then reject.
        await _giftcard_register_fail(u["user_id"])
        raise HTTPException(404, "That gift card code wasn't found.")
    if int(gc.get("balance_cents", 0)) <= 0 or gc.get("status") != "active":
        raise HTTPException(409, "This gift card has already been used up.")
    # Valid code — clear any accumulated wrong-attempt counter.
    await _giftcard_reset(u["user_id"])
    now = now_utc()
    # Atomically CLAIM the card BEFORE granting any credit. Conditioning the update
    # on it still being active + having a balance means two concurrent redeems can
    # never both succeed — only the request that actually flips the card gets to add
    # credit (mirrors the guarded class-pass / credit / paid-claim patterns).
    claimed = await db.gift_cards.find_one_and_update(
        {"gift_card_id": gc["gift_card_id"], "status": "active", "balance_cents": {"$gt": 0}},
        {"$set": {"balance_cents": 0, "status": "redeemed", "redeemed_by_user_id": u["user_id"], "redeemed_at": now}},
        return_document=False,  # return the pre-update doc so we know the balance to grant
    )
    if not claimed:
        # Lost the race (already redeemed by a concurrent request) — grant nothing.
        raise HTTPException(409, "This gift card has already been used up.")
    amount = int(claimed["balance_cents"])
    # Move the claimed balance into the member's account credit.
    res = await db.users.find_one_and_update(
        {"user_id": u["user_id"]}, {"$inc": {"credit_cents": amount}}, return_document=True
    )
    new_credit = int((res or {}).get("credit_cents", amount))
    await db.credit_ledger.insert_one({
        "ledger_id": new_id("cl"), "user_id": u["user_id"], "delta_cents": amount,
        "reason": f"Gift card redeemed ({code})", "balance_after": new_credit, "created_at": now,
    })
    return {"ok": True, "amount_cents": amount, "credit_cents": new_credit}


@router.get("/giftcards/mine")
async def giftcards_mine(u: dict = Depends(require_user)):
    bought = await db.gift_cards.find(
        {"purchaser_user_id": u["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    redeemed = await db.gift_cards.find(
        {"redeemed_by_user_id": u["user_id"]}, {"_id": 0}
    ).sort("redeemed_at", -1).to_list(100)
    return {"purchased": bought, "redeemed": redeemed,
            "min_cents": GIFTCARD_MIN_CENTS, "max_cents": GIFTCARD_MAX_CENTS}


# ----- admin gift card management -----
@router.get("/admin/giftcards")
async def admin_giftcards(q: Optional[str] = None, u: dict = Depends(require_admin)):
    query: dict = {}
    if q:
        term = q.strip().upper()
        query = {"$or": [
            {"code": {"$regex": term, "$options": "i"}},
            {"recipient_email": {"$regex": q.strip(), "$options": "i"}},
            {"purchaser_email": {"$regex": q.strip(), "$options": "i"}},
        ]}
    cards = await db.gift_cards.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"gift_cards": cards}


class GiftCardAdjustReq(BaseModel):
    code: str
    new_balance_cents: int
    note: Optional[str] = None


@router.post("/admin/giftcards/adjust")
async def admin_giftcard_adjust(body: GiftCardAdjustReq, u: dict = Depends(require_admin)):
    code = (body.code or "").strip().upper()
    gc = await db.gift_cards.find_one({"code": code})
    if not gc:
        raise HTTPException(404, "Gift card not found.")
    new_bal = int(body.new_balance_cents)
    if new_bal < 0 or new_bal > int(gc.get("amount_cents", 0)):
        raise HTTPException(400, f"New balance must be between $0 and the original ${int(gc.get('amount_cents',0))//100}.")
    old_bal = int(gc.get("balance_cents", 0))
    now = now_utc()
    adjustment = {
        "delta_cents": new_bal - old_bal, "balance_after": new_bal,
        "note": (body.note or "In-store adjustment").strip()[:200],
        "admin_id": u["user_id"], "admin_name": u.get("name") or u.get("email"), "at": now,
    }
    status = "redeemed" if new_bal == 0 else "active"
    await db.gift_cards.update_one(
        {"gift_card_id": gc["gift_card_id"]},
        {"$set": {"balance_cents": new_bal, "status": status}, "$push": {"adjustments": adjustment}},
    )
    gc = await db.gift_cards.find_one({"gift_card_id": gc["gift_card_id"]}, {"_id": 0})
    return {"ok": True, "gift_card": gc}



async def store_receipt_latest(u: dict = Depends(require_user)):
    cutoff = now_utc() - timedelta(hours=6)
    tx = await db.payment_transactions.find_one(
        {"user_id": u["user_id"], "kind": "store", "created_at": {"$gte": cutoff}},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if not tx:
        raise HTTPException(404, "No recent purchase")
    return await store_receipt(tx["session_id"], u)


@router.get("/store/receipt/{session_id}")
async def store_receipt(session_id: str, u: dict = Depends(require_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["user_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Purchase not found")
    if tx.get("payment_status") != "paid":
        # Web redirect can arrive before any poll ran — sync with Square now.
        await sync_square_payment(tx)
        tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["user_id"]}, {"_id": 0}) or tx
    if tx.get("payment_status") != "paid":
        raise HTTPException(409, "Purchase not paid")
    p = STORE_PRODUCTS.get(tx.get("product_id"), {})
    fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0}) or u
    exp = fresh.get("membership_expires_at")
    paid_at = tx.get("fulfilled_at") or tx.get("updated_at") or tx.get("created_at")
    return {
        "session_id": session_id,
        "receipt_number": str(session_id).replace("store_", "").upper()[:10],
        "order_no": booking_ref_no(tx.get("order_ref") or session_id),
        "product_name": p.get("name") or "Purchase",
        "product_type": p.get("type"),
        "key_tag": bool(tx.get("key_tag")),
        "start_date": tx.get("start_date"),
        "meet_time": tx.get("meet_time"),
        "amount_cents": tx.get("amount", 0),
        "currency": (tx.get("currency") or "aud").upper(),
        "paid_at": paid_at.isoformat() if isinstance(paid_at, datetime) else paid_at,
        "payment_method": "Square",
        "order_id": tx.get("square_order_id"),
        "membership_expires_at": exp.isoformat() if isinstance(exp, datetime) else None,
        "class_pass_credits": int(fresh.get("class_pass_credits", 0)),
        "member_name": u.get("name") or u.get("email"),
        "member_email": u.get("email"),
        "location": GYM_INFO["address"],
    }



# payment receipt routes moved to routes/payments.py


@router.get("/credits")
async def my_credits(u: dict = Depends(require_user)):
    """Member's current credit balance + history of credits earned and spent."""
    fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "credit_cents": 1, "class_pass_credits": 1})
    rows = await db.credit_ledger.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    entries = [{
        "ledger_id": r.get("ledger_id"),
        "delta_cents": int(r.get("delta_cents", 0)),
        "reason": r.get("reason"),
        "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at"),
    } for r in rows]
    prows = await db.pass_ledger.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    pass_entries = [{
        "pass_ledger_id": r.get("pass_ledger_id"),
        "delta": int(r.get("delta", 0)),
        "reason": r.get("reason"),
        "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at"),
    } for r in prows]
    return {
        "balance_cents": int((fresh or {}).get("credit_cents", 0)),
        "entries": entries,
        "class_pass_credits": int((fresh or {}).get("class_pass_credits", 0)),
        "pass_entries": pass_entries,
    }


@router.get("/announcements")
async def announcements_list():
    rows = await db.announcements.find({}, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(200)
    return {"announcements": rows}
