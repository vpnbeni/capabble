import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import { busMapHtml } from './busMapHtml'
import { useBusMap, type BusMapProps } from './useBusMap'

/** Web preview: the same map page in an iframe, talked to with postMessage. */
export function BusMap(props: BusMapProps & { height?: number }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const send = useCallback((message: string) => frame.current?.contentWindow?.postMessage(message, '*'), [])
  useBusMap(props, ready, send)
  const html = useMemo(() => busMapHtml('Recentre'), [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      try {
        if (JSON.parse(String(event.data))?.type === 'ready') setReady(true)
      } catch {
        // Not ours.
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <View style={{ height: props.height ?? 300 }} accessible accessibilityRole="image" accessibilityLabel={props.accessibilityLabel}>
      <iframe
        ref={frame}
        title={props.accessibilityLabel}
        srcDoc={html}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        style={{ flex: 1, width: '100%', height: '100%', border: 0 }}
      />
    </View>
  )
}
