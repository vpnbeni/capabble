import React, { useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Paperclip, X } from 'lucide-react'
import cpitlService, { Attachment } from '@/services/cpitlService'
import { Button, Icon } from '@/components/ui'
import { errorMessage } from './CpitlUi'
import './expenses.css'

/** Upload bill/receipt photos or PDFs; keeps the list of uploaded attachments. Renders inside `.cb-app`. */
const AttachmentInput: React.FC<{ value: Attachment[]; onChange: (next: Attachment[]) => void; label?: string }> = ({
  value,
  onChange,
  label = 'Attach bill / receipt',
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const id = useId()

  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const uploaded: Attachment[] = []
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 10 MB.`)
          continue
        }
        uploaded.push(await cpitlService.uploadAttachment(file))
      }
      if (uploaded.length) onChange([...value, ...uploaded])
    } catch (error) {
      toast.error(await errorMessage(error, 'Upload failed.'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="ce-attach">
      <div className="ce-attach__list">
        {value.map((a, i) => (
          <span key={a._id || a.url} className="ce-attach__chip">
            {a.mimeType?.startsWith('image/') ? (
              <img src={a.url} alt="" className="ce-attach__thumb" />
            ) : (
              <Icon icon={FileText} size={16} className="ce-attach__file" />
            )}
            <a href={a.url} target="_blank" rel="noreferrer" className="ce-attach__name" title={a.name}>
              {a.name}
            </a>
            <button
              type="button"
              aria-label={`Remove ${a.name}`}
              className="ce-attach__remove"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              <Icon icon={X} size={14} />
            </button>
          </span>
        ))}
        <Button size="sm" icon={Paperclip} loading={uploading} onClick={() => inputRef.current?.click()} aria-describedby={`${id}-hint`}>
          {uploading ? 'Uploading…' : label}
        </Button>
      </div>
      <span id={`${id}-hint`} className="ce-hint">
        Photos or PDFs, up to 10 MB each.
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="ce-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  )
}

export default AttachmentInput
