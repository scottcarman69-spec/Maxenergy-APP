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
