This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Capabble rules (read first)

- This is the Capabble app for families and staff: the design system's Companion surface. Plan and decisions: `../docs/requirements/mobile-app-plan.md`.
- Before building UI read `src/ui/DESIGN.md` and the web rules it points to (`../client/src/components/ui/DESIGN.md`). Build only from `@/ui`; add a missing piece to the kit first. Colours and sizes come from the tokens, never hex.
- Not an npm workspace: run npm inside `mobile/` with Node 22.13+ (`.nvmrc`). Shared files come from `../packages/shared` through Metro (`@capabble/shared/*`); edit them there.
- API calls go through `src/lib/api.ts` (cookie session, `x-tenant-slug`, refresh on 401) from a service in `src/services/`. Never store tokens or passwords on the device.
- Copy follows the voice rules: sentence case, buttons start with a verb, errors say what to fix, never module codes.
- The keyboard must never cover the field being typed in. Forms live in `MobileScreen` or `BottomSheet` with `MobileTextField`; never add `KeyboardAvoidingView` or your own keyboard padding (see "Forms" in `src/ui/DESIGN.md`). Test forms on Android.

## Staff app: everything in the app

- Staff (teachers, principal, office, accounts, library, clinic, transport) do their work in the app, not on the website. A staff page on the web gets a phone screen; "Open on the website" (`staff/access.ts` `WEB_MODULES`, `openWebsite`) is a stopgap, not a destination. Shrink that list; don't add to it.
- Only true desk work may stay web-only, and only with a reason written in `../docs/requirements/mobile-staff-plan.md`: bulk imports, print layouts and report formats (admit cards, report card designs, seating plans, Form 66), timetable generation, school setup and billing. Everything a person checks, approves, marks, records or looks up belongs on the phone.
- Reuse the web's endpoints and the server's permission checks; add a server endpoint only when a phone flow truly needs one, and say why. Gate every screen with `useStaff()` (`can`, `canUse`, `scopeOf`) and the school's feature toggles; "own classes only" (`assigned`) is enforced by the server and the app never offers what it would refuse.
- A long web table becomes a phone pattern, never a table: a list with a search and filters (`SearchBar`, `ChipRail`), a record screen (`DetailList`), and one task per screen or sheet. Big grids (marks, registers) go one class and one subject or day at a time.

## Small Android screens come first

- Most users are on Android (70–80%), on phones about 360dp wide (smaller than any iPhone in use), often with a larger text size. Android draws the same layout bigger: design for **360 × 640dp at 1.3× text** and check it there before calling a screen done; iOS at 390pt is the easy case.
- Every screen must fit that width with nothing cut off, overlapping or scrolling sideways: rows use `flex: 1` + `minWidth: 0` for text and `numberOfLines` on chrome; fixed columns use `useFixedColumn`; at most one control at the end of a row (a `SegmentedControl` or `NumberCell` row leaves room for the name to show at least 12 characters at 360dp and 1.3×, else move the control below or into a sheet).
- Prefer stacking to squeezing: two-up tiles, button pairs and side-by-side fields stack below 360dp or above 1.15× text (as `StatTiles` and `ShortcutGrid` already do). Labels stay one line and shrink to fit (`adjustsFontSizeToFit`) rather than wrap mid-word.
- No fixed heights for text containers and no absolute positioning of text; long names, class labels and amounts must wrap or truncate cleanly.
- When a screen is done, say how it was checked at 360dp / 1.3× (a phone, an emulator, or the web preview at 360 × 640 with `?text=1.3&os=android`, see `src/ui/DESIGN.md` "Platform notes") and with what data.

## How we ship

- Branch `stage` (never `main`). Commit as `97426806+vpnbeni@users.noreply.github.com` (check `git config user.email` first), no Co-Authored-By lines. Claude never pushes; the user pushes and runs `deploy-stage` on EC2. Before testing server changes on stage, check `git ls-remote origin stage` shows the commit: a deploy only builds what was pushed.
- After each change: `npx tsc --noEmit` and `npx eslint src` clean, then publish to the phone:
  `EXPO_PUBLIC_API_URL=https://stageapi.capabble.cloud/api npx eas-cli@latest update --channel preview --environment preview --platform android --message "…" --non-interactive`
  and say plainly that it is live (close and reopen the app twice). A new native module needs a new EAS build and a version bump (`appVersion` runtime policy): ask first.
- Server work: `cd ../server && npx jest` (known unrelated failures: duty assignment, tenant signup, empty timetable fixtures). Shared catalog changes: edit `packages/shared`, then `npm run sync:shared` at the root.
- Stage test logins are in the agent's memory, never in the repo. Check each flow against stage with the API calls the screen makes, as the role that uses it.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
