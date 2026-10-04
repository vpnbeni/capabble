import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Paperclip, X } from 'lucide-react'
import cpitlService, { Attachment } from '@/services/cpitlService'
import { errorMessage } from './CpitlUi'

/** Upload bill/receipt photos or PDFs; keeps the list of uploaded attachments. */
const AttachmentInput: React.FC<{ value: Attachment[]; onChange: (next: Attachment[]) => void; label?: string }> = ({
  value,
  onChange,
  label = 'Attach bill / receipt',
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

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
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((a, i) => (
          <span key={a._id || a.url} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 text-xs dark:border-slate-600 dark:bg-slate-700">
            {a.mimeType?.startsWith('image/') ? (
              <img src={a.url} alt="" className="h-7 w-7 rounded object-cover" />
            ) : (
              <FileText className="h-4 w-4 text-slate-500" />
            )}
            <a href={a.url} target="_blank" rel="noreferrer" className="max-w-[140px] truncate text-slate-700 hover:underline dark:text-slate-200">
              {a.name}
            </a>
            <button type="button" aria-label="Remove attachment" className="text-slate-400 hover:text-rose-600" onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
        >
          <Paperclip className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : label}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  )
}

export default AttachmentInput
