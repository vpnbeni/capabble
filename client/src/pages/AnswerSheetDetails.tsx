import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Ban, Download, FileText, Pencil, Plus, Save, Trash2, X, ExternalLink } from 'lucide-react'
import {
    Button,
    Card,
    DataTable,
    DetailList,
    Dialog,
    EmptyState,
    MetricTile,
    MetricTiles,
    Page,
    PageHeader,
    Progress,
    Select,
    Sheet,
    Tabs,
    TextField,
    Entity,
    Banner,
} from '@/components/ui'
import type { DataTableColumn } from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/centre-answersheet-details.css'
import api from '../services/api'
import answerSheetService, {
    AnswerSheetEntry,
    AnswerSheetSerialRange,
    DiscardedSerial,
    SupplementarySubjectContext,
    SupplementaryUsageContextResponse,
    SupplementaryUsageRecord,
} from '../services/answerSheetService'
import {
    createEmptySerialRange,
    formatSerialRangeLabel,
    getAnswerSheetSerialRanges,
    validateSerialRangeInputs,
} from '../utils/answerSheetSerialRanges'

const DISCARD_REASONS = [
    'Damaged/Misprinted',
    'Received Damaged (Wear/Tear during transport)',
    'Torn',
    'Water Damage',
    'Missing Pages',
    'Printing Defect',
    'Other',
]

interface RelatedExam {
    _id: string
    examDate: string
    dayName: string
    subjectCode: string
    subjectName: string
    class: string
    timeSlot: {
        start: string
        end: string
    }
    duration: number
    candidateCount: number
    answerSheetType: string
}

interface SerialAllocation extends RelatedExam {
    serialFrom: string
    serialTo: string
    sheetsAllocated: number
}

interface AllocationData {
    hasSerialNumbers: boolean
    serialRanges?: AnswerSheetSerialRange[]
    serialFrom?: string
    serialTo?: string
    total?: number
    discardedCount?: number
    discardedSerials?: DiscardedSerial[]
    usableTotal?: number
    allocations: SerialAllocation[]
    totalAllocated?: number
    remaining?: number
}

const isSupplementaryEntry = (answerSheetType?: string) => answerSheetType === 'Supplementary'

interface SupplementaryUsageDraft {
    roomNo: string
    rollNo: string
    serialInput: string
    serials: string[]
}

const createSupplementaryUsageDraft = (): SupplementaryUsageDraft => ({
    roomNo: '',
    rollNo: '',
    serialInput: '',
    serials: [],
})

const parseSerialInput = (input: string) => Array.from(
    new Set(
        String(input || '')
            .split(/[\s,]+/)
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean)
    )
)

const AnswerSheetDetails: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const [answerSheet, setAnswerSheet] = useState<AnswerSheetEntry | null>(null)
    const [allocation, setAllocation] = useState<AllocationData | null>(null)
    const [supplementaryContext, setSupplementaryContext] = useState<SupplementaryUsageContextResponse | null>(null)
    const [usageDrafts, setUsageDrafts] = useState<Record<string, SupplementaryUsageDraft>>({})
    const [loading, setLoading] = useState(true)
    const [editMode, setEditMode] = useState(false)
    const [editValues, setEditValues] = useState<{ serialRanges: AnswerSheetSerialRange[] }>({
        serialRanges: [createEmptySerialRange()],
    })
    const [savingSupplementaryUsage, setSavingSupplementaryUsage] = useState<string | null>(null)
    
    // Discarded serials management
    const [showDiscardedModal, setShowDiscardedModal] = useState(false)
    const [discardInput, setDiscardInput] = useState({ serial: '', fromSerial: '', toSerial: '', reason: 'Damaged/Misprinted' })
    const [discardMode, setDiscardMode] = useState<'single' | 'range'>('single')
    const [savingDiscard, setSavingDiscard] = useState(false)
    // Dispatch record PDF preview
    const [dispatchPreviewUrl, setDispatchPreviewUrl] = useState<string | null>(null)
    const [showDispatchPreview, setShowDispatchPreview] = useState(false)
    const [dispatchPreviewLoading, setDispatchPreviewLoading] = useState(false)
    const [dispatchPreviewError, setDispatchPreviewError] = useState<string | null>(null)
    const [dispatchPreviewAlloc, setDispatchPreviewAlloc] = useState<SerialAllocation | null>(null)
    const isSupplementary = isSupplementaryEntry(answerSheet?.answerSheetType)

    // Must run unconditionally (Rules of Hooks). Used for utilization "as of today".
    const todayStart = useMemo(() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d.getTime()
    }, [])

    const allocatedAsOfToday = useMemo(() => {
        const list = allocation?.allocations ?? []
        return list.reduce((sum, alloc) => {
            const examDate = alloc.examDate
            if (!examDate) return sum
            const d = typeof examDate === 'string' ? new Date(examDate) : new Date(examDate)
            d.setHours(0, 0, 0, 0)
            if (d.getTime() <= todayStart) return sum + (alloc.sheetsAllocated || 0)
            return sum
        }, 0)
    }, [allocation?.allocations, todayStart])

    const answerSheetSerialRanges = useMemo(
        () => getAnswerSheetSerialRanges(answerSheet),
        [answerSheet]
    )

    const supplementarySubjects = supplementaryContext?.subjects || []

    const actualUsedCount = isSupplementary
        ? supplementaryContext?.totalUsed || answerSheet?.used || 0
        : allocatedAsOfToday

    useEffect(() => {
        if (id) {
            loadDetails()
        }
    }, [id])

    const loadDetails = async () => {
        try {
            setLoading(true)

            // Load answer sheet details
            const detailsResponse = await answerSheetService.getAnswerSheetDetails(id!)
            if (detailsResponse.success) {
                setAnswerSheet(detailsResponse.data.answerSheet)
                setEditValues({
                    serialRanges: getAnswerSheetSerialRanges(detailsResponse.data.answerSheet)
                })
            }

            const allocationResponse = await answerSheetService.getSerialAllocation(id!)
            if (allocationResponse.success) {
                setAllocation(allocationResponse.data)
            }

            if (detailsResponse.data.answerSheet.answerSheetType === 'Supplementary') {
                const supplementaryResponse = await answerSheetService.getSupplementaryUsageContext(id!)
                if (supplementaryResponse.success) {
                    setSupplementaryContext(supplementaryResponse.data)
                    setUsageDrafts((current) => {
                        const nextDrafts = { ...current }
                        supplementaryResponse.data.subjects.forEach((subject) => {
                            if (!nextDrafts[subject._id]) {
                                nextDrafts[subject._id] = createSupplementaryUsageDraft()
                            }
                        })
                        return nextDrafts
                    })
                }
            } else {
                setSupplementaryContext(null)
            }
        } catch (error: any) {
            console.error('Error loading answer sheet details:', error)
            toast.error('Failed to load answer sheet details')
        } finally {
            setLoading(false)
        }
    }

    const updateEditSerialRange = (index: number, field: 'serialFrom' | 'serialTo', value: string) => {
        setEditValues((current) => ({
            serialRanges: current.serialRanges.map((range, rangeIndex) =>
                rangeIndex === index ? { ...range, [field]: value } : range
            )
        }))
    }

    const addEditSerialRange = () => {
        setEditValues((current) => ({
            serialRanges: [...current.serialRanges, createEmptySerialRange()]
        }))
    }

    const removeEditSerialRange = (index: number) => {
        setEditValues((current) => ({
            serialRanges: current.serialRanges.length === 1
                ? [createEmptySerialRange()]
                : current.serialRanges.filter((_, rangeIndex) => rangeIndex !== index)
        }))
    }

    const updateSupplementaryDraft = (
        subjectId: string,
        updater: (draft: SupplementaryUsageDraft) => SupplementaryUsageDraft
    ) => {
        setUsageDrafts((current) => ({
            ...current,
            [subjectId]: updater(current[subjectId] || createSupplementaryUsageDraft())
        }))
    }

    const handleSupplementaryRoomChange = (subjectId: string, roomNo: string) => {
        updateSupplementaryDraft(subjectId, (draft) => ({
            ...draft,
            roomNo,
            rollNo: '',
        }))
    }

    const handleAddSupplementarySerials = (subjectId: string) => {
        const draft = usageDrafts[subjectId] || createSupplementaryUsageDraft()
        const nextSerials = parseSerialInput(draft.serialInput)

        if (nextSerials.length === 0) {
            toast.error('Enter at least one sheet number to add')
            return
        }

        updateSupplementaryDraft(subjectId, (current) => ({
            ...current,
            serialInput: '',
            serials: Array.from(new Set([...current.serials, ...nextSerials]))
        }))
    }

    const handleRemoveSupplementarySerial = (subjectId: string, serial: string) => {
        updateSupplementaryDraft(subjectId, (draft) => ({
            ...draft,
            serials: draft.serials.filter((item) => item !== serial)
        }))
    }

    const handleSaveSupplementaryUsage = async (subject: SupplementarySubjectContext) => {
        const draft = usageDrafts[subject._id] || createSupplementaryUsageDraft()
        const pendingSerials = parseSerialInput(draft.serialInput)
        const serials = Array.from(new Set([...draft.serials, ...pendingSerials]))

        if (!draft.roomNo || !draft.rollNo || serials.length === 0) {
            toast.error('Select room number, roll number, and at least one sheet number')
            return
        }

        try {
            setSavingSupplementaryUsage(subject._id)
            const response = await answerSheetService.saveSupplementaryUsage(id!, {
                centreDatesheetEntryId: subject._id,
                roomNo: draft.roomNo,
                rollNo: draft.rollNo,
                serials
            })

            if (response.success) {
                setSupplementaryContext(response.data)
                setUsageDrafts((current) => ({
                    ...current,
                    [subject._id]: createSupplementaryUsageDraft()
                }))
                await loadDetails()
                toast.success('Supplementary usage saved')
            }
        } catch (error: any) {
            console.error('Error saving supplementary usage:', error)
            toast.error(error.response?.data?.error || 'Failed to save supplementary usage')
        } finally {
            setSavingSupplementaryUsage(null)
        }
    }

    const handleRemoveSupplementaryUsage = async (usageId: string, sheetNo?: string) => {
        if (!id) return

        try {
            const response = await answerSheetService.removeSupplementaryUsage(id, usageId, sheetNo)
            if (response.success) {
                setSupplementaryContext(response.data)
                await loadDetails()
                toast.success('Supplementary usage removed')
            }
        } catch (error: any) {
            console.error('Error removing supplementary usage:', error)
            toast.error(error.response?.data?.error || 'Failed to remove supplementary usage')
        }
    }

    const handleSaveSerialNumbers = async () => {
        const validation = validateSerialRangeInputs(editValues.serialRanges, {
            allowMultiple: isSupplementaryEntry(answerSheet?.answerSheetType)
        })

        if (!validation.serialRanges) {
            toast.error(validation.error || 'Please enter valid serial numbers')
            return
        }

        try {
            setLoading(true)
            await answerSheetService.updateAnswerSheet(id!, {
                serialRanges: validation.serialRanges,
                serialFrom: validation.serialRanges[0]?.serialFrom,
                serialTo: validation.serialRanges[validation.serialRanges.length - 1]?.serialTo
            })
            toast.success('Serial numbers updated successfully')
            setEditMode(false)
            await loadDetails() // Reload to get updated allocation
        } catch (error: any) {
            console.error('Error updating serial numbers:', error)
            toast.error(error.response?.data?.error || 'Failed to update serial numbers')
        } finally {
            setLoading(false)
        }
    }

    const handleAddDiscarded = async () => {
        if (discardMode === 'single' && !discardInput.serial) {
            toast.error('Please enter a serial number')
            return
        }
        if (discardMode === 'range' && (!discardInput.fromSerial || !discardInput.toSerial)) {
            toast.error('Please enter both from and to serial numbers')
            return
        }

        try {
            setSavingDiscard(true)
            const data = discardMode === 'single'
                ? { serials: discardInput.serial, reason: discardInput.reason }
                : { fromSerial: discardInput.fromSerial, toSerial: discardInput.toSerial, reason: discardInput.reason }

            await answerSheetService.addDiscardedSerials(id!, data)
            setShowDiscardedModal(false)
            setDiscardInput({ serial: '', fromSerial: '', toSerial: '', reason: 'Damaged/Misprinted' })
            await loadDetails()
        } catch (error: any) {
            console.error('Error adding discarded serials:', error)
            toast.error(error.response?.data?.error || 'Failed to add discarded serials')
        } finally {
            setSavingDiscard(false)
        }
    }

    const handleRemoveDiscarded = async (serial: string) => {
        try {
            await answerSheetService.removeDiscardedSerial(id!, serial)
            await loadDetails()
        } catch (error: any) {
            console.error('Error removing discarded serial:', error)
            toast.error(error.response?.data?.error || 'Failed to remove discarded serial')
        }
    }

    const getDispatchFilename = (alloc: SerialAllocation) => {
        const datePart = (() => {
            const date = new Date(alloc.examDate)
            return Number.isNaN(date.getTime()) ? 'unknown-date' : date.toISOString().split('T')[0]
        })()

        const subjectCode = (alloc.subjectCode || 'subject').replace(/[^a-z0-9_-]/gi, '_')
        return `answer-sheet-dispatch-record-${subjectCode}-${datePart}.pdf`
    }

    const closeDispatchPreview = () => {
        setShowDispatchPreview(false)
        setDispatchPreviewAlloc(null)
        setDispatchPreviewError(null)
        setDispatchPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
    }

    const openDispatchPreview = async (alloc: SerialAllocation) => {
        if (!id) return
        const allocationId = String(alloc._id || '')
        if (!allocationId) return
        const hasAllocation = alloc.serialFrom !== 'N/A' && alloc.serialTo !== 'N/A' && alloc.sheetsAllocated > 0
        if (!hasAllocation) {
            toast.error('No allocation available for preview')
            return
        }
        setDispatchPreviewAlloc(alloc)
        setDispatchPreviewError(null)
        setDispatchPreviewLoading(true)
        setShowDispatchPreview(true)
        setDispatchPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
        try {
            const response = await api.get<Blob>(
                `/answersheets/${id}/dispatch-record/${allocationId}/download`,
                { responseType: 'blob' }
            )
            const blob = response.data
            const contentType = String(response.headers['content-type'] || '')
            if (typeof blob === 'object' && blob !== null && contentType.toLowerCase().includes('application/pdf')) {
                const objectUrl = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
                setDispatchPreviewUrl(objectUrl)
            } else {
                const text = await (blob instanceof Blob ? blob.text() : Promise.resolve(String(blob)))
                let message = 'Failed to generate preview'
                try {
                    const json = JSON.parse(text)
                    if (typeof json?.error === 'string') message = json.error
                } catch (_) { /* ignore */ }
                setDispatchPreviewError(message)
            }
        } catch (error: any) {
            console.error('Failed to load dispatch record preview:', error)
            if (error?.response?.data instanceof Blob) {
                try {
                    const text = await error.response.data.text()
                    const json = JSON.parse(text)
                    if (typeof json?.error === 'string') {
                        setDispatchPreviewError(json.error)
                        return
                    }
                } catch (_) { /* ignore */ }
            }
            setDispatchPreviewError(error?.serverMessage ?? error?.message ?? 'Failed to load dispatch record preview')
        } finally {
            setDispatchPreviewLoading(false)
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const formatAnswerSheetType = (type: string) => {
        const typeMap: Record<string, string> = {
            '32_pages': '32 Pages',
            '20_pages': '20 Pages',
            '40_graph': '40 Pages (Graph)',
            'none': 'Not Specified'
        }
        return typeMap[type] || type
    }

    const goBack = () => navigate(-1)

    if (loading && !answerSheet) {
        return (
            <Page>
                <Card>
                    <CardLoading label="Loading answer sheet…" />
                </Card>
            </Page>
        )
    }

    if (!answerSheet) {
        return (
            <Page>
                <Card>
                    <EmptyState
                        icon={FileText}
                        title="Answer sheet not found"
                        body="It may have been removed, or the link is out of date."
                        action={<Button icon={ArrowLeft} onClick={goBack}>Go back</Button>}
                    />
                </Card>
            </Page>
        )
    }

    // Use usableTotal (total - discarded) for percentage calculation
    const usableTotal = isSupplementary
        ? Math.max(0, (answerSheet?.total || 0) - (supplementaryContext?.discardedCount || allocation?.discardedCount || 0))
        : allocation?.usableTotal || allocation?.total || 0
    const usagePercentage = usableTotal ? Math.round((actualUsedCount / usableTotal) * 100) : 0
    const discardedCount = supplementaryContext?.discardedCount || allocation?.discardedCount || 0
    const usageTone: 'success' | 'warning' | 'danger' =
        usagePercentage > 90 ? 'danger' : usagePercentage > 75 ? 'warning' : 'success'
    const showUtilization =
        (allocation && allocation.hasSerialNumbers) || (isSupplementary && answerSheetSerialRanges.length > 0)
    const typeLabel = formatAnswerSheetType(answerSheet.answerSheetType)

    const cancelEdit = () => {
        setEditMode(false)
        setEditValues({
            serialRanges: getAnswerSheetSerialRanges(answerSheet)
        })
    }

    const closeDiscardDialog = () => {
        setShowDiscardedModal(false)
        setDiscardInput({ serial: '', fromSerial: '', toSerial: '', reason: 'Damaged/Misprinted' })
    }

    const discardedColumns: DataTableColumn<DiscardedSerial>[] = [
        {
            key: 'serial',
            header: 'Serial no.',
            mobile: 'title',
            render: (item) => <span className="cb-strong is-num">{item.serial}</span>,
        },
        {
            key: 'reason',
            header: 'Reason',
            mobile: 'subtitle',
            render: (item) => <span className="cb-muted">{item.reason || '—'}</span>,
        },
        {
            key: 'actions',
            header: '',
            headerLabel: 'Actions',
            align: 'right',
            width: 64,
            mobile: 'aside',
            interactive: true,
            render: (item) => (
                <Button
                    variant="tertiary"
                    size="sm"
                    icon={X}
                    title="Remove from discarded"
                    aria-label={`Remove ${item.serial} from discarded`}
                    onClick={() => handleRemoveDiscarded(item.serial)}
                />
            ),
        },
    ]

    const allocationColumns: DataTableColumn<SerialAllocation>[] = [
        {
            key: 'exam',
            header: 'Date and subject',
            mobile: 'title',
            render: (alloc) => (
                <Entity
                    primary={formatDate(alloc.examDate)}
                    secondary={<span title={alloc.subjectName}>{alloc.subjectName} ({alloc.subjectCode})</span>}
                />
            ),
        },
        {
            key: 'students',
            header: 'Students',
            numeric: true,
            align: 'right',
            render: (alloc) => alloc.candidateCount,
        },
        {
            key: 'range',
            header: 'Serial range',
            mobile: 'subtitle',
            render: (alloc) => (
                <span className="is-num">
                    {alloc.serialFrom} – {alloc.serialTo}
                </span>
            ),
        },
        {
            key: 'sheets',
            header: 'Sheets',
            numeric: true,
            align: 'right',
            mobile: 'aside',
            render: (alloc) => <span className="cb-strong">{alloc.sheetsAllocated}</span>,
        },
        {
            key: 'download',
            header: '',
            headerLabel: 'Dispatch record',
            align: 'right',
            width: 64,
            interactive: true,
            render: (alloc) => {
                const hasAllocation = alloc.serialFrom !== 'N/A' && alloc.serialTo !== 'N/A' && alloc.sheetsAllocated > 0
                const label = hasAllocation ? 'Preview and download dispatch record PDF' : 'No allocation available for download'
                return (
                    <Button
                        variant="tertiary"
                        size="sm"
                        icon={Download}
                        loading={dispatchPreviewLoading && dispatchPreviewAlloc?._id === alloc._id}
                        onClick={() => hasAllocation ? openDispatchPreview(alloc) : undefined}
                        disabled={!hasAllocation || (dispatchPreviewLoading && dispatchPreviewAlloc?._id !== alloc._id)}
                        title={label}
                        aria-label={label}
                    />
                )
            },
        },
    ]

    const usageRowsFor = (subject: SupplementarySubjectContext) =>
        subject.usages.map((usage, usageIndex) => ({
            usage,
            sheetNo: usage.sheetNo || usage.serials?.[0] || '-',
            key: `${usage._id}-${usage.sheetNo || usage.serials?.[0] || '-'}-${usageIndex}`,
        }))

    const usageColumns: DataTableColumn<{ usage: SupplementaryUsageRecord; sheetNo: string; key: string }>[] = [
        { key: 'room', header: 'Room no.', mobile: 'subtitle', render: (row) => row.usage.roomNo },
        { key: 'roll', header: 'Roll number', mobile: 'title', render: (row) => <span className="cb-strong is-num">{row.usage.rollNo}</span> },
        { key: 'sheet', header: 'Sheet no.', render: (row) => <span className="is-num">{row.sheetNo}</span> },
        {
            key: 'actions',
            header: '',
            headerLabel: 'Actions',
            align: 'right',
            width: 64,
            mobile: 'aside',
            interactive: true,
            render: (row) => (
                <Button
                    variant="tertiary"
                    size="sm"
                    icon={X}
                    title="Remove usage"
                    aria-label={`Remove sheet ${row.sheetNo} for roll ${row.usage.rollNo}`}
                    onClick={() => handleRemoveSupplementaryUsage(row.usage._id, row.usage.sheetNo || row.usage.serials?.[0])}
                />
            ),
        },
    ]

    const serialCardAction = !editMode ? (
        <Button size="sm" icon={Pencil} onClick={() => setEditMode(true)}>
            Edit range
        </Button>
    ) : (
        <div className="cb-card-actions">
            <Button size="sm" variant="tertiary" onClick={cancelEdit} disabled={loading}>
                Cancel
            </Button>
            <Button size="sm" variant="primary" icon={Save} onClick={handleSaveSerialNumbers} disabled={loading}>
                Save range
            </Button>
        </div>
    )

    const subtitleParts = [`Class ${answerSheet.class}`, `${answerSheet.pages} pages`, answerSheet.colour].filter(Boolean)

    return (
        <Page>
            <PageHeader
                title={`${typeLabel} answer sheets`}
                subtitle={subtitleParts.join(' · ')}
            />

            <div className="cb-grid-8-4">
                <div className="cb-stack">
                    {/* Serial number range */}
                    <Card
                        title={answerSheetSerialRanges.length > 1 ? 'Serial number ranges' : 'Serial number range'}
                        subtitle={editMode ? 'Enter the range printed on the bundles received from the board.' : undefined}
                        action={serialCardAction}
                    >
                        {editMode ? (
                            <div className="cb-form-section">
                                {editValues.serialRanges.map((range, rangeIndex) => (
                                    <div
                                        key={`edit-range-${rangeIndex}`}
                                        className={isSupplementary ? 'cx-asd-range' : 'cx-asd-range cx-asd-range--pair'}
                                    >
                                        <TextField
                                            label={editValues.serialRanges.length > 1 ? `Range ${rangeIndex + 1} from` : 'Start from'}
                                            value={range.serialFrom}
                                            onChange={(e) => updateEditSerialRange(rangeIndex, 'serialFrom', e.target.value)}
                                            placeholder="e.g. 626101"
                                            inputMode="numeric"
                                        />
                                        <TextField
                                            label="End at"
                                            value={range.serialTo}
                                            onChange={(e) => updateEditSerialRange(rangeIndex, 'serialTo', e.target.value)}
                                            placeholder="e.g. 627458"
                                            inputMode="numeric"
                                        />
                                        {isSupplementary && (
                                            <Button
                                                variant="tertiary"
                                                icon={Trash2}
                                                onClick={() => removeEditSerialRange(rangeIndex)}
                                                disabled={editValues.serialRanges.length === 1}
                                                aria-label={`Remove range ${rangeIndex + 1}`}
                                                title="Remove range"
                                            />
                                        )}
                                    </div>
                                ))}
                                {isSupplementary && (
                                    <div>
                                        <Button size="sm" variant="tertiary" icon={Plus} onClick={addEditSerialRange}>
                                            Add another range
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : answerSheetSerialRanges.length > 0 ? (
                            <DetailList
                                items={answerSheetSerialRanges.map((range, rangeIndex) => ({
                                    label: answerSheetSerialRanges.length > 1 ? `Range ${rangeIndex + 1}` : 'Configured range',
                                    value: <span className="cb-strong is-num">{formatSerialRangeLabel(range)}</span>,
                                }))}
                            />
                        ) : (
                            <p className="cb-muted">No serial range set yet.</p>
                        )}
                    </Card>

                    {/* Utilization */}
                    {showUtilization && (
                        <Card title="Utilization so far">
                            <div className="cb-form-section">
                                <Progress
                                    value={Math.min(usagePercentage, 100)}
                                    valueLabel={`${usagePercentage}%`}
                                    tone={usageTone}
                                    label={
                                        <>
                                            {actualUsedCount.toLocaleString()} used of {usableTotal.toLocaleString()} usable
                                            {discardedCount > 0 && ` (${discardedCount} discarded)`}
                                        </>
                                    }
                                />
                                {!isSupplementary && allocation?.totalAllocated != null && actualUsedCount < allocation.totalAllocated && (
                                    <p className="cb-subtle">
                                        Total allocated across all exam dates: <span className="is-num">{allocation.totalAllocated.toLocaleString()}</span>
                                    </p>
                                )}
                                <MetricTiles>
                                    <MetricTile label="Received" value={(answerSheet.total || 0).toLocaleString()} />
                                    <MetricTile label="Used" value={actualUsedCount.toLocaleString()} />
                                    <MetricTile
                                        label="Discarded"
                                        value={discardedCount.toLocaleString()}
                                        tone={discardedCount > 0 ? 'danger' : 'neutral'}
                                    />
                                    <MetricTile label="Balance" value={(usableTotal - actualUsedCount).toLocaleString()} />
                                </MetricTiles>
                            </div>
                        </Card>
                    )}

                    {/* Discarded sheets */}
                    {allocation && allocation.hasSerialNumbers && (
                        <Card
                            flush
                            title="Discarded sheets"
                            subtitle="Damaged or unusable sheets are skipped during allocation."
                            action={
                                <Button size="sm" icon={Ban} onClick={() => setShowDiscardedModal(true)}>
                                    Mark discarded
                                </Button>
                            }
                        >
                            <DataTable
                                columns={discardedColumns}
                                rows={allocation.discardedSerials || []}
                                getRowKey={(item) => item.serial}
                                density="compact"
                                maxHeight="16rem"
                                empty={
                                    <EmptyState
                                        compact
                                        icon={Ban}
                                        title="No discarded sheets"
                                        body="Use Mark discarded to record damaged or unusable sheets."
                                    />
                                }
                            />
                        </Card>
                    )}

                    {/* Supplementary usage */}
                    {isSupplementary && supplementarySubjects.length > 0 && (
                        <Card
                            title="Supplementary usage"
                            subtitle={`Pick the room, roll number and sheet numbers for each subject · ${supplementarySubjects.length} subjects`}
                        >
                            <div className="cx-asd-subjects">
                                {supplementarySubjects.map((subject, index) => {
                                    const draft = usageDrafts[subject._id] || createSupplementaryUsageDraft()
                                    const selectedRoom = subject.roomOptions.find((option) => option.roomNo === draft.roomNo)
                                    const usageRows = usageRowsFor(subject)

                                    return (
                                        <div key={subject._id || index} className="cx-asd-subject">
                                            <div className="cx-asd-subject__head">
                                                <Entity
                                                    primary={formatDate(subject.examDate)}
                                                    secondary={<span title={subject.subjectName}>{subject.subjectName} ({subject.subjectCode})</span>}
                                                />
                                                <div className="cx-asd-subject__meta">
                                                    <span className="is-num">{subject.candidateCount} candidates</span>
                                                    <span aria-hidden="true">·</span>
                                                    <span className="is-num">{subject.usedCount} used</span>
                                                </div>
                                            </div>

                                            {subject.roomError && <Banner tone="danger">{subject.roomError}</Banner>}

                                            <div className="cb-form-grid cb-form-grid--3">
                                                <Select
                                                    label="Room no."
                                                    value={draft.roomNo}
                                                    onChange={(e) => handleSupplementaryRoomChange(subject._id, e.target.value)}
                                                    placeholder="Select room"
                                                    options={subject.roomOptions.map((room) => room.roomNo)}
                                                />
                                                <Select
                                                    label="Roll no."
                                                    value={draft.rollNo}
                                                    onChange={(e) => updateSupplementaryDraft(subject._id, (current) => ({
                                                        ...current,
                                                        rollNo: e.target.value
                                                    }))}
                                                    disabled={!draft.roomNo}
                                                    placeholder={draft.roomNo ? 'Select roll no' : 'Select room first'}
                                                    options={selectedRoom?.rollNos || []}
                                                />
                                                <TextField
                                                    label="Sheet numbers"
                                                    value={draft.serialInput}
                                                    onChange={(e) => updateSupplementaryDraft(subject._id, (current) => ({
                                                        ...current,
                                                        serialInput: e.target.value
                                                    }))}
                                                    placeholder="Comma separated"
                                                />
                                            </div>

                                            {draft.serials.length > 0 && (
                                                <div className="cx-asd-tags" aria-label="Sheet numbers to save">
                                                    {draft.serials.map((serial) => (
                                                        <span key={serial} className="cx-asd-tag">
                                                            {serial}
                                                            <button
                                                                type="button"
                                                                className="cx-asd-tag__remove"
                                                                onClick={() => handleRemoveSupplementarySerial(subject._id, serial)}
                                                                aria-label={`Remove sheet ${serial}`}
                                                            >
                                                                <X size={14} strokeWidth={1.75} aria-hidden="true" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="cb-card-actions">
                                                <Button size="sm" variant="tertiary" icon={Plus} onClick={() => handleAddSupplementarySerials(subject._id)}>
                                                    Add sheets
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    icon={Save}
                                                    onClick={() => handleSaveSupplementaryUsage(subject)}
                                                    loading={savingSupplementaryUsage === subject._id}
                                                    disabled={!!subject.roomError}
                                                >
                                                    Save usage
                                                </Button>
                                            </div>

                                            {usageRows.length > 0 && (
                                                <div className="cx-asd-subject__usages">
                                                    <DataTable
                                                        columns={usageColumns}
                                                        rows={usageRows}
                                                        getRowKey={(row) => row.key}
                                                        density="compact"
                                                        caption={`Recorded usage for ${subject.subjectName}`}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </Card>
                    )}

                    {/* Allocation schedule */}
                    {!isSupplementary && allocation && allocation.hasSerialNumbers && allocation.allocations.length > 0 && (
                        <Card
                            flush
                            title="Allocation schedule"
                            subtitle={`Date-wise distribution, skipping discarded sheets · ${allocation.allocations.length} exams`}
                        >
                            <DataTable
                                columns={allocationColumns}
                                rows={allocation.allocations}
                                getRowKey={(alloc) => String(alloc._id || `${alloc.examDate}-${alloc.subjectCode}`)}
                            />
                        </Card>
                    )}

                    {/* Empty states */}
                    {!loading && isSupplementary && supplementarySubjects.length === 0 && answerSheetSerialRanges.length > 0 && (
                        <Card>
                            <EmptyState
                                title="No subjects available"
                                body="No class-wise exam subjects were found for manual supplementary usage."
                            />
                        </Card>
                    )}

                    {!loading && !isSupplementary && allocation && allocation.hasSerialNumbers && allocation.allocations.length === 0 && (
                        <Card>
                            <EmptyState
                                title="No exams scheduled"
                                body="No exams use this answer sheet type yet. Check the datesheet configuration."
                            />
                        </Card>
                    )}

                    {!loading && !editMode && (
                        (!isSupplementary && (!allocation || !allocation.hasSerialNumbers))
                        || (isSupplementary && answerSheetSerialRanges.length === 0)
                    ) && (
                        <Card>
                            <EmptyState
                                icon={FileText}
                                title="Set the serial number range"
                                body="Enter the range allotted by the board to start tracking usage and distribution across exams."
                                action={
                                    <Button variant="primary" icon={Pencil} onClick={() => setEditMode(true)}>
                                        Set serial numbers
                                    </Button>
                                }
                            />
                        </Card>
                    )}
                </div>

                <div className="cb-stack">
                    <Card title="Details">
                        <DetailList
                            columns={1}
                            items={[
                                { label: 'Type', value: typeLabel },
                                { label: 'Pages', value: answerSheet.pages ? `${answerSheet.pages} pages` : null },
                                { label: 'Colour', value: answerSheet.colour },
                                { label: 'Class', value: answerSheet.class ? `Class ${answerSheet.class}` : null },
                            ]}
                        />
                    </Card>

                    <Card title="Guidelines">
                        <ul className="cx-asd-guidelines">
                            <li>Check that the serial range matches the physical bundles received from the board, and report any discrepancy before sheets are allocated.</li>
                            <li>Verify bundle seals before opening packages.</li>
                            <li>Maintain a daily usage log signed by the Superintendent.</li>
                            <li>Return unused sheets to safe storage immediately.</li>
                        </ul>
                    </Card>
                </div>
            </div>

            {/* Mark discarded */}
            <Dialog
                open={showDiscardedModal}
                onClose={closeDiscardDialog}
                title="Mark sheets as discarded"
                description={`Valid ${answerSheetSerialRanges.length > 1 ? 'ranges' : 'range'}: ${answerSheetSerialRanges.map(formatSerialRangeLabel).join(', ') || '—'}`}
                footer={
                    <>
                        <Button variant="tertiary" onClick={closeDiscardDialog}>
                            Cancel
                        </Button>
                        <Button variant="danger" icon={Trash2} onClick={handleAddDiscarded} loading={savingDiscard}>
                            Mark as discarded
                        </Button>
                    </>
                }
            >
                <div className="cb-form-section">
                    <Tabs
                        variant="segmented"
                        label="Discard a single sheet or a range"
                        value={discardMode}
                        onChange={(mode) => setDiscardMode(mode as 'single' | 'range')}
                        items={[
                            { id: 'single', label: 'Single serial' },
                            { id: 'range', label: 'Range' },
                        ]}
                    />
                    {discardMode === 'single' ? (
                        <TextField
                            label="Serial number"
                            value={discardInput.serial}
                            onChange={(e) => setDiscardInput({ ...discardInput, serial: e.target.value })}
                            placeholder={`e.g. ${answerSheetSerialRanges[0]?.serialFrom || answerSheet?.serialFrom || '446351'}`}
                        />
                    ) : (
                        <div className="cb-form-grid">
                            <TextField
                                label="From serial"
                                value={discardInput.fromSerial}
                                onChange={(e) => setDiscardInput({ ...discardInput, fromSerial: e.target.value })}
                                placeholder={answerSheetSerialRanges[0]?.serialFrom || answerSheet?.serialFrom || '446351'}
                            />
                            <TextField
                                label="To serial"
                                value={discardInput.toSerial}
                                onChange={(e) => setDiscardInput({ ...discardInput, toSerial: e.target.value })}
                                placeholder={answerSheetSerialRanges[answerSheetSerialRanges.length - 1]?.serialTo || answerSheet?.serialTo || '446700'}
                            />
                        </div>
                    )}
                    <Select
                        id="discard-reason"
                        label="Reason"
                        value={discardInput.reason}
                        onChange={(e) => setDiscardInput({ ...discardInput, reason: e.target.value })}
                        options={DISCARD_REASONS}
                    />
                </div>
            </Dialog>

            {/* Dispatch record PDF preview */}
            <Sheet
                open={showDispatchPreview && Boolean(dispatchPreviewUrl || dispatchPreviewLoading || dispatchPreviewError)}
                onClose={closeDispatchPreview}
                size="xl"
                title="Dispatch record"
                description={dispatchPreviewAlloc ? `${formatDate(dispatchPreviewAlloc.examDate)} · ${dispatchPreviewAlloc.subjectName}` : undefined}
                footer={
                    <>
                        <Button variant="tertiary" onClick={closeDispatchPreview}>
                            Close
                        </Button>
                        {dispatchPreviewUrl && (
                            <>
                                <Button icon={ExternalLink} onClick={() => window.open(dispatchPreviewUrl, '_blank', 'noopener,noreferrer')}>
                                  Open in new tab
                                </Button>
                                <Button
                                  variant="primary"
                                  icon={Download}
                                  onClick={() => {
                                    const link = document.createElement('a')
                                    link.href = dispatchPreviewUrl
                                    link.download = dispatchPreviewAlloc ? getDispatchFilename(dispatchPreviewAlloc) : 'dispatch-record.pdf'
                                    link.click()
                                  }}
                                >
                                  Download PDF
                                </Button>
                            </>
                        )}
                    </>
                }
            >
                <div className="cx-asd-pdf">
                    {dispatchPreviewLoading ? (
                        <CardLoading label="Generating preview…" />
                    ) : dispatchPreviewError ? (
                        <EmptyState
                            icon={FileText}
                            title={dispatchPreviewError}
                            body="Close and try again, or check the allocation and rooms."
                        />
                    ) : dispatchPreviewUrl ? (
                        <iframe src={`${dispatchPreviewUrl}#toolbar=0`} title="Dispatch record PDF preview" />
                    ) : null}
                </div>
            </Sheet>
        </Page>
    )
}

export default AnswerSheetDetails
