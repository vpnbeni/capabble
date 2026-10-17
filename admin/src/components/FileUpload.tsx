import { ChangeEvent, DragEvent, useMemo, useState } from 'react'
import { Upload } from './icons'

interface FileUploadProps {
  accept: string
  onUpload: (file: File) => Promise<void> | void
  label: string
  disabled?: boolean
}

export function FileUpload({ accept, onUpload, label, disabled = false }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const hint = useMemo(() => {
    if (accept.includes('xlsx') && accept.includes('pdf')) return 'Accepted files: .xlsx, .pdf'
    if (accept.includes('xlsx')) return 'Accepted file: .xlsx'
    if (accept.includes('pdf')) return 'Accepted file: .pdf'
    return `Accepted file: ${accept}`
  }, [accept])

  const onSelectFile = (file?: File) => {
    if (!file) return
    setSelectedFile(file)
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelectFile(event.target.files?.[0])
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
    onSelectFile(event.dataTransfer.files?.[0])
  }

  const handleUpload = async () => {
    if (!selectedFile || disabled || isUploading) return

    setIsUploading(true)
    try {
      await onUpload(selectedFile)
      setSelectedFile(null)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="upload-area-wrapper">
      <div
        className={`upload-area ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        <Upload size={22} className="upload-icon" />
        <label className="upload-label" htmlFor={`upload-${label.replace(/\s+/g, '-').toLowerCase()}`}>
          {label}
        </label>
        <p className="upload-hint">{hint}</p>
        <input
          id={`upload-${label.replace(/\s+/g, '-').toLowerCase()}`}
          type="file"
          accept={accept}
          onChange={onFileChange}
          disabled={disabled || isUploading}
        />

        {selectedFile && (
          <p className="upload-file-name">
            Selected: <strong>{selectedFile.name}</strong>
          </p>
        )}
      </div>

      <button
        type="button"
        className="primary"
        onClick={handleUpload}
        disabled={disabled || isUploading || !selectedFile}
      >
        {isUploading ? 'Uploading…' : 'Upload file'}
      </button>
    </div>
  )
}
