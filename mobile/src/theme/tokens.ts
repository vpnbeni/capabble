// Capabble design tokens for React Native, read from the design system's
// tokens.json (packages/shared/src/designTokens.json). Never hard-code a colour
// or size in a screen: take it from useTheme().
import designTokens from '@capabble/shared/designTokens.json'

type Scheme = 'light' | 'dark'

const colorTokens = designTokens.color.tokens as { name: string; value: string | Record<Scheme, string> }[]

const buildPalette = (scheme: Scheme) => {
  const palette: Record<string, string> = {}
  for (const token of colorTokens) {
    palette[token.name] = typeof token.value === 'string' ? token.value : token.value[scheme] ?? token.value.light
  }
  return palette as Palette
}

export type Palette = {
  bg: string
  surface: string
  'surface-raised': string
  'surface-sunken': string
  'surface-hover': string
  border: string
  'border-strong': string
  'border-control': string
  ink: string
  'ink-muted': string
  'ink-subtle': string
  'ink-disabled': string
  'ink-inverse': string
  accent: string
  'accent-strong': string
  'accent-strong-hover': string
  'on-accent': string
  'accent-soft': string
  'accent-soft-ink': string
  'focus-ring': string
  highlight: string
  'danger-strong': string
  'on-danger': string
  /** Dims what's behind a sheet or dialog. */
  scrim: string
  /** Translucent bars (nav bar, tab bar, action bar) over scrolling content. */
  'material-chrome': string
  /** Pressed rows and plain buttons. */
  'fill-pressed': string
  /** Gray buttons, search fields, segmented control tracks. */
  'fill-control': string
} & Record<`${Tone}-${'ink' | 'soft' | 'border' | 'solid'}`, string> &
  Record<`chart-${TileIndex}`, string> &
  Record<`tile-${TileIndex}` | `tile-${TileIndex}-ink`, string>

/** Shortcut tiles and rail cards cycle through six fills, each with its own ink. */
export type TileIndex = 1 | 2 | 3 | 4 | 5 | 6

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const palettes: Record<Scheme, Palette> = {
  light: buildPalette('light'),
  dark: buildPalette('dark'),
}

export type ShadowName = 'shadow-xs' | 'shadow-overlay' | 'shadow-card-m' | 'shadow-bar' | 'shadow-float'

const shadowTokens = designTokens.shadow.tokens as { name: ShadowName; value: Record<Scheme, string> }[]

/** CSS box-shadow strings per theme, for React Native's `boxShadow` style. */
export const shadows: Record<Scheme, Record<ShadowName, string>> = {
  light: Object.fromEntries(shadowTokens.map((token) => [token.name, token.value.light])) as Record<ShadowName, string>,
  dark: Object.fromEntries(shadowTokens.map((token) => [token.name, token.value.dark])) as Record<ShadowName, string>,
}

const px = (value: string) => Number.parseFloat(value)

const tokenMap = (family: { tokens: { name: string; value: string }[] }) =>
  Object.fromEntries(family.tokens.map((token) => [token.name, px(token.value)]))

/** `space-1` … `space-12`: the 4px grid. */
export const space = tokenMap(designTokens.spacing) as Record<
  'space-1' | 'space-2' | 'space-3' | 'space-4' | 'space-5' | 'space-6' | 'space-8' | 'space-12',
  number
>

export const radius = tokenMap(designTokens.radius) as Record<
  'radius-sm' | 'radius-md' | 'radius-lg' | 'radius-xl' | 'radius-2xl' | 'radius-tile' | 'radius-full',
  number
>

/** Control heights, list rows and shell sizes. The app uses the mobile sizes (`touch-min`, `row-m`, bars). */
export const size = tokenMap(designTokens.size) as Record<
  | 'control-sm'
  | 'control-md'
  | 'control-lg'
  | 'row-compact'
  | 'row-comfortable'
  | 'header-height'
  | 'bottom-nav-height'
  | 'touch-min'
  | 'nav-bar-height'
  | 'large-title-height'
  | 'tab-bar-height'
  | 'row-m'
  | 'tile-size'
  | 'action-bar-height',
  number
>

/** Inter faces loaded in the root layout. React Native picks a face by family name, not by fontWeight. */
export const fontFamily = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const

export type TextVariant =
  | 'page-title'
  | 'section-title'
  | 'card-title'
  | 'body'
  | 'body-lg'
  | 'small'
  | 'label'
  | 'caption'
  | 'stat'
  | 'stat-sm'
  | 'm-hero'
  | 'm-large-title'
  | 'm-nav-title'
  | 'm-section'
  | 'm-headline'
  | 'm-subhead'

type TypeStyle = { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number }

const em = (value: string | undefined, fontSize: number) =>
  value?.endsWith('em') ? Number.parseFloat(value) * fontSize : undefined

const typeStyles = {} as Record<TextVariant, TypeStyle>
for (const group of designTokens.type.groups) {
  for (const style of group.styles as { name: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string }[]) {
    const fontSize = px(style.fontSize)
    typeStyles[style.name as TextVariant] = {
      fontFamily: fontFamily[style.fontWeight as keyof typeof fontFamily] ?? fontFamily[400],
      fontSize,
      lineHeight: px(style.lineHeight),
      letterSpacing: em(style.letterSpacing, fontSize),
    }
  }
}

// On phones the page title steps down to 20/28 (design system: Type).
typeStyles['page-title'] = { ...typeStyles['page-title'], fontSize: 20, lineHeight: 28 }

export const type = typeStyles
