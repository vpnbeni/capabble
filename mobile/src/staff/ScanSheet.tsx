import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera'
import { ScanLine } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { radius, space } from '@/theme/tokens'
import { BottomSheet, MobileButton, StatusView, Text, haptic } from '@/ui'

// Library spine labels and asset tags: the common 1D codes, plus QR.
const CODES: BarcodeType[] = ['code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'qr']

/**
 * The camera, reading a barcode or QR code (a copy's accession number, an asset's tag) into the
 * field it opened from. `continuous` keeps it open for counting shelf after shelf; the same code
 * read twice in a row is taken once.
 */
export function ScanSheet({
  open,
  onClose,
  onScan,
  title = 'Scan',
  continuous = false,
  last,
}: {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
  title?: string
  continuous?: boolean
  last?: string | null
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const lastRead = useRef<{ code: string; at: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const read = ({ data }: { data: string }) => {
    const code = String(data || '').trim()
    if (!code) return
    const now = Date.now()
    if (lastRead.current && lastRead.current.code === code && now - lastRead.current.at < 2500) return
    lastRead.current = { code, at: now }
    haptic.light()
    onScan(code)
    if (!continuous) onClose()
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      description={continuous ? 'Point at each label in turn. Each one is counted as it is read.' : 'Point at the barcode or QR code.'}
      detent="large"
    >
      {!permission ? null : permission.granted ? (
        open ? (
          <View style={{ gap: space['space-3'] }}>
            <View style={{ aspectRatio: 1, borderRadius: radius['radius-lg'], overflow: 'hidden' }}>
              <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: CODES }} onBarcodeScanned={read} />
            </View>
            {last ? (
              <Text variant="body" tone="muted" numberOfLines={2}>
                Last read: {last}
              </Text>
            ) : null}
          </View>
        ) : null
      ) : (
        <View style={{ gap: space['space-4'] }}>
          <StatusView
            compact
            kind="permission"
            icon={ScanLine}
            title="Camera needed"
            body={permission.canAskAgain ? 'Allow the camera to read labels.' : 'Turn the camera on for Capabble in the phone’s settings.'}
          />
          {permission.canAskAgain ? (
            <MobileButton
              fullWidth
              loading={busy}
              onPress={async () => {
                setBusy(true)
                await requestPermission()
                setBusy(false)
              }}
            >
              Allow the camera
            </MobileButton>
          ) : null}
        </View>
      )}
    </BottomSheet>
  )
}
