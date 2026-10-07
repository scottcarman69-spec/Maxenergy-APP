# Maxenergy Fitness — Shared Data Integration Requirements (for the Website Developer)

**Goal:** The mobile app and the website should use **one shared live database** so members, bookings, credits, etc. are identical on both. A member can log in / book on **either** platform with the **same account**, and the website can also display app data.

**Master system:** The **mobile app** is the source-of-truth schema. The website must be adapted to match the app's data model and authentication exactly (do NOT change the app to match the website).

---

## 0. High-level approach

1. **One shared MongoDB (Atlas).** Both the app and the website point to the *same* MongoDB Atlas cluster (`MONGO_URL` + `DB_NAME`), instead of their own Emergent-managed DBs.
2. **Identical schema.** The website reads/writes the **same collections and field names** the app uses (defined below). No renamed fields, no parallel collections.
3. **Identical auth.** The website uses the **same JWT format, same secret, and same bcrypt password hashing** so a token/login works across both.
4. **One-time migration.** Existing website members/bookings are converted into the app's schema and merged (de-duplicated by email).

> Confirm with **support@emergent.sh** (include job IDs of BOTH projects) that you can set a custom external `MONGO_URL`/`DB_NAME` on each deployment, since external-DB use on Emergent isn't fully documented.

---

## 1. Shared database connection

Set these **identical** values in **both** projects' deployment Environment Secrets:

```
MONGO_URL = <your MongoDB Atlas SRV connection string>
DB_NAME   = <the shared database name, e.g. maxenergy>
```

- Create a free (or paid) **MongoDB Atlas** cluster.
- Create a DB user, and **whitelist outbound IPs** (or allow 0.0.0.0/0 to start) so both Emergent deployments can connect.
- Both apps must use the **same `DB_NAME`**.

---

## 2. Authentication contract (must match the app exactly)

The app uses **stateless JWT (Bearer)** auth.

| Item | Value |
|---|---|
| Algorithm | **HS256** |
| Secret | **`JWT_SECRET`** — must be the **SAME string** in both projects' env |
| Header | `Authorization: Bearer <token>` |
| Token payload (claims) | `{ "sub": <user_id>, "ver": <token_version>, "iat": <unix>, "exp": <unix, +30 days> }` |
| Password hashing | **bcrypt** (`bcrypt.hashpw(pw, bcrypt.gensalt())`), stored in `users.password_hash` |

**Token validation rule:** a token is valid only if `payload.ver == users.token_version`. Incrementing `token_version` on a user logs them out everywhere (used for logout / password reset). The website must honour this same rule.

### Auth endpoints the app exposes (website should mirror the behaviour / or call these)
- `POST /api/auth/register` → `{ first_name, last_name, email, password, date_of_birth (YYYY-MM-DD), phone }` → stages a pending registration + emails a 6-digit OTP (returns `{pending:true}`).
- `POST /api/auth/verify-otp` → `{ email, code }` → creates the verified user, returns `{ token, user }`.
- `POST /api/auth/login` → `{ email, password }` → `{ token, user }`.
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` (OTP-based).
- `POST /api/auth/session` (Google) / `POST /api/auth/apple` (Apple) — Emergent-managed social login.

**Decision for the dev team:** either
- (A) the website **calls the app's `/api/auth/*` endpoints** for login/register (simplest, one auth brain), **or**
- (B) the website **re-implements** login/register using the **same secret + bcrypt + JWT claims + token_version rule** above so tokens are interchangeable.

Emails are **always stored lowercased** and are the unique key for an account.

---

## 3. ID & data conventions

- **IDs** are strings shaped `"<prefix>_<12 hex>"` — e.g. `user_a1b2c3d4e5f6`, `bk_...`, `cl_...`. Generate new IDs the same way; never reuse Mongo `_id` as the business key.
- **Dates** are stored as native **BSON datetimes in UTC**.
- **Money** is stored as **integer cents** (e.g. `2500` = $25.00). Currency is `"aud"`.

---

## 4. Collections (the app's schema the website must conform to)

Full collection list (shared): `users`, `bookings`, `classes`, `class_templates`, `schedule_exceptions`, `membership_applications`, `membership_plans`, `payment_transactions`, `credit_ledger`, `pass_ledger`, `gift_cards`, `events`, `event_rsvps`, `free_trials`, `waitlists`, `notifications`, `announcements`, `messages`, `dm_messages`, `group_chats`, `group_messages`, `friendships`, `user_sessions`, `pending_registrations`, `otp_codes`, `rate_limits`, `meta`, `settings`, `booking_logs`, `gym_photos`, `term_interest`, `gift_card`/`giftcard_attempts`, `pass_redemptions`, `reports`, `blocks`, `exports`, `content_views`.

The two that matter most for cross-platform login & booking:

### 4.1 `users` (unique key: `email`, lowercase)
```
user_id            string   "user_xxxxxxxxxxxx"   (primary business key)
email              string   lowercase, UNIQUE
name               string   full display name (never store an email here)
first_name         string
last_name          string
date_of_birth      string   "YYYY-MM-DD"
phone              string   digits/+ only
password_hash      string   bcrypt (null for Google/Apple-only accounts)
provider           string   "password" | "google" | "apple"
picture            string|null
is_admin           bool
verified           bool     (true once OTP-verified)
token_version      int      (default 0; bump to invalidate tokens)
created_at         datetime (UTC)
class_pass_credits int      (number of class passes)
credit_cents       int      (account credit in cents)
handle             string|null
children           array    [{ child_id, name, age }]
child_age_default  int|null
reminder_hours     int      (default 1)
cal_reminder_default int    (default 60)
quick_actions_order array of strings
key_tag            bool
membership_plan        string|null
membership_active      bool
membership_expires_at  datetime|null
membership_form_completed_at datetime|null
```

### 4.2 `bookings`
```
booking_id     string   "bk_xxxxxxxxxxxx"
user_id        string   -> users.user_id
class_id       string   -> classes.class_id (may be a virtual id "<template_id>__YYYY-MM-DD")
class_name     string
amount         int      cents
currency       string   "aud"
by_appointment bool
duration_min   int
class_start    datetime|null
status         string   "pending" | "paid" | "confirmed" | "cancelled" | "reschedule_requested"
attended       bool|unset
paid_with_pass bool|unset
credit_applied_cents int|unset
child_id/child_name/child_age   (for kids classes)
requested_time / requested_at   (appointments only)
created_at     datetime
paid_at        datetime|unset
```

### 4.3 `classes` (and `class_templates`)
Fixed weekly classes are **generated from `class_templates`**; concrete rows are "materialised" on booking with `class_id = "<template_id>__YYYY-MM-DD"`.
```
class_id      string
template_id   string
name          string
category      string   "Adults" | "Kids" | "Boot Camp"
trainer       string
price_cents   int
currency      "aud"
duration_min  int
capacity      int
by_appointment bool
appt_durations array    [{ minutes, price_cents }]   (PT/Programs)
start_at/end_at datetime
min_age/max_age int|null
```

(Other collections — credit_ledger, pass_ledger, payment_transactions, gift_cards, events, etc. — follow the same cents/UTC/prefixed-id conventions; the dev can request exact shapes per collection if the website needs to write them. For a **display-only** website, read access to `classes`, `bookings`, `events`, `announcements` is usually enough.)

---

## 5. One-time data migration (merge existing data)

1. **Back up** both databases first.
2. **De-duplicate members by `email` (lowercased).**
   - If an email exists in **both** systems → keep **one** `users` record. Prefer the record that already matches the app schema; copy over any missing fields.
   - **Passwords:** bcrypt hashes can't be "converted". If the website used a *different* hashing scheme, those users **cannot keep their old password** — either (a) have them use **"Forgot password"** once after go-live, or (b) if the website already used bcrypt with the same cost, the hash can be copied as-is.
   - Preserve the **app's `user_id`** as the canonical id; build an `old_website_id -> user_id` map.
3. **Re-point bookings/credits/etc.** Rewrite each migrated record's `user_id` using the map; convert money to **integer cents**, dates to **UTC datetimes**, statuses to the app's allowed values.
4. **Avoid id clashes:** regenerate any colliding business ids with the `"<prefix>_<12hex>"` pattern.
5. **Dry-run** against a copy of the shared DB; verify a few members can log in and see their correct bookings before switching production traffic.

---

## 6. Rollout order (recommended)

1. Create the shared **Atlas** DB; confirm custom-DB support with Emergent support.
2. Run the **migration** into the Atlas DB (app data first, then merge website data).
3. Point the **mobile app** at the Atlas DB (set `MONGO_URL`/`DB_NAME`), deploy, smoke-test.
4. Update the **website** to the shared schema + shared JWT/bcrypt auth; point it at the Atlas DB; deploy.
5. Verify cross-platform: register on web → log in on app (and vice-versa); a booking made on one shows on the other.

---

## 7. What stays owned by the mobile app
Keep **payments (Square), prices, class-pass/credit spending, and all booking rules server-side in the app's backend** (these are security-critical and already audited). If the website needs to create bookings or take payments, it should **call the app's `/api` endpoints** rather than writing those collections directly, so the business rules are enforced in one place.

---

*Prepared from the mobile app codebase. Exact JSON shapes for any additional collection can be provided on request.*
