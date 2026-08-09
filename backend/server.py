from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
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
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@maxenergy.com.au")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "MaxAdmin123!")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SEED_VERSION = "v7"

GYM_INFO = {
    "name": "Max Energy Muay Thai Academy",
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

app = FastAPI(title="Max Energy Muay Thai Academy API")
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


async def send_email(recipient: str, subject: str, html: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=20) as hc:
            r = await hc.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMERGENT_EMAIL_KEY},
                json={"to": [recipient], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME},
            )
            r.raise_for_status()
            return True
    except Exception as e:
        log.error(f"email failed: {e}")
        return False


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
    doc = {
        "booking_id": booking_id,
        "user_id": u["user_id"],
        "class_id": body.class_id,
        "class_name": cls["name"],
        "amount": cls["price_cents"],
        "currency": cls.get("currency", "aud"),
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    return {"booking": doc}


@api.get("/bookings")
async def bookings_list(u: dict = Depends(require_user)):
    rows = await db.bookings.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"bookings": rows}


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
            await db.bookings.update_one(
                {"booking_id": tx["booking_id"], "status": {"$ne": "paid"}},
                {"$set": {"status": "paid", "paid_at": now_utc()}},
            )
            b = await db.bookings.find_one({"booking_id": tx["booking_id"]}, {"_id": 0})
            if b:
                await db.notifications.insert_one(
                    {
                        "notification_id": new_id("ntf"),
                        "user_id": tx["user_id"],
                        "title": "Booking confirmed",
                        "body": f"Your booking for {b['class_name']} is confirmed.",
                        "type": "booking",
                        "read": False,
                        "created_at": now_utc(),
                    }
                )
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
            await db.bookings.update_one({"booking_id": tx["booking_id"]}, {"$set": {"status": "paid", "paid_at": now_utc()}})
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
        <p style="color:#A1A1AA;margin:0 0 12px">See you at Max Energy Muay Thai Academy.</p>
        <p><strong>When:</strong> {when}</p>
        <p><strong>Where:</strong> {e.get('location','Max Energy Muay Thai Academy, Smithfield')}</p>
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


@api.post("/membership/apply")
async def membership_apply(body: MembershipApplyReq, u: dict = Depends(require_user)):
    plan = await db.membership_plans.find_one({"plan_id": body.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    app_id = new_id("app")
    doc = {
        "application_id": app_id,
        "user_id": u["user_id"],
        "full_name": body.full_name,
        "email": u["email"],
        "phone": body.phone,
        "plan_id": body.plan_id,
        "plan_name": plan["name"],
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
            "body": f"We've received your application for {plan['name']}. Our team will be in touch soon.",
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
        <p><strong>Plan:</strong> {plan['name']} (${plan['price_display']})</p>
        <p><strong>Category:</strong> {body.category}</p>
        {details_html}
      </td></tr>
    </table>
    """
    await send_email(GYM_ADMIN_EMAIL, f"New membership application – {body.full_name}", gym_html)
    # confirmation to applicant
    conf_html = f"""
    <table width="100%" style="font-family:Arial,sans-serif;background:#121214;color:#F9FAFB;padding:24px">
      <tr><td>
        <h2 style="color:#FF7A00;margin:0 0 8px">Application received</h2>
        <p>Hi {body.full_name}, thanks for applying for the <strong>{plan['name']}</strong> membership at Max Energy Muay Thai Academy.</p>
        <p>Our team will review your application and get in touch shortly.</p>
      </td></tr>
    </table>
    """
    await send_email(u["email"], "Your Max Energy membership application", conf_html)
    doc.pop("_id", None)
    return {"application": doc}


@api.get("/membership/applications/me")
async def my_applications(u: dict = Depends(require_user)):
    rows = await db.membership_applications.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"applications": rows}


# -------------------- notifications --------------------
@api.get("/notifications")
async def notifications_list(u: dict = Depends(require_user)):
    rows = await db.notifications.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"notifications": rows}


@api.post("/notifications/{nid}/read")
async def notifications_read(nid: str, u: dict = Depends(require_user)):
    await db.notifications.update_one({"notification_id": nid, "user_id": u["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


# -------------------- admin --------------------
@api.get("/admin/overview")
async def admin_overview(u: dict = Depends(require_admin)):
    classes = await db.classes.count_documents({})
    apps = await db.membership_applications.count_documents({})
    pending = await db.membership_applications.count_documents({"status": "pending"})
    ann = await db.announcements.count_documents({})
    members = await db.users.count_documents({})
    return {"classes": classes, "applications": apps, "pending_applications": pending, "announcements": ann, "members": members}


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


@api.get("/admin/applications")
async def admin_applications(u: dict = Depends(require_admin)):
    rows = await db.membership_applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"applications": rows}


@api.post("/admin/applications/{application_id}/status")
async def admin_application_status(application_id: str, body: ApplicationStatusReq, u: dict = Depends(require_admin)):
    if body.status not in ("pending", "approved", "declined"):
        raise HTTPException(400, "Invalid status")
    app_doc = await db.membership_applications.find_one({"application_id": application_id}, {"_id": 0})
    if not app_doc:
        raise HTTPException(404, "Application not found")
    await db.membership_applications.update_one({"application_id": application_id}, {"$set": {"status": body.status}})
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": app_doc["user_id"],
            "title": f"Membership {body.status}",
            "body": f"Your application for {app_doc['plan_name']} was {body.status}.",
            "type": "membership",
            "read": False,
            "created_at": now_utc(),
        }
    )
    return {"ok": True}


@api.get("/")
async def root():
    return {"app": "Max Energy Muay Thai Academy API", "ok": True}


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
    ("Muay Thai - Kids", "Kids", "Coach Alex", "Ages 6-16", 45, 30000, [0, 3], 17, "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=1200&q=80", "10-week term program running each school term. Mondays & Thursdays, 5:00–5:45pm. Cost: $300 for the 10-week term, or direct debit $35/week. No joining fee. Builds confidence, focus and fitness for kids.", "10 Week Term"),
    ("Muay Thai - Adults", "Adults", "Coach Alex", "All levels", 60, 2500, [0, 2], 18, "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80", "High-intensity adult Muay Thai. Mondays & Wednesdays, 6:00pm. Pad work, clinch drills and conditioning.", ""),
    ("Beginners Muay Thai", "Adults", "Coach Mia", "Beginner", 60, 2500, [1, 3], 19, "https://images.unsplash.com/photo-1517438322307-e67111335449?w=1200&q=80", "Learn the fundamentals of Muay Thai in a supportive beginner class.", ""),
    ("Kickboxing", "Adults", "Coach Alex", "All levels", 60, 2500, [1, 3], 18, "https://images.unsplash.com/photo-1549824506-7f0f8b7f5b23?w=1200&q=80", "Kickboxing conditioning and technique combining strikes and cardio.", ""),
    ("Sparring Session", "Adults", "Coach Alex", "Advanced", 60, 2500, [5], 10, "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1200&q=80", "Controlled sparring for experienced students. Gear required.", ""),
    ("Personal Training", "Adults", "Coach Alex", "Any", 60, 8000, [1, 3, 5], 12, "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80", "1-on-1 tailored coaching session with a certified trainer.", ""),
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
                            "created_at": now_utc(),
                        }
                    )
        if docs:
            await db.classes.insert_many(docs)
        log.info(f"seeded {len(docs)} classes")

        # Membership plans
        plans = [
            {"plan_id": new_id("plan"), "sort": 1, "name": "Kids 10 Week Term", "category": "Kids", "price_display": "300 / term", "price_cents": 30000, "interval": "term", "features": ["10-week term program", "Mon & Thu 5:00–5:45pm", "Or direct debit $35/week", "No joining fee"]},
            {"plan_id": new_id("plan"), "sort": 2, "name": "Adult Casual", "category": "Adults", "price_display": "25/class", "price_cents": 2500, "interval": "class", "features": ["Pay as you go", "Any adult class", "No lock-in"]},
            {"plan_id": new_id("plan"), "sort": 3, "name": "Adult 3x / Week", "category": "Adults", "price_display": "40/week", "price_cents": 4000, "interval": "week", "features": ["3 classes per week", "All disciplines", "Open gym access"]},
            {"plan_id": new_id("plan"), "sort": 4, "name": "Adult Unlimited", "category": "Adults", "price_display": "55/week", "price_cents": 5500, "interval": "week", "features": ["Unlimited classes", "24/7 gym access", "Free grading", "Bring a friend"]},
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
            {"event_id": new_id("evt"), "title": "Community Fight Night", "start_at": base_e + timedelta(days=6), "location": "Max Energy Muay Thai Academy, Smithfield", "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1200&q=80", "description": "Amateur showcase night. Come cheer on our fighters. Doors open at 6pm.", "created_at": now_utc()},
            {"event_id": new_id("evt"), "title": "Free Beginner Workshop", "start_at": base_e + timedelta(days=3), "location": "Max Energy Muay Thai Academy, Smithfield", "image": "https://images.unsplash.com/photo-1517438322307-e67111335449?w=1200&q=80", "description": "Free 2-hour beginner workshop covering stance, guard and basic strikes.", "created_at": now_utc()},
            {"event_id": new_id("evt"), "title": "Kids Grading Day", "start_at": base_e + timedelta(days=10), "location": "Max Energy Muay Thai Academy, Smithfield", "image": "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=1200&q=80", "description": "Official armband grading for our junior students. Families welcome.", "created_at": now_utc()},
        ]
        await db.events.insert_many(events)

        await db.meta.update_one({"key": "seed_version"}, {"$set": {"value": SEED_VERSION}}, upsert=True)
        log.info(f"seed complete -> {SEED_VERSION}")


@app.on_event("startup")
async def _startup():
    await seed_data()


@app.on_event("shutdown")
async def _shutdown():
    client.close()
