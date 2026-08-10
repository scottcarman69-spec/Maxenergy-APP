from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, Depends
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
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
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
    CheckoutStatusResponse,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.environ["JWT_ALGO"]
EMERGENT_EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]
GYM_ADMIN_EMAIL = os.environ["GYM_ADMIN_EMAIL"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ADMIN2_EMAIL = os.environ["ADMIN2_EMAIL"]
ADMIN2_PASSWORD = os.environ["ADMIN2_PASSWORD"]

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
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


def user_public(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name"),
        "picture": u.get("picture"),
        "is_admin": bool(u.get("is_admin", False)),
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
                    f"Hi {mname},",
                    "Great news — your payment has been <b>verified</b> and your class is booked! Here are your booking details:",
                    "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                    f"<b>Class:</b> {b['class_name']}",
                    (f"<b>Coach:</b> {trainer}" if trainer else ""),
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
        email_lines=[f"<b>{mname}</b> booked and paid for <b>{b['class_name']}</b>.", f"When: {when}", f"Amount: ${amount:.2f} {currency}"],
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
class RegisterReq(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionReq(BaseModel):
    session_id: str


class BookingCreate(BaseModel):
    class_id: str


class CheckoutCreate(BaseModel):
    booking_id: str
    origin_url: str


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
    start_at: str  # ISO
    image: Optional[str] = None
    description: Optional[str] = None
    capacity: int = 16


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
async def auth_register(body: RegisterReq):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = new_id("user")
    doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_pw(body.password),
        "provider": "password",
        "picture": None,
        "is_admin": False,
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    return {"token": make_jwt(user_id), "user": user_public(doc)}


@api.post("/auth/login")
async def auth_login(body: LoginReq):
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


@api.get("/auth/me")
async def auth_me(u: dict = Depends(require_user)):
    return {"user": user_public(u)}


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
            "bio": "Over 40 years in Muay Thai, competing worldwide including world titles in Bangkok and Dubai. Trained and certified in Thailand, Jamie has taught kids and adults for over 27 years across Australia, the Middle East and Thailand.",
            "quals": ["World-level competitor", "Certified in Thailand", "Kids & Adults (Blue Card)", "Boxing / Kickboxing / Muay Thai"],
        },
        {
            "name": "Andrew Roussety",
            "role": "Personal Trainer",
            "image": "https://irp.cdn-website.com/3ca70639/dms3rep/multi/opt/Andrew+Profile-1920w.jpg",
            "bio": "Passionate about healthy eating and combining nutrition with training for optimal results. Andrew specialises in circuit and weight training, building muscle and trimming excess weight.",
            "quals": ["Cert 3 & 4 in Fitness", "Strength & Conditioning", "Bulking / Cutting / Nutrition", "Boxing Fitness / Muay Thai"],
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
async def classes_list(category: Optional[str] = None):
    q = {}
    if category and category.lower() != "all":
        q["category"] = category
    rows = await db.classes.find(q, {"_id": 0}).sort("start_at", 1).to_list(1000)
    return {"classes": rows}


@api.get("/classes/{class_id}")
async def class_detail(class_id: str):
    c = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Class not found")
    return c


# -------------------- bookings --------------------
@api.post("/bookings")
async def booking_create(body: BookingCreate, u: dict = Depends(require_user)):
    cls = await db.classes.find_one({"class_id": body.class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(404, "Class not found")
    existing = await db.bookings.find_one(
        {"user_id": u["user_id"], "class_id": body.class_id, "status": {"$in": ["paid", "pending"]}}, {"_id": 0}
    )
    if existing and existing.get("status") == "paid":
        raise HTTPException(409, "Already booked")
    if existing:
        return {"booking": existing}
    booking_id = new_id("bk")
    is_appt = bool(cls.get("by_appointment"))
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
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    if is_appt:
        member_name = u.get("name") or u.get("email")
        await notify_admins(
            "New session request",
            f"{member_name} requested a {cls['name']} session (by appointment).",
            "booking",
            email_lines=[
                f"<b>{member_name}</b> has requested a <b>{cls['name']}</b> session.",
                "This is a by-appointment booking — open the app Admin → Bookings to accept, reschedule or cancel.",
            ],
        )
        await create_notification(
            u["user_id"],
            "Session request received",
            f"We received your request for {cls['name']}. We'll confirm a time shortly.",
            "booking",
        )
    return {"booking": doc}


@api.get("/bookings")
async def bookings_list(u: dict = Depends(require_user)):
    rows = await db.bookings.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"bookings": rows}


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
        email_lines=[f"<b>{member_name}</b> cancelled their <b>{b['class_name']}</b> booking."],
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
            f"<b>{member_name}</b> requested to reschedule their <b>{b['class_name']}</b> booking.",
            f"Preferred time: <b>{body.requested_time}</b>",
            (f"Note: {body.note}" if body.note else ""),
            "Open Admin → Bookings to confirm the new time.",
        ],
    )
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    return {"booking": b}


@api.post("/bookings/{booking_id}/checkin")
async def booking_checkin(booking_id: str, u: dict = Depends(require_user)):
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") not in ("paid", "confirmed"):
        raise HTTPException(400, "You can only check in to a confirmed or paid booking.")
    if b.get("attended"):
        return {"booking": b}
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"attended": True, "checked_in_at": now_utc(), "checked_in_by": "member"}},
    )
    await create_notification(
        u["user_id"],
        "Checked in ✅",
        f"You're checked in for {b['class_name']}. Have a great session!",
        "booking",
    )
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    return {"booking": b}


# -------------------- messaging (member <-> gym) --------------------
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


# -------------------- payments (Stripe) --------------------
@api.post("/payments/checkout")
async def payments_checkout(body: CheckoutCreate, request: Request, u: dict = Depends(require_user)):
    booking = await db.bookings.find_one({"booking_id": body.booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking["status"] == "paid":
        raise HTTPException(409, "Already paid")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    success_url = f"{body.origin_url.rstrip('/')}/payment-return?status=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{body.origin_url.rstrip('/')}/payment-return?status=cancel"
    amount = float(booking["amount"]) / 100.0
    req = CheckoutSessionRequest(
        amount=amount,
        currency=booking.get("currency", "aud"),
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"booking_id": booking["booking_id"], "user_id": u["user_id"], "class_id": booking["class_id"]},
    )
    session = await stripe.create_checkout_session(req)
    await db.payment_transactions.insert_one(
        {
            "session_id": session.session_id,
            "booking_id": booking["booking_id"],
            "user_id": u["user_id"],
            "amount": booking["amount"],
            "currency": booking.get("currency", "aud"),
            "payment_status": "initiated",
            "status": "open",
            "created_at": now_utc(),
        }
    )
    await db.bookings.update_one({"booking_id": booking["booking_id"]}, {"$set": {"stripe_session_id": session.session_id}})
    return {"url": session.url, "session_id": session.session_id}


@api.get("/payments/status/{session_id}")
async def payments_status(session_id: str, request: Request, u: dict = Depends(require_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["user_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Session not found")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    status: CheckoutStatusResponse = await stripe.get_checkout_status(session_id)
    if tx.get("payment_status") != status.payment_status:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": status.payment_status, "status": status.status, "updated_at": now_utc()}},
        )
        if status.payment_status == "paid" and tx.get("payment_status") != "paid":
            await mark_booking_paid(tx["booking_id"])
    return {
        "payment_status": status.payment_status,
        "status": status.status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    try:
        wh = await stripe.handle_webhook(payload, sig)
    except Exception as e:
        log.error(f"webhook err: {e}")
        raise HTTPException(400, "Invalid webhook")
    if wh.payment_status == "paid" and wh.session_id:
        tx = await db.payment_transactions.find_one({"session_id": wh.session_id}, {"_id": 0})
        if tx and tx.get("payment_status") != "paid":
            await db.payment_transactions.update_one(
                {"session_id": wh.session_id},
                {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now_utc()}},
            )
            await mark_booking_paid(tx["booking_id"])
    return {"received": True}


# -------------------- announcements (gym notices) --------------------
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


def build_membership_pdf(doc: dict, plan: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.lib.utils import ImageReader

    d = doc.get("details") or {}
    med = d.get("medical") or {}
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    W, H = A4
    y = H - 50
    ORANGE = (1, 0.478, 0)

    def line(label, value, bold=False):
        nonlocal y
        if y < 70:
            c.showPage()
            y = H - 50
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
        c.setFillColorRGB(0.1, 0.1, 0.1)
        if value is None:
            c.setFont("Helvetica-Bold", 12)
            c.setFillColorRGB(*ORANGE)
            c.drawString(45, y, label)
        else:
            c.drawString(45, y, f"{label}: ")
            c.setFont("Helvetica", 10)
            c.setFillColorRGB(0.25, 0.25, 0.25)
            c.drawString(45 + c.stringWidth(f"{label}: ", "Helvetica-Bold" if bold else "Helvetica", 10), y, str(value))
        y -= 16

    # Header
    c.setFillColorRGB(*ORANGE)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(45, y, "Maxenergy Fitness")
    y -= 22
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont("Helvetica", 11)
    c.drawString(45, y, "Membership Registration Form")
    y -= 12
    c.drawString(45, y, "Shop 38 Campus Village Shopping Centre, Smithfield QLD 4878 · Ph 07 4057 9005")
    y -= 24

    line("MEMBERSHIP", None)
    line("Type", d.get("membership_type", "-"))
    _pd = plan.get('price_display')
    line("Plan", f"{plan.get('name')}" + (f" (${_pd})" if _pd else ""))
    line("Category", doc.get("category", "-"))
    line("Term", d.get("term", "-"))
    line("Submitted", d.get("submitted_date", ""))

    line("MEMBER DETAILS", None)
    line("Name", doc.get("full_name"))
    line("Title / Sex", f"{d.get('title','-')} / {d.get('sex','-')}")
    line("Date of birth", d.get("dob", "-"))
    line("Email", doc.get("email"))
    line("Mobile", doc.get("phone"))
    line("Address", ", ".join([x for x in [d.get("address"), d.get("suburb"), d.get("postcode")] if x]) or "-")
    line("Emergency contact", f"{d.get('emergency_name','-')} · {d.get('emergency_phone','-')}")
    line("Marketing consent", "Yes" if d.get("consent_marketing") else "No")
    line("How found", d.get("how_found", "-"))

    line("MEDICAL", None)
    flags = []
    for g in ("medications", "conditions"):
        obj = med.get(g) or {}
        flags += [k for k, v in obj.items() if v]
    line("Declared flags", ", ".join(flags) if flags else "None")
    line("Smoker", "Yes" if med.get("smoke") else "No")
    line("Major operations/fractures", "Yes" if med.get("operations") else "No")
    line("Pregnant / recent baby", "Yes" if med.get("pregnant") else "No")
    line("Exercises regularly", "Yes" if med.get("regular_exercise") else "No")
    if med.get("notes"):
        line("Notes", med.get("notes"))

    line("CONSENT & WAIVER", None)
    line("Media consent", "Yes" if d.get("media_consent") else "No")
    line("Waiver agreed", "Yes" if d.get("waiver_agreed") else "No")
    line("Signed (name)", d.get("signature", "-"))

    # Photo
    photo = d.get("photo_base64")
    if photo and "," in photo:
        try:
            img = base64.b64decode(photo.split(",", 1)[1])
            if y < 180:
                c.showPage(); y = H - 50
            c.setFont("Helvetica-Bold", 10); c.setFillColorRGB(0.1, 0.1, 0.1)
            c.drawString(45, y, "Photo:")
            c.drawImage(ImageReader(io.BytesIO(img)), 45, y - 120, width=110, height=110, preserveAspectRatio=True, mask="auto")
            y -= 130
        except Exception as e:
            log.error(f"pdf photo: {e}")

    # Signature strokes
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
                box_w, box_h = 220, 80
                scale = min(box_w / sw, box_h / sh)
                if y < 120:
                    c.showPage(); y = H - 50
                bx, by = 45, y - 90
                c.setFont("Helvetica-Bold", 10); c.setFillColorRGB(0.1, 0.1, 0.1)
                c.drawString(45, y, "Signature:")
                c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(1.5)
                prev = None
                for (px, py, cmd) in pts:
                    X = bx + (px - minx) * scale
                    Y = by + (box_h - (py - miny) * scale)  # invert y
                    if cmd == "M" or prev is None:
                        prev = (X, Y)
                    else:
                        c.line(prev[0], prev[1], X, Y)
                        prev = (X, Y)
                y -= 100
        except Exception as e:
            log.error(f"pdf sig: {e}")

    c.showPage()
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
        return f"<p style='margin:2px 0'><strong>{k}:</strong> {v}</p>"

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
    <table width="100%" style="font-family:Arial,sans-serif;background:#121214;color:#F9FAFB;padding:24px">
      <tr><td>
        <h2 style="color:#FF7A00;margin:0 0 8px">New membership application</h2>
        <p><strong>Name:</strong> {body.full_name}</p>
        <p><strong>Email:</strong> {u['email']}</p>
        <p><strong>Phone:</strong> {body.phone}</p>
        <p><strong>Plan:</strong> {plan_name}{f" (${plan['price_display']})" if plan else ""}</p>
        <p><strong>Category:</strong> {body.category}</p>
        {details_html}
      </td></tr>
    </table>
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
            pdf_link = f"{base}/api/membership/forms/{app_id}.pdf"
    except Exception as e:
        log.error(f"membership pdf failed: {e}")

    gym_pdf_html = (
        f"<p><a href='{pdf_link}' style='color:#FF7A00;font-weight:bold'>Download the completed membership form (PDF)</a></p>"
        if pdf_link else ""
    )
    gym_html = gym_html.replace("</td></tr>", f"{gym_pdf_html}</td></tr>", 1)
    await send_email(GYM_ADMIN_EMAIL, f"New membership application – {body.full_name}", gym_html)
    # confirmation to applicant (with a link to download a copy of their completed form)
    conf_html = f"""
    <table width="100%" style="font-family:Arial,sans-serif;background:#121214;color:#F9FAFB;padding:24px">
      <tr><td>
        <h2 style="color:#FF7A00;margin:0 0 8px">Your membership form</h2>
        <p>Hi {body.full_name}, thanks for applying for the <strong>{plan_name}</strong> membership at Maxenergy Fitness.</p>
        <p>You can download a PDF copy of your completed membership form using the button below. Our team will review your application and get in touch shortly.</p>
        {_download_button(pdf_link, "Download my membership form (PDF)") if pdf_link else ""}
        {"" if pdf_link else "<p>Your completed form is saved to your account.</p>"}
      </td></tr>
    </table>
    """
    await send_email(u["email"], "Your Max Energy membership form (copy)", conf_html)
    doc.pop("_id", None)
    return {"application": doc}


@api.get("/membership/forms/{application_id}.pdf")
async def download_membership_pdf(application_id: str):
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
    rows = await db.notifications.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"notifications": rows}


@api.get("/notifications/unread")
async def notifications_unread(u: dict = Depends(require_user)):
    count = await db.notifications.count_documents({"user_id": u["user_id"], "read": {"$ne": True}})
    return {"count": count}


@api.post("/notifications/read-all")
async def notifications_read_all(u: dict = Depends(require_user)):
    await db.notifications.update_many({"user_id": u["user_id"], "read": {"$ne": True}}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def notifications_read(nid: str, u: dict = Depends(require_user)):
    await db.notifications.update_one({"notification_id": nid, "user_id": u["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.delete("/notifications/{nid}")
async def notifications_delete(nid: str, u: dict = Depends(require_user)):
    await db.notifications.delete_one({"notification_id": nid, "user_id": u["user_id"]})
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
    trials = await db.free_trials.count_documents({})
    unread_messages = await db.messages.count_documents({"sender_is_admin": False, "read_by_admin": {"$ne": True}})
    return {"classes": classes, "applications": apps, "pending_applications": pending, "announcements": ann, "members": members, "pending_bookings": pending_bookings, "trials": trials, "unread_messages": unread_messages}


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
        "start_at": _parse_dt(body.start_at),
        "capacity": body.capacity,
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
        "start_at": _parse_dt(body.start_at),
        "capacity": body.capacity,
    }
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
    rows = await db.membership_applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
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
        })
    return members


@api.get("/admin/members")
async def admin_members(u: dict = Depends(require_admin)):
    members = await _build_members_list()
    trial_count = await db.free_trials.count_documents({})
    return {"members": members, "total": len(members), "trial_claims": trial_count}


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
    dl_link = f"{base}/api/admin/exports/{export_id}.csv" if base else ""
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
async def download_export_csv(export_id: str):
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
    await db.membership_applications.update_one({"application_id": application_id}, {"$set": {"status": body.status}})
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


@api.get("/admin/bookings")
async def admin_bookings(u: dict = Depends(require_admin)):
    rows = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # enrich with member info
    uids = list({r["user_id"] for r in rows})
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(500)
    umap = {x["user_id"]: x for x in users}
    for r in rows:
        m = umap.get(r["user_id"], {})
        r["member_name"] = m.get("name") or m.get("email") or "Member"
        r["member_email"] = m.get("email")
    return {"bookings": rows}


async def _admin_get_booking(booking_id: str) -> dict:
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


@api.post("/admin/bookings/{booking_id}/accept")
async def admin_booking_accept(booking_id: str, u: dict = Depends(require_admin)):
    b = await _admin_get_booking(booking_id)
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "confirmed", "confirmed_at": now_utc()}})
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    await notify_user(
        b["user_id"], (member or {}).get("email"),
        "Booking accepted",
        f"Great news! Your booking for {b['class_name']} has been accepted.",
        "booking",
        email_lines=[f"Great news — your booking for <b>{b['class_name']}</b> has been <b>accepted</b>!", "See you at the gym. 🥊"],
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

    return {"totals": totals, "daily": series, "by_class": by_class_list, "top_members": top_members, "recent": recent}


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
    ("Muay Thai - Kids", "Kids", "Coach Alex", "Ages 6-16", 45, 1500, [0, 2], 17, "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=1200&q=80", "Kids Muay Thai Classes\n🥊 Mondays & Wednesdays | 5:00–5:45pm\nHelp your child build confidence, focus, discipline and fitness in a fun and supportive environment.\nPricing:\n• $15 casual per class\n• $300 upfront for the full 10-week term\n• Or $35/week by direct debit\n• No joining fee!\nA great way for kids to stay active, learn new skills and grow in confidence.", "10 Week Term"),
    ("Muay Thai - Adults", "Adults", "Coach Alex", "All levels", 60, 2500, [0, 2], 18, "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80", "Adults Muay Thai Classes\n🥊 Mondays & Wednesdays | 6:00pm\nBuild real strength, fitness and confidence in a high-energy class that welcomes all levels.\nWhat you'll do:\n• Pad work and technique drills\n• Clinch work and combinations\n• Strength and conditioning\nWhether you're training for fitness or fighting form, our coaches will meet you where you're at. No experience needed — just bring your energy!", ""),
    ("Kickboxing", "Adults", "Coach Alex", "All levels", 60, 2500, [1, 3], 18, "https://images.unsplash.com/photo-1549824506-7f0f8b7f5b23?w=1200&q=80", "Kickboxing Classes\n🥊 Tuesdays & Thursdays | 6:00pm\nTorch calories, relieve stress and learn real technique in a fun, fast-paced class for all levels.\nWhat you'll get:\n• Strikes, kicks and combinations\n• Cardio and conditioning\n• A full-body workout that never gets boring\nA great way to get fit, build confidence and pick up new skills — beginners welcome!", ""),
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
                "price_cents": 8000,
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
    app.state.reminder_task = asyncio.create_task(reminder_loop())


async def send_due_reminders() -> int:
    """Send a one-time reminder for scheduled classes starting within the next 24h."""
    now = now_utc()
    window_end = now + timedelta(hours=24)
    bookings = await db.bookings.find(
        {"status": {"$in": ["paid", "confirmed"]}, "reminder_sent": {"$ne": True}},
        {"_id": 0},
    ).to_list(2000)
    sent = 0
    for b in bookings:
        cls = await db.classes.find_one({"class_id": b["class_id"]}, {"_id": 0})
        if not cls:
            continue
        start = cls.get("start_at")
        if not isinstance(start, datetime):
            continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if not (now <= start <= window_end):
            continue
        member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
        when = start.strftime("%A %d %B at %-I:%M %p")
        await notify_user(
            b["user_id"], (member or {}).get("email"),
            "Class reminder",
            f"Reminder: your {b['class_name']} class is tomorrow — {when}. See you there!",
            "reminder",
            email_lines=[
                f"This is a friendly reminder that your <b>{b['class_name']}</b> class is coming up:",
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
        await asyncio.sleep(3600)  # hourly


@app.on_event("shutdown")
async def _shutdown():
    client.close()
