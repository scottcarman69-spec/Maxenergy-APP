# Maxenergy Fitness — Mobile App PRD

## Original Problem Statement
Build a mobile app: sign up/register page, view class timetables, make online payments for classes, and notify members about upcoming events. Based on Maxenergy Fitness (Cairns/Smithfield gym — Muay Thai, Kickboxing, BJJ, Boxing, Boot Camp, Personal Training).

## User Choices
- Auth: Email/password (JWT) + Google social login (Emergent-managed)
- Payments: Stripe (implemented via emergentintegrations). PayPal requested but not yet built.
- Notifications: In-app feed + email (Resend). Push notifications requested (needs native build).
- Design: Dark theme with vibrant lime (#CCFF00) accents.

## Architecture
- Frontend: Expo Router (SDK 54), React Native. Dark theme in `/src/theme.ts`. Auth in `/src/AuthContext.tsx`, API client `/src/api.ts`.
- Backend: FastAPI + MongoDB (motor). All routes under `/api`.
- Integrations: Emergent Google Auth, Stripe (emergentintegrations StripeCheckout, key `sk_test_emergent`), Emergent Resend email.

## User Persona
Gym members who want to browse the class timetable, book & pay for classes on their phone, and stay informed about gym events.

## Implemented (2026-06-09)
- Email/password register + login (JWT, bcrypt) and Google OAuth session flow.
- Home dashboard: next class hero, upcoming classes carousel, upcoming events.
- Class timetable: 14-day horizontal day selector + per-day class list (84 seeded classes).
- Class detail: full info + "Book & Pay" → Stripe Checkout (WebBrowser) + status polling.
- Events feed + event detail with RSVP → in-app notification + confirmation email.
- Profile: stats, notifications feed (mark read), my bookings, logout.
- Backend tested: 16/16 passed.

## Backlog
- P1: PayPal payment option alongside Stripe.
- P1: Push notifications for event/class reminders (requires deploy + native build).
- P2: Class capacity / spots-left decrement and waitlist.
- P2: Membership plans / subscriptions.
- P2: Cancel/reschedule bookings.
- P2: Trainer profiles & filtering timetable by class type.

## Next Tasks
- Gather user's real business email for admin notifications.
- Add PayPal + push notifications if user requests.
