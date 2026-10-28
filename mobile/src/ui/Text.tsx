import { Text as RNText, type TextProps as RNTextProps } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { previewTextStyle } from './preview'
import { type, type TextVariant, type Tone } from '@/theme/tokens'

export type TextTone = 'ink' | 'muted' | 'subtle' | 'accent' | 'on-accent' | Tone

type TextProps = RNTextProps & {
  variant?: TextVariant
  tone?: TextTone
  /** Tabular figures for numbers in stats, lists and money. */
  numeric?: boolean
}

/** All text in the app. `body-lg` is the companion default (16px); nothing goes below `caption` (12px). */
export function Text({ variant = 'body-lg', tone = 'ink', numeric, style, maxFontSizeMultiplier = 1.6, ...props }: TextProps) {
  const { colors } = useTheme()
  const color =
    tone === 'ink'
      ? colors.ink
      : tone === 'muted'
        ? colors['ink-muted']
        : tone === 'subtle'
          ? colors['ink-subtle']
          : tone === 'accent'
            ? colors['accent-strong']
            : tone === 'on-accent'
              ? colors['on-accent']
              : colors[`${tone}-ink`]

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
      style={previewTextStyle([type[variant], { color }, numeric && { fontVariant: ['tabular-nums'] }, style], maxFontSizeMultiplier ?? 1.6)}
    />
  )
}
