// Keeps the focused field above the on-screen keyboard, on iOS and Android alike.
// Android draws edge to edge, so the window no longer shrinks for the keyboard and
// KeyboardAvoidingView alone leaves fields underneath it. Every scrolling surface in the
// kit (MobileScreen, BottomSheet) uses this; screens never handle the keyboard themselves.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Dimensions, Keyboard, Platform, ScrollView, TextInput, type KeyboardEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'

/** Space kept between the focused field and the keyboard (or a bar floating above it). */
const GAP = 16

/** How many pixels at the bottom of the window the keyboard covers (0 when it's closed, or when the window resized for it). */
export function useKeyboardCover() {
  const [cover, setCover] = useState(0)
  useEffect(() => {
    // iOS announces the keyboard before it moves; Android only after.
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = (event: KeyboardEvent) => setCover(Math.max(0, Dimensions.get('screen').height - event.endCoordinates.screenY))
    const shown = Keyboard.addListener(show, onShow)
    const changed = Keyboard.addListener('keyboardDidChangeFrame', onShow)
    const hidden = Keyboard.addListener(hide, () => setCover(0))
    return () => {
      shown.remove()
      changed.remove()
      hidden.remove()
    }
  }, [])
  return cover
}

/** The surface whose field has focus: only it scrolls when the keyboard opens (not the screen behind a sheet). */
let activeSurface: object | null = null

/** Fields call this when they gain focus, so the surface they're in scrolls them into view. */
const RevealContext = createContext<() => void>(() => {})
export const KeyboardRevealProvider = RevealContext.Provider
export const useRevealOnFocus = () => useContext(RevealContext)

/**
 * For a ScrollView: the keyboard's cover (to pad the content with), an onScroll to pass on,
 * and `reveal`, which scrolls the focused field up just enough to sit above the keyboard
 * and anything floating over it (`keepClear`, e.g. the ActionBar).
 */
export function useKeyboardAwareScroll(scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>, keepClear = 0) {
  const cover = useKeyboardCover()
  const offset = useRef(0)
  const [id] = useState(() => ({}))
  const latest = useRef({ cover, keepClear })
  useEffect(() => {
    latest.current = { cover, keepClear }
  })

  const reveal = useCallback(() => {
    // Wait a frame so the padding for the keyboard is laid out before measuring.
    setTimeout(() => {
      const input = TextInput.State?.currentlyFocusedInput?.() as { measureInWindow?: (callback: (x: number, y: number, w: number, h: number) => void) => void } | null
      const { cover: hidden, keepClear: clear } = latest.current
      if (!input?.measureInWindow || !hidden) return
      input.measureInWindow((_x, y, _w, h) => {
        const limit = Dimensions.get('window').height - hidden - clear - GAP
        const overlap = y + h - limit
        if (overlap > 0) scrollRef.current?.scrollTo({ y: offset.current + overlap, animated: true })
      })
    }, 60)
  }, [scrollRef])

  // When the keyboard opens (or changes height), bring the focused field above it.
  useEffect(() => {
    if (cover && activeSurface === id) reveal()
  }, [cover, reveal, id])

  /** For the RevealContext: a field in this surface got focus. */
  const onFieldFocus = useCallback(() => {
    activeSurface = id
    reveal()
  }, [id, reveal])

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y
  }, [])

  return { cover, onScroll, reveal: onFieldFocus }
}
