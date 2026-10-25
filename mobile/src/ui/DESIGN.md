# Capabble native kit: working notes

Synced from the design system artifact (claude.ai/artifact/LyYegFLHJxi1rNpnkaqHjH, version `1792780669-579c`, 2026-10-23):
the **Mobile app** section, **Mobile coverage** and the mobile components. Bump this line when you resync.

The app is the design system's mobile layer, built to Apple's standards. Voice, status colours, formats, icons,
school theming and contrast are exactly as on the web: read `client/src/components/ui/DESIGN.md` first. This file
lists what the phone does differently, and **where the two differ, this file wins in the app**.

## Five principles

1. **One big fact first.** Every tab's root opens with what the person came for, in a `Hero`: "₹12,400 due in 5 days".
2. **The next action floats.** A screen's main action is the `ActionBar` above the tab bar, never at the bottom of a scroll.
3. **Content, not chrome.** Bars are translucent (`material-chrome` + blur); cards lift with `shadow-card-m`, not outlines.
4. **Physical and quick.** Press states at once, 0.97 press scale (`PressScale`), springs not linear tweens, haptics on commits. Swipe back everywhere.
5. **Calm, not cute.** Colour comes from tinted tiles and the school's accent. No gradients, illustrations, emoji or confetti.

## Screen anatomy

Tab root, top to bottom: status bar · `NavBar large` (44 + 52, the title collapses into the bar on scroll) · `Hero` ·
`ShortcutGrid` (Home and More only) · `Section`s 32px apart (a `Rail`, `ListGroup` or card) · `ActionBar` 12px above the tab bar ·
`TabBar` (52 + home indicator). Pushed screens: `NavBar` with `back={{ label: 'Notices', onPress }}`, centred title, ≤2 icon actions.

Navigation: tabs for the 4–5 daily places (parents: Home · Calendar · Fees · Notices · More); push to drill in;
`BottomSheet` for a short task or a preview; `ActionSheet` for 2–6 actions on one thing (replaces the "…" Menu);
a full-screen modal only for a multi-step flow. Tapping the active tab scrolls to the top (`MobileScreen` wires `useScrollToTop`).

## Tokens

- From `packages/shared/src/designTokens.json` (a copy of the design system's `tokens.json`) via `src/theme/tokens.ts`.
  Colours from `useTheme().colors`, shadows from `useTheme().shadows` (CSS `boxShadow` strings per theme), sizes from
  `space`, `radius`, `size`. No hex and no magic numbers in screens.
- Grounds: screens `bg`; cards and list groups `surface` + `shadow-card-m` (dark: a faint ring); sheets `surface-raised`;
  bars `Chrome` (`material-chrome` + blur; solid `surface` under Reduce Transparency and on Android); overlays over `scrim`.
- Accent, one per screen: the `ActionBar`, the filled button, the active tab, the soft `Hero`. Rows and tiles never use it.
- Tiles are identity, never status: Calendar 1 · Transport 2 · Fees 3 · Timetable 4 · Attendance 5 · Results 6 (`MODULE_TILE`).
- Radius: `radius-xl` 16 cards, `radius-2xl` 24 sheet tops, `radius-tile` 14 shortcut tiles. Sizes: `touch-min` 44,
  `nav-bar-height` 44, `large-title-height` 52, `tab-bar-height` 52, `row-m` 56, `tile-size` 56, `action-bar-height` 60.
- Light and dark follow the device, or Your login → Appearance. The school's colour replaces the seven accent tokens while
  signed in (`ThemeProvider`, `packages/shared/src/schoolAccent.ts`). Status colours never change.

## Type

Always `<Text variant tone>`. React Native picks a face by family, so weight comes from the variant (Inter 400/500/600/700
are loaded in `app/_layout.tsx`), never `fontWeight`.

| Variant | Size | Use |
|---|---|---|
| `m-hero` | 40/44 · 700 | The one big fact in a `Hero` |
| `m-large-title` | 30/36 · 700 | Large title on tab roots |
| `m-section` | 20/26 · 700 | Headings above rails, grids, groups; sheet titles |
| `m-nav-title` | 17/22 · 600 | The 44px bar's title |
| `m-headline` | 16/22 · 600 | Row and card primary lines, button labels |
| `body-lg` | 16/24 · 400 | Running text |
| `m-subhead` | 14/20 · 400 | Secondary lines |
| `caption` | 12/16 · 500 | Tab labels, timestamps: the floor |

Text scales with the phone's text size; chrome (tab labels, nav titles, buttons) passes `maxFontSizeMultiplier={1.3}`.
Nothing wraps mid-word at large text sizes: chrome labels are one line (`numberOfLines={1}`, shrinking with
`adjustsFontSizeToFit` where space is fixed, like tab labels), and fixed columns (times in `Agenda` and `Timeline`)
grow with the text size up to 1.3×. Check new screens with the phone's text size turned up.
From 1.15× text `ShortcutGrid` drops to 3 columns (labels stay on one line); at the largest sizes `StatTiles` stack. A large title's eyebrow (and Home's school logo) sit on their own line above the title, which shrinks to fit rather than truncating. Inputs are 16px so iOS never zooms.

## Kit (`import { … } from '@/ui'`)

Same names and props as the design system, with React Native conventions: `onClick` is `onPress` (and `onChangeText` on
text inputs), icons are Lucide components (`icon={Bell}`, from `lucide-react-native`), `tile` is a number 1–6, value pickers
call `onChange(value)` and are controlled (no `defaultValue`).

| Component | Key props | Use |
|---|---|---|
| `MobileScreen` | `nav, tabBar \| tabs, actionBar, overlay, refreshing, onRefresh, scroll` | Root of every screen. `tabs` when the tab layout's `TabBar` floats over it. Pads for the bars and safe areas; collapses the large title on scroll |
| `NavBar` | `title, large, eyebrow, back{label,onPress}, leading, trailing, accessory, actions[{icon,label,onPress,badge}]` | Large title on tab roots; inline bar with back on pushed screens. ≤2 actions, the rest in an `ActionSheet`. Android: chevron only, title left |
| `TabBar` | `items[{label,icon,active,badge,onPress}]` | 4–5 nouns, tinted (not a pill), selection haptic. Replaces `BottomNav` |
| `Section` | `title, action{label,onPress}` | `m-section` heading + "See all" |
| `Hero` | `label, value, detail, meta, icon, tone: soft \| strong \| surface, progress, action, ariaLabel` | One per screen. `strong` only for the single most urgent state |
| `ShortcutGrid` | `items[{label,icon,tile,badge,onPress}], columns` | Home (≤8) and More. Tiles scale to 0.94 on press |
| `Rail` + `RailCard` | `title, action`; card `title, eyebrow, meta, icon, tile, badge{label,tone}, width, onPress` | ≤10 cards then "See all"; ≤2 rails per screen; the list screen holds everything |
| `ListGroup` / `ListItem` | `header, footer, items[{title,subtitle,icon,tile,avatar,value,badge,accessory,chevron,tone,onPress,lines}]` or children | iOS inset grouped list: settings, details, fee lines, receipts. Sign out alone in its own group, `tone: 'danger'` |
| `SwipeRow` | `title, subtitle, meta, unread, actions[{label,icon,tone,onPress}], defaultRevealed, onPress, divider` | Notices and messages inside a `ListGroup`. Every swipe action is also on the detail screen and in accessibility actions |
| `DetailList` | `items[{label,value,wide,numeric}], columns: 1 \| 2` | A record's facts, label above value; "—" when missing |
| `StatTiles` | `items[{label,value,detail,tone,icon,tile,onPress}]` | Principal/teacher glance: ≤4, each opens its list |
| `WeekStrip` | `days[{date,weekday,day,today,off,dots}], value, onChange, onWeekChange` | Calendar and timetable day picker; swipe for the next week |
| `Agenda` | `groups[{label,off,items[{time,end,title,meta,color,badge,onPress}]}], empty` | What's on by day |
| `Timeline` | `items[{time,title,detail,state: done \| current \| upcoming,badge}], compact` | Bus stops, a day's periods, a request's progress |
| `MonthPicker` | `value, onChange, today, min, label` | Picking one day, in a `BottomSheet` opened from a date row. Previous/next month arrows; chosen day `accent-strong`, today ringed, days before `min` dimmed. Not in the design system yet: added to our kit |
| `DayGrid` | `year, month, marks{[date]:{tone,label,short}}, today, title, legend[{tone,label}]` | A month of attendance; only days that differ get a tone and a letter |
| `ProgressRing` | `value, label, sublabel, size, stroke, tone, ariaLabel` | A percentage with the plain fact beside it |
| `MobileButton` | `variant: filled \| tinted \| gray \| plain \| destructive, size: large \| medium \| small, icon, fullWidth, loading, disabled, onPress, aria-label` | One filled per view (none when there's an `ActionBar`). Large (50) full width in sheets and status screens |
| `Switch` | `value, onChange, label, disabled` | A setting that applies at once, usually as a `ListGroup` accessory |
| `MobileTextField` | `label, hint, error, type: text \| email \| password \| tel \| number, prefix, icon, multiline, disabled` + TextInput props, `ref` | 50px box, label above; the right keyboard and autofill; password show/hide |
| `NumberCell` | `label, value, onChangeText, invalid, disabled, width` + TextInput props, `ref` | A compact number box (44pt) as a `ListItem` accessory: marks against each student. Grows with the text size up to 1.3×; scrolls above the keyboard; the row's subtitle says what to fix. Not in the design system yet: added to our kit |
| `OTPField` | `length, value, onChange, onComplete, label, hint, error` | Codes, filled by the phone (`one-time-code`) |
| `SearchBar` | `placeholder, value, onChange, onCancel, label` | Above lists longer than ~12 |
| `Stepper` | `value, onChange, min, max, label, hint` | Small counts (how many are coming) |
| `OptionList` | `options[{value,label,meta,icon,tile,avatar,disabled}], value, onChange, multiple, header, footer, label` | Picking from a list, in a `BottomSheet` (choosing closes it) or on a settings screen |
| `ChipRail` | `items[{id,label,count,avatar}], value, onChange, label` | One filter dimension above a list; the chosen chip is `ink`, never the accent |
| `SegmentedControl` | `options[{value,label}], value, onChange, label` | 2–4 short options that apply at once. `label` is the accessible name only: put a visible label above when needed |
| `SlotPicker` | `slots[{value,label,taken}], value, onChange, label, hint, emptyText` | Times three across; taken ones stay, struck through |
| `ChildSwitcher` | `students[{id,name,meta,src}], value, onChange` | Pill in the nav bar for parents with 2+ children (one child: just the avatar). `portal/ChildSwitcher` wraps it with the portal's state |
| `BottomSheet` | `open, onClose, title, description, detent: medium \| large, footer` | Short task or preview. Drags to large, down to close. Footer: large `MobileButton`s, filled on top. No toasts from inside |
| `ActionSheet` | `open, onClose, title, message, actions[{label,icon,tone,onSelect}], cancelLabel` | 2–6 actions; destructive last, then a `Dialog` when it can't be undone |
| `ActionBar` | `summary, detail, label, icon, onPress` | The screen's one main action. Hide it when there's nothing to do; never disabled. `haptic.success()` when it completes |
| `Callout` | `tone, title, icon, action{label,onPress}` + children | Something true until fixed: offline, a deadline, a form problem |
| `StatusView` | `kind: success \| error \| empty \| offline \| permission, title, body, value, icon, details, actions, compact` | Whole-screen or card states. Success plays the success haptic; say whether money moved on errors |
| `NotificationBanner` | `title, body, time, appIcon, onPress` | In-app banner for a push (4 s, unless already on that screen); title ≤40, body ≤110 |
| `Surface` | `padded` (default true) | A borderless mobile card for content that isn't a list (a ring and its fact, a DetailList, a form) |
| `Skeleton` | `width, height, radius, round, lines` | First load only, in the real layout. Shimmer off under Reduce Motion |
| `Dialog` | `open, onClose, title, description, tone, footer` | Only destructive confirms on the phone |
| `Badge`, `Avatar`, `Icon`, `Text` | as before | |

Helpers: `haptic.selection / light / medium / success / error` (no-op on web), `PressScale` (0.97 press + spring),
`useReduceMotion`, `useReduceTransparency`, `Tile`, `MODULE_TILE`, `useFixedColumn(base)` (a fixed column's width
that grows with the text size up to 1.3×: wrap a row's `SegmentedControl` accessory in a `View` that wide).

### Older pieces

The first kit (`Screen`, `Card`, `ListRow`, `Button`, `TextField`, `Sheet`, `SelectField`, `Chips`, `Figure`, `Progress`,
`Banner`, `EmptyState`, `IconButton`, `AgendaList`, `BottomNav`) is retired: every screen now uses the table above. Don't bring them back.

## Pick the component

State the one fact → `Hero` · the screen's main action → `ActionBar` (in a sheet or status screen: a large filled `MobileButton`) ·
into a module → `ShortcutGrid` or a `ListGroup` row with a tile · a few things sideways → `Rail` · records → `ListGroup`
(`SwipeRow`s when rows have quick actions) · what's on → `WeekStrip` + `Agenda` · steps with "now" → `Timeline` · a month of
attendance → `DayGrid` + `ProgressRing` + the plain fact · a record → `DetailList` · 2–4 options at once → `SegmentedControl` ·
filter → `ChipRail` · pick from a list → `OptionList` in a `BottomSheet` · a date → a `ListGroup` row opening `MonthPicker` in a `BottomSheet` · a time → `WeekStrip` + `SlotPicker` · a small count
→ `Stepper` · text → `MobileTextField` / `OTPField` · 2–6 actions → `ActionSheet` · destroy → `Dialog` danger after the
`ActionSheet` · the result of what they did → toast (never from a sheet) · true until fixed → `Callout` · a state → `StatusView`.

## Gestures, motion, haptics

- Tap targets ≥44pt. Swipe back from the left edge on every pushed screen: never put a rail or swipe row at the edge of a pushed screen without the 16px gutter.
- Pull to refresh on every list or dashboard (`onRefresh`), spinner in `accent-strong`.
- Motion: press 0.97 + `fill-pressed`, 100ms in, spring out; sheets spring in (~400ms), scrim fades 200ms; large title collapses with scroll.
  Under Reduce Motion: 150ms cross-fades, no scale, no shimmer.
- Haptics confirm, one per action: selection (switch, segment, chip, tab, day), light (sheet detent, swipe threshold),
  success (paid, submitted, sent), error (failed), medium (destructive confirmed).

## Forms

**The keyboard never covers the field being typed in.** The kit handles it, so screens never do: `MobileScreen`
and `BottomSheet` pad for the keyboard and scroll the focused field above it (and above the `ActionBar`, which
rides on top of the keyboard); `Dialog` centres above it (`src/ui/keyboard.tsx`). Android draws edge to edge, so
the window no longer shrinks for the keyboard and `KeyboardAvoidingView` does nothing there. Rules: put every form
inside a `MobileScreen` or `BottomSheet`; use `MobileTextField` / `OTPField` (they tell their surface when focused);
never wrap a screen in `KeyboardAvoidingView` or add your own keyboard padding; a new scrolling surface with fields
uses `useKeyboardAwareScroll` + `KeyboardRevealProvider`. Check every form on an Android phone with the field at the
bottom of the screen.

Short forms (≤6 fields) in a `BottomSheet`; longer ones are pushed screens with the submit in the `ActionBar`. One column,
label above every field, 16px between fields. The right keyboard every time; Return moves to the next field. Validate on
blur and on submit, never while typing; errors say what to fix, the first one gets focus; a form-level problem is a
`Callout` at the top. Closing a sheet with changes asks "Discard changes?" in an `ActionSheet`.

## States every screen handles

First load: `Skeleton`s with the nav and tab bars already there · Refreshing: old content stays · Empty: compact `StatusView`
in the card ("No notices yet. Circulars from school show here.") · One part failed: that card's `StatusView` error with
"Try again" · Offline: a neutral `Callout` at the top, network actions disabled with the reason · Done: toast in past tense;
for money a full `StatusView` success · No permission: the section is hidden, not disabled.

## Notifications and links

Ask for notifications once, after the first sign-in, with a `StatusView` permission screen showing real `NotificationBanner`
examples before the system prompt. Push copy: the title names the child or the thing, no "Capabble", no exclamation marks.
Every tap lands on the exact thing and marks it read (`lib/notificationLinks.ts`). Shared files use the system share sheet.

## Platform notes

iOS is the reference; Android gets the same layout with its back gesture, no back label, left-aligned titles, no ripples
or FAB. Sensitive screens (results, fees, profile) should hide their content in the app switcher. Screens put the school's
HTML (a circular) in `components/HtmlView` (WebView, JavaScript off), never in `Text`.

## Rejected on mobile

Hamburger menus for primary navigation · a hairline-boxed header on every screen · tables · two primary buttons · a FAB ·
promo banners · gradients and glassy cards (blur is for bars only) · coloured card borders · spinner-only loading · toasts
from inside a sheet · hover-only anything · a disabled ActionBar · feature-tour carousels · selected chips in the accent ·
toasts for errors that need action.

## Open

- Back buttons say "Back" where a screen can be reached from more than one place (Home and More); the design system wants the previous screen's name.
- Gaps the design system hasn't drawn yet: subject result detail, the live bus map (needs `react-native-maps`), the teacher's create-event form.
