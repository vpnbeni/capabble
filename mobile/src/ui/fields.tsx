import { CircleAlert, Eye, EyeOff, Minus, Plus, Search, X, type LucideIcon } from 'lucide-react-native'
import { useRef, useState, type ComponentRef, type Ref } from 'react'
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, radius, space } from '@/theme/tokens'

import { haptic } from './haptics'
import { useRevealOnFocus } from './keyboard'
import { Icon } from './primitives'
import { Text } from './Text'

export type MobileTextFieldRef = ComponentRef<typeof TextInput>

type MobileTextFieldProps = Omit<TextInputProps, 'editable'> & {
  ref?: Ref<MobileTextFieldRef>
  /** Every field has a visible label. */
  label: string
  hint?: string
  /** Says what to fix. Show it after the field loses focus or on submit, never while typing. */
  error?: string | null
  /** Sets the keyboard and autofill: email, a password (with show/hide), a phone number, a number. */
  type?: 'text' | 'email' | 'password' | 'tel' | 'number'
  /** Text before the value, e.g. "₹". */
  prefix?: string
  icon?: LucideIcon
  disabled?: boolean
}

const KEYBOARD: Record<NonNullable<MobileTextFieldProps['type']>, Partial<TextInputProps>> = {
  text: {},
  email: { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false, autoComplete: 'email', inputMode: 'email' },
  password: { autoCapitalize: 'none', autoCorrect: false },
  tel: { keyboardType: 'phone-pad', autoComplete: 'tel', inputMode: 'tel' },
  number: { keyboardType: 'number-pad', inputMode: 'numeric' },
}

/** A form field for the phone: label above, a 50px rounded box, then a hint or an error. Text is 16px so iOS never zooms. */
export function MobileTextField({ ref, label, hint, error, type = 'text', prefix, icon, disabled, multiline, style, onFocus, onBlur, ...props }: MobileTextFieldProps) {
  const { colors } = useTheme()
  const revealOnFocus = useRevealOnFocus()
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const outline = error ? colors['danger-solid'] : focused ? colors['focus-ring'] : colors['border-control']

  return (
    <View style={styles.field}>
      <Text variant="label" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.box,
          multiline && styles.multiBox,
          { backgroundColor: disabled ? colors['surface-sunken'] : colors.surface, boxShadow: `inset 0 0 0 ${focused || error ? 2 : 1}px ${outline}` },
        ]}
      >
        {icon ? <Icon icon={icon} size={18} color={colors['ink-subtle']} /> : null}
        {prefix ? (
          <Text variant="body-lg" tone="muted" style={{ fontFamily: fontFamily[500] }}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors['ink-subtle']}
          selectionColor={colors['accent-strong']}
          {...KEYBOARD[type]}
          secureTextEntry={type === 'password' && !revealed}
          editable={!disabled}
          multiline={multiline}
          {...props}
          onFocus={(event) => {
            setFocused(true)
            revealOnFocus()
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          style={[styles.input, multiline && styles.multiInput, { color: colors.ink }, style]}
        />
        {type === 'password' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((shown) => !shown)}
            hitSlop={4}
            style={styles.reveal}
          >
            <Icon icon={revealed ? EyeOff : Eye} size={20} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.error}>
          <View style={{ marginTop: 2 }}>
            <Icon icon={CircleAlert} size={14} color={colors['danger-ink']} />
          </View>
          <Text variant="label" tone="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

type OTPFieldProps = {
  length?: number
  value: string
  onChange: (value: string) => void
  /** Called once every box is filled. */
  onComplete?: (value: string) => void
  label?: string
  hint?: string
  error?: string | null
}

/** One box per digit for a verification code, filled from the SMS or email by the phone (`one-time-code`). */
export function OTPField({ length = 6, value, onChange, onComplete, label = 'Verification code', hint, error }: OTPFieldProps) {
  const { colors } = useTheme()
  const input = useRef<MobileTextFieldRef>(null)
  const revealOnFocus = useRevealOnFocus()
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.field}>
      <Text variant="label" style={styles.label}>
        {label}
      </Text>
      <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.otpBoxes}>
        {Array.from({ length }, (_, index) => {
          const current = focused && index === Math.min(value.length, length - 1)
          return (
            <View
              key={index}
              style={[
                styles.otpBox,
                {
                  backgroundColor: colors.surface,
                  boxShadow: `inset 0 0 0 ${error || current ? 2 : 1}px ${error ? colors['danger-solid'] : current ? colors['focus-ring'] : colors['border-control']}`,
                },
              ]}
            >
              <Text variant="section-title" numeric style={{ fontSize: 24, lineHeight: 28 }}>
                {value[index] ?? ''}
              </Text>
            </View>
          )
        })}
        <TextInput
          ref={input}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          value={value}
          onChangeText={(text) => {
            const digits = text.replace(/\D/g, '').slice(0, length)
            onChange(digits)
            if (digits.length === length) onComplete?.(digits)
          }}
          onFocus={() => {
            setFocused(true)
            revealOnFocus()
          }}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={length}
          caretHidden
          style={styles.otpInput}
        />
      </Pressable>
      {error ? (
        <Text variant="label" tone="danger">
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

type SearchBarProps = {
  /** Names what is searched: "Search students". */
  placeholder: string
  value: string
  onChange: (value: string) => void
  /** Called by Cancel, after the field is cleared. */
  onCancel?: () => void
  /** Accessible name; defaults to the placeholder. */
  label?: string
}

/** The iOS search field: 40px, sunken, a magnifier, a clear button, and Cancel while focused. */
export function SearchBar({ placeholder, value, onChange, onCancel, label }: SearchBarProps) {
  const { colors } = useTheme()
  const input = useRef<MobileTextFieldRef>(null)
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.search}>
      <View style={[styles.searchField, { backgroundColor: colors['fill-control'] }, focused && { boxShadow: `0 0 0 2px ${colors['focus-ring']}` }]}>
        <Icon icon={Search} size={17} color={colors['ink-subtle']} />
        <TextInput
          ref={input}
          accessibilityLabel={label ?? placeholder}
          accessibilityRole="search"
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors['ink-subtle']}
          selectionColor={colors['accent-strong']}
          returnKeyType="search"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.searchInput, { color: colors.ink }]}
        />
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={13} onPress={() => onChange('')} style={[styles.clear, { backgroundColor: colors['ink-subtle'] }]}>
            <X size={12} color={colors.surface} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>
      {focused ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onChange('')
            input.current?.blur()
            onCancel?.()
          }}
          hitSlop={8}
        >
          <Text variant="m-nav-title" tone="accent" style={{ fontFamily: fontFamily[400] }}>
            Cancel
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

type StepperProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label: string
  hint?: string
}

/** Minus · value · plus for small counts (how many are coming). Larger numbers use a MobileTextField. */
export function Stepper({ value, onChange, min = 0, max = 99, label, hint }: StepperProps) {
  const { colors } = useTheme()
  const step = (next: number) => {
    haptic.selection()
    onChange(Math.min(max, Math.max(min, next)))
  }
  const button = (icon: LucideIcon, next: number, name: string, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => step(next)}
      style={[styles.stepButton, disabled ? { backgroundColor: 'transparent' } : { backgroundColor: colors['surface-raised'], boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }]}
    >
      <Icon icon={icon} size={18} color={disabled ? colors['ink-disabled'] : colors.ink} />
    </Pressable>
  )

  return (
    <View style={styles.stepper}>
      <View style={{ flex: 1 }}>
        <Text variant="body-lg" style={{ fontFamily: fontFamily[500], lineHeight: 22 }}>
          {label}
        </Text>
        {hint ? (
          <Text variant="m-subhead" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? value + 1 : value - 1)}
        style={[styles.stepTrack, { backgroundColor: colors['fill-control'] }]}
      >
        {button(Minus, value - 1, `Fewer ${label.toLowerCase()}`, value <= min)}
        <Text variant="m-nav-title" numeric style={styles.stepValue}>
          {value}
        </Text>
        {button(Plus, value + 1, `More ${label.toLowerCase()}`, value >= max)}
      </View>
    </View>
  )
}

type NumberCellProps = Omit<TextInputProps, 'editable' | 'keyboardType'> & {
  ref?: Ref<MobileTextFieldRef>
  /** Accessible name: "Aarav Beniwal, marks". */
  label: string
  /** Shown in a red ring; the row says what to fix. */
  invalid?: boolean
  disabled?: boolean
  /** Base width before the text size grows it (default 76). */
  width?: number
}

/**
 * A compact number box at the end of a list row (marks against a student). 44pt tall, a fixed
 * column that grows with the text size like `useFixedColumn`, numeric keyboard, Return moves on.
 * Like `MobileTextField`, it scrolls itself above the keyboard. The row (a `ListItem`) carries the
 * visible label; put what to fix in the row's subtitle.
 */
export function NumberCell({ ref, label, invalid, disabled, width = 76, style, onFocus, onBlur, ...props }: NumberCellProps) {
  const { colors } = useTheme()
  const revealOnFocus = useRevealOnFocus()
  const [focused, setFocused] = useState(false)
  const { fontScale } = useWindowDimensions()
  const side = Math.ceil(width * Math.min(Math.max(fontScale, 1), 1.3))
  const outline = invalid ? colors['danger-solid'] : focused ? colors['focus-ring'] : colors['border-control']
  return (
    <View
      style={[
        styles.cell,
        { width: side, backgroundColor: disabled ? colors['surface-sunken'] : colors.surface, boxShadow: `inset 0 0 0 ${focused || invalid ? 2 : 1}px ${outline}` },
      ]}
    >
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholderTextColor={colors['ink-subtle']}
        selectionColor={colors['accent-strong']}
        editable={!disabled}
        maxFontSizeMultiplier={1.3}
        {...props}
        onFocus={(event) => {
          setFocused(true)
          revealOnFocus()
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        style={[styles.cellInput, { color: colors.ink }, style]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  cell: { height: 44, borderRadius: 10, justifyContent: 'center' },
  cellInput: { height: 44, paddingHorizontal: 10, textAlign: 'center', fontFamily: fontFamily[500], fontSize: 16, paddingVertical: 0 },
  label: { fontSize: 14, lineHeight: 20 },
  box: { flexDirection: 'row', alignItems: 'center', gap: space['space-2'], minHeight: 50, paddingHorizontal: 14, borderRadius: 12 },
  multiBox: { alignItems: 'flex-start', paddingVertical: 13 },
  input: { flex: 1, minHeight: 48, fontFamily: fontFamily[400], fontSize: 16, paddingVertical: 0 },
  multiInput: { minHeight: 96, textAlignVertical: 'top' },
  reveal: { width: 36, height: 36, marginRight: -8, alignItems: 'center', justifyContent: 'center' },
  error: { flexDirection: 'row', gap: 6 },
  otpBoxes: { flexDirection: 'row', gap: space['space-2'] },
  otpBox: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  otpInput: { ...StyleSheet.absoluteFill, opacity: 0, fontSize: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space['space-3'] },
  searchField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: 12 },
  searchInput: { flex: 1, height: 40, fontFamily: fontFamily[400], fontSize: 16, paddingVertical: 0 },
  clear: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space['space-3'] },
  stepTrack: { flexDirection: 'row', alignItems: 'center', gap: space['space-1'], padding: 3, borderRadius: radius['radius-full'] },
  stepButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 32, textAlign: 'center' },
})
