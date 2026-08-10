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

## Session update 5 (Jun 2026 fork)
- FIXED: Facebook widget not filling its box on wide/desktop web. The FB Page plugin is hard-capped at 500px wide, so it left white side-gaps in wider containers. FacebookFeed.tsx now scales the 500px iframe up on web (CSS transform scale = containerWidth/plugW, transform-origin top-left, wrapper height scaled to match). Verified: iframe visual width == box width (992==992, scale 1.984). Phone/narrow (Expo Go) uses scale=1 (already fit). Note: FB content shows blank in headless/automated browsers (cookie policy) but renders on real devices/normal browsers.

## Session update 6 (Jun 2026 fork)
- DONE (already existed, now with tap-through link): Member Reply Email. When an admin replies (POST /api/admin/threads/{user_id}), the member gets an in-app notification + email ("New message from Max Energy") which now includes an orange "Open your messages" button linking to {base}/messages. Verified 202 delivery to a real address (scottcarman69@gmail.com). Fake test emails get a 422 undeliverable (expected, not a bug).

## Session update 7 (Jun 2026 fork)
- DONE: Delete Account (Apple review requirement). DELETE /api/auth/account removes the signed-in user + all their data (bookings, RSVPs, trials, applications, notifications, payment_transactions, messages, sessions); admin accounts blocked (400). In-app "Delete my account" button + confirm modal on Profile (hidden for admins). Verified: member delete 200, re-login 401, admin delete 400. Also removed hardcoded admin cred fallbacks (now env-only) and quoted .env values with spaces to clear deployment health-check blockers (status now PASS/warn only).
- DONE: Modernised Home Quick Actions icons — gradient icon chips with per-action vibrant colors + shadow + corner chevron + press scale (View Schedule/Check-In/Free Trial/Join Membership/Our Services/Gym Notices/About Us/Contact).

## Session update 8 (Jun 2026 fork)
- Removed classes: Beginners Muay Thai and Sparring Session (deleted DB instances + seed templates; no bookings affected).
- Muay Thai - Kids moved to Mon & Wed only (shifted Thu sessions to Wed to preserve 4 existing bookings; updated template days [0,2], class description, and Kids membership plan features text).
- Web view fix: app now renders as a centered phone-width column on web (appFrame maxWidth 480 + side borders on Platform web) instead of stretching full browser width. Mobile unchanged.

## Session update 9 (Jun 2026 fork)
- Renamed brand "Max Energy Muay Thai Academy" -> "Maxenergy Fitness" everywhere (emails, PDF, events, gym info, EMAIL_FROM_NAME, contact); home tagline now "FITNESS & MUAY THAI".
- Logo: kept design but trimmed transparent padding on maxenergy-logo.webp (now 1200x793, aspect ~1.51) and fixed aspect-correct sizing (login 250x166, register 150x99, home 150x96) with contentFit contain — larger/cleaner on dark theme, no crop.
- Tab bar: added Inbox tab (new app/(tabs)/inbox.tsx reusing member chat UI) and removed Reviews (href:null). Unread message badge moved from Profile tab to Inbox tab. Profile "Message the Gym" link now routes to /(tabs)/inbox. Bar order: Home, Timetable, Notices, Inbox, Profile.

## Session update 10 (Jun 2026 fork)
- Added a bottom-bar "Alerts" tab (bell icon) = personal notifications center. New screen app/(tabs)/alerts.tsx lists all notifications (icon per type, timestamp, unread dot), with Mark all read + swipe-left to clear + pull-to-refresh. Bottom bar now: Home, Timetable, Notices, Inbox, Alerts, Profile.
- Tab badge shows exact unread notification count via new GET /api/notifications/unread; also added POST /api/notifications/read-all. Tab layout polls both unread messages (Inbox badge) and unread notifications (Alerts badge) every 15s + on focus/appstate.

## Session update 11 (Jun 2026 fork)
- Message alerts are now tappable & deep-link to the conversation. Added optional `data` field to notifications (create_notification/notify_user/notify_admins). Member-message alert stores {nav:admin_thread,user_id,name} -> admin taps to open /admin/thread for that member; gym-reply alert stores {nav:member_inbox} -> member taps to open /(tabs)/inbox. Alerts screen (alerts.tsx) routes on tap based on data + user.is_admin, shows "Tap to open conversation" hint on message alerts. Verified: admin tap opens the member thread with reply box.

## Session update 12 (Jun 2026 fork)
- Booking/application/trial alerts now tappable & deep-link. Added default nav routing in notification helpers: ADMIN_NAV {booking->admin_bookings, application->admin_applications, trial->admin_members}; MEMBER_NAV {booking->member_bookings(Profile), application/membership->member_membership(/membership)}. notify_admins/create_notification set data.nav by type when not explicitly provided. Alerts screen openNotif routes on data.nav (admin_thread/member_inbox/member_bookings/member_membership/admin_bookings/admin_applications/admin_members) and shows "Tap to view details ›" hint on any actionable alert. Verified: member membership-approved alert opens /membership; message alert opens thread. Note: only notifications created after this change carry data.
