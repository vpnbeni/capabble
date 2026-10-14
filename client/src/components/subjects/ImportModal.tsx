import React, { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileText, Upload, X } from 'lucide-react'
import { Banner, Button, Dialog, Icon, cx } from '@/components/ui'
import '@/components/exmcl/centre-candidates.css'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (file: File) => Promise<void>
  importing: boolean
  error?: string | null
}

const SubjectsImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport, importing, error }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    }
  }

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: importing,
  })

  const handleImport = async () => {
    if (selectedFile) {
      await onImport(selectedFile)
      setSelectedFile(null)
    }
  }

  const handleClose = () => {
    if (!importing) {
      setSelectedFile(null)
      onClose()
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      title="Import subjects from PDF"
      description="The PDF is stored securely. Subject codes and names are read from it."
      footer={
        <>
          <Button onClick={handleClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Upload}
            loading={importing}
            disabled={!selectedFile}
            onClick={() => void handleImport()}
          >
            {importing ? 'Processing…' : 'Import subjects'}
          </Button>
        </>
      }
    >
      <div className="cb-stack">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {selectedFile ? (
          <div className="cx-file">
            <Icon icon={FileText} size={16} />
            <span className="cx-file__name" title={selectedFile.name}>
              {selectedFile.name}
            </span>
            <span className="cx-file__size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
            <Button
              size="sm"
              variant="tertiary"
              icon={X}
              aria-label="Remove file"
              disabled={importing}
              onClick={() => setSelectedFile(null)}
            />
          </div>
        ) : (
          <div {...getRootProps({ className: cx('cx-drop', isDragActive && 'is-active', importing && 'is-disabled') })}>
            <input {...getInputProps()} />
            <Icon icon={Upload} size={20} />
            <span>{isDragActive ? 'Drop the PDF here' : 'Drag a PDF here'}</span>
            <Button size="sm" onClick={open} disabled={importing}>
              Choose file
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export default SubjectsImportModal
