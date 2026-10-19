# Capabble design system — working copy

Synced from the design system artifact (claude.ai/artifact/LyYegFLHJxi1rNpnkaqHjH, version `1791963230-61be`, 2026-10-15).
The artifact is the source of truth. This file is the condensed version **mapped to our kit**
(`@/components/ui`, styles in `client/src/styles/capabble/`). The artifact's own component
API (`window.Capabble`, icon name strings, `rowKey`, …) does not match our kit; use the props below.

When the artifact changes, resync this file and bump the version line.

## Rules that are easy to get wrong

- Every redesigned screen renders inside `<Page>` (it applies `.cb-app`; all `.cb-*` styles are scoped to it).
- Build only from the kit. If something is missing, add it to the kit (`components/ui/*` + `styles/capabble/*.css`) in the system's style first, then use it. No page-local look-alikes.
- Pages don't render their own `PageHeader` for the title: the title/subtitle/back button come from the module's `titleMap` in `components/layout/Header.tsx`.
- Rejected as "AI-generated", never do: icon-tile quick-link grids, tinted tiles with coloured left stripes, coloured headline percentages ("18% · Behind"), gradients, glass, coloured card borders, emoji, icons on everything, filler stats.
- At most 4 `StatCard`s per row, each tied to a decision. Dashboards: stats row (`.cb-stats`), then cards in `.cb-grid-8-4` or `.cb-grid-6-6`.
- Overlays: always the kit's `Dialog` / `Sheet` (they portal to `document.body`). Never an inline `fixed inset-0`. See `.cursor/rules/dialogs-and-overlays.mdc`.
- Module CSS: one file per module, classes prefixed (`.cb-app .ac-*`, `.aa-*`), tokens only — no hex, no Tailwind colours, no inline styles.

## Voice

- Plain English, sentence case. No all-caps, exclamation marks or emoji.
- Never show module codes in the UI: Students, Staff, Attendance, Academics, Timetable, Activities, Clinic, Assets, Finance, Transport, Exams, Exam centre.
- School words: Class 7-A (not "7th-A"), Term 2, Session 2026–27, admission no., roll no., PTM, "fee" (never "invoice").
- Buttons start with a verb and say the outcome: "Record payment", "Publish homework". Never "Submit", "OK", "Yes".
- Errors say what to fix: "Marks can't be more than 20". Never "Invalid input".
- Empty states: a fact + the next step ("No leave requests waiting"). Never "Oops!".
- Workspace copy is neutral ("3 waiting for your approval").

## Colour (tokens in `styles/capabble/tokens.css`, generated — don't edit)

- Grounds: page `bg`; cards, tables, sidebar, header `surface`; menus/dialogs `surface-raised`; table headers, tracks, read-only fields `surface-sunken`.
- Lines: `border` for hairlines; every input/select/secondary button uses `border-control`.
- Text: `ink` primary, `ink-muted` secondary, `ink-subtle` only for timestamps, placeholders, column headers.
- Accent = the school's colour, one per screen: `accent-strong` (primary button, links), `accent-soft` + `accent-soft-ink` (selected item), `accent` (marks only: icons, tab underline, progress). `highlight` is decorative only.
- Status tones are fixed; always pair colour with a word or icon:

| Tone | Means |
|---|---|
| `success` | paid, present, approved, published, completed, delivered, active |
| `warning` | pending, partially paid, on leave, due soon, on hold, needs review |
| `danger` | overdue, absent, rejected, cancelled, failed, missing |
| `info` | due (not late), scheduled, upcoming, in progress, new, planned |
| `neutral` | draft, archived, holiday, waived, inactive, not started |

- Categories (Class 10/12, day scholar, teaching staff) are `Badge` with `dot={false}`, `neutral` or `info`.
- Charts: `--chart-1` … `--chart-6` in order, with labels/legend.
- Destructive actions: `variant="danger"` button, only inside a `Dialog tone="danger"`.

## Type, space, shape

- Inter 400/500/600. Scale: page-title 24/32, section-title 18/26 (`.cb-section-title`), card-title 15/22, body 14/20, small/label 13/18, caption 12/16. **12px is the floor.** Numbers use tabular figures.
- 4px grid (`--space-1` … `--space-12`). Card padding `space-5` (phones `space-4`), gaps between cards `space-6`.
- Radius: `--radius-sm` 6 (controls, badges), `--radius-md` 8 (menus), `--radius-lg` 12 (cards, dialogs).
- Elevation: borders separate things; only floating layers get `--shadow-overlay`.
- Workspace density: 40px table rows, 13px cells, 36px controls.

## Formats (`@/components/ui` → `format.ts`)

- Money `formatINR(n)` → ₹1,25,000; stats `formatINR(n, { compact: true })` → ₹18.4 L.
- Dates `formatDate(d)` → 7 Oct 2026; `{ year: false }` inside the current year. Times `formatTime('14:30')` → 2:30 pm.
- Missing values `orDash(v)` → "—". Also: `cx`, `initials`.

## Icons

Lucide (`lucide-react`), passed as components: `icon={Plus}`. 1.75 stroke is applied by the kit. 16px inline/buttons, 20px side nav. Icon-only buttons need `aria-label`. Check the icon exists in our lucide version (e.g. `NotebookPen` doesn't).

## Choosing a control

- Overlay by size: `Dialog` for a decision or ≤4 fields; `Sheet` for 5–10 fields or a record preview; a page for anything longer.
- Choice by count: `RadioGroup` 2–5; `Select` ≤15; `Combobox` for long/searchable lists (students, teachers, subjects).
- On/off: `Switch` applies immediately; `Checkbox` inside a saved form.
- Dates: `TextField type="date"` (the system's DatePicker/Calendar aren't ported yet).
- Times from a fixed set of slots: `SlotPicker`. A free-form time: `TextField type="time"`.

## Kit components (`import { … } from '@/components/ui'`)

| Component | Key props | Use |
|---|---|---|
| `Page` | `width?: 'default' \| 'full'` | Root of every screen |
| `Card` | `title, subtitle, action, footer, flush, fill, bodyClassName` | Every widget. `flush` when the body is a DataTable; `fill` for equal-height rows. No nested cards |
| `CardToolbar` | children | Padded strip at the top of a flush Card (holds FilterBar / Tabs) |
| `StatCard` | `label, value, unit, delta{value,direction,tone}, hint, icon, progress, progressTone` | Headline numbers, ≤4 per row. `delta.tone` is a judgement |
| `PageHeader` | `title, subtitle, back{label,onClick}, actions` | Rarely needed (Header.tsx provides titles) |
| `Tabs` | `items[{id,label,count}], value, onChange, variant: 'underline' \| 'segmented'` | Switch views; never perform actions |
| `FilterBar` | `search{value,onChange,placeholder}, chips[{id,label,count,active}], onChipClick, filters, actions` | One per list, directly above it. `filters` takes compact `Select size="sm"` |
| `DataTable<R>` | `columns, rows, getRowKey, onRowClick, loading, loadingLabel, empty, footer, sort, onSort, selection, density, caption, maxHeight` | Most lists. Whole row clickable (no "View" link). Status Badge in the last column |
| column | `key, header, render, align, numeric, width, mobile: 'title' \| 'subtitle' \| 'aside' \| 'hidden', sortable, interactive, headerLabel, wrap` | Mark 2–4 columns `hidden` on phones; `interactive` for inline controls/Menu; `header: ''` + `headerLabel` for the "…" column |
| `Pagination` | `page, pages, total, limit, onPageChange, pageSize?, pageSizeOptions?, onPageSizeChange?` | In DataTable `footer` |
| `useRowSelection`, `BulkBar`, `BulkResultDialog` | `useRowSelection(rows, getId, {resetKey, rowLabel, isSelectable})`; `BulkBar{count, noun, onClear, busy}` | Bulk actions |
| `EmptyState` | `icon, title, body, action (node or array), compact` | Empty lists/cards. `compact` inside cards. Not for errors |
| `Banner` | `tone, title, children, onDismiss` | Inline page message |
| `DetailList` | `items[{label,value,wide}], columns: 1 \| 2 \| 3` | Record details; empty → "—" |
| `MetricTile` / `MetricTiles` | `label, value, hint, tone` | Small sunken metrics inside a Card |
| `Figure` | `value, caption` | Headline amount + caption, with Progress under it |
| `Entity` | `primary, secondary` | First table column / list row |
| `Button` | `variant: primary \| secondary \| tertiary \| danger, size: sm \| md \| lg, icon, iconRight, loading, fullWidth` | One primary per view. Card actions are `sm`/`tertiary` |
| `Badge` | `tone, dot (default true), size: 'sm' \| 'lg'` | Status, 1–3 words |
| `Ring` | `segments[{value,tone}], max, size: 'sm' \| 'lg', label, children` | Donut for a part-of-whole (present / absent / half day). Centre content in children; keep centre numbers ≤ 28px (lg) or 13px (sm). Never the only carrier of the number: legend or label beside it |
| `ColumnChart` | `items[{label,value,caption,tone,detail,detailLabel}], max, target{value,label}, unit, label` | Same measure across categories (attendance % per class). Fixed 0–max scale, value above each column, optional dashed target. Accent by default; warning/danger only for columns below target. `detail` puts a `HoverCard` on that column (e.g. who is absent) |
| `Progress` | `value, max, label, valueLabel, showValue, tone, size: 'sm'` | Per-class figures: label + valueLabel ("12 of 30 topics"); stack in `.cb-progress-list` |
| `Avatar` | `name, src, size, square` | People; school logo is `square` |
| `Icon` | `icon, size, label` | Lucide glyph at system stroke |
| `TextField` / `TextArea` | `label, hint, error, required` + input props; TextField `prefix, suffix, icon, size` | Every field has a visible label |
| `Select` | `label, options (string \| {value,label,disabled}), placeholder, size` | Native dropdown |
| `Combobox` | `options[{value,label,meta,keywords}], value, onChange, selectedLabel, clearable, placeholder` | Searchable picker; no free text |
| `SlotPicker` | `slots[{start, end, state: 'free' \| 'busy' \| 'caution', reason}], value, onChange, allowCaution, loading, emptyText` + field chrome | Picking a time slot (appointments). Busy slots stay visible and struck through; `caution` (e.g. a teaching period) is dashed and pickable only with `allowCaution`. Not in the artifact yet: added to our kit |
| `Checkbox` / `Switch` / `RadioGroup` | `checked, onChange(bool)`; RadioGroup `options, value, onChange, variant: 'list' \| 'cards'` | |
| `Dialog` | `open, onClose, title, description, tone: 'default' \| 'danger', size: sm \| md \| lg, footer` | Confirmations, ≤4 fields |
| `Sheet` | `open, onClose, title, description, icon, size: sm \| md \| lg \| xl, footer, onSubmit` | Forms; `onSubmit` wraps body+footer in a `<form>`. Bottom sheet on phones |
| `HoverCard` | `content, label, focusable, children` | Light card behind a figure: the short list it counts (absent students) and one link to the page that owns it. Opens on hover, focus and tap (never hover-only); body uses `.cb-hovercard__title`, `__list`/`__row` (a `Link` row), `__more`, `__footer` with a `.cb-link`. Not in the artifact yet: added to our kit |
| `Menu` | `items[{label, icon, hint, onSelect, tone:'danger', disabled} \| {divider:true}], label, align, trigger` | "…" row/card actions; destructive last and still confirm |
| `PaperStage`, `Paper`, `PaperCopies`, `FormatToolbar` | `Paper pageSize: 'A4' \| 'legal' \| 'letter'` | Print previews (paper stays white in both themes) |
| `PdfFrame` | `src, title, toolbar` | Embedded PDF preview |

Toasts: `react-hot-toast` (`toast.success`, `toast.error`); the `Toaster` is in `main.tsx`. Services opt out of the global axios toasts with `_silent: true` (see `cpitlService.ts`).

## Layout helpers (`styles/capabble/app.css`)

`.cb-stats` (4-col stat row) · `.cb-grid-8-4` · `.cb-grid-6-6` · `.cb-grid-3` · `.cb-stack` (vertical gap 24) ·
`.cb-form-section` + `.cb-form-section__title` · `.cb-form-grid` (2-col; `--3`; child `.is-wide` spans) ·
`.cb-logo-field` › `.cb-logo-preview` (img, never cropped) + `.cb-logo-field__body` (label, hint, Button): logo uploads; not in the artifact yet ·
`.cb-check-grid` · `.cb-progress-list` (`--grid`) · `.cb-card-actions` · `.cb-table-state` (+ `.cb-spinner`, loading) ·
text: `.cb-muted` `.cb-subtle` `.cb-strong` `.cb-subhead` `.cb-section-title` `.cb-link` `.cb-visually-hidden`.

## Page recipes

- **List page** (`pages/asets/AsetsAssets.tsx`, `pages/acdmc/AcdmcLessonPlan.tsx`): `Page` › `Card flush` › `CardToolbar` › `FilterBar` (search, status chips with counts, compact Selects, primary action) › `DataTable` (empty state for "no data" vs "no matches", `Pagination` footer) + create/edit `Sheet` + danger `Dialog`.
- **Detail page** (`AsetsAssetDetail.tsx`, `AcdmcWorkDetail.tsx`): summary `Card` (title, subtitle, action = status Badge + one primary + `Menu`) with `DetailList`, then `Tabs` and section cards. Loading/not-found use `Card` + `EmptyState`. Back button via Header.tsx.
- **Overview** (`AsetsDashboard.tsx`, `AcdmcOverview.tsx`): `.cb-stats` with ≤4 StatCards, then `.cb-grid-8-4` cards with `Progress` rows / plain lists, each with a compact EmptyState.
- **Data**: service in `services/<module>Service.ts`, React Query hooks in `hooks/use<Module>.ts`, invalidate the module key on writes.

## Mobile

Touch targets ≥44px in the companion app. Nothing hover-only (row actions in a `Menu`). Tables turn into cards under 600px by themselves; only timetable and attendance grids may scroll sideways. Dialogs/Sheets become bottom sheets. Check every new screen at 375px.
