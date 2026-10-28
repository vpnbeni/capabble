import { Platform, StyleSheet, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native'

/**
 * Web preview settings, from the page's URL: `?text=1.3` (text size) and `?os=android` (Android's nav
 * bar). They let a browser at 360 × 640 stand in for a small Android phone with larger text.
 */
const params = Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null

/** Android layout (chevron-only back, title on the left): on Android, or the web preview with `?os=android`. */
export const androidLayout = Platform.OS === 'android' || params?.get('os') === 'android'

/**
 * The phone's text size. On iOS and Android this is the system setting and React Native scales text
 * itself. A web browser always reports 1, so the web preview takes `?text=1.3` in its URL and the kit
 * scales text by hand: that is how screens are checked at 360dp with 1.3× text without an Android phone.
 */
const previewScale = (() => {
  if (!params) return 1
  const value = Number(params.get('text'))
  return Number.isFinite(value) && value >= 1 && value <= 2 ? value : 1
})()

export const useFontScale = () => {
  const { fontScale } = useWindowDimensions()
  return Platform.OS === 'web' ? previewScale : fontScale
}

/** Web preview only: the text style grown as Android would, up to `max` (the `maxFontSizeMultiplier`). */
export const previewTextStyle = (style: StyleProp<TextStyle>, max = 1.6): StyleProp<TextStyle> => {
  if (previewScale === 1) return style
  const scale = Math.min(previewScale, max)
  const { fontSize, lineHeight } = StyleSheet.flatten(style) ?? {}
  return [style, { fontSize: fontSize ? fontSize * scale : undefined, lineHeight: lineHeight ? lineHeight * scale : undefined }]
}
