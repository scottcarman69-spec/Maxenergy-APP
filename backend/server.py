from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, Depends
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import logging
import uuid
import re
import secrets
import asyncio
import time
import io
import base64
import bcrypt
import jwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.environ["JWT_ALGO"]
EMERGENT_EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
SQUARE_ENV = os.environ.get("SQUARE_ENV", "sandbox")
SQUARE_ACCESS_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN", "")
SQUARE_LOCATION_ID = os.environ.get("SQUARE_LOCATION_ID", "")
SQUARE_BASE = "https://connect.squareupsandbox.com/v2" if SQUARE_ENV == "sandbox" else "https://connect.squareup.com/v2"
SQUARE_VERSION = "2026-01-22"
GYM_ADMIN_EMAIL = os.environ["GYM_ADMIN_EMAIL"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ADMIN2_EMAIL = os.environ["ADMIN2_EMAIL"]
ADMIN2_PASSWORD = os.environ["ADMIN2_PASSWORD"]

EMAIL_BASE_URL = os.environ["EMAIL_BASE_URL"]
EMERGENT_AUTH_SESSION_URL = os.environ["EMERGENT_AUTH_SESSION_URL"]
SEED_VERSION = "v14"

GYM_INFO = {
    "name": "Maxenergy Fitness",
    "phone": "07 4057 9005",
    "email": "info@maxenergy.com.au",
    "address": "Shop 38 Campus Village Shopping Centre, 38 Faculty Cl, Smithfield QLD 4878",
    "hours": "Open 24/7",
    "map_url": "https://maps.app.goo.gl/hWLvuqRqy5V6txsh8",
    "instagram": "https://www.instagram.com/explore/locations/1018664108/maxenergy-fitness/",
    "facebook": "https://www.facebook.com/MaxEnergyFitness/",
}

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Maxenergy Fitness API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("maxenergy")


# -------------------- helpers --------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def booking_ref_no(booking_id: str) -> int:
    """Stable, tidy 5-digit booking number derived from the internal booking id."""
    h = (booking_id or "").split("_", 1)[-1]
    try:
        n = int(h, 16)
    except ValueError:
        n = sum(ord(c) for c in h)
    return 10000 + (n % 90000)


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_pw(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=30)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def sign_dl_token(kind: str, rid: str, days: int = 30) -> str:
    """Signed capability token embedded in emailed/opened download links so the
    file is only reachable by someone holding the link's token (not by id guessing)."""
    payload = {"typ": "dl", "k": kind, "id": rid, "exp": datetime.now(timezone.utc) + timedelta(days=days)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def verify_dl_token(token: Optional[str], kind: str, rid: str) -> bool:
    if not token:
        return False
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return False
    return data.get("typ") == "dl" and data.get("k") == kind and data.get("id") == rid


# ---- Auth rate limiting (Mongo-backed atomic fixed-window) ----
import hashlib as _hashlib
import hmac as _hmac
import math as _math

# (limit, window_seconds) per auth action — counts every attempt (not just failures).
RATE_LIMITS = {
    "login": (10, 60),
    "register": (6, 600),
    "forgot": (4, 300),
    "reset": (10, 600),
    "otp": (6, 300),
}


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rl_hash(val: str) -> str:
    return _hmac.new(JWT_SECRET.encode(), val.strip().casefold().encode(), _hashlib.sha256).hexdigest()[:32]


async def _rl_consume(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    now = now_utc()
    bucket = _math.floor(now.timestamp() / window_seconds) * window_seconds
    reset = datetime.fromtimestamp(bucket + window_seconds, tz=timezone.utc)
    doc = await db.rate_limits.find_one_and_update(
        {"_id": f"{key}:{bucket}"},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": reset + timedelta(minutes=2)}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    retry_after = max(1, int((reset - now).total_seconds()))
    return int(doc.get("count", 1)) <= limit, retry_after


async def enforce_rate_limit(request: Request, action: str, email: Optional[str] = None) -> None:
    """Throttle repeated auth attempts per IP and per account. Raises 429 when exceeded."""
    limit, window = RATE_LIMITS[action]
    ip = _client_ip(request)
    checks = [await _rl_consume(f"ip:{action}:{_rl_hash(ip)}", limit, window)]
    if email:
        checks.append(await _rl_consume(f"acct:{action}:{_rl_hash(email)}", limit, window))
    if not all(ok for ok, _ in checks):
        retry = max(r for ok, r in checks if not ok)
        raise HTTPException(status_code=429, detail=f"Too many attempts. Please try again in {retry} seconds.", headers={"Retry-After": str(retry)})


def user_public(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name"),
        "picture": u.get("picture"),
        "is_admin": bool(u.get("is_admin", False)),
        "verified": bool(u.get("verified", False)),
        "reminder_hours": int(u.get("reminder_hours", 3)),
        "credit_cents": int(u.get("credit_cents", 0)),
        "class_pass_credits": int(u.get("class_pass_credits", 0)),
        "key_tag": bool(u.get("key_tag", False)),
        "membership_plan": u.get("membership_plan"),
        "membership_expires_at": u.get("membership_expires_at").isoformat() if isinstance(u.get("membership_expires_at"), datetime) else None,
        "membership_form_completed": bool(u.get("membership_form_completed_at")),
    }


# Global throttle so we never exceed Resend's per-second rate limit (which was
# silently dropping application/confirmation copies during email bursts).
_email_lock = asyncio.Lock()
_last_email_ts = 0.0
EMAIL_MIN_INTERVAL = 0.7  # seconds enforced between any two outgoing emails


async def _post_email_throttled(payload: dict) -> httpx.Response:
    """Serialize + space out sends so bursts stay under the provider rate limit."""
    global _last_email_ts
    async with _email_lock:
        gap = time.monotonic() - _last_email_ts
        if gap < EMAIL_MIN_INTERVAL:
            await asyncio.sleep(EMAIL_MIN_INTERVAL - gap)
        async with httpx.AsyncClient(timeout=30) as hc:
            r = await hc.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMERGENT_EMAIL_KEY},
                json=payload,
            )
        _last_email_ts = time.monotonic()
        return r


async def send_email(recipient: str, subject: str, html: str, attachments: Optional[list] = None) -> bool:
    payload = {"to": [recipient], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if attachments:
        payload["attachments"] = attachments
    delays = [0, 2, 5, 12, 25]  # retry with backoff when rate-limited (429)
    for attempt, wait in enumerate(delays):
        if wait:
            await asyncio.sleep(wait)
        try:
            r = await _post_email_throttled(payload)
            if r.status_code == 429 and attempt < len(delays) - 1:
                log.warning(f"email rate-limited to {recipient}, retrying (attempt {attempt + 1})")
                continue
            r.raise_for_status()
            return True
        except httpx.HTTPStatusError as e:
            log.error(f"email failed to {recipient}: {e.response.status_code} body={e.response.text[:300]}")
            return False
        except Exception as e:
            log.error(f"email failed to {recipient}: {e}")
            return False
    return False


import html as _html


def esc(s) -> str:
    """HTML-escape user-supplied text before placing it into email HTML."""
    return _html.escape(str(s or ""))


def _email_shell(heading: str, lines: list) -> str:
    body = "".join(f"<p style='margin:0 0 10px;color:#333;font-size:15px;line-height:1.5'>{ln}</p>" for ln in lines if ln)
    return (
        "<div style='font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;'>"
        "<div style='background:#FF7A00;padding:20px 24px;border-radius:10px 10px 0 0;'>"
        f"<h1 style='color:#fff;margin:0;font-size:20px;'>{heading}</h1></div>"
        f"<div style='padding:24px;background:#fafafa;border-radius:0 0 10px 10px;border:1px solid #eee;'>{body}"
        "<p style='margin:18px 0 0;color:#999;font-size:12px;'>Maxenergy Fitness · Smithfield QLD</p></div></div>"
    )


def _public_base(request: Optional[Request]) -> str:
    """Build the externally reachable base URL from the incoming request so
    email links work in both preview and deployed environments (the app's own
    public domain is not stored in the environment)."""
    if request is not None:
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        if host:
            return f"{proto}://{host}"
    return os.environ.get("PUBLIC_BASE_URL", "")


def _download_button(url: str, label: str) -> str:
    return (
        f"<p style='margin:18px 0'><a href='{url}' "
        "style='display:inline-block;background:#FF7A00;color:#fff;text-decoration:none;"
        "padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px'>"
        f"{label}</a></p>"
    )


# -------------------- Membership Terms & Conditions (emailed with the form) --------------------
MEMBERSHIP_TERMS_TC = [
    ("Acknowledgment of Risks, Injury & Obligations",
     "I acknowledge that the activity I am to undertake is a dangerous activity and that by participating in it I am exposed to certain risks, including that I may be injured, physically or mentally, or may die; my personal property may be lost or damaged; other participants may cause me injury or damage; I may cause injury to others or their property; conditions may vary without warning; I may be injured, die or suffer property loss as a result of negligence or breach of contract of Maxenergy Fitness; and there may be no or inadequate facilities for treatment or transport if I am injured. I assume the risk of and responsibility for any injury, death or property damage resulting from my participation."),
    ("Release and Indemnity",
     "I participate in the activity at my sole risk and responsibility. I release, indemnify, and hold harmless Maxenergy Fitness, its servants and agents, from and against all and any actions or claims which may be made by me or on my behalf or by other parties in respect of or arising out of injury, loss, damage or death caused to me or my property whether by negligence, breach of contract or in any way."),
    ("Administration",
     "Appropriate covered footwear & shirt must be worn, and towels must always be used whilst in the gymnasium. Memberships / 10 visit passes are not refundable or transferable after the 48-hour cooling off period. All weights and equipment must be put back after use. Members are responsible for their membership card. Shared gym access with a non-member will result in forfeiture of membership effective immediately. Members must respect other users and behave appropriately at all times. Staff reserve the right to rescind the rights of members not complying with the terms and conditions. No one under the age of sixteen (16) will be permitted to enter the gymnasium under any circumstances."),
    ("Personal Training / Massage",
     "24 hours is required to cancel or change appointments otherwise charges will apply."),
    ("Term Memberships",
     "Term memberships are available for 1, 3, 6, or 12 months and have specified start and end dates."),
    ("Direct Debit Memberships",
     "Direct debit is an automatic weekly, fortnightly or monthly deduction from a debit or credit card through Debit First Australia Pty Ltd. This is an ongoing membership and deductions continue unless the member authorises cancellation. To cancel/amend, the member must complete an amendment request form and lodge it within 48 hours of the debit date; later requests are processed the following period. Cancellation fees equal to the remaining value of the membership apply, unless due to permanent sickness or physical incapacity, or if within the 48-hour cooling off period. An administration fee applies to any cancellation — the lesser of $75.00 or 10% of the total membership fee. A late fee of $33 applies to accounts not paid on time. Continual non-payment of contracted term accounts may result in legal action to recover the balance plus legal costs, duties and collection/dishonour fees."),
    ("Cooling-Off Period",
     "You can cancel the agreement within 48 hours of entering it. Cancellation must be in writing prior to the end of the cooling off period. Maxenergy Fitness will refund any fees paid within 21 days of receiving the notice, less payment for any fitness service already provided and an administration fee (the lesser of $75.00 or 10% of the total membership fee)."),
    ("Suspension or Cancellation",
     "A member may suspend or cancel subject to approval by authorised staff. Suspension is for a minimum of one week and a maximum of 2 months, with specified start and finish dates; early reactivation is permissible and a weekly suspension fee applies. A suspension form must be lodged prior to the commencement of the suspension. Cancellation fees equal to the value of the remaining membership fee apply and are non-refundable except for permanent sickness or physical incapacity (a medical certificate is required). Refunds, where applicable, are provided within 21 days, less any service used and an administration fee (the lesser of $75.00 or 10% of the total membership fee)."),
    ("Membership Cards",
     "Members must bring their membership card on each visit and register attendance by scanning prior to the session. Replacement cards for lost/stolen cards are available at a cost determined by Maxenergy Fitness. On cancellation, the membership card must be returned."),
    ("Privacy Act",
     "Maxenergy members are protected under the Privacy Act. Maxenergy cannot release any information unless prior written consent is given by the person(s) involved."),
    ("Media Consent",
     "Photographs, videos and other media may be captured during classes or events. By agreeing, the member consents to themselves, or their child (if under 18), being included in these recordings and authorises their use for promotional, educational or marketing purposes related to Maxenergy Fitness. For a child under 18, the parent/guardian provides this consent on their behalf as part of the membership agreement."),
    ("Activity Waiver Form",
     "In consideration of being allowed to participate in Boxing, Muay Thai, Kickboxing and Brazilian Jiu Jitsu provided by Maxenergy Fitness (Shop 38 Campus Village Shopping Centre, Smithfield QLD 4878), the Participant releases and forever discharges the Activity Provider, its owners, directors, officers, employees, agents, assigns, legal representatives and successors from all actions, claims and demands for any injury to person or property, including death, sustained as a consequence of participation, notwithstanding that such loss or injury may have been caused solely or partly by the negligence of the Activity Provider. The Participant understands they would not be permitted to participate unless this Waiver is signed; confirms they have no physical limitations, medical ailments or disabilities that would prevent participation (and will obtain medical clearance if required); acknowledges sufficient time to read and the opportunity to seek independent legal advice; freely executes this Waiver; and is forever prevented from suing or claiming against Maxenergy Fitness for any property loss or personal injury sustained while participating in or preparing for the activity. This Waiver is governed by the laws of the State of Queensland and binds the Participant's spouse, heirs, executors, administrators, legal representatives and assigns."),
]

TERMS_DECLARATION_TC = (
    "By agreeing to the online membership form, I declare that I have read, understood, and agree "
    "to the terms and conditions of this membership, knowing that it affects my legal rights."
)


def _membership_terms_html() -> str:
    parts = [
        "<hr style='border:none;border-top:1px solid #e5e5e5;margin:24px 0'/>",
        "<h2 style='color:#FF7A00;margin:0 0 4px;font-size:18px'>Membership Terms &amp; Conditions</h2>",
        "<p style='color:#777;margin:0 0 12px;font-size:13px'>Your copy of the Maxenergy Fitness Policies &amp; Terms Agreement you accepted.</p>",
    ]
    for title, body in MEMBERSHIP_TERMS_TC:
        safe = body.replace("\n", "<br/>")
        parts.append(
            f"<h3 style='color:#111;margin:16px 0 4px;font-size:15px'>{title}</h3>"
            f"<p style='color:#444;margin:0;font-size:13px;line-height:1.5'>{safe}</p>"
        )
    parts.append(
        f"<p style='color:#111;margin:20px 0 0;font-size:13px;font-style:italic'>{TERMS_DECLARATION_TC}</p>"
    )
    return "".join(parts)




# -------------------- OTP (email verification + password reset) --------------------
OTP_TTL_MIN = 10          # code valid for 10 minutes
OTP_MAX_ATTEMPTS = 5      # wrong tries before the code is locked
OTP_RESEND_COOLDOWN = 30  # seconds between resend requests


def _gen_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def issue_otp(email: str, purpose: str) -> str:
    """Create (or replace) a hashed 6-digit code for the given email + purpose."""
    code = _gen_otp()
    await db.otp_codes.update_one(
        {"email": email, "purpose": purpose},
        {"$set": {
            "email": email,
            "purpose": purpose,
            "code_hash": hash_pw(code),
            "expires_at": now_utc() + timedelta(minutes=OTP_TTL_MIN),
            "attempts": 0,
            "created_at": now_utc(),
        }},
        upsert=True,
    )
    return code


async def can_resend_otp(email: str, purpose: str) -> bool:
    rec = await db.otp_codes.find_one({"email": email, "purpose": purpose})
    if not rec:
        return True
    created = rec.get("created_at")
    if isinstance(created, datetime):
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return (now_utc() - created).total_seconds() >= OTP_RESEND_COOLDOWN
    return True


async def verify_otp(email: str, purpose: str, code: str) -> bool:
    rec = await db.otp_codes.find_one({"email": email, "purpose": purpose})
    if not rec:
        return False
    exp = rec.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            await db.otp_codes.delete_one({"email": email, "purpose": purpose})
            return False
    if rec.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        return False
    if not check_pw(code, rec["code_hash"]):
        await db.otp_codes.update_one({"email": email, "purpose": purpose}, {"$inc": {"attempts": 1}})
        return False
    await db.otp_codes.delete_one({"email": email, "purpose": purpose})
    return True


def _otp_email_html(code: str, purpose: str) -> str:
    if purpose == "verify":
        heading = "Verify your email"
        intro = "Welcome to Maxenergy Fitness! Enter the code below in the app to confirm your email address:"
    else:
        heading = "Reset your password"
        intro = "We received a request to reset your Maxenergy Fitness password. Enter the code below in the app to continue:"
    lines = [
        intro,
        (
            "<div style='font-size:34px;letter-spacing:10px;font-weight:bold;color:#FF7A00;"
            f"text-align:center;margin:22px 0;padding:14px;background:#fff;border:1px dashed #FF7A00;border-radius:10px'>{code}</div>"
        ),
        f"This code expires in {OTP_TTL_MIN} minutes.",
        "If you didn't request this, you can safely ignore this email.",
    ]
    return _email_shell(heading, lines)


async def send_otp_email(email: str, purpose: str) -> str:
    code = await issue_otp(email, purpose)
    log.info(f"OTP issued for {email} ({purpose})")
    subject = "Your Maxenergy Fitness verification code" if purpose == "verify" else "Your Maxenergy Fitness password reset code"
    await send_email(email, subject, _otp_email_html(code, purpose))
    return code


ADMIN_NAV = {"booking": "admin_bookings", "application": "admin_applications", "trial": "admin_members"}
MEMBER_NAV = {"booking": "member_bookings", "application": "member_membership", "membership": "member_membership"}


async def create_notification(user_id: str, title: str, body: str, ntype: str = "booking", data: Optional[dict] = None) -> None:
    if data is None:
        nav = MEMBER_NAV.get(ntype)
        data = {"nav": nav} if nav else {}
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": user_id,
            "title": title,
            "body": body,
            "type": ntype,
            "data": data,
            "read": False,
            "created_at": now_utc(),
        }
    )


async def notify_user(user_id: str, email: Optional[str], title: str, body: str, ntype: str = "booking", email_lines: Optional[list] = None, data: Optional[dict] = None) -> None:
    """In-app notification + email to a specific member."""
    await create_notification(user_id, title, body, ntype, data)
    if email:
        await send_email(email, title, _email_shell(title, email_lines or [body]))


async def low_pass_nudge(user_id: str, email: Optional[str], left: int) -> None:
    """Nudge the member to top up when they're down to their last class pass (or out)."""
    if left == 1:
        title = "You're on your last class pass ⏳"
        body = "Only 1 class pass left. Top up so you never miss a session."
    elif left == 0:
        title = "You're out of class passes"
        body = "Buy a Single or 10 Class Pass to keep booking classes at the gym."
    else:
        return
    await notify_user(user_id, email, title, body, "booking",
                      email_lines=[body, "Tap below to buy more passes."],
                      data={"nav": "member_store"})


async def notify_admins(title: str, body: str, ntype: str = "booking", email_lines: Optional[list] = None, data: Optional[dict] = None) -> None:
    """In-app notification to every admin user + email to the gym inbox."""
    if data is None:
        nav = ADMIN_NAV.get(ntype)
        data = {"nav": nav} if nav else {}
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1}).to_list(100)
    for a in admins:
        await create_notification(a["user_id"], title, body, ntype, data)
    await send_email(GYM_ADMIN_EMAIL, title, _email_shell(title, email_lines or [body]))


def _gcal_link(title: str, start: datetime, minutes: int, location: str, details: str) -> str:
    from urllib.parse import quote_plus
    end = start + timedelta(minutes=minutes or 60)
    fmt = "%Y%m%dT%H%M%SZ"
    dates = f"{start.astimezone(timezone.utc).strftime(fmt)}/{end.astimezone(timezone.utc).strftime(fmt)}"
    return (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote_plus(title)}&dates={dates}"
        f"&details={quote_plus(details)}&location={quote_plus(location)}"
    )


async def mark_booking_paid(booking_id: str) -> None:
    """Mark a booking paid and send member + admin confirmations exactly once."""
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b or b.get("paid_notified"):
        # Still ensure status is paid even if already notified
        if b and b.get("status") != "paid":
            await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "paid", "paid_at": now_utc()}})
        return
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"status": "paid", "paid_at": now_utc(), "paid_notified": True}},
    )
    # Deduct any in-app credit that was applied to this booking (once).
    applied = int(b.get("credit_applied_cents", 0))
    if applied > 0 and not b.get("credit_deducted"):
        user_doc = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0, "credit_cents": 1})
        avail = int((user_doc or {}).get("credit_cents", 0))
        ded = min(applied, avail)
        if ded > 0:
            await db.users.update_one({"user_id": b["user_id"]}, {"$inc": {"credit_cents": -ded}})
            await db.credit_ledger.insert_one({
                "ledger_id": new_id("cl"), "user_id": b["user_id"], "delta_cents": -ded,
                "reason": f"Used toward {b.get('class_name')}", "booking_id": booking_id, "created_at": now_utc(),
            })
        await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"credit_deducted": True}})
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    mname = (member or {}).get("name") or (member or {}).get("email") or "A member"
    cls = await db.classes.find_one({"class_id": b["class_id"]}, {"_id": 0})
    when = "By appointment"
    start = (cls or {}).get("start_at") or b.get("class_start")
    if isinstance(start, datetime):
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        when = start.strftime("%A %d %B %Y at %-I:%M %p")
    trainer = (cls or {}).get("trainer", "")
    duration = (cls or {}).get("duration_min")
    amount = float(b.get("amount", 0)) / 100.0
    currency = b.get("currency", "aud").upper()
    # In-app confirmation for the member
    await create_notification(
        b["user_id"],
        "Payment verified — booking confirmed",
        f"Your payment for {b['class_name']} is verified. See you {when}.",
        "booking",
    )
    cal_line = ""
    if isinstance(start, datetime):
        cal_url = _gcal_link(
            f"{b['class_name']} — Max Energy",
            start,
            duration or 60,
            GYM_INFO["address"],
            f"{b['class_name']} at Maxenergy Fitness. Booking ref: {b['booking_id']}.",
        )
        cal_line = f"<a href='{cal_url}' style='color:#FF7A00;font-weight:bold'>➕ Add this class to your calendar</a>"
    # Full-detail confirmation email to the member
    if (member or {}).get("email"):
        await send_email(
            member["email"],
            f"Payment confirmed — {b['class_name']} at Max Energy",
            _email_shell(
                "Payment Confirmed ✅",
                [
                    f"Hi {esc(mname)},",
                    "Great news — your payment has been <b>verified</b> and your class is booked! Here are your booking details:",
                    "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                    f"<b>Class:</b> {esc(b['class_name'])}",
                    (f"<b>Coach:</b> {esc(trainer)}" if trainer else ""),
                    f"<b>When:</b> {when}",
                    (f"<b>Duration:</b> {duration} minutes" if duration else ""),
                    f"<b>Amount paid:</b> ${amount:.2f} {currency}",
                    f"<b>Booking reference:</b> {b['booking_id']}",
                    f"<b>Location:</b> {GYM_INFO['address']}",
                    cal_line,
                    "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                    "Need to cancel or reschedule? Open the Max Energy app → Profile → My Bookings.",
                    "See you on the mats! 🥊",
                ],
            ),
        )
    # Notify gym admins
    await notify_admins(
        "New paid booking",
        f"{mname} booked and paid for {b['class_name']} ({when}).",
        "booking",
        email_lines=[f"<b>{esc(mname)}</b> booked and paid for <b>{esc(b['class_name'])}</b>.", f"When: {when}", f"Amount: ${amount:.2f} {currency}"],
    )


async def get_user_by_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload.get("sub")
        if uid:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
            if u:
                return u
    except Exception:
        pass
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if sess:
        exp = sess.get("expires_at")
        if isinstance(exp, datetime):
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < now_utc():
                return None
        return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    return None


async def require_user(authorization: Optional[str] = Header(None)) -> dict:
    u = await get_user_by_token(authorization)
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return u


async def require_admin(authorization: Optional[str] = Header(None)) -> dict:
    u = await get_user_by_token(authorization)
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not u.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return u


# -------------------- models --------------------
def validate_password_strength(pw: str) -> None:
    """Require min 6 chars, at least one number and one symbol."""
    if len(pw or "") < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not re.search(r"\d", pw):
        raise HTTPException(status_code=400, detail="Password must include at least one number")
    if not re.search(r"[^A-Za-z0-9]", pw):
        raise HTTPException(status_code=400, detail="Password must include at least one symbol (e.g. !@#)")


class RegisterReq(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    date_of_birth: str  # ISO date YYYY-MM-DD
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionReq(BaseModel):
    session_id: str


class VerifyOtpReq(BaseModel):
    email: EmailStr
    code: str


class ResendOtpReq(BaseModel):
    email: EmailStr


class ForgotPasswordReq(BaseModel):
    email: EmailStr


class ResetPasswordReq(BaseModel):
    email: EmailStr
    code: str
    new_password: str = Field(min_length=6)


class BookingCreate(BaseModel):
    class_id: str
    requested_time: Optional[str] = None  # human-readable preferred time (appointment)
    requested_at: Optional[str] = None     # ISO naive Queensland wall-clock (appointment)


class CheckoutCreate(BaseModel):
    booking_id: str
    origin_url: str
    use_credit: Optional[bool] = False
    use_class_pass: Optional[bool] = False


class MembershipApplyReq(BaseModel):
    plan_id: str
    full_name: str
    phone: str
    category: str  # Adult / Student / Senior / Child 4-16 / Other
    experience: Optional[str] = None
    message: Optional[str] = None
    details: Optional[dict] = None  # full form payload (member details, medical, waiver, etc.)


class ClassUpsert(BaseModel):
    name: str
    trainer: str
    category: str
    level: str
    duration_min: int
    price_cents: int
    start_at: Optional[str] = None  # ISO; not required for by-appointment classes
    image: Optional[str] = None
    description: Optional[str] = None
    capacity: int = 16
    by_appointment: Optional[bool] = None


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    pinned: bool = False


class ApplicationStatusReq(BaseModel):
    status: str  # pending | approved | declined


class TrialClaimReq(BaseModel):
    category: str  # "Kids" or "Adults"
    child_name: Optional[str] = None
    child_age: Optional[str] = None
    attendee_name: Optional[str] = None  # Adults: person's name
    preferred_day: Optional[str] = None  # Kids: Monday/Wednesday · Adults: "Muay Thai - Monday" etc


class RescheduleReq(BaseModel):
    requested_time: str
    note: Optional[str] = None


class AdminRescheduleReq(BaseModel):
    new_time: str
    note: Optional[str] = None


class AttendanceReq(BaseModel):
    attended: bool = True


class MessageReq(BaseModel):
    body: str


class AnnouncementUpdate(BaseModel):
    title: str
    body: str
    pinned: bool = False


DEFAULT_CLASS_IMAGE = "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80"


# -------------------- auth --------------------
@api.post("/auth/register")
async def auth_register(body: RegisterReq, request: Request):
    await enforce_rate_limit(request, "register", body.email.lower())
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    # Validate date of birth (added identity check for new members).
    try:
        dob = datetime.strptime(body.date_of_birth.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Enter a valid date of birth")
    today = now_utc().date()
    if dob > today:
        raise HTTPException(status_code=400, detail="Date of birth can't be in the future")
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if age < 5 or age > 100:
        raise HTTPException(status_code=400, detail="Please enter a valid date of birth")
    validate_password_strength(body.password)
    first = body.first_name.strip()
    last = body.last_name.strip()
    full_name = (f"{first} {last}").strip()
    user_id = new_id("user")
    doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": full_name,
        "first_name": first,
        "last_name": last,
        "date_of_birth": body.date_of_birth.strip(),
        "password_hash": hash_pw(body.password),
        "provider": "password",
        "picture": None,
        "is_admin": False,
        "verified": False,
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    # Fire the verification code email (non-blocking of the response on failure).
    try:
        await send_otp_email(doc["email"], "verify")
    except Exception as e:
        log.error(f"failed to send verification email to {doc['email']}: {e}")
    return {"token": make_jwt(user_id), "user": user_public(doc)}


@api.post("/auth/login")
async def auth_login(body: LoginReq, request: Request):
    await enforce_rate_limit(request, "login", body.email.lower())
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password_hash") or not check_pw(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": make_jwt(u["user_id"]), "user": user_public(u)}


@api.post("/auth/session")
async def auth_session(body: GoogleSessionReq):
    try:
        async with httpx.AsyncClient(timeout=20) as hc:
            r = await hc.get(EMERGENT_AUTH_SESSION_URL, headers={"X-Session-ID": body.session_id})
    except Exception as e:
        log.error(f"emergent auth error: {e}")
        raise HTTPException(status_code=401, detail="Auth service unreachable")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="No email in session")

    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name") or existing.get("name"), "picture": data.get("picture")}},
        )
    else:
        user_id = new_id("user")
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": data.get("name"),
                "picture": data.get("picture"),
                "provider": "google",
                "is_admin": False,
                "verified": True,
                "created_at": now_utc(),
            }
        )
    session_token = data.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Missing session_token")
    await db.user_sessions.insert_one(
        {"session_token": session_token, "user_id": user_id, "expires_at": now_utc() + timedelta(days=7), "created_at": now_utc()}
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"session_token": session_token, "user": user_public(u)}

@api.post("/auth/verify-otp")
async def auth_verify_otp(body: VerifyOtpReq, request: Request):
    email = body.email.lower()
    await enforce_rate_limit(request, "otp", email)
    u = await db.users.find_one({"email": email})
    if not u:
        raise HTTPException(status_code=404, detail="Account not found")
    if u.get("verified"):
        return {"verified": True, "user": user_public(u)}
    code = (body.code or "").strip()
    if not await verify_otp(email, "verify", code):
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"verified": True}})
    u["verified"] = True
    return {"verified": True, "user": user_public(u)}


@api.post("/auth/resend-otp")
async def auth_resend_otp(body: ResendOtpReq, request: Request):
    email = body.email.lower()
    await enforce_rate_limit(request, "otp", email)
    u = await db.users.find_one({"email": email})
    # Always respond ok (don't leak which emails exist), but only send when valid + unverified.
    if u and not u.get("verified") and u.get("provider") == "password":
        if not await can_resend_otp(email, "verify"):
            raise HTTPException(status_code=429, detail="Please wait a moment before requesting another code")
        try:
            await send_otp_email(email, "verify")
        except Exception as e:
            log.error(f"failed to resend verify code to {email}: {e}")
    return {"ok": True}


@api.post("/auth/forgot-password")
async def auth_forgot_password(body: ForgotPasswordReq, request: Request):
    email = body.email.lower()
    await enforce_rate_limit(request, "forgot", email)
    u = await db.users.find_one({"email": email})
    # Google-login accounts have no password to reset — tell the app to guide
    # the user to "Continue with Google" instead of leaving them stuck.
    if u and u.get("provider") == "google":
        return {"ok": True, "google": True}
    # Only password accounts can reset; always return ok to avoid account enumeration.
    if u and u.get("provider") == "password":
        if await can_resend_otp(email, "reset"):
            try:
                await send_otp_email(email, "reset")
            except Exception as e:
                log.error(f"failed to send reset code to {email}: {e}")
    return {"ok": True, "google": False}


@api.post("/auth/reset-password")
async def auth_reset_password(body: ResetPasswordReq, request: Request):
    email = body.email.lower()
    await enforce_rate_limit(request, "reset", email)
    u = await db.users.find_one({"email": email})
    if not u or u.get("provider") != "password":
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    code = (body.code or "").strip()
    if not await verify_otp(email, "reset", code):
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    validate_password_strength(body.new_password)
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"password_hash": hash_pw(body.new_password), "verified": True}},
    )
    # Reset invalidates existing sessions for safety.
    await db.user_sessions.delete_many({"user_id": u["user_id"]})
    return {"ok": True, "token": make_jwt(u["user_id"]), "user": user_public({**u, "verified": True})}




@api.get("/auth/me")
async def auth_me(u: dict = Depends(require_user)):
    return {"user": user_public(u)}


class ReminderPrefReq(BaseModel):
    hours: int


@api.put("/me/reminder-preference")
async def set_reminder_preference(body: ReminderPrefReq, u: dict = Depends(require_user)):
    if body.hours not in (0, 1, 3, 12):
        raise HTTPException(400, "Choose Off, 1, 3 or 12 hours.")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"reminder_hours": body.hours}})
    return {"ok": True, "reminder_hours": body.hours}


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.delete("/auth/account")
async def delete_account(u: dict = Depends(require_user)):
    """Permanently delete the signed-in user's account and all associated data.
    Required for Apple App Store review (in-app account deletion)."""
    uid = u["user_id"]
    if u.get("is_admin"):
        # Safety: don't let the seeded gym admin accounts delete themselves via the app.
        raise HTTPException(400, "Admin accounts cannot be deleted from the app. Please contact support.")
    await db.bookings.delete_many({"user_id": uid})
    await db.event_rsvps.delete_many({"user_id": uid})
    await db.free_trials.delete_many({"user_id": uid})
    await db.membership_applications.delete_many({"user_id": uid})
    await db.notifications.delete_many({"user_id": uid})
    await db.payment_transactions.delete_many({"user_id": uid})
    await db.messages.delete_many({"thread_user_id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True, "deleted": True}


# -------------------- gym info --------------------
@api.get("/gym/info")
async def gym_info():
    return GYM_INFO


ABOUT = {
    "heading": "About Our Team",
    "subheading": "Your Fitness Family",
    "since": "Operating in Cairns since 2013",
    "story": [
        "At Max Energy, we're more than just a gym—we're a community passionate about helping you achieve your fitness goals. As an independently owned and family-run fitness centre in Cairns, we take pride in offering a personalised experience for every member.",
        "Whether you're just starting out or looking to push your limits, we're here to support you with tailored programs, one-on-one coaching and expert guidance. Our fully refurbished gym provides a welcoming space for all fitness levels — from personal training and boot camps to Muay Thai, kickboxing and boxing.",
        "Your journey matters, and we're committed to being there for you every step of the way. Visit us in Smithfield today!",
    ],
    "team": [
        {
            "name": "Alex Honorato",
            "role": "Owner / Manager",
            "image": "https://irp.cdn-website.com/3ca70639/dms3rep/multi/opt/709-800h_enhanced-1920w.jpg",
            "bio": "An experienced trainer with over 30 years in the industry. An ex-member of the Portuguese SAS, Alex's military background helps him create efficient weight-loss and high-intensity sessions, tailored to each client.",
            "quals": ["30+ years experience", "Diploma in Fitness", "Certified Massage Practitioner", "Muay Thai / Boxing / Kickboxing / MMA", "Certified Pilates & LES MILLS Instructor"],
        },
        {
            "name": "Jamie Blackman",
            "role": "Muay Thai Coach",
            "image": "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80",
            "bio": "With over 20 years of Muay Thai experience, Jamie has competed around the world, including at world-title events in Bangkok and Dubai. Trained and certified in Thailand, he brings a wealth of international experience to every class, having coached both kids and adults across Australia, the Middle East and Thailand.\n\nJamie is passionate about helping students of all ages and experience levels build confidence, improve their skills and enjoy the journey of Muay Thai.",
            "quals": ["Personal trainer", "Certified in Thailand", "Kids & Adults (Blue Card)", "Boxing / Kickboxing / Muay Thai"],
        },
        {
            "name": "Scott Carman",
            "role": "Administration & Marketing",
            "image": "https://irp.cdn-website.com/3ca70639/dms3rep/multi/opt/Scott+Profile+HD-a7ab5007-1920w.png",
            "bio": "With a strong background in administration and marketing, Scott keeps the business running smoothly while driving brand growth through customer relations and digital marketing.",
            "quals": ["IT Support", "Marketing / Sales", "Community Helper"],
        },
    ],
}


@api.get("/about")
async def about():
    return ABOUT


# Map a class's trainer name -> a real coach headshot (from the About team).
COACH_PHOTOS = {
    "alex": "https://irp.cdn-website.com/3ca70639/dms3rep/multi/opt/709-800h_enhanced-1920w.jpg",
    "jamie": "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80",
    "scott": "https://irp.cdn-website.com/3ca70639/dms3rep/multi/opt/Scott+Profile+HD-a7ab5007-1920w.png",
}


def coach_photo(trainer: Optional[str]) -> Optional[str]:
    if not trainer:
        return None
    t = trainer.lower()
    for key, url in COACH_PHOTOS.items():
        if key in t:
            return url
    return None


def with_coach(row: dict) -> dict:
    if isinstance(row, dict):
        row["trainer_photo"] = coach_photo(row.get("trainer"))
    return row


SERVICES = [
    {"key": "gym", "title": "24/7 Gym", "icon": "barbell", "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1000&q=80", "desc": "Take charge of your schedule with 24/7 access to our fully refurbished gym. Train whenever it suits your lifestyle."},
    {"key": "muaythai", "title": "Muay Thai", "icon": "flame", "image": "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1000&q=80", "desc": "Learn discipline and build strength through our Muay Thai classes for all skill levels, kids and adults."},
    {"key": "kickboxing", "title": "Kickboxing/Boxing", "icon": "flash", "image": "https://images.unsplash.com/photo-1549824506-7f0f8b7f5b23?w=1000&q=80", "desc": "Build power, endurance and coordination with our kickboxing and boxing classes — technique and fitness for all levels."},
    {"key": "pt", "title": "Personal Training", "icon": "person", "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1000&q=80", "desc": "Personalised coaching tailored to your needs, with consistent support and expertise from our trainers."},
    {"key": "bootcamp", "title": "Boot Camp", "icon": "fitness", "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1000&q=80", "desc": "High-energy group sessions combining strength and cardio for an all-in-one workout experience."},
    {"key": "supplements", "title": "Supplement Store", "icon": "nutrition", "image": "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=1000&q=80", "desc": "High-quality supplements to complement your training — from protein powders to vitamins."},
]

LOCATIONS = [
    {"name": "Smithfield", "address": "Shop 38 Campus Village Shopping Centre, 38 Faculty Cl, Smithfield QLD 4878", "hours": "Open 24/7", "map_url": "https://maps.app.goo.gl/hWLvuqRqy5V6txsh8"},
    {"name": "Cairns", "address": "Servicing the greater Cairns region", "hours": "Open 24/7", "map_url": "https://maps.app.goo.gl/hWLvuqRqy5V6txsh8"},
]


@api.get("/services")
async def services():
    return {"services": SERVICES}


@api.get("/locations")
async def locations():
    return {"locations": LOCATIONS}


GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
GOOGLE_PLACE_QUERY = os.environ.get("GOOGLE_PLACE_QUERY", "Maxenergy Fitness, Smithfield QLD")
GOOGLE_PLACE_ID = os.environ.get("GOOGLE_PLACE_ID", "").strip()

# Deep links that work without an API key
REVIEW_VIEW_URL = "https://www.google.com/maps/search/?api=1&query=" + GOOGLE_PLACE_QUERY.replace(" ", "%20")
REVIEW_WRITE_URL = "https://www.google.com/maps/search/?api=1&query=" + GOOGLE_PLACE_QUERY.replace(" ", "%20")

_reviews_cache: dict = {"data": None, "ts": 0}


async def _fetch_google_reviews() -> Optional[dict]:
    if not GOOGLE_PLACES_API_KEY:
        return None
    field_mask = "id,displayName,formattedAddress,rating,userRatingCount,reviews,googleMapsLinks,googleMapsUri"
    try:
        async with httpx.AsyncClient(timeout=12) as hc:
            place_id = GOOGLE_PLACE_ID
            if not place_id:
                sr = await hc.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    headers={
                        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                        "X-Goog-FieldMask": "places.id",
                        "Content-Type": "application/json",
                    },
                    json={"textQuery": GOOGLE_PLACE_QUERY, "pageSize": 1, "languageCode": "en"},
                )
                sr.raise_for_status()
                places = sr.json().get("places", [])
                if not places:
                    return None
                place_id = places[0]["id"]
            dr = await hc.get(
                f"https://places.googleapis.com/v1/places/{place_id}",
                headers={"X-Goog-Api-Key": GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": field_mask},
                params={"languageCode": "en"},
            )
            dr.raise_for_status()
            p = dr.json()
    except Exception as e:
        log.error(f"places error: {e}")
        return None

    reviews = []
    for x in (p.get("reviews") or [])[:5]:
        author = x.get("authorAttribution", {}) or {}
        reviews.append(
            {
                "author_name": author.get("displayName"),
                "profile_photo": author.get("photoUri"),
                "rating": x.get("rating"),
                "text": (x.get("text") or {}).get("text", ""),
                "relative_time": x.get("relativePublishTimeDescription"),
            }
        )
    links = p.get("googleMapsLinks", {}) or {}
    return {
        "rating": p.get("rating"),
        "total": p.get("userRatingCount"),
        "reviews": reviews,
        "write_url": links.get("writeAReviewUri") or REVIEW_WRITE_URL,
        "view_url": links.get("reviewsUri") or p.get("googleMapsUri") or REVIEW_VIEW_URL,
    }


@api.get("/reviews")
async def reviews():
    now_ts = now_utc().timestamp()
    if _reviews_cache["data"] and now_ts - _reviews_cache["ts"] < 900:
        return _reviews_cache["data"]

    google = await _fetch_google_reviews()
    if google:
        result = {"source": "google", **google}
    else:
        result = {
            "source": "links",
            "rating": None,
            "total": None,
            "reviews": [],
            "write_url": REVIEW_WRITE_URL,
            "view_url": REVIEW_VIEW_URL,
        }
    _reviews_cache["data"] = result
    _reviews_cache["ts"] = now_ts
    return result


# -------------------- classes --------------------
@api.get("/classes")
async def classes_list(category: Optional[str] = None, include_ended: bool = False):
    q: dict = {"cancelled": {"$ne": True}}
    if category and category.lower() != "all":
        q["category"] = category
    rows = await db.classes.find(q, {"_id": 0}).sort("start_at", 1).to_list(1000)
    now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)
    # count active bookings (paid/confirmed) per class for capacity display
    agg = await db.bookings.aggregate([
        {"$match": {"status": {"$in": ["paid", "confirmed"]}}},
        {"$group": {"_id": "$class_id", "n": {"$sum": 1}}},
    ]).to_list(5000)
    booked_map = {a["_id"]: a["n"] for a in agg}
    out = []
    for r in rows:
        ended = False
        if not r.get("by_appointment"):
            start = r.get("start_at")
            if isinstance(start, datetime):
                s = start.replace(tzinfo=None) if start.tzinfo else start
                if s + timedelta(minutes=r.get("duration_min") or 0) < now_local:
                    ended = True
        # Home/upcoming (default) hides ended classes; timetable requests include_ended to show status.
        if ended and not include_ended:
            continue
        r["ended"] = ended
        if not r.get("by_appointment"):
            cap = r.get("capacity") or 0
            booked = booked_map.get(r["class_id"], 0)
            r["booked"] = booked
            r["spots_left"] = max(cap - booked, 0)
        out.append(r)
    return {"classes": [with_coach(r) for r in out]}


@api.get("/classes/{class_id}")
async def class_detail(class_id: str):
    c = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if not c or c.get("cancelled"):
        raise HTTPException(404, "Class not found")
    if not c.get("by_appointment"):
        cap = c.get("capacity") or 0
        booked = await db.bookings.count_documents({"class_id": class_id, "status": {"$in": ["paid", "confirmed"]}})
        c["booked"] = booked
        c["spots_left"] = max(cap - booked, 0)
    return with_coach(c)


# -------------------- bookings --------------------
@api.post("/bookings")
async def booking_create(body: BookingCreate, u: dict = Depends(require_user)):
    cls = await db.classes.find_one({"class_id": body.class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(404, "Class not found")
    if cls.get("cancelled"):
        raise HTTPException(409, "This class has been cancelled.")
    existing = await db.bookings.find_one(
        {"user_id": u["user_id"], "class_id": body.class_id, "status": {"$in": ["paid", "pending"]}}, {"_id": 0}
    )
    if existing and existing.get("status") == "paid":
        raise HTTPException(409, "Already booked")
    if existing:
        return {"booking": existing}
    booking_id = new_id("bk")
    is_appt = bool(cls.get("by_appointment"))
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
            rt = datetime.fromisoformat(body.requested_at)
        except Exception:
            raise HTTPException(400, "Invalid preferred time.")
        # requested_at is Queensland (UTC+10) wall-clock → convert to a UTC instant.
        rt_utc = rt.replace(tzinfo=timezone.utc) - timedelta(hours=10)
        if rt_utc < now_utc() + timedelta(hours=24):
            raise HTTPException(400, "Sessions must be booked at least 24 hours in advance. Please pick a later time.")
    doc = {
        "booking_id": booking_id,
        "user_id": u["user_id"],
        "class_id": body.class_id,
        "class_name": cls["name"],
        "amount": cls["price_cents"],
        "currency": cls.get("currency", "aud"),
        "by_appointment": is_appt,
        "class_start": cls.get("start_at"),
        "status": "pending",
        "created_at": now_utc(),
    }
    if is_appt:
        doc["requested_time"] = body.requested_time
        doc["requested_at"] = body.requested_at
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    if is_appt:
        member_name = u.get("name") or u.get("email")
        pref = body.requested_time or "a time to be confirmed"
        await notify_admins(
            "New session request",
            f"{member_name} requested a {cls['name']} session — preferred: {pref}.",
            "booking",
            email_lines=[
                f"<b>{esc(member_name)}</b> has requested a <b>{esc(cls['name'])}</b> session.",
                f"Preferred time: <b>{esc(pref)}</b>",
                "This is a by-appointment booking — open the app Admin → Bookings to accept, reschedule or cancel.",
            ],
        )
        await create_notification(
            u["user_id"],
            "Session request received",
            f"We received your request for {cls['name']} ({pref}). We'll confirm shortly.",
            "booking",
        )
    return {"booking": doc}


@api.get("/bookings")
async def bookings_list(u: dict = Depends(require_user)):
    # Reconcile any payments that completed on Square but weren't confirmed live.
    await reconcile_user_payments(u["user_id"])
    rows = await db.bookings.find(
        {"user_id": u["user_id"], "cleared": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    await _enrich_bookings(rows)
    return {"bookings": rows}


@api.post("/payments/reconcile")
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
    for r in rows:
        c = classes.get(r.get("class_id")) or {}
        if c.get("start_at") is not None:
            r["class_start"] = c["start_at"]
        r["trainer"] = c.get("trainer")
        r["trainer_photo"] = coach_photo(c.get("trainer"))
        r["duration_min"] = c.get("duration_min")
        r["level"] = c.get("level")
        r["category"] = c.get("category")


@api.get("/bookings/history")
async def bookings_history(u: dict = Depends(require_user)):
    # Full saved booking log — includes bookings the member has cleared.
    rows = await db.bookings.find(
        {"user_id": u["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"bookings": rows}


@api.post("/bookings/clear-all")
async def bookings_clear_all(u: dict = Depends(require_user)):
    # Soft-clear: remove from the active list but keep in the saved history/log.
    res = await db.bookings.update_many(
        {"user_id": u["user_id"], "cleared": {"$ne": True}},
        {"$set": {"cleared": True, "cleared_at": now_utc()}},
    )
    return {"ok": True, "cleared": res.modified_count}


@api.post("/bookings/{booking_id}/clear")
async def booking_clear(booking_id: str, u: dict = Depends(require_user)):
    # Soft-clear so the booking stays in the member's saved history/log.
    await db.bookings.update_one(
        {"booking_id": booking_id, "user_id": u["user_id"]},
        {"$set": {"cleared": True, "cleared_at": now_utc()}},
    )
    return {"ok": True}


@api.post("/bookings/{booking_id}/cancel")
async def booking_cancel(booking_id: str, u: dict = Depends(require_user)):
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") == "cancelled":
        return {"booking": b}
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "cancelled", "cancelled_at": now_utc(), "cancelled_by": "member"}})
    member_name = u.get("name") or u.get("email")
    await notify_user(
        u["user_id"], u.get("email"),
        "Booking cancelled",
        f"Your booking for {b['class_name']} has been cancelled.",
        "booking",
        email_lines=[f"Your booking for <b>{b['class_name']}</b> has been cancelled.", "We hope to see you back on the mats soon!"],
    )
    await notify_admins(
        "Booking cancelled by member",
        f"{member_name} cancelled their {b['class_name']} booking.",
        "booking",
        email_lines=[f"<b>{esc(member_name)}</b> cancelled their <b>{esc(b['class_name'])}</b> booking."],
    )
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    return {"booking": b}


@api.post("/bookings/{booking_id}/reschedule")
async def booking_reschedule(booking_id: str, body: RescheduleReq, u: dict = Depends(require_user)):
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") == "cancelled":
        raise HTTPException(400, "This booking is cancelled and cannot be rescheduled.")
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"status": "reschedule_requested", "requested_time": body.requested_time, "reschedule_note": body.note, "reschedule_requested_at": now_utc()}},
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


@api.post("/bookings/{booking_id}/checkin")
async def booking_checkin(booking_id: str, u: dict = Depends(require_user)):
    # Self check-in is disabled — members are checked in only when gym staff scan their entry QR.
    raise HTTPException(403, "Check-in is done by gym staff scanning your entry QR code.")


@api.get("/bookings/{booking_id}/checkin-code")
async def booking_checkin_code(booking_id: str, u: dict = Depends(require_user)):
    """Return a signed QR payload the member displays for door check-in."""
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") not in ("paid", "confirmed"):
        raise HTTPException(400, "Only paid or confirmed bookings have a check-in code.")
    payload = {
        "bid": booking_id,
        "uid": u["user_id"],
        "typ": "checkin",
        "exp": datetime.now(timezone.utc) + timedelta(days=2),
    }
    code = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)
    return {"code": code, "booking_id": booking_id}


@api.get("/passes/qr")
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


class ScanCheckinReq(BaseModel):
    code: str


@api.post("/admin/checkin/scan")
async def admin_checkin_scan(body: ScanCheckinReq, u: dict = Depends(require_admin)):
    """Admin scans a member's QR to check them in — only on the class day."""
    try:
        data = jwt.decode(body.code, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(400, "This QR code has expired. Ask the member to reopen it.")
    except Exception:
        raise HTTPException(400, "Invalid QR code.")

    # ----- Class Pass walk-in redemption (deduct 1 pass per scan) -----
    if data.get("typ") == "classpass":
        uid = data.get("uid")
        if not uid:
            raise HTTPException(400, "This isn't a valid class pass code.")
        member = await db.users.find_one({"user_id": uid}, {"_id": 0})
        if not member:
            raise HTTPException(404, "Member not found.")
        mname = member.get("name") or member.get("email") or "Member"
        now = now_utc()
        # Atomic guarded decrement prevents concurrent double-spend.
        res = await db.users.update_one(
            {"user_id": uid, "class_pass_credits": {"$gte": 1}},
            {"$inc": {"class_pass_credits": -1}},
        )
        if res.modified_count != 1:
            raise HTTPException(400, f"{mname} has no class passes left. Ask them to buy more.")
        fresh = await db.users.find_one({"user_id": uid}, {"_id": 0, "class_pass_credits": 1})
        left = int((fresh or {}).get("class_pass_credits", 0))
        await db.pass_ledger.insert_one({
            "pass_ledger_id": new_id("pl"), "user_id": uid, "delta": -1,
            "reason": "Class pass used at the gym", "balance_after": left,
            "created_at": now, "by": "admin_qr",
        })
        await db.pass_redemptions.insert_one({
            "redemption_id": new_id("pr"), "user_id": uid, "redeemed_at": now,
            "redeemed_by": u["user_id"], "balance_after": left,
        })
        await create_notification(
            uid, "Class pass used ✅",
            f"You checked in with a class pass. {left} pass{'es' if left != 1 else ''} left.",
            "booking",
        )
        await low_pass_nudge(uid, (member or {}).get("email"), left)
        return {
            "ok": True,
            "member_name": mname,
            "class_name": "Class Pass entry",
            "when": f"{left} pass{'es' if left != 1 else ''} left",
            "passes_left": left,
        }

    if data.get("typ") != "checkin" or not data.get("bid"):
        raise HTTPException(400, "This isn't a valid check-in code.")
    b = await db.bookings.find_one({"booking_id": data["bid"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found.")
    if b.get("status") not in ("paid", "confirmed"):
        raise HTTPException(400, "This booking isn't paid — check payment first.")

    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    mname = (member or {}).get("name") or (member or {}).get("email") or "Member"
    cls = await db.classes.find_one({"class_id": b["class_id"]}, {"_id": 0}) or {}
    start = cls.get("start_at") or b.get("class_start")

    # Class-day restriction. Class start is stored as local wall-clock; compare its date to today (QLD).
    if not b.get("by_appointment") and isinstance(start, datetime):
        s = start.replace(tzinfo=None) if start.tzinfo else start
        class_day = s.date()
        today = (now_utc() + timedelta(hours=10)).date()  # Queensland time (no DST)
        if class_day != today:
            when = s.strftime("%A %d %B")
            raise HTTPException(400, f"This class is on {when}, not today. Check-in is only available on the class day.")

    when_str = ""
    if isinstance(start, datetime):
        s = start.replace(tzinfo=None) if start.tzinfo else start
        when_str = s.strftime("%-I:%M %p")

    if b.get("attended"):
        return {
            "ok": True,
            "already": True,
            "member_name": mname,
            "class_name": b["class_name"],
            "when": when_str,
        }

    await db.bookings.update_one(
        {"booking_id": b["booking_id"]},
        {"$set": {"attended": True, "checked_in_at": now_utc(), "checked_in_by": "admin_qr"}},
    )
    await create_notification(
        b["user_id"],
        "Checked in ✅",
        f"You're checked in for {b['class_name']}. Have a great session!",
        "booking",
    )
    return {
        "ok": True,
        "already": False,
        "member_name": mname,
        "class_name": b["class_name"],
        "when": when_str,
    }

@api.get("/messages/unread")
async def messages_unread(u: dict = Depends(require_user)):
    count = await db.messages.count_documents(
        {"thread_user_id": u["user_id"], "sender_is_admin": True, "read_by_member": {"$ne": True}}
    )
    return {"count": count}


@api.get("/messages")
async def messages_list(u: dict = Depends(require_user)):
    rows = await db.messages.find({"thread_user_id": u["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many(
        {"thread_user_id": u["user_id"], "sender_is_admin": True, "read_by_member": {"$ne": True}},
        {"$set": {"read_by_member": True}},
    )
    return {"messages": rows}


@api.post("/messages")
async def messages_send(body: MessageReq, request: Request, u: dict = Depends(require_user)):
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    msg = {
        "message_id": new_id("msg"),
        "thread_user_id": u["user_id"],
        "sender_id": u["user_id"],
        "sender_name": u.get("name") or u.get("email"),
        "sender_is_admin": False,
        "body": text,
        "read_by_member": True,
        "read_by_admin": False,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(msg)
    from urllib.parse import quote_plus
    base = _public_base(request)
    thread_url = f"{base}/admin/thread?userId={u['user_id']}&name={quote_plus(msg['sender_name'])}" if base else ""
    email_lines = [
        f"<b>{msg['sender_name']}</b> ({u.get('email')}) sent you a new message:",
        f"\"{text}\"",
        _download_button(thread_url, "Open conversation") if thread_url else "Open the app → Admin → Inbox to reply.",
    ]
    await notify_admins(
        f"New message from {msg['sender_name']}",
        f"{msg['sender_name']}: {text[:120]}",
        "message",
        email_lines=email_lines,
        data={"nav": "admin_thread", "user_id": u["user_id"], "name": msg["sender_name"]},
    )
    msg.pop("_id", None)
    return {"message": msg}


@api.get("/admin/threads")
async def admin_threads(u: dict = Depends(require_admin)):
    rows = await db.messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    threads: dict = {}
    for m in rows:
        tid = m["thread_user_id"]
        if tid not in threads:
            threads[tid] = {"user_id": tid, "last_body": m["body"], "last_at": m["created_at"], "last_is_admin": m["sender_is_admin"], "unread": 0}
        if not m["sender_is_admin"] and not m.get("read_by_admin"):
            threads[tid]["unread"] += 1
    uids = list(threads.keys())
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(5000)
    umap = {x["user_id"]: x for x in users}
    out = []
    for tid, t in threads.items():
        m = umap.get(tid, {})
        t["name"] = m.get("name") or m.get("email") or "Member"
        t["email"] = m.get("email")
        out.append(t)
    out.sort(key=lambda x: x["last_at"], reverse=True)
    return {"threads": out}


@api.get("/admin/threads/{user_id}")
async def admin_thread_messages(user_id: str, u: dict = Depends(require_admin)):
    rows = await db.messages.find({"thread_user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many(
        {"thread_user_id": user_id, "sender_is_admin": False, "read_by_admin": {"$ne": True}},
        {"$set": {"read_by_admin": True}},
    )
    member = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "email": 1})
    return {"messages": rows, "member": member}


@api.post("/admin/threads/{user_id}")
async def admin_thread_reply(user_id: str, body: MessageReq, request: Request, u: dict = Depends(require_admin)):
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    member = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")
    msg = {
        "message_id": new_id("msg"),
        "thread_user_id": user_id,
        "sender_id": u["user_id"],
        "sender_name": "Maxenergy Team",
        "sender_is_admin": True,
        "body": text,
        "read_by_member": False,
        "read_by_admin": True,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(msg)
    base = _public_base(request)
    open_btn = _download_button(f"{base}/messages", "Open your messages") if base else "Open the app to reply: Profile → Message the Gym."
    await notify_user(
        user_id, member.get("email"),
        "New message from Maxenergy Fitness",
        text[:140],
        "message",
        email_lines=["You have a new message from the Maxenergy Team:", f"\"{text}\"", open_btn],
        data={"nav": "member_inbox"},
    )
    msg.pop("_id", None)
    return {"message": msg}


# -------------------- payments (Square) --------------------
def _square_headers():
    return {"Authorization": f"Bearer {SQUARE_ACCESS_TOKEN}", "Square-Version": SQUARE_VERSION}


# -------------------- membership / pass store --------------------
STORE_PRODUCTS = {
    "pass_7day":  {"name": "7 Day Pass",                  "price_cents": 8000,  "type": "pass",       "days": 7,   "requires_keytag": False, "discount": False,
                   "perks": ["7 days unlimited classes", "Great way to try us out", "No lock-in contract"]},
    "mem_1m":     {"name": "1 Month Upfront Membership",  "price_cents": 15000, "type": "membership", "days": 30,  "requires_keytag": True,  "discount": False,
                   "perks": ["24/7 gym access with key tag", "Access-card setup at sign-up"]},
    "mem_3m":     {"name": "3 Month Upfront Membership",  "price_cents": 38000, "type": "membership", "days": 90,  "requires_keytag": True,  "discount": False,
                   "perks": ["Unlimited classes for 3 months", "24/7 gym access with key tag", "Save vs monthly — best value"]},
    "mem_6m":     {"name": "6 Month Upfront Membership",  "price_cents": 51000, "type": "membership", "days": 180, "requires_keytag": True,  "discount": False,
                   "perks": ["Unlimited classes for 6 months", "24/7 gym access with key tag", "Bigger savings upfront"]},
    "mem_12m":    {"name": "12 Month Upfront Membership", "price_cents": 75000, "type": "membership", "days": 365, "requires_keytag": True,  "discount": False,
                   "perks": ["Unlimited classes for a full year", "24/7 gym access with key tag", "Our lowest price per month"]},
    "pass_1class":  {"name": "Single Class Pass",         "price_cents": 2500,  "type": "class_pass", "classes": 1,  "requires_keytag": False, "discount": False,
                   "perks": ["1 class credit to use anytime", "Boot Camp, Muay Thai & Kickboxing", "Credit never expires"]},
    "pass_10class": {"name": "10 Class Pass",             "price_cents": 20000, "type": "class_pass", "classes": 10, "requires_keytag": False, "discount": False,
                   "perks": ["10 class credits to use anytime", "Boot Camp, Muay Thai & Kickboxing", "Credits never expire", "Perfect for casual training"]},
}
KEYTAG_CENTS = 4000
FIRST_PURCHASE_DISCOUNT = 0.10


async def compute_store_price(user: dict, product_id: str, add_key_tag: bool) -> dict:
    p = STORE_PRODUCTS.get(product_id)
    if not p:
        raise HTTPException(404, "Unknown product")
    base = p["price_cents"]
    discount_cents = 0
    first_eligible = p["discount"] and not user.get("first_purchase_used")
    if first_eligible:
        discount_cents = round(base * FIRST_PURCHASE_DISCOUNT)
    key_tag = bool(p["requires_keytag"])  # key tag mandatory for upfront memberships
    keytag_cents = KEYTAG_CENTS if key_tag else 0
    total = base - discount_cents + keytag_cents
    return {"base": base, "discount_cents": discount_cents, "keytag_cents": keytag_cents, "total": total, "key_tag": key_tag, "first_discount": first_eligible, "name": p["name"], "type": p["type"]}


async def fulfill_store_purchase(tx: dict) -> None:
    if tx.get("fulfilled"):
        return
    uid = tx["user_id"]
    pid = tx.get("product_id")
    p = STORE_PRODUCTS.get(pid, {})
    user = await db.users.find_one({"user_id": uid})
    upd: dict = {}
    now = now_utc()
    if p.get("type") in ("membership", "pass") and p.get("days"):
        cur_exp = user.get("membership_expires_at")
        if isinstance(cur_exp, datetime) and cur_exp.tzinfo is None:
            cur_exp = cur_exp.replace(tzinfo=timezone.utc)
        base_dt = cur_exp if isinstance(cur_exp, datetime) and cur_exp > now else now
        upd["membership_expires_at"] = base_dt + timedelta(days=p["days"])
        upd["membership_plan"] = p["name"]
        upd["membership_active"] = True
    if p.get("type") == "class_pass":
        added = int(p.get("classes", 0))
        upd_classes = int(user.get("class_pass_credits", 0)) + added
        upd["class_pass_credits"] = upd_classes
        await db.pass_ledger.insert_one({
            "pass_ledger_id": new_id("pl"), "user_id": uid, "delta": added,
            "reason": f"Purchased {p.get('name')}", "balance_after": upd_classes,
            "created_at": now,
        })
    if tx.get("key_tag"):
        upd["key_tag"] = True
        upd["key_tag_purchased_at"] = now
    if STORE_PRODUCTS.get(pid, {}).get("discount"):
        upd["first_purchase_used"] = True
    if upd:
        await db.users.update_one({"user_id": uid}, {"$set": upd})
    await db.payment_transactions.update_one({"session_id": tx["session_id"]}, {"$set": {"fulfilled": True, "fulfilled_at": now}})
    # Notify member + admins
    await notify_user(uid, user.get("email"), "Purchase confirmed",
                      f"Your {p.get('name')} purchase is confirmed. Thanks for training with Max Energy!", "booking",
                      email_lines=[f"Your <b>{p.get('name')}</b> purchase is confirmed.",
                                   ("Key Tag 24/7 access is included." if tx.get("key_tag") else "")])
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1, "email": 1}).to_list(20)
    sched = ""
    if tx.get("start_date") or tx.get("meet_time"):
        sched = f" Access-card setup: {tx.get('start_date','')} {tx.get('meet_time','')}".rstrip()
    for a in admins:
        await notify_user(a["user_id"], a.get("email"), "New membership purchase",
                          f"{user.get('name') or user.get('email')} purchased {p.get('name')} (${tx.get('amount',0)/100:.2f}).{sched}", "admin")


async def sync_square_payment(tx: dict) -> tuple:
    """Retrieve the Square order for a transaction, sync paid state, return (payment_status, status)."""
    order_id = tx.get("square_order_id")
    if not order_id:
        return tx.get("payment_status", "initiated"), tx.get("status", "open")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(f"{SQUARE_BASE}/orders/{order_id}", headers=_square_headers())
    if resp.status_code >= 400:
        log.error(f"square order status error {resp.status_code}: {resp.text[:200]}")
        return tx.get("payment_status", "initiated"), tx.get("status", "open")
    order = resp.json().get("order", {})
    state = order.get("state", "")  # DRAFT, OPEN, COMPLETED, CANCELED
    total = order.get("total_money", {}) or {}
    total_amt = total.get("amount", 0) or 0
    net_due = (order.get("net_amount_due_money") or {}).get("amount")
    tenders = order.get("tenders") or []
    # A Square payment-link order stays OPEN after payment; detect paid via net amount due == 0.
    fully_paid = (total_amt > 0 and net_due == 0 and len(tenders) > 0) or state == "COMPLETED"
    if fully_paid:
        payment_status, status = "paid", "complete"
    elif state == "CANCELED":
        payment_status, status = "unpaid", "expired"
    else:
        payment_status, status = "initiated", "open"
    if tx.get("payment_status") != payment_status:
        await db.payment_transactions.update_one(
            {"session_id": tx["session_id"]},
            {"$set": {"payment_status": payment_status, "status": status, "updated_at": now_utc()}},
        )
        if payment_status == "paid":
            if tx.get("kind") == "store":
                await fulfill_store_purchase(tx)
            else:
                await mark_booking_paid(tx["booking_id"])
    return payment_status, status


async def reconcile_user_payments(user_id: str) -> list:
    """Sync any not-yet-paid Square transactions for a user. Returns booking_ids that became paid.
    Safety net for when the live redirect/polling was missed after checkout.
    Only looks at recent, still-open transactions to keep this fast."""
    newly_paid: list = []
    cutoff = now_utc() - timedelta(hours=48)
    txs = await db.payment_transactions.find(
        {
            "user_id": user_id,
            "payment_status": {"$ne": "paid"},
            "status": {"$ne": "expired"},
            "square_order_id": {"$exists": True},
            "created_at": {"$gte": cutoff},
        }
    ).to_list(20)
    for tx in txs:
        try:
            ps, _ = await sync_square_payment(tx)
            if ps == "paid" and tx.get("booking_id"):
                newly_paid.append(tx["booking_id"])
        except Exception as e:
            log.error(f"reconcile payment error for {tx.get('booking_id') or tx.get('product_id')}: {e}")
    return newly_paid


@api.post("/payments/checkout")
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
        if booking.get("by_appointment"):
            raise HTTPException(400, "Class passes can't be used for by-appointment sessions.")
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
        await low_pass_nudge(u["user_id"], u.get("email"), left)
        return {"paid_with_pass": True, "passes_left": left, "booking_id": booking["booking_id"]}

    # ----- Apply in-app credit if requested -----
    credit_applied = 0
    if body.use_credit:
        fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "credit_cents": 1})
        avail = int((fresh or {}).get("credit_cents", 0))
        credit_applied = min(avail, amount_cents)
        if credit_applied > 0:
            await db.bookings.update_one(
                {"booking_id": booking["booking_id"]},
                {"$set": {"credit_applied_cents": credit_applied}},
            )
        remainder = amount_cents - credit_applied
        if remainder <= 0:
            # Fully covered by credit — no card payment needed.
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
        amount_cents = remainder  # charge only the remainder on the card

    redirect_url = f"{body.origin_url.rstrip('/')}/payment-return?status=success&booking_id={booking['booking_id']}"
    payload = {
        "idempotency_key": str(uuid.uuid4()),
        "quick_pay": {
            "name": booking["class_name"],
            "price_money": {"amount": amount_cents, "currency": currency},
            "location_id": SQUARE_LOCATION_ID,
        },
        "payment_note": f"{booking['class_name']} — Booking No. {booking_ref_no(booking['booking_id'])} — {u.get('name') or u.get('email') or 'Member'} (App Booking)",
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


@api.get("/payments/status/{session_id}")
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


# -------------------- store endpoints --------------------
@api.get("/store/products")
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


@api.post("/store/checkout")
async def store_checkout(body: StoreCheckoutReq, u: dict = Depends(require_user)):
    fresh = await db.users.find_one({"user_id": u["user_id"]}) or u
    # All upfront memberships and passes require the member to complete the
    # membership form first (collected once, remembered forever).
    if not fresh.get("membership_form_completed_at"):
        raise HTTPException(status_code=428, detail="Please complete your membership form before purchasing.")
    pricing = await compute_store_price(fresh, body.product_id, False)
    order_ref = new_id("store")
    label = pricing["name"] + (" + Key Tag" if pricing["key_tag"] else "")
    redirect_url = f"{body.origin_url.rstrip('/')}/payment-return?status=success&store=1"
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
        "session_id": order_id, "square_order_id": order_id, "provider": "square", "kind": "store",
        "product_id": body.product_id, "user_id": u["user_id"], "amount": pricing["total"], "currency": "aud",
        "key_tag": pricing["key_tag"], "payment_status": "initiated", "status": "open", "created_at": now_utc(),
        "start_date": body.start_date, "meet_time": body.meet_time, "order_ref": order_ref,
    })
    return {"url": link.get("url"), "session_id": order_id}


@api.get("/store/status/{session_id}")
async def store_status(session_id: str, u: dict = Depends(require_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["user_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Session not found")
    payment_status, status = await sync_square_payment(tx)
    return {"payment_status": payment_status, "status": status, "product_id": tx.get("product_id")}


@api.get("/store/receipt/latest")
async def store_receipt_latest(u: dict = Depends(require_user)):
    cutoff = now_utc() - timedelta(hours=6)
    tx = await db.payment_transactions.find_one(
        {"user_id": u["user_id"], "kind": "store", "created_at": {"$gte": cutoff}},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if not tx:
        raise HTTPException(404, "No recent purchase")
    return await store_receipt(tx["session_id"], u)


@api.get("/store/receipt/{session_id}")
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



@api.get("/payments/receipt/{booking_id}")
async def payment_receipt(booking_id: str, u: dict = Depends(require_user)):
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") != "paid":
        # The web redirect can arrive before any status poll ran — sync with Square now.
        tx = await db.payment_transactions.find_one({"booking_id": booking_id}, {"_id": 0})
        if tx:
            await sync_square_payment(tx)
            b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if b.get("status") != "paid":
        raise HTTPException(409, "Booking not paid")
    cls = await db.classes.find_one({"class_id": b["class_id"]}, {"_id": 0}) or {}
    tx = await db.payment_transactions.find_one({"booking_id": booking_id}, {"_id": 0}) or {}
    start = cls.get("start_at") or b.get("class_start")
    paid_at = b.get("paid_at")
    # Reflect how it was actually paid.
    if b.get("paid_with_pass"):
        method, amount_cents = "Class Pass (1 used)", 0
    elif int(b.get("credit_applied_cents", 0)) >= int(b.get("amount", 0)) and tx.get("provider") == "credit":
        method, amount_cents = "Account credit", 0
    else:
        method, amount_cents = "Square", b.get("amount", 0)
    return {
        "booking_id": booking_id,
        "receipt_number": booking_id.replace("bk_", "").upper()[:10],
        "booking_no": booking_ref_no(booking_id),
        "class_name": b.get("class_name"),
        "trainer": cls.get("trainer"),
        "class_start": start.isoformat() if isinstance(start, datetime) else start,
        "by_appointment": bool(b.get("by_appointment")),
        "amount_cents": amount_cents,
        "currency": (b.get("currency") or "aud").upper(),
        "paid_at": paid_at.isoformat() if isinstance(paid_at, datetime) else paid_at,
        "payment_method": method,
        "order_id": tx.get("square_order_id"),
        "member_name": u.get("name") or u.get("email"),
        "member_email": u.get("email"),
        "location": GYM_INFO["address"],
    }


@api.get("/payments/receipts")
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


@api.get("/credits")
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


@api.get("/announcements")
async def announcements_list():
    rows = await db.announcements.find({}, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(200)
    return {"announcements": rows}


# -------------------- events --------------------
@api.get("/events")
async def events_list():
    rows = await db.events.find({}, {"_id": 0}).sort("start_at", 1).to_list(200)
    return {"events": rows}


@api.get("/events/{event_id}")
async def event_detail(event_id: str):
    e = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Event not found")
    return e


class EventRSVPReq(BaseModel):
    event_id: str


@api.post("/events/rsvp")
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
    html = f"""
    <table width="100%" style="font-family:Arial,sans-serif;background:#121214;color:#F9FAFB;padding:24px">
      <tr><td>
        <h2 style="color:#FF7A00;margin:0 0 8px">You're going to {e['title']}</h2>
        <p style="color:#A1A1AA;margin:0 0 12px">See you at Maxenergy Fitness.</p>
        <p><strong>When:</strong> {when}</p>
        <p><strong>Where:</strong> {e.get('location','Maxenergy Fitness, Smithfield')}</p>
        <p style="margin-top:16px">{e.get('description','')}</p>
      </td></tr>
    </table>
    """
    await send_email(u["email"], f"RSVP confirmed – {e['title']}", html)
    return {"ok": True}


# -------------------- membership --------------------
@api.get("/membership/plans")
async def membership_plans():
    rows = await db.membership_plans.find({}, {"_id": 0}).sort("sort", 1).to_list(50)
    return {"plans": rows}


class VigyrReportReq(BaseModel):
    completed: bool = True


@api.post("/membership/vigyr-report")
async def membership_vigyr_report(body: VigyrReportReq, u: dict = Depends(require_user)):
    """Member self-reports whether they finished the external Vigyr sign-up.
    We cannot verify Vigyr directly, so this records the claim + alerts the gym to verify."""
    if not body.completed:
        return {"ok": True, "reported": False}
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"vigyr_signup_reported": True, "vigyr_reported_at": now_utc()}},
    )
    name = u.get("name") or u.get("email") or "A member"
    await notify_admins(
        "Vigyr sign-up reported",
        f"{name} says they completed the Vigyr membership sign-up. Please verify in Vigyr.",
        ntype="application",
        email_lines=[
            f"{name} ({u.get('email','')}) reports they finished the online Vigyr sign-up form.",
            "Please confirm their membership in your Vigyr dashboard (keytag / door access).",
        ],
        data={"nav": "admin_members"},
    )
    return {"ok": True, "reported": True}


def build_membership_pdf(doc: dict, plan: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.lib.utils import ImageReader

    d = doc.get("details") or {}
    med = d.get("medical") or {}
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    W, H = A4
    ORANGE = (1, 0.478, 0)
    DARK = (0.10, 0.10, 0.12)
    GREY = (0.42, 0.42, 0.46)
    LIGHT = (0.965, 0.965, 0.972)
    LINE = (0.88, 0.88, 0.90)
    LEFT = 45
    RIGHT = W - 45
    LABEL_X = 55
    VALUE_X = 210
    BOTTOM = 58  # reserve for footer

    ref_no = booking_ref_no(doc.get("application_id", ""))
    submitted = str(d.get("submitted_date", "") or "")

    def draw_footer():
        c.saveState()
        c.setStrokeColorRGB(*LINE); c.setLineWidth(0.8)
        c.line(LEFT, 46, RIGHT, 46)
        c.setFont("Helvetica", 8); c.setFillColorRGB(*GREY)
        c.drawString(LEFT, 34, "Maxenergy Fitness · Membership Registration Form")
        c.drawCentredString(W / 2, 34, "Confidential")
        c.drawRightString(RIGHT, 34, f"Page {c.getPageNumber()}")
        c.restoreState()

    y = H - 118  # first content y (below the header band)

    def page_break(newy=H - 55):
        nonlocal y
        draw_footer()
        c.showPage()
        y = newy

    def ensure(space):
        nonlocal y
        if y < max(space, BOTTOM + 24):
            page_break()

    def section(title):
        nonlocal y
        ensure(96)
        y -= 8
        c.setFillColorRGB(*LIGHT)
        c.roundRect(LEFT, y - 7, RIGHT - LEFT, 24, 4, fill=1, stroke=0)
        c.setFillColorRGB(*ORANGE)
        c.rect(LEFT, y - 7, 4, 24, fill=1, stroke=0)
        c.setFillColorRGB(*DARK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(60, y, title.upper())
        y -= 32

    def field(label, value):
        nonlocal y
        value = "-" if value in (None, "") else str(value)
        max_w = RIGHT - VALUE_X
        words, linesv, cur = value.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if c.stringWidth(t, "Helvetica", 10) <= max_w:
                cur = t
            else:
                if cur:
                    linesv.append(cur)
                cur = w
        if cur:
            linesv.append(cur)
        if not linesv:
            linesv = ["-"]
        ensure(20 + (len(linesv) - 1) * 13)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColorRGB(*GREY)
        c.drawString(LABEL_X, y, label)
        c.setFont("Helvetica", 10)
        c.setFillColorRGB(*DARK)
        for i, lv in enumerate(linesv):
            c.drawString(VALUE_X, y, lv)
            if i < len(linesv) - 1:
                y -= 13
        # subtle row divider
        c.setStrokeColorRGB(0.93, 0.93, 0.95); c.setLineWidth(0.5)
        c.line(LABEL_X, y - 7, RIGHT, y - 7)
        y -= 18

    # ---- Header band (page 1) ----
    c.setFillColorRGB(*ORANGE)
    c.rect(0, H - 92, W, 92, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(LEFT, H - 48, "MAXENERGY FITNESS")
    c.setFont("Helvetica", 11)
    c.drawString(LEFT, H - 66, "Membership Registration Form")
    c.setFont("Helvetica", 8.5)
    c.drawString(LEFT, H - 81, "Shop 38 Campus Village Shopping Centre, Smithfield QLD 4878  ·  Ph 07 4057 9005  ·  ABN 81 213 163 833")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(RIGHT, H - 45, f"Form No. {ref_no}")
    if submitted:
        c.setFont("Helvetica", 9)
        c.drawRightString(RIGHT, H - 61, f"Submitted: {submitted}")

    section("Membership")
    field("Type", d.get("membership_type", "-"))
    _pd = plan.get("price_display")
    field("Plan", f"{plan.get('name')}" + (f" (${_pd})" if _pd else ""))
    field("Category", doc.get("category", "-"))
    field("Term", d.get("term", "-"))
    field("Submitted", submitted or "-")

    section("Member Details")
    field("Name", doc.get("full_name"))
    field("Title / Sex", f"{d.get('title','-')} / {d.get('sex','-')}")
    field("Date of birth", d.get("dob", "-"))
    field("Email", doc.get("email"))
    field("Mobile", doc.get("phone"))
    field("Address", ", ".join([x for x in [d.get("address"), d.get("suburb"), d.get("postcode")] if x]) or "-")
    field("Emergency contact", f"{d.get('emergency_name','-')}  ·  {d.get('emergency_phone','-')}")
    field("Marketing consent", "Yes" if d.get("consent_marketing") else "No")
    field("How found", d.get("how_found", "-"))

    section("Medical")
    flags = []
    for g in ("medications", "conditions"):
        obj = med.get(g) or {}
        flags += [k for k, v in obj.items() if v]
    field("Declared flags", ", ".join(flags) if flags else "None")
    field("Smoker", "Yes" if med.get("smoke") else "No")
    field("Major operations/fractures", "Yes" if med.get("operations") else "No")
    field("Pregnant / recent baby", "Yes" if med.get("pregnant") else "No")
    field("Exercises regularly", "Yes" if med.get("regular_exercise") else "No")
    if med.get("notes"):
        field("Notes", med.get("notes"))

    section("Consent & Waiver")
    field("Media consent", "Yes" if d.get("media_consent") else "No")
    field("Terms & Conditions agreed", "Yes" if d.get("waiver_agreed") else "No")

    # ---- Photo & Signature (side by side, tidy) ----
    ensure(180)
    section("Photo & Signature")
    block_top = y
    col_gap = 24
    photo_w = 120
    sig_x = LEFT + photo_w + col_gap
    sig_w = RIGHT - sig_x
    box_h = 120

    # labels
    c.setFont("Helvetica-Bold", 9); c.setFillColorRGB(*GREY)
    c.drawString(LEFT, block_top, "MEMBER PHOTO")
    c.drawString(sig_x, block_top, "SIGNATURE")
    top = block_top - 8

    # photo box (left)
    c.setStrokeColorRGB(*LINE); c.setLineWidth(1)
    c.roundRect(LEFT, top - box_h, photo_w, box_h, 5, fill=0, stroke=1)
    photo = d.get("photo_base64")
    if photo and "," in photo:
        try:
            img = base64.b64decode(photo.split(",", 1)[1])
            c.drawImage(ImageReader(io.BytesIO(img)), LEFT + 4, top - box_h + 4, width=photo_w - 8, height=box_h - 8, preserveAspectRatio=True, mask="auto")
        except Exception as e:
            log.error(f"pdf photo: {e}")

    # signature box (right)
    c.setStrokeColorRGB(*LINE); c.setLineWidth(1)
    c.roundRect(sig_x, top - box_h, sig_w, box_h, 5, fill=0, stroke=1)
    sig = d.get("signature_path")
    if sig:
        try:
            pts = []
            for tok in sig.replace("M", " M").replace("L", " L").split():
                if tok and tok[0] in "ML" and "," in tok[1:]:
                    xs, ys = tok[1:].split(",")
                    pts.append((float(xs), float(ys), tok[0]))
            if pts:
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
                sw = max(maxx - minx, 1); sh = max(maxy - miny, 1)
                pad = 12
                draw_w, draw_h = sig_w - pad * 2, box_h - 40
                scale = min(draw_w / sw, draw_h / sh)
                bx, by = sig_x + pad, top - box_h + 28
                c.setStrokeColorRGB(0.08, 0.08, 0.10); c.setLineWidth(1.6)
                prev = None
                for (px, py, cmd) in pts:
                    X = bx + (px - minx) * scale
                    Y = by + (draw_h - (py - miny) * scale)
                    if cmd == "M" or prev is None:
                        prev = (X, Y)
                    else:
                        c.line(prev[0], prev[1], X, Y)
                        prev = (X, Y)
        except Exception as e:
            log.error(f"pdf sig: {e}")

    # signed-by name + date under the signature box
    c.setFont("Helvetica", 9); c.setFillColorRGB(*DARK)
    c.drawString(sig_x, top - box_h - 14, f"Signed: {d.get('signature','-')}")
    if submitted:
        c.drawRightString(RIGHT, top - box_h - 14, f"Date: {submitted}")
    y = top - box_h - 30

    # ---- Terms & Conditions (full copy appended to the signed form) ----
    def _wrap(text, font, size, max_w):
        words = text.split()
        out, cur = [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if c.stringWidth(trial, font, size) <= max_w:
                cur = trial
            else:
                if cur:
                    out.append(cur)
                cur = w
        if cur:
            out.append(cur)
        return out or [""]

    page_break(H - 50)  # terms start on a fresh page
    c.setFillColorRGB(*ORANGE); c.setFont("Helvetica-Bold", 16)
    c.drawString(LEFT, y, "Membership Terms & Conditions"); y -= 20
    c.setFillColorRGB(0.4, 0.4, 0.4); c.setFont("Helvetica", 9)
    c.drawString(LEFT, y, "Maxenergy Fitness Policies & Terms Agreement"); y -= 20

    def _para(idx, title, body):
        nonlocal y
        if y < 96:
            page_break(H - 50)
        c.setFont("Helvetica-Bold", 11); c.setFillColorRGB(*DARK)
        for tl in _wrap(f"{idx}. {title}", "Helvetica-Bold", 11, RIGHT - LEFT):
            if y < 72:
                page_break(H - 50)
                c.setFont("Helvetica-Bold", 11); c.setFillColorRGB(*DARK)
            c.drawString(LEFT, y, tl); y -= 14
        c.setFont("Helvetica", 9); c.setFillColorRGB(0.25, 0.25, 0.25)
        for seg in body.split("\n"):
            for bl in _wrap(seg, "Helvetica", 9, RIGHT - LEFT):
                if y < 58:
                    page_break(H - 50)
                    c.setFont("Helvetica", 9); c.setFillColorRGB(0.25, 0.25, 0.25)
                c.drawString(LEFT, y, bl); y -= 12
        y -= 10

    for i, (_t, _b) in enumerate(MEMBERSHIP_TERMS_TC, start=1):
        _para(i, _t, _b)

    if y < 96:
        page_break(H - 50)
    c.setFont("Helvetica-Oblique", 9); c.setFillColorRGB(*DARK)
    for bl in _wrap(TERMS_DECLARATION_TC, "Helvetica-Oblique", 9, RIGHT - LEFT):
        if y < 58:
            page_break(H - 50)
            c.setFont("Helvetica-Oblique", 9); c.setFillColorRGB(*DARK)
        c.drawString(LEFT, y, bl); y -= 12
    y -= 8
    c.setFont("Helvetica-Bold", 9); c.setFillColorRGB(*ORANGE)
    _acc = f"Accepted by {doc.get('full_name','the member')} on {submitted}".strip()
    c.drawString(LEFT, y, _acc)

    draw_footer()
    c.save()
    return buf.getvalue()


@api.post("/membership/apply")
async def membership_apply(body: MembershipApplyReq, request: Request, u: dict = Depends(require_user)):
    plan = await db.membership_plans.find_one({"plan_id": body.plan_id}, {"_id": 0})
    plan_name = plan["name"] if plan else "New Membership Form"
    app_id = new_id("app")
    doc = {
        "application_id": app_id,
        "user_id": u["user_id"],
        "full_name": body.full_name,
        "email": u["email"],
        "phone": body.phone,
        "plan_id": body.plan_id,
        "plan_name": plan_name,
        "category": body.category,
        "experience": body.experience,
        "message": body.message,
        "details": body.details or {},
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.membership_applications.insert_one(doc)
    # Mark this member as having completed the membership form (remembered forever).
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"membership_form_completed_at": now_utc(), "membership_form_application_id": app_id}},
    )
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": u["user_id"],
            "title": "Membership application received",
            "body": f"We've received your application for {plan_name}. Our team will be in touch soon.",
            "type": "membership",
            "read": False,
            "created_at": now_utc(),
        }
    )
    # notify gym
    def _row(k, v):
        return f"<p style='margin:0 0 8px;color:#333;font-size:15px'><strong>{k}:</strong> {v}</p>"

    details = body.details or {}
    details_html = ""
    if details:
        for section_key in ["membership_type", "term", "membership_types", "how_found", "referred_by"]:
            if details.get(section_key):
                val = details[section_key]
                if isinstance(val, list):
                    val = ", ".join(val)
                details_html += _row(section_key.replace("_", " ").title(), val)
        med = details.get("medical") or {}
        flagged = []
        for group in ["medications", "conditions"]:
            g = med.get(group) or {}
            flagged += [k for k, v in g.items() if v]
        if flagged:
            details_html += _row("Medical flags", ", ".join(flagged))
        if med.get("notes"):
            details_html += _row("Medical notes", med["notes"])
        details_html += _row("Media consent", "Yes" if details.get("media_consent") else "No")
        details_html += _row("Waiver agreed", "Yes" if details.get("waiver_agreed") else "No")

    gym_html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff">
      <div style="background:#FF7A00;padding:20px 24px;border-radius:10px 10px 0 0">
        <h1 style="color:#ffffff;margin:0;font-size:20px">New membership application</h1>
      </div>
      <div style="padding:24px;background:#ffffff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;color:#333;font-size:15px;line-height:1.5">
        <p style="margin:0 0 8px;color:#333"><strong>Name:</strong> {body.full_name}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Email:</strong> {u['email']}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Phone:</strong> {body.phone}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Plan:</strong> {plan_name}{f" (${plan['price_display']})" if plan else ""}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Category:</strong> {body.category}</p>
        {details_html}
        <!--PDFSLOT-->
        <p style="margin:18px 0 0;color:#999;font-size:12px">Maxenergy Fitness · Smithfield QLD</p>
      </div>
    </div>
    """
    # Generate a PDF copy of the completed membership form
    pdf_link = ""
    try:
        pdf_bytes = build_membership_pdf(doc, plan or {"name": plan_name, "price_display": ""})
        pdf_b64 = base64.b64encode(pdf_bytes).decode()
        safe_name = "".join(ch for ch in body.full_name if ch.isalnum() or ch in (" ", "-", "_")).strip().replace(" ", "_") or "member"
        filename = f"Maxenergy_Membership_{safe_name}.pdf"
        await db.membership_applications.update_one(
            {"application_id": app_id}, {"$set": {"pdf_base64": pdf_b64, "pdf_filename": filename}}
        )
        base = _public_base(request)
        if base:
            pdf_link = f"{base}/api/membership/forms/{app_id}.pdf?t={sign_dl_token('form', app_id)}"
    except Exception as e:
        log.error(f"membership pdf failed: {e}")

    gym_pdf_html = _download_button(pdf_link, "Download the completed membership form (PDF)") if pdf_link else ""
    gym_html = gym_html.replace("<!--PDFSLOT-->", gym_pdf_html, 1)
    await send_email(GYM_ADMIN_EMAIL, f"New membership application – {body.full_name}", gym_html)
    # in-app alert to every admin (tappable -> Admin Applications). Email already sent above.
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1}).to_list(100)
    for a in admins:
        await create_notification(
            a["user_id"],
            "New membership application",
            f"{body.full_name} applied for {plan_name}. Tap to review.",
            "application",
            data={"nav": "admin_applications"},
        )
    # confirmation to applicant (with a link to download a copy of their completed form)
    conf_html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff">
      <div style="background:#FF7A00;padding:20px 24px;border-radius:10px 10px 0 0">
        <h1 style="color:#ffffff;margin:0;font-size:20px">Your membership form</h1>
      </div>
      <div style="padding:24px;background:#ffffff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;color:#333;font-size:15px;line-height:1.5">
        <p style="margin:0 0 12px;color:#333">Hi {body.full_name}, thanks for completing the <strong>{plan_name}</strong> membership form at Maxenergy Fitness.</p>
        <p style="margin:0 0 4px;color:#333">You can download a PDF copy of your completed membership form using the button below. Our team will review it and be in touch shortly.</p>
        {_download_button(pdf_link, "Download my membership form (PDF)") if pdf_link else "<p style='color:#333'>Your completed form is saved to your account.</p>"}
        {_membership_terms_html()}
        <p style="margin:20px 0 0;color:#999;font-size:12px">Maxenergy Fitness · Smithfield QLD</p>
      </div>
    </div>
    """
    await send_email(u["email"], "Your Max Energy membership form & terms (copy)", conf_html)
    doc.pop("_id", None)
    return {"application": doc}


@api.get("/membership/forms/{application_id}.pdf")
async def download_membership_pdf(application_id: str, t: Optional[str] = None, authorization: Optional[str] = Header(None)):
    # Access requires a valid signed link token, OR the owner/admin via bearer auth.
    authorized = verify_dl_token(t, "form", application_id)
    if not authorized:
        u = await get_user_by_token(authorization)
        if u:
            doc0 = await db.membership_applications.find_one({"application_id": application_id}, {"_id": 0, "user_id": 1})
            authorized = bool(u.get("is_admin")) or (doc0 and doc0.get("user_id") == u["user_id"])
    if not authorized:
        raise HTTPException(403, "Not authorised to view this form")
    doc = await db.membership_applications.find_one(
        {"application_id": application_id}, {"_id": 0, "pdf_base64": 1, "pdf_filename": 1}
    )
    if not doc or not doc.get("pdf_base64"):
        raise HTTPException(404, "Membership form not found")
    try:
        pdf_bytes = base64.b64decode(doc["pdf_base64"])
    except Exception:
        raise HTTPException(500, "Could not read form")
    filename = doc.get("pdf_filename") or "membership_form.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@api.get("/membership/forms/{application_id}/url")
async def membership_form_url(application_id: str, request: Request, u: dict = Depends(require_user)):
    """Return a tokenised, openable PDF URL for the owner or an admin."""
    doc = await db.membership_applications.find_one({"application_id": application_id}, {"_id": 0, "user_id": 1, "pdf_base64": 1})
    if not doc or not doc.get("pdf_base64"):
        raise HTTPException(404, "Membership form not found")
    if not (u.get("is_admin") or doc.get("user_id") == u["user_id"]):
        raise HTTPException(403, "Not authorised to view this form")
    base = _public_base(request) or ""
    return {"url": f"{base}/api/membership/forms/{application_id}.pdf?t={sign_dl_token('form', application_id)}"}



@api.get("/membership/applications/me")
async def my_applications(u: dict = Depends(require_user)):
    rows = await db.membership_applications.find(
        {"user_id": u["user_id"]}, {"_id": 0, "pdf_base64": 0}
    ).sort("created_at", -1).to_list(50)
    return {"applications": rows}


# -------------------- free trials --------------------
@api.get("/trials/me")
async def trials_me(u: dict = Depends(require_user)):
    rows = await db.free_trials.find({"user_id": u["user_id"]}, {"_id": 0}).to_list(20)
    return {"trials": rows, "claimed": [r["category"] for r in rows]}


@api.post("/trials/claim")
async def trials_claim(body: TrialClaimReq, u: dict = Depends(require_user)):
    category = body.category
    if category not in ("Kids", "Adults"):
        raise HTTPException(400, "Invalid category")
    child_name = (body.child_name or "").strip()
    child_age = (body.child_age or "").strip()
    attendee_name = (body.attendee_name or "").strip()
    preferred_day = (body.preferred_day or "").strip()
    ADULT_DAYS = ("Muay Thai - Monday", "Muay Thai - Wednesday", "Kickboxing - Tuesday", "Kickboxing - Thursday")
    if category == "Kids":
        preferred_day = preferred_day.title()
        if not child_name:
            raise HTTPException(400, "Please enter the child's name.")
        if not child_age:
            raise HTTPException(400, "Please enter the child's age.")
        if preferred_day not in ("Monday", "Wednesday"):
            raise HTTPException(400, "Please choose Monday or Wednesday for the trial.")
    else:  # Adults
        if not attendee_name:
            raise HTTPException(400, "Please enter your name.")
        if preferred_day not in ADULT_DAYS:
            raise HTTPException(400, "Please choose a class and day for the trial.")
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
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": u["user_id"],
            "title": f"{category} free trial claimed 🎉",
            "body": (
                f"{child_name}'s free Kids trial is booked for {preferred_day}. Show this at the front desk — see you on the mats!"
                if category == "Kids" else
                f"Your free trial ({preferred_day}, 6:00pm) is booked in. Show this at the front desk — we'll see you on the mats!"
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
            f"<b>Trial day:</b> {preferred_day}, 5:00–5:45pm",
        ]
    else:
        member_lines += [
            f"<b>Name:</b> {attendee_name}",
            f"<b>Class:</b> {preferred_day}",
            "<b>Start time:</b> 6:00pm",
        ]
    member_lines += [
        f"<b>Trial reference:</b> {trial['trial_id']}",
        f"<b>Location:</b> {GYM_INFO['address']}",
        f"<b>Phone:</b> {GYM_INFO['phone']}",
        "<b>What to bring:</b> comfortable workout clothes, a water bottle and a towel. Gloves can be borrowed at the gym.",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        "Just turn up on your chosen day and mention your free trial at the front desk. See you on the mats! 🥊",
    ]
    await send_email(u["email"], f"Your free {category} trial at Max Energy 🎉", _email_shell(f"Your free {category} trial is confirmed!", member_lines))

    admin_lines = [f"<b>{mname}</b> ({u['email']}) claimed a free <b>{category}</b> trial."]
    if category == "Kids":
        admin_lines += [
            f"<b>Child's name:</b> {child_name}",
            f"<b>Age:</b> {child_age}",
            f"<b>Preferred day:</b> {preferred_day}",
        ]
    else:
        admin_lines += [
            f"<b>Name:</b> {attendee_name}",
            f"<b>Class:</b> {preferred_day}, 6:00pm",
        ]
    admin_lines += [
        f"Claimed: {now_utc().strftime('%A %d %B %Y')}",
        "You can view all members and trial claims in the app: Admin → Members.",
    ]
    admin_body = (
        f"{child_name} (age {child_age}) — Kids trial on {preferred_day}. Parent: {mname} ({u['email']})."
        if category == "Kids" else
        f"{attendee_name} — Adults trial: {preferred_day}, 6:00pm ({u['email']})."
    )
    await notify_admins(f"New free {category} trial claimed", admin_body, "trial", email_lines=admin_lines)
    trial.pop("_id", None)
    return {"trial": trial}


# -------------------- notifications --------------------
@api.get("/notifications")
async def notifications_list(u: dict = Depends(require_user)):
    rows = await db.notifications.find(
        {"user_id": u["user_id"], "cleared": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"notifications": rows}


@api.get("/notifications/history")
async def notifications_history(u: dict = Depends(require_user)):
    # Full saved log — includes notifications the member has cleared.
    rows = await db.notifications.find(
        {"user_id": u["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"notifications": rows}


@api.get("/notifications/unread")
async def notifications_unread(u: dict = Depends(require_user)):
    count = await db.notifications.count_documents(
        {"user_id": u["user_id"], "read": {"$ne": True}, "cleared": {"$ne": True}}
    )
    return {"count": count}


@api.post("/notifications/read-all")
async def notifications_read_all(u: dict = Depends(require_user)):
    await db.notifications.update_many({"user_id": u["user_id"], "read": {"$ne": True}}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/clear-all")
async def notifications_clear_all(u: dict = Depends(require_user)):
    # Soft-clear: remove from the active list but keep in the saved history/log.
    res = await db.notifications.update_many(
        {"user_id": u["user_id"], "cleared": {"$ne": True}},
        {"$set": {"cleared": True, "read": True, "cleared_at": now_utc()}},
    )
    return {"ok": True, "cleared": res.modified_count}


@api.post("/notifications/{nid}/read")
async def notifications_read(nid: str, u: dict = Depends(require_user)):
    await db.notifications.update_one({"notification_id": nid, "user_id": u["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.delete("/notifications/{nid}")
async def notifications_delete(nid: str, u: dict = Depends(require_user)):
    # Soft-clear so the notification stays in the member's saved history/log.
    await db.notifications.update_one(
        {"notification_id": nid, "user_id": u["user_id"]},
        {"$set": {"cleared": True, "read": True, "cleared_at": now_utc()}},
    )
    return {"ok": True}


# -------------------- admin --------------------
@api.get("/admin/overview")
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
    return {"classes": classes, "applications": apps, "pending_applications": pending, "announcements": ann, "members": members, "pending_bookings": pending_bookings, "session_requests": session_requests, "trials": trials, "unread_messages": unread_messages, "refunds_pending": refunds_pending}


@api.get("/admin/classes")
async def admin_classes(u: dict = Depends(require_admin)):
    rows = await db.classes.find({}, {"_id": 0}).sort("start_at", 1).to_list(1000)
    return {"classes": rows}


def _parse_dt(s: str) -> datetime:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        raise HTTPException(400, "Invalid start_at datetime")


@api.post("/admin/classes")
async def admin_class_create(body: ClassUpsert, u: dict = Depends(require_admin)):
    by_appt = bool(body.by_appointment)
    doc = {
        "class_id": new_id("cls"),
        "name": body.name,
        "trainer": body.trainer,
        "category": body.category,
        "level": body.level,
        "duration_min": body.duration_min,
        "price_cents": body.price_cents,
        "currency": "aud",
        "image": body.image or DEFAULT_CLASS_IMAGE,
        "description": body.description or "",
        "color": "#FF7A00",
        "start_at": _parse_dt(body.start_at) if body.start_at else now_utc(),
        "capacity": 1 if by_appt else body.capacity,
        "by_appointment": by_appt,
        "created_at": now_utc(),
    }
    await db.classes.insert_one(doc)
    doc.pop("_id", None)
    return {"class": doc}


@api.put("/admin/classes/{class_id}")
async def admin_class_update(class_id: str, body: ClassUpsert, u: dict = Depends(require_admin)):
    upd = {
        "name": body.name,
        "trainer": body.trainer,
        "category": body.category,
        "level": body.level,
        "duration_min": body.duration_min,
        "price_cents": body.price_cents,
    }
    if body.by_appointment is not None:
        upd["by_appointment"] = bool(body.by_appointment)
        if body.by_appointment:
            upd["capacity"] = 1
    if not body.by_appointment:
        # Only fixed-time classes carry a schedule slot / capacity.
        if body.start_at:
            upd["start_at"] = _parse_dt(body.start_at)
        upd["capacity"] = body.capacity
    if body.image:
        upd["image"] = body.image
    if body.description is not None:
        upd["description"] = body.description
    r = await db.classes.update_one({"class_id": class_id}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Class not found")
    c = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    return {"class": c}


@api.delete("/admin/classes/{class_id}")
async def admin_class_delete(class_id: str, u: dict = Depends(require_admin)):
    await db.classes.delete_one({"class_id": class_id})
    return {"ok": True}


def _fmt_class_when(c: dict) -> str:
    if c.get("by_appointment"):
        return ""
    s = c.get("start_at")
    if isinstance(s, datetime):
        local = s.replace(tzinfo=None) if s.tzinfo else s
        return " on " + local.strftime("%a %d %b at %I:%M %p").replace(" 0", " ")
    return ""


class ClassCancelReq(BaseModel):
    reason: Optional[str] = None
    auto_return_passes: Optional[bool] = True


@api.post("/admin/classes/{class_id}/cancel")
async def admin_class_cancel(class_id: str, body: ClassCancelReq, u: dict = Depends(require_admin)):
    c = await db.classes.find_one({"class_id": class_id})
    if not c:
        raise HTTPException(404, "Class not found")
    reason = (body.reason or "").strip()
    auto_pass = body.auto_return_passes is not False
    await db.classes.update_one(
        {"class_id": class_id},
        {"$set": {"cancelled": True, "cancelled_at": now_utc(), "cancel_reason": reason, "cancelled_by": u["user_id"]}},
    )
    when = _fmt_class_when(c)
    # Find a similar upcoming class (same name, still open) to suggest for rebooking.
    similar = await db.classes.find_one(
        {
            "class_id": {"$ne": class_id},
            "name": c.get("name"),
            "cancelled": {"$ne": True},
            "$or": [{"by_appointment": True}, {"start_at": {"$gt": now_utc()}}],
        },
        {"_id": 0},
        sort=[("start_at", 1)],
    )
    similar_when = _fmt_class_when(similar) if similar else ""
    # Cancel every active booking for this class and notify each member.
    active = await db.bookings.find(
        {"class_id": class_id, "status": {"$in": ["paid", "confirmed", "pending", "reschedule_requested"]}}
    ).to_list(1000)
    notified = 0
    refunds_flagged = 0
    passes_returned = 0
    for b in active:
        upd = {"status": "cancelled", "cancelled_at": now_utc(), "cancelled_by": "admin_class_cancel"}
        paid = b.get("status") == "paid"
        pass_auto_returned = False
        if paid and b.get("paid_with_pass") and auto_pass:
            # Return the class pass right away.
            fresh = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0, "class_pass_credits": 1})
            left = int((fresh or {}).get("class_pass_credits", 0)) + 1
            await db.users.update_one({"user_id": b["user_id"]}, {"$set": {"class_pass_credits": left}})
            await db.pass_ledger.insert_one({
                "pass_ledger_id": new_id("pl"), "user_id": b["user_id"], "delta": 1,
                "reason": f"Pass returned — {c['name']} cancelled", "balance_after": left,
                "created_at": now_utc(),
            })
            upd["refund_status"] = "pass_returned"
            upd["refund_amount_cents"] = int(b.get("amount", 0))
            upd["refund_flagged_at"] = now_utc()
            upd["refund_resolved_at"] = now_utc()
            upd["refund_method"] = "class_pass"
            passes_returned += 1
            pass_auto_returned = True
        elif paid:
            upd["refund_status"] = "pending"
            upd["refund_amount_cents"] = int(b.get("amount", 0))
            upd["refund_flagged_at"] = now_utc()
            refunds_flagged += 1
        await db.bookings.update_one({"booking_id": b["booking_id"]}, {"$set": upd})
        member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0, "email": 1})
        body_msg = f"Your {c['name']} class{when} has been cancelled by the gym."
        lines = [f"Your <b>{c['name']}</b> class{when} has been <b>cancelled</b> by the gym."]
        if reason:
            body_msg += f" Reason: {reason}"
            lines.append(f"Reason: {reason}")
        if pass_auto_returned:
            body_msg += " Your class pass has been returned to your account."
            lines.append("Good news — your <b>class pass has been returned</b> to your account, ready to use again.")
        elif paid:
            lines.append("You've been flagged for a refund or account credit — the gym will process this shortly.")
        lines.append("Sorry for any inconvenience — we hope to see you in another session soon!")
        notif_data = None
        if similar:
            body_msg += f" Tap to rebook the next {c['name']} class{similar_when}."
            lines.append(f"👉 <b>Rebook the next {c['name']} class</b>{similar_when} — tap the alert in the app to grab your spot.")
            notif_data = {"nav": "class_detail", "class_id": similar["class_id"]}
        await notify_user(
            b["user_id"], (member or {}).get("email"),
            "Class cancelled", body_msg, "booking", email_lines=lines, data=notif_data,
        )
        notified += 1
    return {"ok": True, "cancelled": True, "notified": notified, "refunds_flagged": refunds_flagged, "passes_returned": passes_returned}


@api.post("/admin/classes/{class_id}/restore")
async def admin_class_restore(class_id: str, u: dict = Depends(require_admin)):
    r = await db.classes.update_one(
        {"class_id": class_id},
        {"$set": {"cancelled": False}, "$unset": {"cancelled_at": "", "cancel_reason": "", "cancelled_by": ""}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Class not found")
    c = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    return {"ok": True, "class": c}


@api.get("/admin/refunds")
async def admin_refunds(u: dict = Depends(require_admin)):
    """Members owed a refund/credit after a class cancellation."""
    rows = await db.bookings.find(
        {"refund_status": {"$in": ["pending", "credited", "refunded", "pass_returned"]}}, {"_id": 0}
    ).sort("refund_flagged_at", -1).to_list(500)
    out = []
    for b in rows:
        m = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0, "name": 1, "email": 1, "mobile": 1, "phone": 1})
        out.append({
            "booking_id": b["booking_id"],
            "class_name": b.get("class_name"),
            "member_name": (m or {}).get("name") or (m or {}).get("email"),
            "member_email": (m or {}).get("email"),
            "member_mobile": (m or {}).get("mobile") or (m or {}).get("phone"),
            "amount_cents": int(b.get("refund_amount_cents", b.get("amount", 0))),
            "currency": (b.get("currency") or "aud").upper(),
            "refund_status": b.get("refund_status"),
            "paid_with_pass": bool(b.get("paid_with_pass")),
            "flagged_at": b.get("refund_flagged_at").isoformat() if isinstance(b.get("refund_flagged_at"), datetime) else b.get("refund_flagged_at"),
        })
    pending_total = sum(r["amount_cents"] for r in out if r["refund_status"] == "pending" and not r["paid_with_pass"])
    return {"refunds": out, "pending_total_cents": pending_total}


class RefundResolveReq(BaseModel):
    method: str  # "credit" | "refunded" | "class_pass"


@api.post("/admin/refunds/{booking_id}/resolve")
async def admin_refund_resolve(booking_id: str, body: RefundResolveReq, u: dict = Depends(require_admin)):
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("refund_status") != "pending":
        raise HTTPException(409, "This refund is already resolved.")
    amount = int(b.get("refund_amount_cents", b.get("amount", 0)))
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    if body.method == "credit":
        await db.users.update_one({"user_id": b["user_id"]}, {"$inc": {"credit_cents": amount}})
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"refund_status": "credited", "refund_resolved_at": now_utc(), "refund_method": "credit"}},
        )
        await db.credit_ledger.insert_one({
            "ledger_id": new_id("cl"), "user_id": b["user_id"], "delta_cents": amount,
            "reason": f"Credit for cancelled {b.get('class_name')}", "booking_id": booking_id, "created_at": now_utc(),
        })
        await notify_user(
            b["user_id"], (member or {}).get("email"),
            "Account credit added",
            f"We've added ${amount/100:.2f} credit to your account for the cancelled {b.get('class_name')} class. Use it toward your next booking!",
            "booking",
            email_lines=[
                f"We've added <b>${amount/100:.2f}</b> in account credit for your cancelled <b>{b.get('class_name')}</b> class.",
                "You can use this credit toward any future class booking in the app.",
            ],
        )
    elif body.method == "refunded":
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"refund_status": "refunded", "refund_resolved_at": now_utc(), "refund_method": "refunded"}},
        )
        await notify_user(
            b["user_id"], (member or {}).get("email"),
            "Refund processed",
            f"Your refund of ${amount/100:.2f} for the cancelled {b.get('class_name')} class has been processed.",
            "booking",
            email_lines=[f"Your refund of <b>${amount/100:.2f}</b> for the cancelled <b>{b.get('class_name')}</b> class has been processed."],
        )
    elif body.method == "class_pass":
        fresh = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0, "class_pass_credits": 1})
        left = int((fresh or {}).get("class_pass_credits", 0)) + 1
        await db.users.update_one({"user_id": b["user_id"]}, {"$set": {"class_pass_credits": left}})
        await db.pass_ledger.insert_one({
            "pass_ledger_id": new_id("pl"), "user_id": b["user_id"], "delta": 1,
            "reason": f"Pass returned — {b.get('class_name')} cancelled", "balance_after": left,
            "created_at": now_utc(),
        })
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"refund_status": "pass_returned", "refund_resolved_at": now_utc(), "refund_method": "class_pass"}},
        )
        await notify_user(
            b["user_id"], (member or {}).get("email"),
            "Class pass returned",
            f"We've added your class pass back for the cancelled {b.get('class_name')} class. You now have {left} pass{'es' if left != 1 else ''}.",
            "booking",
            email_lines=[
                f"We've returned <b>1 class pass</b> for your cancelled <b>{b.get('class_name')}</b> class.",
                f"You now have <b>{left}</b> class pass{'es' if left != 1 else ''} ready to use.",
            ],
            data={"nav": "member_store"},
        )
    else:
        raise HTTPException(400, "Invalid method")
    return {"ok": True, "refund_status": body.method if body.method != "refunded" else "refunded"}


@api.post("/admin/announcements")
async def admin_announcement_create(body: AnnouncementCreate, u: dict = Depends(require_admin)):
    doc = {
        "announcement_id": new_id("ann"),
        "title": body.title,
        "body": body.body,
        "pinned": body.pinned,
        "author": u.get("name") or "Max Energy",
        "created_at": now_utc(),
    }
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)
    return {"announcement": doc}


@api.delete("/admin/announcements/{announcement_id}")
async def admin_announcement_delete(announcement_id: str, u: dict = Depends(require_admin)):
    await db.announcements.delete_one({"announcement_id": announcement_id})
    return {"ok": True}


@api.put("/admin/announcements/{announcement_id}")
async def admin_announcement_update(announcement_id: str, body: AnnouncementUpdate, u: dict = Depends(require_admin)):
    r = await db.announcements.update_one(
        {"announcement_id": announcement_id},
        {"$set": {"title": body.title, "body": body.body, "pinned": body.pinned}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Announcement not found")
    a = await db.announcements.find_one({"announcement_id": announcement_id}, {"_id": 0})
    return {"announcement": a}


@api.get("/admin/applications")
async def admin_applications(u: dict = Depends(require_admin)):
    # Exclude the heavy pdf_base64 blob from the list; expose a has_pdf flag instead.
    # Admins view the exact same PDF via /api/membership/forms/{id}.pdf (same link emailed).
    rows = await db.membership_applications.find(
        {}, {"_id": 0, "pdf_base64": 0}
    ).sort("created_at", -1).to_list(500)
    for r in rows:
        r["has_pdf"] = bool(r.get("pdf_filename"))
    return {"applications": rows}


async def _build_members_list() -> list:
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    trials = await db.free_trials.find({}, {"_id": 0}).to_list(5000)
    apps = await db.membership_applications.find({}, {"_id": 0}).to_list(5000)
    bookings = await db.bookings.find({}, {"_id": 0, "user_id": 1, "status": 1}).to_list(5000)

    trials_by_user: dict = {}
    trial_details_by_user: dict = {}
    for t in trials:
        trials_by_user.setdefault(t["user_id"], []).append(t.get("category"))
        trial_details_by_user.setdefault(t["user_id"], []).append({
            "category": t.get("category"),
            "child_name": t.get("child_name"),
            "child_age": t.get("child_age"),
            "preferred_day": t.get("preferred_day"),
        })
    apps_by_user: dict = {}
    phone_by_user: dict = {}
    for a in apps:
        apps_by_user.setdefault(a["user_id"], []).append(a.get("status"))
        if a.get("phone") and a["user_id"] not in phone_by_user:
            phone_by_user[a["user_id"]] = a.get("phone")
    bookings_count: dict = {}
    for b in bookings:
        if b.get("status") in ("paid", "confirmed"):
            bookings_count[b["user_id"]] = bookings_count.get(b["user_id"], 0) + 1

    members = []
    for m in users:
        uid = m["user_id"]
        statuses = apps_by_user.get(uid, [])
        members.append({
            "user_id": uid,
            "name": m.get("name"),
            "email": m.get("email"),
            "phone": phone_by_user.get(uid),
            "is_admin": bool(m.get("is_admin")),
            "provider": m.get("provider", "password"),
            "created_at": m.get("created_at"),
            "trials": trials_by_user.get(uid, []),
            "trial_details": trial_details_by_user.get(uid, []),
            "is_member": "approved" in statuses,
            "application_status": ("approved" if "approved" in statuses else ("pending" if "pending" in statuses else (statuses[0] if statuses else None))),
            "active_bookings": bookings_count.get(uid, 0),
            "credit_cents": int(m.get("credit_cents", 0)),
        })
    return members


@api.get("/admin/members")
async def admin_members(u: dict = Depends(require_admin)):
    members = await _build_members_list()
    trial_count = await db.free_trials.count_documents({})
    return {"members": members, "total": len(members), "trial_claims": trial_count}


class AdminCreditReq(BaseModel):
    amount_cents: int
    reason: Optional[str] = None


@api.post("/admin/members/{user_id}/credit")
async def admin_adjust_credit(user_id: str, body: AdminCreditReq, u: dict = Depends(require_admin)):
    """Add (or subtract) account credit for a member and log it."""
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(404, "Member not found")
    delta = int(body.amount_cents)
    if delta == 0:
        raise HTTPException(400, "Enter a non-zero amount.")
    current = int(target.get("credit_cents", 0))
    if current + delta < 0:
        raise HTTPException(400, "Adjustment would make the balance negative.")
    await db.users.update_one({"user_id": user_id}, {"$inc": {"credit_cents": delta}})
    reason = (body.reason or "").strip() or ("Credit added by gym" if delta > 0 else "Credit adjustment by gym")
    await db.credit_ledger.insert_one({
        "ledger_id": new_id("cl"), "user_id": user_id, "delta_cents": delta,
        "reason": reason, "created_at": now_utc(),
    })
    verb = "added to" if delta > 0 else "adjusted on"
    await notify_user(
        user_id, target.get("email"),
        "Account credit updated",
        f"${abs(delta)/100:.2f} has been {verb} your account. New balance: ${(current+delta)/100:.2f}.",
        "booking",
        email_lines=[
            f"<b>${abs(delta)/100:.2f}</b> in credit has been {verb} your Maxenergy Fitness account.",
            f"Your new balance is <b>${(current+delta)/100:.2f}</b> — use it toward any class booking.",
        ],
    )
    return {"ok": True, "user_id": user_id, "balance_cents": current + delta}


@api.post("/admin/members/export")
async def admin_members_export(request: Request, u: dict = Depends(require_admin)):
    members = await _build_members_list()
    import csv, io as _io
    buf = _io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Name", "Email", "Phone", "Signup", "Joined", "Approved Member", "Application Status", "Trials", "Child Name(s)", "Trial Day(s)", "Active Bookings"])
    for m in members:
        joined = ""
        if isinstance(m.get("created_at"), datetime):
            joined = m["created_at"].strftime("%Y-%m-%d")
        children = "; ".join([d.get("child_name") for d in m.get("trial_details", []) if d.get("child_name")])
        days = "; ".join([d.get("preferred_day") for d in m.get("trial_details", []) if d.get("preferred_day")])
        w.writerow([
            m.get("name") or "", m.get("email") or "", m.get("phone") or "",
            "Google" if m.get("provider") == "google" else "Email", joined,
            "Yes" if m.get("is_member") else "No", m.get("application_status") or "",
            ", ".join(m.get("trials", [])), children, days, m.get("active_bookings", 0),
        ])
    csv_text = buf.getvalue()
    csv_b64 = base64.b64encode(csv_text.encode("utf-8")).decode()
    export_id = new_id("exp")
    fname = f"MaxEnergy_Members_{now_utc().strftime('%Y%m%d')}.csv"
    await db.exports.insert_one({
        "export_id": export_id,
        "filename": fname,
        "csv_base64": csv_b64,
        "count": len(members),
        "created_at": now_utc(),
    })
    base = _public_base(request)
    dl_link = f"{base}/api/admin/exports/{export_id}.csv?t={sign_dl_token('export', export_id)}" if base else ""
    ok = await send_email(
        GYM_ADMIN_EMAIL,
        f"Max Energy — Members & Trials export ({len(members)})",
        _email_shell("Members & Trials Export", [
            f"Your current members & trials list is ready ({len(members)} members).",
            "Tap the button below to download the CSV, then open it in Excel, Numbers or Google Sheets.",
            _download_button(dl_link, "Download CSV") if dl_link else "",
        ]),
    )
    return {"ok": ok, "count": len(members), "sent_to": GYM_ADMIN_EMAIL, "download_url": dl_link}


@api.get("/admin/exports/{export_id}.csv")
async def download_export_csv(export_id: str, t: Optional[str] = None, authorization: Optional[str] = Header(None)):
    # Member data export — requires a valid signed link token or an admin bearer.
    authorized = verify_dl_token(t, "export", export_id)
    if not authorized:
        u = await get_user_by_token(authorization)
        authorized = bool(u and u.get("is_admin"))
    if not authorized:
        raise HTTPException(403, "Not authorised")
    doc = await db.exports.find_one({"export_id": export_id}, {"_id": 0, "csv_base64": 1, "filename": 1})
    if not doc or not doc.get("csv_base64"):
        raise HTTPException(404, "Export not found")
    csv_bytes = base64.b64decode(doc["csv_base64"])
    filename = doc.get("filename") or "export.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.post("/admin/applications/{application_id}/status")
async def admin_application_status(application_id: str, body: ApplicationStatusReq, u: dict = Depends(require_admin)):
    if body.status not in ("pending", "approved", "declined"):
        raise HTTPException(400, "Invalid status")
    app_doc = await db.membership_applications.find_one({"application_id": application_id}, {"_id": 0})
    if not app_doc:
        raise HTTPException(404, "Application not found")
    decided_at = now_utc()
    decided_by = u.get("name") or u.get("email") or "Admin"
    await db.membership_applications.update_one(
        {"application_id": application_id},
        {
            "$set": {"status": body.status, "decided_at": decided_at, "decided_by": decided_by},
            "$push": {"status_history": {"status": body.status, "at": decided_at, "by": decided_by}},
        },
    )
    member = await db.users.find_one({"user_id": app_doc["user_id"]}, {"_id": 0})
    mname = (member or {}).get("name") or app_doc.get("full_name") or "there"
    if body.status == "approved":
        await notify_user(
            app_doc["user_id"], (member or {}).get("email"),
            "Membership approved 🎉",
            f"Great news! Your {app_doc['plan_name']} application has been approved. Welcome to Max Energy!",
            "membership",
            email_lines=[
                f"Hi {mname},",
                f"Great news — your <b>{app_doc['plan_name']}</b> application has been <b>approved</b>! Welcome to the Max Energy family. 🥊",
                "You're all set to train. Check the app for the class schedule and book your sessions.",
                f"<b>Location:</b> {GYM_INFO['address']}",
                f"<b>Phone:</b> {GYM_INFO['phone']}",
                "See you on the mats!",
            ],
        )
    elif body.status == "declined":
        await notify_user(
            app_doc["user_id"], (member or {}).get("email"),
            "Membership application update",
            f"Your {app_doc['plan_name']} application was not approved at this time. Please contact us for details.",
            "membership",
            email_lines=[
                f"Hi {mname},",
                f"Thank you for your interest in Max Energy. Unfortunately your <b>{app_doc['plan_name']}</b> application was <b>not approved</b> at this time.",
                f"If you have any questions or would like to discuss this, please contact us on {GYM_INFO['phone']}.",
                "We'd love to help you find the right fit.",
            ],
        )
    else:
        await create_notification(
            app_doc["user_id"],
            "Membership status updated",
            f"Your application for {app_doc['plan_name']} is now {body.status}.",
            "membership",
        )
    return {"ok": True}


@api.get("/admin/membership-log")
async def admin_membership_log(u: dict = Depends(require_admin)):
    # Audit log of approved/declined membership decisions.
    rows = await db.membership_applications.find(
        {"status": {"$in": ["approved", "declined"]}},
        {"_id": 0, "pdf_base64": 0},
    ).sort("decided_at", -1).to_list(1000)
    for r in rows:
        r["has_pdf"] = bool(r.get("pdf_filename"))
    approved = sum(1 for r in rows if r.get("status") == "approved")
    declined = sum(1 for r in rows if r.get("status") == "declined")
    return {"log": rows, "approved": approved, "declined": declined}



@api.get("/admin/bookings")
async def admin_bookings(u: dict = Depends(require_admin)):
    rows = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # enrich with member info
    uids = list({r["user_id"] for r in rows})
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "phone": 1}).to_list(500)
    umap = {x["user_id"]: x for x in users}
    # phone often lives on the member's membership application
    phone_by_user: dict = {}
    apps = await db.membership_applications.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "phone": 1}).to_list(2000)
    for a in apps:
        if a.get("phone") and a["user_id"] not in phone_by_user:
            phone_by_user[a["user_id"]] = a.get("phone")
    for r in rows:
        m = umap.get(r["user_id"], {})
        r["booking_no"] = booking_ref_no(r.get("booking_id", ""))
        r["member_name"] = m.get("name") or m.get("email") or "Member"
        r["member_email"] = m.get("email")
        r["member_phone"] = m.get("phone") or phone_by_user.get(r["user_id"])
    return {"bookings": rows}


async def _admin_get_booking(booking_id: str) -> dict:
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


@api.post("/admin/bookings/{booking_id}/accept")
async def admin_booking_accept(booking_id: str, u: dict = Depends(require_admin)):
    b = await _admin_get_booking(booking_id)
    when = b.get("requested_time")
    upd = {"status": "confirmed", "confirmed_at": now_utc()}
    if b.get("by_appointment") and when:
        upd["scheduled_time"] = when
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": upd})
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    when_line = f" Your session is confirmed for {when}." if (b.get("by_appointment") and when) else ""
    email_lines = [f"Great news — your booking for <b>{b['class_name']}</b> has been <b>accepted</b>!"]
    if b.get("by_appointment") and when:
        email_lines.append(f"Your session is confirmed for <b>{when}</b>.")
    email_lines.append("See you at the gym. 🥊")
    await notify_user(
        b["user_id"], (member or {}).get("email"),
        "Booking accepted",
        f"Great news! Your booking for {b['class_name']} has been accepted.{when_line}",
        "booking",
        email_lines=email_lines,
    )
    return {"ok": True}


@api.post("/admin/bookings/{booking_id}/cancel")
async def admin_booking_cancel(booking_id: str, u: dict = Depends(require_admin)):
    b = await _admin_get_booking(booking_id)
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "cancelled", "cancelled_at": now_utc(), "cancelled_by": "admin"}})
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    await notify_user(
        b["user_id"], (member or {}).get("email"),
        "Booking cancelled",
        f"Your booking for {b['class_name']} has been cancelled by the gym. Please contact us if you have questions.",
        "booking",
        email_lines=[f"Your booking for <b>{b['class_name']}</b> has been cancelled by the gym.", "Please contact us on 07 4057 9005 if you have any questions."],
    )
    return {"ok": True}


@api.post("/admin/bookings/{booking_id}/reschedule")
async def admin_booking_reschedule(booking_id: str, body: AdminRescheduleReq, u: dict = Depends(require_admin)):
    b = await _admin_get_booking(booking_id)
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"status": "confirmed", "scheduled_time": body.new_time, "requested_time": None, "confirmed_at": now_utc()}},
    )
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    note_txt = f" Note: {body.note}" if body.note else ""
    await notify_user(
        b["user_id"], (member or {}).get("email"),
        "Booking rescheduled & confirmed",
        f"Your {b['class_name']} session is confirmed for: {body.new_time}.{note_txt}",
        "booking",
        email_lines=[f"Your <b>{b['class_name']}</b> session has been confirmed for:", f"<b>{body.new_time}</b>", (f"Note: {body.note}" if body.note else ""), "See you there!"],
    )
    return {"ok": True}


@api.post("/admin/bookings/{booking_id}/attendance")
async def admin_booking_attendance(booking_id: str, body: AttendanceReq, u: dict = Depends(require_admin)):
    b = await _admin_get_booking(booking_id)
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"attended": body.attended, "checked_in_at": now_utc() if body.attended else None, "checked_in_by": "admin" if body.attended else None}},
    )
    return {"ok": True, "attended": body.attended}


@api.get("/admin/attendance/report")
async def admin_attendance_report(u: dict = Depends(require_admin)):
    QLD = timedelta(hours=10)  # Queensland time (no DST)
    rows = await db.bookings.find(
        {"attended": True, "checked_in_at": {"$ne": None}},
        {"_id": 0, "class_name": 1, "checked_in_at": 1, "user_id": 1, "category": 1, "checked_in_by": 1},
    ).to_list(20000)

    def local_date(dt: datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (dt.astimezone(timezone.utc) + QLD).date()

    now_local = (now_utc() + QLD).date()
    week_start = now_local - timedelta(days=now_local.weekday())  # Monday
    month_start = now_local.replace(day=1)

    totals = {"today": 0, "week": 0, "month": 0, "all": 0}
    by_class: dict = {}
    by_member: dict = {}
    daily: dict = {}
    for r in rows:
        d = local_date(r["checked_in_at"])
        totals["all"] += 1
        if d == now_local:
            totals["today"] += 1
        if d >= week_start:
            totals["week"] += 1
        if d >= month_start:
            totals["month"] += 1
        by_class[r.get("class_name", "Class")] = by_class.get(r.get("class_name", "Class"), 0) + 1
        by_member[r["user_id"]] = by_member.get(r["user_id"], 0) + 1
        daily[d.isoformat()] = daily.get(d.isoformat(), 0) + 1

    # last 14 days series (oldest -> newest)
    series = []
    for i in range(13, -1, -1):
        day = now_local - timedelta(days=i)
        series.append({"date": day.strftime("%a %d"), "iso": day.isoformat(), "count": daily.get(day.isoformat(), 0)})

    # resolve member names
    uids = list(by_member.keys())
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(5000)
    umap = {x["user_id"]: x for x in users}
    top_members = sorted(
        [{"name": umap.get(uid, {}).get("name") or umap.get(uid, {}).get("email") or "Member",
          "email": umap.get(uid, {}).get("email"), "count": c} for uid, c in by_member.items()],
        key=lambda x: x["count"], reverse=True,
    )[:15]
    by_class_list = sorted([{"name": k, "count": v} for k, v in by_class.items()], key=lambda x: x["count"], reverse=True)

    # Detailed recent check-ins (name + class + date/time), newest first
    def local_dt(dt: datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc) + QLD

    recent_sorted = sorted(rows, key=lambda r: r["checked_in_at"], reverse=True)[:150]
    recent = []
    for r in recent_sorted:
        m = umap.get(r["user_id"], {})
        ld = local_dt(r["checked_in_at"])
        recent.append({
            "name": m.get("name") or m.get("email") or "Member",
            "email": m.get("email"),
            "class_name": r.get("class_name", "Class"),
            "date": ld.strftime("%a %d %b %Y"),
            "time": ld.strftime("%-I:%M %p"),
            "by": r.get("checked_in_by") or "member",
        })

    # Per-session roster: who attended each class (grouped by class + day), newest first.
    sessions_map: dict = {}
    for r in rows:
        ld = local_dt(r["checked_in_at"])
        day_iso = local_date(r["checked_in_at"]).isoformat()
        key = (r.get("class_name", "Class"), day_iso)
        m = umap.get(r["user_id"], {})
        sessions_map.setdefault(key, {"date_label": ld.strftime("%a %d %b %Y"), "attendees": []})
        sessions_map[key]["attendees"].append({
            "name": m.get("name") or m.get("email") or "Member",
            "email": m.get("email"),
            "time": ld.strftime("%-I:%M %p"),
            "by": r.get("checked_in_by") or "member",
        })
    sessions = []
    for (class_name, day_iso), v in sessions_map.items():
        att = sorted(v["attendees"], key=lambda a: a["time"])
        sessions.append({
            "class_name": class_name,
            "iso": day_iso,
            "date": v["date_label"],
            "count": len(att),
            "attendees": att,
        })
    sessions.sort(key=lambda s: (s["iso"], s["count"]), reverse=True)
    sessions = sessions[:80]

    return {"totals": totals, "daily": series, "by_class": by_class_list, "top_members": top_members, "recent": recent, "sessions": sessions}


@api.post("/admin/reminders/run")
async def admin_run_reminders(u: dict = Depends(require_admin)):
    sent = await send_due_reminders()
    return {"ok": True, "reminders_sent": sent}


@api.get("/")
async def root():
    return {"app": "Maxenergy Fitness API", "ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- seed --------------------
CLASS_TEMPLATES = [
    # (name, category, trainer, level, duration, price_cents, day_of_week(0=Mon), hour, image, desc, program)
    ("Muay Thai", "Kids", "Coach Alex", "Ages 6-16", 45, 1500, [0, 2], 17, "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=1200&q=80", "Kids Muay Thai Classes\n🥊 Mondays & Wednesdays | 5:00–5:45pm\nHelp your child build confidence, focus, discipline and fitness in a fun and supportive environment.\nPricing:\n• $15 casual per class\n• $300 upfront for the full 10-week term\n• Or $35/week by direct debit\n• No joining fee!\nA great way for kids to stay active, learn new skills and grow in confidence.\n\nAll fitness and experience levels welcome.", "10 Week Term"),
    ("Muay Thai", "Adults", "Coach Alex", "All levels", 60, 2500, [0, 2], 18, "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80", "Adults Muay Thai Classes\n🥊 Mondays & Wednesdays | 6:00pm\nBuild real strength, fitness and confidence in a high-energy class that welcomes all levels.\nWhat you'll do:\n• Pad work and technique drills\n• Clinch work and combinations\n• Strength and conditioning\nWhether you're training for fitness or fighting form, our coaches will meet you where you're at. No experience needed — just bring your energy!\n\nAll fitness and experience levels welcome.", ""),
    ("Boot Camp", "Boot Camp", "Coach Alex", "All levels", 60, 2500, [5], 7, "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&q=80", "Saturday Boot Camp\n💪 Saturdays | 7:00am\nKick-start your weekend with a high-energy, full-body workout combining strength, cardio and conditioning.\nWhat to expect:\n• Functional strength & circuits\n• Cardio and core\n• Scalable for every fitness level\nAll levels welcome — just bring water and your energy!", ""),
    ("Kickboxing", "Adults", "Coach Alex", "All levels", 60, 2500, [1, 3], 18, "https://images.unsplash.com/photo-1549824506-7f0f8b7f5b23?w=1200&q=80", "Kickboxing Classes\nTuesdays & Thursdays | 6:00pm\n\nBuild your fitness, improve your technique and relieve stress with our high-energy kickboxing classes. Designed for all fitness and experience levels, each session combines practical kickboxing skills with a challenging full-body workout.\nWhat you'll learn:\n• Strikes, kicks and combinations\n• Proper technique and movement\n• Cardio, fitness and conditioning\n• Strength, coordination and confidence\nWhether you're completely new to kickboxing or have previous experience, our classes provide a friendly and supportive environment where everyone is welcome.\n\nAll fitness and experience levels welcome.", ""),
]


async def seed_data():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.classes.create_index("class_id", unique=True)
        await db.events.create_index("event_id", unique=True)
        await db.bookings.create_index("booking_id", unique=True)
        await db.payment_transactions.create_index("session_id", unique=True)
        await db.announcements.create_index("announcement_id", unique=True)
        await db.membership_plans.create_index("plan_id", unique=True)
        await db.membership_applications.create_index("application_id", unique=True)
        await db.free_trials.create_index([("user_id", 1), ("category", 1)], unique=True)
        await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        log.warning(f"index warn: {e}")

    # Admin account (idempotent)
    admin = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not admin:
        await db.users.insert_one(
            {
                "user_id": new_id("user"),
                "email": ADMIN_EMAIL.lower(),
                "name": "Academy Admin",
                "password_hash": hash_pw(ADMIN_PASSWORD),
                "provider": "password",
                "picture": None,
                "is_admin": True,
                "created_at": now_utc(),
            }
        )
        log.info("seeded admin account")
    else:
        await db.users.update_one({"email": ADMIN_EMAIL.lower()}, {"$set": {"is_admin": True}})

    # Second admin (info@maxenergy.com.au) — idempotent: create if missing, promote if exists, never overwrite password
    admin2_email = ADMIN2_EMAIL.strip().lower()
    admin2 = await db.users.find_one({"email": admin2_email})
    if not admin2:
        await db.users.insert_one(
            {
                "user_id": new_id("user"),
                "email": admin2_email,
                "name": "Max Energy Admin",
                "password_hash": hash_pw(ADMIN2_PASSWORD),
                "provider": "password",
                "picture": None,
                "is_admin": True,
                "created_at": now_utc(),
            }
        )
        log.info("seeded second admin account")
    else:
        await db.users.update_one({"email": admin2_email}, {"$set": {"is_admin": True}})

    meta = await db.meta.find_one({"key": "seed_version"})
    version = meta.get("value") if meta else None

    if version != SEED_VERSION:
        # Reseed catalog collections (safe: does not touch users/bookings)
        await db.classes.delete_many({})
        await db.events.delete_many({})
        await db.announcements.delete_many({})
        await db.membership_plans.delete_many({})

        # Classes for next 21 days based on weekday templates
        base = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
        docs = []
        for day_offset in range(0, 21):
            date = base + timedelta(days=day_offset)
            weekday = date.weekday()
            for (name, category, trainer, level, dur, price, days, hour, image, desc, program) in CLASS_TEMPLATES:
                if weekday in days:
                    docs.append(
                        {
                            "class_id": new_id("cls"),
                            "name": name,
                            "category": category,
                            "trainer": trainer,
                            "level": level,
                            "duration_min": dur,
                            "price_cents": price,
                            "currency": "aud",
                            "image": image,
                            "description": desc,
                            "program": program,
                            "color": "#FF7A00",
                            "start_at": date + timedelta(hours=hour),
                            "capacity": 20,
                            "by_appointment": False,
                            "created_at": now_utc(),
                        }
                    )
        if docs:
            await db.classes.insert_many(docs)
        log.info(f"seeded {len(docs)} classes")

        # Personal Training — bookable by appointment (no fixed time)
        await db.classes.insert_one(
            {
                "class_id": new_id("cls"),
                "name": "Personal Training",
                "category": "Adults",
                "trainer": "Coach Alex",
                "level": "Any level",
                "duration_min": 60,
                "price_cents": 100,
                "currency": "aud",
                "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80",
                "description": "1-on-1 tailored coaching session with a certified trainer. Booked by appointment — we'll contact you to arrange a time that suits you.",
                "program": "",
                "color": "#FF7A00",
                "start_at": now_utc(),
                "capacity": 1,
                "by_appointment": True,
                "created_at": now_utc(),
            }
        )

        # Custom Programs — bookable by appointment (no fixed time)
        await db.classes.insert_one(
            {
                "class_id": new_id("cls"),
                "name": "Custom Programs",
                "category": "Adults",
                "trainer": "Coach Alex",
                "level": "Any level",
                "duration_min": 60,
                "price_cents": 8000,
                "currency": "aud",
                "image": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80",
                "description": "A training program built around your goals — strength, conditioning, weight loss or fight prep. Booked by appointment; we'll reach out to design your plan and arrange times that suit you.",
                "program": "",
                "color": "#FF7A00",
                "start_at": now_utc(),
                "capacity": 1,
                "by_appointment": True,
                "created_at": now_utc(),
            }
        )

        # Membership plans
        plans = [
            {"plan_id": new_id("plan"), "sort": 1, "name": "Kids Muay Thai Casual Visit", "category": "Kids", "price_display": "15/class", "price_cents": 1500, "interval": "class", "features": ["Pay as you go", "Mon & Wed 5:00–5:45pm", "Muay Thai - Kids", "No lock-in"]},
            {"plan_id": new_id("plan"), "sort": 2, "name": "Kids 10 Week Term", "category": "Kids", "price_display": "300 / term", "price_cents": 30000, "interval": "term", "features": ["10-week term program", "Mon & Wed 5:00–5:45pm", "Or direct debit $35/week", "No joining fee"]},
            {"plan_id": new_id("plan"), "sort": 3, "name": "Adult Muay Thai Casual Visit", "category": "Adults", "price_display": "25/class", "price_cents": 2500, "interval": "class", "features": ["Pay as you go", "Any adult class", "No lock-in"]},
        ]
        await db.membership_plans.insert_many(plans)

        # Announcements (gym notices)
        anns = [
            {"announcement_id": new_id("ann"), "title": "Public Holiday Hours", "body": "The academy front desk will be closed this Monday, but 24/7 gym access remains open for members.", "pinned": True, "author": "Max Energy", "created_at": now_utc()},
            {"announcement_id": new_id("ann"), "title": "Kids Term Enrolments Open", "body": "Muay Thai - Kids runs Mondays & Thursdays 5:00–5:45pm as a 10-week term program. Enrol via Join Membership — spots are limited!", "pinned": False, "author": "Coach Alex", "created_at": now_utc() - timedelta(days=1)},
            {"announcement_id": new_id("ann"), "title": "Grading Day Approaching", "body": "Grading is coming up in two weeks. Speak to your coach about eligibility and prep sessions.", "pinned": False, "author": "Coach Alex", "created_at": now_utc() - timedelta(days=3)},
        ]
        await db.announcements.insert_many(anns)

        # Events
        base_e = now_utc().replace(hour=18, minute=0, second=0, microsecond=0)
        events = [
            {"event_id": new_id("evt"), "title": "Community Fight Night", "start_at": base_e + timedelta(days=6), "location": "Maxenergy Fitness, Smithfield", "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1200&q=80", "description": "Amateur showcase night. Come cheer on our fighters. Doors open at 6pm.", "created_at": now_utc()},
            {"event_id": new_id("evt"), "title": "Free Beginner Workshop", "start_at": base_e + timedelta(days=3), "location": "Maxenergy Fitness, Smithfield", "image": "https://images.unsplash.com/photo-1517438322307-e67111335449?w=1200&q=80", "description": "Free 2-hour beginner workshop covering stance, guard and basic strikes.", "created_at": now_utc()},
            {"event_id": new_id("evt"), "title": "Kids Grading Day", "start_at": base_e + timedelta(days=10), "location": "Maxenergy Fitness, Smithfield", "image": "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=1200&q=80", "description": "Official armband grading for our junior students. Families welcome.", "created_at": now_utc()},
        ]
        await db.events.insert_many(events)

        await db.meta.update_one({"key": "seed_version"}, {"$set": {"value": SEED_VERSION}}, upsert=True)
        log.info(f"seed complete -> {SEED_VERSION}")


@app.on_event("startup")
async def _startup():
    await seed_data()
    # Grandfather any pre-existing accounts (created before email verification) as verified.
    await db.users.update_many({"verified": {"$exists": False}}, {"$set": {"verified": True}})
    # Auto-expire OTP codes 10 min after issue.
    try:
        await db.otp_codes.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        log.warning(f"otp ttl index: {e}")
    app.state.reminder_task = asyncio.create_task(reminder_loop())


async def send_due_reminders() -> int:
    """Send a one-time reminder based on each member's chosen lead time (1, 3 or 12h)."""
    MAX_HOURS = 12
    QLD = timedelta(hours=10)  # class start_at is stored as QLD local wall-clock (no DST)
    now = now_utc()
    window_end = now + timedelta(hours=MAX_HOURS)
    bookings = await db.bookings.find(
        {"status": {"$in": ["paid", "confirmed"]}, "reminder_sent": {"$ne": True}},
        {"_id": 0},
    ).to_list(2000)
    sent = 0
    for b in bookings:
        cls = await db.classes.find_one({"class_id": b["class_id"]}, {"_id": 0})
        if not cls or cls.get("by_appointment"):
            continue
        start = cls.get("start_at")
        if not isinstance(start, datetime):
            continue
        # Interpret the stored naive wall-clock time as QLD local, then convert to UTC.
        s_local = start.replace(tzinfo=None) if start.tzinfo else start
        start_utc = (s_local - QLD).replace(tzinfo=timezone.utc)
        if not (now <= start_utc <= window_end):
            continue
        member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
        lead = int((member or {}).get("reminder_hours", 3))
        if lead == 0:
            continue  # member turned reminders off
        if lead not in (1, 3, 12):
            lead = 3
        # Only send once the class is within the member's chosen lead time.
        if start_utc > now + timedelta(hours=lead):
            continue
        when = s_local.strftime("%A %d %B at %-I:%M %p")
        mins = int((start_utc - now).total_seconds() // 60)
        soon = "in about an hour" if mins <= 75 else f"in about {round(mins / 60)} hours"
        await notify_user(
            b["user_id"], (member or {}).get("email"),
            "Class starting soon ⏰",
            f"Your {b['class_name']} class starts {soon} — {when}. See you there!",
            "reminder",
            email_lines=[
                f"Heads up! Your <b>{b['class_name']}</b> class starts <b>{soon}</b>:",
                f"<b>{when}</b>",
                "See you on the mats! 🥊",
            ],
        )
        await db.bookings.update_one({"booking_id": b["booking_id"]}, {"$set": {"reminder_sent": True, "reminder_sent_at": now}})
        sent += 1
    if sent:
        log.info(f"sent {sent} class reminder(s)")
    return sent


async def reminder_loop():
    # Small initial delay so startup/seed completes first
    await asyncio.sleep(20)
    while True:
        try:
            await send_due_reminders()
        except Exception as e:
            log.error(f"reminder loop error: {e}")
        await asyncio.sleep(900)  # every 15 minutes for timely reminders


@app.on_event("shutdown")
async def _shutdown():
    client.close()
