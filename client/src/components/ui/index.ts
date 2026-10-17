/**
 * Capabble design system for the workspace app.
 *
 * TypeScript ports of the design system's components (same markup and class names as
 * its bundle), styled by src/styles/capabble/*.css. Anything rendered with these must
 * sit inside a `.cb-app` element — use <Page> at the root of a screen. Overlays portal
 * into their own `.cb-app` wrapper.
 */
export { Icon, Button, Badge, Progress, Ring, ColumnChart, Avatar } from './primitives'
export type { Tone, ButtonProps, RingSegment, ColumnChartItem } from './primitives'
export { TextField, TextArea, Select, Checkbox, Switch, RadioGroup } from './forms'
export { Combobox } from './Combobox'
export type { ComboboxOption } from './Combobox'
export type { SelectOption } from './forms'
export { Page, Card, StatCard, PageHeader, Tabs, FilterBar, EmptyState, Banner, DetailList, Figure, MetricTile, MetricTiles, Entity, CardToolbar, Pagination, PdfFrame } from './layout'
export { DataTable } from './DataTable'
export { useRowSelection, BulkBar, BulkResultDialog } from './bulk'
export type { BulkResult, BulkFailure } from './bulk'
export type { DataTableColumn, DataTableSelection } from './DataTable'
export { Dialog, Sheet, Menu } from './overlays'
export type { MenuItem } from './overlays'
export { PaperStage, Paper, PaperCopies, PAPER_PAGES_CLASS, FormatToolbar } from './paper'
export { cx, formatINR, formatDate, formatTime, orDash, initials } from './format'
