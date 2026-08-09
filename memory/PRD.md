# Max Energy Muay Thai Academy — Mobile App PRD

## Original Problem Statement
Mobile app: sign up/register, view class timetables, pay online for classes, notify members of events. Rebranded to **Max Energy Muay Thai Academy** (Cairns/Smithfield) based on maxenergy.com.au.

## Stack
- Frontend: Expo Router (SDK 54), RN, dark theme + orange (#FF7A00), Maxenergy logo.
- Backend: FastAPI (/api), MongoDB (motor). Seed versioned (currently v6).
- Integrations: JWT email/password + Emergent Google Auth; Stripe checkout (emergentintegrations, sk_test_emergent); Emergent Resend email.

## Implemented (2026-08-09)
- Auth: register/login (JWT) + Google; is_admin flag; admin account seeded.
- Classes: Muay Thai academy schedule w/ Kids & Adults categories + timetable filter.
  - Kids Muay Thai: Mon & Thu 5:00–5:45pm, 10 Week Term ($300/term or $35/wk DD, no joining fee).
  - Muay Thai - Adults: Mon & Wed 6pm. Plus Beginners Muay Thai, Kickboxing, Sparring, Personal Training.
- Booking + Stripe checkout + status polling + webhook.
- Events + RSVP (in-app notification + Resend email).
- Gym Notices (announcements) tab.
- Membership Application Form: multi-step (plan, member details, medical questionnaire, media consent, waiver) + DRAW-TO-SIGN signature pad (react-native-svg) + photo capture (expo-image-picker, permission-handled). Emails gym + applicant.
- Contact/Gym Info screen (real Maxenergy details, tap-to-call/email/map, socials).
- About Us screen mirroring website /about: story + trainer profiles (Alex, Jamie, Andrew, Scott).
- Admin Dashboard: overview stats, manage classes (CRUD w/ datetime), post/delete notices, review applications (approve/decline, view signature + photo).
- Backend tested: 41/41 passing (iteration_2).

## Admin credentials
admin@maxenergy.com.au / MaxAdmin123! (see /app/memory/test_credentials.md)

## Backlog
- P1: PayPal payment option; Push notifications (needs native build); Term-dates config for Kids block.
- P2: Locations & Services pages; Trainer booking from profile; Digital member ID card; class capacity/spots-left.

## Session update (Jun 2026 fork)
- FIXED (user bug): Membership application "copy" email was not arriving and PDF was never attached.
  Root cause: (1) Emergent email (Resend) proxy silently DROPS the `attachments` field; (2) sends were hitting a 429 rate limit and being dropped. 
  Fix: added a global email throttle (0.7s min spacing) + retry backoff in send_email; replaced PDF/CSV attachments with SECURE PUBLIC DOWNLOAD LINKS.
  New endpoints: GET /api/membership/forms/{application_id}.pdf and GET /api/admin/exports/{export_id}.csv (public capability URLs). Membership + members-export emails now embed a "Download" button built from the request host (works in preview & deploy). Verified: PDF/CSV download HTTP 200, test email delivered (202) to scottcarman69@gmail.com.
- DONE: In-app Messaging fully wired. Member "Message the Gym" link on Profile -> /messages. Admin Inbox card on dashboard -> /admin/inbox (thread list w/ unread) -> /admin/thread (reply). Admin Members list now has per-member Call (tel:), Email (mailto:), and Message (opens admin thread) buttons; phone shown. admin/overview returns unread_messages.
- Backend tested: 15/15 passing (iteration_6).

## Session update 2 (Jun 2026 fork)
- DONE: "Download my membership form" button on member Profile — appears when the member has a submitted application with a stored PDF; opens GET /api/membership/forms/{application_id}.pdf via Linking. Backend /membership/applications/me now excludes pdf_base64 from the payload (slim). Verified rendering.
- DONE: Unread Message badge on the Profile tab. New endpoint GET /api/messages/unread (no mark-read). (tabs)/_layout.tsx polls every 15s + on AppState active + on route change, sets tabBarBadge on Profile. Verified: badge shows "1" after an admin reply; clears once member opens the Messages screen (GET /messages marks read).

## Session update 3 (Jun 2026 fork)
- DONE (already existed, now reliable + improved): New Message Ping — POST /api/messages fires notify_admins which emails GYM_ADMIN_EMAIL (info@maxenergy.com.au) instantly on every member message. Email subject now includes the member's name ("New message from <name>"). Verified 202 delivery after the email-throttle fix. Old 429 failures were pre-throttle.

## Session update 4 (Jun 2026 fork)
- DONE: Reply Link In Email. The gym "New message from <name>" ping email now includes an orange "Open conversation" button linking to {base}/admin/thread?userId=<uid>&name=<name> (base built from request host, works in preview & deploy). Opens the exact member conversation in the Admin Inbox (web loads directly; logged-in admins land in the thread). Verified: email 202, /admin/thread route 200.
