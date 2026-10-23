# Capabble native kit — working notes

The app is the design system's **Companion** surface. The rules are the same as the web's:
read `client/src/components/ui/DESIGN.md` first (voice, colour and status rules, choosing a
control, rejected patterns). This file only lists what is different on the phone.

## Tokens
- From `packages/shared/src/designTokens.json` (a copy of the design system's `tokens.json`) via
  `src/theme/tokens.ts`. Take colours from `useTheme().colors`, sizes from `space`, `radius`, `size`.
  No hex, no inline magic numbers in screens.
- Light and dark follow the device. The school accent (`applySchoolTheme`) is not ported yet.
- Text is always `<Text variant tone>`. React Native picks a font by family, so weights come from
  the variant (`Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`), never `fontWeight`.

## Companion sizes
- Default text `body-lg` (16px); `body` (14) for secondary paragraphs; 12px is the floor.
- Controls 44px (`control-lg`), list rows 52px (`row-comfortable`), header 56px, tab bar 64px plus the safe area.
- Gutters `space-4`, card padding `space-4`, gaps between cards `space-6`.
- Inputs use 16px text so iOS doesn't zoom.

## Kit (`import { … } from '@/ui'`)

| Component | Key props | Use |
|---|---|---|
| `Screen` | `title, leading, headerAction, refreshing, onRefresh` | Root of every screen (safe area, header, scroll, pull to refresh) |
| `Card` | `title, subtitle, action, flush` | Every group of content; `flush` when the body is `ListRow`s. No nested cards |
| `ListRow` | `primary, secondary, leading, trailing, onPress, divider, tone` | Lists (phones get lists, not tables). Rows that open something show a chevron |
| `Button` | `label, variant, icon, loading, disabled, fullWidth` | One primary per screen; label starts with a verb |
| `Badge` | `label, tone, dot` | Status, 1–3 words; categories `dot={false}` |
| `Avatar` | `name, src, size, square` | People; `square` for a school logo on its white tile |
| `TextField` | `label, hint, error` + TextInput props, `ref` | Every field has a visible label; errors say what to fix |
| `Banner` | `tone, title, children` | Inline message on a screen |
| `EmptyState` | `icon, title, body, action` | Empty lists and load errors inside a card |
| `Skeleton` | `width, height, round` | Sketch the real layout while loading, never a lone spinner |
| `BottomNav` | `items[{key,label,icon,active,onPress,badge}]` | The tab bar, used by `app/(app)/(tabs)/_layout.tsx` |
| `Icon` | `icon, size, color` | Lucide (`lucide-react-native`) at 1.75 stroke; 22px in the tab bar, 16px inline |
| `IconButton` | `icon, label, onPress, disabled` | Icon-only, 44px target; `label` is what screen readers say (back, month arrows, close) |
| `SegmentedControl` | `label, options[{value,label}], value, onChange` | One of 2–4 short options that applies at once (an RSVP answer). Not for switching screens |
| `Chips` | `label, options, value, onChange` | Quick filter above a list (whose dates). Scrolls sideways |
| `Figure` + `Progress` | `label, value, caption`; `value, max, label, tone` | A headline amount with how far it has got (fees still due, paid so far). Phones fit one headline number, not a row of tiles |
| `Sheet` | `open, onClose, title, description, footer` | Bottom sheet for a record's details or a short form. One primary button inside; "Done" is secondary when the body has its own action |
| `ToastProvider` / `useToast()` | `toast(message, tone)` | Brief confirmation above the tab bar. Never from inside a Sheet (it would sit under it): show the result or the error in the sheet |
| `AgendaList` | `groups[{date,off,dayLabel,entries}], today, onEntryPress, empty` | Items by day with Today / Tomorrow headings, time, a chart-colour dot and the item's words. The calendar's phone view |
| `Dialog` | `open, onClose, title, description, tone, footer, children` | A decision in the middle of the screen (cancel a meeting), ≤4 fields. Destructive: `Button variant="danger"` last in the footer |
| `DetailList` | `items[{label,value,wide}], columns: 1 \| 2` | Record details, label above value; `columns={2}` pairs short values, `wide` gives a long one its own row |
| `DayGrid` | `days[{date,tone,label,muted}], today, label` | A Monday-first month (attendance). Only days that differ from normal get a tone, always with a word |
| `SelectField` | `label, options[{value,label,meta}], value, onChange, placeholder, hint, error` | The phone's Select: a field that opens a sheet of options |
| `SlotPicker` | `label, slots[{start,end,open}], value, onChange, emptyText, hint` | Times from a fixed set; taken ones stay visible, struck through |
| `TextField multiline` | same as TextField | Longer free text (a reason, an agenda), 96px tall |

Screens put the school's HTML (a circular) in `components/HtmlView` (WebView, JavaScript off,
links open in the browser), never in `Text`. The Sheet backdrop is the one place with a raw
rgba value: the design system has no scrim token yet.

Missing a piece? Add it here in the system's style, document it in this table, then use it.
Next to port: `Tabs`, `MiniCalendar`, `AttendanceGrid` (the teacher's roll call).
Screens with a form longer than a sheet (request a meeting) are their own stack screen, not a Sheet.
