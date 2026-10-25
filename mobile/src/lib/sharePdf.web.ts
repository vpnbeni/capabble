/** Web preview: download the PDF. */
export async function sharePdf(bytes: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
