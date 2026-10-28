import { useCallback, useMemo, useRef, useState, type ComponentType, type Ref } from 'react'
import { Linking, View } from 'react-native'
import { WebView, type WebViewProps } from 'react-native-webview'

import { busMapHtml } from './busMapHtml'
import { useBusMap, type BusMapProps } from './useBusMap'

// The package types WebView without its ref; it does forward one with injectJavaScript.
type WebViewHandle = { injectJavaScript: (script: string) => void }
const MapWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>

// Map tiles need a real page address to be served (OpenStreetMap checks the Referer).
const BASE_URL = 'https://capabble.cloud/'

/**
 * The school vehicle on a map, driving along the road between its stops. Leaflet in a
 * WebView (no extra native module); the app sends it what to draw.
 */
export function BusMap(props: BusMapProps & { height?: number }) {
  const web = useRef<WebViewHandle | null>(null)
  const [ready, setReady] = useState(false)
  const html = useMemo(() => busMapHtml('Recentre'), [])
  const send = useCallback((message: string) => {
    web.current?.injectJavaScript(`window.cbMapApply && window.cbMapApply(${JSON.stringify(message)}); true;`)
  }, [])
  useBusMap(props, ready, send)

  return (
    <View style={{ height: props.height ?? 300 }} accessible accessibilityRole="image" accessibilityLabel={props.accessibilityLabel}>
      <MapWebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: BASE_URL }}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={(event) => {
          try {
            if (JSON.parse(event.nativeEvent.data)?.type === 'ready') setReady(true)
          } catch {
            // Not ours.
          }
        }}
        onLoadStart={() => setReady(false)}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === BASE_URL || request.url.startsWith('about:')) return true
          // The map's attribution links open in the browser, never inside the map.
          if (/^https?:/i.test(request.url)) Linking.openURL(request.url)
          return false
        }}
      />
    </View>
  )
}
