import type { DesignKind } from '@/services/designService'

/** One setting of a printed design, at a dotted path in the design record. */
export type DesignItem =
  | { kind: 'toggle'; path: string; label: string }
  | { kind: 'text'; path: string; label: string; long?: boolean; hint?: string }
  | { kind: 'choice'; path: string; label: string; options: { value: string | number; label: string }[] }
  | { kind: 'number'; path: string; label: string; min: number; max: number; hint?: string }
  | { kind: 'style'; path: string; label: string }
  | { kind: 'signature'; role: 'principal' | 'examIncharge'; path: string; label: string }

export type DesignSection = { title: string; footer?: string; items: DesignItem[] }

type Choice = Extract<DesignItem, { kind: 'choice' }>
const PAGE: Choice = {
  kind: 'choice',
  path: 'pageSize',
  label: 'Paper',
  options: [
    { value: 'A4', label: 'A4' },
    { value: 'legal', label: 'Legal' },
  ],
}
const ORIENTATION: Choice = {
  kind: 'choice',
  path: 'orientation',
  label: 'Page turned',
  options: [
    { value: 'portrait', label: 'Upright (portrait)' },
    { value: 'landscape', label: 'Sideways (landscape)' },
  ],
}
const COPIES: Choice = {
  kind: 'choice',
  path: 'copiesPerSheet',
  label: 'On each sheet',
  options: [
    { value: 1, label: 'One' },
    { value: 2, label: 'Two' },
  ],
}

const toggles = (prefix: string, rows: [string, string][]): DesignItem[] => rows.map(([key, label]) => ({ kind: 'toggle', path: `${prefix}${key}`, label }))

export const REPORT_FONTS = ['Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Courier New', 'Comic Sans MS', 'Impact', 'Palatino Linotype']

export const DESIGNS: Record<DesignKind, { title: string; one: string; sections: DesignSection[] }> = {
  admit: {
    title: 'Admit card',
    one: 'admit cards',
    sections: [
      { title: 'Page', items: [PAGE, ORIENTATION, COPIES, { kind: 'text', path: 'title', label: 'Heading', hint: '{exam} becomes the exam’s name.' }] },
      {
        title: 'Top of the card',
        items: toggles('', [
          ['showHeader', 'School heading'],
          ['showSchoolLogo', 'School logo'],
          ['showSchoolAddress', 'School address'],
        ]),
      },
      {
        title: 'Notes',
        items: [
          { kind: 'toggle', path: 'showEntryNote', label: 'Entry note' },
          { kind: 'text', path: 'entryNote', label: 'Entry note' },
          { kind: 'toggle', path: 'showInstructions', label: 'Instructions' },
          { kind: 'text', path: 'instructions', label: 'Instructions', long: true },
          { kind: 'toggle', path: 'showConfirmation', label: 'Confirmation line' },
          { kind: 'text', path: 'confirmationText', label: 'Confirmation line', long: true },
          { kind: 'toggle', path: 'showDisclaimer', label: 'Disclaimer' },
          { kind: 'text', path: 'disclaimer', label: 'Disclaimer', long: true },
        ],
      },
      {
        title: 'What each card shows',
        items: toggles('fields.', [
          ['photo', 'Photo'],
          ['name', 'Name'],
          ['rollNo', 'Roll number'],
          ['rollNoInWords', 'Roll number in words'],
          ['admissionNo', 'Admission number'],
          ['class', 'Class'],
          ['section', 'Section'],
          ['dob', 'Date of birth'],
          ['gender', 'Gender'],
          ['fatherName', 'Father’s name'],
          ['motherName', 'Mother’s name'],
          ['exam', 'Exam'],
          ['subjects', 'Subjects and dates'],
          ['schoolName', 'School name'],
          ['schoolNo', 'School number'],
          ['examCentre', 'Exam centre'],
          ['centreNo', 'Centre number'],
          ['pwdCategory', 'Disability category'],
          ['admitCardId', 'Admit card number'],
          ['qr', 'QR code'],
        ]),
      },
      {
        title: 'Signatures',
        items: [
          ...toggles('signatures.', [
            ['candidate', 'Candidate'],
            ['parent', 'Parent'],
            ['examIncharge', 'Exam in-charge'],
            ['principal', 'Principal'],
          ]),
          { kind: 'toggle', path: 'signatures.examInchargeDigital', label: 'Print the exam in-charge’s signature' },
          { kind: 'signature', role: 'examIncharge', path: 'signatures.examInchargeSignatureUrl', label: 'Exam in-charge’s signature' },
          { kind: 'toggle', path: 'signatures.principalDigital', label: 'Print the principal’s signature' },
          { kind: 'signature', role: 'principal', path: 'signatures.principalSignatureUrl', label: 'Principal’s signature' },
        ],
      },
    ],
  },
  award: {
    title: 'Award list',
    one: 'award list',
    sections: [
      { title: 'Page', items: [PAGE, ORIENTATION, COPIES, { kind: 'text', path: 'title', label: 'Heading' }] },
      {
        title: 'Top of the sheet',
        items: [
          ...toggles('', [
            ['showHeader', 'School heading'],
            ['showSchoolLogo', 'School logo'],
            ['showSchoolAddress', 'School address'],
            ['showInfoRow', 'Class and exam line'],
            ['showMaxMarks', 'Maximum marks'],
          ]),
          ...toggles('headerFields.', [
            ['class', 'Class'],
            ['section', 'Section'],
            ['exam', 'Exam'],
            ['date', 'Date'],
            ['subject', 'Subject'],
            ['mm', 'Maximum marks in the line'],
          ]),
        ],
      },
      {
        title: 'Columns',
        items: [
          ...toggles('columns.', [
            ['srNo', 'Serial number'],
            ['rollNumber', 'Admission number'],
            ['rollNo', 'Roll number'],
            ['name', 'Name'],
            ['fatherName', 'Father’s name'],
            ['subjects', 'Subject marks'],
            ['total', 'Total'],
            ['grade', 'Grade'],
            ['checkerSign', 'Checker’s signature'],
          ]),
          { kind: 'number', path: 'extraMarkColumns', label: 'Extra marks columns', min: 0, max: 8, hint: 'Blank columns for parts of the paper, 0 to 8.' },
        ],
      },
      {
        title: 'Signatures',
        items: toggles('signatures.', [
          ['subjectTeacher', 'Subject teacher'],
          ['hod', 'Head of department'],
          ['examIncharge', 'Exam in-charge'],
          ['principal', 'Principal'],
        ]),
      },
    ],
  },
  report: {
    title: 'Report card',
    one: 'report cards',
    sections: [
      { title: 'Page', items: [{ ...PAGE, options: [...PAGE.options, { value: 'letter', label: 'Letter' }] }, ORIENTATION] },
      {
        title: 'The school as printed',
        items: [
          { kind: 'text', path: 'schoolName', label: 'School name' },
          { kind: 'text', path: 'tagline', label: 'Tagline' },
          { kind: 'text', path: 'schoolCode', label: 'School code' },
          { kind: 'text', path: 'affiliationNo', label: 'Affiliation number' },
          { kind: 'text', path: 'address', label: 'Address', long: true },
          { kind: 'text', path: 'email', label: 'Email' },
          { kind: 'text', path: 'contact', label: 'Phone numbers' },
        ],
      },
      {
        title: 'What it shows',
        items: [
          ...toggles('', [
            ['showHeader', 'School heading'],
            ['showSchoolLogo', 'School logo'],
            ['showCbseLogo', 'Board logo'],
            ['showTagline', 'Tagline'],
            ['showSchoolCode', 'School code'],
            ['showAffiliation', 'Affiliation number'],
            ['showAddress', 'Address'],
            ['showEmail', 'Email'],
            ['showContact', 'Phone numbers'],
            ['showAttendance', 'Attendance'],
            ['showRemarks', 'Remarks'],
            ['showDate', 'Date'],
          ]),
          ...toggles('signatures.', [
            ['classTeacher', 'Class teacher’s signature'],
            ['principal', 'Principal’s signature'],
          ]),
        ],
      },
      {
        title: 'Words printed',
        items: (
          [
            ['studentDetails', 'Student details heading'],
            ['scholasticArea', 'Marks heading'],
            ['subjects', 'Subjects column'],
            ['maxMarks', 'Maximum marks column'],
            ['marksObtained', 'Marks obtained column'],
            ['grade', 'Grade column'],
            ['grandTotal', 'Grand total'],
            ['percentage', 'Percentage'],
            ['overallGrade', 'Overall grade'],
            ['attendance', 'Attendance'],
            ['remarks', 'Remarks'],
            ['date', 'Date'],
            ['classTeacherSign', 'Class teacher’s signature'],
            ['principalSign', 'Principal’s signature'],
          ] as [string, string][]
        ).map(([key, label]) => ({ kind: 'text', path: `labels.${key}`, label })),
      },
      {
        title: 'Text styles',
        items: (
          [
            ['schoolName', 'School name'],
            ['tagline', 'Tagline'],
            ['meta', 'School details'],
            ['examTitle', 'Exam title'],
            ['sectionHeading', 'Headings'],
            ['studentFields', 'Student details'],
            ['tableHeader', 'Table headings'],
            ['tableBody', 'Marks'],
            ['footer', 'Bottom of the card'],
            ['signatures', 'Signatures'],
          ] as [string, string][]
        ).map(([key, label]) => ({ kind: 'style', path: `styles.${key}`, label })),
      },
      {
        title: 'Marks table column widths',
        footer: 'Percent of the table’s width; together about 100.',
        items: (
          [
            ['subjects', 'Subjects'],
            ['maxMarks', 'Maximum marks'],
            ['marksObtained', 'Marks obtained'],
            ['grade', 'Grade'],
          ] as [string, string][]
        ).map(([key, label]) => ({ kind: 'number', path: `columnWidths.${key}`, label, min: 8, max: 80 })),
      },
    ],
  },
}

export const getPath = (record: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), record)

/** A copy of the record with one value changed. */
export const setPath = (record: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> => {
  const [head, ...rest] = path.split('.')
  if (!rest.length) return { ...record, [head]: value }
  const inner = record[head] && typeof record[head] === 'object' ? (record[head] as Record<string, unknown>) : {}
  return { ...record, [head]: setPath(inner, rest.join('.'), value) }
}
