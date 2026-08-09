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

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

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


async def send_email(recipient: str, subject: str, html: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=20) as hc:
            r = await hc.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMERGENT_EMAIL_KEY},
                json={
                    "to": [recipient],
                    "subject": subject,
                    "html": html,
                    "from_name": EMAIL_FROM_NAME,
                },
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

    # First: try JWT (email/password)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload.get("sub")
        if uid:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
            if u:
                return u
    except Exception:
        pass

    # Second: try session token (Google Emergent Auth)
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if sess:
        exp = sess.get("expires_at")
        if isinstance(exp, datetime):
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < now_utc():
                return None
        u = await db.users.find_one(
            {"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0}
        )
        return u
    return None


async def require_user(authorization: Optional[str] = Header(None)) -> dict:
    u = await get_user_by_token(authorization)
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
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
    origin_url: str  # frontend origin for success/cancel redirects


class EventRSVPReq(BaseModel):
    event_id: str


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
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    token = make_jwt(user_id)
    return {
        "token": token,
        "user": {"user_id": user_id, "email": doc["email"], "name": doc["name"], "picture": None},
    }


@api.post("/auth/login")
async def auth_login(body: LoginReq):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password_hash") or not check_pw(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_jwt(u["user_id"])
    return {
        "token": token,
        "user": {
            "user_id": u["user_id"],
            "email": u["email"],
            "name": u.get("name"),
            "picture": u.get("picture"),
        },
    }


@api.post("/auth/session")
async def auth_session(body: GoogleSessionReq):
    try:
        async with httpx.AsyncClient(timeout=20) as hc:
            r = await hc.get(
                EMERGENT_AUTH_SESSION_URL,
                headers={"X-Session-ID": body.session_id},
            )
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
                "created_at": now_utc(),
            }
        )
    session_token = data.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Missing session_token")

    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": now_utc() + timedelta(days=7),
            "created_at": now_utc(),
        }
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"session_token": session_token, "user": user}


@api.get("/auth/me")
async def auth_me(u: dict = Depends(require_user)):
    return {"user": u}


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# -------------------- classes --------------------
@api.get("/classes")
async def classes_list():
    classes = await db.classes.find({}, {"_id": 0}).sort("start_at", 1).to_list(500)
    return {"classes": classes}


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
        {"user_id": u["user_id"], "class_id": body.class_id, "status": {"$in": ["paid", "pending"]}},
        {"_id": 0},
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
        metadata={
            "booking_id": booking["booking_id"],
            "user_id": u["user_id"],
            "class_id": booking["class_id"],
        },
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
    await db.bookings.update_one(
        {"booking_id": booking["booking_id"]},
        {"$set": {"stripe_session_id": session.session_id}},
    )
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

    payment_status = status.payment_status
    sess_status = status.status
    if tx.get("payment_status") != payment_status:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": payment_status, "status": sess_status, "updated_at": now_utc()}},
        )
        if payment_status == "paid" and tx.get("payment_status") != "paid":
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
        "payment_status": payment_status,
        "status": sess_status,
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
            await db.bookings.update_one(
                {"booking_id": tx["booking_id"]},
                {"$set": {"status": "paid", "paid_at": now_utc()}},
            )
    return {"received": True}


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


@api.post("/events/rsvp")
async def event_rsvp(body: EventRSVPReq, u: dict = Depends(require_user)):
    e = await db.events.find_one({"event_id": body.event_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Event not found")
    existing = await db.event_rsvps.find_one({"event_id": body.event_id, "user_id": u["user_id"]})
    if existing:
        return {"ok": True, "already": True}
    await db.event_rsvps.insert_one(
        {
            "rsvp_id": new_id("rsvp"),
            "event_id": body.event_id,
            "user_id": u["user_id"],
            "created_at": now_utc(),
        }
    )
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": u["user_id"],
            "title": f"You're going to {e['title']}",
            "body": f"{e['title']} on {e['start_at'].strftime('%a %d %b, %I:%M %p') if isinstance(e['start_at'], datetime) else e['start_at']}.",
            "type": "event",
            "read": False,
            "created_at": now_utc(),
        }
    )
    # Send confirmation email (non-blocking best effort)
    html = f"""
    <table width="100%" style="font-family:Arial,sans-serif;background:#121214;color:#F9FAFB;padding:24px">
      <tr><td>
        <h2 style="color:#CCFF00;margin:0 0 8px">You're going to {e['title']}</h2>
        <p style="color:#A1A1AA;margin:0 0 12px">See you at Maxenergy Fitness.</p>
        <p><strong>When:</strong> {e['start_at'].strftime('%a %d %b, %I:%M %p') if isinstance(e['start_at'], datetime) else e['start_at']}</p>
        <p><strong>Where:</strong> {e.get('location','Maxenergy Fitness, Smithfield')}</p>
        <p style="margin-top:16px">{e.get('description','')}</p>
      </td></tr>
    </table>
    """
    await send_email(u["email"], f"RSVP confirmed – {e['title']}", html)
    return {"ok": True}


# -------------------- notifications --------------------
@api.get("/notifications")
async def notifications_list(u: dict = Depends(require_user)):
    rows = await db.notifications.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"notifications": rows}


@api.post("/notifications/{nid}/read")
async def notifications_read(nid: str, u: dict = Depends(require_user)):
    await db.notifications.update_one(
        {"notification_id": nid, "user_id": u["user_id"]},
        {"$set": {"read": True}},
    )
    return {"ok": True}


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
async def seed_data():
    # Indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.classes.create_index("class_id", unique=True)
        await db.events.create_index("event_id", unique=True)
        await db.bookings.create_index("booking_id", unique=True)
        await db.payment_transactions.create_index("session_id", unique=True)
    except Exception as e:
        log.warning(f"index warn: {e}")

    count = await db.classes.count_documents({})
    if count == 0:
        base = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
        templates = [
            {"name": "Muay Thai", "trainer": "Alex", "duration_min": 60, "level": "All levels", "price_cents": 2500, "image": "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80", "description": "High-intensity Muay Thai class. Pad work, clinch drills and conditioning.", "color": "#CCFF00"},
            {"name": "Kickboxing", "trainer": "Alex", "duration_min": 60, "level": "Beginner+", "price_cents": 2500, "image": "https://images.unsplash.com/photo-1549824506-7f0f8b7f5b23?w=1200&q=80", "description": "Kickboxing conditioning and technique combining strikes and cardio.", "color": "#CCFF00"},
            {"name": "Brazilian Jiu Jitsu", "trainer": "Coach Sam", "duration_min": 75, "level": "All levels", "price_cents": 3000, "image": "https://images.unsplash.com/photo-1544117519-31a4b719223d?w=1200&q=80", "description": "BJJ fundamentals, live drilling and rolling.", "color": "#CCFF00"},
            {"name": "Boxing", "trainer": "Alex", "duration_min": 60, "level": "All levels", "price_cents": 2500, "image": "https://images.unsplash.com/photo-1517438322307-e67111335449?w=1200&q=80", "description": "Boxing fundamentals, bag work and sparring drills.", "color": "#CCFF00"},
            {"name": "Boot Camp", "trainer": "Coach Mia", "duration_min": 45, "level": "All levels", "price_cents": 2000, "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&q=80", "description": "High-energy group workout combining strength and cardio.", "color": "#CCFF00"},
            {"name": "Personal Training", "trainer": "Alex", "duration_min": 60, "level": "Any", "price_cents": 8000, "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80", "description": "1-on-1 tailored coaching session with a certified trainer.", "color": "#CCFF00"},
        ]
        # Create 7 days of schedule
        hours = [6, 9, 12, 17, 19]  # 6am, 9am, noon, 5pm, 7pm
        docs = []
        for day_offset in range(0, 14):
            date = base + timedelta(days=day_offset)
            for i, t in enumerate(templates):
                hour = hours[(i + day_offset) % len(hours)]
                start = date + timedelta(hours=hour)
                docs.append(
                    {
                        "class_id": new_id("cls"),
                        "name": t["name"],
                        "trainer": t["trainer"],
                        "duration_min": t["duration_min"],
                        "level": t["level"],
                        "price_cents": t["price_cents"],
                        "currency": "aud",
                        "image": t["image"],
                        "description": t["description"],
                        "color": t["color"],
                        "start_at": start,
                        "capacity": 16,
                        "created_at": now_utc(),
                    }
                )
        await db.classes.insert_many(docs)
        log.info(f"seeded {len(docs)} classes")

    ecount = await db.events.count_documents({})
    if ecount == 0:
        base = now_utc().replace(hour=18, minute=0, second=0, microsecond=0)
        events = [
            {
                "event_id": new_id("evt"),
                "title": "Community Fight Night",
                "start_at": base + timedelta(days=6),
                "location": "Maxenergy Fitness, Smithfield",
                "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1200&q=80",
                "description": "Amateur showcase night. Come cheer on our fighters. Doors open at 6pm.",
                "created_at": now_utc(),
            },
            {
                "event_id": new_id("evt"),
                "title": "Beginner Muay Thai Workshop",
                "start_at": base + timedelta(days=3),
                "location": "Maxenergy Fitness, Smithfield",
                "image": "https://images.unsplash.com/photo-1517438322307-e67111335449?w=1200&q=80",
                "description": "Free 2-hour beginner workshop covering stance, guard and basic strikes.",
                "created_at": now_utc(),
            },
            {
                "event_id": new_id("evt"),
                "title": "BJJ Grading Day",
                "start_at": base + timedelta(days=10),
                "location": "Maxenergy Fitness, Smithfield",
                "image": "https://images.unsplash.com/photo-1544117519-31a4b719223d?w=1200&q=80",
                "description": "Official belt grading. Bring your gi and a positive attitude.",
                "created_at": now_utc(),
            },
            {
                "event_id": new_id("evt"),
                "title": "Open Boot Camp – Free Trial",
                "start_at": base + timedelta(days=1),
                "location": "Maxenergy Fitness, Smithfield",
                "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&q=80",
                "description": "Bring a friend for free! High-energy 45min boot camp session.",
                "created_at": now_utc(),
            },
        ]
        await db.events.insert_many(events)
        log.info(f"seeded {len(events)} events")


@app.on_event("startup")
async def _startup():
    await seed_data()


@app.on_event("shutdown")
async def _shutdown():
    client.close()
