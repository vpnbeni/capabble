import { ApiError, api, requestBytes } from '@/lib/api'
import { fileForm, tooBig, type PickedFile } from '@/lib/pickFile'

// The printed exam designs (the website's Exam → Performas): admit cards, award lists and report
// cards. Each is one record saved whole, so the phone sends back everything it loaded, its own
// changes on top, and the placed items (`canvasItems`, set on the website) untouched.

export type DesignKind = 'admit' | 'award' | 'report'
export type Design = Record<string, unknown>

const PATH: Record<DesignKind, string> = { admit: '/admit-cards', award: '/award-list', report: '/report-card' }

export const designService = {
  get: (kind: DesignKind) => api.get<Design>(`${PATH[kind]}/design`),
  save: (kind: DesignKind, design: Design) => api.put<Design>(`${PATH[kind]}/design`, { design }),
  /** The principal's or exam in-charge's signature for admit cards; answers with the design's signatures. */
  signature: async (role: 'principal' | 'examIncharge', picked: PickedFile) => {
    if (tooBig(picked)) throw new ApiError('The photo is over 10 MB. Choose a smaller one.', 413)
    return (await api.upload<{ data?: Design }>(`/admit-cards/design/signature/${role}`, fileForm('signature', picked))).data ?? {}
  },
  /** A real PDF in this design for one class: admit cards and award lists take an unsaved design. */
  sample: (kind: DesignKind, design: Design, examId: string, className: string, section: string) =>
    kind === 'report'
      ? requestBytes('/report-card/bulk', { params: { examId, class: className, section } })
      : requestBytes(PATH[kind], { method: 'POST', body: { examId, class: className, section, design } }),
}
