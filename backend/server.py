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
from models import (
    RegisterReq, LoginReq, GoogleSessionReq, AppleAuthReq, VerifyOtpReq, ResendOtpReq,
    ForgotPasswordReq, ResetPasswordReq, BookingCreate, CheckoutCreate, MembershipApplyReq,
    ClassUpsert, AnnouncementCreate, ApplicationStatusReq, TrialClaimReq, RescheduleReq,
    AdminRescheduleReq, AttendanceReq, MessageReq, AnnouncementUpdate,
)

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
# Native Sign in with Apple: the identity token's `aud` claim is the iOS app's
# bundle identifier (and `host.exp.Exponent` inside Expo Go). We read these from an
# env var, but fall back to this app's known bundle id so production keeps working
# even if the APPLE_AUDIENCES secret hasn't been set in the deploy environment.
_DEFAULT_APPLE_AUDIENCES = ["com.emergent.classnotify.hl9igt", "host.exp.Exponent"]
APPLE_AUDIENCES = [a.strip() for a in os.environ.get("APPLE_AUDIENCES", "").split(",") if a.strip()] or _DEFAULT_APPLE_AUDIENCES
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
SEED_VERSION = "v14"
MAX_CLASS_CAPACITY = 16   # hard maximum spots per class (appointments stay at 1)
BOOTCAMP_CAPACITY = 20    # Boot Camp is allowed a higher cap than other classes


def _cap_limit(name: Optional[str]) -> int:
    """Max spots allowed for a class: Boot Camp gets 20, everything else 16."""
    return BOOTCAMP_CAPACITY if (name or "").strip().lower() == "boot camp" else MAX_CLASS_CAPACITY

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


# ==================== Push notifications (Emergent managed relay) ====================
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def send_push(recipients: list, data: dict, idempotency_key: str = None) -> None:
    """Send a push to a list of user IDs via the Emergent relay. Never raise to the caller;
    push failure must never block the primary operation."""
    try:
        recipients = [r for r in (recipients or []) if r]
        if not recipients or "title" not in data or "message" not in data:
            return
        for i in range(0, len(recipients), 100):
            chunk = recipients[i:i + 100]
            payload = {"recipients": chunk, "data": data}
            if idempotency_key:
                payload["$idempotency_key"] = f"{idempotency_key}_{i}"
            resp = await _push_client.post("/api/v1/push/trigger", json=payload)
            resp.raise_for_status()
    except Exception as e:
        log.warning(f"Push failed (non-blocking): {e}")



@app.get("/health")
@app.get("/healthz")
async def health_check():
    """Lightweight liveness/readiness probe for the deployment platform."""
    return {"status": "ok"}


@api.get("/health")
async def api_health_check():
    return {"status": "ok"}


_PRIVACY_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Maxenergy Fitness</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         line-height: 1.6; max-width: 760px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #ffffff; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 19px; margin-top: 32px; }
  .updated { color: #666; font-size: 14px; margin-bottom: 24px; }
  .sub { font-weight: 700; margin-top: 16px; }
  ul { margin: 8px 0; padding-left: 22px; }
  li { margin-bottom: 6px; }
  a { color: #E8501B; }
  .contact { margin-top: 8px; }
  @media (prefers-color-scheme: dark) {
    body { background: #121212; color: #eaeaea; } .updated { color: #aaa; }
  }
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<div class="updated">Last updated: 17 August 2026</div>

<p>Maxenergy Fitness (ABN 81 213 163 833) ("we", "us" or "our") operates the Maxenergy Fitness mobile application and associated services.</p>
<p>We respect your privacy and are committed to protecting the personal information we collect and handle. This Privacy Policy explains what information we collect, how we use and protect it, when it may be shared, and the choices available to you.</p>

<h2>1. Information We Collect</h2>
<p>Depending on how you use our app and services, we may collect:</p>
<div class="sub">Account information</div>
<ul><li>Name</li><li>Email address</li><li>Login and account information</li><li>Other information you provide when creating or managing your account</li></ul>
<p>Passwords are securely protected using appropriate security measures. We do not store passwords in plain text.</p>
<div class="sub">Profile, booking and attendance information</div>
<ul><li>Classes you book</li><li>Booking history</li><li>Attendance and check-in records</li><li>QR code check-ins</li><li>Membership-related information</li><li>Messages or enquiries you send to us</li></ul>
<div class="sub">Payment information</div>
<p>Payments made through the app are processed securely by our payment provider, Square.</p>
<p>We do not store your full credit or debit card details on our servers. Payment information is handled by Square in accordance with its own security and privacy requirements.</p>
<div class="sub">Membership information</div>
<p>Membership registrations and direct debit arrangements may be completed through Vigyr's secure systems.</p>
<p>Information entered through Vigyr is handled by Vigyr and relevant payment or billing providers in accordance with their applicable privacy and security practices.</p>
<div class="sub">Images and uploaded content</div>
<p>If the app allows you to upload an image or other content, we collect the information you choose to provide.</p>
<div class="sub">Device permissions</div>
<p>Certain features may request access to functions on your device.</p>
<p>For example, authorised staff may use camera access to scan member QR codes for attendance and class check-ins.</p>
<p>We only request device permissions that are required for the relevant app feature.</p>

<h2>2. How We Collect Information</h2>
<p>We may collect personal information:</p>
<ul><li>Directly from you when you create an account, make a booking, contact us or use the app</li><li>When you attend or check in to a class</li><li>When you purchase a class, service or membership</li><li>Through service providers used to operate the app and our gym services</li><li>When you choose to sign in using a supported third-party login service</li></ul>

<h2>3. How We Use Your Information</h2>
<p>We may use your information to:</p>
<ul><li>Create and manage your account</li><li>Manage class bookings and cancellations</li><li>Confirm attendance and check-ins</li><li>Process payments</li><li>Manage memberships</li><li>Provide gym and membership services</li><li>Send booking confirmations and class reminders</li><li>Send important service, membership or account notices</li><li>Respond to enquiries and provide customer support</li><li>Maintain the security and operation of the app</li><li>Improve our classes, services and app functionality</li><li>Meet legal and regulatory requirements</li></ul>
<p>Where available, class reminder preferences can be managed within the app.</p>

<h2>4. Sharing Your Information</h2>
<p>We do not sell your personal information.</p>
<p>We may share information with trusted service providers where necessary to operate our app and provide our services, including:</p>
<ul><li>Square — payment processing.</li><li>Vigyr — membership registration and gym membership/access management.</li><li>Resend — transactional emails, including booking confirmations and class notifications.</li><li>Google — where you choose to use Sign in with Google or other supported Google services.</li><li>Apple — where you choose to use Sign in with Apple.</li></ul>
<p>We may also use technology, hosting, database, notification and other service providers necessary to operate and secure the app.</p>
<p>These providers may only receive information reasonably required to provide their services.</p>
<p>We may also disclose information where required or authorised by Australian law, or where reasonably necessary to protect our legal rights or the safety of our members, staff or others.</p>

<h2>5. Overseas Processing and Disclosure</h2>
<p>Some of the technology and service providers used by our app may operate systems or infrastructure outside Australia.</p>
<p>As a result, personal information may in some circumstances be processed, stored or disclosed outside Australia.</p>
<p>Where required, we take reasonable steps to ensure personal information disclosed to overseas recipients is handled appropriately and in accordance with applicable Australian privacy requirements.</p>
<p>Where it is practicable to identify the countries in which overseas recipients are located, we will provide that information in this Privacy Policy or otherwise make it available to you.</p>

<h2>6. Data Storage and Security</h2>
<p>We take reasonable steps to protect personal information from misuse, interference, loss, unauthorised access, modification and disclosure.</p>
<p>Access to personal information is restricted to authorised persons who require access for legitimate business purposes.</p>
<p>Payment card information is handled by our payment provider and is not stored directly by Maxenergy Fitness.</p>
<p>Although we take reasonable security precautions, no internet-connected system or method of electronic transmission can be guaranteed to be completely secure.</p>

<h2>7. Data Retention and Account Deletion</h2>
<p>We retain personal information for as long as reasonably necessary to provide our services, operate the app, maintain appropriate business records and meet legal or regulatory requirements.</p>
<p>You may request deletion of your account and associated personal information. You can also delete your account directly within the app.</p>
<p>Some information may need to be retained after an account is deleted where required by law, for legitimate record-keeping purposes, to resolve disputes or to protect our legal rights.</p>

<h2>8. Accessing and Correcting Your Information</h2>
<p>You may request access to personal information we hold about you or ask us to correct information that is inaccurate, incomplete or out of date.</p>
<p>You can also update certain account information directly through the app where this functionality is available.</p>
<p>To make an access, correction or deletion request, contact us using the details below.</p>

<h2>9. Children's Privacy</h2>
<p>Our services include classes for children and young people.</p>
<p>In-app messaging features are only available to members aged 13 and over.</p>
<p>Where appropriate, a parent or legal guardian must provide consent and manage or authorise the account for a member under 18.</p>
<p>We aim to collect only the personal information reasonably necessary to manage bookings, attendance, memberships, safety and participation in our services.</p>
<p>Parents or guardians may contact us regarding personal information associated with their child's account.</p>

<h2>10. Privacy Complaints</h2>
<p>If you believe we have not handled your personal information appropriately, please contact us using the details below.</p>
<p>Please provide enough information for us to understand and investigate your concern.</p>
<p>We will review your complaint and aim to respond within a reasonable period.</p>
<p>If you are not satisfied with our response and the Australian Privacy Act applies to the matter, you may be entitled to make a complaint to the Office of the Australian Information Commissioner (OAIC).</p>

<h2>11. Third-Party Services</h2>
<p>Our app may contain links to, or integrate with, third-party services.</p>
<p>Those services may have their own privacy policies and terms. We encourage you to review the privacy information provided by those services before providing personal information directly to them.</p>

<h2>12. Changes to This Privacy Policy</h2>
<p>We may update this Privacy Policy from time to time to reflect changes to our app, services, providers or legal requirements.</p>
<p>The latest version will be made available through the app and/or our website.</p>
<p>The "Last updated" date at the top of this policy will show when the policy was most recently revised.</p>

<h2>13. Contact Us</h2>
<p>If you have questions, would like to access or correct your personal information, request account deletion, or make a privacy complaint, please contact:</p>
<div class="contact">
<strong>Maxenergy Fitness</strong><br>
ABN 81 213 163 833<br>
Shop 38, Campus Village Shopping Centre<br>
38 Faculty Close<br>
Smithfield QLD 4878<br>
Australia<br>
Email: <a href="mailto:info@maxenergy.com.au">info@maxenergy.com.au</a><br>
Phone: <a href="tel:0740579005">07 4057 9005</a>
</div>
</body>
</html>"""


@app.get("/privacy")
@api.get("/privacy")
async def privacy_policy_page():
    """Public, browser-openable Privacy Policy page for the App/Play Store listing."""
    return Response(content=_PRIVACY_HTML, media_type="text/html")


_DELETE_ACCOUNT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delete Your Account — Maxenergy Fitness</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         line-height: 1.6; max-width: 760px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #ffffff; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 19px; margin-top: 32px; }
  .updated { color: #666; font-size: 14px; margin-bottom: 24px; }
  ol, ul { margin: 8px 0; padding-left: 22px; }
  li { margin-bottom: 8px; }
  a { color: #E8501B; }
  .note { background: #f6f6f6; border-radius: 8px; padding: 14px 16px; margin-top: 16px; }
  @media (prefers-color-scheme: dark) {
    body { background: #121212; color: #eaeaea; } .updated { color: #aaa; } .note { background: #1e1e1e; }
  }
</style>
</head>
<body>
<h1>Delete Your Account</h1>
<div class="updated">Maxenergy Fitness</div>

<p>This page explains how to request deletion of your Maxenergy Fitness account and the personal data associated with it.</p>

<h2>Delete your account in the app</h2>
<ol>
  <li>Open the <strong>Maxenergy Fitness</strong> app and sign in.</li>
  <li>Go to the <strong>Profile</strong> tab.</li>
  <li>Scroll to the bottom and tap <strong>Delete account</strong>.</li>
  <li>Confirm when prompted. Your account and associated data are deleted immediately.</li>
</ol>

<h2>Request deletion by email</h2>
<p>If you can't access the app, email us at
<a href="mailto:info@maxenergy.com.au">info@maxenergy.com.au</a> from the email address on your account
and ask us to delete it. We'll verify your identity and process the request.</p>

<h2>What data is deleted</h2>
<p>When your account is deleted, we permanently remove:</p>
<ul>
  <li>Your profile (name, email, phone, date of birth)</li>
  <li>Your class bookings and event RSVPs</li>
  <li>Your free-trial records</li>
  <li>Your membership applications</li>
  <li>Your in-app notifications and messages</li>
  <li>Your login sessions and account credentials</li>
</ul>

<h2>What data may be kept</h2>
<p>Some records may be retained after deletion only where required by law, for legitimate
record-keeping, to resolve disputes, or to protect our legal rights (for example, financial
or transaction records we are legally required to keep). Any retained data is held only for as
long as required and is not used for any other purpose.</p>

<div class="note">
  Questions? Contact us at <a href="mailto:info@maxenergy.com.au">info@maxenergy.com.au</a>.
  See also our <a href="/privacy">Privacy Policy</a>.
</div>
</body>
</html>"""


@app.get("/delete-account")
@api.get("/delete-account")
async def delete_account_page():
    """Public, browser-openable account-deletion instructions page for the Play Store listing."""
    return Response(content=_DELETE_ACCOUNT_HTML, media_type="text/html")


_REVIEWS_WIDGET_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>Reviews — Maxenergy Fitness</title>
<style>
  html, body { margin: 0; padding: 0; background: #121214; -webkit-text-size-adjust: 100%; }
  body { padding: 12px 10px 24px; }
  /* reserve space so the dark background shows while the widget lazy-loads */
  .elfsight-app-d2cd5c7f-942e-4d68-85d7-41e53e623d34 { min-height: 320px; }
</style>
<script src="https://static.elfsight.com/platform/platform.js" async></script>
</head>
<body>
<div class="elfsight-app-d2cd5c7f-942e-4d68-85d7-41e53e623d34" data-elfsight-app-lazy></div>
</body>
</html>"""


@app.get("/reviews-widget")
@api.get("/reviews-widget")
async def reviews_widget_page():
    """Elfsight reviews widget hosted for the mobile app's in-app WebView."""
    return Response(content=_REVIEWS_WIDGET_HTML, media_type="text/html")


_SUPPORT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Support — Maxenergy Fitness</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         line-height: 1.6; max-width: 720px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #ffffff; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 19px; margin-top: 32px; }
  .lead { color: #555; font-size: 15px; margin-bottom: 8px; }
  a { color: #E8501B; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .card { border: 1px solid #e2e2e2; border-radius: 12px; padding: 16px 18px; margin-top: 14px; }
  .row { margin: 6px 0; }
  .label { font-weight: 700; }
  .qa { margin-top: 14px; }
  .q { font-weight: 700; margin-bottom: 2px; }
  .muted { color: #777; font-size: 13px; margin-top: 28px; }
  @media (prefers-color-scheme: dark) {
    body { background: #121212; color: #eaeaea; } .lead,.muted { color: #aaa; }
    .card { border-color: #333; }
  }
</style>
</head>
<body>
<h1>Support</h1>
<p class="lead">Maxenergy Fitness — we're here to help with the app, bookings, memberships and payments.</p>

<h2>Contact Us</h2>
<div class="card">
  <div class="row"><span class="label">Email:</span> <a href="mailto:info@maxenergy.com.au">info@maxenergy.com.au</a></div>
  <div class="row"><span class="label">Phone:</span> <a href="tel:0740579005">07 4057 9005</a></div>
  <div class="row"><span class="label">Address:</span> Shop 38, Campus Village Shopping Centre, 38 Faculty Close, Smithfield QLD 4878, Australia</div>
  <div class="row"><span class="label">Response time:</span> We aim to respond within 1&ndash;2 business days.</div>
</div>

<h2>Common Questions</h2>

<div class="qa">
  <div class="q">How do I book or cancel a class?</div>
  <div>Open the Maxenergy Fitness app, go to the timetable, choose a class and tap Book. You can cancel from your Bookings screen, subject to the cancellation cutoff shown at booking.</div>
</div>
<div class="qa">
  <div class="q">How do I reset my password?</div>
  <div>On the login screen tap "Forgot password" and follow the emailed instructions. If you signed in with Google or Apple, use that same button to sign back in.</div>
</div>
<div class="qa">
  <div class="q">How do I manage my membership or payments?</div>
  <div>Memberships and payments are handled in the app. For billing questions, email us at the address above and our team will assist.</div>
</div>
<div class="qa">
  <div class="q">How do I delete my account?</div>
  <div>You can delete your account directly in the app under Profile, or email us at <a href="mailto:info@maxenergy.com.au">info@maxenergy.com.au</a> and we'll process your request.</div>
</div>
<div class="qa">
  <div class="q">Who can use in-app messaging?</div>
  <div>In-app messaging (group chats, member chats and gym support chat) is available to members aged 13 and over.</div>
</div>

<p class="muted">Maxenergy Fitness &middot; ABN 81 213 163 833 &middot; See our <a href="/api/privacy">Privacy Policy</a>.</p>
</body>
</html>"""


@app.get("/support")
@api.get("/support")
async def support_page():
    """Public, browser-openable Support/Contact page for the App/Play Store listing."""
    return Response(content=_SUPPORT_HTML, media_type="text/html")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("maxenergy")


# -------------------- helpers --------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def qld_now_naive() -> datetime:
    """Current Queensland (GMT+10) wall-clock as a naive datetime, directly
    comparable to appointment ISO strings (which store QLD wall-clock)."""
    return (now_utc() + timedelta(hours=10)).replace(tzinfo=None)


def iso_is_past(iso: Optional[str], buffer_minutes: int = 0) -> bool:
    """True if an appointment ISO (QLD wall-clock) is at/before now (+buffer)."""
    if not iso:
        return False
    try:
        dt = datetime.fromisoformat(str(iso)).replace(tzinfo=None)
    except Exception:
        return False
    return dt <= (qld_now_naive() + timedelta(minutes=buffer_minutes))


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


def booking_ref_code(booking_id: str) -> str:
    """Professional, human-friendly booking reference shown to members and used on
    Square payments so the references match everywhere (e.g. MAX-56233)."""
    return f"MAX-{booking_ref_no(booking_id)}"


import random as _random


async def ensure_handle(user_id: str, name: Optional[str]) -> str:
    """Give each member a unique account ID (handle) they can share to be added as a friend."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "handle": 1})
    if u and u.get("handle"):
        return u["handle"]
    base = re.sub(r"[^A-Za-z]", "", (name or "MX"))[:6].upper() or "MX"
    for _ in range(25):
        cand = f"{base}{_random.randint(100, 9999)}"
        if not await db.users.find_one({"handle": cand}):
            await db.users.update_one({"user_id": user_id}, {"$set": {"handle": cand}})
            return cand
    cand = user_id[-6:].upper()
    await db.users.update_one({"user_id": user_id}, {"$set": {"handle": cand}})
    return cand


def _dm_key(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_pw(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception:
        return False


def make_jwt(user_id: str, token_version: int = 0) -> str:
    payload = {
        "sub": user_id,
        "ver": int(token_version),
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


MIN_MESSAGING_AGE = 13


def user_age(u: dict) -> Optional[int]:
    """Age in years from the user's date_of_birth (YYYY-MM-DD). None if unknown
    (e.g. Google/Apple social sign-ins never collect a DOB)."""
    dob_str = u.get("date_of_birth")
    if not dob_str:
        return None
    try:
        dob = datetime.strptime(str(dob_str)[:10], "%Y-%m-%d").date()
    except Exception:
        return None
    today = now_utc().date()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def messaging_blocked(u: dict) -> bool:
    """True only when we KNOW the member is under the minimum messaging age.
    Unknown age (no DOB) is allowed — social platforms already require 13+."""
    age = user_age(u)
    return age is not None and age < MIN_MESSAGING_AGE


def require_messaging_age(u: dict) -> None:
    if messaging_blocked(u):
        raise HTTPException(
            status_code=403,
            detail=f"Messaging is only available to members aged {MIN_MESSAGING_AGE} and over.",
        )


def user_public(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name"),
        "handle": u.get("handle"),
        "phone": u.get("phone"),
        "picture": u.get("picture"),
        "is_admin": bool(u.get("is_admin", False)),
        "is_test": bool(u.get("is_test", False)),
        "verified": bool(u.get("verified", False)),
        "can_message": not messaging_blocked(u),
        "needs_dob": not bool(u.get("date_of_birth")),
        "reminder_hours": int(u.get("reminder_hours", 1)),
        "cal_reminder_default": int(u.get("cal_reminder_default", 60)),
        "quick_actions_order": u.get("quick_actions_order") or [],
        "child_age_default": u.get("child_age_default"),
        "children": u.get("children") or [],
        "message_notifications": bool(u.get("message_notifications", True)),
        "leaderboard_opt_out": bool(u.get("leaderboard_opt_out", False)),
        "quiet_hours": u.get("quiet_hours") or {"enabled": False, "start": "22:00", "end": "07:00"},
        "credit_cents": int(u.get("credit_cents", 0)),
        "class_pass_credits": int(u.get("class_pass_credits", 0)),
        "key_tag": bool(u.get("key_tag", False)),
        "membership_plan": u.get("membership_plan"),
        "membership_expires_at": u.get("membership_expires_at").isoformat() if isinstance(u.get("membership_expires_at"), datetime) else None,
        "membership_form_completed": bool(u.get("membership_form_completed_at")),
        "vigyr_signup_reported": bool(u.get("vigyr_signup_reported")),
        "membership_active": bool(u.get("membership_active")),
    }


def clean_display(name) -> str:
    """A privacy-safe display name. Never expose an email address (e.g. an Apple
    'Hide My Email' private-relay address) as someone's name."""
    n = (name or "").strip()
    return n if (n and "@" not in n) else "Member"


def display_name(u: dict) -> str:
    """Friendly display name for a user doc, falling back to 'Member'."""
    return clean_display((u or {}).get("name"))



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


def _process_gallery_image(src, max_w: int = 1280, quality: int = 72) -> str:
    """Downscale + JPEG-compress an image and return a compact data URI.
    Accepts a data URI string (admin upload) or raw bytes (file seed). Keeps the
    stored gallery payload small so the Home/About galleries load fast."""
    from PIL import Image as _PILImage, ImageOps as _ImageOps
    if isinstance(src, str):
        if "," in src:
            src = src.split(",", 1)[1]
        raw = base64.b64decode(src)
    else:
        raw = src
    img = _PILImage.open(io.BytesIO(raw))
    img = _ImageOps.exif_transpose(img)  # honour phone orientation
    if img.mode not in ("RGB",):
        img = img.convert("RGB")
    if img.width > max_w:
        h = int(img.height * (max_w / img.width))
        img = img.resize((max_w, h), _PILImage.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()



def _email_shell(heading: str, lines: list) -> str:
    body = "".join(f"<p style='margin:0 0 10px;color:#333;font-size:15px;line-height:1.5'>{ln}</p>" for ln in lines if ln)
    return (
        "<div style='font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;'>"
        "<div style='background:#FF7A00;padding:20px 24px;border-radius:10px 10px 0 0;'>"
        f"<h1 style='color:#fff;margin:0;font-size:20px;'>{heading}</h1></div>"
        f"<div style='padding:24px;background:#fafafa;border-radius:0 0 10px 10px;border:1px solid #eee;'>{body}"
        f"{_email_contact_footer()}"
        "<p style='margin:18px 0 0;color:#999;font-size:12px;'>Maxenergy Fitness · Smithfield QLD</p></div></div>"
    )


_LAST_PUBLIC_BASE = ""
# A fixed, trusted public URL for building links inside outbound emails. When set,
# request-supplied Host/X-Forwarded-Host headers are IGNORED (prevents host-header
# cache poisoning that could redirect email links to an attacker's domain).
_TRUSTED_PUBLIC_BASE = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")


def _public_base(request: Optional[Request]) -> str:
    """Return the app's externally reachable base URL for email links.
    Prefers a trusted configured domain (PUBLIC_APP_URL); only if that's unset do
    we fall back to the request host (dev/preview convenience)."""
    global _LAST_PUBLIC_BASE
    if _TRUSTED_PUBLIC_BASE:
        return _TRUSTED_PUBLIC_BASE
    if request is not None:
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        if host:
            base = f"{proto}://{host}"
            _LAST_PUBLIC_BASE = base
            return base
    return _LAST_PUBLIC_BASE or os.environ.get("PUBLIC_BASE_URL", "")


def _download_button(url: str, label: str) -> str:
    return (
        f"<p style='margin:18px 0'><a href='{url}' "
        "style='display:inline-block;background:#FF7A00;color:#fff;text-decoration:none;"
        "padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px'>"
        f"{label}</a></p>"
    )


def _email_contact_footer() -> str:
    """A friendly, readable 'how to reach us' block appended to every email."""
    return (
        "<div style='margin-top:22px;padding:16px 18px;background:#fff7ef;border:1px solid #ffe0c2;border-radius:10px'>"
        "<p style='margin:0 0 6px;color:#111;font-size:14px;font-weight:bold'>Need help or have a problem?</p>"
        "<p style='margin:0 0 8px;color:#444;font-size:13px;line-height:1.5'>You can contact us any time from the "
        "<strong>Maxenergy Fitness</strong> app:</p>"
        "<p style='margin:0 0 8px;color:#444;font-size:13px;line-height:1.6'>"
        "1. Open the Maxenergy Fitness app<br/>"
        "2. Tap <strong>Profile</strong> in the bottom menu<br/>"
        "3. Tap <strong>Contact &amp; Gym Info</strong> to call, email, or get directions</p>"
        "<p style='margin:0;color:#444;font-size:13px'>Or reach us directly &nbsp;·&nbsp; "
        "Phone: <a href='tel:0740579005' style='color:#FF7A00;text-decoration:none;font-weight:bold'>07 4057 9005</a> &nbsp;·&nbsp; "
        "Email: <a href='mailto:info@maxenergy.com.au' style='color:#FF7A00;text-decoration:none;font-weight:bold'>info@maxenergy.com.au</a></p>"
        "</div>"
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
MEMBER_NAV = {"booking": "member_bookings", "application": "member_application", "membership": "member_application"}


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
    """In-app notification + email to a specific member (email suppressed during the member's quiet hours)."""
    await create_notification(user_id, title, body, ntype, data)
    if email and not await _in_quiet_now(user_id):
        await send_email(email, title, _email_shell(title, email_lines or [body]))


async def low_pass_nudge(user_id: str, email: Optional[str], left: int, base_url: Optional[str] = None) -> None:
    """Nudge the member to top up when they're down to their last class pass (or out)."""
    if left == 1:
        title = "You're on your last class pass ⏳"
        body = "Only 1 class pass left. Top up so you never miss a session."
    elif left == 0:
        title = "You're out of class passes"
        body = "Buy a Single or 10 Class Pass to keep booking classes at the gym."
    else:
        return
    lines = [body, "Tap below to buy more passes."]
    if base_url:
        lines.append(_download_button(f"{base_url.rstrip('/')}/memberships", "Buy class passes"))
    await notify_user(user_id, email, title, body, "booking",
                      email_lines=lines,
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


QLD_OFFSET = timedelta(hours=10)  # Queensland is UTC+10, no daylight saving


def _qld_naive_to_utc(dt: datetime) -> datetime:
    """Class/trial start times are stored as QLD local wall-clock (naive, UTC+10)."""
    naive = dt.replace(tzinfo=None) if dt.tzinfo else dt
    return (naive - QLD_OFFSET).replace(tzinfo=timezone.utc)


def _gcal_link(title: str, start_utc: datetime, minutes: int, location: str, details: str) -> str:
    from urllib.parse import quote_plus
    end = start_utc + timedelta(minutes=minutes or 60)
    fmt = "%Y%m%dT%H%M%SZ"
    dates = f"{start_utc.strftime(fmt)}/{end.strftime(fmt)}"
    return (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote_plus(title)}&dates={dates}"
        f"&details={quote_plus(details)}&location={quote_plus(location)}"
    )


def _build_ics(uid_seed: str, title: str, start_utc: datetime, minutes: int, location: str, description: str, reminder_minutes: int = 60) -> str:
    """Generate a standards-compliant single-event .ics that Apple Calendar,
    Outlook and Google all import, with a configurable reminder alarm."""
    def e(s: str) -> str:
        return str(s or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
    end_utc = start_utc + timedelta(minutes=minutes or 60)
    fmt = "%Y%m%dT%H%M%SZ"
    rmin = int(reminder_minutes or 60)
    return "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Maxenergy Fitness//Booking//EN",
        "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{e(uid_seed)}@maxenergy.fitness",
        f"DTSTAMP:{now_utc().strftime(fmt)}",
        f"DTSTART:{start_utc.strftime(fmt)}",
        f"DTEND:{end_utc.strftime(fmt)}",
        f"SUMMARY:{e(title)}",
        f"LOCATION:{e(location)}",
        f"DESCRIPTION:{e(description)}",
        "BEGIN:VALARM", f"TRIGGER:-PT{rmin}M", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", "",
    ])


def _calendar_buttons_html(title: str, start_utc: datetime, minutes: int, location: str,
                           details: str, booking_id: str, base_url: str) -> str:
    """Two one-tap 'add to calendar' buttons: Google (link) + Apple/Outlook (.ics).
    The Apple/Outlook button only appears when we know the app's public URL."""
    gcal = _gcal_link(title, start_utc, minutes, location, details)
    btn = "display:inline-block;margin:4px 8px 4px 0;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold;font-size:14px"
    buttons = f"<a href='{gcal}' style='{btn};background:#FF7A00;color:#fff'>\U0001F4C5 Google Calendar</a>"
    if base_url:
        ics = f"{base_url.rstrip('/')}/api/calendar/{booking_id}.ics?t={sign_dl_token('cal', booking_id)}"
        buttons += f"<a href='{ics}' style='{btn};background:#111;color:#fff'>\U0001F34E Apple / Outlook</a>"
    return f"<div style='margin:14px 0'><b>Add this to your calendar:</b><br>{buttons}</div>"


async def _booking_start_utc(b: dict) -> Optional[datetime]:
    """Resolve a booking's real start time (UTC). Appointments use their confirmed
    `requested_at`; fixed classes use `class_start` (falling back to the class doc)."""
    start = None
    if b.get("by_appointment") and b.get("requested_at"):
        try:
            start = datetime.fromisoformat(b["requested_at"])
        except Exception:
            start = None
    if not isinstance(start, datetime):
        s = b.get("class_start")
        if not isinstance(s, datetime):
            cls = await db.classes.find_one({"class_id": b.get("class_id")}, {"_id": 0})
            s = (cls or {}).get("start_at")
        start = s if isinstance(s, datetime) else None
    return _qld_naive_to_utc(start) if isinstance(start, datetime) else None


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
    # Deduct any in-app credit that was applied to this booking (exactly once).
    applied = int(b.get("credit_applied_cents", 0))
    if applied > 0:
        # Atomically claim the deduction so concurrent callers can't double-deduct
        # the same booking's credit.
        claim = await db.bookings.update_one(
            {"booking_id": booking_id, "credit_deducted": {"$ne": True}},
            {"$set": {"credit_deducted": True}},
        )
        if claim.modified_count == 1:
            # Guarded decrement — never drive the balance negative even under a race.
            res = await db.users.update_one(
                {"user_id": b["user_id"], "credit_cents": {"$gte": applied}},
                {"$inc": {"credit_cents": -applied}},
            )
            ded = applied
            if res.modified_count != 1:
                # Balance was lower than expected — deduct only what remains.
                user_doc = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0, "credit_cents": 1})
                avail = int((user_doc or {}).get("credit_cents", 0))
                ded = max(0, min(applied, avail))
                if ded > 0:
                    await db.users.update_one({"user_id": b["user_id"]}, {"$inc": {"credit_cents": -ded}})
            if ded > 0:
                await db.credit_ledger.insert_one({
                    "ledger_id": new_id("cl"), "user_id": b["user_id"], "delta_cents": -ded,
                    "reason": f"Used toward {b.get('class_name')}", "booking_id": booking_id, "created_at": now_utc(),
                })
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
    is_appt_b = bool(b.get("by_appointment"))
    await create_notification(
        b["user_id"],
        "Payment received — pending confirmation" if is_appt_b else "Payment verified — booking confirmed",
        (f"Thanks! Your payment for {b['class_name']} ({b.get('requested_time') or when}) is received. "
         "Your booking will be approved once the gym confirms your time — we'll notify you shortly.")
        if is_appt_b else
        f"Your payment for {b['class_name']} is verified. See you {when}.",
        "booking",
    )
    cal_line = ""
    if isinstance(start, datetime) and not is_appt_b:
        cal_line = _calendar_buttons_html(
            f"{b['class_name']} — Max Energy",
            _qld_naive_to_utc(start),
            duration or 60,
            GYM_INFO["address"],
            f"{b['class_name']} at Maxenergy Fitness. Booking ref: {booking_ref_code(b['booking_id'])}.",
            b["booking_id"],
            _public_base(None),
        )
    # Entry QR — valid through the class day (long-lived; single-use enforced by the attended flag).
    from urllib.parse import quote as _urlquote
    _qr_exp = (start + timedelta(days=2)) if isinstance(start, datetime) else (now_utc() + timedelta(days=120))
    _qr_code = make_checkin_code(b["booking_id"], b["user_id"], _qr_exp)
    _qr_img = f"https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data={_urlquote(_qr_code)}"
    qr_block = (
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>"
        "<div style='text-align:center'>"
        "<b>Your entry QR code</b><br>"
        "<span style='color:#666;font-size:13px'>Show this at the door — our staff will scan it to confirm your attendance.</span><br>"
        f"<img src='{_qr_img}' alt='Entry QR code' width='220' height='220' style='margin-top:10px;border-radius:12px'/><br>"
        "<span style='color:#999;font-size:12px'>You can also open it any time in the app → My Bookings.</span>"
        "</div>"
    )
    # Full-detail confirmation email to the member
    if (member or {}).get("email"):
        await send_email(
            member["email"],
            f"Payment received — {b['class_name']} at Max Energy" if is_appt_b else f"Payment confirmed — {b['class_name']} at Max Energy",
            _email_shell(
                "Payment Received — Pending Confirmation ⏳" if is_appt_b else "Payment Confirmed ✅",
                [
                    f"Hi {esc(mname)},",
                    ("Thanks! Your payment has been <b>received</b>. Your booking will be <b>approved once the gym confirms your time</b> — we'll be in touch shortly. Here are your details:"
                     if is_appt_b else
                     "Great news — your payment has been <b>verified</b> and your class is booked! Here are your booking details:"),
                    "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                    f"<b>Class:</b> {esc(b['class_name'])}",
                    (f"<b>Coach:</b> {esc(trainer)}" if trainer else ""),
                    (f"<b>Preferred time:</b> {esc(b.get('requested_time') or when)}" if is_appt_b else f"<b>When:</b> {when}"),
                    (f"<b>Duration:</b> {duration} minutes" if duration else ""),
                    f"<b>Amount paid:</b> ${amount:.2f} {currency}",
                    f"<b>Booking reference:</b> {booking_ref_code(b['booking_id'])}",
                    f"<b>Location:</b> {GYM_INFO['address']}",
                    cal_line,
                    qr_block,
                    "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                    "Need to cancel or reschedule? Open the Max Energy app → Profile → My Bookings.",
                    "See you on the mats! 🥊",
                ],
            ),
        )
    # Notify gym admins
    _appt_when = b.get("requested_time") or when

    # ----- Full booker details for the gym email + booking log -----
    fname = ((member or {}).get("name") or mname or "").strip().split(" ")[0] or mname
    app_doc = await db.membership_applications.find_one(
        {"user_id": b["user_id"]}, {"_id": 0, "phone": 1}, sort=[("created_at", -1)]
    )
    phone = (member or {}).get("phone") or (app_doc or {}).get("phone") or "—"
    plan = (member or {}).get("membership_plan") or "—"
    exp = (member or {}).get("membership_expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        exp_str = exp.strftime("%d %b %Y")
        mem_status = "Active" if exp >= now_utc() else "Expired"
    else:
        exp_str = "—"
        mem_status = "Active" if (member or {}).get("membership_active") else "—"
    key_tag = (member or {}).get("key_tag") or "—"
    credit_used = int(b.get("credit_applied_cents", 0))
    if b.get("paid_with_pass"):
        pay_method = "Class pass"
        amount_str = "Class pass (no card charge)"
    elif amount <= 0 and credit_used > 0:
        pay_method = "Account credit"
        amount_str = f"${credit_used / 100:.2f} account credit (no card charge)"
    elif credit_used > 0:
        pay_method = "Card + account credit"
        amount_str = f"${amount:.2f} {currency} card + ${credit_used / 100:.2f} credit"
    else:
        pay_method = "Card (Square)"
        amount_str = f"${amount:.2f} {currency}"
    ref_code = booking_ref_code(b["booking_id"])

    # Save a snapshot into the booking log so the gym keeps full records.
    await db.booking_logs.insert_one({
        "log_id": new_id("blog"),
        "booking_id": b["booking_id"],
        "reference": ref_code,
        "user_id": b["user_id"],
        "first_name": fname,
        "phone": phone,
        "membership_plan": plan,
        "membership_status": mem_status,
        "membership_expires": exp_str,
        "key_tag": key_tag,
        "class_name": b["class_name"],
        "when": _appt_when if is_appt_b else when,
        "duration_min": duration,
        "payment_method": pay_method,
        "amount_cents": int(b.get("amount", 0)),
        "credit_applied_cents": credit_used,
        "created_at": now_utc(),
    })

    booker_lines = [
        "<hr style='border:none;border-top:1px solid #eee;margin:12px 0'>",
        "<b>Booker details</b>",
        f"First name: <b>{esc(fname)}</b>",
        f"Phone: {esc(str(phone))}",
        f"Membership: {esc(str(plan))} ({esc(mem_status)}{' · expires ' + esc(exp_str) if exp_str != '—' else ''})",
        f"Key tag: {esc(str(key_tag))}",
        "<hr style='border:none;border-top:1px solid #eee;margin:12px 0'>",
        "<b>Booking</b>",
        f"Class: <b>{esc(b['class_name'])}</b>",
        f"When: {esc(_appt_when if is_appt_b else when)}",
        (f"Duration: {duration} minutes" if duration else ""),
        f"Reference: <b>{ref_code}</b>",
        f"Payment: {esc(pay_method)} — {esc(amount_str)}",
    ]

    await notify_admins(
        "New PT/Program booking — needs confirmation" if is_appt_b else "New paid booking",
        (f"{fname} booked and paid for {b['class_name']} — preferred {_appt_when}. Confirm it in Admin → Bookings."
         if is_appt_b else f"{fname} booked and paid for {b['class_name']} ({when})."),
        "booking",
        email_lines=(
            [f"<b>{esc(fname)}</b> booked and paid for <b>{esc(b['class_name'])}</b>.",
             *booker_lines,
             "Open the app → Admin → Bookings to <b>confirm</b> this session."]
            if is_appt_b else
            [f"<b>{esc(fname)}</b> booked and paid for <b>{esc(b['class_name'])}</b>.", *booker_lines]
        ),
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
                # Session revocation: the token's version must match the user's current
                # token_version. Logout / password reset increments it, invalidating old JWTs.
                if int(payload.get("ver", 0)) != int(u.get("token_version", 0) or 0):
                    return None
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
# Pydantic models live in models.py (imported at top of this file).
def validate_password_strength(pw: str) -> None:
    """Require min 6 chars, at least one number and one symbol."""
    if len(pw or "") < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not re.search(r"\d", pw):
        raise HTTPException(status_code=400, detail="Password must include at least one number")
    if not re.search(r"[^A-Za-z0-9]", pw):
        raise HTTPException(status_code=400, detail="Password must include at least one symbol (e.g. !@#)")


DEFAULT_CLASS_IMAGE = "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=1200&q=80"


# -------------------- auth --------------------
@api.post("/auth/register")
async def auth_register(body: RegisterReq, request: Request):
    await enforce_rate_limit(request, "register", body.email.lower())
    email = body.email.lower().strip()
    # Validate inputs FIRST. These 400s are identical whether or not the email
    # already exists, so they never reveal account existence.
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
    phone = re.sub(r"[^\d+]", "", body.phone or "")
    if len(re.sub(r"\D", "", phone)) < 8:
        raise HTTPException(status_code=400, detail="Enter a valid phone number")
    first = body.first_name.strip()
    last = body.last_name.strip()
    full_name = (f"{first} {last}").strip()

    # Block reuse of an email that already has an account (via password, Google or
    # Apple) and tell the user exactly how to sign in, instead of silently creating
    # a duplicate or pretending a code was sent. NOTE: this intentionally reveals
    # that an email is registered (product decision) to avoid confusing dead-ends.
    existing = await db.users.find_one({"email": email}, {"_id": 1, "provider": 1, "password_hash": 1})
    if existing:
        if existing.get("password_hash"):
            msg = "This email is already registered. Please log in with your password, or use 'Forgot password' if you need to reset it."
        elif existing.get("provider") == "google":
            msg = "This email is already registered with Google. Please tap 'Continue with Google' to sign in."
        elif existing.get("provider") == "apple":
            msg = "This email is already registered with Apple. Please use 'Sign in with Apple' to log in."
        else:
            msg = "This email is already registered. Please log in instead."
        raise HTTPException(status_code=409, detail=msg)

    await db.pending_registrations.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "first_name": first,
            "last_name": last,
            "name": full_name,
            "date_of_birth": body.date_of_birth.strip(),
            "phone": phone,
            "password_hash": hash_pw(body.password),
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(hours=24),
        }},
        upsert=True,
    )
    try:
        await send_otp_email(email, "verify")
    except Exception as e:
        log.error(f"failed to send verification email to {email}: {e}")
    return {"pending": True, "email": email}


@api.post("/auth/login")
async def auth_login(body: LoginReq, request: Request):
    await enforce_rate_limit(request, "login", body.email.lower())
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password_hash") or not check_pw(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": make_jwt(u["user_id"], int(u.get("token_version", 0) or 0)), "user": user_public(u)}


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


# Cache Apple's public keys so we don't fetch JWKS on every sign-in.
_apple_jwks_client = None

def _get_apple_jwks_client():
    global _apple_jwks_client
    if _apple_jwks_client is None:
        from jwt import PyJWKClient
        _apple_jwks_client = PyJWKClient(APPLE_JWKS_URL)
    return _apple_jwks_client


@api.post("/auth/apple")
async def auth_apple(body: AppleAuthReq):
    """Native Sign in with Apple (iOS). Verifies the identity token against Apple's
    JWKS, keys the user on the Apple `sub`, and issues a 7-day session token."""
    token = (body.identity_token or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing identity token")
    try:
        signing_key = _get_apple_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=APPLE_AUDIENCES,
            issuer=APPLE_ISSUER,
        )
    except Exception as e:
        log.error(f"apple token verify failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Apple token")

    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Invalid Apple token")

    # SECURITY: account identity/linking must rely ONLY on claims Apple signed.
    # The client-supplied body.email is NEVER used to find or link an account, as
    # that would let anyone with a valid Apple token attach to a victim's account.
    token_email = (claims.get("email") or "").lower() or None
    ev = claims.get("email_verified")
    email_verified = ev is True or str(ev).lower() == "true"
    trusted_email = token_email if (token_email and email_verified) else None

    existing = await db.users.find_one({"apple_sub": apple_sub})
    # Only link to an existing account when Apple gives us a VERIFIED email that
    # matches it (e.g. they first signed up with password/Google using that email).
    if not existing and trusted_email:
        existing = await db.users.find_one({"email": trusted_email})

    if existing:
        user_id = existing["user_id"]
        updates = {"apple_sub": apple_sub}
        # Persist name on first sign-in; never overwrite with nulls.
        if not existing.get("name") and body.full_name:
            updates["name"] = body.full_name
        if not existing.get("email") and trusted_email:
            updates["email"] = trusted_email
        await db.users.update_one({"user_id": user_id}, {"$set": updates})
    else:
        user_id = new_id("user")
        await db.users.insert_one(
            {
                "user_id": user_id,
                # Store only a verified email; otherwise a stable per-Apple placeholder.
                # We deliberately do NOT trust body.email for the stored address.
                "email": trusted_email or f"{apple_sub.replace('.', '_')}@appleid.local",
                "name": body.full_name,
                "apple_sub": apple_sub,
                "provider": "apple",
                "is_admin": False,
                "verified": True,
                "created_at": now_utc(),
            }
        )

    session_token = new_id("apple_sess") + secrets.token_urlsafe(24)
    await db.user_sessions.insert_one(
        {"session_token": session_token, "user_id": user_id, "provider": "apple",
         "expires_at": now_utc() + timedelta(days=7), "created_at": now_utc()}
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"session_token": session_token, "user": user_public(u)}


@api.post("/auth/verify-otp")
async def auth_verify_otp(body: VerifyOtpReq, request: Request):
    email = body.email.lower()
    await enforce_rate_limit(request, "otp", email)
    code = (body.code or "").strip()

    # A correct, unexpired code proves the caller controls this inbox, so it's safe
    # to mint a session token here. A wrong/missing code returns the SAME generic
    # error whether or not the email exists (no enumeration, no account takeover).
    if not await verify_otp(email, "verify", code):
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    # Case 1: a real account already exists (e.g. a legacy soft-gate signup) —
    # flip it to verified and issue its token.
    u = await db.users.find_one({"email": email})
    if u:
        if not u.get("verified"):
            await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"verified": True}})
            u["verified"] = True
        await db.pending_registrations.delete_one({"email": email})
        return {"verified": True, "user": user_public(u), "token": make_jwt(u["user_id"], int(u.get("token_version", 0) or 0))}

    # Case 2: brand-new signup — promote the staged pending registration to a real
    # verified account, then auto-log-in by returning a token.
    pending = await db.pending_registrations.find_one({"email": email})
    if not pending:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    user_id = new_id("user")
    doc = {
        "user_id": user_id,
        "email": email,
        "name": pending.get("name"),
        "first_name": pending.get("first_name"),
        "last_name": pending.get("last_name"),
        "date_of_birth": pending.get("date_of_birth"),
        "phone": pending.get("phone"),
        "password_hash": pending.get("password_hash"),
        "provider": "password",
        "picture": None,
        "is_admin": False,
        "verified": True,
        "token_version": 0,
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    await db.pending_registrations.delete_one({"email": email})
    return {"verified": True, "user": user_public(doc), "token": make_jwt(user_id, 0)}


@api.post("/auth/resend-otp")
async def auth_resend_otp(body: ResendOtpReq, request: Request):
    email = body.email.lower()
    await enforce_rate_limit(request, "otp", email)
    u = await db.users.find_one({"email": email})
    pending = await db.pending_registrations.find_one({"email": email}) if not u else None
    # Always respond ok (don't leak which emails exist), but only send when there's
    # a real unverified account OR a staged pending registration awaiting a code.
    eligible = (u and not u.get("verified") and u.get("provider") == "password") or (pending is not None)
    if eligible:
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
    new_ver = int(u.get("token_version", 0) or 0) + 1
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"password_hash": hash_pw(body.new_password), "verified": True, "token_version": new_ver}},
    )
    # Reset invalidates existing sessions for safety (Google sessions + all prior JWTs).
    await db.user_sessions.delete_many({"user_id": u["user_id"]})
    return {"ok": True, "token": make_jwt(u["user_id"], new_ver), "user": user_public({**u, "verified": True})}




@api.get("/auth/me")
async def auth_me(u: dict = Depends(require_user)):
    await ensure_handle(u["user_id"], u.get("name"))
    await _touch(u["user_id"])
    u = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "password_hash": 0})
    pub = user_public(u)
    try:
        champions = await compute_champions()
        pub["champion_disciplines"] = champions.get(u["user_id"], [])
    except Exception as e:
        log.warning(f"champion compute: {e}")
        pub["champion_disciplines"] = []
    return {"user": pub}


class ReminderPrefReq(BaseModel):
    hours: int


@api.put("/me/reminder-preference")
async def set_reminder_preference(body: ReminderPrefReq, u: dict = Depends(require_user)):
    if body.hours not in (0, 1, 3, 12):
        raise HTTPException(400, "Choose Off, 1, 3 or 12 hours.")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"reminder_hours": body.hours}})
    return {"ok": True, "reminder_hours": body.hours}


class DisplayNameReq(BaseModel):
    name: str


@api.put("/me/display-name")
async def set_display_name(body: DisplayNameReq, u: dict = Depends(require_user)):
    """Let a member set/update the display name shown in chats and to the gym.
    Useful for Apple 'Hide My Email' sign-ins that arrive without a name."""
    name = (body.name or "").strip()
    if len(name) < 2:
        raise HTTPException(400, "Please enter your name (at least 2 characters).")
    if "@" in name:
        raise HTTPException(400, "Name cannot contain an email address.")
    name = name[:40]
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"name": name}})
    fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user": user_public(fresh)}


class DobReq(BaseModel):
    date_of_birth: str  # ISO date YYYY-MM-DD


@api.put("/me/date-of-birth")
async def set_date_of_birth(body: DobReq, u: dict = Depends(require_user)):
    """One-time capture of DOB for accounts that don't have one (e.g. Google/Apple
    social sign-ins), so the under-13 messaging age rule can apply to everyone.
    Set-once: cannot be changed via this endpoint after it's saved, so the age
    gate can't be self-lifted by editing DOB."""
    if u.get("date_of_birth"):
        raise HTTPException(400, "Your date of birth is already on file and can't be changed here.")
    try:
        dob = datetime.strptime(body.date_of_birth.strip(), "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(400, "Enter a valid date of birth")
    today = now_utc().date()
    if dob > today:
        raise HTTPException(400, "Date of birth can't be in the future")
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if age > 120:
        raise HTTPException(400, "Please enter a valid date of birth")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"date_of_birth": dob.isoformat()}})
    fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user": user_public(fresh)}


class BugReportReq(BaseModel):
    message: str
    screenshot: Optional[str] = None  # data URI (base64), optional
    platform: Optional[str] = None
    app_version: Optional[str] = None


@api.post("/bug-reports")
async def submit_bug_report(body: BugReportReq, u: dict = Depends(require_user)):
    """Member-submitted bug report / feedback. Stored for admin review and emailed
    to the gym. An optional screenshot (base64 data URI) is capped in size."""
    message = (body.message or "").strip()
    if len(message) < 5:
        raise HTTPException(400, "Please describe the issue in a little more detail.")
    if len(message) > 4000:
        message = message[:4000]

    screenshot = body.screenshot or None
    # Cap the screenshot payload so a huge image can't bloat the DB / email.
    if screenshot and len(screenshot) > 3_000_000:
        raise HTTPException(400, "That screenshot is too large. Please try a smaller image.")

    report_id = new_id("bug")
    doc = {
        "report_id": report_id,
        "user_id": u["user_id"],
        "user_name": u.get("name") or "Member",
        "user_email": u.get("email"),
        "message": message,
        "screenshot": screenshot,
        "platform": (body.platform or "")[:40],
        "app_version": (body.app_version or "")[:40],
        "status": "open",
        "created_at": now_utc(),
    }
    await db.bug_reports.insert_one(doc)

    # Email the gym a summary, attaching the screenshot when provided.
    lines = [
        f"<b>From:</b> {u.get('name') or 'Member'} ({u.get('email')})",
        f"<b>Device:</b> {doc['platform'] or '—'} · App {doc['app_version'] or '—'}",
        "<b>Report:</b>",
        message.replace("\n", "<br>"),
    ]
    attachments = None
    if screenshot and screenshot.startswith("data:"):
        try:
            b64 = screenshot.split(",", 1)[1]
            attachments = [{"filename": f"bug-{report_id}.jpg", "content": b64}]
        except Exception:
            attachments = None

    # Fire-and-forget the email so the member's submit returns immediately even if
    # the email provider is slow/rate-limited (the report is already saved above).
    async def _send_bug_email():
        try:
            await send_email(
                GYM_ADMIN_EMAIL,
                f"New bug report from {u.get('name') or 'a member'}",
                _email_shell("New bug report / feedback", lines),
                attachments=attachments,
            )
        except Exception as e:
            log.error(f"bug report email failed: {e}")

    asyncio.create_task(_send_bug_email())

    return {"ok": True, "report_id": report_id}


@api.get("/admin/bug-reports")
async def admin_list_bug_reports(u: dict = Depends(require_admin)):
    reports = await db.bug_reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    for r in reports:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    open_count = sum(1 for r in reports if r.get("status") == "open")
    return {"reports": reports, "open_count": open_count}


class BugStatusReq(BaseModel):
    status: str  # "open" | "resolved"


@api.put("/admin/bug-reports/{report_id}")
async def admin_update_bug_report(report_id: str, body: BugStatusReq, u: dict = Depends(require_admin)):
    if body.status not in ("open", "resolved"):
        raise HTTPException(400, "Invalid status.")
    r = await db.bug_reports.update_one({"report_id": report_id}, {"$set": {"status": body.status}})
    if r.matched_count == 0:
        raise HTTPException(404, "Report not found.")
    return {"ok": True, "status": body.status}



class CalReminderPrefReq(BaseModel):
    minutes: int


@api.put("/me/calendar-reminder")
async def set_calendar_reminder_default(body: CalReminderPrefReq, u: dict = Depends(require_user)):
    if body.minutes not in (60, 1440):
        raise HTTPException(400, "Choose 1 hour (60) or 1 day (1440).")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"cal_reminder_default": body.minutes}})
    return {"ok": True, "cal_reminder_default": body.minutes}


class QuickActionsOrderReq(BaseModel):
    order: List[str]


@api.put("/me/quick-actions")
async def set_quick_actions_order(body: QuickActionsOrderReq, u: dict = Depends(require_user)):
    # Store the member's preferred Quick Actions order (list of action keys). Keys are
    # validated on the client against the known set; we cap length + string type here.
    order = [str(k)[:40] for k in (body.order or [])][:30]
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"quick_actions_order": order}})
    return {"ok": True, "quick_actions_order": order}


class ChildReq(BaseModel):
    name: str
    age: int


def _clean_child(body: ChildReq):
    name = (body.name or "").strip()[:40]
    if not name:
        raise HTTPException(400, "Please enter the child's name.")
    try:
        age = int(body.age)
    except Exception:
        raise HTTPException(400, "Please enter a valid age.")
    if not (1 <= age <= 100):
        raise HTTPException(400, "Please enter a valid age between 1 and 100.")
    return name, age


async def _children_of(user_id: str) -> list:
    fresh = await db.users.find_one({"user_id": user_id}, {"_id": 0, "children": 1})
    return (fresh or {}).get("children") or []


@api.get("/me/children")
async def list_children(u: dict = Depends(require_user)):
    return {"children": await _children_of(u["user_id"])}


@api.post("/me/children")
async def add_child(body: ChildReq, u: dict = Depends(require_user)):
    name, age = _clean_child(body)
    if len(await _children_of(u["user_id"])) >= 15:
        raise HTTPException(400, "You can save up to 15 children.")
    child = {"child_id": new_id("kid"), "name": name, "age": age}
    await db.users.update_one({"user_id": u["user_id"]}, {"$push": {"children": child}})
    return {"children": await _children_of(u["user_id"])}


@api.put("/me/children/{child_id}")
async def update_child(child_id: str, body: ChildReq, u: dict = Depends(require_user)):
    name, age = _clean_child(body)
    r = await db.users.update_one(
        {"user_id": u["user_id"], "children.child_id": child_id},
        {"$set": {"children.$.name": name, "children.$.age": age}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Child not found.")
    return {"children": await _children_of(u["user_id"])}


@api.delete("/me/children/{child_id}")
async def delete_child(child_id: str, u: dict = Depends(require_user)):
    await db.users.update_one({"user_id": u["user_id"]}, {"$pull": {"children": {"child_id": child_id}}})
    return {"children": await _children_of(u["user_id"])}


class MessageNotifPrefReq(BaseModel):
    enabled: bool


@api.put("/me/message-notifications")
async def set_message_notifications(body: MessageNotifPrefReq, u: dict = Depends(require_user)):
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"message_notifications": bool(body.enabled)}})
    return {"ok": True, "message_notifications": bool(body.enabled)}


class LeaderboardOptReq(BaseModel):
    opt_out: bool


@api.put("/me/leaderboard-visibility")
async def set_leaderboard_visibility(body: LeaderboardOptReq, u: dict = Depends(require_user)):
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"leaderboard_opt_out": bool(body.opt_out)}})
    return {"ok": True, "leaderboard_opt_out": bool(body.opt_out)}


def _leaderboard_name(u: dict) -> str:
    fn = (u.get("first_name") or "").strip()
    ln = (u.get("last_name") or "").strip()
    if fn:
        return f"{fn} {ln[0].upper()}." if ln else fn
    return (u.get("name") or "Member").strip()


@api.get("/leaderboard")
async def attendance_leaderboard(period: str = "all", discipline: str = "all", u: dict = Depends(require_user)):
    """Ranks members by confirmed class attendance (QR/scan or manual). Top 30 + the caller's own rank."""
    match: dict = {"attended": True}
    if discipline and discipline != "all":
        match["class_name"] = discipline
    now_l = qld_now_naive()
    if period == "month":
        start = now_l.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        match["checked_in_at"] = {"$gte": start - timedelta(hours=10)}  # back to UTC
    elif period == "year":
        start = now_l.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        match["checked_in_at"] = {"$gte": start - timedelta(hours=10)}
    # Distinct disciplines that have any confirmed attendance (for the filter chips).
    disciplines = sorted([d for d in await db.bookings.distinct("class_name", {"attended": True}) if d])
    rows = await db.bookings.aggregate([
        {"$match": match},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]).to_list(5000)
    counts = {r["_id"]: int(r["count"]) for r in rows if r.get("_id")}
    if not counts:
        return {"period": period, "discipline": discipline, "disciplines": disciplines, "leaderboard": [], "me": {"rank": None, "count": 0, "opted_out": bool(u.get("leaderboard_opt_out")), "streak": 0}}
    users = {us["user_id"]: us for us in await db.users.find(
        {"user_id": {"$in": list(counts.keys())}},
        {"_id": 0, "user_id": 1, "first_name": 1, "last_name": 1, "name": 1, "picture": 1, "leaderboard_opt_out": 1, "is_test": 1},
    ).to_list(5000)}
    # Participants = attended members who haven't opted out (and not the test/demo account).
    participants = [
        {"user_id": uid, "count": c, "u": users.get(uid, {})}
        for uid, c in counts.items()
        if uid in users and not users[uid].get("leaderboard_opt_out") and not users[uid].get("is_test")
    ]
    participants.sort(key=lambda x: (-x["count"], _leaderboard_name(x["u"]).lower()))
    board = [{
        "rank": i + 1,
        "user_id": p["user_id"],
        "name": _leaderboard_name(p["u"]),
        "picture": p["u"].get("picture"),
        "count": p["count"],
        "is_me": p["user_id"] == u["user_id"],
    } for i, p in enumerate(participants[:30])]
    # ----- Weekly streaks (consecutive QLD weeks with ≥1 confirmed attendance) -----
    needed = {p["user_id"] for p in participants[:30]} | {u["user_id"]}
    wk_filter: dict = {"attended": True, "checked_in_at": {"$ne": None}, "user_id": {"$in": list(needed)}}
    if discipline and discipline != "all":
        wk_filter["class_name"] = discipline
    wk_docs = await db.bookings.find(
        wk_filter,
        {"_id": 0, "user_id": 1, "checked_in_at": 1},
    ).to_list(20000)
    EPOCH_MON = datetime(1970, 1, 5)  # a Monday
    def week_idx(dt: datetime) -> int:
        local = (dt.replace(tzinfo=None) + timedelta(hours=10)) if dt.tzinfo is None else (dt.astimezone(timezone.utc).replace(tzinfo=None) + timedelta(hours=10))
        return (local.date() - EPOCH_MON.date()).days // 7
    cur_week = (qld_now_naive().date() - EPOCH_MON.date()).days // 7
    weeks_by_user: dict = {}
    for d in wk_docs:
        ci = d.get("checked_in_at")
        if isinstance(ci, datetime):
            weeks_by_user.setdefault(d["user_id"], set()).add(week_idx(ci))
    def streak_for(uid: str) -> int:
        weeks = sorted(weeks_by_user.get(uid, set()))
        if not weeks or weeks[-1] < cur_week - 1:
            return 0
        s, w = 1, weeks[-1]
        for prev in reversed(weeks[:-1]):
            if prev == w - 1:
                s += 1; w = prev
            elif prev == w:
                continue
            else:
                break
        return s
    # ----- Movement vs last calendar month -----
    m_start = now_l.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_start = (m_start - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_match: dict = {"attended": True, "checked_in_at": {"$gte": prev_start - timedelta(hours=10), "$lt": m_start - timedelta(hours=10)}}
    if discipline and discipline != "all":
        prev_match["class_name"] = discipline
    prev_rows = await db.bookings.aggregate([
        {"$match": prev_match},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]).to_list(5000)
    prev_parts = [
        {"user_id": r["_id"], "count": int(r["count"])}
        for r in prev_rows
        if r.get("_id") in users and not users[r["_id"]].get("leaderboard_opt_out") and not users[r["_id"]].get("is_test")
    ]
    prev_parts.sort(key=lambda x: -x["count"])
    prev_rank = {p["user_id"]: i + 1 for i, p in enumerate(prev_parts)}
    for row in board:
        row["streak"] = streak_for(row["user_id"])
        pr = prev_rank.get(row["user_id"])
        row["movement"] = None if pr is None else (pr - row["rank"])  # +up / -down / 0 same; None = new
    # Caller's own standing (shown even if outside Top 30 or opted out).
    my_count = counts.get(u["user_id"], 0)
    opted_out = bool(u.get("leaderboard_opt_out"))
    if opted_out or u.get("is_test"):
        my_rank = None
    else:
        my_rank = next((p["rank"] for p in board if p["is_me"]), None)
        if my_rank is None:
            my_rank = sum(1 for p in participants if p["count"] > my_count) + 1 if my_count > 0 else None
    return {
        "period": period,
        "discipline": discipline,
        "disciplines": disciplines,
        "leaderboard": board,
        "me": {"rank": my_rank, "count": my_count, "opted_out": opted_out, "streak": streak_for(u["user_id"])},
    }


_champions_cache: dict = {"ts": 0.0, "data": {}}


async def compute_champions() -> dict:
    """Return {user_id: [discipline, ...]} for the current #1 all-time attendee of each
    discipline (confirmed attendance). Excludes opted-out/test members and trial classes.
    Cached ~5 minutes to keep it cheap on the hot /auth/me path."""
    now_ts = time.monotonic()
    if _champions_cache["data"] and (now_ts - _champions_cache["ts"] < 300):
        return _champions_cache["data"]
    rows = await db.bookings.aggregate([
        {"$match": {"attended": True, "class_name": {"$ne": None}}},
        {"$group": {"_id": {"cls": "$class_name", "uid": "$user_id"}, "count": {"$sum": 1}}},
    ]).to_list(40000)
    uids = {r["_id"].get("uid") for r in rows if r["_id"].get("uid")}
    users = {}
    if uids:
        users = {us["user_id"]: us for us in await db.users.find(
            {"user_id": {"$in": list(uids)}},
            {"_id": 0, "user_id": 1, "first_name": 1, "last_name": 1, "name": 1, "leaderboard_opt_out": 1, "is_test": 1},
        ).to_list(40000)}
    by_disc: dict = {}
    for r in rows:
        cls = r["_id"].get("cls"); uid = r["_id"].get("uid")
        if not cls or not uid or uid not in users:
            continue
        if str(cls).startswith("Free Trial"):
            continue
        if users[uid].get("leaderboard_opt_out") or users[uid].get("is_test"):
            continue
        by_disc.setdefault(cls, []).append({"uid": uid, "count": int(r["count"]), "u": users[uid]})
    champions: dict = {}
    for cls, parts in by_disc.items():
        parts.sort(key=lambda x: (-x["count"], _leaderboard_name(x["u"]).lower()))
        if parts and parts[0]["count"] > 0:
            champions.setdefault(parts[0]["uid"], []).append(cls)
    _champions_cache["ts"] = now_ts
    _champions_cache["data"] = champions
    return champions


async def _msg_notifs_on(user_id: str) -> bool:
    """Whether a member wants message notifications (default on)."""
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "message_notifications": 1})
    return bool((doc or {}).get("message_notifications", True))


def _hm(s: str) -> int:
    h, m = str(s).split(":")
    return int(h) * 60 + int(m)


def _quiet_window(start: str, end: str) -> bool:
    """Is the current Brisbane time inside [start, end) (handles overnight wrap)?"""
    try:
        now = now_utc() + timedelta(hours=10)  # QLD local (no DST)
        nm = now.hour * 60 + now.minute
        s, e = _hm(start), _hm(end)
    except Exception:
        return False
    if s == e:
        return False
    return (s <= nm < e) if s < e else (nm >= s or nm < e)


async def _in_quiet_now(user_id: str) -> bool:
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "quiet_hours": 1})
    qh = (doc or {}).get("quiet_hours")
    if not qh or not qh.get("enabled"):
        return False
    return _quiet_window(qh.get("start", "22:00"), qh.get("end", "07:00"))


class QuietHoursReq(BaseModel):
    enabled: bool
    start: str = "22:00"
    end: str = "07:00"


@api.put("/me/quiet-hours")
async def set_quiet_hours(body: QuietHoursReq, u: dict = Depends(require_user)):
    import re as _re
    if not _re.match(r"^([01]\d|2[0-3]):[0-5]\d$", body.start or "") or not _re.match(r"^([01]\d|2[0-3]):[0-5]\d$", body.end or ""):
        raise HTTPException(400, "Times must be in HH:MM (24h) format.")
    qh = {"enabled": bool(body.enabled), "start": body.start, "end": body.end}
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"quiet_hours": qh}})
    return {"ok": True, "quiet_hours": qh}



class ChangePasswordReq(BaseModel):
    current_password: str
    new_password: str


@api.post("/auth/change-password")
async def auth_change_password(body: ChangePasswordReq, u: dict = Depends(require_user)):
    full = await db.users.find_one({"user_id": u["user_id"]})
    if not full or not full.get("password_hash"):
        raise HTTPException(400, "This account can't change password here.")
    if not check_pw(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Your current password is incorrect.")
    validate_password_strength(body.new_password)
    if check_pw(body.new_password, full["password_hash"]):
        raise HTTPException(400, "Your new password must be different from your current one.")
    new_ver = int(full.get("token_version", 0) or 0) + 1
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"password_hash": hash_pw(body.new_password), "token_version": new_ver}},
    )
    # Log out other devices; keep this session by returning a fresh token.
    await db.user_sessions.delete_many({"user_id": u["user_id"]})
    return {"ok": True, "token": make_jwt(u["user_id"], new_ver)}



@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        # Remove any Google/Emergent session row for this token.
        await db.user_sessions.delete_one({"session_token": token})
        # Revoke all previously-issued JWTs for this user by bumping token_version.
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            uid = payload.get("sub")
            if uid:
                await db.users.update_one({"user_id": uid}, {"$inc": {"token_version": 1}})
        except Exception:
            pass
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
# ==================== Recurring schedule (templates + exceptions) ====================
def _tmpl_slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def _make_template_id(name: str, category: str, weekday: int, hour: int, minute: int = 0) -> str:
    return f"tmpl_{_tmpl_slug(name)}_{_tmpl_slug(category)}_{weekday}_{hour:02d}{minute:02d}"


async def _active_exceptions() -> list:
    return await db.schedule_exceptions.find({"active": {"$ne": False}}, {"_id": 0}).to_list(500)


def _exception_hits(exc: dict, tmpl: dict, date_iso: str) -> bool:
    if not (exc.get("start_date", "") <= date_iso <= exc.get("end_date", "")):
        return False
    if exc.get("scope") == "all":
        return True
    if tmpl.get("name") in (exc.get("class_names") or []):
        return True
    if tmpl.get("category") in (exc.get("categories") or []):
        return True
    return False


def _is_blocked(tmpl: dict, date_iso: str, excs: list) -> bool:
    return any(_exception_hits(e, tmpl, date_iso) for e in excs)


def _instance_from_template(tmpl: dict, d) -> dict:
    """Build a (virtual) dated class instance for date `d` from a weekly template."""
    start = datetime(d.year, d.month, d.day, int(tmpl.get("hour") or 0), int(tmpl.get("minute") or 0))
    inst = {k: tmpl.get(k) for k in (
        "name", "category", "trainer", "level", "duration_min", "price_cents", "currency",
        "image", "images", "description", "program", "color", "capacity", "min_age", "max_age")}
    inst["class_id"] = f"{tmpl['template_id']}__{d.isoformat()}"
    inst["template_id"] = tmpl["template_id"]
    inst["start_at"] = start
    inst["by_appointment"] = False
    inst["recurring"] = True
    return inst


async def _generate_instances(days_ahead: int, category: Optional[str]) -> list:
    templates = await db.class_templates.find({"active": {"$ne": False}}, {"_id": 0}).to_list(500)
    excs = await _active_exceptions()
    start_day = ((now_utc() + timedelta(hours=10)).replace(tzinfo=None)).date()
    end_day = start_day + timedelta(days=days_ahead)
    mats = await db.classes.find({"template_id": {"$exists": True}, "cancelled": {"$ne": True}}, {"_id": 0}).to_list(5000)
    mat_map = {m["class_id"]: m for m in mats}
    out = []
    for t in templates:
        if category and category.lower() != "all" and t.get("category") != category:
            continue
        wd = int(t.get("weekday", 0))
        delta = (wd - start_day.weekday()) % 7
        d = start_day + timedelta(days=delta)
        while d <= end_day:
            di = d.isoformat()
            if not _is_blocked(t, di, excs):
                out.append(mat_map.get(f"{t['template_id']}__{di}") or _instance_from_template(t, d))
            d += timedelta(days=7)
    return out


async def _resolve_class(class_id: str) -> Optional[dict]:
    """Return a class doc: a real/materialised one if present, else a virtual instance
    generated from its template (None if it's a blocked date or unknown)."""
    doc = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if doc:
        return doc
    if "__" not in class_id:
        return None
    template_id, _, date_iso = class_id.rpartition("__")
    tmpl = await db.class_templates.find_one({"template_id": template_id}, {"_id": 0})
    if not tmpl:
        return None
    try:
        d = datetime.fromisoformat(date_iso).date()
    except Exception:
        return None
    if d.weekday() != int(tmpl.get("weekday", -1)):
        return None  # date doesn't fall on this class's weekly day
    excs = await _active_exceptions()
    if _is_blocked(tmpl, date_iso, excs):
        return None
    return _instance_from_template(tmpl, d)


async def _materialize_class(class_id: str) -> Optional[dict]:
    """Ensure a real class doc exists for a (possibly virtual) instance id, creating it
    on first booking so bookings/QR/stats have a concrete record to reference."""
    existing = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if existing:
        return existing
    inst = await _resolve_class(class_id)
    if not inst:
        return None
    inst = dict(inst)
    inst.setdefault("currency", "aud")
    inst["created_at"] = now_utc()
    inst.pop("recurring", None)
    await db.classes.insert_one(dict(inst))
    inst.pop("_id", None)
    return inst


@api.get("/schedule/breaks")
async def schedule_breaks(authorization: Optional[str] = Header(None)):
    """Classes currently on a break (inside an active exception window today), with the
    next date each one resumes — powers the 'on holiday, book next term' prompts."""
    excs = await _active_exceptions()
    if not excs:
        return {"breaks": []}
    today = ((now_utc() + timedelta(hours=10)).replace(tzinfo=None)).date()
    today_iso = today.isoformat()
    templates = await db.class_templates.find({"active": {"$ne": False}}, {"_id": 0}).to_list(500)

    def _label(t: dict) -> str:
        return f"{t.get('category')} {t.get('name')}" if t.get("category") == "Kids" else t.get("name")

    def _first_resume_after(t: dict, after_iso: str) -> Optional[object]:
        wd = int(t.get("weekday", 0))
        d = datetime.fromisoformat(after_iso).date() + timedelta(days=1)
        d = d + timedelta(days=(wd - d.weekday()) % 7)
        for _ in range(0, 60):
            if not _is_blocked(t, d.isoformat(), excs):
                return d
            d += timedelta(days=7)
        return None

    out: dict = {}
    for e in excs:
        if not (e.get("start_date", "") <= today_iso <= e.get("end_date", "")):
            continue  # only breaks happening right now
        for t in templates:
            blocked = (e.get("scope") == "all" or t.get("name") in (e.get("class_names") or [])
                       or t.get("category") in (e.get("categories") or []))
            if not blocked:
                continue
            rd = _first_resume_after(t, e.get("end_date"))
            if not rd:
                continue
            lbl = _label(t)
            cur = out.get(lbl)
            if not cur or rd < cur["_rd"]:
                out[lbl] = {
                    "label": lbl, "reason": e.get("label"), "until": e.get("end_date"),
                    "resumes_on": rd.isoformat(),
                    "resumes_label": rd.strftime("%a %d %b").replace(" 0", " "),
                    "resumes_class_id": f"{t['template_id']}__{rd.isoformat()}",
                    "_rd": rd,
                }
    breaks = []
    for v in out.values():
        v.pop("_rd", None)
        breaks.append(v)
    breaks.sort(key=lambda b: b["resumes_on"])
    # Attach demand-interest counts (and whether the caller has joined).
    me = await get_user_by_token(authorization)
    for b in breaks:
        cid = b["resumes_class_id"]
        b["interest_count"] = await db.term_interest.count_documents({"class_id": cid})
        b["mine"] = bool(me and await db.term_interest.find_one({"class_id": cid, "user_id": me["user_id"]}))
    return {"breaks": breaks}


class InterestReq(BaseModel):
    class_id: str


@api.post("/schedule/breaks/interest")
async def break_interest_join(body: InterestReq, u: dict = Depends(require_user)):
    """Register interest in the first class back after a break, so admins can gauge
    demand early. Materialises the (virtual) class so it has a real record."""
    cls = await _materialize_class(body.class_id)
    if not cls:
        raise HTTPException(404, "Class not found.")
    await db.term_interest.update_one(
        {"class_id": body.class_id, "user_id": u["user_id"]},
        {"$setOnInsert": {"class_id": body.class_id, "user_id": u["user_id"],
                          "user_name": u.get("name"), "user_email": u.get("email"),
                          "created_at": now_utc()}},
        upsert=True,
    )
    count = await db.term_interest.count_documents({"class_id": body.class_id})
    return {"ok": True, "count": count, "mine": True}


@api.delete("/schedule/breaks/interest/{class_id}")
async def break_interest_leave(class_id: str, u: dict = Depends(require_user)):
    await db.term_interest.delete_one({"class_id": class_id, "user_id": u["user_id"]})
    count = await db.term_interest.count_documents({"class_id": class_id})
    return {"ok": True, "count": count, "mine": False}


@api.get("/admin/term-interest")
async def admin_term_interest(u: dict = Depends(require_admin)):
    """Members who've registered interest in a returning class, grouped by class, so
    admins can plan numbers."""
    rows = await db.term_interest.find({}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    groups: dict = {}
    for r in rows:
        cid = r["class_id"]
        g = groups.get(cid)
        if not g:
            cls = await _resolve_class(cid)
            label = "Class"
            start_label = ""
            if cls:
                label = f"{cls.get('category')} {cls.get('name')}" if cls.get("category") == "Kids" else cls.get("name")
                sa = cls.get("start_at")
                if isinstance(sa, datetime):
                    start_label = sa.strftime("%a %d %b %Y").replace(" 0", " ")
            g = groups[cid] = {"class_id": cid, "class_label": label, "when": start_label, "members": []}
        g["members"].append({"name": r.get("user_name") or "Member", "email": r.get("user_email")})
    out = sorted(groups.values(), key=lambda x: x["when"] or "")
    for g in out:
        g["count"] = len(g["members"])
    return {"groups": out}


@api.post("/admin/term-interest/{class_id}/notify")
async def admin_notify_interest(class_id: str, u: dict = Depends(require_admin)):
    """Tell everyone on the interest list that the class is back and bookable, then
    clear the list so they aren't messaged twice."""
    rows = await db.term_interest.find({"class_id": class_id}, {"_id": 0}).to_list(5000)
    if not rows:
        raise HTTPException(404, "No one is on this interest list.")
    cls = await _resolve_class(class_id)
    label = "Your class"
    when = ""
    if cls:
        label = f"{cls.get('category')} {cls.get('name')}" if cls.get("category") == "Kids" else cls.get("name")
        sa = cls.get("start_at")
        if isinstance(sa, datetime):
            when = sa.strftime("%a %d %b").replace(" 0", " ")
    title = f"{label} is back!"
    msg = f"{label} is back{f' from {when}' if when else ''} — book your spot now before it fills up."
    uids = [r["user_id"] for r in rows]
    for uid in uids:
        await create_notification(uid, title, msg, "booking", {"nav": f"/class/{class_id}"})
    await send_push(uids, {"title": title, "message": msg, "nav": f"/class/{class_id}"}, idempotency_key=f"termback_{class_id}")
    await db.term_interest.delete_many({"class_id": class_id})
    return {"ok": True, "notified": len(uids)}


@api.get("/classes")
async def classes_list(category: Optional[str] = None, include_ended: bool = False, days: int = 60):
    now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)
    # Generate recurring instances from weekly templates (respecting exceptions) plus
    # any by-appointment classes. Materialised (already-booked) instances are merged in.
    gen = await _generate_instances(max(1, min(int(days or 60), 400)), category)
    appt_rows = await db.classes.find({"by_appointment": True, "cancelled": {"$ne": True}}, {"_id": 0}).to_list(200)
    if category and category.lower() != "all":
        appt_rows = [a for a in appt_rows if a.get("category") == category]
    rows = gen + appt_rows
    agg = await db.bookings.aggregate([
        {"$match": {"status": {"$in": ["paid", "confirmed"]}}},
        {"$group": {"_id": "$class_id", "n": {"$sum": 1}}},
    ]).to_list(5000)
    booked_map = {a["_id"]: a["n"] for a in agg}
    out = []
    for r in rows:
        ended = False
        started = False
        if not r.get("by_appointment"):
            start = r.get("start_at")
            if isinstance(start, datetime):
                s = start.replace(tzinfo=None) if start.tzinfo else start
                if s + timedelta(minutes=r.get("duration_min") or 0) < now_local:
                    ended = True
                elif s <= now_local:
                    started = True  # in progress — bookings closed
        if ended and not include_ended:
            continue
        r["ended"] = ended
        r["started"] = started
        if not r.get("by_appointment"):
            cap = r.get("capacity") or 0
            booked = booked_map.get(r["class_id"], 0)
            r["booked"] = booked
            r["spots_left"] = max(cap - booked, 0)
        out.append(r)
    out.sort(key=lambda r: (r.get("start_at") or now_local))
    return {"classes": [with_coach(r) for r in out]}



@api.get("/classes/{class_id}")
async def class_detail(class_id: str):
    c = await _resolve_class(class_id)
    if not c or c.get("cancelled"):
        raise HTTPException(404, "Class not found")
    if not c.get("by_appointment"):
        cap = c.get("capacity") or 0
        booked = await db.bookings.count_documents({"class_id": class_id, "status": {"$in": ["paid", "confirmed"]}})
        c["booked"] = booked
        c["spots_left"] = max(cap - booked, 0)
        started = False
        ended = False
        start = c.get("start_at")
        if isinstance(start, datetime):
            s = start.replace(tzinfo=None) if start.tzinfo else start
            now_local = (now_utc() + timedelta(hours=10)).replace(tzinfo=None)
            if s + timedelta(minutes=c.get("duration_min") or 0) < now_local:
                ended = True
            elif s <= now_local:
                started = True
        c["started"] = started
        c["ended"] = ended
    return with_coach(c)


# Active statuses that occupy an appointment slot (trainer can only take one at a time).
APPT_ACTIVE_STATUSES = ["pending", "paid", "confirmed", "reschedule_requested", "admin_proposed"]
# Appointment availability: Monday–Thursday, 10:30am–4:00pm (Queensland time), 30-min grid.
APPT_ALLOWED_WEEKDAYS = {0, 1, 2, 3}  # Mon=0 .. Thu=3 (Python weekday())
APPT_MIN_MINUTES = 10 * 60 + 30       # 10:30am
APPT_MAX_MINUTES = 16 * 60            # 4:00pm

DEFAULT_CANCEL_WINDOW_HOURS = 24


async def get_cancel_window_hours() -> int:
    """The minimum lead time (hours) required to cancel/reschedule. Admin-configurable."""
    doc = await db.settings.find_one({"key": "booking"}, {"_id": 0, "cancel_window_hours": 1})
    try:
        h = int((doc or {}).get("cancel_window_hours", DEFAULT_CANCEL_WINDOW_HOURS))
    except (TypeError, ValueError):
        h = DEFAULT_CANCEL_WINDOW_HOURS
    return h if 1 <= h <= 168 else DEFAULT_CANCEL_WINDOW_HOURS


def check_appt_window(requested_at: str):
    """Validate a preferred appointment time falls inside the bookable window."""
    try:
        rt = datetime.fromisoformat(requested_at)
    except Exception:
        raise HTTPException(400, "Invalid preferred time.")
    if rt.weekday() not in APPT_ALLOWED_WEEKDAYS:
        raise HTTPException(400, "Personal Training and Programs are available Monday to Thursday only.")
    mins = rt.hour * 60 + rt.minute
    if mins < APPT_MIN_MINUTES or mins > APPT_MAX_MINUTES or (mins % 30 != 0):
        raise HTTPException(400, "Please choose a time between 10:30am and 4:00pm.")
    return rt


@api.get("/appointments/taken")
async def appointments_taken(u: dict = Depends(require_user)):
    """Preferred-time slots already taken across ALL by-appointment bookings (PT + Programs)."""
    rows = await db.bookings.find(
        {"by_appointment": True, "requested_at": {"$ne": None}, "status": {"$in": APPT_ACTIVE_STATUSES}},
        {"_id": 0, "requested_at": 1},
    ).to_list(3000)
    slots = sorted({r["requested_at"] for r in rows if r.get("requested_at")})
    return {"taken": slots}


class AdminApptCreate(BaseModel):
    class_id: str
    requested_at: str            # ISO naive Queensland wall-clock
    requested_time: Optional[str] = None
    duration_min: Optional[int] = None
    note: Optional[str] = None


@api.post("/admin/appointments")
async def admin_create_appointment(body: AdminApptCreate, u: dict = Depends(require_admin)):
    """Staff blocks/books an appointment slot themselves (shows on the admin calendar, marks slot taken)."""
    cls = await db.classes.find_one({"class_id": body.class_id}, {"_id": 0})
    if not cls or not cls.get("by_appointment"):
        raise HTTPException(404, "Appointment class not found")
    check_appt_window(body.requested_at)
    taken = await db.bookings.find_one({
        "by_appointment": True, "requested_at": body.requested_at, "status": {"$in": APPT_ACTIVE_STATUSES},
    })
    if taken:
        raise HTTPException(409, "That time is already booked.")
    minutes = int(body.duration_min or cls.get("duration_min") or 30)
    display_name = f"{cls['name']} ({minutes} min)"
    doc = {
        "booking_id": new_id("bk"),
        "user_id": u["user_id"],
        "class_id": body.class_id,
        "class_name": display_name,
        "amount": 0,
        "currency": cls.get("currency", "aud"),
        "by_appointment": True,
        "duration_min": minutes,
        "status": "confirmed",
        "admin_block": True,
        "member_name": (u.get("name") or "Staff"),
        "requested_time": body.requested_time,
        "requested_at": body.requested_at,
        "note": body.note or "",
        "created_at": now_utc(),
    }
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    return {"booking": doc}



# -------------------- bookings — moved to routes/bookings.py --------------------


def make_checkin_code(booking_id: str, uid: str, exp: datetime) -> str:
    """Signed, non-guessable, single-use (via `attended` flag) door check-in token."""
    return jwt.encode({"bid": booking_id, "uid": uid, "typ": "checkin", "exp": exp}, JWT_SECRET, algorithm=JWT_ALGO)


# booking checkin-code / passes-qr / me-stats routes moved to routes/bookings.py


class ScanCheckinReq(BaseModel):
    code: str
    confirm: Optional[bool] = False  # staff confirmed a repeat walk-in (extra class / friend) — deduct another pass


@api.post("/admin/checkin/scan")
async def admin_checkin_scan(body: ScanCheckinReq, request: Request, u: dict = Depends(require_admin)):
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
        today = (now + timedelta(hours=10)).date()  # Queensland (no DST)

        # ----- One class = one pass. If this member ALREADY has a booking for a class
        # today (pass/card/credit — however they paid), the scan just CONFIRMS that
        # booking's attendance. No second pass is deducted. -----
        cands = await db.bookings.find(
            {"user_id": uid, "status": {"$in": ["paid", "confirmed"]},
             "attended": {"$ne": True}, "cleared": {"$ne": True},
             "by_appointment": {"$ne": True}},
            {"_id": 0},
        ).to_list(100)
        todays = []
        for cand in cands:
            cs = cand.get("class_start")
            if isinstance(cs, str):
                try:
                    cs = datetime.fromisoformat(cs.replace("Z", "+00:00"))
                except Exception:
                    cs = None
            if isinstance(cs, datetime):
                d = (cs.replace(tzinfo=None) if cs.tzinfo else cs).date()
                if d == today:
                    todays.append((cs, cand))
        if todays:
            todays.sort(key=lambda x: x[0])
            cs0, bk = todays[0]
            admin_name = u.get("name") or u.get("email") or "Staff"
            await db.bookings.update_one(
                {"booking_id": bk["booking_id"]},
                {"$set": {"attended": True, "checked_in_at": now, "checked_in_by": admin_name,
                          "checked_in_by_id": u["user_id"], "checked_in_method": "qr"}},
            )
            await create_notification(
                uid, "Checked in ✅",
                f"You're checked in for {bk['class_name']}. Have a great session!"
                + (lambda _l: f" You have {_l} class pass{'es' if _l != 1 else ''} left." if _l > 0 else "")(int((member or {}).get("class_pass_credits", 0))),
                "booking",
            )
            when_str = (cs0.replace(tzinfo=None) if cs0.tzinfo else cs0).strftime("%-I:%M %p")
            return {
                "ok": True,
                "member_name": mname,
                "class_name": bk["class_name"],
                "when": f"Booking confirmed · {when_str} — no pass deducted",
                "existing_booking": True,
                "passes_left": int(member.get("class_pass_credits", 0)),
                "child_name": bk.get("child_name"),
                "child_age": bk.get("child_age"),
            }

        # ----- No booking today → treat as a casual walk-in and deduct 1 class pass. -----
        # But if this member has ALREADY checked in as a walk-in today, don't silently
        # deduct another pass — ask staff to confirm first (e.g. they're doing a second
        # class, or checking in a friend/guest who came with them). Only when the scan
        # is re-sent with confirm=True do we proceed to deduct another pass.
        qld_today = datetime(today.year, today.month, today.day)  # QLD wall-clock midnight
        day_start_utc = (qld_today - timedelta(hours=10)).replace(tzinfo=timezone.utc)
        prior_today = await db.pass_redemptions.count_documents({
            "user_id": uid, "redeemed_at": {"$gte": day_start_utc},
        })
        if prior_today > 0 and not body.confirm:
            return {
                "ok": True,
                "needs_confirm": True,
                "member_name": mname,
                "already_today": int(prior_today),
                "passes_left": int(member.get("class_pass_credits", 0)),
                "class_name": "Class Pass entry",
                "when": f"Already checked in today ({prior_today} pass{'es' if prior_today != 1 else ''} used)",
            }
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
            "repeat_today": int(prior_today) > 0,
        })
        await create_notification(
            uid, "Class pass used ✅",
            f"You checked in with a class pass. {left} pass{'es' if left != 1 else ''} left.",
            "booking", data={"nav": "member_wallet"},
        )
        await low_pass_nudge(uid, (member or {}).get("email"), left, base_url=_public_base(request))
        checkin_no = int(prior_today) + 1
        return {
            "ok": True,
            "member_name": mname,
            "class_name": "Class Pass entry" if checkin_no == 1 else f"Class Pass entry (#{checkin_no} today)",
            "when": f"{left} pass{'es' if left != 1 else ''} left",
            "passes_left": left,
            "repeat_today": checkin_no > 1,
        }

    if data.get("typ") != "checkin" or not data.get("bid"):
        raise HTTPException(400, "This isn't a valid check-in code.")
    b = await db.bookings.find_one({"booking_id": data["bid"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found.")
    if b.get("status") == "cancelled" or b.get("refund_status") in ("pending", "pass_returned", "resolved", "credited"):
        raise HTTPException(400, "This booking was cancelled/refunded — no check-in available.")
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
            "child_name": b.get("child_name"),
            "child_age": b.get("child_age"),
        }

    admin_name = u.get("name") or u.get("email") or "Staff"
    await db.bookings.update_one(
        {"booking_id": b["booking_id"]},
        {"$set": {"attended": True, "checked_in_at": now_utc(),
                  "checked_in_by": admin_name, "checked_in_by_id": u["user_id"],
                  "checked_in_method": "qr"}},
    )
    # If this is a free-trial booking, mark the trial redeemed so it can't be reused.
    if b.get("is_trial") and b.get("trial_id"):
        await db.free_trials.update_one(
            {"trial_id": b["trial_id"]},
            {"$set": {"status": "redeemed", "redeemed_at": now_utc(), "redeemed_by": admin_name}},
        )
    _left = int((member or {}).get("class_pass_credits", 0))
    _msg = f"You're checked in for {b['class_name']}. Have a great session!"
    if b.get("paid_with_pass") or _left > 0:
        _msg += f" You have {_left} class pass{'es' if _left != 1 else ''} left."
    await create_notification(
        b["user_id"],
        "Checked in ✅",
        _msg,
        "booking",
    )
    return {
        "ok": True,
        "already": False,
        "member_name": mname,
        "class_name": b["class_name"],
        "when": when_str,
        "child_name": b.get("child_name"),
        "child_age": b.get("child_age"),
    }

# messaging member routes moved to routes/messages.py


# ==================== Member profile photo, friends & direct messages ====================
class PhotoReq(BaseModel):
    image: str


@api.post("/me/photo")
async def set_my_photo(body: PhotoReq, u: dict = Depends(require_user)):
    img = (body.image or "").strip()
    if not img.startswith("data:image"):
        raise HTTPException(400, "Invalid image.")
    if len(img) > 2_800_000:
        raise HTTPException(400, "Image is too large. Please choose a smaller photo.")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"picture": img}})
    return {"ok": True, "picture": img}


# ==================== OUR GYM gallery — moved to routes/gym.py ====================


async def _friend_status(me: str, other: str) -> str:
    if await db.blocks.find_one({"blocker_id": me, "blocked_id": other}):
        return "blocked"
    if await db.blocks.find_one({"blocker_id": other, "blocked_id": me}):
        return "blocked_by"
    f = await db.friendships.find_one({"key": _dm_key(me, other)}, {"_id": 0})
    if not f:
        return "none"
    if f["status"] == "accepted":
        return "friends"
    return "pending_out" if f.get("requester_id") == me else "pending_in"


ALLOWED_REACTIONS = ["👍", "🔥", "😂", "❤️", "😮", "🙏"]


def _reactions_summary(msg: dict, uid: str) -> list:
    rx = msg.get("reactions") or {}
    out = []
    for emoji in ALLOWED_REACTIONS:
        users = rx.get(emoji) or []
        if users:
            out.append({"emoji": emoji, "count": len(users), "mine": uid in users})
    return out


def _member_card(u: dict) -> dict:
    la = u.get("last_active_at")
    return {"user_id": u.get("user_id"), "name": clean_display(u.get("name")), "handle": u.get("handle"), "picture": u.get("picture"),
            "last_active_at": la.isoformat() if isinstance(la, datetime) else None}


@api.get("/members/search")
async def members_search(q: str, u: dict = Depends(require_user)):
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}
    query = {
        "user_id": {"$ne": u["user_id"]},
        "$or": [
            {"name": {"$regex": re.escape(q), "$options": "i"}},
            {"handle": {"$regex": f"^{re.escape(q)}$", "$options": "i"}},
        ],
    }
    rows = await db.users.find(query, {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "picture": 1}).limit(20).to_list(20)
    out = []
    for r in rows:
        st = await _friend_status(u["user_id"], r["user_id"])
        if st in ("blocked", "blocked_by"):
            continue
        out.append({**_member_card(r), "friend_status": st})
    return {"results": out}


class FriendReq(BaseModel):
    user_id: Optional[str] = None
    handle: Optional[str] = None


@api.post("/friends/request")
async def friend_request(body: FriendReq, u: dict = Depends(require_user)):
    await ensure_handle(u["user_id"], u.get("name"))
    target = None
    if body.user_id:
        target = await db.users.find_one({"user_id": body.user_id}, {"_id": 0})
    elif body.handle:
        target = await db.users.find_one({"handle": {"$regex": f"^{re.escape(body.handle.strip())}$", "$options": "i"}}, {"_id": 0})
    if not target:
        raise HTTPException(404, "No member found with that name or account ID.")
    if target["user_id"] == u["user_id"]:
        raise HTTPException(400, "You can't add yourself.")
    st = await _friend_status(u["user_id"], target["user_id"])
    if st == "blocked_by":
        raise HTTPException(403, "You can't add this member.")
    if st == "friends":
        raise HTTPException(409, "You're already friends.")
    if st in ("pending_out", "pending_in"):
        raise HTTPException(409, "There's already a pending request.")
    key = _dm_key(u["user_id"], target["user_id"])
    await db.friendships.update_one(
        {"key": key},
        {"$set": {"key": key, "status": "pending", "requester_id": u["user_id"],
                  "addressee_id": target["user_id"], "created_at": now_utc()}},
        upsert=True,
    )
    await notify_user(
        target["user_id"], target.get("email"),
        "New friend request",
        f"{u.get('name') or 'A member'} wants to connect with you on the Max Energy app.",
        "friend",
        email_lines=[f"<b>{esc(u.get('name') or 'A member')}</b> sent you a friend request.",
                     "Open the app → Inbox → Add friends to accept and start chatting."],
        data={"nav": "member_inbox"},
    )
    return {"ok": True}


@api.get("/friends")
async def friends_list(u: dict = Depends(require_user)):
    me = u["user_id"]
    docs = await db.friendships.find({"key": {"$regex": re.escape(me)}}, {"_id": 0}).to_list(500)
    friends, incoming, outgoing = [], [], []
    for f in docs:
        parts = f["key"].split("|")
        other = parts[0] if parts[1] == me else parts[1]
        if me not in parts:
            continue
        ou = await db.users.find_one({"user_id": other}, {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "picture": 1, "last_active_at": 1})
        if not ou:
            continue
        if await db.blocks.find_one({"blocker_id": me, "blocked_id": other}) or await db.blocks.find_one({"blocker_id": other, "blocked_id": me}):
            continue
        card = _member_card(ou)
        if f["status"] == "accepted":
            friends.append(card)
        elif f.get("requester_id") == me:
            outgoing.append(card)
        else:
            incoming.append({**card, "friendship_key": f["key"]})
    return {"friends": friends, "incoming": incoming, "outgoing": outgoing}


class RespondReq(BaseModel):
    user_id: str
    accept: bool


@api.post("/friends/respond")
async def friend_respond(body: RespondReq, u: dict = Depends(require_user)):
    key = _dm_key(u["user_id"], body.user_id)
    f = await db.friendships.find_one({"key": key})
    if not f or f["status"] != "pending" or f.get("addressee_id") != u["user_id"]:
        raise HTTPException(404, "No pending request found.")
    if body.accept:
        await db.friendships.update_one({"key": key}, {"$set": {"status": "accepted", "accepted_at": now_utc()}})
        requester = await db.users.find_one({"user_id": body.user_id}, {"_id": 0})
        await notify_user(
            body.user_id, (requester or {}).get("email"),
            "Friend request accepted",
            f"{u.get('name') or 'A member'} accepted your friend request. Say hi!",
            "friend",
            email_lines=[f"<b>{esc(u.get('name') or 'A member')}</b> accepted your friend request.",
                         "Open the app → Inbox to start chatting."],
            data={"nav": "member_inbox"},
        )
    else:
        await db.friendships.delete_one({"key": key})
    return {"ok": True}


class BlockReq(BaseModel):
    user_id: str
    reason: Optional[str] = None


@api.post("/friends/block")
async def friend_block(body: BlockReq, u: dict = Depends(require_user)):
    await db.blocks.update_one(
        {"blocker_id": u["user_id"], "blocked_id": body.user_id},
        {"$set": {"blocker_id": u["user_id"], "blocked_id": body.user_id, "created_at": now_utc()}},
        upsert=True,
    )
    await db.friendships.delete_one({"key": _dm_key(u["user_id"], body.user_id)})
    return {"ok": True}


@api.get("/friends/blocked")
async def friends_blocked(u: dict = Depends(require_user)):
    rows = await db.blocks.find({"blocker_id": u["user_id"]}, {"_id": 0, "blocked_id": 1, "created_at": 1}).to_list(500)
    uids = [r["blocked_id"] for r in rows]
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "avatar_url": 1}).to_list(500)
    umap = {x["user_id"]: x for x in users}
    out = []
    for r in rows:
        m = umap.get(r["blocked_id"], {})
        out.append({
            "user_id": r["blocked_id"],
            "name": m.get("name") or "Member",
            "handle": m.get("handle"),
            "avatar_url": m.get("avatar_url"),
        })
    return {"blocked": out}


@api.post("/friends/unblock")
async def friend_unblock(body: BlockReq, u: dict = Depends(require_user)):
    await db.blocks.delete_one({"blocker_id": u["user_id"], "blocked_id": body.user_id})
    return {"ok": True}


@api.post("/friends/report")
async def friend_report(body: BlockReq, u: dict = Depends(require_user)):
    reported = await db.users.find_one({"user_id": body.user_id}, {"_id": 0})
    await db.reports.insert_one({
        "report_id": new_id("rep"), "reporter_id": u["user_id"], "reported_id": body.user_id,
        "reason": (body.reason or "").strip(), "created_at": now_utc(),
    })
    await notify_admins(
        "Member reported",
        f"{u.get('name') or 'A member'} reported {(reported or {}).get('name') or body.user_id}. Reason: {(body.reason or '—')[:200]}",
        "report",
        email_lines=[f"<b>{esc(u.get('name') or 'A member')}</b> reported <b>{esc((reported or {}).get('name') or body.user_id)}</b>.",
                     f"Reason: {esc(body.reason or '—')}"],
    )
    return {"ok": True}


@api.get("/dm/threads")
async def dm_threads(u: dict = Depends(require_user)):
    me = u["user_id"]
    fdocs = await db.friendships.find({"key": {"$regex": re.escape(me)}, "status": "accepted"}, {"_id": 0}).to_list(500)
    threads = []
    for f in fdocs:
        parts = f["key"].split("|")
        if me not in parts:
            continue
        other = parts[0] if parts[1] == me else parts[1]
        if await db.blocks.find_one({"blocker_id": me, "blocked_id": other}) or await db.blocks.find_one({"blocker_id": other, "blocked_id": me}):
            continue
        ou = await db.users.find_one({"user_id": other}, {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "picture": 1, "last_active_at": 1})
        if not ou:
            continue
        last = await db.dm_messages.find_one({"key": f["key"]}, {"_id": 0}, sort=[("created_at", -1)])
        unread = await db.dm_messages.count_documents({"key": f["key"], "to_id": me, "read": {"$ne": True}})
        threads.append({
            **_member_card(ou),
            "last_body": (last or {}).get("body"),
            "last_at": (last or {}).get("created_at"),
            "unread": unread,
        })
    threads.sort(key=lambda t: t.get("last_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return {"threads": threads}


@api.get("/dm/unread")
async def dm_unread(u: dict = Depends(require_user)):
    count = await db.dm_messages.count_documents({"to_id": u["user_id"], "read": {"$ne": True}})
    return {"count": count}


@api.get("/dm/{other_id}")
async def dm_messages_get(other_id: str, u: dict = Depends(require_user)):
    key = _dm_key(u["user_id"], other_id)
    f = await db.friendships.find_one({"key": key, "status": "accepted"})
    if not f:
        raise HTTPException(403, "You can only message your friends.")
    other = await db.users.find_one({"user_id": other_id}, {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "picture": 1})
    rows = await db.dm_messages.find({"key": key}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    await db.dm_messages.update_many({"key": key, "to_id": u["user_id"], "read": {"$ne": True}}, {"$set": {"read": True}})
    tdoc = await db.dm_typing.find_one({"key": key, "user_id": other_id})
    friend_typing = bool(tdoc and tdoc.get("until_ts", 0) > now_utc().timestamp())
    return {"messages": rows, "friend": _member_card(other or {}), "friend_typing": friend_typing}


@api.post("/dm/{other_id}/typing")
async def dm_typing(other_id: str, u: dict = Depends(require_user)):
    key = _dm_key(u["user_id"], other_id)
    if not await db.friendships.find_one({"key": key, "status": "accepted"}):
        raise HTTPException(403, "You can only message your friends.")
    await db.dm_typing.update_one({"key": key, "user_id": u["user_id"]},
                                  {"$set": {"until_ts": now_utc().timestamp() + 6}}, upsert=True)
    return {"ok": True}


class DMSendReq(BaseModel):
    body: str


@api.post("/dm/{other_id}")
async def dm_send(other_id: str, body: DMSendReq, u: dict = Depends(require_user)):
    require_messaging_age(u)
    await _touch(u["user_id"])
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    key = _dm_key(u["user_id"], other_id)
    f = await db.friendships.find_one({"key": key, "status": "accepted"})
    if not f:
        raise HTTPException(403, "You can only message your friends.")
    if await db.blocks.find_one({"blocker_id": other_id, "blocked_id": u["user_id"]}):
        raise HTTPException(403, "You can't message this member.")
    msg = {
        "dm_id": new_id("dm"), "key": key, "from_id": u["user_id"], "to_id": other_id,
        "sender_name": u.get("name") or u.get("email"), "body": text, "read": False, "created_at": now_utc(),
    }
    await db.dm_messages.insert_one(msg)
    other = await db.users.find_one({"user_id": other_id}, {"_id": 0})
    if await _msg_notifs_on(other_id):
        await notify_user(
            other_id, (other or {}).get("email"),
            f"New message from {msg['sender_name']}",
            f"{msg['sender_name']}: {text[:120]}",
            "message",
            email_lines=[f"<b>{esc(msg['sender_name'])}</b> sent you a message:", f"\"{esc(text)}\"",
                         "Open the app → Inbox to reply."],
            data={"nav": "member_inbox"},
        )
        await send_push(
            [other_id],
            {"title": f"New message from {msg['sender_name']}", "message": text[:140], "action_url": "/inbox"},
            idempotency_key=msg["dm_id"],
        )

    msg.pop("_id", None)
    return {"message": msg}


# ---- presence (last seen) ----
async def _touch(uid: str) -> None:
    await db.users.update_one({"user_id": uid}, {"$set": {"last_active_at": now_utc()}})


# groups routes moved to routes/groups.py


# -------------------- payments (Square) --------------------
def _square_headers():
    return {"Authorization": f"Bearer {SQUARE_ACCESS_TOKEN}", "Square-Version": SQUARE_VERSION}


# -------------------- membership / pass store --------------------
STORE_PRODUCTS = {
    "pass_7day":  {"name": "1 Week Gym Upfront Membership",   "price_cents": 8000,  "type": "pass",       "days": 7,   "requires_keytag": False, "discount": False,
                   "perks": ["Gym Access for 7 days 24/7", "Great way to try us out", "No lock-in contract"]},
    "mem_1m":     {"name": "1 Month Upfront Membership",  "price_cents": 15000, "type": "membership", "days": 30,  "requires_keytag": True,  "discount": False,
                   "perks": ["24/7 gym access with key tag", "Access-card setup at sign-up"]},
    "mem_3m":     {"name": "3 Month Upfront Membership",  "price_cents": 38000, "type": "membership", "days": 90,  "requires_keytag": True,  "discount": False,
                   "perks": ["24/7 gym access with key tag", "Save vs monthly — best value"]},
    "mem_6m":     {"name": "6 Month Upfront Membership",  "price_cents": 51000, "type": "membership", "days": 180, "requires_keytag": True,  "discount": False,
                   "perks": ["24/7 gym access with key tag", "Bigger savings upfront"]},
    "mem_12m":    {"name": "12 Month Upfront Membership", "price_cents": 75000, "type": "membership", "days": 365, "requires_keytag": True,  "discount": False,
                   "perks": ["24/7 gym access with key tag", "Our lowest price per month"]},
    "pass_1class":  {"name": "Single Class Pass",         "price_cents": 2500,  "type": "class_pass", "classes": 1,  "requires_keytag": False, "discount": False,
                   "perks": ["1 class credit to use anytime", "Boot Camp, Muay Thai & Kickboxing", "Credit never expires"]},
    "pass_10class": {"name": "10 Class Pass",             "price_cents": 20000, "type": "class_pass", "classes": 10, "requires_keytag": False, "discount": False,
                   "perks": ["10 class credits to use anytime", "Boot Camp, Muay Thai & Kickboxing", "Credits never expire", "Perfect for casual training"]},
}
KEYTAG_CENTS = 4000
FIRST_PURCHASE_DISCOUNT = 0.10

# -------------------- gift cards --------------------
GIFTCARD_MIN_CENTS = 1000    # $10
GIFTCARD_MAX_CENTS = 50000   # $500
GIFTCARD_MAX_FAILS = 3       # wrong tries allowed before lockout
GIFTCARD_LOCK_MIN = 15       # minutes locked out after too many wrong tries


async def _giftcard_guard(user_id: str) -> None:
    """Block gift card redemption if the member is currently locked out."""
    doc = await db.giftcard_attempts.find_one({"_id": user_id})
    lu = (doc or {}).get("locked_until")
    if isinstance(lu, datetime):
        lu_cmp = lu.replace(tzinfo=None) if lu.tzinfo else lu
        now_naive = now_utc().replace(tzinfo=None)
        if lu_cmp > now_naive:
            secs = int((lu_cmp - now_naive).total_seconds())
            mins = max(1, round(secs / 60))
            raise HTTPException(
                status_code=429,
                detail=f"Too many incorrect codes. Redeeming is locked for {mins} more minute{'s' if mins != 1 else ''}.",
                headers={"Retry-After": str(secs)},
            )


async def _giftcard_register_fail(user_id: str) -> None:
    """Record a wrong-code attempt; lock the member once they exceed the allowed tries."""
    now = now_utc()
    doc = await db.giftcard_attempts.find_one_and_update(
        {"_id": user_id},
        {"$inc": {"fails": 1}, "$set": {"last_at": now}, "$setOnInsert": {"expires_at": now + timedelta(days=1)}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    fails = int(doc.get("fails", 1))
    if fails > GIFTCARD_MAX_FAILS:
        lock_until = now + timedelta(minutes=GIFTCARD_LOCK_MIN)
        await db.giftcard_attempts.update_one(
            {"_id": user_id},
            {"$set": {"locked_until": lock_until, "fails": 0, "expires_at": lock_until + timedelta(minutes=5)}},
        )
        raise HTTPException(
            status_code=429,
            detail=f"Too many incorrect codes. Redeeming is locked for {GIFTCARD_LOCK_MIN} minutes.",
            headers={"Retry-After": str(GIFTCARD_LOCK_MIN * 60)},
        )
    remaining = GIFTCARD_MAX_FAILS - fails
    if remaining <= 0:
        raise HTTPException(404, "Incorrect code. One more wrong attempt will lock redeeming for 15 minutes.")
    raise HTTPException(404, f"That gift card code wasn't found. {remaining} attempt{'s' if remaining != 1 else ''} remaining.")


async def _giftcard_reset(user_id: str) -> None:
    await db.giftcard_attempts.delete_one({"_id": user_id})


async def gen_giftcard_code() -> str:
    """Human-friendly unique gift card code, e.g. MEG-4F7A-9C21."""
    import secrets
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
    for _ in range(15):
        code = "MEG-" + "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2))
        if not await db.gift_cards.find_one({"code": code}):
            return code
    return "MEG-" + uuid.uuid4().hex[:8].upper()


async def fulfill_giftcard_purchase(tx: dict) -> None:
    """Once a gift card payment clears on Square, create the card, email the recipient & buyer."""
    if tx.get("fulfilled"):
        return
    now = now_utc()
    uid = tx["user_id"]
    buyer = await db.users.find_one({"user_id": uid}) or {}
    amount_cents = int(tx.get("amount", 0))
    code = await gen_giftcard_code()
    gift_card_id = new_id("gc")
    recipient_name = (tx.get("recipient_name") or "").strip()
    recipient_email = (tx.get("recipient_email") or "").strip()
    message = (tx.get("gift_message") or "").strip()
    buyer_name = buyer.get("name") or buyer.get("email") or "A friend"
    await db.gift_cards.insert_one({
        "gift_card_id": gift_card_id,
        "code": code,
        "amount_cents": amount_cents,
        "balance_cents": amount_cents,
        "status": "active",
        "purchaser_user_id": uid,
        "purchaser_name": buyer_name,
        "purchaser_email": buyer.get("email"),
        "recipient_name": recipient_name or None,
        "recipient_email": recipient_email or None,
        "message": message or None,
        "order_ref": tx.get("order_ref"),
        "adjustments": [],
        "redeemed_by_user_id": None,
        "redeemed_at": None,
        "created_at": now,
    })
    await db.payment_transactions.update_one(
        {"session_id": tx["session_id"]},
        {"$set": {"fulfilled": True, "fulfilled_at": now, "gift_card_id": gift_card_id, "gift_card_code": code}},
    )
    amount_str = f"${amount_cents / 100:.2f} AUD"
    buyer_email = (buyer.get("email") or "").strip()
    sent_to_other = bool(recipient_email) and recipient_email.strip().lower() != buyer_email.lower()
    # ----- Recipient email with the redeemable code (only when gifting someone else) -----
    if sent_to_other:
        rlines = [
            f"Hi {esc(recipient_name or 'there')},",
            f"🎁 <b>{esc(buyer_name)}</b> has sent you a <b>{amount_str}</b> Maxenergy Fitness gift card!",
            (f"<div style='margin:12px 0;padding:14px;background:#fff7ef;border:1px solid #ffe0c2;border-radius:10px;font-style:italic'>“{esc(message)}”</div>" if message else ""),
            "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
            "Your gift card code:",
            f"<div style='font-size:22px;font-weight:bold;letter-spacing:2px;text-align:center;margin:14px 0;padding:16px;background:#fff;border:1px dashed #FF7A00;border-radius:10px'>{esc(code)}</div>",
            "Open the Maxenergy Fitness app → My Wallet → <b>Redeem gift card</b>, enter this code, and the balance is added to your account. You can also use it in-store.",
        ]
        await send_email(recipient_email, f"You've received a {amount_str} Maxenergy Fitness gift card 🎁",
                         _email_shell("Your Gift Card", rlines))
    # ----- Buyer confirmation (always includes the code prominently) -----
    blines = [
        f"Hi {esc((buyer_name or '').split(' ')[0] or buyer_name)},",
        f"Your <b>{amount_str}</b> gift card purchase is confirmed. Thanks for supporting Maxenergy Fitness! 🥊",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        f"<b>Amount:</b> {amount_str}",
        (f"<b>Sent to:</b> {esc(recipient_name)} ({esc(recipient_email)})" if sent_to_other else ""),
        f"<b>Purchased on:</b> {esc(now.strftime('%a %d %b %Y · %-I:%M %p'))}",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        "Your gift card code:",
        f"<div style='font-size:22px;font-weight:bold;letter-spacing:2px;text-align:center;margin:14px 0;padding:16px;background:#fff;border:1px dashed #FF7A00;border-radius:10px'>{esc(code)}</div>",
        "Redeem it in the app → My Wallet → <b>Redeem gift card</b>, or use it in-store. You can also find this code anytime in the app under <b>Gift Cards</b>.",
    ]
    await notify_user(uid, buyer.get("email"), "Gift card purchased",
                      f"Your {amount_str} gift card is confirmed" + (f" and sent to {recipient_name}." if sent_to_other else "."),
                      "booking", email_lines=blines, data={"nav": "member_giftcards"})
    # ----- Gym admin email -----
    admin_lines = [
        f"<b>{esc(buyer_name)}</b> purchased a <b>{amount_str}</b> gift card.",
        (f"Recipient: <b>{esc(recipient_name)}</b> ({esc(recipient_email)})" if recipient_email else "Recipient: —"),
        f"Code: <b>{esc(code)}</b>",
        f"Purchased on: {esc(now.strftime('%a %d %b %Y · %-I:%M %p'))}",
    ]
    for a in await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1}).to_list(20):
        await create_notification(a["user_id"], "New gift card purchase", f"{buyer_name} bought a {amount_str} gift card.", "admin")
    await send_email(GYM_ADMIN_EMAIL, f"New gift card — {amount_str} by {buyer_name}",
                     _email_shell("New Gift Card Purchase", admin_lines))



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
    # ----- Gather full customer + purchase details for the emails -----
    cust_name = user.get("name") or user.get("email") or "Member"
    cust_first = (cust_name or "").strip().split(" ")[0] or cust_name
    cust_email = user.get("email") or "—"
    app_doc = await db.membership_applications.find_one(
        {"user_id": uid}, {"_id": 0, "phone": 1}, sort=[("created_at", -1)]
    )
    cust_phone = user.get("phone") or (app_doc or {}).get("phone") or "—"
    amount = float(tx.get("amount", 0)) / 100.0
    currency = (tx.get("currency") or "aud").upper()
    pay_method = "Account credit" if (tx.get("provider") == "credit" or amount <= 0) else "Card (Square)"
    ref_code = booking_ref_code(tx.get("order_ref") or tx.get("session_id") or uid)
    purchased_on = now.strftime("%a %d %b %Y · %-I:%M %p")
    key_tag_line = "Yes (24/7 access included)" if tx.get("key_tag") else "No"

    # Product-specific summary line (passes balance / membership expiry)
    detail_lines: list = []
    if p.get("type") == "class_pass":
        detail_lines.append(f"Passes added: <b>{int(p.get('classes', 0))}</b>")
        detail_lines.append(f"New pass balance: <b>{int(upd.get('class_pass_credits', user.get('class_pass_credits', 0)))}</b>")
    if p.get("type") in ("membership", "pass") and upd.get("membership_expires_at"):
        exp_dt = upd["membership_expires_at"]
        detail_lines.append(f"Membership: <b>{esc(p.get('name'))}</b>")
        detail_lines.append(f"Valid until: <b>{exp_dt.strftime('%d %b %Y')}</b>")
    sched = ""
    if tx.get("start_date") or tx.get("meet_time"):
        sched = f"{tx.get('start_date','')} {tx.get('meet_time','')}".strip()

    # ----- Member confirmation email (with their purchase details) -----
    member_lines = [
        f"Hi {esc(cust_first)},",
        f"Your <b>{esc(p.get('name'))}</b> purchase is confirmed. Thanks for training with Maxenergy Fitness! 🥊",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        f"<b>Product:</b> {esc(p.get('name'))}",
        *detail_lines,
        f"<b>Amount paid:</b> ${amount:.2f} {currency}",
        f"<b>Payment method:</b> {esc(pay_method)}",
        f"<b>Key tag:</b> {esc(key_tag_line)}",
        (f"<b>Access-card setup:</b> {esc(sched)}" if sched else ""),
        f"<b>Reference:</b> {ref_code}",
        f"<b>Purchased on:</b> {esc(purchased_on)}",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        "You can view your balance any time in the app → My Wallet.",
    ]
    await notify_user(uid, user.get("email"), "Purchase confirmed",
                      f"Your {p.get('name')} purchase is confirmed. Thanks for training with Max Energy!", "booking",
                      email_lines=member_lines)

    # ----- Gym admin email (full customer + purchase details) -----
    admin_lines = [
        f"<b>{esc(cust_name)}</b> purchased <b>{esc(p.get('name'))}</b>.",
        "<hr style='border:none;border-top:1px solid #eee;margin:12px 0'>",
        "<b>Customer details</b>",
        f"Name: <b>{esc(cust_name)}</b>",
        f"Email: {esc(cust_email)}",
        f"Phone: {esc(str(cust_phone))}",
        "<hr style='border:none;border-top:1px solid #eee;margin:12px 0'>",
        "<b>Purchase</b>",
        f"Product: <b>{esc(p.get('name'))}</b>",
        *detail_lines,
        f"Amount: <b>${amount:.2f} {currency}</b>",
        f"Payment method: {esc(pay_method)}",
        f"Key tag: {esc(key_tag_line)}",
        (f"Access-card setup: {esc(sched)}" if sched else ""),
        f"Reference: <b>{ref_code}</b>",
        f"Purchased on: {esc(purchased_on)}",
    ]
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1, "email": 1}).to_list(20)
    admin_body = f"{cust_name} purchased {p.get('name')} (${amount:.2f} {currency})." + (f" Setup: {sched}" if sched else "")
    for a in admins:
        await create_notification(a["user_id"], "New store purchase", admin_body, "admin")
    await send_email(GYM_ADMIN_EMAIL, f"New purchase — {p.get('name')} by {cust_name}",
                     _email_shell(f"New Purchase — {p.get('name')}", admin_lines))


async def send_payment_receipt(tx: dict) -> None:
    """Email the member a clean, itemised payment receipt after a successful Square
    card payment. Fires exactly once per transaction (guarded by receipt_sent) and only
    when money was actually charged on the card via Square."""
    if tx.get("provider") != "square":
        return
    # Claim atomically so concurrent polling / reconcile can't send two receipts.
    claim = await db.payment_transactions.update_one(
        {"session_id": tx["session_id"], "receipt_sent": {"$ne": True}},
        {"$set": {"receipt_sent": True, "receipt_sent_at": now_utc()}},
    )
    if claim.modified_count != 1:
        return

    uid = tx.get("user_id")
    member = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1, "email": 1}) or {}
    email = member.get("email")
    if not email:
        return
    mname = member.get("name") or email
    first = (mname or "").strip().split(" ")[0] or mname
    kind = tx.get("kind")
    currency = (tx.get("currency") or "aud").upper()
    now = tx.get("fulfilled_at") or now_utc()
    if isinstance(now, str):
        now = now_utc()

    # Work out the description, card amount and any account-credit portion.
    credit_cents = 0
    if kind == "store":
        p = STORE_PRODUCTS.get(tx.get("product_id"), {})
        desc = p.get("name") or "Store purchase"
        if tx.get("key_tag"):
            desc += " + Key Tag"
        card_cents = int(tx.get("amount", 0))
        ref = booking_ref_code(tx.get("order_ref") or tx.get("session_id") or uid)
    elif kind == "giftcard":
        card_cents = int(tx.get("amount", 0))
        desc = f"Gift Card (${card_cents/100:.0f})"
        ref = booking_ref_code(tx.get("order_ref") or tx.get("session_id") or uid)
    else:
        b = await db.bookings.find_one({"booking_id": tx.get("booking_id")}, {"_id": 0}) or {}
        desc = b.get("class_name") or "Class booking"
        full = int(tx.get("amount", b.get("amount", 0)))
        credit_cents = int(tx.get("credit_applied_cents", 0))
        card_cents = max(0, full - credit_cents)
        ref = booking_ref_code(tx.get("booking_id") or tx.get("session_id") or uid)

    # No card charge (fully covered by credit / pass) -> not a Square card receipt.
    if card_cents <= 0:
        return

    total_cents = card_cents + credit_cents
    lines = [
        f"Hi {esc(first)},",
        "Thanks for your payment. Here is your receipt:",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        f"<b>Receipt no.:</b> {esc(ref)}",
        f"<b>Date:</b> {esc(now.strftime('%a %d %b %Y · %-I:%M %p'))}",
        f"<b>Billed to:</b> {esc(mname)} ({esc(email)})",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        f"<b>Item:</b> {esc(desc)}",
        f"<b>Paid on card:</b> ${card_cents/100:.2f} {currency}",
    ]
    if credit_cents > 0:
        lines.append(f"<b>Account credit applied:</b> ${credit_cents/100:.2f} {currency}")
        lines.append(f"<b>Total value:</b> ${total_cents/100:.2f} {currency}")
    lines += [
        "<b>Payment method:</b> Card (Square)",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        f"<span style='color:#666;font-size:13px'>Paid to {esc(GYM_INFO['name'])}, {esc(GYM_INFO['address'])}. "
        "Prices include GST where applicable. Please keep this receipt for your records.</span>",
    ]
    try:
        await send_email(email, f"Payment receipt — {desc} · {GYM_INFO['name']}",
                         _email_shell("Payment Receipt 🧾", lines))
    except Exception as e:
        log.error(f"receipt email error for tx {tx.get('session_id')}: {e}")


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
    if payment_status == "paid":
        # Atomically claim the paid transition so concurrent polling can't fulfill twice.
        claim = await db.payment_transactions.update_one(
            {"session_id": tx["session_id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": status, "updated_at": now_utc()}},
        )
        if claim.modified_count == 1:
            if tx.get("kind") == "giftcard":
                await fulfill_giftcard_purchase(tx)
            elif tx.get("kind") == "store":
                await fulfill_store_purchase(tx)
            else:
                await mark_booking_paid(tx["booking_id"])
            # Email the member a payment receipt (once per Square card payment).
            await send_payment_receipt(tx)
    elif tx.get("payment_status") != payment_status:
        await db.payment_transactions.update_one(
            {"session_id": tx["session_id"]},
            {"$set": {"payment_status": payment_status, "status": status, "updated_at": now_utc()}},
        )
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


async def _reuse_open_square_checkout(match: dict):
    """Find the most recent still-OPEN Square checkout matching `match`, reconcile it,
    and decide whether it can be reused. Prevents a page refresh / double-tap from
    creating a second Square order (and therefore a second charge) for the same thing.

    Returns (reuse_url, reuse_session_id, paid_tx):
      • reuse_url set  -> an existing unpaid checkout link to return as-is
      • paid_tx set    -> the pending order was actually already paid (settle, don't recharge)
      • all None       -> nothing reusable; create a fresh checkout
    """
    tx = await db.payment_transactions.find_one(
        {**match, "provider": "square", "status": "open", "checkout_url": {"$exists": True, "$ne": None}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not tx:
        return None, None, None
    try:
        ps, st = await sync_square_payment(tx)
    except Exception as e:
        log.error(f"reuse checkout reconcile error: {e}")
        # On a transient Square error, still reuse the stored link rather than risk a new order.
        return tx.get("checkout_url"), tx.get("session_id"), None
    if ps == "paid":
        return None, tx.get("session_id"), tx
    if st == "open":
        return tx.get("checkout_url"), tx.get("session_id"), None
    return None, None, None


# -------------------- payments (Square) — moved to routes/payments.py --------------------


# store routes moved to routes/store.py


# -------------------- events + content-view tracking — moved to routes/events.py --------------------


# membership routes moved to routes/membership.py


@api.get("/admin/passes/report")
async def admin_passes_report(u: dict = Depends(require_admin)):
    """Who holds class passes and how many each member has used/has left."""
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "class_pass_credits": 1}).to_list(10000)
    umap = {x["user_id"]: x for x in users}

    # Usage = pass deductions in the ledger (covers class bookings, appointments AND walk-in scans).
    usage: dict = {}
    ledger = await db.pass_ledger.find({"delta": {"$lt": 0}}, {"_id": 0, "user_id": 1, "reason": 1, "created_at": 1}).to_list(50000)
    for r in ledger:
        d = usage.setdefault(r["user_id"], {"used": 0, "last": None, "last_reason": None})
        d["used"] += 1
        ts = r.get("created_at")
        if isinstance(ts, datetime) and (d["last"] is None or ts > d["last"]):
            d["last"] = ts
            d["last_reason"] = r.get("reason")

    members = []
    total_remaining = 0
    total_used = 0
    for uid, x in umap.items():
        remaining = int(x.get("class_pass_credits", 0) or 0)
        used = usage.get(uid, {}).get("used", 0)
        if remaining <= 0 and used <= 0:
            continue
        last = usage.get(uid, {}).get("last")
        members.append({
            "name": x.get("name") or x.get("email") or "Member",
            "email": x.get("email"),
            "remaining": remaining,
            "used": used,
            "last_used": last.strftime("%d %b %Y") if isinstance(last, datetime) else None,
            "last_reason": usage.get(uid, {}).get("last_reason"),
        })
        total_remaining += remaining
        total_used += used
    members.sort(key=lambda m: (-m["remaining"], -m["used"]))
    return {
        "members": members,
        "totals": {"members": len(members), "passes_outstanding": total_remaining, "passes_used": total_used},
    }


@api.get("/admin/checkins/today")
async def admin_checkins_today(u: dict = Depends(require_admin)):
    """Simple 'who checked in today' list + how many class passes were used today (Queensland day)."""
    QLD = timedelta(hours=10)
    day = (now_utc() + QLD).date()
    day_start_local = datetime(day.year, day.month, day.day)
    day_start_utc = (day_start_local - QLD).replace(tzinfo=timezone.utc)

    # 1) Booking/appointment check-ins recorded today.
    bks = await db.bookings.find(
        {"attended": True, "checked_in_at": {"$gte": day_start_utc}}, {"_id": 0}
    ).to_list(5000)
    # 2) Casual walk-in class-pass redemptions today (no booking).
    reds = await db.pass_redemptions.find(
        {"redeemed_at": {"$gte": day_start_utc}}, {"_id": 0}
    ).to_list(5000)

    uids = {b["user_id"] for b in bks} | {r["user_id"] for r in reds}
    users = await db.users.find(
        {"user_id": {"$in": list(uids)}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(10000)
    umap = {x["user_id"]: x for x in users}

    def who(uid):
        x = umap.get(uid) or {}
        return (x.get("name") or x.get("email") or "Member"), x.get("email")

    def fmt_time(t):
        if isinstance(t, datetime):
            local = (t + QLD).replace(tzinfo=None) if t.tzinfo else (t + QLD)
            return local, local.strftime("%I:%M %p").lstrip("0")
        return None, ""

    entries = []
    passes_used = 0
    for b in bks:
        name, email = who(b["user_id"])
        local, tstr = fmt_time(b.get("checked_in_at"))
        pass_used = bool(b.get("paid_with_pass"))
        method = b.get("checked_in_method")
        by = "QR" if method == "qr" else ("Member" if b.get("checked_in_by") == "member" else "Staff")
        entries.append({
            "name": name, "email": email,
            "label": b.get("class_name") or "Class",
            "kind": "booking", "pass_used": pass_used, "by": by,
            "child_name": b.get("child_name"),
            "_sort": local or datetime.min, "time": tstr,
        })
        if pass_used:
            passes_used += 1
    for r in reds:
        name, email = who(r["user_id"])
        local, tstr = fmt_time(r.get("redeemed_at"))
        entries.append({
            "name": name, "email": email,
            "label": "Class Pass entry (walk-in)",
            "kind": "walkin", "pass_used": True, "by": "QR",
            "child_name": None,
            "_sort": local or datetime.min, "time": tstr,
        })
        passes_used += 1

    entries.sort(key=lambda e: e["_sort"], reverse=True)
    for e in entries:
        e.pop("_sort", None)

    return {
        "date": day_start_local.strftime("%a %d %b %Y"),
        "totals": {"checkins": len(entries), "passes_used": passes_used, "members": len(uids)},
        "entries": entries,
    }


@api.get("/admin/waitlists")
async def admin_waitlists(u: dict = Depends(require_admin)):
    """Every class that has members waiting, with the ordered list under each."""
    rows = await db.waitlists.find({"status": "waiting"}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    if not rows:
        return {"classes": [], "totals": {"classes": 0, "waiting": 0}}
    cids = list({r["class_id"] for r in rows})
    uids = list({r["user_id"] for r in rows})
    cls_map = {c["class_id"]: c for c in await db.classes.find(
        {"class_id": {"$in": cids}}, {"_id": 0, "class_id": 1, "name": 1, "start_at": 1, "capacity": 1}).to_list(2000)}
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(5000)
    umap = {x["user_id"]: x for x in users}

    grouped: dict = {}
    for r in rows:
        c = cls_map.get(r["class_id"]) or {}
        g = grouped.setdefault(r["class_id"], {
            "class_id": r["class_id"],
            "class_name": c.get("name", "Class"),
            "start_at": c.get("start_at").isoformat() if isinstance(c.get("start_at"), datetime) else None,
            "when": c.get("start_at").strftime("%a %d %b · %-I:%M %p") if isinstance(c.get("start_at"), datetime) else "",
            "members": [],
        })
        m = umap.get(r["user_id"], {})
        joined = r.get("created_at")
        g["members"].append({
            "position": len(g["members"]) + 1,
            "name": m.get("name") or m.get("email") or "Member",
            "email": m.get("email"),
            "joined": joined.strftime("%d %b, %-I:%M %p") if isinstance(joined, datetime) else None,
        })
    classes = sorted(grouped.values(), key=lambda x: (x["start_at"] or "z"))
    return {"classes": classes, "totals": {"classes": len(classes), "waiting": len(rows)}}


# -------------------- class waitlist --------------------
WAITLIST_ACTIVE_BOOKING = ["paid", "pending", "confirmed", "reschedule_requested"]


async def _class_is_full(cls: dict) -> bool:
    cap = int(cls.get("capacity") or 0)
    if cap <= 0:
        return False
    booked = await db.bookings.count_documents(
        {"class_id": cls["class_id"], "status": {"$in": WAITLIST_ACTIVE_BOOKING}}
    )
    return booked >= cap


# waitlist member routes (/waitlists/me, join, leave) moved to routes/waitlist.py


async def notify_waitlist_spot(class_id: str):
    """A spot opened on a fixed class — tell the next member waiting (in-app + email)."""
    cls = await db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if not cls or cls.get("by_appointment"):
        return
    if await _class_is_full(cls):
        return  # still full (e.g. multiple active bookings) — nothing to offer
    nxt = await db.waitlists.find_one({"class_id": class_id, "status": "waiting"}, {"_id": 0}, sort=[("created_at", 1)])
    if not nxt:
        return
    await db.waitlists.update_one({"waitlist_id": nxt["waitlist_id"]}, {"$set": {"status": "notified", "notified_at": now_utc()}})
    member = await db.users.find_one({"user_id": nxt["user_id"]}, {"_id": 0})
    when = ""
    st = cls.get("start_at")
    if isinstance(st, datetime):
        when = st.strftime("%A %d %B at %-I:%M %p")
    await notify_user(
        nxt["user_id"], (member or {}).get("email"),
        "A spot just opened! 🎉",
        f"A place opened up in {cls['name']}{(' on ' + when) if when else ''}. Book now before it's gone!",
        "booking",
        email_lines=[
            f"Good news — a spot just opened in <b>{esc(cls['name'])}</b>{(' on <b>' + esc(when) + '</b>') if when else ''}.",
            "Spots are first-come, first-served, so open the app and book it before someone else does! 🥊",
        ],
    )
    await send_push(
        [nxt["user_id"]],
        {"title": "A spot just opened! 🎉", "message": f"A place opened in {cls['name']}{(' on ' + when) if when else ''}. Book now!", "action_url": "/timetable"},
        idempotency_key=f"wl_{nxt['waitlist_id']}",
    )


# -------------------- free trials — moved to routes/trials.py --------------------


# -------------------- notifications — moved to routes/notifications.py --------------------


# -------------------- admin overview + class CRUD — moved to routes/admin.py --------------------


# ==================== Schedule exceptions (closed dates / holidays) ====================
class ScheduleExceptionReq(BaseModel):
    label: str
    start_date: str            # ISO date YYYY-MM-DD
    end_date: Optional[str] = None  # defaults to start_date (single day)
    scope: str = "all"         # "all" | "selected"
    categories: Optional[list] = None
    class_names: Optional[list] = None
    active: Optional[bool] = True


def _validate_exc(body: ScheduleExceptionReq) -> dict:
    sd = (body.start_date or "").strip()
    ed = (body.end_date or "").strip() or sd
    try:
        d1 = datetime.fromisoformat(sd).date()
        d2 = datetime.fromisoformat(ed).date()
    except Exception:
        raise HTTPException(400, "Enter valid dates (YYYY-MM-DD).")
    if d2 < d1:
        raise HTTPException(400, "End date can't be before the start date.")
    if not (body.label or "").strip():
        raise HTTPException(400, "Add a label (e.g. 'QLD School Holidays').")
    scope = "selected" if body.scope == "selected" else "all"
    return {
        "label": body.label.strip(), "start_date": d1.isoformat(), "end_date": d2.isoformat(),
        "scope": scope, "categories": body.categories or [], "class_names": body.class_names or [],
        "active": bool(body.active) if body.active is not None else True,
    }


@api.get("/admin/schedule-exceptions")
async def admin_list_exceptions(u: dict = Depends(require_admin)):
    excs = await db.schedule_exceptions.find({}, {"_id": 0}).sort("start_date", 1).to_list(500)
    tmpls = await db.class_templates.find({}, {"_id": 0, "name": 1, "category": 1}).to_list(500)
    names = sorted({t.get("name") for t in tmpls if t.get("name")})
    cats = sorted({t.get("category") for t in tmpls if t.get("category")})
    return {"exceptions": excs, "class_names": names, "categories": cats}


@api.post("/admin/schedule-exceptions")
async def admin_create_exception(body: ScheduleExceptionReq, u: dict = Depends(require_admin)):
    doc = _validate_exc(body)
    doc["exception_id"] = new_id("exc")
    doc["created_at"] = now_utc()
    await db.schedule_exceptions.insert_one(doc)
    doc.pop("_id", None)
    return {"exception": doc}


@api.put("/admin/schedule-exceptions/{exception_id}")
async def admin_update_exception(exception_id: str, body: ScheduleExceptionReq, u: dict = Depends(require_admin)):
    doc = _validate_exc(body)
    r = await db.schedule_exceptions.update_one({"exception_id": exception_id}, {"$set": doc})
    if r.matched_count == 0:
        raise HTTPException(404, "Exception not found")
    c = await db.schedule_exceptions.find_one({"exception_id": exception_id}, {"_id": 0})
    return {"exception": c}


@api.delete("/admin/schedule-exceptions/{exception_id}")
async def admin_delete_exception(exception_id: str, u: dict = Depends(require_admin)):
    await db.schedule_exceptions.delete_one({"exception_id": exception_id})
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
    if class_id.startswith("tmpl_"):
        raise HTTPException(400, "This is a recurring class. To hide specific dates, add a Closed Date under 'Closed Dates / Exceptions'. To stop it entirely, use Delete.")
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


@api.post("/admin/bookings/{booking_id}/confirm")
async def admin_confirm_booking(booking_id: str, request: Request, u: dict = Depends(require_admin)):
    """Admin confirms a paid appointment booking; notifies the member."""
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") not in ("paid", "pending", "reschedule_requested"):
        raise HTTPException(409, "This booking can't be confirmed.")
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"status": "confirmed", "confirmed_at": now_utc(), "confirmed_by": u["user_id"]}},
    )
    pref = b.get("requested_time") or "your booked time"
    await create_notification(
        b["user_id"],
        "Booking confirmed ✅",
        f"Good news! Your {b['class_name']} on {pref} has been confirmed. See you then!",
        "booking",
    )
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    if member and member.get("email"):
        cal_line = ""
        start_utc = await _booking_start_utc(b)
        if isinstance(start_utc, datetime):
            cal_line = _calendar_buttons_html(
                f"{b['class_name']} — Max Energy",
                start_utc,
                int(b.get("duration_min") or 60),
                GYM_INFO["address"],
                f"{b['class_name']} at Maxenergy Fitness. Booking ref: {booking_ref_code(booking_id)}.",
                booking_id,
                _public_base(request),
            )
        await send_email(
            member["email"],
            f"Booking confirmed — {b['class_name']}",
            _email_shell("Your booking is confirmed ✅", [
                f"Hi {esc(member.get('name') or 'there')},",
                f"Your <b>{esc(b['class_name'])}</b> session on <b>{esc(pref)}</b> has been <b>confirmed</b> by Maxenergy Fitness.",
                cal_line,
                "We look forward to seeing you!",
            ]),
        )
    updated = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    return {"booking": updated}


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


async def _post_official_announcement(author_id: str, title: str, body_text: str) -> None:
    """Auto-post a gym notice into every official group chat so members see it in chat."""
    groups = await db.group_chats.find({"is_official": True}, {"_id": 0, "group_id": 1}).to_list(50)
    text = f"📢 {title}".strip()
    if body_text:
        text += f"\n\n{body_text.strip()}"
    for g in groups:
        await db.group_messages.insert_one({
            "gmsg_id": new_id("gm"), "group_id": g["group_id"], "from_id": "system",
            "sender_name": "Max Energy", "body": text[:2000],
            "read_by": [author_id] if author_id else [], "created_at": now_utc(),
        })


ANNOUNCEMENT_CATEGORIES = {"general", "event", "class_update", "closure", "promotion", "urgent"}


def _parse_urgent_until(cat: str, raw: Optional[str]):
    """Only urgent notices carry an expiry for their red highlight. Returns a UTC
    datetime or None (None = highlight never auto-expires)."""
    if cat != "urgent" or not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


@api.post("/admin/announcements")
async def admin_announcement_create(body: AnnouncementCreate, u: dict = Depends(require_admin)):
    cat = (body.category or "general").strip().lower()
    if cat not in ANNOUNCEMENT_CATEGORIES:
        cat = "general"
    doc = {
        "announcement_id": new_id("ann"),
        "title": body.title,
        "body": body.body,
        "pinned": body.pinned,
        "category": cat,
        "urgent_until": _parse_urgent_until(cat, body.urgent_until),
        "author": u.get("name") or "Max Energy",
        "created_at": now_utc(),
    }
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)
    # Also drop it into the Academy / official group chats.
    asyncio.create_task(_post_official_announcement(u["user_id"], body.title, body.body))
    return {"announcement": doc}


@api.delete("/admin/announcements/{announcement_id}")
async def admin_announcement_delete(announcement_id: str, u: dict = Depends(require_admin)):
    await db.announcements.delete_one({"announcement_id": announcement_id})
    return {"ok": True}


@api.put("/admin/announcements/{announcement_id}")
async def admin_announcement_update(announcement_id: str, body: AnnouncementUpdate, u: dict = Depends(require_admin)):
    cat = (body.category or "general").strip().lower()
    if cat not in ANNOUNCEMENT_CATEGORIES:
        cat = "general"
    r = await db.announcements.update_one(
        {"announcement_id": announcement_id},
        {"$set": {"title": body.title, "body": body.body, "pinned": body.pinned, "category": cat,
                  "urgent_until": _parse_urgent_until(cat, body.urgent_until)}},
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
    # Neutralise CSV/spreadsheet formula injection: cells starting with = + - @
    # (or tab/CR) are prefixed with a quote so a spreadsheet won't execute them.
    def _csv_safe(v):
        s = "" if v is None else str(v)
        return "'" + s if s and s[0] in ("=", "+", "-", "@", "\t", "\r") else s
    w.writerow(["Name", "Email", "Phone", "Signup", "Joined", "Approved Member", "Application Status", "Trials", "Child Name(s)", "Trial Day(s)", "Active Bookings"])
    for m in members:
        joined = ""
        if isinstance(m.get("created_at"), datetime):
            joined = m["created_at"].strftime("%Y-%m-%d")
        children = "; ".join([d.get("child_name") for d in m.get("trial_details", []) if d.get("child_name")])
        days = "; ".join([d.get("preferred_day") for d in m.get("trial_details", []) if d.get("preferred_day")])
        w.writerow([
            _csv_safe(m.get("name")), _csv_safe(m.get("email")), _csv_safe(m.get("phone")),
            "Google" if m.get("provider") == "google" else "Email", joined,
            "Yes" if m.get("is_member") else "No", m.get("application_status") or "",
            _csv_safe(", ".join(m.get("trials", []))), _csv_safe(children), _csv_safe(days), m.get("active_bookings", 0),
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


@api.get("/calendar/{booking_id}.ics")
async def booking_calendar_ics(booking_id: str, t: Optional[str] = None):
    """Serve a calendar (.ics) file for a booking so Apple Calendar / Outlook users
    can one-tap add their class. Access is via a signed link embedded in the
    confirmation email (no auth session needed on the device opening it)."""
    if not verify_dl_token(t, "cal", booking_id):
        raise HTTPException(403, "Not authorised")
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    start_utc = await _booking_start_utc(b)
    if not isinstance(start_utc, datetime):
        raise HTTPException(400, "This booking has no scheduled time.")
    minutes = int(b.get("duration_min") or 60)
    reminder = int(b.get("cal_reminder_minutes") or 60)
    ics = _build_ics(
        booking_id,
        f"{b.get('class_name', 'Class')} — Maxenergy Fitness",
        start_utc,
        minutes,
        GYM_INFO["address"],
        f"{b.get('class_name', '')} at Maxenergy Fitness. Booking ref: {booking_ref_code(booking_id)}.",
        reminder,
    )
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="maxenergy-class.ics"'},
    )


@api.get("/bookings/{booking_id}/calendar")
async def booking_calendar_details(booking_id: str, request: Request, u: dict = Depends(require_user)):
    """Calendar event details for the in-app 'Add to calendar' button (owner only)."""
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    start_utc = await _booking_start_utc(b)
    if not isinstance(start_utc, datetime):
        raise HTTPException(400, "This booking has no scheduled time yet.")
    minutes = int(b.get("duration_min") or 60)
    reminder = int(b.get("cal_reminder_minutes") or 60)
    title = f"{b.get('class_name', 'Class')} — Maxenergy Fitness"
    details = f"{b.get('class_name', '')} at Maxenergy Fitness. Booking ref: {booking_ref_code(booking_id)}."
    end_utc = start_utc + timedelta(minutes=minutes or 60)
    base = _public_base(request)
    return {
        "title": title,
        "start": start_utc.isoformat().replace("+00:00", "Z"),
        "end": end_utc.isoformat().replace("+00:00", "Z"),
        "location": GYM_INFO["address"],
        "notes": details,
        "reminder_minutes": reminder,
        "google_url": _gcal_link(title, start_utc, minutes, GYM_INFO["address"], details),
        "ics_url": f"{base.rstrip('/')}/api/calendar/{booking_id}.ics?t={sign_dl_token('cal', booking_id)}" if base else "",
    }


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
    # Look up how each booking was paid (Square card / credit / class pass) — only "paid" transactions count.
    bids = [r.get("booking_id") for r in rows if r.get("booking_id")]
    paid_via: dict = {}
    txs = await db.payment_transactions.find(
        {"booking_id": {"$in": bids}, "payment_status": "paid"},
        {"_id": 0, "booking_id": 1, "provider": 1},
    ).to_list(2000)
    for t in txs:
        paid_via.setdefault(t["booking_id"], t.get("provider"))
    # Class start/duration for no-show detection on the admin card.
    cids = list({r.get("class_id") for r in rows if r.get("class_id")})
    cls_map = {c["class_id"]: c for c in await db.classes.find({"class_id": {"$in": cids}}, {"_id": 0, "class_id": 1, "start_at": 1, "duration_min": 1}).to_list(1000)}
    for r in rows:
        m = umap.get(r["user_id"], {})
        r["booking_no"] = booking_ref_no(r.get("booking_id", ""))
        r["reference"] = booking_ref_code(r.get("booking_id", ""))
        r["member_name"] = m.get("name") or m.get("email") or "Member"
        r["member_email"] = m.get("email")
        r["member_phone"] = m.get("phone") or phone_by_user.get(r["user_id"])
        r["paid_via"] = paid_via.get(r.get("booking_id"))
        r["is_paid"] = (r.get("status") == "paid") or bool(r.get("paid_at"))
        c = cls_map.get(r.get("class_id")) or {}
        if c.get("start_at") is not None and r.get("class_start") is None:
            r["class_start"] = c["start_at"]
        if r.get("duration_min") is None:
            r["duration_min"] = c.get("duration_min")
    return {"bookings": rows}


@api.get("/admin/booking-log")
async def admin_booking_log(q: str = "", u: dict = Depends(require_admin)):
    rows = await db.booking_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # enrich with the member's full name / email (log stores first_name only)
    uids = list({r.get("user_id") for r in rows if r.get("user_id")})
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(1000)
    umap = {x["user_id"]: x for x in users}
    out = []
    total_cents = 0
    for r in rows:
        m = umap.get(r.get("user_id"), {})
        r["member_name"] = m.get("name") or r.get("first_name") or m.get("email") or "Member"
        r["member_email"] = m.get("email")
        total_cents += int(r.get("amount_cents", 0) or 0)
        out.append(r)
    term = (q or "").strip().lower()
    if term:
        def _match(r: dict) -> bool:
            hay = " ".join(str(r.get(k, "") or "") for k in
                           ("member_name", "first_name", "member_email", "reference",
                            "class_name", "phone", "payment_method", "membership_plan")).lower()
            return term in hay
        out = [r for r in out if _match(r)]
    return {"log": out, "count": len(out), "total_cents": total_cents}



async def _admin_get_booking(booking_id: str) -> dict:
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


@api.post("/admin/bookings/{booking_id}/accept")
async def admin_booking_accept(booking_id: str, request: Request, u: dict = Depends(require_admin)):
    b = await _admin_get_booking(booking_id)
    # Don't confirm an appointment whose requested time has already passed.
    if b.get("by_appointment") and iso_is_past(b.get("requested_at")):
        raise HTTPException(400, "The member's requested time has already passed. Use \u201cSuggest time\u201d to propose an upcoming slot instead.")
    when = b.get("requested_time")
    upd = {"status": "confirmed", "confirmed_at": now_utc()}
    if b.get("by_appointment") and when:
        upd["scheduled_time"] = when
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": upd})
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    mname = (member or {}).get("name") or (member or {}).get("email") or "there"

    # Build the same full detail block the member saw when they first booked.
    cls = await db.classes.find_one({"class_id": b.get("class_id")}, {"_id": 0}) if b.get("class_id") else None
    start = (cls or {}).get("start_at") or b.get("class_start")
    if isinstance(start, datetime):
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        when_full = start.strftime("%A %d %B %Y at %-I:%M %p")
    else:
        when_full = b.get("scheduled_time") or b.get("requested_time") or "By appointment"
    if b.get("by_appointment") and (b.get("scheduled_time") or when):
        when_full = b.get("scheduled_time") or when
    trainer = (cls or {}).get("trainer", "")
    duration = (cls or {}).get("duration_min") or b.get("duration_min")
    amount = float(b.get("amount", 0)) / 100.0
    currency = (b.get("currency", "aud") or "aud").upper()

    when_line = f" Your session is confirmed for {when}." if (b.get("by_appointment") and when) else ""
    cal_line = ""
    start_utc = await _booking_start_utc(b)
    if isinstance(start_utc, datetime):
        cal_line = _calendar_buttons_html(
            f"{b['class_name']} — Max Energy",
            start_utc,
            int(duration or 60),
            GYM_INFO["address"],
            f"{b['class_name']} at Maxenergy Fitness. Booking ref: {booking_ref_code(b['booking_id'])}.",
            b["booking_id"],
            _public_base(request),
        )
    email_lines = [
        f"Hi {esc(mname)},",
        f"Great news — your booking for <b>{esc(b['class_name'])}</b> has been <b>accepted</b>!",
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        f"<b>Class:</b> {esc(b['class_name'])}",
        (f"<b>Coach:</b> {esc(trainer)}" if trainer else ""),
        f"<b>When:</b> {esc(when_full)}",
        (f"<b>Duration:</b> {duration} minutes" if duration else ""),
        (f"<b>Amount paid:</b> ${amount:.2f} {currency}" if amount > 0 else "<b>Amount paid:</b> Free"),
        f"<b>Booking reference:</b> {booking_ref_code(b['booking_id'])}",
        f"<b>Location:</b> {GYM_INFO['address']}",
        cal_line,
        "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
        "See you at the gym! 🥊",
    ]
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
    # Reject proposing a time that's already in the past.
    if body.new_at and iso_is_past(body.new_at):
        raise HTTPException(400, "That time is in the past. Please choose an upcoming day and time.")
    # For appointment bookings, enforce the same window + no-double-book rules as members.
    if b.get("by_appointment") and body.new_at:
        check_appt_window(body.new_at)  # Mon–Thu, 10:30am–4:00pm, on the half hour
        clash = await db.bookings.find_one({
            "by_appointment": True,
            "requested_at": body.new_at,
            "status": {"$in": APPT_ACTIVE_STATUSES},
            "booking_id": {"$ne": booking_id},
        })
        if clash:
            raise HTTPException(409, "That time is already booked. Please choose another slot.")
    # The gym PROPOSES a new time — the member must confirm it suits them.
    upd = {"status": "admin_proposed", "proposed_time": body.new_time,
           "proposed_note": body.note, "proposed_at": now_utc()}
    if body.new_at:
        upd["proposed_at_iso"] = body.new_at
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": upd})
    member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
    note_txt = f" Note: {body.note}" if body.note else ""
    await notify_user(
        b["user_id"], (member or {}).get("email"),
        "New time proposed — please confirm",
        f"The gym proposed a new time for your {b['class_name']} session: {body.new_time}. Open the app to confirm it suits you.{note_txt}",
        "booking",
        email_lines=[
            f"The gym has proposed a new time for your <b>{esc(b['class_name'])}</b> session:",
            f"<b>{esc(body.new_time)}</b>",
            (f"Note: {esc(body.note)}" if body.note else ""),
            "Please open the Max Energy app → Profile → My Bookings and tap <b>This time works</b> to confirm, or suggest another time.",
        ],
        data={"nav": "member_bookings"},
    )
    return {"ok": True}


@api.post("/bookings/{booking_id}/confirm-time")
async def booking_confirm_proposed_time(booking_id: str, u: dict = Depends(require_user)):
    """Member confirms the time the gym proposed for their appointment."""
    b = await db.bookings.find_one({"booking_id": booking_id, "user_id": u["user_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") != "admin_proposed":
        raise HTTPException(409, "There's no proposed time to confirm for this booking.")
    # Block confirming a time that has already passed.
    if iso_is_past(b.get("proposed_at_iso")):
        raise HTTPException(400, "This proposed time has already passed. Please ask the gym to suggest a new time.")
    when = b.get("proposed_time")
    set_fields = {"status": "confirmed", "scheduled_time": when, "requested_time": None, "confirmed_at": now_utc()}
    if b.get("proposed_at_iso"):
        set_fields["requested_at"] = b["proposed_at_iso"]
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": set_fields},
    )
    member_name = u.get("name") or u.get("email") or "A member"
    await notify_user(
        u["user_id"], u.get("email"),
        "Session confirmed",
        f"Your {b['class_name']} session is confirmed for {when}. See you there!",
        "booking",
        email_lines=[f"You're all set! Your <b>{esc(b['class_name'])}</b> session is confirmed for:", f"<b>{esc(str(when))}</b>", "See you on the mats! 🥊"],
    )
    await notify_admins(
        "Member confirmed a proposed time",
        f"{member_name} confirmed the proposed time for {b['class_name']}: {when}.",
        "booking",
        email_lines=[f"<b>{esc(member_name)}</b> confirmed the proposed time for <b>{esc(b['class_name'])}</b>.", f"Time: <b>{esc(str(when))}</b>"],
    )
    # Instant push to the gym so staff know the session time is locked in.
    admin_ids = [a["user_id"] for a in await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1}).to_list(100)]
    await send_push(
        admin_ids,
        {"title": "Session time confirmed ✅", "message": f"{member_name} locked in {b['class_name']} for {when}.", "action_url": "/admin/bookings"},
        idempotency_key=f"confirmtime_{booking_id}",
    )
    b = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    return {"booking": b}


@api.post("/admin/bookings/{booking_id}/attendance")
async def admin_booking_attendance(booking_id: str, body: AttendanceReq, u: dict = Depends(require_admin)):
    b = await _admin_get_booking(booking_id)
    admin_name = u.get("name") or u.get("email") or "Staff"
    if body.attended:
        set_fields = {"attended": True, "checked_in_at": now_utc(),
                      "checked_in_by": admin_name, "checked_in_by_id": u["user_id"],
                      "checked_in_method": "manual"}
    else:
        set_fields = {"attended": False, "checked_in_at": None, "checked_in_by": None,
                      "checked_in_by_id": None, "checked_in_method": None}
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": set_fields})
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


@api.get("/settings/booking")
async def get_booking_settings(u: dict = Depends(require_user)):
    """Member-facing booking policy (used for cancel/reschedule copy + cutoffs)."""
    return {"cancel_window_hours": await get_cancel_window_hours()}


class BookingSettings(BaseModel):
    cancel_window_hours: int


@api.get("/admin/settings")
async def admin_get_settings(u: dict = Depends(require_admin)):
    return {"cancel_window_hours": await get_cancel_window_hours()}


@api.put("/admin/settings")
async def admin_update_settings(body: BookingSettings, u: dict = Depends(require_admin)):
    h = int(body.cancel_window_hours)
    if h < 1 or h > 168:
        raise HTTPException(400, "Cancel window must be between 1 and 168 hours.")
    await db.settings.update_one(
        {"key": "booking"},
        {"$set": {"key": "booking", "cancel_window_hours": h, "updated_at": now_utc(), "updated_by": u.get("email")}},
        upsert=True,
    )
    return {"ok": True, "cancel_window_hours": h}


@api.post("/admin/reminders/run")
async def admin_run_reminders(u: dict = Depends(require_admin)):
    sent = await send_due_reminders()
    return {"ok": True, "reminders_sent": sent}


@api.get("/admin/attendance/roster")
async def admin_attendance_roster(u: dict = Depends(require_admin)):
    """Per past class-session roster: who attended vs who didn't check in (no-shows).

    Powers the No-Show Report and the CSV attendance export. Only FIXED-time classes
    (by-appointment PTs are excluded). A session is 'ended' when start+duration is in the past (QLD)."""
    QLD = timedelta(hours=10)
    now_local = (now_utc() + QLD).replace(tzinfo=None)

    rows = await db.bookings.find(
        {"by_appointment": {"$ne": True}, "status": {"$in": ["paid", "confirmed"]}},
        {"_id": 0, "booking_id": 1, "class_id": 1, "class_name": 1, "user_id": 1,
         "class_start": 1, "duration_min": 1, "attended": 1, "checked_in_at": 1, "checked_in_by": 1},
    ).to_list(20000)

    # class fallback for missing start/duration
    cids = list({r.get("class_id") for r in rows if r.get("class_id")})
    cls_map = {c["class_id"]: c for c in await db.classes.find(
        {"class_id": {"$in": cids}}, {"_id": 0, "class_id": 1, "start_at": 1, "duration_min": 1}).to_list(2000)}

    uids = list({r["user_id"] for r in rows})
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(5000)
    umap = {x["user_id"]: x for x in users}

    def parse_local(v):
        if isinstance(v, datetime):
            return v.replace(tzinfo=None) if v.tzinfo is None else (v.astimezone(timezone.utc).replace(tzinfo=None))
        if isinstance(v, str):
            try:
                d = datetime.fromisoformat(v.replace("Z", "+00:00"))
                return d.replace(tzinfo=None) if d.tzinfo is None else d.astimezone(timezone.utc).replace(tzinfo=None)
            except Exception:
                return None
        return None

    sessions_map: dict = {}
    total_no_shows = 0
    total_attended = 0
    for r in rows:
        c = cls_map.get(r.get("class_id")) or {}
        start = parse_local(r.get("class_start") or c.get("start_at"))
        if start is None:
            continue
        dur = int(r.get("duration_min") or c.get("duration_min") or 60)
        end = start + timedelta(minutes=dur)
        if end >= now_local:
            continue  # not ended yet
        m = umap.get(r["user_id"], {})
        attended = bool(r.get("attended"))
        ci = parse_local(r.get("checked_in_at"))
        key = (r.get("class_name", "Class"), start.strftime("%Y-%m-%dT%H:%M"))
        s = sessions_map.setdefault(key, {
            "class_name": r.get("class_name", "Class"),
            "iso": start.isoformat(),
            "date": start.strftime("%a %d %b %Y"),
            "time": start.strftime("%-I:%M %p"),
            "attended": [], "no_shows": [],
        })
        person = {
            "name": m.get("name") or m.get("email") or "Member",
            "email": m.get("email"),
            "checkin_time": ci.strftime("%-I:%M %p") if ci else None,
            "checked_in_by": r.get("checked_in_by") or ("member" if attended else None),
        }
        if attended:
            s["attended"].append(person)
            total_attended += 1
        else:
            s["no_shows"].append(person)
            total_no_shows += 1

    sessions = list(sessions_map.values())
    for s in sessions:
        s["attended_count"] = len(s["attended"])
        s["no_show_count"] = len(s["no_shows"])
        s["booked_count"] = s["attended_count"] + s["no_show_count"]
    sessions.sort(key=lambda s: s["iso"], reverse=True)
    sessions = sessions[:120]

    return {
        "sessions": sessions,
        "totals": {"attended": total_attended, "no_shows": total_no_shows, "sessions": len(sessions)},
    }


@api.get("/")
async def root():
    return {"app": "Maxenergy Fitness API", "ok": True}


# ---- modular routers (incremental refactor out of server.py) ----
# Imported here, after all shared infra above is defined, to avoid circular imports.
from routes.gym import router as gym_router  # noqa: E402
from routes.events import router as events_router  # noqa: E402
from routes.trials import router as trials_router  # noqa: E402
from routes.notifications import router as notifications_router  # noqa: E402
from routes.waitlist import router as waitlist_router  # noqa: E402
from routes.messages import router as messages_router  # noqa: E402
from routes.bookings import router as bookings_router  # noqa: E402
from routes.admin import router as admin_router  # noqa: E402
from routes.payments import router as payments_router  # noqa: E402
from routes.groups import router as groups_router  # noqa: E402
from routes.store import router as store_router  # noqa: E402
from routes.membership import router as membership_router  # noqa: E402
for _r in (gym_router, events_router, trials_router, notifications_router, waitlist_router,
           messages_router, bookings_router, admin_router, payments_router,
           groups_router, store_router, membership_router):
    api.include_router(_r)

app.include_router(api)

_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_env and _cors_env != "*":
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
    _cors_allow_credentials = True
else:
    # No explicit allowlist configured. The API authenticates with bearer tokens in the
    # Authorization header (not cookies), so credentials are disabled — this avoids the
    # invalid wildcard-origin + credentials combination. Set CORS_ORIGINS to lock down.
    _cors_origins = ["*"]
    _cors_allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_allow_credentials,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _cache_public_base(request: Request, call_next):
    # Keep the app's public base URL warm so background tasks (payment polling,
    # reminders) can build absolute email links (e.g. calendar .ics).
    try:
        _public_base(request)
    except Exception:
        pass
    return await call_next(request)


# -------------------- seed --------------------
# Adults Muay Thai — real team photos shown as an auto-rotating slideshow on the
# class detail page. First entry is also used as the single fallback `image`.
ADULT_MUAY_THAI_IMAGES = [
    "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/d8qr4ypo_AdultsThai1.webp",
    "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/v6p68hjk_AdultsThai2.webp",
    "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/q5k32jbl_AdultsThai3.webp",
]

CLASS_TEMPLATES = [
    # (name, category, trainer, level, duration, price_cents, day_of_week(0=Mon), hour, image, desc, program)
    ("Muay Thai", "Kids", "Coach Alex", "Ages 8-16", 45, 1500, [0, 2], 17, "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/2lqvwzqe_kidspic1.webp", "Kids Muay Thai Classes\n🥊 Mondays & Wednesdays | 5:00–5:45pm\nHelp your child build confidence, focus, discipline and fitness in a fun and supportive environment.\nPricing:\n• $15 casual per class\n• $300 upfront for the full 10-week term\n• Or $35/week by direct debit\n• No joining fee!\nA great way for kids to stay active, learn new skills and grow in confidence.\n\nSuitable for ages 8–16. All fitness and experience levels welcome.", "10 Week Term"),
    ("Muay Thai", "Adults", "Coach Alex", "All levels", 60, 2500, [0, 2], 18, ADULT_MUAY_THAI_IMAGES[0], "Adults Muay Thai Classes\n🥊 Mondays & Wednesdays | 6:00pm\nBuild real strength, fitness and confidence in a high-energy class that welcomes all levels.\nWhat you'll do:\n• Pad work and technique drills\n• Clinch work and combinations\n• Strength and conditioning\nWhether you're training for fitness or fighting form, our coaches will meet you where you're at. No experience needed — just bring your energy!\n\nAll fitness and experience levels welcome.", ""),
    ("Boot Camp", "Boot Camp", "Coach Alex", "All levels", 60, 2500, [5], 7, "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/glko807c_Bootcamp.webp", "Saturday Boot Camp\n💪 Saturdays | 7:00am\nKick-start your weekend with a high-energy, full-body workout combining strength, cardio and conditioning.\nWhat to expect:\n• Functional strength & circuits\n• Cardio and core\n• Scalable for every fitness level\nAll levels welcome — just bring water and your energy!", ""),
    ("Kickboxing", "Adults", "Coach Alex", "All levels", 60, 2500, [1, 3], 18, "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/bclkw8i7_kickboxing3.webp", "Kickboxing Classes\nTuesdays & Thursdays | 6:00pm\n\nBuild your fitness, improve your technique and relieve stress with our high-energy kickboxing classes. Designed for all fitness and experience levels, each session combines practical kickboxing skills with a challenging full-body workout.\nWhat you'll learn:\n• Strikes, kicks and combinations\n• Proper technique and movement\n• Cardio, fitness and conditioning\n• Strength, coordination and confidence\nWhether you're completely new to kickboxing or have previous experience, our classes provide a friendly and supportive environment where everyone is welcome.\n\nAll fitness and experience levels welcome.", ""),
]


async def seed_data():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("apple_sub", unique=True, sparse=True)
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
        await db.giftcard_attempts.create_index("expires_at", expireAfterSeconds=0)
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

    # Second admin (info@maxenergy.com.au) — password is AUTHORITATIVE from the
    # ADMIN2_PASSWORD deployment secret: create if missing, and on every startup
    # ensure the account is admin AND its password matches the configured secret.
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
                "verified": True,
                "created_at": now_utc(),
            }
        )
        log.info("seeded second admin account")
    else:
        await db.users.update_one(
            {"email": admin2_email},
            {"$set": {"is_admin": True, "verified": True, "password_hash": hash_pw(ADMIN2_PASSWORD)}},
        )
        log.info("second admin password synced to ADMIN2_PASSWORD secret")

    # Grant admin to the owner's personal account so they can test admin features on
    # their own device (idempotent, only promotes if the account already exists).
    for _extra_admin in ("scottcarman69@gmail.com",):
        _r = await db.users.update_one({"email": _extra_admin.strip().lower()}, {"$set": {"is_admin": True}})
        if _r.matched_count:
            log.info(f"ensured admin for {_extra_admin}")

    # Demo account for Apple / Google App Review. Regular verified member (NOT admin)
    # with class passes so reviewers can explore booking. Idempotent: password is
    # re-synced on every startup so it always works on the reviewed build.
    review_email = "appstore.review@maxenergy.com.au"
    review_pw = "AppReview2026!"
    review_user = await db.users.find_one({"email": review_email})
    if not review_user:
        await db.users.insert_one(
            {
                "user_id": new_id("user"),
                "email": review_email,
                "name": "App Review",
                "password_hash": hash_pw(review_pw),
                "provider": "password",
                "picture": None,
                "is_admin": False,
                "verified": True,
                "date_of_birth": "1990-01-01",
                "class_pass_credits": 10,
                "credit_cents": 0,
                "created_at": now_utc(),
            }
        )
        log.info("seeded app review demo account")
    else:
        await db.users.update_one(
            {"email": review_email},
            {"$set": {"is_admin": False, "verified": True, "password_hash": hash_pw(review_pw),
                      "date_of_birth": review_user.get("date_of_birth") or "1990-01-01",
                      "class_pass_credits": max(10, int(review_user.get("class_pass_credits", 0) or 0))}},
        )
        log.info("app review demo account password synced")

    # Dedicated Google Play review account (email/password — reviewers can't use SSO).
    # Idempotent: password re-synced on every startup so it always works on the build.
    gp_email = "googleplay.review@maxenergy.com.au"
    gp_pw = "GooglePlay2026!"
    gp_user = await db.users.find_one({"email": gp_email})
    if not gp_user:
        await db.users.insert_one(
            {
                "user_id": new_id("user"),
                "email": gp_email,
                "name": "Google Play Review",
                "password_hash": hash_pw(gp_pw),
                "provider": "password",
                "picture": None,
                "is_admin": False,
                "verified": True,
                "date_of_birth": "1990-01-01",
                "class_pass_credits": 10,
                "credit_cents": 0,
                "created_at": now_utc(),
            }
        )
        log.info("seeded google play review account")
    else:
        await db.users.update_one(
            {"email": gp_email},
            {"$set": {"is_admin": False, "verified": True, "password_hash": hash_pw(gp_pw),
                      "date_of_birth": gp_user.get("date_of_birth") or "1990-01-01",
                      "class_pass_credits": max(10, int(gp_user.get("class_pass_credits", 0) or 0))}},
        )
        log.info("google play review account password synced")


    # Age requirement for Kids Muay Thai (idempotent; keeps class_ids & bookings intact)
    try:
        await db.classes.update_many(
            {"name": "Muay Thai", "category": "Kids"},
            {"$set": {"min_age": 8, "max_age": 16, "level": "Ages 8-16"}},
        )
        # Adult group classes: simple 16+ note (display only — no age prompt/block).
        await db.classes.update_many(
            {"category": {"$ne": "Kids"}, "by_appointment": {"$ne": True}, "min_age": {"$in": [None, False]}},
            {"$set": {"min_age": 16}},
        )
        await db.classes.update_many(
            {"category": {"$ne": "Kids"}, "by_appointment": {"$ne": True}, "min_age": {"$exists": False}},
            {"$set": {"min_age": 16}},
        )
    except Exception as e:
        log.warning(f"kids age migration warn: {e}")

    # Adults Muay Thai slideshow images (idempotent) — ensure the template carries the
    # real team photos as an `images` array so the change survives redeploys and also
    # updates an already-seeded live DB. First photo stays the single-image fallback.
    try:
        await db.class_templates.update_many(
            {"name": "Muay Thai", "category": "Adults"},
            {"$set": {"images": ADULT_MUAY_THAI_IMAGES, "image": ADULT_MUAY_THAI_IMAGES[0]}},
        )
    except Exception as e:
        log.warning(f"adult muay thai images migration warn: {e}")

    # Kickboxing — real team photo (idempotent) so it shows on the home hero carousel
    # and class detail; survives redeploys and updates an already-seeded live DB.
    try:
        await db.class_templates.update_many(
            {"name": "Kickboxing"},
            {"$set": {"image": "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/bclkw8i7_kickboxing3.webp"}},
        )
    except Exception as e:
        log.warning(f"kickboxing image migration warn: {e}")

    # Kids Muay Thai — real class photo (idempotent) for home hero + class detail;
    # survives redeploys and updates an already-seeded live DB.
    try:
        await db.class_templates.update_many(
            {"name": "Muay Thai", "category": "Kids"},
            {"$set": {"image": "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/2lqvwzqe_kidspic1.webp"}},
        )
    except Exception as e:
        log.warning(f"kids muay thai image migration warn: {e}")

    # Boot Camp — real class photo (idempotent) for home hero + class detail.
    try:
        await db.class_templates.update_many(
            {"name": "Boot Camp"},
            {"$set": {"image": "https://customer-assets-v7afamib.emergentagent.net/job_class-notify-8/artifacts/glko807c_Bootcamp.webp"}},
        )
    except Exception as e:
        log.warning(f"boot camp image migration warn: {e}")

    # NON-DESTRUCTIVE seeding: each catalog collection is seeded ONLY when empty.
    # This safely populates a fresh database (e.g. a new production DB) with base
    # data while NEVER deleting admin-created classes/events/plans/announcements.
    # Recurring weekly schedule: seed class_templates (idempotent) from CLASS_TEMPLATES.
    # The timetable generates dated instances from these on a rolling basis, so we no
    # longer store hundreds of duplicate dated class records.
    if await db.class_templates.count_documents({}) == 0:
        tmpls = []
        for (name, category, trainer, level, dur, price, days, hour, image, desc, program) in CLASS_TEMPLATES:
            for wd in days:
                tid = _make_template_id(name, category, wd, hour, 0)
                tmpls.append({
                    "template_id": tid, "name": name, "category": category, "trainer": trainer,
                    "level": level, "duration_min": dur, "price_cents": price, "currency": "aud",
                    "image": image, "description": desc, "program": program, "color": "#FF7A00",
                    "images": ADULT_MUAY_THAI_IMAGES if (name == "Muay Thai" and category == "Adults") else [],
                    "weekday": wd, "hour": hour, "minute": 0,
                    "capacity": 20 if name == "Boot Camp" else 16,
                    "by_appointment": False,
                    "min_age": 8 if (name == "Muay Thai" and category == "Kids") else 16,
                    "max_age": 16 if (name == "Muay Thai" and category == "Kids") else None,
                    "active": True, "created_at": now_utc(),
                })
        if tmpls:
            await db.class_templates.insert_many(tmpls)
        log.info(f"seeded {len(tmpls)} class templates")
        # One-time cleanup: remove legacy dated recurring classes that have no bookings
        # (they'd otherwise duplicate the generated instances). Booked ones are kept.
        legacy = await db.classes.find({"by_appointment": {"$ne": True}, "template_id": {"$exists": False}}, {"class_id": 1}).to_list(5000)
        for lc in legacy:
            has_bk = await db.bookings.count_documents({"class_id": lc["class_id"], "status": {"$in": ["paid", "pending", "confirmed", "reschedule_requested"]}})
            if has_bk == 0:
                await db.classes.delete_one({"class_id": lc["class_id"]})

    # QLD 2026 school holidays — Kids classes don't run. Seeded once; editable in admin.
    if await db.schedule_exceptions.count_documents({}) == 0:
        qld = [
            ("QLD School Holidays — Term 1", "2026-04-03", "2026-04-19"),
            ("QLD School Holidays — Term 2", "2026-06-27", "2026-07-12"),
            ("QLD School Holidays — Term 3", "2026-09-19", "2026-10-05"),
            ("QLD School Holidays — Summer", "2026-12-12", "2027-01-26"),
        ]
        await db.schedule_exceptions.insert_many([
            {"exception_id": new_id("exc"), "label": label, "start_date": sd, "end_date": ed,
             "scope": "selected", "categories": ["Kids"], "class_names": [], "active": True,
             "created_at": now_utc()} for (label, sd, ed) in qld
        ])
        log.info("seeded QLD school holiday exceptions (Kids)")


        # Personal Training — bookable by appointment (no fixed time)
        if not await db.classes.find_one({"name": "Personal Training", "by_appointment": True}):
            await db.classes.insert_one(
            {
                "class_id": new_id("cls"),
                "name": "Personal Training",
                "category": "Adults",
                "trainer": "Coach Alex",
                "level": "Any level",
                "duration_min": 30,
                "price_cents": 7000,
                "currency": "aud",
                "appt_durations": [
                    {"minutes": 30, "price_cents": 7000},
                ],
                "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80",
                "description": "1-on-1 tailored coaching session with a certified trainer — 30 minutes (half-hour session). Booked by appointment (Mon–Thu, 10:30am–4:00pm) — we'll confirm your time.",
                "program": "",
                "color": "#FF7A00",
                "start_at": now_utc(),
                "capacity": 1,
                "by_appointment": True,
                "created_at": now_utc(),
            }
        )

        # Custom Programs — bookable by appointment (no fixed time)
        if not await db.classes.find_one({"name": "Custom Programs", "by_appointment": True}):
            await db.classes.insert_one(
            {
                "class_id": new_id("cls"),
                "name": "Custom Programs",
                "category": "Adults",
                "trainer": "Coach Alex",
                "level": "Any level",
                "duration_min": 30,
                "price_cents": 6000,
                "currency": "aud",
                "appt_durations": [
                    {"minutes": 30, "price_cents": 6000},
                ],
                "image": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80",
                "description": "A training program built around your goals — strength, conditioning, weight loss or fight prep. Booked by appointment (Mon–Thu, 10:30am–4:00pm); we'll confirm your time.",
                "program": "",
                "color": "#FF7A00",
                "start_at": now_utc(),
                "capacity": 1,
                "by_appointment": True,
                "created_at": now_utc(),
            }
        )

    # Self-heal duplicates: older seeds created more than one by-appointment
    # "Personal Training" / "Custom Programs" record on some databases. Runs on every
    # startup so production cleans itself on redeploy. Keeps the one with bookings
    # (else the oldest), re-points any bookings on the extras onto the survivor, then
    # deletes the extras — so it ALWAYS collapses to a single record without losing
    # any booking.
    for _appt_name in ("Personal Training", "Custom Programs"):
        dups = await db.classes.find(
            {"name": _appt_name, "by_appointment": True},
            {"class_id": 1, "created_at": 1},
        ).sort("created_at", 1).to_list(100)
        if len(dups) <= 1:
            continue
        _active = {"$in": ["paid", "pending", "confirmed", "reschedule_requested", "admin_proposed"]}
        keep_id = None
        for d in dups:
            if await db.bookings.count_documents({"class_id": d["class_id"], "status": _active}) > 0:
                keep_id = d["class_id"]
                break
        if keep_id is None:
            keep_id = dups[0]["class_id"]  # oldest
        removed = 0
        for d in dups:
            if d["class_id"] == keep_id:
                continue
            # Move any bookings on the extra onto the survivor, then delete the extra.
            await db.bookings.update_many(
                {"class_id": d["class_id"]},
                {"$set": {"class_id": keep_id}},
            )
            await db.classes.delete_one({"class_id": d["class_id"]})
            removed += 1
        if removed:
            log.info(f"deduped {_appt_name}: kept {keep_id}, removed {removed}")

    # Enforce Personal Training pricing/info on every startup so production self-heals
    # on redeploy (price is $70 for a 30-minute / half-hour session).
    await db.classes.update_many(
        {"name": "Personal Training", "by_appointment": True},
        {"$set": {
            "duration_min": 30,
            "price_cents": 7000,
            "currency": "aud",
            "appt_durations": [{"minutes": 30, "price_cents": 7000}],
            "description": "1-on-1 tailored coaching session with a certified trainer — 30 minutes (half-hour session). Booked by appointment (Mon–Thu, 10:30am–4:00pm) — we'll confirm your time.",
        }},
    )

    # Membership plans
    if await db.membership_plans.count_documents({}) == 0:
        plans = [
            {"plan_id": new_id("plan"), "sort": 1, "name": "Kids Muay Thai Casual Visit", "category": "Kids", "price_display": "15/class", "price_cents": 1500, "interval": "class", "features": ["Pay as you go", "Mon & Wed 5:00–5:45pm", "Muay Thai - Kids", "No lock-in"]},
            {"plan_id": new_id("plan"), "sort": 2, "name": "Kids 10 Week Term", "category": "Kids", "price_display": "300 / term", "price_cents": 30000, "interval": "term", "features": ["10-week term program", "Mon & Wed 5:00–5:45pm", "Or direct debit $35/week", "No joining fee"]},
            {"plan_id": new_id("plan"), "sort": 3, "name": "Adult Muay Thai Casual Visit", "category": "Adults", "price_display": "25/class", "price_cents": 2500, "interval": "class", "features": ["Pay as you go", "Any adult class", "No lock-in"]},
        ]
        await db.membership_plans.insert_many(plans)

    # Announcements (gym notices)
    if await db.announcements.count_documents({}) == 0:
        anns = [
            {"announcement_id": new_id("ann"), "title": "Public Holiday Hours", "body": "The academy front desk will be closed this Monday, but 24/7 gym access remains open for members.", "pinned": True, "author": "Max Energy", "created_at": now_utc()},
            {"announcement_id": new_id("ann"), "title": "Kids Term Enrolments Open", "body": "Muay Thai - Kids runs Mondays & Thursdays 5:00–5:45pm as a 10-week term program. Enrol via Join Membership — spots are limited!", "pinned": False, "author": "Coach Alex", "created_at": now_utc() - timedelta(days=1)},
            {"announcement_id": new_id("ann"), "title": "Grading Day Approaching", "body": "Grading is coming up in two weeks. Speak to your coach about eligibility and prep sessions.", "pinned": False, "author": "Coach Alex", "created_at": now_utc() - timedelta(days=3)},
        ]
        await db.announcements.insert_many(anns)

    # Events
    if await db.events.count_documents({}) == 0:
        base_e = now_utc().replace(hour=18, minute=0, second=0, microsecond=0)
        events = [
            {"event_id": new_id("evt"), "title": "Community Fight Night", "start_at": base_e + timedelta(days=6), "location": "Maxenergy Fitness, Smithfield", "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1200&q=80", "description": "Amateur showcase night. Come cheer on our fighters. Doors open at 6pm.", "created_at": now_utc()},
            {"event_id": new_id("evt"), "title": "Free Beginner Workshop", "start_at": base_e + timedelta(days=3), "location": "Maxenergy Fitness, Smithfield", "image": "https://images.unsplash.com/photo-1517438322307-e67111335449?w=1200&q=80", "description": "Free 2-hour beginner workshop covering stance, guard and basic strikes.", "created_at": now_utc()},
            {"event_id": new_id("evt"), "title": "Kids Grading Day", "start_at": base_e + timedelta(days=10), "location": "Maxenergy Fitness, Smithfield", "image": "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=1200&q=80", "description": "Official armband grading for our junior students. Families welcome.", "created_at": now_utc()},
        ]
        await db.events.insert_many(events)

    await db.meta.update_one({"key": "seed_version"}, {"$set": {"value": SEED_VERSION}}, upsert=True)
    log.info(f"seed check complete -> {SEED_VERSION}")

    # Seed the OUR GYM gallery from the current bundled photos (once), so admins start
    # with the existing images and can add/remove them in-app without a redeploy.
    if await db.gym_photos.count_documents({}) == 0:
        import os as _os
        _img_dir = _os.path.join(_os.path.dirname(__file__), "..", "frontend", "assets", "images")
        _gallery_files = ["ourgym1.webp", "ourgym2.webp", "ourgym3.webp", "ourgym4.webp",
                          "kickbox1.webp", "kids1.jpg", "kids2.jpg", "kids3.jpg"]
        _sort = 0
        for _fn in _gallery_files:
            _fp = _os.path.join(_img_dir, _fn)
            if not _os.path.exists(_fp):
                continue
            try:
                with open(_fp, "rb") as _f:
                    _data = _f.read()
                _uri = _process_gallery_image(_data)
                _sort += 1
                await db.gym_photos.insert_one({
                    "photo_id": new_id("gph"), "image": _uri, "sort": _sort,
                    "created_by": "seed", "created_at": now_utc(),
                })
            except Exception as _e:
                log.error(f"gym gallery seed error for {_fn}: {_e}")
        log.info(f"gym gallery seeded -> {_sort} photos")

    # One-time capacity policy: every class is capped at a MAXIMUM of 16 spots
    # (appointment 1-on-1 sessions keep capacity 1). Runs once per policy version.
    cap_flag = await db.meta.find_one({"key": "capacity_policy_v2"})
    if not cap_flag:
        r1 = await db.classes.update_many(
            {"by_appointment": {"$ne": True}, "capacity": {"$gt": 16}},
            {"$set": {"capacity": 16}},
        )
        await db.meta.update_one({"key": "capacity_policy_v2"}, {"$set": {"value": True}}, upsert=True)
        log.info(f"capacity policy v2 applied -> {r1.modified_count} classes capped to 16")

    # Boot Camp is allowed up to 20 spots (all other classes stay at 16).
    cap_flag3 = await db.meta.find_one({"key": "capacity_policy_v3"})
    if not cap_flag3:
        r3 = await db.classes.update_many(
            {"by_appointment": {"$ne": True}, "name": "Boot Camp", "capacity": {"$lt": 20}},
            {"$set": {"capacity": 20}},
        )
        await db.meta.update_one({"key": "capacity_policy_v3"}, {"$set": {"value": True}}, upsert=True)
        log.info(f"capacity policy v3 applied -> {r3.modified_count} boot camp classes set to 20")


async def seed_official_groups():
    """Create/maintain the exclusive gym-run 'Muay Thai Academy' group (idempotent)."""
    default_note = ("👋 Welcome to the Muay Thai Academy!\n\n"
                    "• Respect all members & coaches\n"
                    "• Book classes early — spots fill fast\n"
                    "• Keep the chat friendly & supportive\n"
                    "• Questions? Message the gym anytime\n\n"
                    "Let's train hard and have fun! 🥊")
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1}).to_list(50)
    admin_ids = [a["user_id"] for a in admins]
    owner = admin_ids[0] if admin_ids else None
    existing = await db.group_chats.find_one({"slug": "muay-thai-academy"}, {"_id": 0})
    if not existing:
        await db.group_chats.insert_one({
            "group_id": "grp_muaythai_academy", "name": "Muay Thai Academy",
            "slug": "muay-thai-academy", "is_official": True,
            "description": "The official Max Energy Muay Thai crew — for existing and new members.",
            "pinned_note": default_note,
            "owner_id": owner, "member_ids": admin_ids or [], "created_at": now_utc(),
        })
        log.info("Seeded official group: Muay Thai Academy")
    else:
        if not existing.get("owner_id") and owner:
            await db.group_chats.update_one({"slug": "muay-thai-academy"}, {"$set": {"owner_id": owner}})
        if existing.get("pinned_note") is None:
            await db.group_chats.update_one({"slug": "muay-thai-academy"}, {"$set": {"pinned_note": default_note}})
        if admin_ids:
            await db.group_chats.update_one({"slug": "muay-thai-academy"}, {"$addToSet": {"member_ids": {"$each": admin_ids}}})



@app.on_event("startup")
async def _startup():
    await seed_data()
    await seed_official_groups()
    # Grandfather any pre-existing accounts (created before email verification) as verified.
    await db.users.update_many({"verified": {"$exists": False}}, {"$set": {"verified": True}})
    # Auto-expire OTP codes 10 min after issue.
    try:
        await db.otp_codes.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        log.warning(f"otp ttl index: {e}")
    # Pending (unverified) registrations: unique per email, auto-expire at expires_at.
    try:
        await db.pending_registrations.create_index("email", unique=True)
        await db.pending_registrations.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        log.warning(f"pending_registrations index: {e}")
    app.state.reminder_task = asyncio.create_task(reminder_loop())


async def send_due_reminders() -> int:
    """Send a one-time reminder based on each member's chosen lead time (1, 3 or 12h).
    Efficient: only looks at classes starting within the next MAX_HOURS and batch-loads
    their bookings + members, so a cycle stays fast even on a remote database."""
    MAX_HOURS = 12
    QLD = timedelta(hours=10)  # class start_at is stored as QLD local wall-clock (no DST)
    now = now_utc()
    qld_now = qld_now_naive()
    # 1) Only upcoming, non-appointment classes in the reminder window (naive QLD range).
    classes = await db.classes.find(
        {
            "by_appointment": {"$ne": True},
            "start_at": {"$gte": qld_now - timedelta(minutes=5), "$lte": qld_now + timedelta(hours=MAX_HOURS)},
        },
        {"_id": 0, "class_id": 1, "start_at": 1},
    ).to_list(500)
    if not classes:
        return 0
    class_start = {c["class_id"]: c.get("start_at") for c in classes}
    # 2) Bookings for those classes that still need a reminder.
    bookings = await db.bookings.find(
        {
            "class_id": {"$in": list(class_start.keys())},
            "status": {"$in": ["paid", "confirmed"]},
            "reminder_sent": {"$ne": True},
        },
        {"_id": 0},
    ).to_list(3000)
    if not bookings:
        return 0
    # 3) Batch-load the members.
    uids = list({b["user_id"] for b in bookings})
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "email": 1, "reminder_hours": 1}).to_list(len(uids) + 1)
    umap = {u["user_id"]: u for u in users}

    sent = 0
    for b in bookings:
        start = class_start.get(b["class_id"])
        if not isinstance(start, datetime):
            continue
        # Interpret the stored naive wall-clock time as QLD local, then convert to UTC.
        s_local = start.replace(tzinfo=None) if start.tzinfo else start
        start_utc = (s_local - QLD).replace(tzinfo=timezone.utc)
        if start_utc < now:
            continue  # already started
        member = umap.get(b["user_id"]) or {}
        lead = int(member.get("reminder_hours", 1) or 0)
        if lead == 0:
            continue  # member turned reminders off
        if lead not in (1, 3, 12):
            lead = 1
        # Only send once the class is within the member's chosen lead time.
        if start_utc > now + timedelta(hours=lead):
            continue
        date_str = s_local.strftime("%A, %-d %B")
        time_str = s_local.strftime("%-I:%M %p")
        mins = int((start_utc - now).total_seconds() // 60)
        soon = "in about 1 hour" if mins <= 75 else f"in about {round(mins / 60)} hours"
        await notify_user(
            b["user_id"], member.get("email"),
            f"Your {b['class_name']} Class Starts Soon!",
            f"Your {b['class_name']} class starts {soon} — {date_str} at {time_str}. See you there!",
            "reminder",
            email_lines=[
                f"Just a reminder that your <b>{esc(b['class_name'])}</b> class starts <b>{soon}</b>.",
                "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                f"<b>{date_str}</b>",
                f"Class Time: <b>{time_str}</b>",
                "Location: <b>MaxEnergy Fitness, Smithfield</b>",
                "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                "Please arrive 10 minutes before the class starts so you have plenty of time to get ready and prepare for your session.",
                "The gym door will be open before class, so you can come straight in when you arrive.",
                "We look forward to seeing you on the mats! 🥊",
            ],
        )
        await db.bookings.update_one({"booking_id": b["booking_id"]}, {"$set": {"reminder_sent": True, "reminder_sent_at": now}})
        await send_push(
            [b["user_id"]],
            {"title": f"{b['class_name']} starts {soon}", "message": f"{date_str} at {time_str} · MaxEnergy Fitness", "action_url": "/bookings"},
            idempotency_key=f"rem_{b['booking_id']}",
        )
        sent += 1
    if sent:
        log.info(f"sent {sent} class reminder(s)")
    return sent


async def send_streak_reminders() -> int:
    """Nudge members whose weekly attendance streak (>=2 weeks) is at risk: it's the back
    end of the QLD week (Fri-Sun) and they haven't attended a class yet this week.
    One nudge per member per week (deduped via `streak_reminder_week`)."""
    EPOCH_MON = datetime(1970, 1, 5)  # a Monday
    local_now = qld_now_naive()
    # Only nudge Fri(4), Sat(5), Sun(6) so there's still time to book this week.
    if local_now.weekday() < 4:
        return 0
    cur_week = (local_now.date() - EPOCH_MON.date()).days // 7
    docs = await db.bookings.find(
        {"attended": True, "checked_in_at": {"$ne": None}},
        {"_id": 0, "user_id": 1, "checked_in_at": 1},
    ).to_list(40000)

    def week_idx(dt: datetime) -> int:
        local = (dt.replace(tzinfo=None) + timedelta(hours=10)) if dt.tzinfo is None else (dt.astimezone(timezone.utc).replace(tzinfo=None) + timedelta(hours=10))
        return (local.date() - EPOCH_MON.date()).days // 7

    weeks_by_user: dict = {}
    for d in docs:
        ci = d.get("checked_in_at")
        if isinstance(ci, datetime):
            weeks_by_user.setdefault(d["user_id"], set()).add(week_idx(ci))

    def streak_upto(weeks_set: set, upto: int) -> int:
        if upto not in weeks_set:
            return 0
        s, w = 1, upto
        while (w - 1) in weeks_set:
            s += 1; w -= 1
        return s

    sent = 0
    for uid, weeks in weeks_by_user.items():
        if cur_week in weeks:
            continue  # already trained this week — streak is safe
        prev_streak = streak_upto(weeks, cur_week - 1)
        if prev_streak < 2:
            continue
        member = await db.users.find_one({"user_id": uid}, {"_id": 0})
        if not member:
            continue
        if int(member.get("reminder_hours", 3)) == 0:
            continue  # member turned reminders off
        if member.get("streak_reminder_week") == cur_week:
            continue  # already nudged this week
        await notify_user(
            uid, member.get("email"),
            f"Keep your {prev_streak}-week streak alive! \U0001F525",
            f"You've trained {prev_streak} weeks in a row — don't break the chain! Book a class before Sunday night to keep your streak going.",
            "streak",
            email_lines=[
                f"You're on a <b>{prev_streak}-week training streak</b> \U0001F525 — one of the best ways to see real results.",
                "You haven't logged a class yet this week, and the week's nearly over.",
                "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                "Jump into the app and book a session before Sunday night to keep your streak alive.",
                "See you on the mats! \U0001F94A",
            ],
            data={"nav": "leaderboard"},
        )
        await db.users.update_one({"user_id": uid}, {"$set": {"streak_reminder_week": cur_week}})
        sent += 1
    if sent:
        log.info(f"sent {sent} streak reminder(s)")
    return sent


async def send_trial_followups() -> int:
    """One-time nudge to members who booked a free trial but didn't turn up, sent a few
    hours after their trial session (deduped via `trial_followup_sent`)."""
    now = now_utc()
    QLD = timedelta(hours=10)
    recent_cutoff = now - timedelta(hours=6)   # session finished a few hours ago
    old_cutoff = now - timedelta(days=7)         # don't nag about very old no-shows
    trials = await db.bookings.find(
        {"is_trial": True, "attended": {"$ne": True}, "trial_followup_sent": {"$ne": True},
         "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).to_list(2000)
    sent = 0
    for b in trials:
        start = b.get("class_start")
        if not isinstance(start, datetime):
            continue
        s_local = start.replace(tzinfo=None) if start.tzinfo else start
        start_utc = (s_local - QLD).replace(tzinfo=timezone.utc)
        if not (old_cutoff <= start_utc <= recent_cutoff):
            continue
        member = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
        if not member:
            continue
        await notify_user(
            b["user_id"], member.get("email"),
            "We missed you at your free trial \U0001F94A",
            "Looks like you couldn't make your free trial class — no worries! We'd still love to see you. Open the app any time to book a Muay Thai session.",
            "trial",
            email_lines=[
                "We noticed you couldn't make it to your free trial class — no worries at all!",
                "Your spot on the mats is still waiting for you whenever you're ready.",
                "<hr style='border:none;border-top:1px solid #eee;margin:14px 0'>",
                "Open the Max Energy app to pick a new Muay Thai session that suits you.",
                "Hope to see you soon! \U0001F94A",
            ],
        )
        await db.bookings.update_one({"booking_id": b["booking_id"]}, {"$set": {"trial_followup_sent": True}})
        sent += 1
    if sent:
        log.info(f"sent {sent} trial follow-up(s)")
    return sent


async def reminder_loop():
    # Small initial delay so startup/seed completes first
    await asyncio.sleep(20)
    tick = 0
    while True:
        # Class reminders run every cycle (every 5 min) for timely, ~1-hour-before delivery.
        try:
            await send_due_reminders()
        except Exception as e:
            log.error(f"reminder loop error: {e}")
        # The heavier weekly/trial scans only need to run occasionally (every ~30 min),
        # so they never delay the time-sensitive class reminders.
        if tick % 6 == 0:
            try:
                await send_streak_reminders()
            except Exception as e:
                log.error(f"streak reminder error: {e}")
            try:
                await send_trial_followups()
            except Exception as e:
                log.error(f"trial follow-up error: {e}")
        tick += 1
        await asyncio.sleep(300)  # every 5 minutes for timely reminders


@app.on_event("shutdown")
async def _shutdown():
    client.close()
