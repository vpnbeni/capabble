// The Capabble native kit: the design system's Companion surface and its Mobile app layer. See ./DESIGN.md.
export { Text, type TextTone } from './Text'
export { Avatar, Badge, Icon, initials } from './primitives'
export { Skeleton } from './feedback'
export { Dialog, ToastProvider, useToast } from './overlays'
export { DetailList } from './data'

export { haptic } from './haptics'
export { PressScale, useReduceMotion, useReduceTransparency } from './motion'
export { MobileScreen, NavBar, TabBar, type NavAction, type TabBarItem } from './screen'
export {
  Hero,
  ListGroup,
  ListItem,
  MODULE_TILE,
  Rail,
  RailCard,
  Section,
  ShortcutGrid,
  StatTiles,
  Surface,
  Tile,
  type ListGroupItem,
  type ShortcutItem,
  type StatTile,
  type TileIndex,
} from './content'
export { SwipeRow, type SwipeAction } from './swipe'
export { Agenda, DayGrid, ProgressRing, Timeline, WeekStrip, useFixedColumn, type AgendaDay, type AgendaItem, type DayMark, type TimelineItem, type WeekDay } from './dates'
export { MobileButton, Switch, type MobileButtonVariant } from './buttons'
export { MobileTextField, OTPField, SearchBar, Stepper, type MobileTextFieldRef } from './fields'
export { ChildSwitcher, ChipRail, OptionList, SegmentedControl, SlotPicker, type ChipItem, type ChoiceOption, type Slot, type SwitcherStudent } from './choosers'
export { ActionBar, ActionSheet, BottomSheet, type SheetAction } from './sheets'
export { Callout, NotificationBanner, StatusView, type StatusKind } from './states'
