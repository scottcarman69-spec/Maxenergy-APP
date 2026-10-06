"""Shared Pydantic request/response models for the Maxenergy Fitness API.

Extracted from server.py (incremental refactor). These are pure data models with
no dependency on application infrastructure, so they can be imported anywhere
without circular-import risk.
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List


class RegisterReq(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    date_of_birth: str  # ISO date YYYY-MM-DD
    phone: str = Field(min_length=6)
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionReq(BaseModel):
    session_id: str


class AppleAuthReq(BaseModel):
    identity_token: str
    # Only sent by the client on the FIRST sign-in (Apple returns these once).
    full_name: Optional[str] = None
    email: Optional[str] = None


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
    duration_min: Optional[int] = None      # chosen session length (appointment classes with options)
    cal_reminder_minutes: Optional[int] = None  # calendar alarm lead time: 60 (1h) or 1440 (1 day)
    child_age: Optional[int] = None          # age of the child attending (Kids classes)
    child_name: Optional[str] = None         # name of the child attending (Kids classes)
    child_id: Optional[str] = None           # saved child's id (Kids classes; enables per-child dedupe)


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
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    weekday: Optional[int] = None       # 0=Mon..6=Sun — recurring weekly classes
    start_time: Optional[str] = None    # "HH:MM" — recurring weekly classes


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    pinned: bool = False
    category: Optional[str] = "general"


class ApplicationStatusReq(BaseModel):
    status: str  # pending | approved | declined


class TrialClaimReq(BaseModel):
    category: str  # "Kids" or "Adults"
    child_name: Optional[str] = None
    child_age: Optional[str] = None
    attendee_name: Optional[str] = None  # Adults: person's name
    preferred_day: Optional[str] = None  # legacy label (auto-filled from chosen session)
    class_id: Optional[str] = None       # the specific Muay Thai session the member picked


class RescheduleReq(BaseModel):
    requested_time: str
    requested_at: Optional[str] = None   # ISO QLD wall-clock of the NEW chosen time
    note: Optional[str] = None


class AdminRescheduleReq(BaseModel):
    new_time: str
    new_at: Optional[str] = None   # ISO naive Queensland wall-clock (structured picker)
    note: Optional[str] = None


class AttendanceReq(BaseModel):
    attended: bool = True


class MessageReq(BaseModel):
    body: str


class AnnouncementUpdate(BaseModel):
    title: str
    body: str
    pinned: bool = False
    category: Optional[str] = "general"
