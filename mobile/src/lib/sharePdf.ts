import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

/** Saves PDF bytes to the cache and opens the share sheet (save to Files, WhatsApp, print). */
export async function sharePdf(bytes: ArrayBuffer, fileName: string) {
  const file = new File(Paths.cache, fileName)
  if (file.exists) file.delete()
  file.create()
  await file.write(new Uint8Array(bytes))
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName })
}

/** Saves a text file (a CSV report) to the cache and opens the share sheet. */
export async function shareText(text: string, fileName: string, mimeType = 'text/csv') {
  const file = new File(Paths.cache, fileName)
  if (file.exists) file.delete()
  file.create()
  file.write(text)
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName })
}
