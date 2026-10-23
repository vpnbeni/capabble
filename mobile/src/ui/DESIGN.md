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
| `BottomNav` | `items[{key,label,icon,active,onPress,badge}]` | The tab bar, used by `app/(app)/_layout.tsx` |
| `Icon` | `icon, size, color` | Lucide (`lucide-react-native`) at 1.75 stroke; 22px in the tab bar, 16px inline |

Missing a piece? Add it here in the system's style, document it in this table, then use it.
Next to port: `Sheet` (bottom sheet), `Dialog`, `Tabs`, `SegmentedControl`, `AgendaList`,
`AttendanceGrid` (roll call), `TimetableGrid` (day list), toasts.
