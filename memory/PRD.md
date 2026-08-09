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
