import { useState, type ComponentRef, type Ref } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, radius, size, space } from '@/theme/tokens'

import { Text } from './Text'

export type TextFieldRef = ComponentRef<typeof TextInput>

type TextFieldProps = TextInputProps & {
  ref?: Ref<TextFieldRef>
  /** Every field has a visible label. */
  label: string
  hint?: string
  /** Says what to fix: "Enter your password". */
  error?: string | null
}

/** A labelled input, 44px tall with 16px text (iOS doesn't zoom), outlined in border-control. */
export function TextField({ ref, label, hint, error, style, onFocus, onBlur, ...props }: TextFieldProps) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors['ink-subtle']}
        selectionColor={colors['accent-strong']}
        {...props}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          {
            color: colors.ink,
            backgroundColor: props.editable === false ? colors['surface-sunken'] : colors.surface,
            borderColor: error ? colors['danger-solid'] : focused ? colors['focus-ring'] : colors['border-control'],
            borderWidth: focused || error ? 2 : 1,
          },
          style,
        ]}
      />
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: space['space-1'] + 2 },
  input: {
    minHeight: size['control-lg'],
    paddingHorizontal: space['space-3'],
    borderRadius: radius['radius-sm'],
    fontFamily: fontFamily[400],
    fontSize: 16,
  },
  multiline: {
    minHeight: 96,
    paddingTop: space['space-3'],
    paddingBottom: space['space-3'],
    textAlignVertical: 'top',
  },
})
