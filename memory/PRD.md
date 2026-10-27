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

## Session update (Jun 2026 fork) — Alert popup: "New Notifications" + tap-to-open (DONE)
- AlertPopup heading renamed "You have a new update waiting!" -> "New Notifications".
- Each update in the popup is now a Pressable (chevron) that routes via its notification data.nav: member_bookings->/bookings, member_inbox/admin_thread->/(tabs)/inbox, member_membership->/vigyr-signon, member_store->/memberships, class_detail->/class/[id], default->/(tabs)/alerts. Home passes onOpen={openAlert} which dismisses then navigates. Verified: tapping "Session confirmed" (member_bookings) closed popup and opened My Bookings.

## Session update (Jun 2026 fork) — Member friends, DMs & profile photos (DONE)
- Each member now has a unique account ID (handle, e.g. MEMBER3776) generated via ensure_handle (called in /auth/me + friend actions); exposed in user_public.
- Backend (server.py): POST /me/photo (base64 data URL, <2.8MB) sets user.picture. GET /members/search?q= (name regex OR exact handle, excludes self/blocked, returns friend_status). Friends: POST /friends/request {user_id|handle}, GET /friends {friends,incoming,outgoing}, POST /friends/respond {user_id,accept}, POST /friends/block, /unblock, /report (-> reports collection + notify_admins). DMs (accepted friends only, block-aware): GET /dm/threads (last msg + unread), GET /dm/unread, GET /dm/{other_id} (marks read), POST /dm/{other_id} {body} (notifies recipient nav member_inbox). Collections: friendships (key=sorted pair), dm_messages, blocks, reports.
- Frontend: api.ts methods added. (tabs)/inbox.tsx rebuilt = combined list (Maxenergy Team gym chat + friend threads + pending-requests banner + Add button). NEW app/chat/gym.tsx (gym chat moved), app/chat/[id].tsx (friend DM chat + block/report via header ...), app/friends.tsx (shows own account ID, search by name/ID, incoming requests accept/decline, friends list -> chat). Profile: avatar is now tappable to upload from gallery (expo-image-picker, contextual permission + Open Settings fallback), shows picture on profile + handle "ID: ...". Avatars shown in inbox/friends/chat.
- Verified: backend e2e (handle gen, search-by-ID, request->accept, DM send/read/unread) + screenshots of Inbox/Add Friends/Profile. tsc clean.
- Note: expo-image-picker photo upload works in Expo Go/web but is best validated on device build.


## Session update (Jun 2026 fork) — Group Chats + Online/Last-Seen VERIFIED (DONE)
- Group Chats: members create a small crew chat with their friends and message. Backend: POST /api/groups (name + accepted-friend member_ids; creator always added; non-friends filtered), GET /api/groups (list w/ last_body/unread/members), GET /api/groups/{gid} (detail + members + messages, marks read, 403 non-member), POST /api/groups/{gid}/messages (empty->400, non-member->403, notifies others). group_chats + group_messages collections.
- Online/Last-Seen presence: users.last_active_at touched on /api/auth/me + DM thread loads; /api/dm/threads + /api/friends return it. Frontend src/presence.ts -> isOnline (green dot) + presenceLabel ("Active now / Xm/Xh/Xd ago"). Inbox shows dot + label on DM rows.
- Frontend screens: (tabs)/inbox.tsx ("New Group" btn testID inbox-new-group + GROUPS section), group/new.tsx (name + friend multi-select + Create), group/[id].tsx (bubbles + send).
- Verified by testing_agent iteration_14: backend 12/12 pytest, all frontend flows pass (create group -> send -> group listed; friend row shows green dot + "Active now"). No fixes needed.
- Pre-existing note: first-login onboarding tour ("Skip") overlays the tab bar until dismissed (not a group/presence bug).


## Session update (Jun 2026 fork) — Group Extras (owner manage + leave) + /api/groups 500 fix (DONE)
- Group Extras: group OWNER can rename, add friends, remove members; ANY member can leave. Owner leaving transfers ownership to remaining[0]; last member leaving deletes the group + its messages.
  - Backend (server.py after group_send): PATCH /groups/{gid} (owner-only rename, empty->400, non-owner->403, notifies), POST /groups/{gid}/members (owner-only add; only accepted friends added, non-friends/already-members skipped; returns {added}), DELETE /groups/{gid}/members/{mid} (owner-only; self->400, non-member->404), POST /groups/{gid}/leave (transfer/delete logic).
  - Frontend: group/[id].tsx header gear (testID group-manage) -> new group/manage.tsx. Owner sees editable name (manage-name/manage-save-name) + members list w/ remove (manage-remove-<uid>) + add-friends (manage-add-<uid>/manage-add-confirm) + Leave (manage-leave). Non-owner sees read-only name + members + Leave only. api.ts +groupRename/groupAddMembers/groupRemoveMember/groupLeave.
  - Verified by testing_agent iteration_15: backend 17/17, frontend owner + non-owner gating pass.
- BUG FIX (found in iteration_15, pre-existing): GET /api/groups returned 500 — "can't compare offset-naive and offset-aware datetimes" in the sort. Motor returns naive last_at while fallback was tz-aware. Fixed groups_list sort with a _sort_key that normalizes datetimes to naive (fallback datetime.min). Verified: /api/groups now 200, groups sorted newest-first.


## Session update (Jun 2026 fork) — Admin Booking Log screen (searchable) (DONE)
- New admin screen to view/search every PAID booking (name, reference, payment). Backed by the existing db.booking_logs snapshots (written in mark_booking_paid).
- Backend: NEW GET /api/admin/booking-log?q= (require_admin) — returns log[] (newest first, limit 1000) enriched with member full name/email from users (log stores first_name only), plus count + total_cents. Optional q filters server-side across member_name/first_name/email/reference/class_name/phone/payment_method/membership_plan.
- Frontend: NEW /app/frontend/app/admin/booking-log.tsx — search bar (testID blog-search, live client-side filter + clear) + summary (count + $ total, total recomputes for the filtered set) + per-booking card (name, orange MAX-##### reference, class · when, payment method pill, green "$X credit" pill when credit applied, date, phone·email). Pull-to-refresh + empty states. Entry point: new "Booking Log" card (receipt icon) on Admin dashboard (admin-nav-booking-log) under Bookings Calendar. api.ts +adminBookingLog(q?).
- Verified: endpoint 200 (external URL) returns seeded rows + q filter works; UI screenshots show 2 bookings/$25 total, credit pill, and search "MAX-10002" narrowing to 1 booking/$10. Demo seed data cleaned up (booking_logs now 0).


## Session update (Jun 2026 fork) — Admin-gated group creation + exclusive "Muay Thai Academy" group (DONE)
- Group creation is now staff-controlled: ADMINS create groups instantly; MEMBERS submit a request that a staff member approves. On approval the REQUESTER becomes the group OWNER (per user choice).
  - Backend: POST /groups — admin → _create_group immediately (returns pending:false); member → inserts db.group_requests(pending) + notifies all admins (returns pending:true). New _validated_friends/_create_group helpers.
  - Admin moderation: GET /admin/group-requests (pending create_requests + join_requests, enriched w/ names), POST /admin/group-requests/{id}/approve|decline (create → builds group w/ requester as owner), POST /admin/group-join-requests/{id}/approve|decline.
- Exclusive "Muay Thai Academy" group (official, gym-run): seeded idempotently at startup (seed_official_groups) — group_id grp_muaythai_academy, slug muay-thai-academy, is_official=true, all admins as members. Uses bundled logo assets/images/combat-logo.webp (skull/green-beret "Combat Club" badge the user supplied).
  - Members request to join: GET /groups/discover (official groups w/ is_member + join_status none/pending/member), POST /groups/{gid}/join (creates db.group_join_requests pending, notifies admins; 400 if already member/invite-only). Admin accepts → member added.
- groups_list & group_get now return slug + is_official. admin_overview returns group_requests count (pending create + join).
- Frontend: 
  - Inbox (tabs/inbox.tsx): official groups show the combat logo + "OFFICIAL" tag; new "JOIN A GROUP" discovery section with a "Join" button (→ Requested pill while pending). src/groups.ts groupLogo(slug) maps slug→bundled logo.
  - group/new.tsx: members see an approval notice + "Request group" button (admins see "Create group"); pending response shows "Request sent" alert → back to Inbox.
  - NEW admin/group-requests.tsx: two sections (New group requests / Join requests) each w/ Approve/Decline. Entry: Admin dashboard "Group Requests" card (people-circle, badge from group_requests count). Alerts deep-link nav "admin_group_requests" added.
  - api.ts: +groupsDiscover/groupJoin/adminGroupRequests/adminGroupRequestDecide/adminGroupJoinDecide; createGroup now returns {group_id, pending}.
- Verified via curl E2E: member create-group→pending→admin approve→member owns group; member join Muay Thai Academy→pending→admin accept→member added; overview count. Inbox screenshot shows official group w/ logo+OFFICIAL badge.
- Test members: member2@gmail.com / member3@gmail.com (Password123) exist as member1's friends.


## Session update (Jun 2026 fork) — Group icon polish + 502 fix (DONE)
- Inbox group icon: combat-logo.webp is a transparent-corner PNG; removed the black circular container bg + circular clip and enlarged it (46→58, negative margins) so the badge shows cleanly with no black box. NOTE: the dark disc is part of the logo artwork itself (black circle + orange ring); a fully transparent-centre emblem would need a new source image from the user.
- FIX (testing_agent iteration_16 flagged): member group-create + join-request could 502 at ingress when the email provider throttled serial admin notifications. Added _notify_all_admins() fired via asyncio.create_task (fire-and-forget) in group_create + group_join_request. Verified member create-group now returns in ~0.01s.

## Session update (Jun 2026 fork) — Transparent group logo (DONE)
- Generated a transparent-centre version of the combat badge (PIL: near-black pixels < ~55 set to alpha 0, dark greys feathered) → assets/images/combat-logo-transparent.webp. Removes the solid black disc so only the white ring/skull/wings/orange/green + text remain. src/groups.ts now maps muay-thai-academy → the transparent logo. Inbox groupLogo bumped to 64px. Verified via screenshot: badge floats cleanly on the dark row, no dark circle.

## Session update (Jun 2026 fork) — Academy welcome auto-post (DONE)
- When an admin ACCEPTS a join request into an official group, a friendly system message is auto-posted in that group chat: from_id="system", sender_name "Max Energy", body "🥊 Everyone welcome {first} to the {group}! Say hi 👋" (renders as a normal incoming bubble). Added in admin_group_join_approve before the member notification. Verified via curl (welcome appears in GET /groups/{gid}). Test state reset (academy back to admins only).

## Session update (Jun 2026 fork) — Academy pinned rules note (DONE)
- Groups now support a pinned note. Backend: group_chats.pinned_note; group_get returns it; NEW POST /groups/{gid}/pin (owner-only, {note}, max 1000 chars, empty clears). Muay Thai Academy seeded with a default welcome/rules note (idempotent; back-fills existing doc if missing).
- Frontend: group/[id].tsx shows a sticky pinned banner at the top (pin icon + "PINNED · GROUP RULES" + note, 2-line preview w/ Read more/Show less toggle). group/manage.tsx (owner only) has a "PINNED NOTE / RULES" multiline editor + Save. api.ts +groupSetPin.
- Verified: academy pinned_note seeded; banner renders at top of the Academy chat via screenshot; tsc clean.

## Session update (Jun 2026 fork) — Gym notices auto-post to Academy chat (DONE)
- When an admin posts a Gym Notice (POST /admin/announcements), it now also auto-posts into every official group chat (Muay Thai Academy) as a system message ("📢 <title>\n\n<body>", from_id="system", sender "Max Energy", read_by=[author] so it shows unread for everyone else → Inbox unread badge). Fire-and-forget via _post_official_announcement + asyncio.create_task. (Events are seed-only, no admin event-create endpoint; notices are the admin content path.)
- Frontend group/[id].tsx: system messages render as a distinct "GYM ANNOUNCEMENT" card (megaphone icon, brand border) instead of a chat bubble. Verified via screenshot. tsc clean. Test notice cleaned up.

## Session update (Jun 2026 fork) — Emoji picker in messaging + group-chat emails removed (DONE)
- Emoji picker: added rn-emoji-keyboard@1.7.0 (pure JS, Expo SDK 54 ok). New reusable src/components/EmojiButton.tsx (smiley icon → dark-themed EmojiPicker bottom sheet w/ search + categories; appends chosen emoji to the input). Wired into all message inputs: group/[id].tsx (group-emoji), chat/[id].tsx DM (dm-emoji), chat/gym.tsx (msg-emoji), admin/thread.tsx (thread-emoji). Verified via screenshot (picker opens, themed).
- Removed email notifications for GROUP chat messages: group_send now uses create_notification (in-app only) instead of notify_user, so members still get the in-app alert + Inbox unread badge but NO email per group message. DM/gym/announcement emails unchanged. Verified group send still returns ok (with emoji), no email path hit.

## Session update (Jun 2026 fork) — Member message-notification toggle (DONE)
- Members can turn message notifications on/off. Backend: users.message_notifications (default true) in user_public; NEW PUT /api/me/message-notifications {enabled}; helper _msg_notifs_on(uid). Gated all message notifications by the recipient's toggle: DM send, group_send, and admin→member gym reply (skips both in-app + email when off; messages still appear in Inbox).
- Frontend: Inbox header now has a settings gear (testID inbox-settings) → new /app/frontend/app/inbox-settings.tsx ("Message Settings") with a Switch (testID toggle-message-notifications) that loads via api.me() + saves via api.setMessageNotifications with optimistic update + explanatory note. api.ts +setMessageNotifications.
- Verified: me returns message_notifications; PUT toggles false/true and persists; settings screen renders via screenshot; tsc clean.

## Session update (Jun 2026 fork) — Class reminder toggle in Message Settings (DONE)
- Added a "CLASS REMINDERS" section to the Inbox Message Settings screen (inbox-settings.tsx): a Switch (testID toggle-class-reminders; on→3h default, off→0) + lead-time chips [1 hr, 3 hrs, 12 hrs] (testID reminder-lead-{h}) shown when on. Uses existing users.reminder_hours (0/1/3/12) via api.me() + api.setReminderPreference — stays in sync with the Profile reminder chips (same backend field). Verified via screenshot (toggle on, 3 hrs selected). tsc clean. No backend change needed.

## Session update (Jun 2026 fork) — Quiet Hours (DONE)
- Members can mute ALL notifications during a set window (e.g. overnight). Backend: users.quiet_hours {enabled,start,end} (HH:MM, Queensland local) in user_public; NEW PUT /api/me/quiet-hours (validates HH:MM 24h). Helpers _quiet_window (handles overnight wrap) + _in_quiet_now. notify_user now SKIPS the email when the recipient is inside their quiet window (in-app notification still created, so it's waiting in the Inbox/Alerts). Transactional emails sent via send_email directly (receipts, OTP, membership) are unaffected.
- Frontend inbox-settings.tsx: new "QUIET HOURS" section — toggle (testID toggle-quiet-hours) + From/Until time buttons (quiet-start/quiet-end) opening a 30-min-increment time sheet (quiet-opt-HH:MM), 12h labels, explanatory note. api.ts +setQuietHours.
- Verified: endpoint validates + persists (bad format 400); overnight-wrap logic unit-checked (22:00–07:00 true at 23:00/03:00/06:59, false at 07:00/12:00); UI screenshot shows all three settings (messages, reminders, quiet hours) in one screen. tsc clean. Test account reset to off.

## Session update (Jun 2026 fork) — Settings consolidation (Profile + Inbox) (DONE)
- Unified all notification prefs into one hub. Renamed inbox-settings screen title → "Notifications & Reminders" (holds Message notifications + Class reminders + Quiet hours). Now reachable from BOTH Inbox ⚙️ (inbox-settings testID) and NEW Profile "SETTINGS" section row (profile-link-settings → /inbox-settings). Tidied Profile Notifications row subtitle to "Your alerts & notification history" (reminders now live in Settings, not the alerts log). Profile confirmed already clean (no leftover reminder chips / Message-the-Gym duplicate). Awaiting user input on any specific buttons they want removed.

## Session update (Jun 2026 fork) — Home quick actions reorg + Academy members list (DONE)
- Home logged-in page: removed the standalone "Book next class / My bookings" shortcut row (redundant with the class carousel) and moved everything into the Quick Actions grid. Grid now (12): Book Next Class, My Bookings, View Schedule, Class Check-In, Free Trial, Join Membership, Class Pass (→ /credits "My Wallet"; replaced "Our Services"), Muay Thai Academy (→ /group/grp_muaythai_academy), Gym Notices, About Us, Contact Us, Settings (→ /inbox-settings). Removed unused nextClass var.
- Group screen: non-members opening a group (e.g. tapping the Academy shortcut before joining) now auto-redirect to the Inbox (group_get 403 → router.replace inbox) instead of a dead empty chat.
- NEW Academy/group members list: people icon in group header (testID group-members) → /app/frontend/app/group/members.tsx (read-only list of everyone: avatar, name, Owner badge, handle + online dot/last-seen with "Offline" fallback). Header now shows people + gear icons.
- Verified via screenshots: grid shows Class Pass + Muay Thai Academy (Our Services gone); members list shows "3 in Muay Thai Academy" with owner badge. tsc clean.

## Session update (Jun 2026 fork) — Academy quick-action logo + members-only gate (DONE)
- Home Quick Actions "Muay Thai Academy" tile now shows the combat badge logo (expo-image + groupLogo("muay-thai-academy") inside the gradient circle; quickLogo style) instead of a generic icon.
- Group screen: replaced the silent inbox redirect with a proper "Members only" state — non-members opening a group see a lock screen: "Only group members can access this group" + "Head to your Inbox to request to join, then an admin can add you." + Go to Inbox button (testID group-denied / group-denied-inbox). Header collapses to just the title for the denied state.
- Verified via screenshots (member1, not in academy): tile shows logo; tapping shows the members-only screen.

## Session update (Jun 2026 fork) — DM Read Receipts ("Seen") + Typing Indicator (DONE)
- Read receipts: DM messages already carry a `read` flag (set when recipient opens the thread). Frontend chat/[id].tsx now shows "Seen" (or "Sent") under the sender's LAST message. No schema change.
- Typing indicator: NEW POST /api/dm/{other}/typing (friends-only; upserts db.dm_typing {key,user_id,until_ts=now+6s}). GET /api/dm/{other} now returns friend_typing (true if the OTHER user's until_ts>now). Frontend: onChangeText throttles api.dmTyping (max 1/3s); a "<name> is typing…" bubble shows at the bottom.
- Live feel: DM screen now POLLS every 3s (useFocusEffect setInterval + cleanup) to refresh messages, Seen status, and typing; auto-scrolls on new messages (lenRef guard).
- Verified via curl E2E (send→read False; recipient opens→read True "Seen"; recipient typing→friend_typing True) and UI screenshot showing "Seen" under a sent bubble. Test data cleaned. tsc clean.

## Session update (Jun 2026 fork) — Welcome tour ends on Home (DONE)
- WelcomeTour "Get started" (onFinish) changed from router.navigate("/(tabs)/timetable") → "/(tabs)/home" so after the navigation walkthrough the member lands back on the logged-in Home screen instead of the schedules. home.tsx line ~337. tsc clean.

## Session update (Jun 2026 fork) — Facebook moved to its own "quick view" screen (DONE)
- Problem: the full FB page-plugin was embedded at the BOTTOM of Home (hard to find) and its tall WebView trapped scroll gestures (hard to scroll past).
- Fix: NEW dedicated screen /app/frontend/app/social.tsx ("Our Facebook") hosting <FacebookFeed/> inside a ScrollView (feed is the main content, no scroll conflict). Home now shows a compact tappable card ("LATEST FROM FACEBOOK" header w/ Open link + card "See our latest posts …", testIDs home-facebook-card / home-see-facebook) that routes to /social. Removed the inline <FacebookFeed/> + its import from home.tsx.
- Result: easy to find (neat card + own page) and no more scroll trap on Home. Verified via screenshots (Home card + Our Facebook screen with page tabs). tsc clean.

## Session update (Jun 2026 fork) — Taller FB feed + follow message (DONE)
- FacebookFeed sizing bumped to fill the /social page: FEED_HEIGHT 460→620, PLUGIN_HEIGHT 900→1100, MIN_H 260→520, MAX_H 1600→1800.
- social.tsx: added a follow banner above the feed — "Please like and follow our social media to stay up to date! 💥" (heart icon, brand-tinted card).
- Verified via screenshot (banner + tabs + taller feed area). Note: FB plugin frame renders blank in the headless web-preview sandbox but populates on real devices (unchanged plugin behaviour). tsc clean.

## Session update (Jun 2026 fork) — Facebook quick action (DONE)
- Added a "Facebook" tile (blue logo-facebook, testID quick-facebook) to the Home Quick Actions grid → routes to /social. Verified via screenshot. tsc clean.

## Session update (Jun 2026 fork) — Removed About Us from quick actions (DONE)
- Removed the "About Us" tile from Home Quick Actions (still available in Profile → Gym Info → "About Us & Team"). Grid back to 12 tiles (3 even rows). tsc clean.

## Session update (Jun 2026 fork) — 24h reschedule cutoff + picker form (DONE)
- Backend: booking_reschedule now enforces the same 24-hour cutoff as cancel (409 "Bookings can only be rescheduled at least 24 hours before the start time…"). Uses requested_at or class start (QLD local). Verified: booking 10h out → 409, 48h out → 200.
- Frontend bookings.tsx reschedule modal: replaced the free-text "Preferred day & time" input with horizontal chip pickers — Pick a day (next 14 days, e.g. "Wed 12 Aug") + Pick a time (6:00 AM–8:00 PM, 30-min slots). Composes requested_time = "<Weekday D Mon> · <h:mm AM/PM>" (unchanged backend contract). Added 24h notice + live "Preferred:" summary; Send disabled until both chosen. Verified via screenshot. tsc clean. Test bookings cleaned.

## Session update (Jun 2026 fork) — Reschedule picker shows REAL class slots (DONE)
- bookings.tsx reschedule modal: for CLASS bookings (not by_appointment) it now loads api.classes(), filters to upcoming sessions ≥24h out (classStartMs > now+24h), prefers same class name (falls back to all), and shows them as selectable rows ("Kickboxing · Tuesday 18 Aug · 6:00 pm"). requested_time = "<name> · <weekday d mon> · <time>". APPOINTMENT bookings keep the generic day+time chip picker. Send disabled until a session/time is chosen. Verified via screenshot (real Kickboxing sessions listed). tsc clean. Test booking cleaned.

## Session update (Jun 2026 fork) — Device compatibility hardening + defined minimums (DONE)
- Added expo-build-properties plugin to app.json pinning explicit minimums: Android minSdkVersion 24 (Android 7.0), compile/target SDK 35 (Android 15, Play Store 2025 req); iOS deploymentTarget 15.1. Matches Expo SDK 54 defaults (no unnecessary restriction).
- Confirmed: ios.supportsTablet true (iPad), android.edgeToEdgeEnabled true (Android 15 edge-to-edge/gesture nav), SafeAreaProvider wraps app + SafeAreaView/useSafeAreaInsets used in 56 screens (notch/Dynamic Island/nav-bar safe), layouts use Flexbox+StyleSheet (responsive across phone/tablet). Permissions declared (camera/QR, photos) with rationale strings.
- Third-party libs are all current cross-platform (RN 0.81.5, react-native-webview 13.15, expo-camera 17, expo-image-picker 17, react-native-safe-area-context 5.6, rn-emoji-keyboard 1.7) — none force a higher minimum than Android 7 / iOS 15.1.
- Verified app boots after config change (smoke screenshot). newArchEnabled true.
- MINIMUMS TO PUBLISH: Android 7.0 (API 24)+, iOS/iPadOS 15.1+.

## Session update (Jun 2026 fork) — Reschedule message reworded (DONE)
- Reschedule 24h-cutoff 409 message changed to make clear rescheduling IS allowed, just not inside 24h: "You can reschedule up until 24 hours before the class starts. This booking is now within 24 hours, so please contact the gym on 07 4057 9005 to change it." Logic unchanged (>24h allowed, <24h blocked). Verified via curl.

## Session update (Jun 2026 fork) — FIX: reschedule Send Request unreachable (DONE)
- Bug: reschedule modal card was vertically centered with no maxHeight/scroll; taller form (day/time chips or class-session list + note) pushed SEND REQUEST off-screen → user could not complete. Fix: wrapped modal body in a ScrollView (keyboardShouldPersistTaps=handled) + modalCard maxHeight:"85
## Session update (Jun 2026 fork) — FIX: reschedule Send Request unreachable (DONE)
- Bug: reschedule modal card was vertically centered with no maxHeight/scroll; the taller form (day/time chips or class-session list + note) pushed SEND REQUEST off-screen so the user could not complete. Fix: wrapped modal body in a ScrollView (keyboardShouldPersistTaps=handled) + modalCard maxHeight 85%. bookings.tsx.
- Verified by testing_agent iteration_17: class + appointment reschedules submit (200, status reschedule_requested, banner shows), button reachable on 390x844; 24h cutoff 409 regression intact. Seeded test bookings cleaned.

## Session update (Jun 2026 fork) — Fix "New time proposed" alert tap (DONE)
- Bug: tapping the "New time proposed — please confirm" notification (data.nav="member_bookings") routed to the Profile tab, which has NO "This time works" confirm button — so it appeared to do nothing.
- Fix: alerts.tsx openNotif `member_bookings` case now routes to `/bookings` (the My Bookings screen), which shows the proposed booking + "This time works" confirm + Reschedule/Cancel actions. Verified E2E via screenshot: tap → lands on /bookings with the confirm button visible.
- Also this session: removed admin rights from scottcarman69@gmail.com (is_admin=false, not a seeded admin so permanent). Added is_test flag + free-booking bypass in payments/checkout (returns paid_free_test, marks booking paid) — ONLY testmember@gmail.com is is_test. Seeded testmember with 3 upcoming paid bookings.

## Session update (Jun 2026 fork) — Block confirming past appointment times (DONE)
- Bug: an appointment could be confirmed for a time already in the PAST (e.g. "Thu 13 Aug 10:30am" confirmed at 1:51pm). Root cause: admin "Suggest a new time" was a FREE-TEXT field ("Tuesday 6:00pm") with no structured timestamp, so no future-validation was possible.
- Fix (backend server.py): added qld_now_naive()/iso_is_past() helpers. AdminRescheduleReq gains new_at (ISO QLD wall-clock). admin_booking_reschedule rejects a past new_at (400) + stores proposed_at_iso. admin_booking_accept rejects accepting an appointment whose requested_at has passed (400 → suggest a new time). booking_confirm_proposed_time rejects confirming when proposed_at_iso is in the past (400) + writes requested_at=proposed_at_iso on confirm.
- Fix (frontend admin/bookings.tsx): replaced the free-text "new time" input with a STRUCTURED day-chip (next 14 QLD days) + time-slot picker (6:00am–8:00pm, 30-min), past slots on today auto-disabled. Builds new_time label + new_at ISO. Modal wrapped in ScrollView (button always reachable). Button relabelled "PROPOSE & NOTIFY".
- api.ts adminRescheduleBooking(id, new_time, note, new_at).
- Verified via curl E2E: propose past→400, propose future→ok(proposed_at_iso set), member confirm future→ok(requested_at+scheduled_time set), member confirm past→400. Admin picker UI verified via screenshot (day+time chips render).

## Session update (Jun 2026 fork) — Admin picker matches member appt rules (DONE)
- Q from user: does the admin "Suggest a new time" picker hide booked-out slots + restrict to Mon–Thu 10:30am–4:00pm? Previously NO (all days, 6am–8pm, taken slots shown).
- Fix (admin/bookings.tsx): for by_appointment bookings the picker now shows Mon–Thu days only + 10:30am–4:00pm slots, and disables slots already taken (fetched via api.appointmentsTaken, excluding the booking's own requested_at) with a red "booked" tag. Class (non-appointment) bookings keep the general next-14-days / 6am–8pm picker. Past slots on today still disabled. Labels show "(Mon–Thu only)" / "(10:30am–4:00pm)".
- Backend (admin_booking_reschedule): for appointment bookings with new_at, now also runs check_appt_window (Mon–Thu, 10:30–4, half-hour) and rejects a slot already taken by another active appointment (409).
- Verified via curl: Saturday→400, 5pm→400, valid Wed 11:30→ok, taken Thu 2pm→409. Test data cleaned.

## Session update (Jun 2026 fork) — Member reschedule picker: available times only (DONE)
- User asked the member "Request a reschedule" picker (appointment bookings) to only show available times and grey out unavailable ones.
- Fix (bookings.tsx, isAppt branch): day chips now Mon–Thu only (next ~3 weeks), time chips 10:30am–4:00pm on the half hour. A slot is greyed/disabled when it is <24h away (the reschedule rule) OR already booked by another appointment (fetched via api.appointmentsTaken on modal open); taken slots get a red "BOOKED" tag. "Choose a day first" hint before a day is picked. Rebuilt dayOptions/timeSlots on the QLD (UTC-based) datetime util for device-independence. Class-booking reschedule (real session list) unchanged.
- Verified via screenshot: day picker shows Tue/Wed/Thu only, times 10:30am–4:00pm, and the taken 11:30am slot shows greyed with red "BOOKED".

## Session update (Jun 2026 fork) — Fix reschedule "Send Request" unresponsive (DONE)
- Bug: on appointment reschedule (Personal Training / Custom Programs), Send Request appeared unresponsive. Root cause: the member's OWN current appointment slot was flagged as "BOOKED" (disabled) in the taken-slots set, so tapping their intended time did nothing and left the button disabled.
- Fix (bookings.tsx): the appointment taken-slots effect now excludes the booking's own requested_at (added requested_at to Booking type). Same picker serves both PT and Custom Programs (both by_appointment) so both are fixed.
- Verified via screenshot E2E: pick day + available 10:30am → "Preferred:" shows, SEND REQUEST enabled → submit → banner "Reschedule request sent" + booking flips to RESCHEDULE REQUESTED. Backend reschedule returns 200. Test data cleaned.

## Session update (Jun 2026 fork) — Reschedule error now shown in-modal (DONE)
- Follow-up bug: "Send Request" appeared to do nothing. Real cause: when the reschedule is rejected (most commonly the 24-hour cutoff — the booking's ORIGINAL start is <24h away), submitReschedule set the `banner` which renders BEHIND the still-open modal, so the member saw no feedback.
- Fix (bookings.tsx): added rErr state shown in a red in-modal error box (testID reschedule-error) on failure; cleared on modal open/submit. Modal stays open so the member can adjust. Applies to PT, Custom Programs, and class bookings (shared modal).
- Verified via screenshot: rescheduling a within-24h booking now shows "You can reschedule up until 24 hours before the class starts… please contact the gym on 07 4057 9005" inside the modal. Happy path still submits + closes. Test data cleaned.

## Session update (Jun 2026 fork) — Reschedule 24h rule now applies to NEW time (DONE)
- Bug (user): could not reschedule a booking whose ORIGINAL start was within 24h, even when moving it to a far-future date (e.g. Mon 17 Aug). The 24h cutoff was checking the ORIGINAL booking time.
- Fix: reschedule now validates the NEW chosen time is ≥24h from now, and ignores how close the original booking is. RescheduleReq gains requested_at (ISO QLD wall-clock); booking_reschedule rejects only when requested_at < now+24h (409 "choose a new time at least 24 hours from now"), and stores requested_at on the booking. Frontend api.rescheduleBooking(id, requested_time, note, requested_at); submitReschedule sends the new time's ISO (appointment rApptIso, class booking rClassSlot.start_at). Error shown in-modal.
- Verified via curl: original within-24h booking → reschedule to Mon 17 Aug = 200; reschedule to a new <24h time = 409. Applies to PT, Custom Programs, and class bookings.

## Session update (Jun 2026 fork) — Booking Log CSV Export (DONE)
- Added an "Export … to spreadsheet (CSV)" button on the admin Booking Log screen (/admin/booking-log, testID blog-export).
- Builds a CSV client-side from the fetched log rows (columns: Reference, Date Logged, Member, Email, Phone, Class, When, Duration, Payment Method, Amount AUD, Credit Applied AUD, Membership Plan/Status/Expires, Key Tag). Respects the search filter (exports filtered results when searching, all otherwise). Proper CSV quoting.
- Delivery: web → direct file download (Blob + anchor); native → writes to FileSystem cache (expo-file-system/legacy) then opens the native share sheet (expo-sharing) so admins can save to Files / email to the accountant. Works in Expo Go.
- Installed expo-file-system (~19.0.23); expo-sharing already present.
- Verified via screenshot: button renders + click works (web download, no crash). Cleaned test-member booking_logs.

## Session update (Jun 2026 fork) — Admin Bookings redesign + paid/Square indicator (DONE)
- Status badge (PAID/CONFIRMED) now GREEN (colors.success) instead of orange.
- Added a green "PAID · <method>" chip on each booking (incl. Personal Training / Custom Programs), driven by real payment_transactions (payment_status="paid"): shows Square / Credit / Class Pass / Test. Backend admin_bookings now enriches each row with paid_via (first paid tx provider) and is_paid.
- Removed the "Mark as attended" bar from CLASS bookings (Muay Thai, Boot Camp, Kickboxing). Attendance ("Attended?" toggle) now only shows for by_appointment bookings (PT/Custom Programs), inline in the action row.
- Compacted the admin booking cards: status pill inline with the class title, meta as small chips (No. / price / PAID), single confirmed/preferred/proposed time line, smaller action buttons, tighter list gap. More organised & smaller per user request.
- Verified via screenshot + curl (paid_via=square, is_paid=true). Seeded test data cleaned.

## Session update (Jun 2026 fork) — "Paid by Square" chip + remove PAID badge (DONE)
- Admin Bookings: green chip now reads "Paid by <method>" (e.g. "Paid by Square", "Paid by Class Pass") instead of "PAID · Square".
- Removed the redundant PAID status pill from paid bookings (status pill now hidden when status=="paid"); the green "Paid by …" chip conveys it. Other statuses (CONFIRMED, PENDING, RESCHEDULE ASK, AWAITING MEMBER) still show their pill.
- Verified via screenshot. Seeded square txns cleaned.

## Session update (Jun 2026 fork) — Booking reference matches Square (DONE)
- User asked if the paid booking shows a reference that matches its Square payment. It does: the app number (e.g. 88352) is the same value Square receives as "MAX-88352" in the payment_note (booking_ref_code).
- Made it explicit: admin_bookings now returns `reference` (booking_ref_code = MAX-<no.>). Admin Bookings card shows the reference as "MAX-88352" (orange) instead of bare "No.", and for Square-paid bookings adds a "Square ref: MAX-88352" line so it lines up 1:1 with the Square dashboard/payment note for reconciliation.
- Verified via curl (reference == MAX-<booking_no>, matches Square payment_note format) + screenshot. Seeded square txns cleaned.

## Session update (Jun 2026 fork) — "BOOKING CONFIRMED" badge for all types (DONE)
- Added a green "BOOKING CONFIRMED" badge in the admin booking card title row, shown once a booking is confirmed: for classes (Muay Thai, Kickboxing, Boot Camp) when paid (paid == confirmed); for appointments (Personal Training, Custom Programs) when status == "confirmed" (admin tapped Confirm). confirmed = status==="confirmed" || (!by_appointment && is_paid). Non-confirmed, non-paid statuses still show their normal pill (PENDING/RESCHEDULE ASK/AWAITING MEMBER/CANCELLED). Paid-but-unconfirmed appointments show the Paid chip + Confirm button (no confirmed badge yet).
- Verified via screenshot. Seeded txns cleaned.

## Session update (Jun 2026 fork) — QR Attendance system: staff name, method, timestamp + emailed QR (DONE)
- Context: QR check-in already existed (member "Show entry QR code" → /check-in shows react-native-qrcode-svg from GET /bookings/{id}/checkin-code; admin/scan.tsx CameraView scans → POST /admin/checkin/scan; single-use via `attended` flag; class-day restriction for classes; appointments any day). Applies to all types (Muay Thai, Kickboxing, Boot Camp, Custom Programs, Personal Training).
- Added per user's spec:
  1. Record staff identity + method + time: admin_checkin_scan (QR) and admin_booking_attendance (manual) now set checked_in_by=<admin name>, checked_in_by_id, checked_in_method ("qr"|"manual"), checked_in_at. (Previously generic "admin_qr"/"admin").
  2. Member Booking History (bookings.tsx): attended bookings now show a green "ATTENDANCE CONFIRMED" card with Method (QR Code / Staff (manual)), Confirmed by (staff name), and Confirmed date+time (stampDate/stampTime). Replaces old "Checked in" line.
  3. Admin Bookings card: attended bookings show a green line "Attendance confirmed · QR|Manual · <staff> · <date time>".
  4. Emailed QR: booking payment-confirmation email now embeds the entry QR (external QR image renderer using a signed, long-lived — class start +2d / 120d — check-in JWT) + "show at the door" copy. New helper make_checkin_code(booking_id, uid, exp).
- Manual "Attended?" toggle kept as backup (admin only shows it for appointments; QR works for all).
- Verified via curl (scan #1 ok, scan #2 already/single-use, method+staff+time recorded for both QR and manual) + screenshot (member attendance card renders). Test data cleaned.

## Session update (Jun 2026 fork) — No-show "QR not confirmed" message (DONE)
- If a paid/confirmed booking was never checked in (attended=False) and the session END time (start + duration) has passed, both the member Booking History card and the admin Bookings card now show a red "QR code was not confirmed during class time" message (member: replaces the "Show entry QR code" button; admin: a red line under the booking).
- Computed client-side: startIso = by_appointment ? requested_at : class_start; endMs = classStartMs(startIso) + (duration_min||60)*60000; missed = !attended && status in (paid,confirmed) && qldNowUTC() > endMs. admin_bookings now enriches rows with class_start + duration_min (from classes) for this.
- Verified via screenshot (member shows the red message on a past unattended appointment; upcoming bookings still show the QR button). Test data cleaned.

## Session update (Jun 2026 fork) — Block duplicate reschedule while pending (DONE)
- Members can no longer request a second reschedule while one is still pending admin action.
- Backend booking_reschedule: rejects with 409 "You already have a reschedule request pending…" when the booking status is already "reschedule_requested".
- Member bookings.tsx: when status=="reschedule_requested", the Reschedule button is hidden (Cancel still available) and a pending note shows "Reschedule requested for <time> — waiting for the gym to confirm. You can't request another change until they respond."
- Verified: 2nd reschedule attempt → 409; UI hides Reschedule + shows pending note (screenshot). Test data reverted.

## Session update (Jun 2026 fork) — Attendance record + no-show message on Booking History (DONE)
- User asked to apply the attendance record + "QR not confirmed" no-show message across all bookings; added them to the Booking History / Booking Log screen (booking-history.tsx) which previously only showed a plain "· Attended".
- Now each history row shows: attended → green "ATTENDANCE CONFIRMED" box with Method (QR Code / Staff (manual)), Confirmed by (staff name), Confirmed date+time; unattended past paid/confirmed session → red "QR code was not confirmed during class time". Works for all types (classes + appointments), same logic as the My Bookings screen.
- Backend bookings_history now runs _enrich_bookings (adds class_start + duration_min) so no-show timing works.
- Reschedule pending-lock confirmed already universal (status-based) across all booking types.
- Verified via screenshot (attended MuayThai record + no-show PT). Test data cleaned.

## Session update (Jun 2026 fork) — Fix cancel button (web) + class times + refund answer (DONE)
- Bug: Cancel did nothing on web. Root cause: confirmCancel used Alert.alert with buttons, whose onPress callbacks don't fire on React Native Web. Replaced with a cross-platform in-app confirm Modal (Keep booking / Cancel booking, testID cancel-confirm-btn). Works on web + native. Removed unused Alert import; removed the 24h Alert (the 24h error already surfaces in the banner).
- Refund/credit policy (confirmed to user): cancelling ≥24h before start → class-pass bookings get the PASS RETURNED to the account; money-paid bookings get in-app ACCOUNT CREDIT for the amount. Verified via curl (card → +$25 credit; pass → +1 pass).
- Show class time on ALL bookings: My Bookings card now shows a clock-icon time line for every booking — classes use class_start (classDate·classTime), appointments use scheduled_time/requested_time (or "Time TBC"). Cancel modal copy adapts (pass vs credit) using paid_with_pass.
- Verified via screenshot (times on all cards; cancel modal opens on web) + curl (cancel completes, rewards correct). Test data cleaned.

## Session update (Jun 2026 fork) — Fix credit not deducted (test account) (DONE)
- Bug: booking a class "with credit" didn't deduct the credit balance. Root cause: the is_test free-booking bypass in payments_checkout ran BEFORE the credit/class-pass branches, so the test account booked free and ignored the chosen payment method (real accounts always deducted correctly — verified).
- Fix: the is_test free bypass now only applies when NOT using credit or class pass (`if u.is_test and not use_credit and not use_class_pass`). For partial-credit on a test account, credit is applied and the leftover card portion is covered free (test_free tx) so no real card charge. Real accounts unchanged.
- Verified via curl: real account credit 5000→3500 (ledger). Test account with use_credit: 5000→2500 (ledger "Used toward Kickboxing"); test account without credit still books free (no deduction).
- Note: the visible balance updates on next screen load (server + ledger correct). Test data cleaned; testmember reset to 3 seeded bookings, credit 0.

## Session update (Jun 2026 fork) — Wallet balance on Bookings + Credit History (DONE)
- Credit History screen already existed at /credits ("My Wallet"): shows AVAILABLE CREDIT, CLASS PASS CREDITS + QR, CLASS PASS HISTORY and CREDIT HISTORY (earned/spent w/ reasons+dates), from GET /api/credits (balance_cents, entries, class_pass_credits, pass_entries). No backend change needed.
- Added: My Bookings screen now shows a tappable wallet bar at the top — CREDIT $x.xx · PASSES n · "History ›" (testID bookings-wallet) → routes to /credits. bookings.tsx load() now also fetches api.myCredits() (creditCents, passCredits), refreshed on focus so deductions show instantly.
- Verified via screenshot (wallet bar shows $35.00 / 4 passes; tap opens full history). Test data reset.

## Session update (Jun 2026 fork) — Attendance Leaderboard / Ladder (DONE)
- New feature: gym attendance leaderboard ranking members by CONFIRMED attendance (bookings with attended=True — set by QR scan or manual). Counts all types (Muay Thai, Kickboxing, Boot Camp, Custom Programs, Personal Training).
- Backend: GET /api/leaderboard?period=month|year|all → aggregates attended bookings by user (period filter on checked_in_at, QLD-aware), returns Top 30 [{rank,name(first+last initial),picture,count,is_me}] + me {rank,count,opted_out}. Excludes opted-out members and the is_test demo account from the public board; caller's own rank still computed (rank = #participants with more +1). Privacy: PUT /api/me/leaderboard-visibility {opt_out}; user_public exposes leaderboard_opt_out. Helper _leaderboard_name.
- Frontend: new /leaderboard screen (Attendance Ladder) — period tabs (This Month/Year/All Time), gold/silver/bronze podium for top 3 with avatars, ranked rows 4–30 (own row highlighted), sticky "YOUR RANK #x · n classes" bar (or "hidden" note if opted out). Avatar component (picture or initials). Added Home quick-action tile "Attendance Ladder" (trophy). api.leaderboard + api.setLeaderboardVisibility. Opt-out toggle added to inbox-settings ("Hide me from the public ladder").
- Verified via curl (ranking order, name format, me.rank; opt-out removes from board but keeps count) + screenshot (podium + rows + your-rank bar). Rankings recompute live from bookings each request. All test data cleaned.

## Session update (Jun 2026 fork) — Streaks + Ladder Movement (DONE)
- Attendance Streaks: each member's consecutive-weeks-with-≥1-confirmed-attendance (QLD Monday weeks; active if last attended week is this/last week else 0). Shown as "🔥 Nw" badges on rows/podium (N≥2) and a "🔥 N WEEK STREAK" chip in the your-rank bar. Backend computes per board member + caller from attended checked_in_at.
- Ladder Movement: rank change vs LAST calendar month (prev-month ranking of participants). Each row shows ▲n (green, moved up), ▼n (red, down), – (same), or NEW (green, not ranked last month). Backend adds movement (prev_rank - current_rank, null=new) to each board row.
- leaderboard endpoint response now includes streak + movement per row and me.streak. Frontend Movement + StreakPill components.
- Verified via curl (streak 2/3, movement 0/▼1/NEW) + screenshot. All ladder test data cleaned.

## Session update (Jun 2026 fork) — Ladder moved to bottom tab bar (DONE)
- Moved leaderboard screen from /app/leaderboard.tsx to /app/(tabs)/leaderboard.tsx (route still /leaderboard). Added a "Ladder" tab (trophy icon) in (tabs)/_layout.tsx between Alerts and Profile (now 7 tabs). ScreenHeader on the ladder now showBack={false} (root tab, no back).
- Removed the "Attendance Ladder" quick-action tile from Home.
- Verified via screenshot: trophy tab present + active, ladder renders as a tab with no back button.

## Session update (Jun 2026 fork) — Per-discipline (class-type) ladders (DONE)
- Leaderboard now supports a discipline filter. GET /api/leaderboard?period=&discipline= — discipline "all" or a class name (e.g. "Muay Thai"). Filter applied to the main ranking, streaks, and last-month movement. Response also returns `disciplines` (distinct class_names with any confirmed attendance) for the filter chips.
- Frontend leaderboard screen: horizontal chip row under the period tabs — "All Classes" + each discipline. Selecting one re-ranks the board, podium, streaks, movement, and the your-rank bar for that discipline. api.leaderboard(period, discipline).
- Verified via curl (All / Muay Thai / Kickboxing give different rankings + own rank) and screenshot. Test data cleaned.


## Session update (Jun 2026 fork) — Receipt fix + 3 backlog features (DONE)
- Receipt bug (P0): GET /api/payments/receipt/{booking_id} now serves receipts for status in ("paid","confirmed") so confirmed Personal Training / Custom Program appointments load. Verified endpoint + confirmed-appt data.
- TASK 1 — Spots Left in reschedule picker (bookings.tsx): the member's class-reschedule "Pick a session" list now shows spots-left per session (green "N spots left", amber 1-3, red "Class full" + disabled). Pulled from api.classes() spots_left/capacity. ClassSlot type extended.
- TASK 3 — Admin-configurable Cancel/Reschedule window (was hardcoded 24h):
  - Backend: db.settings {key:"booking", cancel_window_hours} + get_cancel_window_hours() (default 24, clamp 1..168). New endpoints GET /api/settings/booking (member), GET+PUT /api/admin/settings (admin, PUT validates 1..168). Cancel (booking_cancel) + reschedule (booking_reschedule) now use the dynamic window with dynamic error copy.
  - Frontend: NEW /app/frontend/app/admin/settings.tsx (chips 6/12/24/48/72 hrs, save on tap, banner). "Booking Settings" card on Admin Dashboard. bookings.tsx fetches api.bookingSettings() and uses cancelWindow in the class-slot cutoff, appt-slot sub-window disabling, reschedule/cancel copy.
- TASK 4 + 5 — No-Show Report + Attendance CSV export:
  - Backend: GET /api/admin/attendance/roster — per ENDED fixed-time class session (by_appointment excluded), returns attended[] vs no_shows[] (name/email/checkin_time/checked_in_by) + counts + totals{attended,no_shows,sessions}. "ended" = class_start+duration < QLD-now.
  - Frontend (admin/attendance.tsx): "EXPORT ATTENDANCE (CSV)" button (native share / web download; columns Class,Date,Time,Member,Email,Status,Check-in time,Checked in by) + "NO-SHOW REPORT" card (ATTENDED/NO-SHOWS/SESSIONS chips + expandable per-session no-show member lists).
  - api.ts +bookingSettings +adminSettings +adminUpdateSettings +attendanceRoster.
- Verified by testing_agent: backend 17/17 pytest (backend/tests/test_booking_settings_and_attendance.py — run with -p no:xdist), all frontend flows pass. cancel_window reset to 24 after tests. tsc clean.
- Remaining backlog (P2/P3): Low Balance Nudge, Streak Reminders, Class Champion Badge, Admin Pass Report, Pass for Appointments, SMS on booking (Twilio), Booking push (Firebase).


## Session update (Jun 2026 fork) — Account screen finalize + SEC-001 + Champion/Streak/Trial nudges (DONE)
- Account screen (P0, was untested): CONFIRMED WORKING. Profile → Settings → "Password & account" → /account. Change Password validates (wrong current / weak / same-as-old / mismatch), updates bcrypt hash, bumps token_version (signs out other devices), returns fresh token to keep this session. Delete Account (DELETE /api/auth/account) wipes user data & logs out (admins blocked). Backend verified via curl (all validation paths + old-token 401 + new-token 200 + re-login). Frontend verified via screenshot (dark theme, renders clean).
- SEC-001 (P1): Rotated both seeded admin passwords to strong random values (env backend/.env ADMIN_PASSWORD / ADMIN2_PASSWORD + DB password_hash updated via one-off rotate script, token_version bumped, sessions cleared). New creds in /app/memory/test_credentials.md. Old passwords now rejected (verified). Also hardened root .gitignore to ignore all .env files (they were untracked but had no ignore rule). Square token remains sandbox in backend/.env (untracked).
- Class Champion Badge (P1): backend compute_champions() → #1 all-time confirmed-attendance member per discipline (excludes opted-out/test members + "Free Trial" classes), 5-min cache. Exposed in GET /api/auth/me as user.champion_disciplines[]. Frontend: gold "<DISCIPLINE> CHAMPION" trophy pill in profile badge row (one per discipline). Verified end-to-end via screenshot (BOXING CHAMPION shown). api.ts User type +champion_disciplines.
- Streak Reminders (P1): send_streak_reminders() in reminder_loop (every 15 min). Fri–Sun QLD only; nudges members with a >=2-week attendance streak who haven't trained yet this week; one nudge/member/week (deduped via users.streak_reminder_week); respects reminder_hours==0 (reminders off). In-app + email via notify_user.
- Trial expiry follow-up (P2): send_trial_followups() in reminder_loop. One-time nudge 6h–7d after a booked free-trial session that wasn't attended (deduped via bookings.trial_followup_sent). In-app + email.
- Both loop jobs verified to execute without error (0 sent — no eligible data). Champion test data cleaned up.

### Remaining backlog
- P2: "Add to calendar" — extend Google + add Apple (.ics) calendar links to ALL booking confirmation emails (currently Google link only in mark_booking_paid / paid Square bookings).
- P3: SMS on booking (Twilio creds needed), Booking push notifications (Firebase needed).


## Session update (Jun 2026 fork) — Calendar links in booking emails (DONE)
- Booking confirmation emails now include TWO one-tap "Add to calendar" buttons: 📅 Google Calendar (link) + 🍎 Apple / Outlook (hosted .ics). Covers class bookings (card/pass/credit via mark_booking_paid) and free-trial confirmations (trials_claim). Appointments skipped (no fixed datetime).
- NEW public endpoint GET /api/calendar/{booking_id}.ics?t=<signed token> — serves a standards-compliant VEVENT (with a -PT1H VALARM). Auth via sign_dl_token/verify_dl_token kind='cal' (same signed-link pattern as PDF/CSV). Verified: valid token → correct ICS, bad token → 403.
- Fixed a pre-existing timezone bug: class/trial start times are stored as QLD-naive wall-clock; the old _gcal_link used .astimezone(utc) which was ~10h off. New _qld_naive_to_utc() converts QLD(UTC+10)→UTC. Verified 18:00 QLD → DTSTART 08:00Z.
- Emergent email proxy does NOT support attachments (only to/subject/html/from_name/contact_email), so Apple support is via the hosted .ics link, not an attachment.
- _public_base() now caches the last-seen public base URL (+ new http middleware warms it on every request) so background tasks (payment polling → mark_booking_paid, reminders) can build absolute .ics links even without a request in scope.
- Verified end-to-end: real pass-payment booking flow ran clean (no errors), calendar button HTML + .ics validated. Test data cleaned.
- Follow-up idea: extend calendar links to Event RSVP emails (events are keyed by event_id, would need a small /api/calendar/event/{id}.ics variant).


## Session update (Jun 2026 fork) — Calendar UX: appointments + reminder timing + in-app add (DONE)
- (1) Appointment confirmation emails now include the Google + Apple/Outlook calendar buttons. Applied to BOTH admin confirm paths: POST /admin/bookings/{id}/confirm and POST /admin/bookings/{id}/accept (both now take request:Request for base URL). Uses the appointment's concrete requested_at time.
- (2) Reminder timing choice at booking: class detail screen (fixed classes only) shows a "Calendar reminder" selector — "1 hour before" (default) / "1 day before". Stored per-booking as cal_reminder_minutes (60|1440) via BookingCreate. The .ics VALARM now uses TRIGGER:-PT{minutes}M (was hardcoded -PT1H). Note: only affects the Apple/Outlook .ics event (Google render URL can't set a custom reminder).
- (3) In-app "Add to calendar" button on My Bookings (paid/confirmed, non-trial, future sessions). NEW backend GET /api/bookings/{id}/calendar (auth+owner) → {title,start,end,location,notes,reminder_minutes,google_url,ics_url}. New frontend util src/utils/calendar.ts: web → opens Google in new tab; native → expo-calendar createEventInCalendarAsync (system add-event sheet, pre-filled + alarm), falling back to opening the hosted .ics (iOS) / Google link.
- Shared helper _booking_start_utc(b): appointments use requested_at, fixed classes use class_start (→ class doc fallback), all converted QLD→UTC. Used by the .ics endpoint + both new endpoints.
- Installed expo-calendar@15.0.8; app.json: iOS NSCalendars(WriteOnly)UsageDescription, Android READ/WRITE_CALENDAR, expo-calendar config plugin.
- Verified: .ics tz correct (18:00 QLD→08:00Z), cal_reminder_minutes stored (1440), /calendar endpoint returns correct payload, reminder selector renders (screenshot), "Add to calendar" button renders on paid booking (screenshot), tsc clean on changed files. NOTE: native expo-calendar add is best tested on a real device/build (works via link fallback in web/Expo Go).

## Session update (Jun 2026 fork) — Default calendar reminder in Settings (DONE)
- Members can set a default calendar reminder once in Settings → Notifications & Reminders → "CALENDAR REMINDER" (1 hour / 1 day). New bookings pre-select it; still overridable per booking on the class screen.
- Backend: user.cal_reminder_default (default 60) added to user_public; NEW PUT /api/me/calendar-reminder (accepts 60|1440, else 400). booking_create now falls back to the member's default when cal_reminder_minutes isn't sent. Verified: /auth/me returns it, PUT valid+invalid, and a booking created without an explicit choice inherited 1440.
- Frontend: api.setCalReminderDefault + User.cal_reminder_default; inbox-settings.tsx chip selector (saves + calls AuthContext refresh so the class screen picks it up); class/[id].tsx calReminder now inits from user.cal_reminder_default. tsc clean; Settings screenshot verified. testmember default reset to 60 after test.

## Session update (Jun 2026 fork) — UI polish: Up Next size + Quick Actions declutter (DONE)
- Home "Up Next" slideshow card height reduced 300→220 (styles.heroCard) for a more compact hero.
- Quick Actions decluttered: home.tsx now shows 6 essentials by default (Book Next, My Bookings, View Schedule, Class Check-In, Class Pass, Muay Thai Academy) with a "More actions (N)" / "Show less" toggle (showMoreActions state) revealing the rest (Calendar, Join Membership, Gym Notices, Contact Us, Settings, Facebook). Invisible spacer tiles keep the space-between grid's partial last row left-aligned. Contextual: "Join Membership" hidden once user.membership_active. Verified via screenshots (collapsed + expanded). tsc clean.

## Session update (Jun 2026 fork) — Reorder Quick Actions (drag-to-customise) (DONE)
- Members can personalise their Quick Actions order. NEW screen /app/customize-actions.tsx: a 3-col drag-to-reorder grid (react-native-sortables@1.10.0, Reanimated-4/Fabric ready; also pulled react-native-haptic-feedback). Press & hold to drag; first 6 (HOME_QUICK_COUNT) get an orange border + home badge = shown on Home, rest go under "More actions". Saves on drag end.
- Shared source of truth: NEW src/quickActions.ts (QUICK_ACTIONS_META, DEFAULT_QUICK_ORDER, HOME_QUICK_COUNT, orderKeys()). Home refactored to build tiles from meta + a key→onPress handler map, ordered by the member's saved order (membership tile still hidden for active members). Added a "CUSTOMISE" link in the QUICK ACTIONS header → /customize-actions.
- Backend: user.quick_actions_order (list of keys) in user_public; NEW PUT /api/me/quick-actions (caps 30 keys, 40 chars each). Verified: /auth/me returns it, PUT persists, Home reflects the saved order (Class Pass first in test), Customise screen loads authoritative order via api.me() on focus. tsc clean. Test order reset to [] after.
- Note: long-press+drag is best felt on a real device; the grid + persistence verified via screenshots + curl.

## Session update (Jun 2026 fork) — Badge counts + Kids Muay Thai age requirement (DONE)
- Quick Action badges: red count bubble on "My Bookings" and "Gym Notices" tiles for "something new" that clears once the member opens the screen. NEW GET /api/home/badges → {bookings, notices}: notices = announcements created since member last opened Notices tab (existing "notices" content_view timestamp); bookings = active bookings created/confirmed/paid since member last opened My Bookings. NEW POST /api/views/bookings records the My Bookings view (called on focus in bookings.tsx; events.tsx already records notices view). Home fetches badges in load() (on focus). Verified: My Bookings showed "2", endpoint returned {bookings:2, notices:3}.
- Kids Muay Thai age requirement 8–16: data-driven via class docs min_age=8/max_age=16 (+ level "Ages 8-16"). Idempotent startup migration updates existing Kids Muay Thai classes in place (keeps class_ids & bookings). CLASS_TEMPLATES + seed doc updated for future reseeds (was "Ages 6-16"). /classes & /classes/{id} already return full doc so fields surface automatically. Frontend: prominent orange "AGES 8–16" pill under class name on timetable Kids cards; neat "Ages 8–16 only" banner (person icon) at top of class detail/booking screen. Verified via screenshots.

- Tweak: HOME_QUICK_COUNT 6→8 (src/quickActions.ts) — Home now shows 8 essentials (2 rows of 4) before "More actions"; also drives the Customize screen home badges.

## Session update (Jun 2026 fork) — Child age prompt on Kids booking (DONE)
- When booking a Kids class (min_age/max_age set), a modal now asks "How old is the child attending?" before payment. Numeric input; if the age is outside 8-16 it shows a GENTLE amber flag ("best suited to ages 8-16, you can still continue") but does NOT hard-block. Asked once per class-detail session (childAgeNum state), then continues the normal pay flow (credit/pass popup or card).
- Backend: BookingCreate.child_age (Optional[int]); stored on booking doc as child_age. Verified persists (=10 in curl test).
- Frontend class/[id].tsx: onBookPress routes Kids classes to the age modal first; confirmAge saves & continues; child_age passed through proceedBooking -> api.createBooking. Verified via screenshot (modal + out-of-range warning).

## Session update (Jun 2026 fork) — Hard block under-min-age on Kids booking (DONE)
- Kids Muay Thai now HARD-BLOCKS children under 8 (min_age). Frontend: age modal shows red "Sorry, this class is for ages 8+. Children under 8 cant be booked in." and disables CONTINUE when age < min_age; over max_age still shows the gentle amber note (allowed). Backend: booking_create rejects child_age < cls.min_age with 400 (server-side, cannot be bypassed). Verified: curl under-8 -> 400, age 10 -> success; screenshot shows red block + disabled Continue.

## Session update (Jun 2026 fork) — 16+ note on adult classes (DONE)
- Adult group classes (Muay Thai Adults, Kickboxing, Boot Camp) now carry min_age=16 (no max_age) -> display-only "16+" badge on timetable cards + "Ages 16+" banner on class detail, consistent with Kids "AGES 8-16". Appointments (PT/Programs) unchanged (no age). Idempotent startup migration sets min_age=16 for non-Kids non-appointment classes; CLASS_TEMPLATES updated for reseeds.
- No age prompt/block for adults: the child-age modal only triggers when BOTH min_age && max_age are set (Kids only), so adults just see the note. Frontend badge/banner render "AGES {min}-{max}" when both present else "{min}+". Verified via screenshot (Adults Muay Thai shows 16+).

## Session update (Jun 2026 fork) — Admin class editor age range (DONE)
- Admin class editor (app/admin/classes.tsx) now has an "Age requirement (optional)" section: Min age + Max age inputs (populate on edit, blank = none). Helper text explains: both set (8-16) => age badge + child-age prompt at booking + under-min hard block; only Min (16) => simple "16+" note; blank => no limit.
- Backend ClassUpsert +min_age/+max_age; admin_class_create & admin_class_update set them (null clears). Verified via admin API: create with 10-14, update to clear max (12+), delete.
- Flows into existing member-side logic (timetable badge, class detail banner, booking age prompt/under-min block) already built. tsc clean; admin editor screenshot verified.

## Session update (Jun 2026 fork) — Age on receipt + Remember child age (DONE)
- Age on receipt: GET /api/payments/receipt/{id} now returns child_age; receipt screen shows "Child's age: N years" row + in the PDF/share HTML. Admin bookings list (already returns full docs incl child_age) now shows an "Age N" chip on the booking card.
- Remember child: booking_create saves child_age to user.child_age_default; exposed in user_public. The Kids age modal (class/[id].tsx) pre-fills from user.child_age_default so parents don't re-enter it each time.
- Verified end-to-end via API: booking with child_age=11 -> profile child_age_default=11, receipt child_age=11, admin list child_age=11. tsc clean.
- LOGIN NOTE: user reported "Invalid credentials" — root cause was the earlier SEC-001 admin password rotation (old admin password no longer valid). Confirmed login system healthy (valid creds return 200). User confirmed working after using rotated password for info@maxenergy.com.au. Current admin creds in /app/memory/test_credentials.md.

## Session update (Jun 2026 fork) — Notifications & Reminders screen tidy-up (DONE)
- Redesigned inbox-settings.tsx for a consistent look: each setting is now ONE self-contained card (header row: icon+title+sub+Switch), with option chips (reminder lead time, calendar default) and quiet-hours time pickers INSIDE the card, and the helper note moved inside under a thin divider (was floating between cards -> looked messy). Chips use flexGrow to align evenly. Link cards (My notifications/Account/Blocked/Privacy) unified to the same subtle border/bg (was mixed brand borders). Grouped Account & Privacy. tsc clean; screenshots verified.

## Session update (Jun 2026 fork) — Privacy Policy data-storage section (DONE)
- app/privacy.tsx section 4 rewritten to "How we store & protect your data": confirmed facts as bullets (passwords = bcrypt one-way hash + salt, never readable; info in secure DB, staff-restricted; uploaded images in managed cloud storage separate from DB; payments via Square, no card storage; HTTPS in transit). Added a paragraph with clearly-marked [HOSTING PROVIDER]/[DATA REGION]/[BACKUP LOCATION]/outside-Australia placeholders + TODO comment for the owner to fill after confirming with support@emergent.sh. Section 5 updated with the in-app account-deletion path. Verified via screenshot.

## Session update (Jun 2026 fork) — Deployment readiness + Privacy relocation + Group message unsend (DONE)
- DEPLOY BLOCKER FIXED: seed_data() no longer hard-deletes catalog collections on SEED_VERSION change. Now NON-DESTRUCTIVE — each of classes/events/announcements/membership_plans is seeded ONLY when empty (count==0). Safe for fresh production DB (seeds base data + admins) and preserves admin-created data on redeploys. Verified backend boots clean + existing preview data intact.
- User's managed Mongo (customer-apps.m4pwrf...): preview cannot reach it (network/IP restriction, not self-serve). Guidance: set MONGO_URL in Deployment Panel -> Secrets, redeploy; live app seeds admin+base on first boot. App now deployed to prod (https://class-notify-8.emergent.host).
- Privacy Policy MOVED out of Settings (inbox-settings.tsx) to Profile page GYM INFO section (below Contact & Gym Info). Verified via screenshot.
- Group chat unsend/delete: new backend DELETE /api/groups/{gid}/messages/{gmsg_id} (sender can unsend own; owner/admin can delete any incl. announcements). api.groupDeleteMessage added. group/[id].tsx: own messages (and any msg for owner/admin) wrapped in Swipeable -> swipe left reveals "Unsend"/"Delete" button -> Alert confirm -> optimistic removal. Hint shown when user has own messages. Backend tested (send->delete->verified gone); frontend renders fine.

## Session update (Jun 2026 fork) — Multiple Children feature (DONE)
- Parents can save multiple children (name + age) and pick who's attending each Kids class.
- Backend: user.children array [{child_id,name,age}]; endpoints GET/POST/PUT/DELETE /api/me/children (validation: name required, age 1-100, max 15); user_public returns children; BookingCreate.child_name added; booking doc stores child_name; receipt endpoint + admin/bookings return child_name.
- Frontend: NEW /app/frontend/app/children.tsx management screen (add/edit/delete, empty state) linked from Profile > MEMBERSHIP > 'My Children'. class/[id].tsx booking flow replaced single-age modal with a 'Who's attending?' child-picker: lists saved children (under-min disabled 'too young', over-max selectable w/ note), 'Add another child' inline form; api.createBooking now passes child_name.
- Receipt shows 'Attending: Name (age N)'; admin Bookings chip shows 'Name · age'.
- BUGFIX during build: selectChild/saveNewChild set React state then called proceedBooking in same tick -> stale closure sent child_name/child_age as undefined on UI bookings. Fixed with a childRef useRef that proceedBooking reads. Verified E2E by testing agent (iteration_21): POST body carries child fields; populated on admin row, admin chip, and receipt. Backend 13/13 pytest pass (test_children_feature.py).
- KNOWN pre-existing (NOT this feature, not fixed): pass-paid bookings may not set paid_with_pass on the booking row, so admin-cancel doesn't auto-refund a class pass (server.py ~5180). Flagged for later.

## Session update (Jun 2026 fork) — Kids QR Note: show attending child on check-in (DONE)
- Backend: POST /api/admin/checkin/scan now returns child_name + child_age in all success responses (checkin path: new + already-attended; classpass path: existing-booking-confirm). Pulled from the booking doc.
- Frontend admin/scan.tsx: scan result overlay shows a prominent "Attending: <name> · age N" badge (testID scan-child) so front desk can verify instantly.
- Frontend check-in.tsx (member QR): Booking type + myBookings now carry child_name/child_age; booking card shows an "Attending: Name · age N" row and the QR modal shows an "Attending: ..." chip above the QR (so staff can verify while looking at the phone).
- Verified: scan endpoint returns {child_name:'Bobby QRtest', child_age:9} for a kids booking (curl, class-day aligned). tsc clean; check-in screen smoke-tested. NOTE: admin camera scanner is native-only (can't be screenshotted in web preview) but data flow + result render logic verified.

## Session update (Jun 2026 fork) — Per-child booking for Kids classes (DONE)
- A parent with multiple saved children can now book EACH child into the SAME age-gated Kids class; the SAME child cannot be booked twice (once per child per class). Applies to all classes with min_age AND max_age set.
- Backend: BookingCreate.child_id added + stored on booking. Dedupe query in booking_create now adds child_id when present -> uniqueness key = (user_id, class_id, child_id). Pending same-child resumes; paid/confirmed same-child -> 409 "<Name> is already booked into this class."; different child allowed. Non-child classes keep per-user dedupe.
- Frontend class/[id].tsx: BOOK & PAY now ALWAYS opens the child picker for kids classes (removed childAgeNum===null gate) so a 2nd child can be booked. childRef carries child_id; selectChild(name,age,child_id); saveNewChild resolves the newly added child's id from addChild response. load() builds bookedChildKeys from myBookings (keys id:<child_id> and na:<name>|<age>) and the picker disables already-booked children (green 'already booked in this class' + checkmark). api.createBooking passes child_id.
- Verified: backend curl + testing agent (iteration_22, pytest 5/5) + frontend E2E (booked Alice then Bob into same Muay Thai class; Alice shown disabled 'already booked' on reopen; two distinct paid rows in admin bookings).
- STILL OUTSTANDING (pre-existing, flagged twice by testing agent): admin cancel of a pass-paid booking does NOT auto-refund the class pass (server.py ~5894). Not part of this feature.

## Session update (Jun 2026 fork) — Security audit fixes
- SEC-001 (MEDIUM, FIXED): email-link host-header cache poisoning. Added PUBLIC_APP_URL env (=https://class-notify-8.emergent.host); _public_base() now returns this trusted domain and IGNORES request Host/X-Forwarded-Host when set. Verified: forged host header no longer affects generated links. ACTION FOR DEPLOY: add PUBLIC_APP_URL to Deployment > Secrets.
- SEC-002 (LOW, FIXED): membership-application emails now esc() user input (full_name, phone, category, plan) in server.py membership email builder.
- CORS: left as safe default (wildcard + credentials disabled; bearer-token API). Locking to one origin would break preview/web; supported via CORS_ORIGINS env if ever needed.
- SEC-003 (LOW, DEFERRED - needs confirmation): registration account enumeration (409 'Email already registered'). Consulted auth playbook: a fully enumeration-safe fix requires a pending-registration model (no token on register; token only after OTP verify) + frontend rework. Not done to avoid breaking the LIVE register->auto-login flow. Register is already rate-limited (6/600s per IP+email). Recommend doing as a dedicated, tested change if desired.
- P3 (not changed): door-QR image via api.qrserver.com in emails (in-app QR already client-side rendered); unbounded leaderboard/members aggregations (to_list 5000/20000) - low risk, deferred to avoid data-truncation regressions.

## Session update (Jun 2026 fork) — SEC-003 Enumeration-safe signup (verify-then-login) (DONE)
- Reworked signup so it never reveals whether an email exists. /auth/register now validates input, then ALWAYS returns generic {pending:true,email} (200) — for existing emails it short-circuits (no pending, no code). New emails: stages a pending_registrations doc (hashed pw + profile, 24h TTL, unique index) + emails a verify code. NO account/token created at register.
- /auth/verify-otp: valid code => (a) legacy account: flip verified + return token; (b) new signup: create the real user from pending, clear pending, return {verified,token,user}. Token only minted after a valid OTP (no takeover). Wrong/missing code => generic 400 for everyone (no enumeration). /auth/resend-otp covers pending regs too, still {ok:true}.
- Frontend: AuthContext.registerEmail no longer sets token; new finishAuth(token,user). verify.tsx now stores the returned token and logs in, removed 'I'll verify later'/skip (verification is mandatory to finish signup), back button -> login, added note, resend cooldown aligned to 60s (starts on screen load), testID verify-later->verify-back.
- Verified: main-agent script (7 cases) + testing agent iteration_23 (backend 10/10 pytest test_verify_then_login_regression.py + full frontend journey incl. no-skip, back-to-login, wrong/correct code, admin login regression). PASS.
- DEPLOY: no new secrets needed for this; recall PUBLIC_APP_URL secret still needed for SEC-001 on prod.

## Session update (Jun 2026 fork) — Move "Ladder" from bottom tab to Quick Actions (DONE)
- Removed the Leaderboard ("Ladder", trophy) tab from the bottom tab bar in app/(tabs)/_layout.tsx (set options={{href:null}} so the route still exists but is hidden). Bottom bar now: Home, Classes, Notices, Inbox, Alerts, Profile.
- Added a "ladder" Quick Action to src/quickActions.ts (trophy icon, gold gradient, placed after academy => #7, within HOME_QUICK_COUNT=8 for new users; appended to 'More' for users with a saved order). Handler in home.tsx: router.navigate("/(tabs)/leaderboard").
- leaderboard.tsx ScreenHeader now shows a back chevron (fallback /(tabs)/home) since it's opened as a shortcut rather than a tab.
- Verified via screenshot: Ladder tile shows in Quick Actions, no Ladder in bottom bar, tapping opens Attendance Ladder with working back.

## Session update (Jun 2026 fork) — Class capacity hard-capped at 16 (DONE)
- Every class now has a MAXIMUM of 16 spots (appointments/PT stay at 1). Boot Camp included (user reversed the earlier 'unlimited' ask).
- Backend: MAX_CLASS_CAPACITY=16 constant. Admin create + update clamp capacity via min(body.capacity, 16). Seed template capacity=16. One-time migration capacity_policy_v2 caps any existing non-appointment class >16 to 16 (fixed the 3 Boot Camp classes from 999->16). Verified: all seeded classes (Muay Thai, Kickboxing, Boot Camp) = 16; create/update with 50/99 both clamp to 16.
- Frontend: admin editor default capacity 16, clamps input to 16, label 'Capacity (max 16)'. Reverted the temporary 'Open class'/>=500 unlimited display tweaks (no class exceeds 16 now).

## Session update (Jun 2026 fork) — Tab bar badges: Notices "new" badge (DONE)
- Bottom tab bar already showed unread counts on Inbox (messages) and Alerts (notifications). Added a matching "new" count badge on the Notices (events) tab.
- app/(tabs)/_layout.tsx refresh() now also fetches api.announcements() and counts those newer than the per-user baseline last_seen_notice_ts_<uid> (AsyncStorage/localStorage), same key the Home popup uses. Suppressed for admins. Badge styled like the others. Recomputed on 15s poll, app-foreground, and navigation (segments) changes.
- app/(tabs)/events.tsx now writes last_seen_notice_ts_<uid> = newest announcement ts on load/focus, so opening the Notices tab clears the badge.
- Verified via screenshots (member testmember@gmail.com): forcing baseline old -> Notices tab shows "3"; after opening Notices tab and navigating away -> badge cleared. Inbox/Alerts badges unaffected.

## Session update (Jun 2026 fork) — Boot Camp capacity 20 (others stay 16) (DONE)
- Boot Camp now allows up to 20 members; all other classes remain capped at 16 (appointments still 1).
- Backend: BOOTCAMP_CAPACITY=20 + helper _cap_limit(name) (20 for 'boot camp', else MAX_CLASS_CAPACITY=16). Admin create+update clamp via _cap_limit(body.name). Seed template Boot Camp=20. One-time migration capacity_policy_v3 bumped existing Boot Camp classes 16->20.
- Frontend admin editor: capacity clamp + 'Capacity (max N)' label now class-aware (20 for Boot Camp, 16 otherwise).
- Verified: seeded Boot Camp=20, Muay Thai/Kickboxing=16; create Boot Camp cap 50 -> 20, Kickboxing cap 50 -> 16. All 23 seeded classes intact.

## Session update (Jun 2026 fork) — Prominent "My Wallet" card on Home (DONE)
- Added a member-facing "My Wallet" card at the top of Home (below greeting), replacing reliance on the tiny header credit chip for discoverability (chip kept as quick glance).
- Shows Credit balance ($ from user.credit_cents) and Class passes (user.class_pass_credits) side-by-side with a "View" affordance + hint "Tap to top up, view history, or use credit & passes to book faster." Whole card taps to /credits. Hidden for admins.
- Added class_pass_credits to frontend User type. Verified via screenshot (member): card shows $0.00 credit + 0 passes, renders cleanly.

## Session update (Jun 2026 fork) — Reverted "My Wallet" home card
- Per user request, removed the "My Wallet" card + its styles from app/(tabs)/home.tsx. Home is back to prior layout (header wallet chip retained). class_pass_credits kept on frontend User type (harmless).

## Session update (Jun 2026 fork) — User's own MongoDB Atlas seeded
- User created their own Atlas cluster (cluster0.rb3hip8.mongodb.net) and allowlisted 0.0.0.0/0. Connection verified from preview.
- Seeded FRESH via server.seed_data() + seed_official_groups() pointed at Atlas (preview .env UNCHANGED): 2 admins (admin@ + info@maxenergy.com.au), 23 classes (Boot Camp 20, rest 16), 3 plans, 3 announcements, 3 events, Muay Thai Academy group, all indexes. Admin login verified against Atlas with existing ADMIN2_PASSWORD.
- REMAINING (user action): set MONGO_URL (+ DB_NAME=maxenergy_db) in Deployment Panel > Secrets and redeploy so the LIVE app uses Atlas. Recommend rotating the DB password afterwards (string was shared in chat) and updating the secret.

## Session update (Jun 2026 fork) — Group chat unsend fix + smoother chat (DONE)
- Fixed clipped Unsend button: previously the Swipeable container had maxWidth 82% + alignSelf which clipped the revealed action ("nsend" cut off). Rebuilt so the row is full-width (rowWrap) with the bubble aligned inside; the right action (unsendWrap+unsendAction width 84, alignSelf stretch) now reveals fully and is entirely tappable.
- Smoothness: swapped legacy Swipeable -> ReanimatedSwipeable (react-native-gesture-handler/ReanimatedSwipeable, 60fps via reanimated 4). Extracted a React.memo MessageRow so typing/new messages no longer re-render every bubble; unsend wrapped in useCallback. Tuned friction 1.6, rightThreshold 36, dragOffsetFromRightEdge 16.
- Verified via screenshots: chat renders, swipe reveals full Unsend button beside the bubble. Backend DELETE /api/groups/{gid}/messages/{id} previously verified. Cleaned test message.

## Session update (Jun 2026 fork) — Group chat: Edit message + Read receipts (DONE)
- EDIT: tap-and-hold (long-press, 300ms) your own group message -> Edit modal (prefilled TextInput, Save/Cancel). Backend PUT /api/groups/{gid}/messages/{gmsg_id} {body} — sender-only, non-system, sets edited_at. Edited messages show a small italic 'edited' tag. Optimistic local update + refetch on error.
- READ RECEIPTS: reuse existing per-message read_by[]. group_get computes seen_count (read_by excluding sender) + member_count per message and on group; group_send returns seen_count 0. Frontend shows a subtle right-aligned 'Seen by N' (or 'Sent' when 0) under the member's LAST own message only (keeps it clean).
- api.groupEditMessage added. Hint updated: 'Swipe left to unsend · hold your message to edit'.
- Verified: backend curl (edit body+edited_at, seen/member counts); screenshots (long-press opens Edit modal prefilled; 'Sent' receipt + hint render). Cleaned test messages.

## Session update (Jun 2026 fork) — Group chat: Reactions + Reply/Quote (DONE)
- Long-press ANY message now opens a bottom action sheet: reaction row (👍🔥😂❤️😮🙏) + Reply + Edit (own) + Unsend/Delete (own/admin). Replaces the old direct long-press-to-edit.
- REACTIONS: backend POST /api/groups/{gid}/messages/{gmsg_id}/react {emoji} toggles caller in msg.reactions[emoji] (ALLOWED_REACTIONS whitelist, 400 otherwise). _reactions_summary() -> [{emoji,count,mine}] returned by group_get/send/edit/react. Frontend shows tappable reaction chips under the bubble (tap chip to toggle); mine highlighted.
- REPLY: GroupSendReq adds reply_to_id; group_send stores reply_to snippet {gmsg_id,sender_name,body[:120]}. Compose shows a reply banner above input (cancel X); bubble renders a quoted reply block above the text. api.groupSend(body, replyToId), api.groupReact added.
- Verified: backend curl (reply snippet, react add/toggle/invalid 400) + screenshots (action sheet with reactions/Reply/Edit/Unsend; 🔥 chip applied). Cleaned test messages. Hint: 'Hold a message to react, reply or edit · swipe left to unsend'.

## Session update (Jun 2026 fork) — Group chat: Pin message + Typing indicator (DONE)
- PIN: admins/owners can Pin a message via the long-press action sheet -> stored on group_chats.pinned_msg {gmsg_id,sender_name,body[:200]}. Renders a "PINNED · <name>" bar at top (below the Group Rules bar) with an unpin X for mods. Endpoints POST /api/groups/{gid}/pin {gmsg_id} + /unpin (mod-only). group_get returns pinned_msg. NOTE: groups live in collection group_chats (not groups) — fixed initial wrong-collection bug.
- TYPING: POST /api/groups/{gid}/typing upserts group_typing {group_id,user_id,name,updated_at}; GET returns names updated within last 6s excluding self. Frontend pings (throttled 2.5s) on text change and polls every 3s while focused; shows 'X is typing…'/'A, B are typing…' above input.
- api.groupPin/groupUnpin/groupTyping/groupTypingGet added. Verified: backend curl (pin persists, unpin clears, typing excludes self) + screenshot (pinned bar renders w/ unpin X). Typing needs 2 members to see visibly.

## Session update (Jun 2026 fork) — Richer My Bookings + NEXT UP + online-dot fix + jump-to-pinned (DONE)
- BOOKINGS ENRICH: backend _enrich_bookings now also attaches spots_left/booked/capacity (live active-booking count per class) alongside trainer/duration_min/level/category. child_name/child_age already stored on the booking doc.
- MY BOOKINGS UI (frontend/app/bookings.tsx): each card shows meta chips — countdown ("Starts in X min/hrs", "Tomorrow", "In N days"), attending child (name + age), coach + duration, and spots ("N going" / "Only N spots left" / "Class full"). Soonest upcoming active (paid/confirmed) booking gets an orange "NEXT UP" ribbon (with countdown) + accent border; countdown chip hidden on that card to avoid duplication. Upcoming active bookings now sorted to the top (soonest first); rest keep recency order.
- ONLINE DOT FIX: group chat roster avatar removed overflow:hidden (moved borderRadius/overflow to rosterImg) so the green online dot is no longer clipped.
- JUMP TO PINNED: tapping the pinned-message bar (testID group-pinned-jump) scrolls the chat ScrollView to that message (row y tracked via onLayout) and briefly highlights it (~1.6s brandTertiary bg).
- Verified: testing_agent iteration_24 — all 5 items PASS (backend enrich curl + pytest test_bookings_enrichment.py; frontend NEXT UP ribbon/chips/single-ribbon, un-clipped dots, pinned-jump highlight). Test seed data cleaned up.

## Session update (Jun 2026) — Deployment fix + Security audit (DONE)
- DEPLOY (EAS Android build was failing): (1) .gitignore no longer excludes deploy-required env files (removed broad .env/.env.* rules; keep only *.local). (2) Removed DUPLICATE bare "expo-build-properties" plugin from frontend/app.json (kept the configured one). deployment_agent re-check = PASS, zero blockers. User must redeploy + regenerate Android build.
- SECURITY AUDIT (security_audit_agent): Verdict PASS — no Critical/High. LOW/P3 hardening only (secrets kept out of VCS, wildcard CORS default, 30-day signed PII download links). SEC-001/SEC-002 prior patches verified present.
- FIXED 2 real FUNCTIONAL bugs the audit surfaced in group chat routes:
  1. group_delete_message (unsend) had LOST its route decorator -> DELETE /api/groups/{gid}/messages/{gmsg_id} was unregistered (unsend broken). Added @api.delete(...). Verified live -> 200.
  2. Duplicate POST /api/groups/{gid}/pin: group_pin (pin a MESSAGE, {gmsg_id}) shadowed group_set_pin (set pinned NOTE, {note}) -> note endpoint unreachable/422. Moved note endpoint to POST /api/groups/{gid}/pin-note (backend + frontend api.ts groupSetPin, used by group/manage.tsx). Verified live -> correct owner-gated handler (403 owner-only, no collision).

## Session update (Jun 2026) — Gift Cards feature (DONE)
- NEW gift card system (Square-paid): buyer sends a gift card to a recipient by email; recipient redeems a unique code in-app to add account credit, or uses it in-store.
- Backend (server.py): gift_cards collection {code MEG-XXXX-XXXX, amount_cents, balance_cents, status active/redeemed, purchaser/recipient info, message, adjustments[]}. Endpoints: POST /api/giftcards/checkout (Square link, custom amount $10–$500), GET /api/giftcards/status/{sid} (returns code once paid), POST /api/giftcards/redeem (moves balance -> credit_cents + credit_ledger), GET /api/giftcards/mine, GET /api/admin/giftcards?q=, POST /api/admin/giftcards/adjust (set new balance for in-store use, logs adjustment). fulfill_giftcard_purchase hooked into sync_square_payment (kind=="giftcard"); emails recipient the code + buyer confirmation + admin notice.
- Frontend: NEW /app/frontend/app/gift-cards.tsx (member purchase w/ quick-picks $25/$50/$100/$150 + custom amount, recipient name/email/message, Square checkout + poll, success shows code; plus a Redeem-code section). NEW /app/frontend/app/admin/gift-cards.tsx (search by code/email, view balance & history, adjust balance for in-store use). Entry points: "Send a Gift Card" CTA on /memberships; "Gift Cards" tile on /admin dashboard. api.ts: giftcardCheckout/Status/Redeem/sMine + adminGiftcards/Adjust.
- Verified via curl: admin lookup, adjust ($50->$30 in-store), member redeem remaining ($30 -> credit), re-redeem blocked (409). Member + admin screens render.

## Session update (Jun 2026) — Gift card redeem brute-force lockout (DONE)
- Added lockout on POST /api/giftcards/redeem: after 3 wrong codes, the 4th wrong attempt locks the member out of redeeming for 15 minutes. Messages: "…2 attempts remaining", then "One more wrong attempt will lock…", then 429 "locked for 15 minutes". Successful redeem resets the counter. Backend helpers _giftcard_guard/_giftcard_register_fail/_giftcard_reset using giftcard_attempts collection (TTL index on expires_at). Fixed naive/aware datetime compare bug. Applies to both redeem entry points (Gift Cards screen + Wallet screen) since both hit the same endpoint. Frontend surfaces the server messages automatically.

## Session update (Jun 2026) — Android EAS build fix (dependency dedupe) + backend health endpoint (DONE)
- Added GET /health, /healthz (root app) and /api/health -> 200 {"status":"ok"} in backend/server.py so the K8s readiness probe stops 404ing.
- ROOT CAUSE of failing EAS Android app-bundle build: npx expo-doctor found a DUPLICATE native module (expo-constants 18.0.14 at root + 18.0.13 nested under expo-asset/expo-linking) — native builds allow only one copy per module. Fix: `npx expo install expo expo-constants expo-file-system` to align to SDK-expected versions (expo 54.0.37, expo-constants 18.0.14, expo-file-system 19.0.24) + added yarn `resolutions` for expo-constants(18.0.14) & expo-file-system(19.0.24) to collapse nested copies. expo-doctor now 18/18 PASS, no duplicates. App bundles & loads in preview. deployment_agent: PASS, zero blockers. NOTE: Metro dev-server prints a stale version-mismatch warning but on-disk root versions are correct and expo-doctor is clean.

## Session update (Jun 2026) — Gift cards in Profile + receipts (DONE)
- Added "Gift Cards" row under Profile > PAYMENTS (-> /gift-cards).
- Added "My gift cards" receipts section on /gift-cards using GET /api/giftcards/mine: Purchased list (code, amount, recipient, date, remaining balance + AVAILABLE/USED pill) and Redeemed-on-account list (code, amount added to credit, from purchaser, date, +amount). Auto-refreshes on focus and after purchase/redeem. Verified via API + screenshot.

## Session update (Jun 2026) — OUR GYM gallery refresh + Pass Refund verified (DONE)
- Replaced the 4 "gym floor" photos in the Home screen "OUR GYM" gallery with 4 new member-supplied interior shots (leg-press/RMC machines, treadmill/cardio row, wide floor "YOUR ONLY LIMIT IS YOU", weights machines by window). Saved as assets/images/ourgym1-4.webp; kept kickboxing + kids-class photos. Updated src/gymPhotos.ts gymPhotos[] only (gym1-4.jpg still used for service/hero images). Verified live via screenshot after login.
- Pass Refund on ADMIN class cancellation: VERIFIED already fully working (backend + frontend). POST /api/admin/classes/{id}/cancel with auto_return_passes (default true) returns 1 class pass per paid_with_pass booking, writes pass_ledger (+1), sets booking refund_status=pass_returned/refund_method=class_pass, and notifies the member their pass was returned. Frontend admin/classes.tsx cancel modal has an autoReturnPasses toggle and shows a toast "...N passes returned". End-to-end script test PASS: booked-with-pass (3->2) then admin cancel (2->3), booking refund_status=pass_returned. (Handoff had listed this as an open task, but it was already implemented in a prior session.)

## Session update (Jun 2026) — Walk-in QR: confirm repeat scans (DONE)
- Casual walk-in class-pass QR scans are now single-use per day by default. Flow on POST /api/admin/checkin/scan (typ=classpass, no booking today):
  1st scan → checks in + deducts 1 pass as before.
  Repeat scan same day (QLD day) → returns {needs_confirm:true, member_name, already_today, passes_left} WITHOUT deducting. Staff sees an amber "Already checked in today" overlay asking "Checking into another class, or bringing a friend/guest?" with "Yes — use another pass" / "No, cancel".
  Confirm → app re-calls scanCheckin(code, confirm=true) → deducts another pass, response class_name="Class Pass entry (#N today)", repeat_today=true.
- Backend: ScanCheckinReq gained confirm flag; counts today's pass_redemptions for the member; pass_redemptions rows tag repeat_today. Existing-booking-today path unchanged (still just confirms attendance, no pass). Frontend: app/admin/scan.tsx confirm overlay + confirmRepeat handler; src/api.ts scanCheckin(code, confirm?). Verified via end-to-end script (1st deducts, 2nd asks, confirm deducts, 3rd asks again). NOTE: camera scanning only testable on a real phone/dev build, not web preview.

## Session update (Jun 2026) — Admin "Today's Check-Ins" report (DONE)
- New admin tile "Today's Check-Ins" (/admin/checkins) + endpoint GET /api/admin/checkins/today. Shows the current Queensland day's date, 3 stat boxes (CHECK-INS, PASSES USED, MEMBERS) and a simple list of everyone who checked in today. Each row: member name, what they came for (class name / "Class Pass entry (walk-in)" + child name if any), time + how checked in (QR/Staff/Member), and a "1 pass" pill or "no pass". Walk-in entries use an orange walk icon; booking check-ins a green tick. Pull-to-refresh + QR-scan shortcut in header.
- Data sources merged: attended bookings (checked_in_at today) + casual walk-in pass_redemptions today. passes_used = walk-ins + attended bookings that were paid_with_pass. Verified via API (200, correct totals) and screenshot.
- Also removed leftover "TEST Refund Class" test data from the DB that had appeared in the timetable.

## Session update (Jun 2026) — Home "Class Pass" quick button (DONE)
- Added a second orange pill button "Class Pass" (ticket icon) stacked directly below the member's "My Check-In QR" button on the Home header (app/(tabs)/home.tsx, testID home-member-classpass). Routes to /credits (My Wallet), which shows Class Pass Credits + the "Class Pass Entry" QR (QR renders once the member owns ≥1 pass) so members can pull up their walk-in pass QR in one tap. Both member buttons now wrapped in memberQrCol (right-aligned, gap). Verified via screenshots (button visible + navigation to wallet).

## Session update (Jun 2026) — Class Pass button → full-screen QR shortcut (DONE)
- Home "Class Pass" button (home-member-classpass) now calls api.classPassQr() on tap: if the member holds ≥1 pass it opens a full-screen "Class Pass Entry" QR modal right there (240px QR, brand card, DONE button); if they have 0 passes it falls back to routing to /credits (to buy). Button shows a spinner while fetching. New state passQr/passQrLoading + openClassPass() + cp* modal styles in app/(tabs)/home.tsx; imported react-native-qrcode-svg. Verified via screenshot (5 passes → big QR shows instantly).

## Session update (Jun 2026) — Passes-left on the full-screen Class Pass QR (DONE)
- The home Class Pass full-screen QR modal now shows a brand pill "N passes left" (from api.classPassQr class_pass_credits) between the subtitle and the QR. New passQrCount state set in openClassPass(); cpCountPill/cpCountText styles in app/(tabs)/home.tsx. Verified via screenshot ("5 passes left").

## Session update (Jun 2026) — Class Pass button restyled green (DONE)
- Home "Class Pass" button restyled to a green LinearGradient pill (#22C55E→#059669) with a soft green glow/shadow + white ticket icon/text, to stand out from the orange "My Check-In QR" button. New classPassBtn/classPassText styles in app/(tabs)/home.tsx. Verified via screenshot.

## Session update (Jun 2026) — Removed "Class Check-In" quick action (DONE)
- Removed the "checkin" (Class Check-In) tile from QUICK_ACTIONS_META in src/quickActions.ts, so it no longer shows on the Home Quick Actions grid or the Customize screen. orderKeys() filters out keys not in allKeys, so any saved preferences that still list "checkin" simply drop it. (The /check-in screen and the "My Check-In QR" home button remain.)

## Session update (Jun 2026) — Square double-charge protection (DONE)
- Root cause: every /payments/checkout, /store/checkout, /giftcards/checkout call created a NEW Square payment link (fresh idempotency_key), so a page refresh / double-tap could create a 2nd order = 2nd charge.
- Fix (per integration_expert Square playbook): checkout endpoints now REUSE an existing still-OPEN Square checkout instead of creating a new order.
  - New helper _reuse_open_square_checkout(match): finds the most recent OPEN square payment_transaction (with stored checkout_url), reconciles it via sync_square_payment, and returns (reuse_url, session_id, paid_tx).
  - Bookings: match on booking_id+user+credit_applied_cents. If pending order exists → return SAME url (reused:true); if it was actually already paid → return {already_paid:true} and settle (no recharge). Stable idempotency_key co_{booking_id}_{amount}. checkout_url now stored on the tx.
  - Store & gift cards: match on user+kind+amount(+product/recipient) within the last 30 min → reuse the same OPEN link. checkout_url stored on tx.
  - sync_square_payment now claims the paid→fulfill transition ATOMICALLY (update guarded by payment_status != paid, act only if modified_count==1) so concurrent polling can't fulfill/credit/mark-paid twice.
- Frontend class/[id].tsx handles new {already_paid:true} response → routes to receipt with "already paid" message.
- Verified: calling /payments/checkout 3x for one booking returns the SAME session_id/url and creates exactly ONE Square order (PASS). Gift card/store use identical pattern.

## Session update (Jun 2026) — Automatic payment receipt email (DONE)
- New send_payment_receipt(tx) helper emails the member a clean itemised "Payment Receipt 🧾" after every successful Square CARD payment, across all kinds (class bookings, store passes/memberships, gift cards). Called from sync_square_payment inside the atomic paid-claim block (so it fires exactly once, alongside fulfillment). Idempotent via a receipt_sent flag claimed atomically.
- Receipt contents: receipt no. (booking/order ref), date/time, billed-to name+email, item description (class name / product+key tag / "Gift Card ($X)"), amount paid on card, account credit applied (if any) + total value, payment method "Card (Square)", and business/GST footer (GYM_INFO name+address). Only sends when card_cents > 0 — pass/credit-only payments don't get a card receipt (they still get their existing confirmation email).
- Verified via unit test (monkeypatched send_email): sends once with correct $20 card + $5 credit lines, 2nd call is a no-op, credit-only payment sends nothing.

## Session update (Jun 2026) — Removed 1 OUR GYM gallery photo (DONE)
- Removed kickbox2.webp (was photo 6/9) from the gymPhotos array in src/gymPhotos.ts at the user's request. Gallery now has 8 photos (ourgym1-4, kickbox1, kids1-3). File kept on disk, just unlinked from the array.

## Session update (Jun 2026) — Admin-managed OUR GYM gallery (add/remove, no redeploy) (DONE)
- Gallery is now DB-driven so admins can add/remove photos in-app without an app update.
- Backend: new gym_photos collection {photo_id, image(data URI), sort, created_by, created_at}.
  - GET /api/gym/photos (public) → ordered photos; empty ⇒ app uses bundled defaults.
  - POST /api/admin/gym/photos {image dataURI} (admin) → downscales+compresses via Pillow helper _process_gallery_image (max width 1280, JPEG q72; honours EXIF orientation) so payloads stay ~150-220KB; appends at next sort.
  - DELETE /api/admin/gym/photos/{photo_id} (admin).
  - Startup seed: if gym_photos empty, seeds the 8 current bundled files (ourgym1-4, kickbox1, kids1-3) as compressed data URIs so admins start with the existing gallery. Logged "gym gallery seeded -> 8 photos".
- Frontend: src/useGymGallery.ts hook (fetches remote photos on focus; falls back to bundled gymPhotos). Home OUR GYM gallery + lightbox and About "INSIDE OUR GYM" now use the hook. New admin screen app/admin/gym-photos.tsx (2-col grid, ADD A PHOTO via expo-image-picker base64 q0.7, per-photo delete with confirm). Admin dashboard tile "Gym Gallery Photos". api.ts: gymGalleryPhotos/adminAddGymPhoto/adminDeleteGymPhoto.
- Verified: seed=8, add real jpg→9, delete→8 (200s); admin screen renders 2-col grid with delete buttons. NOTE: images stored base64-in-Mongo (matches existing avatar pattern; no object storage configured). Deployed app needs a redeploy to get this code, but photo content changes thereafter need NO redeploy.

## Session update (Jun 2026) — Drag-to-reorder gym gallery photos (DONE)
- Admin Gym Gallery Photos screen (app/admin/gym-photos.tsx) rebuilt as a single-column DraggableFlatList (react-native-draggable-flatlist@4.0.3, installed via yarn expo install; works with the app's reanimated 4 / New Arch). Each row: drag handle (long-press ≥150ms), position number, thumbnail, delete. onDragEnd persists the new order via POST /api/admin/gym/photos/reorder {order:[ids]} which rewrites sort=index+1. Header shows a spinner while saving order.
- Backend: added GymReorderReq + /admin/gym/photos/reorder; api.ts adminReorderGymPhotos. Verified: reverse order applied + restored (200). Home/About galleries already read ordered list via useGymGallery. NOTE: drag gesture only fully testable on device/Expo Go (renders fine on web). Root already wraps GestureHandlerRootView.

## Session update (Jun 2026) — Gym gallery photo captions (DONE)
- Each OUR GYM gallery photo can now have an optional short caption (max 120 chars).
- Backend: gym_photos.caption field; GET /gym/photos returns caption; POST add accepts optional caption; new PATCH /admin/gym/photos/{id} {caption}. api.ts adminSetGymCaption.
- Admin screen: each draggable card now has a caption TextInput under the thumbnail; saves on blur/submit via PATCH.
- Display: useGymGallery now returns {source, caption} items. Home OUR GYM horizontal gallery shows caption under each thumbnail and centered in the fullscreen lightbox; About "INSIDE OUR GYM" shows caption under each photo. Verified via API (patch/list) + screenshots (admin inputs + home captions). Demo captions cleared after test.

## Session update (Jun 2026) — Multi-image gallery upload + progress % (DONE)
- Admin Gym Gallery Photos "ADD PHOTOS" now uses ImagePicker.launchImageLibraryAsync({allowsMultipleSelection:true, selectionLimit:20}). Selected images upload sequentially via existing POST /api/admin/gym/photos (one per call); a progress state {done,total} drives the button label "UPLOADING x/y · NN%" and a brand progress bar under the button. Failures are counted and summarised in an alert; gallery reloads on completion. Frontend-only change (app/admin/gym-photos.tsx). NOTE: multi-select picker + live progress only fully testable on a real device/Expo Go (web picker is single-file).

## Session update (Jun 2026) — "Message Us" button on Contact & Gym Info (DONE)
- Added a primary "MESSAGE US" button (chatbubbles icon) on app/contact.tsx that routes to /chat/gym (the existing in-app "Maxenergy Team" support conversation). "OPEN IN MAPS" restyled to an outline button below it to keep hierarchy clear. Verified: button renders and opens the support chat screen.

## Session update (Jun 2026) — Support quick links on key screens (DONE)
- New reusable component src/components/MessageUsLink.tsx (chatbubbles pill → router.push("/chat/gym"), customisable label). Added to: app/bookings.tsx ("Need help? Message us"), app/memberships.tsx ("Questions about memberships? Message us"), app/credits.tsx wallet ("Questions about credit? Message us"). Verified on Bookings via screenshot. Contact screen MESSAGE US button already added previously.

## Session update (Jun 2026) — Low class-pass nudge on Home (DONE)
- Home now shows a gentle banner (testID home-lowpass-banner) when a member has exactly 1 class pass left: "You're on your last class pass — Tap to top up so you don't miss your next session". Tapping opens /memberships; a × dismisses it for the session (reappears next open). Fetched fresh via api.myCredits() on focus (passCount state). Only shows for non-admins and only at count===1 (avoids nagging members on memberships or with 0/never-bought passes). Verified via screenshot.

## Session update (Jun 2026) — Moved MESSAGE US to top of Contact (DONE)
- On app/contact.tsx, the MESSAGE US button now sits directly under the gym name/tagline (above the phone/email/address rows). Removed the duplicate lower instance; OPEN IN MAPS outline button remains at the bottom. Verified via screenshot.

## Session update (Jun 2026) — Admin login fix: password authoritative from secret (DONE)
- Issue: "invalid credentials" for info@maxenergy.com.au / Maxenergy12@ on the LIVE app. Root cause: prod DB seeded the admin with the ADMIN2_PASSWORD deployment secret; the old seed "never overwrote password", so Maxenergy12@ (only in preview DB) didn't apply to prod. Preview login worked fine.
- Fix (user chose option 2b): seed_data now makes the info@ admin password AUTHORITATIVE — on every startup it sets is_admin=true, verified=true, and password_hash=hash(ADMIN2_PASSWORD). Preview backend/.env ADMIN2_PASSWORD changed to "Maxenergy12@". Verified: Maxenergy12@ → 200 admin, old pass → 401; log "second admin password synced to ADMIN2_PASSWORD secret".
- ACTION FOR USER on production: set the ADMIN2_PASSWORD deployment secret to Maxenergy12@ (via Support/secrets store) then redeploy; the seed will overwrite the live admin hash to match. Caveat: since the password re-syncs from the secret on each deploy, changing it in-app later would be reset by a redeploy.

## Session update (Jun 2026) — Membership form PDF: photo/signature overlapping footer FIXED (DONE)
- Bug: on the generated Membership Registration Form PDF, the PHOTO & SIGNATURE block (120pt boxes + "Signed" line) collided with the page footer because it only reserved ensure(180) of space. Photo/signature appeared behind the "Confidential"/footer text.
- Fix in build_membership_pdf: reserve ensure(270) before the Photo & Signature section so it moves to a fresh page when there isn't enough room. Verified via pdftoppm render: block now sits cleanly at the top of its page, photo + signature + "Signed: <name>" + date all render above the footer.
- Also made GET /api/membership/forms/{id}.pdf REGENERATE the PDF fresh from stored application data on each download (fallback to stored blob on error), so ALL existing forms render with the corrected layout after redeploy — no manual regeneration needed on production. Regenerated all 21 preview PDFs too.
- NOTE (production): this is code — user must redeploy for the live app's forms to pick up the fix.

## Session update (Jun 2026) — Class reminder emails arriving late FIXED (DONE)
- Symptom: 1-hour class reminder arrived ~31 min before instead of 60 min before (e.g. 5:31pm for a 6:00pm class).
- Root cause: send_due_reminders scanned up to 2000 bookings with per-booking sequential class+user lookups (N+1), and the loop also ran send_streak_reminders (loads 40,000 bookings) + trial follow-ups every cycle before sleeping 900s. On the remote/production DB each cycle took minutes, so the effective reminder latency drifted well past the intended 1-hour mark; loop granularity was also only 15 min.
- Fix: rewrote send_due_reminders to (1) query only upcoming non-appointment classes in the next 12h (naive QLD range on start_at), (2) batch-load their bookings, (3) batch-load members — a few queries total instead of thousands. reminder_loop now runs class reminders every 5 min (was 15), and runs the heavy streak/trial scans only every ~30 min (tick%6) so they never delay class reminders. Logic (per-member lead 1/3/12h, once via reminder_sent) unchanged.
- Verified: class 50 min out (member lead=1h) → reminder sent; class 5h out → not sent.
- NOTE: per-member reminder lead time is set in Profile (1h/3h/12h; default 3h). Production needs a redeploy to apply.

## Session update (Jun 2026) — Collapse Wallet history behind "Show more" (DONE)
- app/credits.tsx: CLASS PASS HISTORY and CREDIT HISTORY now show only the first 4 rows with a "Show N more"/"Show less" toggle (showAllPasses/showAllCredits state, testIDs pass-show-more / credit-show-more, showMore styles). Verified via screenshots (collapsed 4 + "Show 5 more" → expands to full list). NOTE: production needs redeploy.

## Session update (Jun 2026) — Emergent-managed Push Notifications (BUILT; needs google-services.json + build)
- Integration per Emergent push playbook. Backend: httpx _push_client to integrations.emergentagent.com with X-Push-Key=EMERGENT_PUSH_KEY (added to backend/.env as "placeholder" — DO NOT edit; deployment pipeline sets the real value). Endpoints: POST /api/register-push (RegisterPushBody user_id/platform/device_token → relay /push/users/register). Helper send_push(recipients, data{title,message,action_url}, idempotency_key) → relay /push/trigger, chunks of 100, never raises.
- Triggers wired: class reminder (send_due_reminders, action_url /bookings), waitlist spot-opened (action_url /timetable), member DM new message (action_url /inbox).
- Frontend: expo-notifications + expo-device installed. src/push.ts registerForPush(user_id) (native only, requests perms, getDevicePushTokenAsync → POST /api/register-push). AuthContext calls it whenever user.user_id set. app/_layout.tsx: setNotificationHandler (foreground banners), Android "default" channel, response listener + cold-start getLastNotificationResponseAsync (guarded to native) routing to data.action_url via router.push. app.json: added expo-notifications plugin (color #FF7A00) + android.googleServicesFile "./google-services.json".
- STATUS: register-push returns 500 locally (key=placeholder) — expected; works after deploy. Push CANNOT be tested in Expo Go/web — requires a real iOS/Android build + user-provided google-services.json. Verified app still loads on web (no crash) after guarding notification APIs.
- ACTION NEEDED FROM USER: provide google-services.json (Firebase console) placed at /app/frontend/google-services.json, then deploy + build.

## Session update (Jun 2026) — iOS Push wired (DONE, pending APNs key + build)
- Received user's GoogleService-Info.plist (project maxenergy-fitness, BUNDLE_ID com.emergent.classnotify.hl9igt ✓). Placed at /app/frontend/GoogleService-Info.plist (not gitignored) and added ios.googleServicesFile "./GoogleService-Info.plist" to app.json (android.googleServicesFile already set). app.json valid; Metro restarts clean.
- iOS push code already handled (registerForPush cross-platform, platform:"ios" device token). Remaining user step: ensure APNs .p8 key is uploaded to Firebase → Cloud Messaging → Apple app configuration (Key ID + Team ID), then Publish + generate iOS build. Push not testable in Expo Go/web.

## Session update (Jun 2026) — Sign in with Apple (P0, DONE — pending iOS build for live test)
- App Store readiness review flagged that because Google Auth is offered, "Sign in with Apple" is REQUIRED (Guideline 4.8 / 5.1.1v). Implemented end-to-end.
- Backend (/app/backend/server.py): new POST /api/auth/apple — verifies the native identity token against Apple JWKS (RS256, issuer https://appleid.apple.com, audience from APPLE_AUDIENCES). Keys user on apple_sub; upserts (matches existing by apple_sub or email; persists name/email on first sign-in only). Issues a 7-day user_sessions token (same session model as Google). Added AppleAuthReq model, APPLE_AUDIENCES env parse, sparse-unique index on users.apple_sub. backend/.env: APPLE_AUDIENCES="com.emergent.classnotify.hl9igt,host.exp.Exponent".
- Frontend: installed expo-apple-authentication; app.json ios.usesAppleSignIn=true + "expo-apple-authentication" plugin. Login screen (app/(auth)/login.tsx) renders the native AppleAuthenticationButton BELOW the Google button, gated by Platform.OS==='ios' && isAvailableAsync() (hidden on web/Android). AuthContext.applyAppleAuth + api.appleAuth added. Account deletion already wipes user_sessions (App Store in-app deletion covered).
- Testing: testing_agent iteration_25 — 23/23 backend tests PASS (invalid token -> 401, missing -> 422, no 5xx; all existing auth + regression endpoints green). Native Apple button can only be validated on a compiled iOS build (NOT Expo Go/web).

## Session update (Jun 2026) — Under-13 messaging gate, DOB prompt, public Privacy URL, App Review login
- Under-13 messaging block: users under 13 cannot send/react in group chats, member DMs, or gym support chat. Server-enforced via require_messaging_age() on POST /messages, /dm/{id}, /groups/{gid}/messages, /groups/{gid}/messages/{gmsg_id}/react (403 with friendly message). Age computed from users.date_of_birth; unknown DOB (social sign-ins) is allowed. Frontend: user_public exposes can_message; chat screens render <ChatAgeGate/> (src/components/ChatAgeGate.tsx) in place of the input when can_message is false. MIN_MESSAGING_AGE=13.
- One-time DOB prompt for social sign-ins: user_public exposes needs_dob (true when no date_of_birth). PUT /api/me/date-of-birth validates + saves DOB. Frontend DobGateModal (src/components/DobGateModal.tsx) mounted in (tabs)/_layout.tsx shows a non-dismissable wheel picker when needs_dob; on save calls refresh(). Home WelcomeTour + NoticePopup are deferred while needs_dob so the DOB gate takes priority.
- Public Privacy Policy web page: GET /privacy and GET /api/privacy return full HTML policy (mirrors app/privacy.tsx). App Store URL: https://class-notify-8.emergent.host/api/privacy (live after redeploy). In-app screen unchanged at /privacy route.
- App Store encryption: added ITSAppUsesNonExemptEncryption:false to app.json ios.infoPlist (skips export-compliance prompt on future builds).
- App Review demo account (auto-seeded, idempotent): appstore.review@maxenergy.com.au / AppReview2026! — regular verified member, 10 class passes, DOB 1990-01-01 (so no DOB prompt for reviewers).

## Session update (Jun 2026) — Security audit fixes
- Ran read-only security audit (verdict: conditional pass). Core auth/authz/payment/injection controls sound. Fixed:
  - [HIGH SEC-001] Apple Sign-In account-takeover: /api/auth/apple now links accounts ONLY via Apple-signed claims (sub, and email only when email_verified). Client-supplied body.email is never used for lookup/linking or stored as identity. (server.py ~1517-1555)
  - [P3] DOB set-once: PUT /api/me/date-of-birth now rejects changes if date_of_birth already set, so the under-13 messaging gate can't be self-lifted. (server.py ~1711)
  - [P3] CSV formula injection: admin member export neutralises cells starting with = + - @ / tab / CR via _csv_safe(). (server.py ~6865)
- Remaining accepted P3 (low risk, not fixed): CORS wildcard default when CORS_ORIGINS unset (bearer-token API, no cookies), forgot-password provider disclosure (google:true), static admin creds in .env force-synced on boot, review demo account static password. Advise rotating secrets + setting CORS allowlist for production.

## Session update (Jun 2026) — Member Bug Report / Feedback feature
- Members: Profile → "Report a Bug" (app/report-bug.tsx). Message textarea + optional screenshot (reuses PhotoCapture, base64 data URI). Sends platform + app version. Success screen with "Report another".
- Backend (server.py ~1733): POST /api/bug-reports (require_user) — validates message (>=5 chars, <=4000 truncated), caps screenshot at 3,000,000 chars, stores in bug_reports collection {report_id,user_id,user_name,user_email,message,screenshot,platform,app_version,status:open,created_at}, emails GYM_ADMIN_EMAIL (screenshot attached) via asyncio.create_task (non-blocking so submit returns instantly). GET /api/admin/bug-reports (require_admin) -> {reports, open_count}. PUT /api/admin/bug-reports/{id} (require_admin) status open|resolved. /api/admin/overview now returns bug_reports_open.
- Admin: Admin Dashboard → "Bug Reports" card with open-count badge (app/admin/bug-reports.tsx). Lists reports with status chip, screenshot thumbnail + lightbox, Mark resolved/Reopen.
- Tested: testing_agent iteration_26 backend 15/15 PASS (auth 401, non-admin 403, validation, oversized screenshot 400, invalid status 400, unknown id 404, overview count delta). Both screens verified via screenshot. Email dispatch moved to background per tester perf note (submit now ~33ms).

## Session update (Jun 2026) — Block email reuse across providers (register)
- Problem: users signing up via email/password with an email that already had a Google/Apple (or password) account got NO verification code and no message — the old code was "enumeration-safe" and silently returned pending:true without sending a code, leaving them stuck (reported for scottcarman69@gmail.com on TestFlight).
- Fix (server.py auth/register ~1399): if an account already exists for the email, return HTTP 409 with a clear, provider-specific message: password -> "log in / forgot password"; google -> "Continue with Google"; apple -> "Sign in with Apple". Register screen already surfaces the error and no longer advances to the OTP screen. Product decision: this intentionally reveals email existence at registration (accepted tradeoff for UX).
- Verified: brand-new email -> 200 pending; existing password/google/apple emails -> 409 with correct message.
- SEPARATE production issue observed: Emergent email service returning 429 "email rate limit exceeded" (tripped by heavy preview testing today). OTP codes are generated but email delivery throttled. Advise: wait + Resend, or sign in with the original Google/Apple method; escalate to support if production email persistently fails.

## Session update (Jun 2026) — Recurring weekly schedule + Schedule Exceptions (Closed Dates)
- Classes now REPEAT WEEKLY across a rolling 12 months, generated from templates (no hundreds of duplicate records). Collections: `class_templates` (weekly schedule, seeded from CLASS_TEMPLATES; 7 slots) and `schedule_exceptions`. Old dated `classes` cleaned on migration (booked kept). `classes` now stores appointment classes + materialized instances only.
- Backend (server.py): helpers _make_template_id, _active_exceptions, _is_blocked, _instance_from_template, _generate_instances, _resolve_class, _materialize_class. Virtual instance id = `{template_id}__YYYY-MM-DD`. GET /classes?days=N generates instances (default 60; timetable passes 365) applying exceptions. GET /classes/{id} resolves virtual (404 if blocked or weekday mismatch). POST /bookings materializes real class doc on first booking so bookings/cancel/passes/QR/stats work unchanged.
- Schedule exceptions: single date or range, scope all|selected (by categories and/or class_names), active toggle, label. Applied at generation + booking. Seeded QLD 2026 school holidays (4 ranges) targeting category 'Kids' (Kids Muay Thai hidden during holidays; Adults unaffected). Editable each year.
- Admin: /api/admin/classes now returns recurring templates (is_template, weekday, start_time, computed next start_at) + appointment classes. Create/update/delete operate on class_templates (weekday+hour derived from start_at or weekday+start_time). /admin/classes/{tmpl_id}/cancel -> 400 (use exceptions/delete). New admin CRUD: GET/POST/PUT/DELETE /api/admin/schedule-exceptions. New admin screen app/admin/schedule-exceptions.tsx + dashboard card "Closed Dates / Exceptions".
- Frontend: timetable fetches 365 days, day scroller extended to 365 days (rolling year). api.ts: classes(days), scheduleExceptions/create/update/deleteException.
- Tested: testing_agent iteration_27 backend 17/17 PASS. Timetable + exceptions screens verified via screenshot. Hardened _resolve_class to reject dates whose weekday != template weekday.

## Session update (Jun 2026) — "On break / Book next term" prompts
- New GET /api/schedule/breaks: returns classes currently inside an active exception window (today), each with reason label, `until`, `resumes_on` (first non-blocked weekly occurrence after the break, respecting ALL active exceptions), resumes_label, and resumes_class_id (virtual id for the next class back).
- New component src/components/ScheduleBreaksBanner.tsx shows a card "<Class> is on a break · <reason> · resumes <date>" + "Book next term" button → router.push(`/class/{resumes_class_id}`) (class detail resolves virtual instance → bookable). Mounted on Timetable (ListHeader) and Home (above UP NEXT). Works for ANY hidden class, not just Kids. Returns null when no active breaks.
- Verified via temp break: banner renders on Home + Timetable; resume date correctly computed (Wed 7 Oct, skipping real Term-3 holiday). Kids Muay Thai label derived as category+name for Kids programs.

## Session update (Jun 2026) — Waitlist Next Term + Timetable month labels
- Demand-interest waitlist: GET /api/schedule/breaks now includes interest_count + mine (optional auth via Authorization header). POST /api/schedule/breaks/interest {class_id} (materializes class, upserts term_interest), DELETE /api/schedule/breaks/interest/{class_id}. Banner shows a "Waitlist"/"On the list" toggle button next to "Book next term" and "N interested" count so admins gauge demand. New collection: term_interest {class_id,user_id,user_name,user_email,created_at}.
- Timetable month labels: month+year header above the day strip reflecting the selected day; each chip shows a small month tick (e.g. "SEPT"/"OCT") at the first day of a new month, so scrolling the rolling year is easy to navigate.
- Verified: interest join/leave counts correct; screenshot confirms month header + both banner buttons.

## Session update (Jun 2026) — Admin interest list + Notify on return
- GET /api/admin/term-interest: groups term_interest by class_id, resolves class label/return date, returns members [{name,email}] + count. New admin screen app/admin/term-interest.tsx (expandable member list + "Notify all"). Dashboard card "Class Interest / Waitlist".
- POST /api/admin/term-interest/{class_id}/notify: sends in-app notification (create_notification, nav to /class/{id}) + best-effort push (send_push) to all interested users ("<Class> is back! ... book your spot"), then clears that class's interest list so no double-messaging.
- Verified: list shows waiting members; notify delivers notification ("Kids Muay Thai is back!") and empties the list.

## Session update (Jun 2026) — Class images
- Recurring-template migration had reset class images to stock. Set Kids Muay Thai image to uploaded "kids class pic1" in DB (class_templates) AND in CLASS_TEMPLATES seed constant (server.py ~8058) so it persists on future deploys. Adults Muay Thai left on stock (awaiting user-provided photo). Admin class editor image field also updates templates.

## Session update (Jun 2026) — Removed duplicate appointment classes
- Personal Training + Custom Programs were duplicated: their seed inserts sat inside the class_templates seed block and re-ran during the recurring migration. Made both inserts idempotent (guard: skip if a by_appointment class of that name exists) and deleted the duplicate records (kept originals; dups had no bookings).

## Session update (Jun 2026) — Adults Muay Thai photo slideshow
- Stored 3 uploaded team photos (AdultsThai1/2/3.webp) as `images[]` on the Adults Muay Thai template. First photo also set as single `image` fallback. Applied in CLASS_TEMPLATES seed constant (ADULT_MUAY_THAI_IMAGES) AND via an idempotent startup update to class_templates so it survives redeploys and updates the live DB.
- Backend `_instance_from_template` now copies `images` into virtual class instances; `GET /api/classes/{id}` returns the array.
- Frontend app/class/[id].tsx: hero image auto-rotates through `images` every 3.5s (expo-image fade transition) with pagination dots (top-right); falls back to single `image` for all other classes (dots hidden when <=1 image).
- Verified: DB has 3 images; detail endpoint returns 3; screenshots confirm rotation (AdultsThai1 → AdultsThai2) with dots.

## Session update (Jun 2026) — Kickboxing photo
- Set Kickboxing class image to uploaded team photo (kickboxing3.webp) in CLASS_TEMPLATES seed constant AND via idempotent startup update to class_templates (name=Kickboxing). Shows on home hero carousel ("UP NEXT") and class detail. Verified on home page screenshot.

## Session update (Jun 2026) — Kids Muay Thai photo update
- Replaced Kids Muay Thai class image with new uploaded class photo (kidspic1.webp) in CLASS_TEMPLATES seed constant AND idempotent startup update (name=Muay Thai, category=Kids). Shows on home hero carousel + class detail. Verified DB updated.

## Session update (Jun 2026) — Boot Camp photo update
- Replaced Boot Camp class image with uploaded battle-ropes photo (Bootcamp.webp) in CLASS_TEMPLATES seed constant AND idempotent startup update (name=Boot Camp). Shows on home hero carousel + class detail. Verified DB updated.

## Session update (Jun 2026) — Fix Square checkout "refused to connect" on web
- Root cause: Expo web runs inside the Emergent preview iframe. Square's hosted checkout (sandbox.square.link → redirects to connect.squareupsandbox.com) sends X-Frame-Options/CSP that refuse framing, so the previous `window.location.href = url` (navigating the iframe) showed "refused to connect".
- Fix: on web, open the Square checkout in a new top-level tab via `window.open(url, "_blank")`, with fallback to `(window.top||window).location.href` if a popup is blocked. Applied in class/[id].tsx, gift-cards.tsx, memberships.tsx. Native (WebBrowser.openBrowserAsync) path unchanged.
- Verified: gift-card buy on web now calls window.open with https://sandbox.square.link/... (new tab) instead of navigating the iframe.

## Session update (Jun 2026) — Self-heal duplicate appointment classes
- Reported: production/TestFlight DB shows duplicate by-appointment "Personal Training" & "Custom Programs" on the schedule (preview DB was clean). Existing insert guards are idempotent, so dups predate the fix.
- Added an UNCONDITIONAL startup dedupe in seed_data(): for each of Personal Training / Custom Programs, keep the record with active bookings (else oldest by created_at) and delete only extras that have NO bookings. Runs every startup so production self-heals on redeploy.
- Verified in preview DB: injected 2 dupes each → after restart only the original remained (logs: "deduped ... removed 2").
- NOTE: production only cleans up after the user redeploys.

## Session update (Jun 2026) — Dedupe appointment classes now re-points bookings
- Strengthened the startup dedupe: for Personal Training / Custom Programs it now re-points any bookings on the extra record onto the survivor (kept = one with bookings else oldest), then deletes ALL extras unconditionally → always collapses to a single record without losing bookings. Previous version left an extra if it had a booking.
- Verified in preview: injected a 2nd Custom Programs WITH an active booking → after restart only 1 remained and the booking was re-pointed to the survivor.
- Immediate no-redeploy fix for admins: Admin → Manage Classes → tap the delete (trash) icon on the duplicate Custom Programs (adminc-del-<class_id>). adminDeleteClass endpoint handles it live.

## Session update (Jun 2026) — Notifications card layout (title truncation)
- Notification titles (e.g. "Session request received", "New session request") were truncating with "…" because the title shared one row with the long timestamp (space-between, title numberOfLines=1).
- Redesigned app/(tabs)/alerts.tsx card: title now spans full width up to 2 lines; timestamp moved to a clean footer row (right) alongside the "Tap to view details ›" link (left). Removed unused rowTop style + duplicate tapHint key.
- Verified via seeded sample notifications: full titles now visible, footer shows time + tap hint.

## Session update (Jun 2026) — Clear Alerts badge on open
- Requested: opening the Notifications screen should clear the unread count shown on the Alerts (bell) tab.
- app/(tabs)/alerts.tsx: on focus, after loading, mark all notifications read locally + call api.markAllNotificationsRead(). Notifications remain in the list (styled read); header shows "You're all caught up".
- app/(tabs)/_layout.tsx: when the active tab segment is "alerts", optimistically setAlerts(0) (and skip the racing re-fetch) so the badge disappears instantly on open; server marking keeps it 0 on later polls.
- Verified: badge "3" on bell → open Alerts → badge gone + "You're all caught up" → return to Home → badge still gone.

## Session update (Jun 2026) — Gift card notification "Tap for details" routing
- Bug: the "Gift card purchased" notification used ntype="booking" with no data, so create_notification defaulted nav to "member_bookings" → tapping opened the class bookings list (no gift-card/transaction info).
- Backend: gift-card buyer notify_user now passes data={"nav":"member_giftcards"}.
- Frontend app/(tabs)/alerts.tsx: added "member_giftcards" nav case → router.push("/gift-cards"). Also added a title-based fallback so LEGACY notifications (nav member_bookings + title contains "gift card") still redirect to the Gift Cards page (where purchase history/amount/recipient/code/date is shown).
- Verified: tapping a legacy-style gift card notification now opens the Gift Cards page.

## Session update (Jun 2026) — Tidy class detail ABOUT section
- Class detail description was one dense text block mixing title, schedule, pricing & closing line (looked unorganised).
- Added AboutText parser in app/class/[id].tsx that structures the admin description into: bold lead title, brand-coloured schedule line (lines containing "|"), uppercase sub-headings (lines ending ":", e.g. PRICING), a clean bullet list (•/-/– → dot rows), and normal paragraphs. Collapses 3+ blank lines; drops the redundant trailing "Suitable for ages …" line (Age banner already conveys it); keeps the flashing "All fitness and experience levels welcome." line. No change to the underlying admin-editable description data.
- New styles: aboutWrap, descLead, descSchedule, descSubhead, bulletList/Row/Dot/Text. Generic for all classes.
- Verified via screenshot on Kids Muay Thai class.

## Session update (Jun 2026) — Removed "Unlimited classes" perk from term memberships
- Per request, removed the "Unlimited classes for 3 months / 6 months / a full year" perk line from mem_3m, mem_6m, mem_12m in STORE_PRODUCTS (server.py). Remaining perks: 24/7 gym access with key tag + the value line. 1-month membership unchanged.
- Verified on /memberships: no "Unlimited" text remains.

## Session update (Jun 2026) — Gift card code email reliability
- Report: buyer (scottcarman69@gmail.com) bought a $50 gift card for THEMSELVES (recipient_email == buyer email) and got a receipt but not the code email. DB had the card (MEG-87CJ-LCMA, active). Code is already visible in-app (Gift Cards → My gift cards → Purchased) and the notification now opens that page.
- Root cause: buying for self sent TWO emails to the same inbox — buyer "Gift card purchased" (plain Code: line) + recipient "You've received…" (prominent code box). The code-box one was likely spam-filtered.
- Fix (fulfill_giftcard_purchase): buyer confirmation now ALWAYS includes a prominent dashed code box + redeem instructions; skip the redundant recipient email when recipient == buyer (sent_to_other flag). Admin email unchanged.
- Verified via monkeypatched send: buy-for-self now sends 1 buyer email with has_code_box=True (+ admin email). Real gift cards left intact.

## Session update (Jun 2026) — Copy code button on Gift Cards
- Added expo-clipboard (8.0.8). On gift-cards.tsx the purchased code row is now a tappable "Copy" control (testID gift-copy-<id>): copies the code to clipboard and shows a green "Copied!" with checkmark for ~1.8s. Styles copyRow/copyHint added.
- Verified via seeded purchased card: tap → "Copied!" state shown.

## Session update (Jun 2026) — Home stat pills touching when wrapped (iOS)
- On iPhone the two pills ("No classes today" / "N attended in <month>") wrap to two lines and touched because the pillRow `gap` did not apply a row-gap on iOS.
- Fix (home.tsx): pillRow uses columnGap:8 (horizontal) and each pill (todayPill/streakPill) now has marginBottom:8 to guarantee vertical separation when wrapped (margins always render on iOS). Kept the fontSize:13/lineHeight:13 centering fix.
- Requires a fresh redeploy + iOS build to show on TestFlight.

## Session update (Jun 2026) — Admin bookings action buttons cramped
- Admin booking card actions (Accept / Suggest time / Attended? / Cancel) were 4 flex:1 buttons in one row → labels overlapped/jumbled on phone.
- Fix (admin/bookings.tsx styles): actions now flexWrap with padding+gap; actBtn uses flexBasis 47% + flexGrow so buttons form a tidy 2-col grid (2×2 for appointments, single/again full-width otherwise). Buttons restyled as rounded chips (ghost = bordered + brandTertiary bg, danger = bordered). fontSize 12→13. Added numberOfLines on Suggest time / Attended? labels.
- Verified via seeded pending appointment: clean 2×2 grid, no overlap.

## Session update (Jun 2026) — Check-in notification enhancements + confirmed existing check-in list
- QR check-in now: (1) class-pass walk-in "Class pass used ✅" notification routes to My Wallet (/credits) via data nav member_wallet — shows pass balance + usage ledger (the walk-in "receipt"); (2) booked-class "Checked in ✅" notification now appends "You have N class passes left." when the booking was pass-paid or the member has passes; same for class-pass-confirms-existing-booking branch. Added member_wallet nav case in alerts.tsx → /credits.
- User request "admin list of who scanned QR today" ALREADY EXISTS: Admin → "Today's Check-Ins" (/admin/checkins, GET /api/admin/checkins/today). Shows date, totals (check-ins/passes used/members) and a per-member list with name, class, time, method (QR/Staff/Member), pass used. Demonstrated via seeded data.

## Session update (Jun 2026) — Fix wrapping "Log" button on My Bookings header
- The ScreenHeader right slot had a fixed width:44, so the bookings "Log" pill (clock icon + text) wrapped to "Lo/g".
- Fix: ScreenHeader sideRight now minWidth:44 + flexShrink:0 (sizes to content, keeps 44 min) — icon-only right actions on other screens unchanged. Added numberOfLines={1} to bookings logBtnText.
- Verified: "🕐 Log" renders on one line, title stays centered.

## Session update (Jun 2026) — Consistent membership form buttons
- Membership form looked uneven: Segmented chips were orange pills while YesNo buttons were a different shape/size and "No" selected was grey (surfaceTertiary) not brand.
- Fix (src/components/Form.tsx): YesNo buttons now match Segmented chips — borderRadius pill, paddingHorizontal lg / vertical 10, fontSize 13 / weight 700, minWidth 64, and BOTH Yes & No use brand bg + onBrand text when selected (ynOn/ynTextOn replace ynYes/ynNo). Applies app-wide wherever these controls are used.
- Verified on /membership Details step: Category/Term Segmented + consent Yes/No now visually identical.

## Session update (Jun 2026) — Consistent buttons on vigyr-signon (Join) page
- The two "Choose how to join" CTAs were inconsistent: Option 1 (Direct Debit) was a solid orange primaryBtn, Option 2 (Upfront Payments) was an outlined outlineBtn → looked uneven.
- Fix (app/vigyr-signon.tsx): Option 2 button now uses the same primaryBtn/primaryBtnText style (solid orange, onBrand icon, marginTop lg). Removed now-unused outlineBtn/outlineBtnText styles. Both option CTAs are now identical in size/colour/font/spacing.
- Verified via screenshots.

## Session update (Jun 2026) — "Next 10 sessions" booking flow
- New screen app/book-sessions.tsx (route /book-sessions?name=&category=): shows the next 10 upcoming sessions for a selected class type as a vertically scrollable list of cards. Each card shows class name, "Weekday D Month", start time, and status pill (Available / N left / Full / Closed). Past auto-excluded (!ended + start in future); Full/Closed cards are non-selectable; selected card highlighted (brand border + brandTertiary bg + check radio); sticky footer "BOOK · <day date time>" routes to /class/[id] for the existing booking/confirmation + payment flow.
- Entry point: class/[id].tsx now has a "See next 10 dates for this class" button (non-appointment classes only) → /book-sessions with name+category. Styles moreDatesBtn/moreDatesText added.
- Verified via screenshot on Kickboxing/Adults: 10 cards, selection highlight + footer CTA working.

## Session update (Jun 2026) — Receipt shows class value when paid by credit
- Bug: booking fully paid with account credit showed "$0.00" on the receipt (misleading). 
- Fix (GET /api/payments/receipt/{id}): for credit-covered bookings method stays "Account credit" but amount_cents now = gross class value (e.g., 2500). Added gross_cents + credit_applied_cents to response. receipt.tsx: headline shows the value and a new "Account credit applied: −$X.XX" row (both on-screen and in the shared PDF). Class Pass bookings unchanged ($0 / "Class Pass (1 used)").
- Verified via seeded credit booking: shows $25.00 + "Account credit applied −$25.00".

## Session update (Jun 2026) — Copy Member ID button + promote owner to admin
- friends.tsx: added a "Copy" button beside "Your account ID" (handle, e.g. APPREV6381/SCOTTC3432). Uses expo-clipboard; shows green "Copied" for ~1.8s. Styles copyBtn/copyBtnText; idText flex:1.
- Admin: set is_admin=True for scottcarman69@gmail.com (handle SCOTTC3432) in preview DB, AND added an idempotent startup promotion in server.py (extra-admin list, only promotes if account exists) so it applies to the PRODUCTION DB on next redeploy. Verified startup log "ensured admin for scottcarman69@gmail.com".

## Session update (Jun 2026) — Confirm before admin cancels a booking
- admin/bookings.tsx Cancel button previously cancelled instantly. Now it opens a confirmation Modal (cancelFor state) showing class + member, a warning (member notified, refund per policy, cannot be undone), with "Yes, cancel booking" (red, calls adminCancelBooking) and "No, keep it" (dismiss). Reuses modalOverlay/modalCard; added confirm* styles. Accept/Suggest/Attended unchanged.
- Verified via screenshot on admin bookings.

## Session update (Jun 2026) — Confirm before admin Accept/Confirm booking
- admin/bookings.tsx: Accept (adminAcceptBooking) and Confirm (adminConfirmBooking) buttons now open a confirmation Modal (approveFor state {b, kind}) before running — title "Accept/Confirm this booking?", class+member, "member will be notified", with brand "Yes, accept/Yes, confirm" + "Not yet". Reuses modal styles; added approveIcon/confirmPrimaryBtn/confirmPrimaryText. Matches the Cancel confirmation added earlier.
- Verified via screenshot.

## Session update (Jun 2026) — Member/admin self-confirm attendance
- Request: when the entry QR wasn't scanned during class, let either an admin OR the member confirm attendance; once one does it, the other isn't required.
- Backend: new POST /api/bookings/{id}/confirm-attendance (member-owned; only after class start; idempotent) sets attended=true, checked_in_method="member", checked_in_by=member name. Admin path (adminSetAttendance, method "manual") already existed. Both write attended=true to the same booking, so the "QR not confirmed" warning clears on both sides once either confirms.
- Frontend: api.confirmMyAttendance; bookings.tsx "missed" branch now shows the warning + a "Confirm I attended" button (testID booking-selfconfirm-<id>); attendance receipt Method shows "Self-confirmed" for member confirmations.
- Verified e2e via seeded past booking: button → ATTENDANCE CONFIRMED (Self-confirmed).

## Session update (Jun 2026 fork) — Featured Gallery Photo + backend refactor Phase 1 (DONE)
- FEATURE — Featured Photo (gallery hero): admin can mark ONE "OUR GYM" gallery photo as featured; it renders large at the top of the gallery on Home.
  - Backend: GET /api/gym/photos now returns `featured` per photo. NEW POST /api/admin/gym/photos/{photo_id}/feature {featured:bool} — only ONE featured at a time (featuring auto-unsets the previous; {featured:false} clears). 404 unknown id, 403 non-admin.
  - Frontend: admin/gym-photos.tsx adds a star toggle per photo (testID gymphoto-feature-<id>) + FEATURED badge; useGymGallery exposes `featured`; home.tsx renders a large featured hero banner (testID home-gym-featured) with FEATURED badge above the horizontal strip (featured photo excluded from the strip). api.ts +adminSetGymFeatured.
  - Verified: 39/39 backend tests (iteration_28) incl. single-featured invariant; admin UI screenshot shows star buttons; home hero renders.
- REFACTOR Phase 1 (incremental, route-parity verified): server.py 8,770 -> 8,118 lines.
  - NEW backend/models.py: all shared Pydantic request models (RegisterReq, LoginReq, BookingCreate, ClassUpsert, etc.) imported into server.py.
  - NEW backend/routes/ package (each defines `router=APIRouter()`, imports shared infra from server at bottom-of-file to avoid cycles, included into `api` just before app.include_router(api)): routes/gym.py (OUR GYM gallery incl. feature), routes/events.py (events + RSVP + content-view tracking + home/badges + admin/views), routes/trials.py (free trials), routes/notifications.py (member notifications), routes/waitlist.py (waitlist member routes; helpers _class_is_full/WAITLIST_ACTIVE_BOOKING/notify_waitlist_spot stay in server.py since bookings uses them).
  - Route inventory IDENTICAL before/after (195 routes, 0 missing/added). 39/39 regression tests pass. No payment flows touched (Square is PRODUCTION = real charges).
  - NOTE for next agent: continue extraction in future phases; consider a deps.py/core.py for shared infra (db, auth deps) to decouple routes/*.py from server.py. The stale pytest suite (test_backend.py / test_new_features.py) fails at baseline (old "Max Energy" brand assertions, rotated admin creds) — not a regression.

## Session update (Jun 2026 fork) — backend refactor Phase 2 (bookings/admin/payments/messages) (DONE)
- Continued incremental extraction out of server.py (now 8,770 -> 7,203 lines; ~1,750 lines modularized across models.py + 9 route modules). Same proven pattern: each routes/*.py defines `router=APIRouter()`, imports shared infra from server at bottom-of-file, included into `api` before app.include_router(api).
- NEW modules this round:
  - routes/messages.py — member<->gym messaging (GET /messages, /messages/unread, POST /messages).
  - routes/bookings.py — booking create/list/history/clear/cancel/reschedule/checkin/confirm-attendance/checkin-code + /passes/qr + /me/stats + /payments/reconcile. Moved _enrich_bookings with it. Imports (kept in server): make_checkin_code (also used at line ~1061), mark_booking_paid, sync_square_payment, reconcile_user_payments, notify_waitlist_spot, booking_ref_no, check_appt_window, coach_photo, get_cancel_window_hours, _materialize_class, _booking_start_utc, ADMIN_NAV, APPT_ACTIVE_STATUSES, log, etc.
  - routes/admin.py — GET /admin/overview + GET /admin/classes + admin class CRUD (POST/PUT/DELETE /admin/classes). Moved local helpers _parse_dt + _weekday_hour_from. Imports _make_template_id, _cap_limit, DEFAULT_CLASS_IMAGE (stay in server).
  - routes/payments.py — Square POST /payments/checkout (class-pass/credit/card), GET /payments/status/{sid}, GET /payments/receipt/{booking_id}, GET /payments/receipts. ALL Square helpers (sync_square_payment, mark_booking_paid, _reuse_open_square_checkout, low_pass_nudge, booking_ref_code, SQUARE_* config) stay in server.py and are imported.
- Verification: route inventory IDENTICAL before/after (195, 0 missing/added) after each module; app boots clean; testing_agent iteration_29 = 30/30 pass (messages/bookings/admin/payments + admin guards + core sanity). NO Square checkout/store/giftcard POSTs made (PRODUCTION = real charges). One missed import caught+fixed during build (reconcile_user_payments, plus ADMIN_NAV/APPT_ACTIVE_STATUSES/_booking_start_utc/_materialize_class/booking_ref_no/check_appt_window/coach_photo/get_cancel_window_hours/log) via an AST undefined-name check.
- Technique note for next agent: used an AST "loads - imports - defs - builtins, intersect dir(server)" check per route module to catch missed server-helper imports BEFORE boot. Shared helpers used across >1 section stay in server.py; only section-local helpers move with their module.
- Remaining big chunks still in server.py for future phases: auth, gym info, classes/recurring-schedule, friends/DMs, group chats, store/giftcards, membership (apply/PDF), schedule exceptions, the rest of admin (members/applications/refunds/bookings-admin), seed. Consider a core.py/deps.py later to fully decouple routes from server.

## Session update (Jun 2026 fork) — backend refactor Phase 3 (groups/store/membership) — DONE
- Final planned extraction batch. server.py now 8,770 -> 5,804 lines; ~3,200 lines across 12 route modules + models.py.
- NEW modules:
  - routes/groups.py — group chats (training crews): create/list/discover/join/get/send/react/pin/typing/edit/delete/rename/add/remove/leave + admin group-requests (approve/decline) + admin DM threads (/admin/threads, /admin/threads/{uid}, reply). Moved group-local helpers (_validated_friends, _create_group, _notify_all_admins, _group_or_403, _is_group_mod).
  - routes/store.py — store products + checkout/status, gift cards checkout/status/redeem/mine, admin giftcards + adjust, store receipt, GET /credits (wallet), GET /announcements. All Square/store helpers (sync_square_payment, _reuse_open_square_checkout, compute_store_price, fulfill_*, _giftcard_*, _square_headers, STORE_PRODUCTS, GIFTCARD_*/KEYTAG_CENTS, SQUARE_* config) stay in server.py and are imported.
  - routes/membership.py — plans, vigyr-report, apply, build_membership_pdf (moved; reportlab imported locally), PDF download + form url, applications/me. Imports term/helper names (MEMBERSHIP_TERMS_TC, TERMS_DECLARATION_TC, _membership_terms_html, sign_dl_token, verify_dl_token, get_user_by_token, _email_contact_footer, GYM_ADMIN_EMAIL) from server.
- Verification: route inventory IDENTICAL (195, 0 missing/added); boots clean; AST undefined-name check = 0 missed per module; testing_agent iteration_30 = 36/36 pass (groups/store/membership + admin guards + membership apply->PDF e2e + core sanity). NO Square checkout/store/giftcard POSTs (PRODUCTION = real charges). Test data cleaned by tester.
- Refactor summary across the 3 phases: 12 route modules now live under backend/routes/ (gym, events, trials, notifications, waitlist, messages, bookings, admin, payments, groups, store, membership) + models.py. Still in server.py (by design, shared or not-yet-extracted): push, helpers, OTP, membership-terms, auth, gym info, classes/recurring-schedule, friends/DMs, the Square/payment + store/giftcard + receipt HELPERS, schedule exceptions, remaining admin (members/applications/refunds/bookings-admin/passes-report/checkins-today/waitlists/bug-reports), seed. Pattern: each routes/*.py does `from server import ...` at bottom-of-file include time; section-local helpers move with their module, cross-used helpers stay in server. A future core.py/deps.py could fully decouple.

## Session update (Jun 2026 fork) — Notice categories (DONE)
- Admin can now tag each Gym Notice with a CATEGORY. Set: General, Event, Class Update, Closure/Holiday, Promotion, Urgent (fixed colors/icons in frontend/src/noticeCategories.ts).
- Backend: AnnouncementCreate/AnnouncementUpdate +category (models.py). admin_announcement_create/update store+validate category against ANNOUNCEMENT_CATEGORIES (invalid/missing -> "general"). GET /announcements already returns full docs so category flows to clients (legacy notices default to general via noticeCat()).
- Admin (app/admin/announcements.tsx): CATEGORY chip picker under Title (testID admina-cat-<value>); each notice row shows a colored category tag; edit prefills category.
- Member Notices tab (app/(tabs)/events.tsx): each notice shows its colored category tag + matching icon/left-bar/gradient; horizontal filter chips [All + present categories] (testID notice-filter-<value>/notice-filter-all) shown only when >1 category present; pinned notices still show a PINNED tag alongside the category.
- api.ts: adminCreate/UpdateAnnouncement payloads +category.
- Verified: curl create=promotion / update=closure / invalid->general / delete 200; screenshots of admin picker (Promotion selected) and member tab (All/General/Event/Closure filter chips + CLOSURE/HOLIDAY red, EVENT blue, GENERAL grey tags). Test notices cleaned up.

## Session update (Jun 2026 fork) — Urgent notice highlight (DONE)
- "Urgent" category notices now stand out on the member Notices tab (app/(tabs)/events.tsx): sorted to the very TOP (urgent > pinned > newest), red border (2px) + red-tinted card bg, red gradient alert-circle icon, thicker red left bar, and a bold red "⚠ URGENT — PLEASE READ" banner (testID ann-urgent-<id>) replacing the plain category tag. Non-urgent notices unchanged. Verified via screenshot (urgent card renders at top above pinned). Test notices cleaned up.

## Session update (Jun 2026 fork) — Auto-expire urgent highlight (DONE)
- Admin can choose how long an Urgent notice keeps its red highlight. When "Urgent" is selected in app/admin/announcements.tsx, a "Keep red highlight for" chip row appears: 1 day / 3 days / 1 week / No expiry (testID admina-urgent-<days>, default 3). Submit computes urgent_until = now + days (ISO) or null for No expiry.
- Backend: AnnouncementCreate/Update +urgent_until (models.py). _parse_urgent_until() stores a UTC datetime only for category=urgent (else null). create/update persist it; GET /announcements returns it (ISO).
- Member tab (app/(tabs)/events.tsx): isUrgentActive(a) = category urgent AND (no urgent_until OR urgent_until>now). Only ACTIVE urgents get red banner/border/tint/top-sort; once urgent_until passes, the notice auto-reverts to a normal card (amber "URGENT" category tag, normal sort by date) with no code/admin action needed.
- Verified via curl (future vs past urgent_until) + screenshot: active urgent pinned to top with red banner; expired urgent rendered as a normal amber-tagged notice in date order. Test notices cleaned up.

## Session update (Jun 2026 fork) — Exact-date urgent expiry picker (DONE)
- Admins can now set an EXACT expiry date & time for an Urgent notice's red highlight, in addition to the 1/3/7-day quick chips. A new "Pick date…" chip (testID admina-urgent-pickdate) reveals an inline month calendar + HH:MM time field; a live "Highlight until <date · time>" summary shows the chosen value.
- NEW reusable component src/components/InlineCalendar.tsx: pure React Native (works on web + native), dark-theme month grid with ‹/› navigation, past dates disabled (min=today), selected day highlighted in brand color. No new dependency (the app had no calendar/date-picker lib; expo-calendar is device-access only).
- app/admin/announcements.tsx: urgentMode 'days'|'date'; date mode combines exactDate + HH:MM -> local Date -> ISO sent as urgent_until. Validates HH:MM and that the datetime is in the future. startEdit round-trips an existing urgent_until back into the calendar+time (exact edit). No backend change needed — _parse_urgent_until already accepts any ISO.
- Verified: screenshot of calendar (Oct 2026, past dates greyed, day selected, time field, "Highlight until Thu, Oct 15 · 08:30" summary); API path create stores precise urgent_until (2026-10-15T08:30:00+00:00). Member tab auto-revert logic (isUrgentActive) already respects urgent_until regardless of how it was set. Test data cleaned.

## Session update (Jun 2026 fork) — Login-screen notice banner (DONE)
- The login screen (pre-auth) now shows a banner for the newest notice a member on this device hasn't yet opened. GET /announcements is public so this needs no login.
- NEW src/components/LoginNoticeBanner.tsx: fetches announcements, orders urgent-active-first then newest, shows the first one NOT in the device's dismissed list. Tapping opens a modal with the full notice (tag/title/body/author) — readable without logging in. "Got it"/backdrop dismiss adds the id to the dismissed list (persisted via storage.setItem as comma-joined string under key "dismissedLoginNotices") and hides the banner; the next undismissed notice then surfaces. A newer notice (new id) re-triggers the banner. Urgent notices respect urgent_until (expired urgents show as their normal category, non-urgent styling).
- Wired into app/(auth)/login.tsx between the hero and the TRAIN headline.
- Verified via screenshots: logged-out login shows "NEW CLOSURE / HOLIDAY NOTICE" banner; tap opens full-notice popup with Got it. Lint clean (LoginNoticeBanner). Test notice cleaned up.

## Session update (Jun 2026 fork) — Moved notice popup from login -> post-login Home (DONE)
- Per user request, REMOVED the login-screen notice banner (deleted src/components/LoginNoticeBanner.tsx; removed import+usage from app/(auth)/login.tsx).
- NEW src/components/HomeNoticePopup.tsx: on Home screen focus (right after login/redirect to "/"), auto-opens a modal for the newest notice this device hasn't dismissed (urgent-active first, then newest). "Got it"/backdrop persists the id under storage key "dismissedNotices" (comma-joined) and closes; "View all notices" dismisses + routes to /(tabs)/events. useFocusEffect guarded so it only auto-checks when nothing is already shown. Respects urgent_until (expired urgents show as normal category styling).
- Wired into app/(tabs)/home.tsx (import + <HomeNoticePopup/> right under <ScreenBg/>).
- Verified via screenshot: after login as testmember, home auto-pops "CLASS UPDATE: Reformer Pilates now on Tuesdays" modal with Got it + View all notices. Login screen no longer shows the banner. Lint clean (HomeNoticePopup). Test notice cleaned up.
- NOTE: dismissal is per-device (AsyncStorage). Storage key differs from the old login one ("dismissedNotices" vs "dismissedLoginNotices").

## Session update (Jun 2026 fork) — Fix: member stuck on "New time proposed" (DONE)
- BUG: Tapping the "New time proposed — please confirm" notification opened My Bookings, but the member could not accept/confirm. Root cause: when the gym's proposed time (proposed_at_iso) had already PASSED by the time the member opened it, POST /api/bookings/{id}/confirm-time returns 400 ("This proposed time has already passed"), yet the card still only showed a "This time works" button that would always fail — dead end. (Backend confirm works fine for future proposals — verified.)
- FIX (app/bookings.tsx admin_proposed block): compute proposedPast via classStartMs(proposed_at_iso) vs qldNowUTC(). If NOT past -> show "This time works" (accept) + a new outlined "Suggest another time" button. If PAST -> hide the failing accept button, show "…that time has now passed. Suggest another time…" + only "Suggest another time" (opens the existing reschedule modal). Added Booking.proposed_at_iso to the type (already returned by GET /bookings). Hid the now-redundant generic Reschedule action for admin_proposed. New styles proposeDeclineBtn/Text.
- Verified via screenshots: future proposal shows both buttons; past proposal shows the passed message + only Suggest another time. Confirmed GET /bookings returns proposed_at_iso and confirm-time works for future / 400s for past. Test bookings cleaned up.

## Session update (Jun 2026 fork) — Instant gym alert on proposed-time confirm (DONE)
- When a member taps "This time works" (POST /api/bookings/{id}/confirm-time), the gym now also gets an INSTANT PUSH alert ("Session time confirmed ✅ — <member> locked in <class> for <when>", action_url /admin/bookings), in addition to the existing in-app admin notification (nav admin_bookings) + gym-inbox email. Added in server.py booking_confirm_proposed_time via send_push to all admin user_ids, idempotency_key confirmtime_<booking_id>; non-blocking (push failure never affects the confirm).
- Verified: confirm returns 200 + booking confirmed; admin in-app notification created ("Member confirmed a proposed time"); push fired to the Emergent relay (401 in PREVIEW because EMERGENT_PUSH_KEY is a placeholder until deploy/build — same as all other pushes; works on real iOS/Android builds). Test data cleaned.
- REMINDER for user: push alerts only work on a deployed + built app (TestFlight/APK), not Expo Go/web preview.

## Session update (Jun 2026 fork) — Square switched to PRODUCTION (live) + store compliance pages (DONE)
- Square payments moved from SANDBOX to PRODUCTION. backend/.env now: SQUARE_ENV=production, SQUARE_ACCESS_TOKEN=EAAAl5oG... (production), SQUARE_LOCATION_ID=X9S2RGZSHPZZ9 (location "Maxenergy fitness", AU/AUD). SQUARE_BASE auto-switches to https://connect.squareup.com/v2. Verified: production /locations returns 200 and a production payment-link was created (order CUfdUpYn..., unpaid/expires). Checkout now charges REAL cards.
  - ACTION FOR USER: For the DEPLOYED app, the same 3 SQUARE_* values MUST be added to deployment Environment Secrets (Emergent panel), else deployed app stays sandbox. True payment test = real card charge (refundable in Square dashboard).
- Added public Delete Account page for Google Play Data Safety: GET /delete-account and /api/delete-account (server.py _DELETE_ACCOUNT_HTML). /privacy already existed. Use deployed backend URL + /delete-account and /privacy for store listing.

## Session update (Jun 2026 fork) — Reviews section (Elfsight widget) (DONE)
- Added in-app Reviews screen displaying the gym's existing Elfsight reviews widget (ID d2cd5c7f-942e-4d68-85d7-41e53e623d34).
- Backend: new public endpoint GET /reviews-widget and /api/reviews-widget (server.py _REVIEWS_WIDGET_HTML) serving the Elfsight platform.js embed on a dark (#121214) background, responsive viewport.
- Frontend: app/(tabs)/reviews.tsx rebuilt — black/orange header + platform-specific frame. src/components/ReviewsFrame.tsx = react-native-webview (native iOS/Android), ReviewsFrame.web.tsx = <iframe> (web, since RN WebView has no web impl). External review links (Google/Facebook) open in system browser via expo-web-browser (onShouldStartLoadWithRequest). Loading spinner + 4.5s safety timeout + retry on error.
- Reachable via a new "Reviews" Home quick action (src/quickActions.ts key "reviews", handler router.navigate("/(tabs)/reviews") in home.tsx). The old Google-Places reviews UI was replaced; /api/reviews endpoint left intact but unused.
- Verified on web preview: widget renders (4.9 rating, 35 reviews, Google/Facebook tabs, Write a Review, carousel). WebView path works on native builds.

## Session update (Jun 2026 fork) — Home Reviews summary card (DONE)
- Added compact "4.9 ★★★★★ · 35 member reviews · Read" card on Home (app/(tabs)/home.tsx), placed between UPCOMING CLASSES and OUR GYM, taps to /(tabs)/reviews.
- Backend: GET/POST /api/reviews-summary (server.py) stored in db.meta key "reviews_summary", default rating 4.9 / total 35, validated (rating 0-5, total 0-1e6). Elfsight data API is Cloudflare-protected (403 server-side) so numbers can't be fetched on the backend.
- Auto-sync: the Reviews WebView (src/components/ReviewsFrame.tsx) injects JS that scrapes the live rating + review count the Elfsight widget rendered and postMessages them back; reviews.tsx calls api.setReviewsSummary() so the Home card self-updates whenever any native user opens Reviews. Web iframe path doesn't scrape (keeps stored/default).
- api.ts: added reviewsSummary() and setReviewsSummary(rating,total).

## Session update (Jun 2026 fork) — Persuasive Reviews card + direct write link (DONE)
- Redesigned Home reviews card (app/(tabs)/home.tsx) into an advertising banner: gradient (#2A1705→#1C1C1F), social-proof row (★4.9 badge + stars + "35+ reviews"), headline "Loving Max Energy? 💪", pitch copy, prominent orange "LEAVE A REVIEW" CTA + "Read reviews ›" link. Card tap -> Reviews page; CTA -> write_url via WebBrowser.
- Backend: set GOOGLE_PLACE_ID=ChIJsS-2jLZveGkR0zkONT7O1jM in backend/.env (was empty). REVIEW_WRITE_URL now builds a direct Google writereview link (https://search.google.com/local/writereview?placeid=...). Added write_url to GET /api/reviews-summary. api.ts reviewsSummary already returns it.

## Session update (Jun 2026 fork) — Security audit + gift-card double-spend fix (DONE)
- Ran read-only security audit. Verdict: CONDITIONAL PASS. Core auth/authz/admin-gating/payments solid. One HIGH: gift-card redemption lacked an atomic claim (SEC-001, routes/store.py).
- FIXED routes/store.py giftcard_redeem: now atomically claims the card via find_one_and_update({status:active, balance>0} -> {balance:0,status:redeemed}) BEFORE granting credit; grants only if claimed. Also fixed latent 500 (invalid code now raises 404 instead of reading None). Verified: 8 concurrent redeems -> 1x200 + 7x409, credit = card value (not multiplied), 1 ledger entry.
- Remaining P3 (accepted, not changed): hardcoded self-restoring review-account passwords (server.py ~5433/5465, intentional for store review, non-admin), public clamped POST /api/reviews-summary (defacement-only), CORS allow_origins=* (bearer-token API, no cookies — low impact), WebView originWhitelist=* (mitigated by onShouldStartLoadWithRequest + validated onMessage).

## Backlog (user deferred) — Unify app + website onto one shared database (SAVED FOR LATER)
- User has TWO separate Emergent projects (this mobile app + a website), each with its own isolated Emergent-managed MongoDB; both already store members/bookings. Goal: one shared account/booking system + website displays app data.
- Emergent-recommended pattern (per support): point BOTH projects at the SAME external MongoDB Atlas (same MONGO_URL/DB_NAME in each deployment's secrets). Managed DBs are not cross-reachable. Confirm external MONGO_URL use with support@emergent.sh.
- REAL WORK involved (not a toggle): pick ONE master schema (recommend THIS app — more complete, security-audited), adapt the website to the same schema + same auth/token/password format, one-time data migration to merge/de-dupe members & bookings. Website is a separate project (cannot be edited from this app's session).
- STATUS: User chose to HOLD OFF for now. Revisit later. Open decisions: (1) make mobile app the master? (2) use MongoDB Atlas + create account, or first document schema for web dev to scope effort.

## Jun 2026 — Full regression (iter 31)
- 90/90 backend tests pass; all member + 22 admin screens load.
- Fixed: emails now sent in background (no more slow/502 checkout, cancel, export); waitlist on unbooked class returns 409; atomic pass refund on cancel; server-side start date/meet time required for upfront memberships.
