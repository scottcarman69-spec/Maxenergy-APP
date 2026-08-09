# Max Energy Fitness App — Feature Summary & Admin Guide

_Last updated: June 2026_

This document summarises everything built/changed in the app and includes simple how‑to guides for the gym team.

---

## 1. Admin Login — How To

You log in just like any member, using an admin account.

**Admin accounts**
| Email | Password | Access |
|-------|----------|--------|
| `info@maxenergy.com.au` | `maxenergy12@` | Full admin |
| `admin@maxenergy.com.au` | `MaxAdmin123!` | Full admin |

**Steps**
1. Open the app (or web preview) — you land on the **Log in** screen.
2. Enter the admin **email** and **password** and tap **Log in**.
3. Go to the **Profile** tab (bottom‑right).
4. Tap the orange **ADMIN DASHBOARD** button (you'll also see an ADMIN badge).
5. Manage **Classes, Bookings, Members & Trials, Gym Notices, Applications**.

> Already logged in as a member? Tap **Log out** on Profile first, then log back in with the admin details.

---

## 2. What's in the Admin Dashboard

- **Manage Classes** — add, edit, rename, remove classes and times.
- **Bookings** — accept, reschedule or cancel bookings (each notifies the member).
- **Members & Trials** — browse/search everyone who has signed up and claimed free trials.
- **Gym Notices** — post, **edit**, and delete announcements members see.
- **Applications** — review and approve/decline membership applications.

---

## 3. Booking Management (Members + Admin)

**Members (Profile → My Bookings)**
- **Cancel** a booking.
- **Reschedule** — request a preferred day/time; the gym confirms it.
- Every action sends the member an **in‑app notification + email**, and alerts the gym.

**Admins (Admin → Bookings)**
- Filter by **Active / Requests / All**.
- Each booking shows the member's **name + email** and status.
- **Accept**, **Reschedule (confirm a new time)**, or **Cancel** — the member is notified by email + in‑app each time.

---

## 4. Payments & Confirmations

- When a class payment is **verified**, the member gets:
  - An **in‑app notification**: "Payment verified — booking confirmed".
  - A **detailed confirmation email**: class, coach, date/time, duration, amount paid, booking reference and gym location.
- The gym inbox is notified of every new paid booking.
- Confirmation is sent **once** (no duplicates), whether confirmed by the app or Stripe's webhook.

---

## 5. Class Reminders

- Members automatically receive a **reminder the day before** a booked class — via **in‑app notification + email**.
- Runs automatically (hourly check); each booking is reminded only once.

---

## 6. Free Trials

- Members can claim **one Kids** and **one Adults** free trial (can't be claimed twice).
- Claiming sends a **confirmation email** (class times, what to bring, location, phone, reference) and **notifies the gym**.
- **Kids trial form (in progress):** collects the **child's name, age, and preferred day (Monday or Wednesday)** and notifies the gym with those details.

---

## 7. Members & Trials Database (Admin → Members & Trials)

- Lists **every member** with search by name/email.
- Tags per member: **ADMIN**, **MEMBER** (approved), **APP PENDING**, **KIDS/ADULTS TRIAL**, and active booking count.
- Shows **join date** and **signup method** (Email/Google).
- Top counters: total members, approved members, total trial claims.
- **Export (in progress):** a button to email the full members & trials list as a CSV spreadsheet to the gym inbox.
- **Contact (in progress):** tap a member to **call or email** them directly.

---

## 8. Content & Screens Updated

- **Login screen** headline & copy:
  - "24/7 Gym & Fitness in Smithfield Cairns" tagline block.
  - Pitch: "Train. Get Stronger. Feel Your Best." + friendly family‑run welcome paragraph.
- **Active Member badge** (green) on Profile once a membership form is approved.
- **"Not a member yet?" notice** on the class booking screen for anyone who hasn't submitted a membership form.
- **Class descriptions** rewritten in a friendly, formatted style: Kids Muay Thai, Adults Muay Thai, Kickboxing.
- **Membership form:** photo is now **required** to submit.
- **Membership plans:** renamed to "Kids Muay Thai Casual Visit" and "Adult Muay Thai Casual Visit"; removed "Adult 3x/Week" and "Adult Unlimited".
- **Photos:** Jamie Blackman's real coach photo added; Alex Honorato's photo on the Personal Training card; 5 new gym photos (kickboxing + kids) added to the Home & About galleries.
- **Web layout:** the app now fills the full browser window on desktop (no longer a narrow phone column).

---

## 9. Notes on Testing & Deployment

- You're working in a **dev/preview** environment.
- To go live: tap **Publish** (top‑right) → Deploy your app → Generate iOS & Android builds.
- Browser preview refresh takes ~20–30 seconds.
- Scan the QR code beside the preview to open the app in **Expo Go** on your phone.
- Some native features (notifications, camera, audio) only work on a real device **after** you deploy and generate a build.

---

### Items marked "in progress"
The Kids trial form, Members export, and tap‑to‑contact features are being finalised and will be verified before they're marked complete.
