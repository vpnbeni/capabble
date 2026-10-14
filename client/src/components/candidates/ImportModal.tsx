import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileText, Upload, X } from 'lucide-react'
import { Button, Dialog, Icon, cx } from '@/components/ui'
import '@/components/exmcl/centre-candidates.css'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (file: File) => Promise<void>
  importing: boolean
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport, importing }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: false,
    disabled: importing,
  })

  const handleImport = async () => {
    if (selectedFile) {
      await onImport(selectedFile)
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
      title="Import candidates from PDF"
      description="Upload the candidate list PDF. Candidates already on file are skipped."
      footer={
        <>
          <Button onClick={handleClose} disabled={importing}>
            Cancel
          </Button>
          <Button variant="primary" icon={Upload} loading={importing} disabled={!selectedFile} onClick={() => void handleImport()}>
            {importing ? 'Processing…' : 'Import candidates'}
          </Button>
        </>
      }
    >
      <div className="cb-stack">
        <div className="cb-form-section">
          <p className="cb-form-section__title">What the PDF needs</p>
          <ul className="cx-cand-help">
            <li>A roll number for each candidate (for example CS2021001)</li>
            <li>The candidate’s name, clearly printed</li>
            <li>Email, phone, course and department are picked up when present</li>
            <li>A text-based PDF, not a scanned image</li>
          </ul>
        </div>

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
            <span className="cx-drop__title">{isDragActive ? 'Drop the PDF here' : 'Drag a PDF here'}</span>
            <Button size="sm" onClick={open} disabled={importing}>
              Choose file
            </Button>
          </div>
        )}

        <div className="cb-form-section">
          <p className="cb-form-section__title">Sample PDF text</p>
          <pre className="cx-cand-sample">
            {'CS2021001 John Doe\njohn.doe@example.com\n+1234567890\nComputer Science Engineering\n\nCS2021002 Jane Smith\njane.smith@example.com\n+0987654321\nComputer Science Engineering'}
          </pre>
        </div>
      </div>
    </Dialog>
  )
}

export default ImportModal
