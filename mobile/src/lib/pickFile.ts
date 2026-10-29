import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

/** A file the person picked: on a phone a local uri, on the web the File itself. */
export interface PickedFile {
  uri: string
  name: string
  mimeType: string
  size?: number
  file?: File
}

export const SPREADSHEET = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
export const PDF = ['application/pdf']
export const TEXT = ['text/plain']

/** Opens Files (Drive, Downloads, WhatsApp documents). Null when the person backs out. */
export async function pickDocument(types: string[]): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false })
  const asset = result.canceled ? null : result.assets[0]
  if (!asset) return null
  return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? types[0] ?? 'application/octet-stream', size: asset.size, file: asset.file }
}

/** A photo from the gallery or, with `camera`, taken now. Null when the person backs out or says no to access. */
export async function pickImage({ camera = false, square = false }: { camera?: boolean; square?: boolean } = {}): Promise<PickedFile | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return null
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: square, aspect: square ? [1, 1] : undefined }
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
  const asset = result.canceled ? null : result.assets[0]
  if (!asset) return null
  const mimeType = asset.mimeType ?? 'image/jpeg'
  return { uri: asset.uri, name: asset.fileName ?? `photo.${mimeType.split('/')[1] ?? 'jpg'}`, mimeType, size: asset.fileSize, file: asset.file }
}

/** A form with the file under `field` (and any other fields), ready for `api.upload`. */
export function fileForm(field: string, picked: PickedFile, extra: Record<string, string> = {}) {
  const form = new FormData()
  if (picked.file) form.append(field, picked.file, picked.name)
  // React Native's FormData takes { uri, name, type } for a file on the device.
  else form.append(field, { uri: picked.uri, name: picked.name, type: picked.mimeType } as unknown as Blob)
  Object.entries(extra).forEach(([key, value]) => form.append(key, value))
  return form
}

/** Over the server's 10 MB upload limit. */
export const tooBig = (picked: PickedFile) => (picked.size ?? 0) > 10 * 1024 * 1024
