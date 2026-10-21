import React, { useEffect, useId, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { Banner, Button } from '@/components/ui'

type Props = {
  /** Called with the text of each QR read. The same code is not repeated for a few seconds. */
  onCode: (code: string) => void
}

const REPEAT_AFTER_MS = 4_000

/**
 * Phone camera QR scanner for ID cards. The scanner library loads only when the
 * camera is turned on, so the rest of the screen stays light.
 */
const CardScanner: React.FC<Props> = ({ onCode }) => {
  const elementId = `tr-scanner-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [on, setOn] = useState(false)
  const [error, setError] = useState('')
  const last = useRef<{ code: string; at: number } | null>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    if (!on) return undefined
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning?: boolean } | null = null
    let cancelled = false

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        const instance = new Html5Qrcode(elementId, { verbose: false })
        scanner = instance
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (width: number, height: number) => {
            const size = Math.floor(Math.min(width, height) * 0.7)
            return { width: size, height: size }
          } },
          (text: string) => {
            const now = Date.now()
            if (last.current && last.current.code === text && now - last.current.at < REPEAT_AFTER_MS) return
            last.current = { code: text, at: now }
            if (navigator.vibrate) navigator.vibrate(60)
            onCodeRef.current(text)
          },
          () => undefined
        )
        setError('')
      } catch (err: any) {
        if (cancelled) return
        const name = String(err?.name || err || '')
        setError(/NotAllowed|Permission/i.test(name)
          ? 'Camera is blocked for this site. Allow the camera in the browser settings, or mark students from the list.'
          : 'Could not open the camera. Mark students from the list instead.')
        setOn(false)
      }
    }
    void start()

    return () => {
      cancelled = true
      const instance = scanner
      if (instance) {
        instance.stop().catch(() => undefined).finally(() => {
          try {
            instance.clear()
          } catch {
            // Already cleared.
          }
        })
      }
    }
  }, [on, elementId])

  return (
    <div className="tr-scanner">
      <div id={elementId} className={on ? 'tr-scanner__view' : 'tr-scanner__view is-off'} aria-label="Camera view" />
      {error ? <Banner tone="warning">{error}</Banner> : null}
      <Button
        size="lg"
        fullWidth
        variant={on ? 'secondary' : 'primary'}
        icon={on ? CameraOff : Camera}
        onClick={() => setOn((value) => !value)}
      >
        {on ? 'Turn camera off' : 'Scan with camera'}
      </Button>
    </div>
  )
}

export default CardScanner
