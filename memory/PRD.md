# Maxenergy Fitness — Mobile App PRD

## Original Problem Statement
Build a mobile app: sign up/register page, view class timetables, make online payments for classes, and notify members about upcoming events. Branded for **Maxenergy Fitness** (Cairns/Smithfield gym — Muay Thai, Kickboxing, BJJ, Boxing, Boot Camp, Personal Training).

## Stack & Architecture
- Frontend: Expo Router (SDK 54), React Native, dark theme + orange accent (#FF7A00), Maxenergy logo.
- Backend: FastAPI (`/api` prefix), MongoDB (motor).
- Integrations: JWT email/password auth, Emergent-managed Google Auth, Stripe checkout (emergentintegrations, `sk_test_emergent`), Emergent-managed Resend email.

## User Personas
- Gym member: browses timetable, books & pays for classes, RSVPs to events, gets notified.

## Core Requirements (static)
1. Sign up / login (email+password and Google). ✅
2. View class timetable by day. ✅
3. Pay online for a class (Stripe). ✅
4. Upcoming events + notify members (in-app feed + email on RSVP). ✅

## Implemented (2026-08-09)
- Auth: register/login (JWT) + Google OAuth session exchange; `/auth/me`, logout.
- Classes: 84 seeded across 14 days; timetable with sticky day selector; class detail.
- Bookings + Stripe checkout session, status polling, webhook, booking confirmation notification.
- Events: 4 seeded; event detail; RSVP creates in-app notification + confirmation email (Resend).
- Notifications feed + My Bookings in Profile.
- Branding: Maxenergy white logo on login/register/home; orange accent theme.
- Backend fully tested (16/16 passing).

## Backlog / Remaining
- P1: PayPal payment option (user requested; Stripe done first).
- P1: Push notifications for event reminders (requires deployed native build; not testable in Expo Go).
- P2: Class capacity/seat reservation enforcement.
- P2: Membership plans / recurring subscriptions.
- P2: Cancel booking + refund flow.

## Next Tasks
- Add PayPal as a second pay option on class detail.
- Add push notifications (Emergent-managed) once user deploys a build.
