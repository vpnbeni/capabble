import { Linking } from 'react-native'
import { WebView } from 'react-native-webview'

/** Shows a full HTML page with JavaScript off. Links open in the phone's browser, never inside the app. */
export function HtmlView({ html }: { html: string }) {
  return (
    <WebView
      originWhitelist={['about:*']}
      source={{ html }}
      javaScriptEnabled={false}
      domStorageEnabled={false}
      allowFileAccess={false}
      setSupportMultipleWindows={false}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url.startsWith('about:')) return true
        if (/^(https?|mailto|tel):/i.test(request.url)) Linking.openURL(request.url)
        return false
      }}
    />
  )
}
