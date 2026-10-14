/**
 * Capabble design system for the workspace app.
 *
 * TypeScript ports of the design system's components (same markup and class names as
 * its bundle), styled by src/styles/capabble/*.css. Anything rendered with these must
 * sit inside a `.cb-app` element — use <Page> at the root of a screen. Overlays portal
 * into their own `.cb-app` wrapper.
 */
export { Icon, Button, Badge, Progress, Avatar } from './primitives'
export type { Tone, ButtonProps } from './primitives'
export { TextField, TextArea, Select, Checkbox, Switch } from './forms'
export type { SelectOption } from './forms'
export { Page, Card, StatCard, PageHeader, Tabs, FilterBar, EmptyState, Banner, DetailList } from './layout'
export { DataTable } from './DataTable'
export type { DataTableColumn, DataTableSelection } from './DataTable'
export { Dialog, Sheet, Menu } from './overlays'
export type { MenuItem } from './overlays'
export { cx, formatINR, formatDate, orDash, initials } from './format'
