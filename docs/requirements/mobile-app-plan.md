# Capabble mobile app — plan

Status: Phase 0 (foundation) is in the repo at `/mobile`. Written 23 Oct 2026.

## What we are building

One app, **Capabble**, on iOS and Android, built from the `/client` product (not admin, not SCHOL).
It is the design system's **Companion** surface: parents, students and teachers on a phone.
The web app stays the place for desk work (setting up the school, imports, reports, printing).

Who gets what, in order:

| Release | Who | What | Why first |
|---|---|---|---|
| 1 | Parents, students | Everything in the family portal (`client/src/portal`): home, calendar, fees and receipts, attendance, results, timetable, notices, appointments, live bus, profile | Biggest audience, mostly on phones. The API exists (`/api/portal/*`, read-only, scoped to linked students), so this is client work only |
| 2 | Teachers | Mark attendance (phone roll call), my timetable, calendar, appointments as host, leave | The daily phone tasks of staff. Needs permission checks from `permissionCatalog.json` |
| 3 | Principal, office | Read-only glance: today's attendance, fee collection, approvals waiting | Useful on the move; the desk work stays on the web |

Push notifications and deep links ship with release 1 (see below); they are why a family uses an app over the website.

## Decisions

### Expo (SDK 58) with Expo Router, TypeScript
- One codebase for iOS and Android (and a web build used only for quick previews).
- Expo's managed workflow: `ios/` and `android/` are generated (never edited or committed); native settings live in `app.json` and config plugins.
- EAS builds and signs in the cloud (no local Xcode or Android Studio needed to ship), submits to the stores, and pushes JS-only fixes over the air (EAS Update) without a store review.
- Routes are files in `mobile/src/app` (Expo Router), like pages in the web app.

### In this repo, at `/mobile`, but not an npm workspace
- The web apps run React 18; Expo SDK 58 needs React 19.3 and React Native 0.88. npm workspaces hoist one React to the root, and Metro would bundle the wrong one.
- So `/mobile` is its own npm project with its own lockfile, like `/server`: `cd mobile && npm install`.
- Shared files still have one source: Metro watches `packages/shared` and maps `@capabble/shared/*` to it (no copy, no sync step). `mobile` reads `designTokens.json` from there today, and `permissionCatalog.json` next.
- When the web apps move to React 19, `/mobile` can join the workspaces and Turborepo.

### Node 24 for the mobile app
Expo SDK 58 requires Node 22.13+ (`mobile/.nvmrc` says 24). The rest of the repo is unchanged. On this Mac Node 24 is at `/usr/local/bin/node`; the default shell picks Homebrew's Node 20. Expo still starts on Node 20, with a warning, but installs and EAS builds should use 24.

### Design system: the Companion surface, from the same tokens
- Source of truth: the design system artifact (claude.ai/artifact/LyYegFLHJxi1rNpnkaqHjH). Its `tokens.json` is copied to `packages/shared/src/designTokens.json`; the app builds its light and dark palettes, type scale, spacing, radius and sizes from it at runtime (`mobile/src/theme/tokens.ts`). No hex in screens.
- The native kit is `mobile/src/ui` (see `mobile/src/ui/DESIGN.md`). Same names and props as the web kit where they make sense (`Button`, `Card`, `Badge`, `TextField`, `EmptyState`, `Banner`, `Skeleton`, `Avatar`), plus the Companion pieces: `Screen`, `ListRow`, `BottomNav`.
- Companion rules applied: `body-lg` 16px default text, 44px controls (`control-lg`), 52px rows (`row-comfortable`), `BottomNav` with 4–5 tabs at 64px plus the safe area, Inter 400/500/600, Lucide icons at 1.75 stroke, light and dark from the device setting.
- The school's colour: `brandColor` on the school profile (web: Settings → School profile), sent as `user.tenant.brandColor`; both apps turn it into the accent tokens with `packages/shared/src/schoolAccent.ts`.
- Still to port: `Sheet` as a bottom sheet, `Dialog`, `Tabs`, `SegmentedControl`, `Calendar`/`AgendaList`, `AttendanceGrid` (roll call), `TimetableGrid` (day list), toasts.

### Sign-in and sessions: reuse the web's cookie session
- The API already issues httpOnly cookies (`cb_at` 15 min, `cb_rt` rotated). On iOS and Android, `fetch` keeps cookies in the app's own cookie store, so the app signs in with **no server change** and never holds a token.
- Every request sends `x-tenant-slug` and `X-Requested-With` (the API's CSRF check on cookie writes). A 401 triggers one shared `POST /api/auth/refresh`, then a retry; if that fails the app returns to sign-in.
- Finding the school: an email → `POST /api/admin/public/auth/resolve-tenant`; a login ID like `2024017@dps` → `dps`; otherwise the school remembered from last time, or a "School code" field. The school is remembered in the device keychain (`expo-secure-store`).
- Revisit before release 1 if testing shows Android dropping cookies on restart: the fallback is the API returning tokens in the body for a `native` client, stored in `expo-secure-store` (a server change in `authController.js` and `utils/jwt.js`).
- The API allows requests with no `Origin` (native apps). The browser preview at `localhost:8081` only works against an API running with `NODE_ENV` other than `production` (CORS).

### Data
TanStack Query (as on the web) over a small `fetch` client (`mobile/src/lib/api.ts`). No Redux. Services mirror the web ones (`portalService`, `authService`) and return the API's `data`.

## Phase 0 — foundation (done)
- `/mobile`: Expo SDK 58, Expo Router, TypeScript, ESLint (`eslint-config-expo`), app name Capabble, scheme `capabble`, app icon and splash from the Capabble mark.
- Theme from the design tokens, light and dark.
- Native kit: `Text`, `Button`, `Badge`, `Avatar`, `Icon`, `Card`, `TextField`, `Banner`, `EmptyState`, `Skeleton`, `Screen`, `ListRow`, `BottomNav`.
- Sign-in, session restore on launch, sign-out; tabs Home and More.
- Family Home lists the signed-in parent's children (or the student's own record) from `/api/portal/home`. Staff Home says the staff app is coming and points to the website.
- Checks: `npm run type-check`, `npm run lint`, `npx expo-doctor` all pass.

## Phase 1 — family app, release 1
Done so far (23 Oct 2026): tabs Home · Calendar · Fees · Notices · More, shown by the sections the
school turned on for the login (`home.sections`); kit pieces `Sheet`, `SegmentedControl`, `Chips`,
`IconButton`, `AgendaList`, `Figure`, `Progress`, toasts; a child switcher for parents with more than
one child (remembered on the device).
- Calendar: the month by day from today, earlier and later months, a filter per child, an item sheet
  with the family's parts and their reply (acknowledge, RSVP with headcount, consent per child).
- Fees: still due with paid so far, the fee schedule with status and a breakdown sheet, payments
  with the receipt PDF to share or save (`expo-file-system` + `expo-sharing`).
- Notices: the list and each circular in a WebView with JavaScript off; links open in the browser.
- Checked in the web preview with sample data. Not yet checked on a phone: the receipt share sheet
  and the WebView (both native-only).

Also done: the rest of the family portal under More, each shown only when the school has the
section on: Attendance (month grid and summary), Timetable (one day at a time), Results,
Transport (crew to call, stops, whether the bus is on the road), Meetings (list, request with
free slots, cancel), Profile, Your login (change password). First sign-in with a temporary
password goes through "Set your own password" (the API refuses everything else until then).
Checked on the iOS simulator against stage data, except Meetings (stage school has `appnt_desk`
off; checked in the web preview with sample data).

Still to do:
1. Port `Tabs` and `MiniCalendar`. (Done 23 Oct: the school's colour on web and mobile, appearance under Your login; the school colour is not yet seen on a phone against stage, which needs the server deployed.)
2. Live bus map on Transport (needs `react-native-maps`, so a development build, not Expo Go).
3. Move pure helpers both apps need (`format.ts`, `classLabel`, portal types) into `packages/shared`.
4. Push notifications. Built (23 Oct), waiting for the Expo account:
   - Server (`server/src/push`): every in-app notification (`notifications/send.js`, so calendar events, fees, notices, attendance, transport…) is also queued in `push_outbox` for each phone of its recipient, and a leased worker sends it through Expo's push service (100 per request, retries on 429/5xx, receipts after 15 minutes, phones Expo calls `DeviceNotRegistered` switched off). A template can opt out with `push: false`. Phones are in `devices`, registered at `POST /api/devices` (staff, rule in the catalog) or `POST /api/portal/devices` (families), removed with `DELETE …/devices/:token` on sign-out. A phone remembers the login's `tokenVersion`, so "sign out everywhere" also stops its pushes. `PUSH_OUTBOX_ENABLED` (default on), `EXPO_ACCESS_TOKEN` only with enhanced push security.
   - App (`src/lib/push.ts`, `usePushNotifications`): after sign-in asks for permission, gets the Expo push token and registers it (again when the login or token changes); sign-out removes it first. A tap opens the screen the notification is about (`notificationLinks.ts` maps the website's links; calendar pushes open the event's sheet) and marks it read. Checked on the simulator with local notifications: banner while open, tap opens Fees, tap opens the calendar event.
   - Still to do: `eas init` (the project ID; until then the app skips registration), APNs key and Firebase (FCM V1) credentials in EAS, a development build (Expo Go can't receive remote pushes on Android), then a real push end to end.
5. Deep links: `capabble://` now; universal links on `school.capabble.cloud` (`apple-app-site-association` and `assetlinks.json` served by the client's Vercel project) so a notice email opens the app.
6. EAS: `mobile/eas.json` is in (23 Oct): `development` (dev client, internal, API on the machine running Metro), `development-simulator` (same, iOS simulator build), `preview` (stage API, internal, Android APK, channel `preview`), `production` (production API, store, channel `production`, build numbers kept by EAS); `submit.production` puts Android on the internal track. `expo-dev-client` is installed, so `npm run ios` / the `mobile-ios` launch entry pass `--go` to keep using Expo Go. Still to do once the Expo account exists: `eas init` (writes the project ID into `app.json`), then `eas update:configure` (adds `expo-updates` and the update URL) and `ascAppId` for iOS submit.
7. Store: privacy policy and data-safety answers (children's data: we collect for the school, no ads, no tracking), screenshots, review account for Apple and Google.
8. Crash reporting (Sentry for React Native) before the first public build.

## Phase 2 — teacher app
Attendance roll call (`AttendanceGrid` phone view) with offline queue, my timetable, calendar, appointments as host, leave. Gate every screen with `can()` from the permission catalog; "own classes only" grants are already enforced by the API.

## Phase 3 — principal glance
Read-only stats and approvals, following the dashboard recipe (≤4 stats, each tied to a decision).

## Accounts and tools we need

| Need | For | Status |
|---|---|---|
| Expo account (organisation "capabble") | EAS Build, Submit, Update, push | To create |
| Apple Developer Program, as an organisation (needs a D-U-N-S number) | App Store, TestFlight, push (APNs) | To create, takes 1–2 weeks |
| Google Play Console | Play Store, internal testing | To create |
| Firebase project | Android push (FCM) | Phase 1 |
| Xcode | iOS simulator for local development | Installed (Xcode 27) |
| Android Studio + an emulator | Android local development | Not installed |

**Claude Code plugins and connectors**
- Keep **react-native-best-practices**: performance, lists, Metro and navigation guidance.
- Add the official **expo** plugin (`expo/skills`, also enabled in `mobile/.claude/settings.json`): current Expo Router, EAS and upgrade guidance. Expo changes every SDK, so this matters more than general React Native knowledge.
- Add the **Expo connector** once the Expo account exists: build and update status from Claude.
- Already available in the desktop app: the iOS Simulator tool (run and screenshot the app).
- Not needed: Small Business (finance and sales workflows, unrelated to this repo), Bitrise (EAS covers CI for mobile), Mobile App Design (iOS) and similar design plugins (we have our own design system).

## Open questions
1. **App identifiers** `cloud.capabble.app` (iOS bundle ID and Android package). They can't change after the first store upload. Confirm before the first EAS build.
2. One app for families and staff (current plan: one app, the screens depend on who signs in), or a separate staff app later?
3. Release 1 without teachers, or wait for attendance marking?
4. Hindi: the design system is English-only today; adding it needs Noto Sans Devanagari and translated copy.
5. Whose name is on the store listings (Capabble, or each school as a white-label app)? White-label per school is possible with EAS but multiplies store work; start with one Capabble app where the school's logo and colour theme it after sign-in.
