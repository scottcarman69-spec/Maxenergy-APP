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

## Session update 13 (Jun 2026 fork)
- New membership application now also creates an in-app admin alert (previously email-only). membership_apply loops all admins with create_notification(type="application", data={nav:"admin_applications"}) after the gym email. Tappable -> Admin Applications; increments Alerts badge. Verified via curl (admin notif carries data.nav=admin_applications).

## Session update 14 (Jun 2026 fork)
- Facebook feed made shorter & cleaner: FEED_HEIGHT 640->460; plugin params small_header=true, hide_cover=true, show_facepile=false for a compact look. Verified iframe now 460px tall. (Since app web frame is capped at 480px, no upscaling occurs.)

## Session update 15 (Jun 2026 fork)
- Home screen redesigned to match supplied mock: time-based greeting (Good morning/afternoon/evening + first name + wave), avatar with unread dot, UP NEXT hero card (badge + icon meta + Book Class), 4-col Quick Actions with circular gradient icons, rich Upcoming Classes rows (colored left bar + circular sport icon + colored category + Book outline btn + chevron).
- Kids class icon changed to MaterialCommunityIcons "karate" (kicking figure, green); Adults barbell, Boxing fitness (Ionicons) kept.
- App background: reverted ImageBackground/app-bg approach (rendered white on RN web due to navigator theme bg). New shared ScreenBg component (src/components/ScreenBg.tsx): opaque black base + faint kickbox1.webp (opacity 0.13) + rgba dark overlay, added as first child inside each tab screen's SafeAreaView (home/timetable/events/inbox/alerts/profile). Reliable black-with-transparent-gym-image look. Verified via screenshot.

## Session update 16 (Jun 2026 fork)
- Timetable restyled to match Home (colored left bar + fighter icon badge per category + colored category tag + Book outline button). Home greeting now shows a "N classes today" pill (todayCount from classes starting today).
- Class images set (data URI in db.classes): Kids, Adults, Kickboxing group photos. Class icons: Kids karate(green), Adults karate(orange), Kickboxing boxing-glove(blue).
- About Us: removed coach Andrew Roussety; Jamie Blackman qual "World-level competitor"->"Personal trainer"; updated Jamie bio. Fixed About back button (was swallowed by heroBottom sibling due to un-positioned SafeAreaView stacking context) — SafeAreaView now position:absolute + pointerEvents box-none. Verified by testing_agent iteration_7 (backend 6/6, frontend back-button flow /about->/home works).

## Session update 17 (Jun 2026 fork) — Email Verification & Password Recovery (P0 DONE)
- 6-digit OTP email verification for new sign-ups + Forgot Password recovery. Codes hashed (bcrypt) in db.otp_codes, 10-min expiry (TTL index), max 5 attempts, 30s resend cooldown. Codes emailed via existing Resend helper AND logged ("OTP issued for <email> (<purpose>): <code>") for testability.
- Backend endpoints: POST /api/auth/verify-otp, /api/auth/resend-otp, /api/auth/forgot-password (no account enumeration — always {ok:true}), /api/auth/reset-password (returns fresh token+user, invalidates old sessions). Register now sets verified=false + emails a verify code; user_public returns `verified`. Google + grandfathered users auto-verified (startup migration sets verified=true where field missing).
- User choices honoured: SOFT GATE (new member logged in, sees orange "Verify your email" banner on Home; can verify later); 10-min expiry; existing members grandfathered.
- Frontend: new /(auth)/verify.tsx and /(auth)/forgot-password.tsx (2-step: email -> code+new password -> auto-login). Register routes to /verify; Login has "Forgot password?" link; Home shows verify banner when user.verified===false.
- Verified by testing_agent iteration_8: backend 7/7 pytest, all frontend auth flows pass.

## Session update 18 (Jun 2026 fork) — Notices Polish (DONE)
- Redesigned Notices tab (app/(tabs)/events.tsx) to match Home/Timetable modern card style: eyebrow header, colored left accent bar per card, gradient circular icon chips (pin=orange/PINNED, megaphone=blue/NOTICE), section headers with count pills, and richer event cards (calendar badge, location meta, "View & RSVP" CTA). Added empty state. Data/logic unchanged. Verified via screenshot.

## Session update 19 (Jun 2026 fork) — Login screen redesign (DONE)
- Rebuilt app/(auth)/login.tsx to match supplied hero mock: darker hero with logo + orange "24/7 GYM & FITNESS" eyebrow + "IN SMITHFIELD CAIRNS" headline + a 4-chip feature row (24/7 Access, Muay Thai/Kickboxing, Boot Camp/PT, Adults & Kids) with vertical dividers overlaid on the hero.
- Big slam headline TRAIN. / GET STRONGER. (orange) / FEEL YOUR BEST. with an orange skewed brush underline.
- 4-column outline-icon features (All Levels Welcome, Adults & Kids Classes, More Than Just a Gym, Train Your Way) with dividers; chevron accents (>> ... <<) around centered welcome copy.
- Form: "LOG IN TO GET STARTED" heading, light input fields with leading mail/lock icons + password eye toggle, right-aligned orange "Forgot password?", orange LOG IN button w/ arrow, OR divider, dark CONTINUE WITH GOOGLE button (colored G), "New here? Create an account". All auth logic + testIDs unchanged. Verified via screenshots.
- NOTE: hero still uses bundled gym3.jpg (no dramatic solo-boxer asset available); swap in if user provides that image.

## Session update 20 (Jun 2026 fork) — Home UP NEXT slideshow + spinner fix (DONE)
- BUG FIX: a persistent orange ActivityIndicator was stuck above UP NEXT on Home. Root cause: the earlier "verify email" banner insert (session 17) corrupted the JSX ternary — the `{loading ? (` opener was lost, leaving the spinner rendered unconditionally + a dangling `) : (`. Restored the loading gate.
- FEATURE: UP NEXT is now an auto-advancing swipeable carousel of up to 6 upcoming classes (horizontal paging ScrollView, ref+CARD_W scrollTo, 4.5s auto-advance, pagination dots, per-card image/category/time/Book Class, tap opens class detail). Kept testID home-next-class-card on the first slide. Verified via screenshots (auto-advance cycles Kids->Adults->Kickboxing, dots update).

## Session update 21 (Jun 2026 fork) — Membership Terms & Conditions (DONE)
- Added the official member-supplied "Maxenergy Fitness Policies & Terms Agreement" to the membership form. Full verbatim terms stored in new /app/frontend/src/membershipTerms.ts (MEMBERSHIP_TERMS sections + TERMS_DECLARATION + TERMS_VERSION "2026-06").
- Membership form step 4 (Waiver): replaced the short summarised waiver text with a "MEMBERSHIP TERMS & CONDITIONS" preview + "Read the full Terms & Conditions" button that opens a full-screen scrollable Modal showing all sections (Risks, Release & Indemnity, Administration, PT/Massage, Term, Direct Debit, Cooling-Off, Suspension/Cancellation, Membership Cards, Privacy Act, Media Consent, Activity Waiver, Governing Law) + declaration. Modal has an "I AGREE TO THESE TERMS" button that ticks the mandatory checkbox.
- MANDATORY agree checkbox (testID waiver-agree) — submission blocked until ticked (validateStep step 3). Added red "* Agreement required" note when unticked. Submission now records terms_accepted, terms_version, terms_accepted_at in application details.
- Verified via automated walkthrough (login -> membership -> step 4 -> open modal -> agree -> checkbox turns green).

## Session update 22 (Jun 2026 fork) — Clear-all notifications + saved log history (DONE)
- Notifications are now SOFT-CLEARED (never hard-deleted) so a permanent log is kept. Added `cleared`/`cleared_at` flag.
- Backend: GET /notifications now excludes cleared; unread count excludes cleared; DELETE /notifications/{nid} soft-clears; NEW POST /notifications/clear-all (soft-clears all, returns count); NEW GET /notifications/history (returns ALL incl. cleared, limit 500). Route order: static paths declared before /{nid} routes.
- Frontend: api.ts +clearAllNotifications +notificationsHistory. Profile NOTIFICATIONS section header now has "Log" (opens history) and "Clear all" buttons; clearAll shows a banner "cleared, still in your log". New screen /app/frontend/app/notification-history.tsx (read-only full log with CLEARED tags + timestamps). Alerts-tab swipe-to-clear also soft-clears now (stays in log).
- Verified: backend clear-all removed 2 from active list, history retained both; UI screenshots of Profile buttons + Notification Log confirmed.

## Session update 23 (Jun 2026 fork) — Clear-all bookings + saved booking log (DONE)
- Mirrored the notifications treatment for bookings. Bookings now SOFT-CLEAR (never hard-deleted) via `cleared`/`cleared_at`.
- Backend: GET /bookings excludes cleared; NEW GET /bookings/history (all incl cleared, limit 500); NEW POST /bookings/clear-all (soft-clear all); NEW POST /bookings/{id}/clear (soft-clear one). Static routes declared before dynamic /{booking_id}/... routes.
- Frontend: api.ts +bookingsHistory +clearAllBookings +clearBooking. Profile MY BOOKINGS header now has "Log" (opens /booking-history) + "Clear all"; each booking card is swipe-left-to-clear. New screen /app/frontend/app/booking-history.tsx (read-only full log w/ status pills + CLEARED tags + timestamps). Clearing a booking is display-only (does NOT cancel it; gym/admin still sees it).
- Verified: backend clear-all/history/clear endpoints 200; Profile + Booking Log screens render.

## Session update 24 (Jun 2026 fork) — Facebook feed fits white box on mobile (DONE)
- Fixed FB Page Plugin leaving a large white gap + narrow content inside the white card on Expo Go (native WebView). The plugin reserved a fixed tall height regardless of content.
- FacebookFeed.tsx: request a tall plugin (PLUGIN_HEIGHT=1300) so FB renders several posts, then inject MEASURE_JS that posts document scrollHeight back via onMessage; WebView height = measured content height (clamped MIN_H 260 .. MAX_H 1600), width 100%, scrollEnabled=false, bg #fff. Reset measured height on tab switch. feedCard no longer centers (stretch + top-align). Web branch (iframe + scale) unchanged.
- NOTE: native-WebView-only behaviour — cannot be validated in the web preview; must be checked in Expo Go on device.

## Session update 25 (Jun 2026 fork) — FB feed width fix CONFIRMED
- Root cause of half-width feed: raw plugin URL rendered at device physical-pixel viewport. Fixed by rendering the plugin inside a controlled HTML wrapper (source={{html, baseUrl:'https://www.facebook.com'}}) with viewport width=device-width + data-adapt-container-width=true + CSS width:100% on .fb-page/span/iframe. data-height=900; WebView height = measured scrollHeight (clamped 260..1600), scrollEnabled=false. Web branch unchanged (iframe + scale). User CONFIRMED fixed on Expo Go device.

## Session update 26 (Jun 2026 fork) — Email T&C copy on membership submit (DONE)
- Membership confirmation email to the applicant now includes a full copy of the Membership Terms & Conditions (12 sections + declaration) alongside the PDF form download link. Subject changed to "Your Max Energy membership form & terms (copy)".
- Backend: added MEMBERSHIP_TERMS_TC list + TERMS_DECLARATION_TC + _membership_terms_html() helper (server.py, after _download_button); appended to conf_html in /membership/apply. Verified: helper renders 12 sections, release/waiver/declaration present; backend boots clean.

## Session update 27 (Jun 2026 fork) — Membership PDF redesign + T&C in PDF (DONE)
- Redesigned build_membership_pdf (server.py) for a neat, professional layout: orange header band (MAXENERGY FITNESS + form title + address/phone), section bars (light-grey pill + orange left accent), aligned two-column label/value rows with word-wrap for long values, signature rendered in a bordered box. Added ensure()/section()/field() helpers replacing old `line()`.
- Appended full Membership Terms & Conditions to the PDF (12 sections + declaration + "Accepted by <name> on <date>" stamp), with word-wrap + page breaks. Kept "Photo & Signature" header from orphaning via ensure(210).
- Verified by rendering the generated PDF to images (pymupdf): 4 pages, header/sections/fields/signature/terms all render cleanly.

## Session update 28 (Jun 2026 fork) — ABN on PDF + admin views saved membership PDF (DONE)
- Added business ABN 81 213 163 833 to the membership PDF header line (server.py build_membership_pdf).
- Membership PDFs are already saved (pdf_base64 in membership_applications) and served publicly at /api/membership/forms/{id}.pdf (same link emailed). 
- Admin fix: /admin/applications now EXCLUDES pdf_base64 (lighter payload) and returns has_pdf flag. Admin applications.tsx "View membership PDF" now opens the hosted URL `${BACKEND_URL}/api/membership/forms/{id}.pdf` via WebBrowser (native) / Linking (web) instead of a giant data: URI that failed on mobile — so admins view the exact PDF emailed to the member. Verified: endpoint returns has_pdf true + no pdf_base64; hosted PDF 200 application/pdf; ABN present in generated PDF.

## Session update 29 (Jun 2026 fork) — Membership decisions log (approved/declined) (DONE)
- PDF acceptance stamp changed to "Accepted by Maxenergy Fitness on <date>" (was member name). Member name/signature still shown in Photo & Signature section.
- Approve/decline now records decided_at + decided_by and pushes to status_history[] on the application doc.
- NEW GET /api/admin/membership-log → approved/declined apps (excl pdf_base64, +has_pdf), sorted by decided_at desc, with approved/declined counts.
- NEW screen /app/frontend/app/admin/membership-log.tsx: summary counts, All/Approved/Declined filter, per-decision card (badge, plan, email, decided date+admin, View PDF via hosted URL). Entry point: "Log" button in Admin Applications header. api.ts +adminMembershipLog.
- Also earlier this session: emailed a real test membership (with T&C in body + ABN in PDF) to scottcarman69@gmail.com (Resend 202 Accepted).
- Verified: approve returns 200 + logs decided_by "Max Energy Admin"; log endpoint 9 approved / 5 declined; screen renders with counts, filters, PDF buttons.

## Session update 30 (Jun 2026 fork) — Embed real Vigyr sign-on form (DONE)
- User chose Option 2: embed the real Vigyr online sign-on so members register directly in Vigyr's DB (drives keytags/door access).
- NEW screen /app/frontend/app/vigyr-signon.tsx: WebView (native) / iframe (web) loading https://signon.vigyr.com/online-sign-on/form/CUSTOMER/75-MaxenergyFitness with header (back + "Browser" external-open via WebBrowser/Linking), loading + error overlays. JS + DOM storage + inline media enabled for the 7-step form (detail/health/membership/agreement/signature/comments/submit).
- Repointed all member-facing membership CTAs to /vigyr-signon: home quick action "Join Membership", services-membership-cta, profile "Membership Application", alerts member_membership tap. Old /app/frontend/app/membership.tsx kept in code but unlinked.
- Verified: form loads in-app (Step 1 of 7 fields visible) via screenshot. NOTE: signature step + final submit should be validated in Expo Go on device. Vigyr sign-ups do NOT feed our PDF/email/admin log (expected).

## Session update 31 (Jun 2026 fork) — Coach Photos on schedule (DONE)
- Classes now show the real coach headshot so members know who's teaching.
- Backend: added COACH_PHOTOS map + coach_photo()/with_coach() helper (server.py after /about). GET /classes and /classes/{id} now return `trainer_photo` (resolved from trainer name; "Coach Alex" -> Alex Honorato headshot).
- Frontend: new shared src/coaches.ts `coachSource(trainer, trainerPhoto)` — bundled teamPhotos (alex.jpg/jamie.jpg) first, else backend URL. Timetable class cards + appointment card render the coach avatar in the badge with a small category-color icon chip overlay (keeps sport context). Home "Upcoming Classes" rows show the coach avatar + a "with Coach X" meta line. Class detail (`/class/[id]`) adds a "YOUR COACH" card (avatar + name) between the meta grid and About.
- Verified via screenshots: timetable shows Alex's photo per class + green/orange category chip; class detail YOUR COACH card renders.
- NOTE (Vigyr): user reported a credit-card error on the external Vigyr sign-on portal. We open it in the full system browser (expo-web-browser), so it behaves like a normal browser — the card step is controlled by Vigyr, not the app. Pending user detail on the exact error.

## Session update 32 (Jun 2026 fork) — Tappable Coach Bios (DONE)
- Coach photos are now tappable everywhere they appear -> open a coach profile with full bio + qualifications.
- NEW screen /app/frontend/app/coach.tsx: takes `name` param (the class trainer string e.g. "Coach Alex"), fetches /api/about, matches the About team member by first-name (strips "Coach "), and shows a hero photo + role + ABOUT bio + QUALIFICATIONS checklist + Get in touch CTA. Uses bundled teamPhotos override, falls back to About image URL.
- Wired taps: timetable class-card avatar (testID coach-avatar-{id}) + appointment-card avatar + home upcoming-row avatar (testID home-coach-{id}) are nested Pressables -> /coach?name=<trainer>. Class detail "YOUR COACH" card is now a Pressable with a "Tap to view bio & qualifications" hint + chevron.
- Route auto-registered (root Stack has no explicit screens). Verified via screenshot: tapping Alex's photo opens his profile (bio + 5 quals).

## Session update 33 (Jun 2026 fork) — Vigyr embedded form + browser link (DONE)
- User asked to bring back the in-app embedded Vigyr form AND keep a browser link.
- Rebuilt /app/frontend/app/vigyr-signon.tsx: WebView (native) / iframe (web) loading the Vigyr sign-on URL with loading + error overlays. Header has a "Browser" pill (open-outline) + a bottom footer link "Trouble entering card details? Open in your browser" — both call WebBrowser.openBrowserAsync (native) / Linking (web). Error overlay also offers "Open in browser instead".
- WebView flags: javaScriptEnabled, domStorageEnabled, thirdPartyCookiesEnabled, sharedCookiesEnabled, allowsInlineMediaPlayback, originWhitelist ["*"].
- Verified: embedded form loads Step 1 of 7 (Member Details) in web preview; Browser button + footer link render.
- KNOWN LIMITATION (told user): the card/direct-debit step is Vigyr's secure payment iframe — embedding inside an in-app WebView can block it (the prior error). The "Open in browser" link is the reliable path for card entry. Did NOT auto-submit (would create a fake member in the gym's live Vigyr DB). Card step must be validated by user in Expo Go.

## Session update 34 (Jun 2026 fork) — Vigyr browser-first (FINAL, user chose C)
- Confirmed root cause via user screenshot: the card step is a nested "Debit First" PCI-secure payment iframe (2 layers deep inside our WebView) which renders as a broken image — bank-grade iframe resists app embedding. Also, switching to browser mid-flow would drop the member's entries (fresh Vigyr form = double entry).
- User chose to open the WHOLE sign-up in the secure browser from the start. Reverted vigyr-signon.tsx to the in-app intro screen ("Become a Member" + 4-step preview + START SIGN-UP) that opens VIGYR_URL via WebBrowser.openBrowserAsync (native) / Linking (web). No embedded WebView. This is the reliable path — card entry works in the full browser.

## Session update 35 (Jun 2026 fork) — After-signup tip + self-report (DONE)
- Q: can the app confirm a member finished the external Vigyr form? Not automatically — Vigyr sign-up is entirely on Vigyr's site; the browser only tells us the member returned, not what they submitted. True confirmation needs a Vigyr webhook/success-redirect (not available). Implemented a self-report as the pragmatic middle ground.
- vigyr-signon.tsx: after the browser closes (native) / opens (web), shows a "You're all set! Check your email" success screen with "Did you finish your sign-up?" -> "YES, I FINISHED" (testID vigyr-confirm-yes) or "Not yet — reopen the form" (vigyr-confirm-no), plus "Back to home". Yes -> api.reportVigyrSignup(true) -> thanks state.
- Backend: NEW POST /api/membership/vigyr-report {completed} (require_user). Sets users.vigyr_signup_reported + vigyr_reported_at, and notify_admins("Vigyr sign-up reported", ntype=application, nav=admin_members) so the gym gets an in-app alert + email to verify in Vigyr. api.ts +reportVigyrSignup.
- Verified: endpoint returns {ok:true,reported:true}; UI flow (start -> success -> Yes -> "Thanks! We've let the gym know") confirmed via screenshot.

## Session update 36 (Jun 2026 fork) — Square Payments replaces Stripe for class bookings (DONE)
- Swapped the class-booking checkout from Stripe to **Square hosted checkout (payment links)**. Frontend contract unchanged (checkout -> {url, session_id}; poll /payments/status). class/[id].tsx bookAndPay untouched.
- Backend (server.py): added SQUARE_ENV/SQUARE_ACCESS_TOKEN/SQUARE_LOCATION_ID/SQUARE_BASE/SQUARE_VERSION. Rewrote POST /payments/checkout to call Square POST /online-checkout/payment-links (quick_pay, amount from booking, AUD, redirect to /payment-return); stores payment_transactions with session_id=square order_id + provider=square. Rewrote GET /payments/status/{session_id} to RetrieveOrder and detect paid.
- KEY LEARNING: paid payment-link orders stay `state=OPEN` (not COMPLETED); detect paid via total>0 AND net_amount_due_money.amount==0 AND tenders present (or state COMPLETED). Sandbox tender type = OTHER.
- Env: backend/.env SQUARE_ENV=sandbox, token, SQUARE_LOCATION_ID=LMXQ7GTSCT370 (AUD). Old Stripe /webhook/stripe route left in place (unused/harmless).
- Verified end-to-end: created booking -> checkout returns sandbox.square.link URL -> completed via Square Sandbox Testing Panel -> /payments/status returned paid -> booking marked paid (mark_booking_paid fired). To go live: SQUARE_ENV=production + production token + production location id.

## Session update 37 (Jun 2026 fork) — In-app Payment Receipt (DONE)
- After a successful class payment, members now see a tidy in-app receipt.
- Backend: refactored Square order-status into shared helper sync_square_payment(tx) (used by /payments/status). NEW GET /api/payments/receipt/{booking_id} (require_user, ownership-checked) — if booking not yet paid it syncs with Square first (covers web redirect arriving before any poll), returns receipt_number, class_name, trainer, class_start, amount_cents, currency, paid_at, payment_method "Square", order_id, member name/email, location. api.ts +paymentReceipt.
- Frontend: NEW /app/frontend/app/receipt.tsx — success header + branded receipt card (logo, PAID pill, big amount, Class/Coach/When/Paid on/Method/Receipt #/Account rows, dashed footer w/ location) + DONE (->Profile) + "Book another class" (->Timetable). Retries the fetch a few times for eventual consistency.
- Wiring: class/[id].tsx native flow now router.replace -> /receipt?booking_id on paid (was profile). payment-return.tsx (web redirect) now forwards to /receipt?booking_id when status=success (Square redirect_url carries booking_id).
- Verified: receipt endpoint returns full data for a paid booking; /receipt screen renders (screenshot).

## Session update 38 (Jun 2026 fork) — Share/Save receipt PDF + Receipt history (DONE)
- Share/Save PDF: added expo-print + expo-sharing. receipt.tsx now builds a branded HTML receipt (logo, PAID badge, amount, Class/Coach/When/Paid on/Method/Receipt #/Account/Booking ref rows, address + ABN) and a "SHARE / SAVE PDF" button (label "SAVE / PRINT PDF" on web). Native: Print.printToFileAsync -> Sharing.shareAsync (system share sheet: save to Files, email, etc.). Web: Print.printAsync (browser print/save-as-PDF dialog). NOTE: native share sheet is device/Expo Go only (not web preview).
- Receipt history: Profile "MY BOOKINGS" — every paid/confirmed booking now has a "View receipt" button (testID booking-receipt-{id}) -> /receipt?booking_id. Members can reopen any past receipt anytime. (booking-history log screen unchanged; receipts reachable from active bookings list.)
- Verified via screenshots: receipt Share button renders; Profile shows the receipt button on the paid booking.

## Session update 39 (Jun 2026 fork) — Richer Class Check-In cards (DONE)
- Class Check-In cards now show full booking detail instead of just "Booked class".
- Backend: GET /bookings now enriched via _enrich_bookings() — attaches current class start_at, trainer, trainer_photo, duration_min, level, category to each booking row (also benefits Profile).
- Frontend (check-in.tsx): redesigned card — coach avatar (coachSource) + class name + "with Coach X", then a detail grid: date (weekday D Month), time · duration, level, amount + "Paid"/"By appointment", and booking Ref. Check in / Checked in button kept.
- Verified via screenshot: shows Muay Thai w/ Coach Alex photo, Monday August 10, 5:00 PM · 45 min, Ages 6-16, $15 AUD · Paid, Ref 2AEF1F3C.

## Session update 40 (Jun 2026 fork) — QR Check-In (admin scans member QR) (DONE)
- Members show a QR; admins scan it at the door to mark attendance. Check-in allowed only on the class day (user choice). Scanner entry points: Admin Dashboard card + Attendance header icon (both, user choice).
- Backend: NEW GET /api/bookings/{id}/checkin-code (member, ownership) -> signed JWT {bid,uid,typ:checkin, exp +2d}. NEW POST /api/admin/checkin/scan (require_admin) {code} -> decodes/validates token, loads booking, requires paid/confirmed, enforces class-day (class start_at is stored LOCAL wall-clock -> compare start.date() to QLD-today; by_appointment skips day check), idempotent (returns already=true if attended), marks attended + checked_in_by="admin_qr", notifies member. Returns member_name/class_name/when. Verified: check-in ok / already / wrong-day rejected / invalid rejected / non-admin 403.
- Packages: expo-camera + react-native-qrcode-svg (react-native-svg already present). app.json: iOS NSCameraUsageDescription + expo-camera plugin cameraPermission + android CAMERA permission.
- Frontend: check-in.tsx card now has "Show my entry QR" (only when not attended) -> modal with QRCode(code) + "valid on class day" hint. NEW /app/frontend/app/admin/scan.tsx — CameraView qr scanner w/ frame overlay, success/already/error result overlay (green/red) + "Scan another", full permission handling (granted/denied/canAskAgain->Open Settings), web shows "use a phone" fallback. Entry points: admin/index.tsx new "Scan Check-In" card; admin/attendance.tsx header QR icon. api.ts +checkinCode +scanCheckin.
- Verified via screenshots: member QR modal, admin Scan card, scanner web-fallback. NOTE: actual camera scanning is native-only — must be tested on a real device after Publish + build (not Expo Go dev preview / web).

## Session update 41 (Jun 2026 fork) — Attendance names / per-class roster (DONE)
- Added "WHO ATTENDED EACH CLASS" to the Attendance Report — a per-session roster so staff see exactly who attended each class.
- Backend: admin_attendance_report now also returns `sessions` — grouped by (class_name, local day, QLD), each {class_name, date, iso, count, attendees:[{name,email,time,by}]}, sorted newest first, limit 80. (Report already returned recent + top_members with names.)
- Frontend (admin/attendance.tsx): new expandable card — each session row shows class name + date + a headcount pill; tapping expands to list attendee names, check-in time, and a tag (QR / staff / member) based on checked_in_by (admin_qr shows "· QR"). Only one open at a time (openKey).
- Verified via screenshot: Muay Thai Mon 10 Aug expands to Max Energy Admin 6:06 PM + Vigyr Tester 6:23 PM · QR.

## Session update 42 (Jun 2026 fork) — Hide ended classes from schedule (DONE)
- GET /classes now filters out sessions whose end time (start_at + duration_min) is in the past, so the schedule only shows current/upcoming classes. start_at is stored as QLD local wall-clock, so compared against QLD-local now ((now_utc+10h) naive). by_appointment classes (Personal Training) are always kept. Benefits timetable + home upcoming list.
- Verified via curl at QLD 18:31 Aug 10: the 17:00 (ended 17:45) Muay Thai is hidden, the 18:00 one remains, Personal Training (appt) kept, ended-but-shown count = 0.

## Session update 43 (Jun 2026 fork) — Auto-refresh schedule on reopen (DONE)
- Schedule (and Home) now auto-refresh when the app returns to the foreground, so ended classes drop off and new ones appear without a manual reload.
- timetable.tsx: added AppState listener (background/inactive -> active => load()); "today" moved to state and rolled forward inside load() so the day tabs update across midnight; added pull-to-refresh (RefreshControl). Still refreshes on tab focus (useFocusEffect).
- home.tsx: added the same AppState foreground -> load() listener (already had focus refresh + pull-to-refresh).
- Verified via screenshot: timetable renders current classes (ended 5 PM class gone, 6 PM remains).

## Session update 44 (Jun 2026 fork) — Class reminders a few hours before start (DONE)
- Reworked existing reminder system to fire ~a few hours before a booked class (was ~24h) and fixed timezone handling.
- send_due_reminders(): REMINDER_HOURS=3; class start_at is QLD local wall-clock -> converted to UTC (s_local - 10h) before comparing to now; window now<=start_utc<=now+3h. Skips by_appointment. One-time per booking via reminder_sent flag. Message: "Class starting soon ⏰ — Your X class starts in about N hours — <when>." Sends in-app notification + email (Resend) via notify_user. Loop interval tightened 3600s -> 900s (15 min).
- Verified: seeded a paid booking for a class ~2h out -> /admin/reminders/run sent 1, member got "starts in about 2 hours — Monday 10 August at 8:41 PM"; re-run returned 0 (idempotent). Test data cleaned up. Runs automatically every 15 min; also manually triggerable via POST /admin/reminders/run.

## Session update 45 (Jun 2026 fork) — Check-in only via admin QR scan (DONE)
- Removed member self check-in; attendance is set only when admin scans the member's entry QR (admin manual toggle in admin/bookings still available as staff override).
- Backend: POST /bookings/{id}/checkin now returns 403 "Check-in is done by gym staff scanning your entry QR code." (was self check-in). Verified 403.
- Frontend (check-in.tsx): removed the "Check in" button + checkin()/busy state; not-attended cards now show a non-actionable "Booked" pill; "Show my entry QR" is the member's only action; intro reworded to "Show your entry QR code to gym staff — they'll scan it to check you in." Attended -> "Checked in" chip as before.
- Verified via screenshot: card shows Booked pill + Show my entry QR, no Check in button; self-checkin endpoint 403.

## Session update 46 (Jun 2026 fork) — Member-chosen reminder lead time (1/3/12h) (DONE)
- Members can now pick how early they're reminded before a booked class: 1, 3 or 12 hours.
- Backend: user field `reminder_hours` (default 3) added to user_public. NEW PUT /api/me/reminder-preference {hours in 1|3|12} (require_user, validates). send_due_reminders now reads each member's reminder_hours and only sends once start is within that lead time (query window widened to 12h; per-booking gate start_utc <= now+lead). Verified: set 12 -> me shows 12; invalid 5 -> 400.
- Frontend: profile.tsx new "CLASS REMINDERS" section with 1h/3h/12h chips (testID reminder-{h}h), loads current via api.me(), saves via api.setReminderPreference with optimistic update + banner. Also removed the self "Check in to this class" button from Profile bookings (QR-only) -> replaced with "Show your entry QR at the door to check in" info bar. api.ts +setReminderPreference.
- Verified via screenshot: chips render, 12h selectable/highlighted.

## Session update 47 (Jun 2026 fork) — "No reminders" (Off) option (DONE)
- Added an Off choice to class reminders. Backend PUT /me/reminder-preference now accepts hours in (0,1,3,12); reminder_hours=0 means off and send_due_reminders skips those members (lead==0 -> continue). Verified: set 0 -> me shows 0 -> /admin/reminders/run sent 0.
- Frontend profile.tsx: reminder chips now [Off, 1 hr, 3 hrs, 12 hrs] (testID reminder-0h..reminder-12h); banner "Class reminders turned off." on Off. Verified via screenshot (Off highlighted).

## CLARIFICATION (Jun 2026) — QR class check-in STAYS
- User said "we cannot use a QR to scan into the door" — this referred to the PHYSICAL door/gate (handled by Vigyr, separate). For in-app CLASS check-in they confirmed: members MUST show their booking QR to staff who scan it. So the QR check-in (member "Show my entry QR" + admin "Scan Check-In") is CORRECT and unchanged. Self check-in stays disabled. Attendance history unchanged. NO code changes made for this clarification.

## Session update 48 (Jun 2026 fork) — Deployment health check PASS
- Ran deployment_agent; fixed all flagged items:
  1. Hardcoded Emergent URLs -> EMAIL_BASE_URL + EMERGENT_AUTH_SESSION_URL now os.environ[...] (required), added to backend/.env.
  2. frontend/.env METRO_CACHE_ROOT value quoted ("/app/frontend/.metro-cache") -> env_files_malformed=false.
  3. TS compile blocker: frontend/src/api.ts applyMembership payload type now includes `details?: Record<string, any>` (membership.tsx passes details). npx tsc --noEmit = exit 0.
- Final status: PASS (no blockers/warnings). backend 0.0.0.0:8001 + /api prefix, /api/classes 200.
- Non-blocking WARNs acknowledged (not fixed): N+1 reads in reminder job (fine at gym scale); no privacy-policy URL in README (relevant only at App Store/Play submission).

## Session update 49 (Jun 2026 fork) — Privacy Policy (DONE)
- Added in-app Privacy Policy for App Store / Play readiness. NEW /app/frontend/app/privacy.tsx — Australian Privacy Principles-aligned policy tailored to the app (data collected: account/bookings/attendance/messages; payments via Square; membership via Vigyr; camera for staff QR; emails via Resend; Google login), rights/deletion, kids consent, contact (info@maxenergy.com.au / 07 4057 9005 / address, ABN 81 213 163 833), tappable email/phone.
- Links: Profile links list new "Privacy Policy" row (shield-checkmark, testID profile-link-privacy) -> /privacy. Register screen now shows "By signing up you agree to our Privacy Policy" with tappable link -> /privacy (consent for store review).
- Verified: tsc exit 0; /privacy renders via screenshot.
- NOTE for store submission: also provide a PUBLIC privacy URL in store metadata — the deployed app route (…/privacy) can serve as it, or host the same text on the gym website.

## Session update 50 (Jun 2026 fork) — Smart empty state "Classes have ended today" (DONE)
- Timetable's empty state now distinguishes ended-vs-none: if the selected day is TODAY and today's classes have all ended, shows "Classes have ended today." (checkmark-done icon); otherwise "No classes this day."
- Backend GET /classes gained `include_ended` param: default (home/upcoming) still hides ended classes; include_ended=true returns all with an `ended` boolean per class (start+duration < QLD-now). 
- Frontend: api.classes(category, includeEnded). timetable loads with include_ended=true, still hides ended from the visible list (filter !c.ended), and computes allEndedToday (dayOffset===0 && todays.length>0 && every ended) for the message. Cls type +ended.
- Verified: tsc exit 0; curl shows 2 ended today; screenshot shows "Classes have ended today." on Mon 10 (all ended).

## Session update 51 (Jun 2026 fork) — Tomorrow Peek on "ended today" (DONE)
- When today's classes have all ended, the empty state now also shows an "UP NEXT" card with the very next upcoming class (name, weekday · time · coach, coach photo) and a chevron. Tapping it jumps the day selector to that class's day (goToClassDay computes day index from today).
- timetable.tsx: nextClass useMemo (earliest non-appointment, non-ended, category-matched class); peek card rendered inside ListEmptyComponent only when allEndedToday && nextClass. Uses coachSource for avatar.
- Verified via screenshot: Mon 10 all-ended -> UP NEXT = Kickboxing · Tuesday · 6:00 PM · Coach Alex.

## Session update 52 (Jun 2026 fork) — Fix wrapping class times (DONE)
- Schedule class-row time (e.g. "5:00 PM") was wrapping to two lines. Fixed: timeCol width 60 -> 78; time Text now numberOfLines={1} adjustsFontSizeToFit minimumFontScale=0.8.
- Verified via screenshot: Tuesday shows "6:00 PM" on one line with "60m" below.

## Session update 53 (Jun 2026 fork) — Move class time into the details card (DONE)
- Removed the separate left time column; the start time now sits inside the class card as a pill (clock icon + "6:00 PM", tinted to the category colour) in the meta row alongside the level pill and "N min" (duration pushed right via marginLeft auto, numberOfLines=1 so nothing wraps).
- timetable.tsx: dropped timeCol/time/dur styles; added timePill/timePillText; metaRow gap-based. fmtTime still used (pill + peek card).
- Verified via screenshot: Kickboxing card shows "🕐 6:00 PM · All levels · 60 min" on one line.

## Session update 54 (Jun 2026 fork) — Remove internal membership-form UI (external signup) (DONE)
- Removed Profile "Download my membership form" card + its pdfApp state/fetch (setPdfApp, download* usage) — members now sign up externally via Vigyr, no internal PDF.
- Class detail "Not a member yet?" card now routes to /vigyr-signon (was the orphaned internal /membership form) and reworded "Join Maxenergy Fitness to book classes. Tap here to sign up." (kept as a useful join CTA per best judgment rather than deleting).
- Verified: tsc exit 0; Profile screenshot no longer shows the download card.


## Session update 55 (Jun 2026 fork) — Admin Inbox CTA on Profile + Book From Peek (DONE)
- Admin Inbox: Profile tab now shows an admin-only "CUSTOMER INBOX" card (below Admin Dashboard) routing to /admin/inbox, with a live unread-count badge summed from api.adminThreads() thread.unread. Added missing styles (inboxCta/inboxCtaText/inboxBadge/inboxBadgeText). Verified via screenshot as admin: card renders with badge "1".
- Book From Peek: timetable "UP NEXT" peek card (shown when today's classes have ended) now has a dedicated "BOOK THIS CLASS" / "BOOK SESSION" (appointment) button routing straight to /class/[id] for the next class. Card body still taps through to jump to that class's day. Added peekBookBtn/peekBookText styles.

## Session update 56 (Jun 2026 fork) — Force Australia/Queensland (GMT+10) times everywhere (DONE)
- Root cause: all date/time displays used the device's local timezone (`toLocale*` with no timeZone). On a Brisbane phone, class `start_at` (stored as QLD wall-clock tagged UTC by backend) was shifted +10h (e.g. 6pm → 4am next day) and appeared on the wrong day.
- Two categories fixed:
  - Schedule wall-clock (class/event `start_at`, receipt "When", check-in): now read via UTC components (timeZone:"UTC") so the stored QLD wall-clock shows as-entered on any device. Files: timetable.tsx (fmtTime, sameDay→getUTC*, today=qldTodayUTC(), days built via Date.UTC, day chips getUTCDate + timeZone UTC labels, goToClassDay, peek), home.tsx (fmtTime/fmtDay/fmtDate + greetingText via Brisbane hour), class/[id].tsx, events.tsx, event/[id].tsx, check-in.tsx, admin/classes.tsx (toDateStr/toTimeStr/fmtLabel), receipt.tsx (new fmtClassWhen).
  - Real UTC instants (created_at/paid_at/message times): now converted to timeZone:"Australia/Brisbane". Files: alerts.tsx, notification-history.tsx, booking-history.tsx, admin/membership-log.tsx, admin/inbox.tsx (sameDay via QLD date), admin/members.tsx, receipt.tsx (fmtDateTime for paid_at), membership.tsx.
- Backend unchanged: reminder scheduler already uses now_local = now_utc()+10h and treats start_at as naive Brisbane, so reminder timing stays correct.
- Verified: tsc clean on all touched files; schedule screenshot shows "6:00 pm", MON 10/TUE 11 day chips, and "UP NEXT · Tuesday · 6:00 pm".

## Session update 57 (Jun 2026 fork) — CORRECTED timezone handling (real root cause) (DONE)
- Update 56 was wrong: it assumed class start_at came back tz-aware (+00:00). In reality Motor drops tzinfo, so the API returns NAIVE ISO strings (e.g. "2026-08-10T17:00:00"). JS parses tz-less date-time as DEVICE-LOCAL, so forcing timeZone:"UTC"/getUTC* showed correct times only on the UTC preview but shifted +10h on a Brisbane phone (5pm→7am).
- Fix: new util /app/frontend/src/datetime.ts. toDate() treats a tz-less string as UTC (appends "Z"). Then:
  - classTime/classDate/scheduleDay/classParts → format schedule wall-clock (class/event start_at) with timeZone:"UTC" (shows stored QLD wall-clock as-is on ANY device).
  - stampTime/stampDate/isQldToday → format true UTC instants (created_at/paid_at/message times) with timeZone:"Australia/Brisbane".
  - qldTodayUTC/qldHour for current QLD date/clock (timetable day grouping + greeting).
- All time helpers across timetable, home, class/[id], events, event/[id], check-in, receipt, admin/classes, alerts, notification-history, booking-history, admin/membership-log, admin/inbox, admin/members now delegate to this util.
- Verified device-independence via Node TZ simulation (Brisbane, UTC, America/Los_Angeles): class 17:00→"5:00 pm", 18:00→"6:00 pm"; paid 05:11 UTC→"3:11 pm" QLD. Screenshot confirms Wed shows Kids Muay Thai 5:00 pm + Adults Muay Thai 6:00 pm.

## Session update 58 (Jun 2026 fork) — Add "Custom Programs" by-appointment option (DONE)
- Added a second by-appointment class "Custom Programs" (Adults, Coach Alex, $80, by_appointment=true) alongside Personal Training. Appears in the timetable "BOOK A SESSION" section and books via the same appointment flow.
- Added to seed_data() (after Personal Training) for fresh DBs, and inserted idempotently into the current DB (class_id cls_6c8d46a7128c).
- Verified: /api/classes returns both appointment classes; screenshot shows Custom Programs card under Personal Training with a Book button.

## Session update 59 (Jun 2026 fork) — Edit appointment class details from Admin (DONE)
- Admin can now rename/reprice/reword by-appointment classes (Personal Training, Custom Programs) and toggle any class between fixed-time and by-appointment.
- Backend: ClassUpsert.start_at now Optional + new by_appointment flag. admin_class_create sets by_appointment (capacity forced to 1, start_at defaults to now when appt). admin_class_update sets/keeps by_appointment; only writes start_at/capacity for fixed-time classes.
- Frontend admin/classes.tsx: added a "By appointment" toggle + a Description (multiline) field; hides Date/Time/Capacity when appointment is on; list row shows "By appointment" instead of a date; save omits start_at for appointment classes.
- Verified: PUT updates Custom Programs price 8000→9500→reset 8000 with by_appointment staying true and description persisting; screenshot shows the edit form (toggle on, no date/time, editable description + price).

## Session update 60 (Jun 2026 fork) — Appointment preferred time + 24h lead (DONE)
- Appointment classes (Personal Training, Custom Programs) now open a "Request a time" bottom sheet on the class detail "BOOK SESSION" tap, instead of booking immediately.
- Picker: horizontal day chips (next 14 QLD days) + hourly time chips (6am–8pm). Slots less than 24h away are disabled; earliest bookable is 24h out. On confirm → creates booking with requested_time (display) + requested_at (ISO QLD wall-clock) → continues to Square checkout.
- Backend: BookingCreate gains requested_time/requested_at. booking_create enforces appt requires requested_at and rt_utc (= requested_at as QLD, i.e. -10h) >= now_utc()+24h, else HTTP 400. Stores both on the booking; admin "New session request" email + member notification now include the preferred time.
- api.createBooking(class_id, requested_time?, requested_at?).
- Verified: curl <24h → 400 "at least 24 hours in advance"; >=24h → pending booking with requested_at saved. Screenshot shows the picker (day+time chips, disabled sub-24h slots, Continue to Payment).

## Session update 61 (Jun 2026 fork) — Admin Approve / Suggest-new-time on session requests (DONE)
- Admin → Bookings already had one-tap Accept / Suggest time (reschedule) / Cancel with member notify (in-app + email via notify_user). Filled the gaps:
  - Request cards now show the customer's "preferred: <time>" for pending by-appointment requests (previously only shown for reschedule asks).
  - Accept now records the preferred time as scheduled_time for appointment bookings and the acceptance notification/email says "Your session is confirmed for <time>".
  - Relabelled the ghost action "Reschedule"→"Suggest time"; modal title "Confirm new time"→"Suggest a new time"; hint "Member's preferred time: …". Reschedule modal prefills with the member's requested time.
- Verified E2E via API: member request (>=24h) → admin list shows requested_time → accept → status confirmed + scheduled_time set → member notifications: "Booking accepted — Your session is confirmed for Wed 12 Aug · 6:00 pm" (in-app + email). Cleaned up test data.

## Session update 62 (Jun 2026 fork) — Admin Bookings Calendar (DONE)
- New screen /app/frontend/app/admin/calendar.tsx: month grid (Monday-first) with prev/next month nav and a "N bookings" count. Each day shows up to 3 status dots (green=confirmed/paid, amber=pending, dark-amber=reschedule, grey=cancelled). Today highlighted; tap a day to see its agenda below.
- Agenda list per selected day: time + class name + member + status pill; tapping a row opens Admin → Bookings. Legend included.
- Booking date anchor: fixed classes use class_start; appointments use requested_at (both Queensland wall-clock via datetime util scheduleDay/classTime/classDate). Bookings without an anchor are skipped.
- Linked from Admin dashboard as a new "Bookings Calendar" card (calendar-number icon) right under Bookings. Route auto-registered by admin Stack layout.
- Verified via screenshot (Aug 2026, dots + today highlight + legend + day agenda). tsc clean. Demo bookings used for the screenshot were removed afterward.

## Session update 63 (Jun 2026 fork) — Calendar icon on Home for members + admins (DONE)
- Added a calendar icon button in the Home header (next to the avatar) → routes to new /app/frontend/app/calendar.tsx ("My Bookings").
- Member calendar: month grid (Monday-first) using api.myBookings(), status dots (green=booked/confirmed, amber=pending, dark-amber=reschedule, grey=cancelled), today highlighted, tap day → agenda (time + class + amount/appt + status pill); tapping a booking opens /booking-history.
- Admins see an extra top banner "View ALL gym bookings (Admin)" linking to /admin/calendar.
- Reused datetime util (scheduleDay/classTime/classDate/qldTodayUTC); anchor = class_start (fixed) or requested_at (appointment).
- Home header refactored: logo centered, headerActions row (calendar icon + avatar) absolutely positioned right; avatarWrap no longer absolute.
- Verified via screenshots: home shows calendar icon; My Bookings renders grid + legend + agenda. tsc clean.

## Session update 64 (Jun 2026 fork) — Requests badge on dashboard + calendar status filters (DONE)
- Requests badge: admin_overview now returns session_requests = count of by_appointment bookings with status pending/reschedule_requested. Admin dashboard shows a prominent orange banner "N new session request(s) waiting → tap to review" (routes to /admin/bookings) when >0.
- Filter By Status: both /admin/calendar and /calendar (member) gained quick filter chips [All, Confirmed(=confirmed/paid), Pending(=pending/reschedule), Cancelled]. Filter applies to grouping (dots + month count) and the day agenda.
- Verified: overview session_requests=1 → dashboard banner renders; calendar Pending filter shows only the pending dot and "1 booking". tsc clean. Test data cleaned afterwards.

## Session update 65 (Jun 2026 fork) — Calendar shows member name+mobile & attendance confirm (DONE)
- admin_bookings now enriches each row with member_phone (from users.phone, falling back to the member's membership_application phone). member_name/email already present.
- Admin Bookings Calendar agenda items now show member name + a highlighted mobile line (call icon) for each booking, plus a "Confirm attended" toggle (green "Attended ✓" when set) that calls api.adminSetAttendance and reloads. Items wrapped in a card with the attend bar; tapping the row still opens Admin → Bookings.
- Confirmed Q (user): paid/confirmed bookings auto-appear on BOTH calendars (member GET /bookings + admin /admin/bookings) grouped by class_start (fixed) or requested_at (appointment); calendars refresh on focus.
- Verified via screenshot: Custom Programs · 4:00 pm · CONFIRMED with "Sarah Tester", "📞 0412 345 678", and "Confirm attended" button. tsc clean. Test data cleaned.

## Session update 66 (Jun 2026 fork) — Tap-to-call / text member from calendar (DONE)
- Admin Bookings Calendar agenda item phone line replaced with two tappable pills: "Call" (Linking tel:) and "Text" (Linking sms:), plus the number shown. Number sanitized to digits/+. Nested Pressables so they don't trigger the row's navigation.
- Verified via screenshot: Custom Programs confirmed booking shows Sarah Tester, Call + Text buttons, 0412 345 678, and Confirm attended. tsc clean; test data cleaned.

## Session update 67 (Jun 2026 fork) — Class schedule on admin calendar (DONE)
- Admin Bookings Calendar now overlays the gym class schedule (Muay Thai Kids/Adults, Kickboxing, Boot Camp — i.e. non-appointment classes) alongside bookings.
- load() fetches api.classes(undefined, true) in parallel with adminBookings; filters out by_appointment classes. classesByDay groups by start_at (QLD wall-clock).
- Blue (#3B82F6) dot marks days with classes; each day's agenda lists class sessions with a "CLASS" tag (time · category · trainer), tap → class detail. Legend adds "Class". Month counter now "N items" (classes + bookings).
- New "Classes" filter chip shows only the schedule; Confirmed/Pending/Cancelled show only matching bookings; All shows classes + all bookings.
- Member /calendar unchanged (they use the Timetable tab for the schedule).
- Verified via screenshot: Classes filter, blue dots across class days, Monday agenda shows Muay Thai Kids 5pm + Adults 6pm with CLASS tags. tsc clean.

## Session update 68 (Jun 2026 fork) — Class attendance roster + home fixes (DONE)
- Attendance on classes: tapping a class in the admin calendar now opens a roster bottom-sheet (class name + date/time/coach) listing everyone booked (non-cancelled) for that class instance (filtered from adminBookings by class_id). Each row has a tap-to-mark attendance circle (green tick), member name + mobile, and call/text buttons. Header shows "N booked · M attended". Live-updates after toggling.
- Home "N class today" bug: by-appointment classes (Personal Training/Custom Programs) have start_at=creation time and never end, so one created today was miscounted. Fixed home to use scheduled = classes.filter(!by_appointment && !ended); todayCount now compares scheduleDay vs qldTodayUTC; upcoming/UP NEXT also excludes appointment+ended. Verified "No classes today" now correct.
- Home calendar button redesigned: replaced generic icon with a tear-off calendar chip showing today's month (AUG) + day (10) in QLD, orange header, clearly tappable → /calendar. Verified via screenshot.
- Test/demo data cleaned.

## Session update 69 (Jun 2026 fork) — Class capacity bar + admin direct-to-all-bookings calendar (DONE)
- Capacity bar: backend classes_list now aggregates active bookings (paid/confirmed) per class and adds booked + spots_left (fixed-time classes only); class_detail adds the same via count_documents. Frontend timetable class cards show a coloured progress bar (green >3 left, amber <=3, red full) + "N spots left"/"Class full". Class detail SPOTS stat now shows "X of Y left" / "Class full". Verified: Kickboxing shows "20 spots left" with green bar; API returns booked/spots_left.
- Admin calendar routing: Home calendar tear-off chip now routes admins straight to /admin/calendar (all bookings + class schedule) and members to /calendar. Removed the "View ALL gym bookings (Admin)" banner from the member /calendar and its now-unused useAuth import.

## Session update 70 (Jun 2026 fork) — Low-spots nudge (DONE)
- Timetable class cards show an amber "🔥 ONLY N SPOT(S) LEFT — BOOK EARLY!" pill (flame icon) when spots_left is 1–3, next to the trainer line, above the capacity bar.
- Class detail shows a matching amber banner "Only N spot(s) left — book early to secure your place!" (fixed-time classes only).
- Verified via screenshot (temp cap=3 + 1 booking → "ONLY 2 SPOTS LEFT — BOOK EARLY!"); capacity restored and demo data cleaned. tsc clean.

## Update: Refund-to-Credit system (in-app credits)
- Admin **Cancel & notify members** flags PAID members for refund (booking.refund_status="pending").
- New **Admin → Refunds & Credits** screen (/admin/refunds): lists members owed; buttons "Give $X credit" (adds users.credit_cents + notifies) or "Mark refunded" (notifies). Backend: GET /api/admin/refunds, POST /api/admin/refunds/{booking_id}/resolve {method: credit|refunded}. admin/overview now returns refunds_pending.
- Members have users.credit_cents (surfaced in user_public + /auth/me). Shown as a banner on Profile.
- Booking with credit: class detail shows a credit choice modal. POST /api/payments/checkout accepts use_credit. Full coverage => instant paid booking (paid_with_credit:true), credit deducted. Partial => Square link for remainder; credit_applied_cents stored on booking + tx; deducted once in mark_booking_paid (guarded by credit_deducted).
- credit_ledger collection records +/- credit entries.
- Verified end-to-end (cancel->flag->credit->balance->full-credit free booking). Partial needs a valid member email (Square rejects blank buyer_email).

## Update: Memberships & Passes store (Square)
- New member screen /memberships (button on Home "Memberships & Passes", non-admins). Products: 7 Day Pass $80, 1/3/6/12 Month Upfront $150/$380/$510/$750, 10 Class Pass $200. Key Tag $40 MANDATORY + auto-added to all upfront memberships. 10% first-purchase discount on upfront memberships only (users.first_purchase_used).
- Backend: STORE_PRODUCTS catalog + compute_store_price + fulfill_store_purchase. Endpoints GET /api/store/products, POST /api/store/checkout, GET /api/store/status/{sid}. Reuses Square payment-links; payment_transactions kind="store". sync_square_payment branches to fulfill_store_purchase on paid; reconcile_user_payments also fulfills store txs (safety net) + store screen calls reconcile on load.
- Fulfillment: memberships/7-day set users.membership_expires_at (+plan, membership_active), 10 Class Pass adds users.class_pass_credits+=10, key tag sets users.key_tag, consumes first_purchase_used. Notifies member + all admins.
- user_public + /store/products expose credit_cents, class_pass_credits, key_tag, membership_plan, membership_expires_at.
- payment-return handles ?store=1 -> /memberships.
- TODO(optional): consume class_pass_credits at class booking; gate booking on membership_active; admin Purchases list.
- Verified: pricing (mem_1m base 15000 -> disc 1500 + keytag 4000 = 17500), fulfillment (membership expiry/keytag, +10 class credits, first_purchase_used), notifications.

## Update: Store receipts + faster store + pricing polish (Jun 2026 fork)
- Store purchases now show a proper receipt. NEW backend GET /api/store/receipt/{session_id} (syncs Square if unpaid) + GET /api/store/receipt/latest (most recent store tx in 6h). NEW screen /store-receipt.tsx (PAID card: item, amount, key tag, start date/setup time, active-until/credits, receipt #, share/save PDF). Native buy() -> router.push /store-receipt?session_id; web Square redirect -> payment-return?store=1 -> /store-receipt (latest). Verified E2E via Square sandbox (pass + upfront membership).
- Faster store: memberships.tsx load() no longer blocks on reconcilePayments (moved to background) — product list renders ~0.3s.
- Access-card setup modal: replaced text inputs with day-chip (next 30 QLD days) + time-chip pickers (bottom sheet). Sends human-readable start_date + meet_time to checkout.
- Plan perks: STORE_PRODUCTS gained per-product `perks` list (auto-flows to store cards as a checkmark list). Trimmed per user: removed "Muay Thai, Kickboxing & Boot Camp" (7 Day Pass), "Unlimited classes for 30 days"+"All class types included" (1m), "All class types included" (6m/12m).
- Pricing cards restyled translucent (rgba fill + faint border) so they're less bright; MOST POPULAR gets a subtle orange tint.

## Update: Class Pass Credits currency + scannable pass QR (Jun 2026 fork)
- Store: added "Single Class Pass" (pass_1class, $25) alongside "10 Class Pass" ($200); both type=class_pass and add to users.class_pass_credits on purchase (also logged in db.pass_ledger +N).
- Wallet (/credits, retitled "My Wallet"): shows CLASS PASS CREDITS as a separate green currency card (count) with "Show my Class Pass QR" (>0) or "Buy class passes" -> /memberships (0), plus a Class Pass History list. GET /api/credits now returns class_pass_credits + pass_entries.
- Member QR: GET /api/passes/qr returns a signed JWT {typ:classpass, uid, exp+2d} + current credits. Rendered as QR in a modal.
- Admin redemption: POST /api/admin/checkin/scan now also handles typ=classpass (walk-in) — deducts exactly 1 pass, logs pass_ledger -1 + pass_redemptions, notifies member, returns member_name + "N passes left". 0 passes -> HTTP 400 "no class passes left" (no deduction). Same scanner still handles booking check-in (typ=checkin).
- Verified by testing_agent iteration_11: backend 9/9 pytest, frontend wallet card + QR modal + buy-when-zero all pass. NOTE: live camera scanning is native-only (test on device after Publish+build).

## Update: Pay for a class booking with a Class Pass (Jun 2026 fork)
- Class detail payment modal now offers "Use a class pass — book free (N left)" (green) above credit/card options when the member has class passes and the class is fixed-time (not by-appointment).
- Backend POST /api/payments/checkout gains use_class_pass: deducts 1 class pass, marks booking paid (paid_with_pass), logs pass_ledger -1 ("Booked <class> with a class pass"), creates a provider=class_pass tx, returns {paid_with_pass, passes_left}. 0 passes -> 400; appointment class -> 400.
- Receipt now reflects the method: "Class Pass (1 used)" (amount $0) / "Account credit" / "Square". Frontend proceedBooking handles paid_with_pass -> /receipt. class/[id].tsx loads class_pass_credits via api.me() and opens the pay modal when passes>0 OR credit>0.
- Curl-verified: seed 3 passes -> book with pass -> 2 left, ledger entry, receipt method "Class Pass (1 used)". Screenshot confirmed the green pass option in the pay modal.

## Update: Low-pass reminder nudge (Jun 2026 fork)
- When a member's class-pass balance drops to 1 ("You're on your last class pass ⏳") or 0 ("You're out of class passes"), they get an in-app + email nudge to top up, with data.nav=member_store (tap opens /memberships). Fires from both deduction paths: admin QR redemption and pay-with-pass at booking checkout. Added low_pass_nudge() helper (server.py). alerts.tsx handles the new member_store nav.
- Curl-verified: 2 passes -> two redemptions produced "last pass" (at 1) then "out" (at 0) nudges, both nav=member_store.

## Update: Refund a class pass on cancellation (Jun 2026 fork)
- When a class is cancelled, pass-paid bookings (paid_with_pass) are flagged for refund like other paid bookings. Admin → Refunds & Credits now shows these with a green "1 CLASS PASS" tag (excluded from the $ owed total) and a "Return class pass" action (or "No return").
- Backend: admin_refunds returns paid_with_pass; admin_refund_resolve gains method "class_pass" -> +1 class_pass_credits, pass_ledger +1 ("Pass returned — <class> cancelled"), refund_status "pass_returned", notifies member (nav member_store). RefundResolveReq supports credit|refunded|class_pass.
- Frontend refunds.tsx branches pass bookings to the return-pass UI; STATUS_META adds PASS RETURNED; api.adminResolveRefund accepts class_pass.
- Curl-verified: pass booking -> cancel flags it paid_with_pass -> return pass restores 1->2 with ledger entry. Screenshot confirmed the green pass card + Return class pass button.

## Update: Auto-return class passes on cancellation (Jun 2026 fork)
- Admin cancel-class modal now has an "Auto-return class passes" toggle (ON by default). When ON, every pass-paid booking on that class has its class pass returned instantly at cancel time (+1 credit, pass_ledger, refund_status=pass_returned/resolved, refund_method=class_pass) and the member is told their pass was returned. When OFF, pass bookings fall back to the manual "Return class pass" flow in Admin → Refunds & Credits.
- Backend: ClassCancelReq.auto_return_passes (default True); admin_class_cancel returns passes_returned count. Card-paid bookings still flag pending refunds as before.
- Frontend: classes.tsx Switch (testID adminc-auto-return-passes); toast reports "N passes returned". api.adminCancelClass passes the flag.
- Verified: cancel with auto ON -> passes_returned:1, member 0->1 with "Pass returned — <class> cancelled" ledger; toggle renders in modal. Restored all test-cancelled classes/bookings afterward.

## Update: Rebook link in class-cancellation message (Jun 2026 fork)
- Cancellation in-app alert + email now suggest rebooking: admin_class_cancel looks up the next similar upcoming class (same name, not cancelled, future/by-appointment) and, if found, appends "Tap to rebook the next <name> class on <when>" to the message with data={nav:class_detail, class_id}. Tapping the alert deep-links to that class detail (alerts.tsx new class_detail nav; falls back to home). Email gets a matching rebook line.
- Verified: cancelling a Muay Thai instance produced a member alert with the rebook body + nav class_detail + the next Muay Thai class_id.

## Update: Security audit fixes (Jun 2026 fork)
- SEC-001 (High): /api/admin/exports/{id}.csv and /api/membership/forms/{id}.pdf now require a signed capability token (?t=) OR admin/owner bearer. Emailed links include the token; admin app opens PDFs via new authed GET /api/membership/forms/{id}/url (api.membershipFormUrl). Verified: 403 without token, 404 passthrough with valid token, 403 wrong-kind token.
- SEC-002 (Med): removed OTP code from server logs (send_otp_email).
- SEC-003 (Med): class-pass deduction is now atomic (guarded $inc, modified_count check) in admin scan redemption AND payments checkout use_class_pass (booking claim guard too). Verified: 6 concurrent scans on a 1-pass account -> exactly 1 success, balance never negative.
- Hardening: added esc() HTML-escape helper; escaped user-supplied names/class names in confirmation + admin emails (booking confirm/create/cancel/reschedule).
- Not code-fixable here (deploy-managed): SEC-004 JWT_SECRET rotation + SEC-005 secret rotation happen at Publish/Deploy (protected env). CORS/rate-limiting left as P3.

## Update: Health check fixes (Jun 2026 fork)
- Fixed 500 crash in fulfill_store_purchase (line ~1627): membership_expires_at from Mongo could be tz-naive and was compared to aware now_utc() -> "can't compare offset-naive and offset-aware datetimes". Now normalizes cur_exp to UTC-aware before compare. Verified /api/store/receipt/latest returns clean 404 (was 500).
- FLAGGED (infra, not code): EMERGENT_EMAIL_KEY returning 401 "API key is invalid" then 403 "This API key is suspended" -> ALL emails failing (booking/receipt/cancellation confirmations + OTP verify/reset codes). Needs the managed email key restored.

## Update: Auth rate limiting (Jun 2026 fork)
- Added Mongo-backed atomic fixed-window rate limiting (db.rate_limits, TTL index) via enforce_rate_limit(request, action, email). Wired into /auth/login, /register, /verify-otp, /resend-otp, /forgot-password, /reset-password. Limits both per-IP and per-account. Client IP from X-Forwarded-For (K8s ingress) with request.client fallback; keys HMAC'd with JWT_SECRET. Returns 429 + Retry-After; frontend surfaces the detail message.
- Limits: login 10/60s, register 6/600s, forgot 4/300s, reset 10/600s, otp 6/300s.
- Verified: 10 login attempts -> 401 then 429; different email same IP also 429 (IP bucket). Counters cleared after test.

## Update: Square switched to PRODUCTION (Jun 2026 fork)
- backend/.env: SQUARE_ENV=production, production access token + SQUARE_LOCATION_ID=X9S2RGZSHPZZ9 (location "Maxenergy fitness", AUD/AU). SQUARE_BASE auto-switches to https://connect.squareup.com/v2.
- Verified: /api/store/checkout returns a real square.link production payment link. REAL charges now occur; refunds via Square dashboard.
- Sandbox creds (previous) preserved in git history if a revert to test mode is ever needed.

## Update: Personal Training set to $1 for live testing (Jun 2026 fork)
- TEMPORARY for production go-live testing: Personal Training price_cents 8000 -> 100, in both the live DB (cls_18f877b1782a) and the seed default (server.py ~line 3760, so fresh deploy also gets $1). Custom Programs left at $80.
- REVERT to 8000 after live testing is complete.

## Update: Removed unused Stripe template code (Jun 2026 fork)
- Publish scanner flagged a test Stripe key. App uses Square exclusively; Stripe was dead template code. Removed: emergentintegrations stripe imports, STRIPE_API_KEY env read, and the /webhook/stripe endpoint (server.py); removed STRIPE_API_KEY=sk_test_emergent from backend/.env. Verified backend healthy + Square checkout still returns a production square.link. No Stripe references remain.

## Update: Matching booking/order numbers (Jun 2026 fork)
- Added booking_ref_no(booking_id) -> stable 5-digit number, now shown consistently: Square payment note ("<Class> — Booking No. N — <Name> (App Booking)"), class receipt (booking_no) + receipts list, member bookings (_enrich_bookings adds booking_no) and admin bookings ("No. N" line). Store: order_ref persisted on tx; store receipt shows order_no matching the Square "Order No.". Verified bk_8f8669ae1032 -> 84722 in both admin bookings API and the Square note format. Frontend: receipt.tsx + store-receipt.tsx (screen + PDF) + admin/bookings.tsx updated.

## Update: Registration now collects first/last name + DOB (Jun 2026 fork)
- New-member sign-up requires First name, Last name, and Date of birth (added identity/security). Frontend register.tsx: separate first/last name inputs + a DD/MM/YYYY masked DOB input with client validation (valid calendar date, not future, age 5-100). Sends {first_name,last_name,date_of_birth(YYYY-MM-DD),email,password}.
- Backend RegisterReq updated; /auth/register validates DOB (400 on invalid/future/out-of-range), stores first_name/last_name/date_of_birth and derives name = "First Last". api.register + AuthContext.registerEmail take a payload object.
- Verified: valid register returns token (name "Jane Doe", dob stored 1995-06-15); future DOB -> 400; missing last name -> 422. Google social login unaffected.

## Update: DOB picker + password strength (Jun 2026 fork)
- Register DOB is now a tap-to-scroll Day/Month/Year picker modal (no manual typing); builds YYYY-MM-DD. Day list adjusts to month/year; invalid day cleared on month change.
- Password rule: min 6 chars + at least one number + at least one symbol. Frontend shows live rule checklist + show/hide toggle and gates submit. Backend validate_password_strength() enforced on /auth/register and /auth/reset-password (400 with specific message).
- Verified: no-symbol/no-number -> 400; strong pw -> token. Screenshots confirm picker + live rules.

## Session update (Jun 2026 fork) — Admin Confirm paid appointment + Custom Programs pricing (DONE)
- Admin Confirm booking: paid Personal Training / Custom Programs appointment bookings (status "paid") now show a "Confirm booking" button in Admin -> Bookings (testID adminbk-confirm-<id>) wired to existing POST /api/admin/bookings/{id}/confirm (added api.adminConfirmBooking). Confirming sets status->confirmed and notifies the member (in-app + email). The "Requests" filter now also surfaces paid appointments awaiting confirmation.
- Custom Programs pricing changed to $60 / 30 min single session (was $80 / 60 min), matching Personal Training. Updated seed_data() + the live DB doc: price_cents=6000, duration_min=30, appt_durations=[{minutes:30,price_cents:6000}]. Availability unchanged (Mon-Thu 10:30am-4:00pm, already enforced).
- Verified by testing_agent iteration_12: backend 7/7 pytest (confirm 200/409/404/403/401, classes pricing), frontend admin confirm flow (PAID->CONFIRMED + banner). Seeded test booking removed afterwards.

## Session update (Jun 2026 fork) — Tidy class-booking membership prompt (DONE)
- Class detail (/class/[id]) previously showed TWO overlapping cards: "No membership form yet — tap to complete it" (-> /membership) and "Not a member yet?" (-> /vigyr-signon). Both reflected the same in-app form (submitting /membership sets membership_form_completed AND creates an application).
- Consolidated into ONE card: when membership_form_completed is false, shows a single "Complete your membership form — Fill out your membership form to book classes. Tap here to complete it." card (testID class-form-prompt) routing to /membership. When true, shows the green "Membership form on file" tick. Removed the redundant Vigyr "Not a member yet?" card + unused isMember state/myApplications fetch on this screen.
- Verified: tsc clean; logged-in screenshot shows the single card only.

## Session update (Jun 2026 fork) — Home membership banner + applications record (DONE)
- Home banner renamed to "Complete New Membership Form" and now routes to /vigyr-signon. Banner now HIDDEN for admins and for members who have joined (any of: membership_form_completed / vigyr_signup_reported / membership_active). Exposed vigyr_signup_reported + membership_active in user_public (auth/me). Still shows for brand-new members.
- Admin Applications screen: Approve/Decline buttons only show while status=pending; once decided, a colored result bar shows ("Approved" green / "Declined" red).
- Admin Profile: added "Membership Applications" link (/admin/applications) to review & keep a record of sign-ups.
- Verified via screenshots (member sees banner, admin hidden + has new link, applications shows green Approved bar).
- Also: deleted all 61 class bookings per user request (bookings collection emptied).

## Session update (Jun 2026 fork) — New-notice popup + admin Content Views (DONE)
- New-notice popup: NEW /app/frontend/src/components/NoticePopup.tsx shown on Home. On focus, checkNewNotices() fetches /api/announcements and compares created_at against AsyncStorage key last_seen_notice_ts_<user_id>. First run sets a SILENT baseline (no spam of historical notices); afterwards any notice newer than baseline pops up ("N NEW NOTICES / Fresh from the gym"), with OPEN NOTICES (-> /events) and GOT IT. Dismiss stores newest ts so it won't reshow. Hidden for admins. Verified: popup shows for unseen, GOT IT dismisses & persists across reload.
- Admin Content Views: backend content_views collection + _record_view() (skips admins). POST /api/views/notices (on Notices tab focus) + POST /api/views/event/{id} (on event detail load). GET /api/admin/views returns {notices:{unique_users,total_views}, events:[{event_id,title,start_at,unique_users,total_views}]}. NEW screen /app/frontend/app/admin/views.tsx (Content Views) linked from admin dashboard ("Content Views", eye icon). Verified: member views recorded, admin screen shows unique members + total views for Notices and each event.
- Also: Notices tab titles now wrap to 2 lines when collapsed (events.tsx annTitle numberOfLines 1->2) so long titles fit the card.

## Session update (Jun 2026 fork) — Per-notice view tracking (DONE)
- Extended Content Views to per-announcement. Backend: view_type "announcement" + POST /api/views/announcement/{id}; GET /admin/views now also returns `announcements` [{announcement_id,title,pinned,created_at,unique_users,total_views}] sorted by unique_users desc.
- Frontend: events.tsx records a read when a member EXPANDS an announcement card (toggle open -> trackAnnouncementView). home.tsx also records reads for each notice shown in the new-notice popup on dismiss. admin/views.tsx adds a "VIEWS PER NOTICE" section (icon pin/megaphone, posted date, total views, unique members) between the overall Notices card and Events.
- Verified: member expanded 2 notices -> admin screen shows each with 1 member; overall Notices card shows 2 opens.

## Session update (Jun 2026 fork) — Most-Read badge (DONE)
- admin/views.tsx: the top-viewed notice (VIEWS PER NOTICE) and top-viewed event now get an orange "🔥 MOST READ" badge + highlighted card (brand border + brandTertiary bg). Top = first item in each backend list (already sorted by unique_users desc) with unique_users>0. Verified via screenshot.

## Session update (Jun 2026 fork) — 24h cancellation cutoff (DONE)
- Members can only cancel a booking at least 24h before the scheduled start (classes & appointments). Enforced server-side in POST /api/bookings/{id}/cancel: computes Brisbane local now (utc+10) and the booking start (appointment requested_at, else class start_at fresh from classes / class_start fallback); if now >= start-24h -> HTTP 409 with message "Bookings can only be cancelled at least 24 hours before the start time. Please contact the gym on 07 4057 9005 if you need help." Admin cancel endpoint is unaffected.
- Frontend bookings.tsx: Cancel now shows a confirm dialog stating the 24h policy; server 409 is surfaced in the banner + native Alert.
- Verified via authenticated API: within-24h booking -> 409 blocked; beyond-24h -> 200 cancelled. tsc clean.

## Session update (Jun 2026 fork) — Auto credit/pass on member cancel (DONE)
- When a member cancels a PAID/CONFIRMED booking (within the 24h policy), they now automatically get compensation in POST /api/bookings/{id}/cancel: if paid_with_pass -> return 1 class pass (pass_ledger + notify); else if amount>0 -> add credit_cents = amount (credit_ledger + notify). Free/pending requests get nothing. Booking marked cancel_reward=credit|class_pass (+cancel_credit_cents). Cancellation email/notification now states the credit/pass returned.
- Frontend bookings.tsx: confirm dialog mentions credit/pass return; success banner shows "$X credit added" or "class pass returned".
- Verified via API: money booking -> $18 credit; pass booking -> +1 pass. Cleaned up test data.

## Session update (Jun 2026 fork) — Bottom tab bar safe-area fix (DONE)
- (tabs)/_layout.tsx tabBarStyle used fixed heights/paddingBottom (android:8) that ignored the Android system navigation bar / iOS home indicator, causing the OS nav to overlap the tab buttons (unpressable). Now uses useSafeAreaInsets(): height = 60 + insets.bottom; paddingBottom = max(insets.bottom, 10 [14 web]). Works on both Android (gesture/nav bar) and iOS (home indicator).
- NOTE: user's device screenshot showed the OLD "Memberships & Passes" banner + overlap = stale build; needs redeploy to pick up this + earlier banner change.

## Session update (Jun 2026 fork) — Clear-all notifications (DONE)
- alerts.tsx: added a red "Clear all" button in the Notifications header (next to "Mark all read", shown whenever notifs exist). Confirms via Alert, then clears the list and calls existing api.clearAllNotifications() (POST /notifications/clear-all, soft-clear keeps saved history). Verified button renders. Cleaned leftover test-cancel notifications for member1.

## Session update (Jun 2026 fork) — Header/tab layout robustness on large-font devices (DONE)
- Alerts header overflow: "Clear all" was clipping off the right edge. Header title now flexShrink+numberOfLines1; action pills compacted (paddingH 10, fontSize 11, allowFontScaling=false) and relabelled "Read all"/"Clear"; headerActions flexShrink:0. Fits on all widths.
- Home calendar date badge (calChip): restructured month band (fixed height 15) + day in a centered wrap (includeFontPadding:false), both Text allowFontScaling={false}, so it never clips on large system font scale. Removed duplicate calChip style key.
- Bottom tab bar: labels now rendered via custom tabBarLabel with allowFontScaling={false}, fontSize 10, shorter names (Timetable->"Classes") to stop truncation; retained useSafeAreaInsets() height/paddingBottom fix for Android nav bar / iOS home indicator overlap.
- Cleaned 31 leftover test-cancel notifications (Pass/Money/PT tests, "Booking cancelled by me").
- NOTE: user must reload app / redeploy to see these on device.

## Session update (Jun 2026 fork) — Fix "Not authenticated" on booking/pay (DONE)
- Root cause: after the environment fork, devices held a login token signed before the fork -> invalid -> ALL authenticated requests (POST /bookings, /auth/me, /me/stats, etc.) returned 401 "Not authenticated". App cached the user in memory so it looked logged in but every action failed. Backend verified healthy: fresh login -> POST /bookings 200.
- Fix: api.ts req() now detects 401 on an authenticated request (token was present) -> clears token + invokes a global onUnauthorized handler + throws friendly "Your session has expired. Please log in again." AuthContext registers setUnauthorizedHandler -> setUser(null) + router.replace("/(auth)/login"). Verified via screenshot: corrupting auth_token then loading a protected screen auto-redirects to login.
- User action: log out/in on device to get a fresh token.

## Session update (Jun 2026 fork) — Pro booking ref + pass top-up email button (DONE)
- Booking reference professionalised: new booking_ref_code(bid)="MAX-#####" (from booking_ref_no). Used in confirmation email ("Booking reference: MAX-56233"), the add-to-calendar note, AND the Square payment_note ("{class} — MAX-##### — name (App Booking)") so app + Square references match.
- Low/out-of-pass nudge email (low_pass_nudge) now includes an orange "Buy class passes" button (_download_button) linking to {base}/memberships. base_url from _public_base(request); added request param to admin_checkin_scan; payments_checkout already had request. Copy unchanged ("Buy a Single or 10 Class Pass..."/"Tap below to buy more passes.").
- PENDING: user wants full booker details added to the booking email + saved to log, but their field list was cut off — re-asked which fields (name/email/phone/DOB/address/emergency/medical/plan/keytag).

## Session update (Jun 2026 fork) — Booker details in gym email + booking log; reminder copy (DONE)
- mark_booking_paid: gym ("New paid booking") email + in-app now includes a Booker details block: First name only, Phone (from latest membership_application.phone, fallback "—"), Membership plan + status (Active/Expired) + expiry, Key tag; plus Booking block: Class, When, Duration, Reference (MAX-#####), Payment method + amount (Card/Class pass/Account credit/Card+credit). Snapshot also written to NEW db.booking_logs collection (log_id, reference, first_name, phone, membership_plan/status/expires, key_tag, class, when, duration, payment_method, amount_cents, credit_applied_cents). Covers card, credit AND class-pass bookings (pass flow calls mark_booking_paid). Verified via API: booking_logs got MAX-27079, plan "10 Class Pass", key_tag KT-4471, payment_method "Class pass".
- Class reminder email (send_due_reminders) copy updated per user: title "Your {class} Class Starts Soon!", lines: "Just a reminder that your {class} class starts {soon}." + date ("Wednesday, 12 August") + "Class Time: 5:00 PM" + "Location: MaxEnergy Fitness, Smithfield" + arrive-10-min + gym-door-open + "We look forward to seeing you on the mats!". Lead-time logic (1/3/12h, per member) unchanged; "in about 1 hour" for <=75min.

## Session update (Jun 2026 fork) — Phone required at sign-up + restrict "Suggest time" (DONE)
- Phone now required at registration. Backend RegisterReq.phone (min_length 6); auth_register normalises (strip non [\d+], requires >=8 digits else 400) and stores user.phone; user_public exposes phone. Booking email/log phone now prefers member.phone then application. Verified: register without phone -> 422; with phone -> 200 (stored "0400123456"). (Minimal field add to existing JWT auth; hashing/JWT/sessions untouched.)
- Frontend register.tsx: added required "Phone number" input (testID register-phone-input, phone-pad) + validation; api.register/AuthContext.registerEmail/User type updated with phone. Screenshot confirms field between Email and Password.
- Admin "Suggest time" (admin/bookings.tsx) now only renders for by_appointment bookings (Personal Training/Programs) — removed for regular classes (Muay Thai/Boot Camp/Kickboxing). Used by admins to confirm/change appointment times.

## Session update (Jun 2026 fork) — Fix notification Clear button not working (DONE)
- Root cause: Clear-all used Alert.alert with buttons, which on react-native-web (web/preview) does NOT fire the destructive callback -> button appeared dead. (Also stale build on device could hide the buttons.)
- Fix: replaced Alert.alert with an in-app confirmation Modal (testIDs notif-clear-confirm / notif-clear-cancel) in alerts.tsx -> works on web AND native. "Read all" (markAll) and per-item swipe delete were already Alert-free and fine.
- Verified: Clear -> modal -> Clear all -> list empties to "You're all caught up" empty state. tsc clean. User must reload/redeploy on device.

## Session update (Jun 2026 fork) — Appointment confirm/propose handshake + home Alert popup (DONE)
- Two-way appointment handshake: admin "Suggest time" (POST /admin/bookings/{id}/reschedule) now sets status "admin_proposed" + proposed_time and notifies the member to confirm (was auto-confirming). New member endpoint POST /bookings/{id}/confirm-time -> status confirmed, scheduled_time=proposed_time, notifies member+admins. admin_proposed added to APPT_ACTIVE_STATUSES. Member bookings.tsx shows "NEW TIME PROPOSED" + orange "This time works" (api.confirmProposedTime); admin bookings shows "AWAITING MEMBER". Verified via API + testing_agent iteration_13 (Flow A confirm, Flow B propose->member confirm, Suggest time hidden on non-appointment classes).
- NEW home Alert popup (src/components/AlertPopup.tsx): on home focus, checkNewAlerts() fetches /api/notifications; unseen personal updates (booking approved/confirmed/new-time-proposed/replies) newer than AsyncStorage last_seen_alert_ts_<uid> pop up ("N NEW UPDATES / You have a new update waiting!") with VIEW UPDATES (-> /alerts) + DISMISS. Silent baseline on first run; hidden for admins; only shows when the notices popup isn't pending. Verified via screenshot incl. dismiss persistence.
