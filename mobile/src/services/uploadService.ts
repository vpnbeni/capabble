import { ApiError, api, requestBytes } from '@/lib/api'
import { fileForm, tooBig, type PickedFile } from '@/lib/pickFile'

// File uploads and imports the website does with a file input: the school logo, a bill's photo,
// the board's datesheet and candidate PDFs, Form 66, answer sheet and student spreadsheets.
// Each route takes one file (the server's limit is 10 MB) and answers with what it did.

type Body<T> = { success?: boolean; message?: string; data?: T } & Partial<T>

export interface Attachment {
  name: string
  url: string
  mimeType: string
  size: number
  uploadedAt: string
}

export interface StudentImportResult {
  created: number
  updated: number
  skipped: number
  errors: { row: number | null; message: string }[]
}

const send = <T>(path: string, field: string, picked: PickedFile, extra?: Record<string, string>) => {
  if (tooBig(picked)) throw new ApiError('The file is over 10 MB. Choose a smaller one.', 413)
  return api.upload<Body<T>>(path, fileForm(field, picked, extra))
}

export const uploadService = {
  schoolLogo: async (picked: PickedFile) => (await send<{ logoUrl: string }>('/school-profile/logo', 'logo', picked)).data,
  /** A bill's or document's photo for an expense; the expense keeps the returned record in `attachments`. */
  attachment: async (picked: PickedFile) => (await send<Attachment>('/cpitl/attachments', 'file', picked)).data as Attachment,

  /** Replaces the board's datesheet for the centre. */
  boardDatesheet: async (picked: PickedFile) => (await send<unknown>('/datesheets/import-pdf', 'file', picked)).message,
  /** Adds the candidates in the board's PDF; ones already there are kept. */
  candidates: async (picked: PickedFile) => (await send<unknown>('/candidates/import', 'pdf', picked)).message,
  /** Form 66 for the days in the file, replacing those days' records. */
  form66: async (picked: PickedFile) => (await send<never>('/form66/upload', 'file', picked)) as { message?: string; count?: number; replacedCount?: number; dateCount?: number },

  answerSheetsTemplate: () => requestBytes('/answersheets/template/download'),
  answerSheets: async (picked: PickedFile) => (await send<{ created: number; failed: number; skipped: number }>('/answersheets/upload/excel', 'file', picked)).data,

  studentsTemplate: () => requestBytes('/students/import-template'),
  students: async (picked: PickedFile) => (await send<StudentImportResult>('/students/import-template/upload', 'file', picked)).data as StudentImportResult,
}
