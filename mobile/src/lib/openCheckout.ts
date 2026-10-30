import { requireOptionalNativeModule } from 'expo'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'

const scheme = () => {
  const value = Constants.expoConfig?.scheme
  return (Array.isArray(value) ? value[0] : value) || 'capabble'
}

/**
 * Opens Razorpay Checkout in a browser sheet over the app (Safari view / Chrome custom tab),
 * not the phone's browser. The sheet closes by itself when the payment page sends the parent
 * back to `<scheme>://fee-payment/…`; the payment screen underneath then shows the result.
 * Builds made before expo-web-browser was added fall back to the phone's browser.
 */
export const openCheckout = async (url: string) => {
  if (!requireOptionalNativeModule('ExpoWebBrowser')) {
    await Linking.openURL(url)
    return
  }
  const WebBrowser = await import('expo-web-browser')
  try {
    await WebBrowser.openAuthSessionAsync(url, `${scheme()}://fee-payment`, { preferEphemeralSession: true })
  } catch {
    // Another sheet is still open (a double tap); the one showing is enough.
  }
}
