const AnswerSheet = require('../models/AnswerSheet')
const AnswerSheetsParser = require('../utils/answerSheetsParser')
const AnswerSheetsExcelParser = require('../utils/answerSheetsExcelParser')
const { ANSWER_SHEET_TYPES } = require('../utils/answerSheetTypes')
const pdfGenerator = require('../utils/pdfGenerator')
const seatingPlanBuilder = require('../utils/seatingPlanBuilder')
const {
  normalizeAnswerSheetSerialRanges,
  getConfiguredSerialRanges,
  isSerialWithinAnswerSheetRanges,
  normalizeSerialValue
} = require('../utils/answerSheetSerialRanges')
const { compareRoomNo } = require('../utils/roomSort')
const cloudinary = require('cloudinary').v2
const fs = require('fs')
const path = require('path')

const ACTIVE_CANDIDATE_FILTER = {
  $or: [{ status: 'active' }, { status: { $exists: false } }],
}

const resolveSerialRangePayload = (payload = {}, existingAnswerSheet = null) => {
  const hasSerialRanges = Object.prototype.hasOwnProperty.call(payload, 'serialRanges')
  const hasSerialFrom = Object.prototype.hasOwnProperty.call(payload, 'serialFrom')
  const hasSerialTo = Object.prototype.hasOwnProperty.call(payload, 'serialTo')

  if (hasSerialRanges) {
    return normalizeAnswerSheetSerialRanges({ serialRanges: payload.serialRanges })
  }

  if (hasSerialFrom || hasSerialTo) {
    return normalizeAnswerSheetSerialRanges({
      serialFrom: hasSerialFrom ? payload.serialFrom : existingAnswerSheet?.serialFrom,
      serialTo: hasSerialTo ? payload.serialTo : existingAnswerSheet?.serialTo
    })
  }

  if (existingAnswerSheet) {
    return normalizeAnswerSheetSerialRanges({
      serialRanges: existingAnswerSheet.serialRanges,
      serialFrom: existingAnswerSheet.serialFrom,
      serialTo: existingAnswerSheet.serialTo
    })
  }

  return normalizeAnswerSheetSerialRanges({
    serialRanges: payload.serialRanges,
    serialFrom: payload.serialFrom,
    serialTo: payload.serialTo
  })
}

const syncAnswerSheetTotals = async () => {
  const sheets = await AnswerSheet.find({ isActive: true })
    .select('_id serialRanges serialFrom serialTo total used discarded')

  const updates = []

  sheets.forEach(sheet => {
    let normalizedSerials

    try {
      normalizedSerials = resolveSerialRangePayload({}, sheet)
    } catch (error) {
      console.warn(`Skipping total sync for sheet ${sheet._id}: ${error.message}`)
      return
    }

    const { total: recalculatedTotal } = normalizedSerials
    const hasSameSerialState = (
      JSON.stringify(sheet.serialRanges || []) === JSON.stringify(normalizedSerials.serialRanges)
      && sheet.serialFrom === normalizedSerials.serialFrom
      && sheet.serialTo === normalizedSerials.serialTo
    )

    if (recalculatedTotal === sheet.total && hasSameSerialState) return

    const consumed = (sheet.used || 0) + (sheet.discarded || 0)
    if (consumed > recalculatedTotal) {
      console.warn(
        `Skipping total sync for sheet ${sheet._id}: consumed (${consumed}) exceeds recalculated total (${recalculatedTotal})`
      )
      return
    }

    updates.push({
      updateOne: {
        filter: { _id: sheet._id },
        update: {
          $set: {
            serialRanges: normalizedSerials.serialRanges,
            serialFrom: normalizedSerials.serialFrom,
            serialTo: normalizedSerials.serialTo,
            total: recalculatedTotal
          }
        }
      }
    })
  })

  if (updates.length > 0) {
    await AnswerSheet.bulkWrite(updates)
  }

  return updates.length
}

const getExpectedDatesheetAnswerSheetType = (answerSheet) => {
  let expectedAnswerSheetType = null

  if (answerSheet.answerSheetType === 'Main') {
    if (answerSheet.pages === 32) {
      expectedAnswerSheetType = '32_pages'
    } else if (answerSheet.pages === 20) {
      expectedAnswerSheetType = '20_pages'
    }
  } else if (answerSheet.answerSheetType === 'Graph') {
    expectedAnswerSheetType = '40_graph'
  } else if (answerSheet.answerSheetType === 'Drawing Sheets') {
    expectedAnswerSheetType = 'drawing_sheets'
  }

  return expectedAnswerSheetType
}

const getSeatPlanOptionsForRequest = async (req) => {
  const SeatingPlanTemplateSetting = req.models?.SeatingPlanTemplateSetting
  const CentreDetail = req.models?.CentreDetail

  let roomAllocationMode = 'auto'
  if (SeatingPlanTemplateSetting) {
    const settingsDoc = await SeatingPlanTemplateSetting.findOne({}).sort({ updatedAt: -1 })
    if (String(settingsDoc?.roomAllocationMode || '').toLowerCase() === 'manual') {
      roomAllocationMode = 'manual'
    }
  }

  const centreDetails = CentreDetail
    ? await CentreDetail.findOne({}).sort({ updatedAt: -1 }).lean()
    : null

  return { roomAllocationMode, centreDetails }
}

const getRoomRollOptionsForEntry = async (entryId, req) => {
  const SeatingPlanAllocation = require('../models/SeatingPlanAllocation')

  let allocations = await SeatingPlanAllocation.find({ datesheetEntryId: entryId })
    .select('roomNo rollNo')
    .lean()

  if (!allocations.length) {
    try {
      const seatingOptions = await getSeatPlanOptionsForRequest(req)
      await seatingPlanBuilder.buildSeatingData(entryId, seatingOptions)
      allocations = await SeatingPlanAllocation.find({ datesheetEntryId: entryId })
        .select('roomNo rollNo')
        .lean()
    } catch (error) {
      return {
        roomOptions: [],
        roomError: error?.message || 'Failed to load seating plan'
      }
    }
  }

  const roomMap = new Map()

  allocations.forEach((allocation) => {
    const roomNo = String(allocation.roomNo || '').trim()
    const rollNo = String(allocation.rollNo || '').trim()
    if (!roomNo || !rollNo) return

    if (!roomMap.has(roomNo)) {
      roomMap.set(roomNo, new Set())
    }

    roomMap.get(roomNo).add(rollNo)
  })

  const roomOptions = Array.from(roomMap.entries())
    .map(([roomNo, rollNoSet]) => ({
      roomNo,
      rollNos: Array.from(rollNoSet).sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
      )
    }))
    .sort(compareRoomNo)

  return {
    roomOptions
  }
}

const getRelatedExamsForAnswerSheet = async (answerSheet) => {
  const CBSEDatesheet = require('../models/CBSEDatesheet')
  const Candidate = require('../models/Candidate')

  const cbseDatesheet = await CBSEDatesheet.getActive()
  if (!cbseDatesheet) return []

  const candidates = await Candidate.find(ACTIVE_CANDIDATE_FILTER)
    .populate('subjects', 'code name class')
    .lean()

  const subjectFrequency = new Map()

  candidates.forEach(candidate => {
    if (candidate.subjects && candidate.subjects.length > 0) {
      candidate.subjects.forEach(subject => {
        if (subject && subject.code && subject.class) {
          const key = `${subject.code}-${subject.class}`
          const count = subjectFrequency.get(key) || 0
          subjectFrequency.set(key, count + 1)
        }
      })
    }
  })

  const normalizedClass = answerSheet.class.includes('th') ? answerSheet.class : `${answerSheet.class}th`
  const expectedAnswerSheetType = getExpectedDatesheetAnswerSheetType(answerSheet)
  const isSupplementary = answerSheet.answerSheetType === 'Supplementary'

  return cbseDatesheet.entries
    .filter(entry => {
      if (entry.subject.class !== normalizedClass) return false
      if (!isSupplementary && expectedAnswerSheetType && entry.answerSheet !== expectedAnswerSheetType) return false
      return true
    })
    .map(entry => {
      const key = `${entry.subject.code}-${entry.subject.class}`
      const normalizedKey = `${entry.subject.code}-${entry.subject.class.replace(/th$/i, '')}`
      const candidateCount = subjectFrequency.get(key) || subjectFrequency.get(normalizedKey) || 0

      return {
        _id: entry._id,
        examDate: entry.examDate,
        dayName: entry.dayName,
        subjectCode: entry.subject.code,
        subjectName: entry.subject.name,
        class: entry.subject.class,
        timeSlot: entry.timeSlot,
        duration: entry.subject.duration,
        candidateCount,
        answerSheetType: entry.answerSheet
      }
    })
    .filter(exam => exam.candidateCount > 0)
    .sort((a, b) => {
      const dateDiff = new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
      if (dateDiff !== 0) return dateDiff
      return b.candidateCount - a.candidateCount
    })
}

const getSupplementaryUsedSerials = (answerSheet) => {
  const serialSet = new Set()
  ;(answerSheet?.supplementaryUsages || []).forEach((usage) => {
    ;(usage.serials || []).forEach((serial) => {
      const normalized = normalizeSerialValue(serial)
      if (normalized) {
        serialSet.add(normalized)
      }
    })
  })
  return serialSet
}

const buildSupplementaryUsageContext = async (answerSheet, req, relatedExams = null) => {
  const exams = Array.isArray(relatedExams)
    ? relatedExams
    : await getRelatedExamsForAnswerSheet(answerSheet)

  const usedSerialSet = getSupplementaryUsedSerials(answerSheet)
  const discardedCount = (answerSheet.discardedSerials || []).length
  const subjects = await Promise.all(exams.map(async (exam) => {
    const { roomOptions, roomError } = await getRoomRollOptionsForEntry(exam._id, req)
    // Flatten serial arrays so each saved row represents exactly one sheet number.
    const usages = (answerSheet.supplementaryUsages || [])
      .filter((usage) => String(usage.centreDatesheetEntry) === String(exam._id))
      .flatMap((usage) => {
        const serials = (usage.serials || [])
          .map(normalizeSerialValue)
          .filter(Boolean)

        if (!serials.length) return []

        return serials.map((serial) => ({
          _id: usage._id,
          centreDatesheetEntryId: usage.centreDatesheetEntry,
          examDate: usage.examDate,
          subjectCode: usage.subjectCode,
          subjectName: usage.subjectName,
          roomNo: usage.roomNo,
          rollNo: usage.rollNo,
          sheetNo: serial,
          serials: [serial],
          createdAt: usage.createdAt
        }))
      })
      .sort((left, right) => {
        const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        if (timeDiff !== 0) return timeDiff
        return String(left.sheetNo || '').localeCompare(String(right.sheetNo || ''), undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      })

    return {
      ...exam,
      roomOptions,
      roomError,
      usages,
      usedCount: usages.length
    }
  }))

  return {
    totalUsed: usedSerialSet.size,
    availableCount: Math.max(0, (answerSheet.total || 0) - discardedCount - usedSerialSet.size),
    discardedCount,
    usedSerials: Array.from(usedSerialSet).sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
    ),
    subjects
  }
}

const getSerialAllocationDataForAnswerSheet = async (answerSheet) => {
  const configuredRanges = getConfiguredSerialRanges(answerSheet)
  const discardedCount = (answerSheet.discardedSerials || []).length

  if (configuredRanges.length === 0 || !answerSheet.serialFrom || !answerSheet.serialTo) {
    return {
      hasSerialNumbers: false,
      allocations: []
    }
  }

  const CBSEDatesheet = require('../models/CBSEDatesheet')
  const Candidate = require('../models/Candidate')

  const cbseDatesheet = await CBSEDatesheet.getActive()

  if (!cbseDatesheet) {
    return {
      hasSerialNumbers: true,
      serialRanges: configuredRanges,
      serialFrom: answerSheet.serialFrom,
      serialTo: answerSheet.serialTo,
      total: answerSheet.total,
      allocations: []
    }
  }

  if (answerSheet.answerSheetType === 'Supplementary') {
    const usedSerialCount = getSupplementaryUsedSerials(answerSheet).size
    const usableTotal = answerSheet.total - discardedCount

    return {
      hasSerialNumbers: true,
      serialRanges: configuredRanges,
      serialFrom: answerSheet.serialFrom,
      serialTo: answerSheet.serialTo,
      total: answerSheet.total,
      discardedCount,
      discardedSerials: answerSheet.discardedSerials || [],
      usableTotal,
      allocations: [],
      totalAllocated: usedSerialCount,
      remaining: usableTotal - usedSerialCount,
      manualSupplementary: true
    }
  }

  const candidates = await Candidate.find(ACTIVE_CANDIDATE_FILTER)
    .populate('subjects', 'code name class')
    .lean()

  const subjectFrequency = new Map()

  candidates.forEach(candidate => {
    if (candidate.subjects && candidate.subjects.length > 0) {
      candidate.subjects.forEach(subject => {
        if (subject && subject.code && subject.class) {
          const key = `${subject.code}-${subject.class}`
          const count = subjectFrequency.get(key) || 0
          subjectFrequency.set(key, count + 1)
        }
      })
    }
  })

  const normalizedClass = answerSheet.class.includes('th') ? answerSheet.class : `${answerSheet.class}th`
  const expectedAnswerSheetType = getExpectedDatesheetAnswerSheetType(answerSheet)

  const relatedExams = cbseDatesheet.entries
    .filter(entry => {
      if (entry.subject.class !== normalizedClass) return false
      if (expectedAnswerSheetType && entry.answerSheet !== expectedAnswerSheetType) return false
      return true
    })
    .map(entry => {
      const key = `${entry.subject.code}-${entry.subject.class}`
      const normalizedKey = `${entry.subject.code}-${entry.subject.class.replace(/th$/i, '')}`
      const candidateCount = subjectFrequency.get(key) || subjectFrequency.get(normalizedKey) || 0

      return {
        _id: entry._id,
        examDate: entry.examDate,
        dayName: entry.dayName,
        subjectCode: entry.subject.code,
        subjectName: entry.subject.name,
        class: entry.subject.class,
        timeSlot: entry.timeSlot,
        duration: entry.subject.duration,
        candidateCount
      }
    })
    .filter(exam => exam.candidateCount > 0)
    .sort((a, b) => {
      const dateDiff = new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
      if (dateDiff !== 0) return dateDiff
      return b.candidateCount - a.candidateCount
    })

  const fromNum = parseInt(answerSheet.serialFrom.replace(/\D/g, ''), 10)
  const toNum = parseInt(answerSheet.serialTo.replace(/\D/g, ''), 10)
  const prefix = answerSheet.serialFrom.replace(/\d+$/, '')
  const padLength = answerSheet.serialFrom.replace(/\D/g, '').length

  const discardedSet = new Set(
    (answerSheet.discardedSerials || []).map(d => parseInt(d.serial.replace(/\D/g, ''), 10))
  )

  const formatSerial = (num) => prefix + num.toString().padStart(padLength, '0')

  const getNextAvailable = (start) => {
    let current = start
    while (discardedSet.has(current) && current <= toNum) {
      current += 1
    }
    return current <= toNum ? current : null
  }

  let currentSerial = getNextAvailable(fromNum)

  const allocations = relatedExams.map(exam => {
    if (currentSerial === null) {
      return {
        ...exam,
        serialFrom: 'N/A',
        serialTo: 'N/A',
        sheetsAllocated: 0,
        insufficientSheets: true
      }
    }

    const serialStart = currentSerial
    let sheetsAssigned = 0
    let serialEnd = currentSerial

    while (sheetsAssigned < exam.candidateCount && currentSerial !== null && currentSerial <= toNum) {
      if (!discardedSet.has(currentSerial)) {
        serialEnd = currentSerial
        sheetsAssigned += 1
      }

      currentSerial += 1

      while (discardedSet.has(currentSerial) && currentSerial <= toNum) {
        currentSerial += 1
      }
    }

    if (currentSerial > toNum) {
      currentSerial = null
    }

    return {
      ...exam,
      serialFrom: formatSerial(serialStart),
      serialTo: formatSerial(serialEnd),
      sheetsAllocated: sheetsAssigned,
      insufficientSheets: sheetsAssigned < exam.candidateCount
    }
  })

  const totalAllocated = allocations.reduce((sum, alloc) => sum + alloc.sheetsAllocated, 0)
  const usableTotal = answerSheet.total - discardedCount

  return {
    hasSerialNumbers: true,
    serialRanges: configuredRanges,
    serialFrom: answerSheet.serialFrom,
    serialTo: answerSheet.serialTo,
    total: answerSheet.total,
    discardedCount,
    discardedSerials: answerSheet.discardedSerials || [],
    usableTotal,
    allocations,
    totalAllocated,
    remaining: usableTotal - totalAllocated
  }
}

const getAcademicSession = (dateValue) => {
  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) return ''

  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const sessionStartYear = month <= 3 ? year - 1 : year
  const sessionEndYear = sessionStartYear + 1

  return `${sessionStartYear}-${sessionEndYear}`
}

const formatDispatchDateWithDay = (dateValue) => {
  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return String(dateValue || '')
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })

  return `${day}.${month}.${year} (${dayName})`
}

const formatRecordDate = (dateValue) => {
  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return String(dateValue || '')
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}.${month}.${year}`
}

const getRecordDayName = (dateValue) => {
  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleDateString('en-US', { weekday: 'long' })
}

const getEndOfDay = (dateValue) => {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(23, 59, 59, 999)
  return date
}

const getRangeCount = (range) => {
  try {
    return normalizeAnswerSheetSerialRanges({ serialRanges: [range] }).total
  } catch (_) {
    return 0
  }
}

const buildReceivedRangeRows = (answerSheet) => {
  const configuredRanges = getConfiguredSerialRanges(answerSheet)

  if (!configuredRanges.length) {
    return [{
      srNo: 1,
      serialFrom: answerSheet.serialFrom || 'N/A',
      serialTo: answerSheet.serialTo || 'N/A',
      count: answerSheet.total || 0
    }]
  }

  return configuredRanges.map((range, index) => ({
    srNo: index + 1,
    serialFrom: range.serialFrom || 'N/A',
    serialTo: range.serialTo || 'N/A',
    count: getRangeCount(range)
  }))
}

const getRoomCountForRecord = (roomOptions = []) => {
  const uniqueRoomNos = new Set(
    roomOptions
      .map((room) => String(room?.roomNo || '').trim())
      .filter(Boolean)
  )

  return uniqueRoomNos.size
}

const getSerialSortValue = (serialValue) => {
  const numericValue = parseInt(String(serialValue || '').replace(/\D/g, ''), 10)
  return Number.isNaN(numericValue) ? Number.MAX_SAFE_INTEGER : numericValue
}

const formatDiscardedLabel = (serials = []) => {
  if (!serials.length) return '0'
  return `${serials.length} (${serials.join(', ')})`
}

const buildConsolidatedRecordTemplateData = async (answerSheet, req) => {
  const CentreDetail = req.models?.CentreDetail
  const centreDetails = CentreDetail
    ? await CentreDetail.findOne({}).sort({ updatedAt: -1 }).lean()
    : null

  const schoolName = (centreDetails?.centreName && String(centreDetails.centreName).trim())
    || seatingPlanBuilder.schoolName
    || 'EXAMINATION CENTRE'
  const centreNo = (centreDetails?.centreNo && String(centreDetails.centreNo).trim())
    || seatingPlanBuilder.centreNo
    || ''
  const signedBy = 'Centre Superintendent'
  const receivedRanges = buildReceivedRangeRows(answerSheet)
  const totalReceived = Number(answerSheet.total || 0)
  const totalDiscarded = (answerSheet.discardedSerials || []).length
  const isSupplementary = answerSheet.answerSheetType === 'Supplementary'
  const receivedRows = receivedRanges.map((range, index) => ({
    ...range,
    seriesNo: index + 1,
    receivedLabel: index === 0 ? 'Received' : '',
    grandTotal: index === 0 ? totalReceived : ''
  }))
  const notes = []
  let rows = []
  let totalUsed = 0

  if (isSupplementary) {
    const relatedExams = await getRelatedExamsForAnswerSheet(answerSheet)
    const examById = new Map(relatedExams.map((exam) => [String(exam._id), exam]))
    const usedSerialSet = getSupplementaryUsedSerials(answerSheet)
    totalUsed = usedSerialSet.size

    const discardedEntries = (answerSheet.discardedSerials || [])
      .map((item) => ({
        serial: normalizeSerialValue(item.serial),
        discardedAt: new Date(item.discardedAt)
      }))
      .filter((item) => item.serial)

    const normalizedRows = (answerSheet.supplementaryUsages || [])
      .flatMap((usage) => {
        const exam = examById.get(String(usage.centreDatesheetEntry || ''))
        const examDate = usage.examDate || exam?.examDate
        const serials = (usage.serials || [])
          .map((serial) => normalizeSerialValue(serial))
          .filter(Boolean)

        if (!serials.length) return []

        return serials.map((sheetNo, index) => ({
          sortTime: new Date(examDate || 0).getTime(),
          createdAt: new Date(usage.createdAt || 0).getTime(),
          serialSort: getSerialSortValue(sheetNo),
          serialOrder: index,
          examDate,
          dayName: exam?.dayName || getRecordDayName(examDate) || '-',
          subjectName: String(usage.subjectName || exam?.subjectName || ''),
          subjectCode: String(usage.subjectCode || exam?.subjectCode || ''),
          roomNo: String(usage.roomNo || ''),
          rollNo: String(usage.rollNo || ''),
          sheetNo
        }))
      })
      .sort((left, right) => {
        const dateDiff = (Number.isNaN(left.sortTime) ? 0 : left.sortTime) - (Number.isNaN(right.sortTime) ? 0 : right.sortTime)
        if (dateDiff !== 0) return dateDiff
        const createdDiff = (Number.isNaN(left.createdAt) ? 0 : left.createdAt) - (Number.isNaN(right.createdAt) ? 0 : right.createdAt)
        if (createdDiff !== 0) return createdDiff
        const serialDiff = left.serialSort - right.serialSort
        if (serialDiff !== 0) return serialDiff
        const roomDiff = String(left.roomNo || '').localeCompare(String(right.roomNo || ''), undefined, { numeric: true, sensitivity: 'base' })
        if (roomDiff !== 0) return roomDiff
        const rollDiff = String(left.rollNo || '').localeCompare(String(right.rollNo || ''), undefined, { numeric: true, sensitivity: 'base' })
        if (rollDiff !== 0) return rollDiff
        return left.serialOrder - right.serialOrder
      })

    let seenUsedSerials = new Set()
    let previousDiscardedSerialSet = new Set()

    rows = normalizedRows
      .map((row, index) => {
        seenUsedSerials.add(row.sheetNo)
        const currentUsedCount = seenUsedSerials.size
        const endOfDay = getEndOfDay(row.examDate)
        const currentDiscardedSerialSet = new Set(
          discardedEntries
            .filter((entry) =>
              endOfDay
              && !Number.isNaN(entry.discardedAt.getTime())
              && entry.discardedAt <= endOfDay
            )
            .map((entry) => entry.serial)
        )
        const discardedCount = Array.from(currentDiscardedSerialSet)
          .filter((serial) => !previousDiscardedSerialSet.has(serial))
          .length
        previousDiscardedSerialSet = currentDiscardedSerialSet

        return {
          srNo: index + 1,
          dateLabel: formatRecordDate(row.examDate),
          dayName: row.dayName || '-',
          subjectName: row.subjectName || '-',
          subjectCode: row.subjectCode || '-',
          roomNo: row.roomNo || '-',
          rollNo: row.rollNo || '-',
          sheetNo: row.sheetNo || '-',
          totalCount: currentUsedCount,
          discardedCount,
          balanceCount: Math.max(0, totalReceived - currentUsedCount - currentDiscardedSerialSet.size)
        }
      })

    if (!rows.length) {
      notes.push('Supplementary sheet usage has not been recorded for any subject yet.')
    }
  } else {
    const allocationData = await getSerialAllocationDataForAnswerSheet(answerSheet)
    const discardedEntries = (answerSheet.discardedSerials || [])
      .map((item) => ({
        serial: item.serial,
        number: parseInt(String(item.serial || '').replace(/\D/g, ''), 10)
      }))
      .filter((item) => !Number.isNaN(item.number))

    totalUsed = Number(allocationData.totalAllocated || 0)
    const rawRows = await Promise.all(
      (allocationData.allocations || [])
        .filter((allocation) => Number(allocation.candidateCount || 0) > 0 || Number(allocation.sheetsAllocated || 0) > 0)
        .map(async (allocation, index) => {
        const roomContext = allocation._id
          ? await getRoomRollOptionsForEntry(allocation._id, req)
          : { roomOptions: [] }
        let discardedCount = 0
        let serialNo = 'N/A'
        let discardedSerials = []
        let serialSort = Number.MAX_SAFE_INTEGER

        if (allocation.serialFrom !== 'N/A' && allocation.serialTo !== 'N/A') {
          serialNo = allocation.serialFrom === allocation.serialTo
            ? allocation.serialFrom
            : `${allocation.serialFrom} - ${allocation.serialTo}`
          serialSort = getSerialSortValue(allocation.serialFrom)

          const startNum = parseInt(String(allocation.serialFrom).replace(/\D/g, ''), 10)
          const endNum = parseInt(String(allocation.serialTo).replace(/\D/g, ''), 10)

          if (!Number.isNaN(startNum) && !Number.isNaN(endNum)) {
            discardedSerials = discardedEntries
              .filter(
              (entry) => entry.number >= startNum && entry.number <= endNum
              )
              .map((entry) => normalizeSerialValue(entry.serial))
              .filter(Boolean)
              .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
            discardedCount = discardedSerials.length
          }
        }

        return {
          srNo: index + 1,
          sortTime: new Date(allocation.examDate || 0).getTime(),
          serialSort,
          dateLabel: formatRecordDate(allocation.examDate),
          dayName: allocation.dayName || getRecordDayName(allocation.examDate) || '-',
          subjectName: String(allocation.subjectName || ''),
          subjectCode: String(allocation.subjectCode || ''),
          roomCount: getRoomCountForRecord(roomContext.roomOptions),
          candidateCount: Number(allocation.candidateCount || 0),
          serialNo,
          usedCount: Number(allocation.sheetsAllocated || 0),
          discardedCount,
          discardedLabel: formatDiscardedLabel(discardedSerials),
          balanceCount: 0
        }
      })
    )

    let runningUsed = 0
    let runningDiscarded = 0

    rows = rawRows
      .sort((left, right) => {
        const dateDiff = (Number.isNaN(left.sortTime) ? 0 : left.sortTime) - (Number.isNaN(right.sortTime) ? 0 : right.sortTime)
        if (dateDiff !== 0) return dateDiff
        const serialDiff = left.serialSort - right.serialSort
        if (serialDiff !== 0) return serialDiff
        return left.subjectName.localeCompare(right.subjectName)
      })
      .map((row, index) => {
        runningUsed += row.usedCount
        runningDiscarded += row.discardedCount

        return {
          ...row,
          srNo: index + 1,
          balanceCount: Math.max(0, totalReceived - runningUsed - runningDiscarded)
        }
      })

    if (!rows.length) {
      notes.push('No allocation/usage record is available for this answer sheet.')
    }

    if (totalDiscarded > runningDiscarded) {
      notes.push(
        `${totalDiscarded - runningDiscarded} discarded serial(s) fall outside allocated exam ranges and are included only in the summary totals.`
      )
    }
  }

  const referenceDate = rows[0]?.dateLabel
    ? rows[0].dateLabel.split('.').reverse().join('-')
    : answerSheet.receivedDate
  const examSession = getAcademicSession(referenceDate || new Date())

  return {
    isSupplementary,
    schoolName,
    centreNo,
    examSession,
    classLabel: String(answerSheet.class || ''),
    typeLabel: `${answerSheet.answerSheetType}${answerSheet.pages ? ` (${answerSheet.pages} Pages)` : ''}`,
    colour: String(answerSheet.colour || ''),
    series: String(answerSheet.series || 'N/A'),
    receivedRanges,
    receivedRows,
    rows,
    hasRows: rows.length > 0,
    totalReceived,
    totalUsed,
    totalDiscarded,
    totalBalance: Math.max(0, totalReceived - totalUsed - totalDiscarded),
    summaryNotes: notes,
    hasSummaryNotes: notes.length > 0,
    signedBy
  }
}

/**
 * @desc    Get all answer sheets (always returns all types from PDF, merged with actual data)
 * @route   GET /api/answersheets
 * @access  Private
 */
exports.getAnswerSheets = async (req, res) => {
  try {
    await syncAnswerSheetTotals()

    const { type, class: classLevel, status } = req.query

    // Get actual answer sheets from database
    const filter = { isActive: true }

    if (type) {
      filter.answerSheetType = type
    }

    if (classLevel) {
      filter.class = classLevel
    }

    const answerSheets = await AnswerSheet.find(filter)
      .sort({ sortOrder: 1, receivedDate: -1 })

    // Create a map of actual data by unique key
    const dataMap = new Map()
    answerSheets.forEach(sheet => {
      const key = `${sheet.answerSheetType}-${sheet.pages}-${sheet.colour}-${sheet.class}`
      if (!dataMap.has(key)) {
        dataMap.set(key, [])
      }
      dataMap.get(key).push(sheet)
    })

    // Merge fixed types with actual data
    const mergedData = ANSWER_SHEET_TYPES.map(fixedType => {
      const key = `${fixedType.answerSheetType}-${fixedType.pages}-${fixedType.colour}-${fixedType.class}`
      const actualSheets = dataMap.get(key) || []

      if (actualSheets.length > 0) {
        // Return actual sheets if they exist
        return actualSheets
      } else {
        // Return fixed type with zero quantities
        return [{
          ...fixedType,
          serialRanges: [],
          serialFrom: null,
          serialTo: null,
          total: 0,
          used: 0,
          discarded: 0,
          balance: 0,
          isTemplate: true // Flag to indicate this is template data
        }]
      }
    }).flat()

    // Filter by status if provided
    let filteredSheets = mergedData
    if (status) {
      filteredSheets = mergedData.filter(sheet => {
        const balance = sheet.total - sheet.used - sheet.discarded

        switch (status) {
          case 'used':
            return sheet.used > 0
          case 'balance':
            return balance > 0
          case 'discarded':
            return sheet.discarded > 0
          case 'received':
            return true // Show all in received tab
          default:
            return true
        }
      })
    }

    res.status(200).json({
      success: true,
      count: filteredSheets.length,
      data: filteredSheets
    })
  } catch (error) {
    console.error('Error fetching answer sheets:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch answer sheets'
    })
  }
}

/**
 * @desc    Get answer sheet by ID
 * @route   GET /api/answersheets/:id
 * @access  Private
 */
exports.getAnswerSheetById = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    res.status(200).json({
      success: true,
      data: answerSheet
    })
  } catch (error) {
    console.error('Error fetching answer sheet:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch answer sheet'
    })
  }
}

/**
 * @desc    Create new answer sheet entry
 * @route   POST /api/answersheets
 * @access  Private
 */
exports.createAnswerSheet = async (req, res) => {
  try {
    const normalizedSerials = resolveSerialRangePayload(req.body)
    const answerSheet = await AnswerSheet.create({
      ...req.body,
      ...normalizedSerials
    })

    res.status(201).json({
      success: true,
      data: answerSheet
    })
  } catch (error) {
    console.error('Error creating answer sheet:', error)
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create answer sheet'
    })
  }
}

/**
 * @desc    Update answer sheet
 * @route   PUT /api/answersheets/:id
 * @access  Private
 */
exports.updateAnswerSheet = async (req, res) => {
  try {
    const existingAnswerSheet = await AnswerSheet.findById(req.params.id)

    if (!existingAnswerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    const updateData = { ...req.body }
    const hasSerialRanges = Object.prototype.hasOwnProperty.call(updateData, 'serialRanges')
    const hasSerialFrom = Object.prototype.hasOwnProperty.call(updateData, 'serialFrom')
    const hasSerialTo = Object.prototype.hasOwnProperty.call(updateData, 'serialTo')

    if (hasSerialRanges || hasSerialFrom || hasSerialTo) {
      const normalizedSerials = resolveSerialRangePayload(updateData, existingAnswerSheet)

      const nextUsedRaw = Object.prototype.hasOwnProperty.call(updateData, 'used')
        ? updateData.used
        : existingAnswerSheet.used
      const nextDiscardedRaw = Object.prototype.hasOwnProperty.call(updateData, 'discarded')
        ? updateData.discarded
        : existingAnswerSheet.discarded
      const nextUsed = Number(nextUsedRaw)
      const nextDiscarded = Number(nextDiscardedRaw)

      if (Number.isNaN(nextUsed) || Number.isNaN(nextDiscarded)) {
        return res.status(400).json({
          success: false,
          error: 'Used and discarded values must be valid numbers'
        })
      }

      if (nextUsed + nextDiscarded > normalizedSerials.total) {
        return res.status(400).json({
          success: false,
          error: `Invalid serial range. Total sheets (${normalizedSerials.total}) cannot be less than used + discarded (${nextUsed + nextDiscarded}).`
        })
      }

      const nextRangeState = {
        serialRanges: normalizedSerials.serialRanges,
        serialFrom: normalizedSerials.serialFrom,
        serialTo: normalizedSerials.serialTo
      }

      const discardedOutsideRange = (existingAnswerSheet.discardedSerials || []).find(
        item => !isSerialWithinAnswerSheetRanges(nextRangeState, item.serial)
      )
      if (discardedOutsideRange) {
        return res.status(400).json({
          success: false,
          error: `Discarded serial ${discardedOutsideRange.serial} falls outside the updated serial ranges`
        })
      }

      const supplementaryUsageOutsideRange = (existingAnswerSheet.supplementaryUsages || []).find((usage) =>
        (usage.serials || []).some(serial => !isSerialWithinAnswerSheetRanges(nextRangeState, serial))
      )
      if (supplementaryUsageOutsideRange) {
        return res.status(400).json({
          success: false,
          error: 'One or more saved supplementary serial numbers fall outside the updated serial ranges'
        })
      }

      updateData.serialRanges = normalizedSerials.serialRanges
      updateData.serialFrom = normalizedSerials.serialFrom
      updateData.serialTo = normalizedSerials.serialTo
      updateData.total = normalizedSerials.total
    }

    const answerSheet = await AnswerSheet.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
        context: 'query'
      }
    )

    res.status(200).json({
      success: true,
      data: answerSheet
    })
  } catch (error) {
    console.error('Error updating answer sheet:', error)
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update answer sheet'
    })
  }
}

/**
 * @desc    Delete answer sheet
 * @route   DELETE /api/answersheets/:id
 * @access  Private
 */
exports.deleteAnswerSheet = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    // Soft delete
    answerSheet.isActive = false
    await answerSheet.save()

    res.status(200).json({
      success: true,
      data: {}
    })
  } catch (error) {
    console.error('Error deleting answer sheet:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete answer sheet'
    })
  }
}

/**
 * @desc    Use answer sheets
 * @route   POST /api/answersheets/:id/use
 * @access  Private
 */
exports.useAnswerSheets = async (req, res) => {
  try {
    const { quantity, centreDatesheetEntryId, examDate, subjectCode, subjectName, candidateCount } = req.body

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid quantity is required'
      })
    }

    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    // Link to centre datesheet if provided
    if (centreDatesheetEntryId) {
      answerSheet.centreDatesheetEntry = centreDatesheetEntryId
    }
    if (examDate) {
      answerSheet.linkedExamDate = examDate
    }
    if (subjectCode) {
      answerSheet.linkedSubjectCode = subjectCode
    }
    if (subjectName) {
      answerSheet.linkedSubjectName = subjectName
    }
    if (candidateCount !== undefined) {
      answerSheet.linkedCandidateCount = candidateCount
    }

    await answerSheet.useSheets(quantity)

    res.status(200).json({
      success: true,
      data: answerSheet
    })
  } catch (error) {
    console.error('Error using answer sheets:', error)
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to use answer sheets'
    })
  }
}

/**
 * @desc    Discard answer sheets
 * @route   POST /api/answersheets/:id/discard
 * @access  Private
 */
exports.discardAnswerSheets = async (req, res) => {
  try {
    const { quantity } = req.body

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid quantity is required'
      })
    }

    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    await answerSheet.discardSheets(quantity)

    res.status(200).json({
      success: true,
      data: answerSheet
    })
  } catch (error) {
    console.error('Error discarding answer sheets:', error)
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to discard answer sheets'
    })
  }
}

/**
 * @desc    Get answer sheets statistics
 * @route   GET /api/answersheets/stats/summary
 * @access  Private
 */
exports.getStatistics = async (req, res) => {
  try {
    await syncAnswerSheetTotals()

    const summaryStats = await AnswerSheet.getSummaryStats()
    const statsByType = await AnswerSheet.getStatsByType()

    res.status(200).json({
      success: true,
      data: {
        summary: summaryStats,
        byType: statsByType
      }
    })
  } catch (error) {
    console.error('Error fetching statistics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    })
  }
}

/**
 * @desc    Parse answer sheets PDF and get template data
 * @route   GET /api/answersheets/parse/template
 * @access  Private
 */
exports.parseTemplate = async (req, res) => {
  try {
    const pdfPath = path.join(__dirname, '../../../client/src/Answer Sheets.pdf')

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheets template PDF not found'
      })
    }

    const dataBuffer = fs.readFileSync(pdfPath)
    const parser = new AnswerSheetsParser()
    const result = await parser.parsePDF(dataBuffer)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to parse PDF'
      })
    }

    const stats = parser.getStatistics(result.data.entries)

    res.status(200).json({
      success: true,
      data: {
        ...result.data,
        statistics: stats
      }
    })
  } catch (error) {
    console.error('Error parsing template:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to parse template'
    })
  }
}

/**
 * @desc    Download Excel template
 * @route   GET /api/answersheets/template/download
 * @access  Private
 */
exports.downloadTemplate = async (req, res) => {
  try {
    // The server deploys on its own (no client folder), so it keeps its own copy of the template.
    const excelPath = path.join(__dirname, '../assets/answer-sheets-template.xlsx')

    if (!fs.existsSync(excelPath)) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheets template Excel file not found'
      })
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="Answer_Sheets_Template.xlsx"')

    // Stream the file
    const fileStream = fs.createReadStream(excelPath)
    fileStream.pipe(res)

  } catch (error) {
    console.error('Error downloading template:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to download template'
    })
  }
}

/**
 * @desc    Upload and parse Excel file
 * @route   POST /api/answersheets/upload/excel
 * @access  Private
 */
exports.uploadExcel = async (req, res) => {
  let cloudinaryResult = null

  try {
    console.log('📥 Upload Excel Request Received')
    console.log('  req.files:', req.files ? Object.keys(req.files) : 'undefined')
    console.log('  req.body:', req.body)

    // Check if file was uploaded
    if (!req.files || !req.files.file) {
      console.error('❌ No file in request')
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      })
    }

    const file = req.files.file
    console.log('📄 File Details:')
    console.log('  Name:', file.name)
    console.log('  Size:', file.size, 'bytes')
    console.log('  Mimetype:', file.mimetype)

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ]

    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)'
      })
    }

    // Upload to Cloudinary (optional - continues if fails)
    if (cloudinary.config().cloud_name) {
      console.log('📤 Uploading Excel file to Cloudinary...')

      try {
        cloudinaryResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'answer-sheets',
              resource_type: 'raw',
              public_id: `answer_sheets_${Date.now()}`,
              format: file.name.split('.').pop()
            },
            (error, result) => {
              if (error) reject(error)
              else resolve(result)
            }
          )
          uploadStream.end(file.data)
        })

        console.log(`✅ File uploaded to Cloudinary: ${cloudinaryResult.secure_url}`)
      } catch (cloudinaryError) {
        console.error('⚠️  Cloudinary upload failed:', cloudinaryError.message)
        console.log('⏭️  Continuing without Cloudinary upload...')
        // Continue with parsing even if Cloudinary fails
      }
    } else {
      console.log('⏭️  Cloudinary not configured, skipping file upload')
    }

    // Parse the Excel file
    console.log('🔄 Starting Excel parsing...')
    console.log('  File data type:', typeof file.data)
    console.log('  File data length:', file.data ? file.data.length : 'undefined')
    console.log('  Is Buffer:', Buffer.isBuffer(file.data))

    const parser = new AnswerSheetsExcelParser()
    const result = await parser.parseExcel(file.data)

    console.log('📊 Parse result:')
    console.log('  Success:', result.success)
    console.log('  Entries count:', result.data ? result.data.entries.length : 0)

    if (!result.success) {
      console.error('❌ Parsing failed:', result.error)
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to parse Excel file'
      })
    }

    // Log parsed entries for debugging
    console.log(`📊 Parsed ${result.data.entries.length} entries from Excel`)
    result.data.entries.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.answerSheetType} - ${entry.serialFrom} to ${entry.serialTo}`)
    })

    // Filter out entries with blank/zero serial numbers
    const validEntries = result.data.entries.filter(entry => {
      const hasSerialFrom = entry.serialFrom && entry.serialFrom.trim() !== ''
      const hasSerialTo = entry.serialTo && entry.serialTo.trim() !== ''
      return hasSerialFrom && hasSerialTo
    })

    const skippedCount = result.data.entries.length - validEntries.length
    if (skippedCount > 0) {
      console.log(`⚠️  Skipped ${skippedCount} entries with blank serial numbers`)
    }

    // Create entries in database
    const createdEntries = []
    const errors = []
    const skipped = []

    for (const entry of validEntries) {
      try {
        // Add cloudinary URL if available
        if (cloudinaryResult) {
          entry.uploadedFileUrl = cloudinaryResult.secure_url
          entry.uploadedFileId = cloudinaryResult.public_id
        }

        const created = await AnswerSheet.create(entry)
        createdEntries.push(created)
        console.log(`✅ Created: ${created.answerSheetType} - ${created.total} sheets`)
      } catch (error) {
        console.error(`❌ Failed to create: ${entry.answerSheetType} - ${error.message}`)
        errors.push({
          entry,
          error: error.message
        })
      }
    }

    // Track skipped entries
    result.data.entries.forEach(entry => {
      const hasSerialFrom = entry.serialFrom && entry.serialFrom.trim() !== ''
      const hasSerialTo = entry.serialTo && entry.serialTo.trim() !== ''
      if (!hasSerialFrom || !hasSerialTo) {
        skipped.push({
          type: entry.answerSheetType,
          reason: 'No serial numbers provided (not received at centre)'
        })
      }
    })

    const stats = parser.getStatistics(validEntries)

    res.status(200).json({
      success: true,
      data: {
        created: createdEntries.length,
        failed: errors.length,
        skipped: skipped.length,
        total: result.data.count,
        entries: createdEntries,
        skippedEntries: skipped.length > 0 ? skipped : undefined,
        errors: errors.length > 0 ? errors : undefined,
        statistics: stats,
        fileUrl: cloudinaryResult ? cloudinaryResult.secure_url : undefined
      },
      message: `Successfully added ${createdEntries.length} answer sheet entries${skipped.length > 0 ? `. Skipped ${skipped.length} entries with no serial numbers.` : ''}`
    })

  } catch (error) {
    console.error('Error uploading Excel:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to upload and process Excel file'
    })
  }
}

/**
 * @desc    Get answer sheet details with related datesheet entries
 * @route   GET /api/answersheets/:id/details
 * @access  Private
 */
exports.getAnswerSheetDetails = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    const relatedExams = await getRelatedExamsForAnswerSheet(answerSheet)

    res.status(200).json({
      success: true,
      data: {
        answerSheet,
        relatedExams
      }
    })
  } catch (error) {
    console.error('Error fetching answer sheet details:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch answer sheet details'
    })
  }
}

/**
 * @desc    Get manual supplementary usage context
 * @route   GET /api/answersheets/:id/supplementary-context
 * @access  Private
 */
exports.getSupplementaryUsageContext = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    if (answerSheet.answerSheetType !== 'Supplementary') {
      return res.status(400).json({
        success: false,
        error: 'Manual supplementary usage is only available for supplementary answer sheets'
      })
    }

    const relatedExams = await getRelatedExamsForAnswerSheet(answerSheet)
    const context = await buildSupplementaryUsageContext(answerSheet, req, relatedExams)

    return res.status(200).json({
      success: true,
      data: context
    })
  } catch (error) {
    console.error('Error fetching supplementary usage context:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch supplementary usage context'
    })
  }
}

/**
 * @desc    Save manual supplementary usage for a subject
 * @route   POST /api/answersheets/:id/supplementary-usage
 * @access  Private
 */
exports.saveSupplementaryUsage = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    if (answerSheet.answerSheetType !== 'Supplementary') {
      return res.status(400).json({
        success: false,
        error: 'Manual supplementary usage is only available for supplementary answer sheets'
      })
    }

    const { centreDatesheetEntryId, roomNo, rollNo } = req.body
    const serialList = Array.isArray(req.body.serials) ? req.body.serials : []
    const serials = Array.from(new Set(serialList.map(normalizeSerialValue).filter(Boolean)))

    if (!centreDatesheetEntryId || !roomNo || !rollNo || serials.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Subject, room number, roll number, and at least one serial number are required'
      })
    }

    const relatedExams = await getRelatedExamsForAnswerSheet(answerSheet)
    const selectedExam = relatedExams.find(exam => String(exam._id) === String(centreDatesheetEntryId))

    if (!selectedExam) {
      return res.status(400).json({
        success: false,
        error: 'Selected subject is not valid for this supplementary answer sheet'
      })
    }

    const { roomOptions, roomError } = await getRoomRollOptionsForEntry(centreDatesheetEntryId, req)
    if (roomError) {
      return res.status(400).json({
        success: false,
        error: roomError
      })
    }

    const selectedRoom = roomOptions.find(option => String(option.roomNo) === String(roomNo).trim())
    if (!selectedRoom) {
      return res.status(400).json({
        success: false,
        error: 'Selected room number is not available in the seating plan for this subject'
      })
    }

    const normalizedRollNo = String(rollNo).trim()
    if (!selectedRoom.rollNos.includes(normalizedRollNo)) {
      return res.status(400).json({
        success: false,
        error: 'Selected roll number does not belong to the chosen room'
      })
    }

    const discardedSet = new Set(
      (answerSheet.discardedSerials || []).map(item => normalizeSerialValue(item.serial)).filter(Boolean)
    )
    const usedSerialSet = getSupplementaryUsedSerials(answerSheet)

    for (const serial of serials) {
      if (!isSerialWithinAnswerSheetRanges(answerSheet, serial)) {
        return res.status(400).json({
          success: false,
          error: `Serial ${serial} is outside the configured serial ranges`
        })
      }

      if (discardedSet.has(serial)) {
        return res.status(400).json({
          success: false,
          error: `Serial ${serial} is marked as discarded`
        })
      }

      if (usedSerialSet.has(serial)) {
        return res.status(400).json({
          success: false,
          error: `Serial ${serial} is already used for another supplementary record`
        })
      }
    }

    answerSheet.supplementaryUsages = answerSheet.supplementaryUsages || []
    serials.forEach((serial) => {
      answerSheet.supplementaryUsages.push({
        centreDatesheetEntry: centreDatesheetEntryId,
        examDate: selectedExam.examDate,
        subjectCode: selectedExam.subjectCode,
        subjectName: selectedExam.subjectName,
        roomNo: String(roomNo).trim(),
        rollNo: normalizedRollNo,
        serials: [serial]
      })
    })

    answerSheet.used = getSupplementaryUsedSerials(answerSheet).size
    await answerSheet.save()

    const context = await buildSupplementaryUsageContext(answerSheet, req, relatedExams)

    return res.status(200).json({
      success: true,
      data: context
    })
  } catch (error) {
    console.error('Error saving supplementary usage:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save supplementary usage'
    })
  }
}

/**
 * @desc    Remove a manual supplementary usage entry
 * @route   DELETE /api/answersheets/:id/supplementary-usage/:usageId
 * @access  Private
 */
exports.removeSupplementaryUsage = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    if (answerSheet.answerSheetType !== 'Supplementary') {
      return res.status(400).json({
        success: false,
        error: 'Manual supplementary usage is only available for supplementary answer sheets'
      })
    }

    const usageId = String(req.params.usageId)
    const targetIndex = (answerSheet.supplementaryUsages || []).findIndex(
      usage => String(usage._id) === usageId
    )

    if (targetIndex < 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplementary usage record not found'
      })
    }

    const serialParam = normalizeSerialValue(req.query.serial)
    if (serialParam) {
      const targetUsage = answerSheet.supplementaryUsages[targetIndex]
      const currentSerials = (targetUsage.serials || [])
        .map(normalizeSerialValue)
        .filter(Boolean)
      const nextSerials = currentSerials.filter((serial) => serial !== serialParam)

      if (nextSerials.length === currentSerials.length) {
        return res.status(404).json({
          success: false,
          error: 'Supplementary sheet number not found for this usage record'
        })
      }

      if (nextSerials.length === 0) {
        answerSheet.supplementaryUsages.splice(targetIndex, 1)
      } else {
        targetUsage.serials = nextSerials
      }
    } else {
      answerSheet.supplementaryUsages.splice(targetIndex, 1)
    }

    answerSheet.used = getSupplementaryUsedSerials(answerSheet).size
    await answerSheet.save()

    const relatedExams = await getRelatedExamsForAnswerSheet(answerSheet)
    const context = await buildSupplementaryUsageContext(answerSheet, req, relatedExams)

    return res.status(200).json({
      success: true,
      data: context
    })
  } catch (error) {
    console.error('Error removing supplementary usage:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove supplementary usage'
    })
  }
}

/**
 * @desc    Get serial number allocation by date for an answer sheet
 * @route   GET /api/answersheets/:id/allocation
 * @access  Private
 */
exports.getSerialAllocation = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    const allocationData = await getSerialAllocationDataForAnswerSheet(answerSheet)

    res.status(200).json({
      success: true,
      data: allocationData
    })
  } catch (error) {
    console.error('Error calculating serial allocation:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to calculate serial allocation'
    })
  }
}

/**
 * @desc    Download answer sheet dispatch record for a specific exam entry
 * @route   GET /api/answersheets/:id/dispatch-record/:entryId/download
 * @access  Private
 */
exports.downloadDispatchRecord = async (req, res) => {
  try {
    const { id, entryId } = req.params

    const answerSheet = await AnswerSheet.findById(id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    if (!answerSheet.serialFrom || !answerSheet.serialTo) {
      return res.status(400).json({
        success: false,
        error: 'Serial range is not configured for this answer sheet'
      })
    }

    const allocationData = await getSerialAllocationDataForAnswerSheet(answerSheet)
    const selectedAllocation = allocationData.allocations.find(
      allocation => String(allocation._id) === String(entryId)
    )

    if (!selectedAllocation) {
      return res.status(404).json({
        success: false,
        error: 'Allocation entry not found for this answer sheet'
      })
    }

    if (
      selectedAllocation.serialFrom === 'N/A'
      || selectedAllocation.serialTo === 'N/A'
      || !selectedAllocation.sheetsAllocated
    ) {
      return res.status(400).json({
        success: false,
        error: 'Cannot generate dispatch record because serial allocation is unavailable for this exam'
      })
    }

    const SeatingPlanTemplateSetting = req.models?.SeatingPlanTemplateSetting
    const CentreDetail = req.models?.CentreDetail

    let roomAllocationMode = 'auto'
    if (SeatingPlanTemplateSetting) {
      const settingsDoc = await SeatingPlanTemplateSetting.findOne({}).sort({ updatedAt: -1 })
      if (String(settingsDoc?.roomAllocationMode || '').toLowerCase() === 'manual') {
        roomAllocationMode = 'manual'
      }
    }

    const centreDetails = CentreDetail
      ? await CentreDetail.findOne({}).sort({ updatedAt: -1 }).lean()
      : null

    const seatingData = await seatingPlanBuilder.buildSeatingData(entryId, {
      centreDetails,
      roomAllocationMode,
    })

    const serialStartNum = parseInt(String(selectedAllocation.serialFrom).replace(/\D/g, ''), 10)
    const serialEndNum = parseInt(String(selectedAllocation.serialTo).replace(/\D/g, ''), 10)

    if (Number.isNaN(serialStartNum) || Number.isNaN(serialEndNum)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid serial allocation for the selected exam'
      })
    }

    const prefix = answerSheet.serialFrom.replace(/\d+$/, '')
    const padLength = answerSheet.serialFrom.replace(/\D/g, '').length
    const formatSerial = (num) => prefix + num.toString().padStart(padLength, '0')

    const discardedNumberToReason = new Map()
    ;(answerSheet.discardedSerials || []).forEach(item => {
      const num = parseInt(String(item.serial).replace(/\D/g, ''), 10)
      if (!Number.isNaN(num)) {
        discardedNumberToReason.set(num, item.reason || 'Damaged/Misprinted')
      }
    })

    const assignedSerialNumbers = []
    const skippedDiscardedForExam = new Map()

    let currentSerial = serialStartNum
    while (currentSerial <= serialEndNum && assignedSerialNumbers.length < selectedAllocation.sheetsAllocated) {
      if (discardedNumberToReason.has(currentSerial)) {
        skippedDiscardedForExam.set(currentSerial, {
          serial: formatSerial(currentSerial),
          reason: discardedNumberToReason.get(currentSerial)
        })
      } else {
        assignedSerialNumbers.push(currentSerial)
      }
      currentSerial += 1
    }

    const roomRows = []
    let serialCursor = 0
    const sheetTypeLabel = answerSheet.pages ? `${answerSheet.pages} Pgs` : answerSheet.answerSheetType

    ;(seatingData.rooms || []).forEach(room => {
      const roomRegistered = Number(room.registered || 0)
      if (roomRegistered <= 0) return

      const roomSerials = assignedSerialNumbers.slice(serialCursor, serialCursor + roomRegistered)
      if (roomSerials.length === 0) return

      roomRows.push({
        srNo: roomRows.length + 1,
        roomNo: room.roomNo,
        type: sheetTypeLabel,
        colour: answerSheet.colour ? String(answerSheet.colour).toUpperCase() : '—',
        series: answerSheet.series || '—',
        from: formatSerial(roomSerials[0]),
        to: formatSerial(roomSerials[roomSerials.length - 1]),
        total: roomSerials.length
      })

      serialCursor += roomSerials.length
    })

    if (roomRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No room-wise allocation could be generated for this exam'
      })
    }

    const registeredTotal = (seatingData.rooms || []).reduce(
      (sum, room) => sum + Number(room.registered || 0),
      0
    )
    const totalAllocated = roomRows.reduce((sum, row) => sum + row.total, 0)

    const classNumber = String(selectedAllocation.class || '').replace(/th$/i, '')
    const classLabel = classNumber === '10' ? 'X' : classNumber === '12' ? 'XII' : selectedAllocation.class
    const examDateValue = selectedAllocation.examDate
    const examDateLabel = formatDispatchDateWithDay(examDateValue)
    const examSession = getAcademicSession(examDateValue)

    const notes = Array.from(skippedDiscardedForExam.values()).sort((a, b) =>
      a.serial.localeCompare(b.serial, undefined, { numeric: true, sensitivity: 'base' })
    )

    const additionalNotes = []
    if (registeredTotal !== selectedAllocation.candidateCount) {
      additionalNotes.push(
        `Registered candidates from seating plan (${registeredTotal}) differ from allocation schedule (${selectedAllocation.candidateCount}).`
      )
    }
    if (selectedAllocation.sheetsAllocated !== totalAllocated) {
      additionalNotes.push(
        `Allocated serial count for this record is ${totalAllocated}, while schedule allocation is ${selectedAllocation.sheetsAllocated}.`
      )
    }

    const templateData = {
      schoolName: (centreDetails?.centreName && String(centreDetails.centreName).trim()) || seatingPlanBuilder.schoolName || 'EXAMINATION CENTRE',
      centreNo: (centreDetails?.centreNo && String(centreDetails.centreNo).trim()) || seatingPlanBuilder.centreNo || '',
      examSession,
      examDate: examDateLabel,
      subjectName: String(selectedAllocation.subjectName || seatingData.datesheet?.subjectName || '').toUpperCase(),
      classLabel,
      subjectCode: selectedAllocation.subjectCode || seatingData.datesheet?.subjectCode || '',
      rows: roomRows,
      totalAllocated,
      registeredTotal,
      notes,
      additionalNotes
    }

    const pdfBuffer = await pdfGenerator.generateAnswerSheetDispatchRecord(templateData)

    const examDate = new Date(examDateValue)
    const datePart = Number.isNaN(examDate.getTime())
      ? 'unknown-date'
      : examDate.toISOString().split('T')[0]
    const safeSubjectCode = String(selectedAllocation.subjectCode || 'subject')
      .replace(/[^a-z0-9_-]/gi, '_')
    const filename = `answer-sheet-dispatch-record-${safeSubjectCode}-${datePart}.pdf`

    const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.end(buffer)
  } catch (error) {
    console.error('Error generating dispatch record PDF:', error)
    const message = error?.message && typeof error.message === 'string'
      ? error.message
      : 'Failed to generate dispatch record PDF'
    res.status(500).json({
      success: false,
      error: message
    })
  }
}

/**
 * @desc    Add discarded serial number(s)
 * @route   POST /api/answersheets/:id/discarded
 * @access  Private
 */
exports.addDiscardedSerials = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    const { serials, fromSerial, toSerial, reason } = req.body

    // Handle range input
    if (fromSerial && toSerial) {
      const added = await answerSheet.addDiscardedRange(fromSerial, toSerial, reason || 'Damaged/Misprinted')
      return res.status(200).json({
        success: true,
        message: `Added ${added.length} discarded serial(s)`,
        data: {
          added,
          discardedSerials: answerSheet.discardedSerials,
          discardedCount: answerSheet.discardedSerials.length
        }
      })
    }

    // Handle single or array of serials
    const serialList = Array.isArray(serials) ? serials : [serials]
    const added = []
    const errors = []

    for (const serial of serialList) {
      try {
        await answerSheet.addDiscardedSerial(serial, reason || 'Damaged/Misprinted')
        added.push(serial)
      } catch (err) {
        errors.push({ serial, error: err.message })
      }
    }

    // Reload to get updated data
    await answerSheet.save()

    res.status(200).json({
      success: true,
      message: `Added ${added.length} discarded serial(s)`,
      data: {
        added,
        errors: errors.length > 0 ? errors : undefined,
        discardedSerials: answerSheet.discardedSerials,
        discardedCount: answerSheet.discardedSerials.length
      }
    })
  } catch (error) {
    console.error('Error adding discarded serials:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add discarded serials'
    })
  }
}

/**
 * @desc    Remove discarded serial number
 * @route   DELETE /api/answersheets/:id/discarded/:serial
 * @access  Private
 */
exports.removeDiscardedSerial = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    const { serial } = req.params

    await answerSheet.removeDiscardedSerial(serial)

    res.status(200).json({
      success: true,
      message: `Removed serial ${serial} from discarded list`,
      data: {
        discardedSerials: answerSheet.discardedSerials,
        discardedCount: answerSheet.discardedSerials.length
      }
    })
  } catch (error) {
    console.error('Error removing discarded serial:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove discarded serial'
    })
  }
}

/**
 * @desc    Get discarded serials for an answer sheet
 * @route   GET /api/answersheets/:id/discarded
 * @access  Private
 */
exports.getDiscardedSerials = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id)

    if (!answerSheet) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    res.status(200).json({
      success: true,
      data: {
        discardedSerials: answerSheet.discardedSerials || [],
        discardedCount: (answerSheet.discardedSerials || []).length,
        serialRanges: getConfiguredSerialRanges(answerSheet),
        serialRange: {
          from: answerSheet.serialFrom,
          to: answerSheet.serialTo
        }
      }
    })
  } catch (error) {
    console.error('Error getting discarded serials:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get discarded serials'
    })
  }
}

/**
 * @desc    Bulk-update series on all active answer sheets
 * @route   PUT /api/answersheets/series
 * @access  Private
 */
exports.updateSeries = async (req, res) => {
  try {
    const { series } = req.body

    if (series !== undefined && series !== null && typeof series !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Series must be a string'
      })
    }

    const trimmed = (series || '').trim()

    if (trimmed.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Series cannot exceed 50 characters'
      })
    }

    // Update all active answer sheets with the series value
    // If trimmed is empty, unset the field
    const update = trimmed
      ? { $set: { series: trimmed } }
      : { $unset: { series: 1 } }

    const result = await AnswerSheet.updateMany(
      { isActive: true },
      update
    )

    res.status(200).json({
      success: true,
      data: {
        series: trimmed || null,
        modifiedCount: result.modifiedCount
      }
    })
  } catch (error) {
    console.error('Error updating series:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update series'
    })
  }
}

/**
 * @desc    Download consolidated answer-sheet record PDF
 * @route   GET /api/answersheets/:id/consolidated-record/download
 * @access  Private
 */
exports.downloadConsolidatedRecord = async (req, res) => {
  try {
    const answerSheet = await AnswerSheet.findById(req.params.id).lean()

    if (!answerSheet || !answerSheet.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Answer sheet not found'
      })
    }

    const templateData = await buildConsolidatedRecordTemplateData(answerSheet, req)
    const pdfBuffer = await pdfGenerator.generateAnswerSheetConsolidatedRecord(templateData)
    const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)
    const safeType = String(answerSheet.answerSheetType || 'answer-sheet').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const safeClass = String(answerSheet.class || '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const safeColour = String(answerSheet.colour || '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const filename = `answer-sheet-consolidated-record-${safeType}-${safeClass}-${safeColour}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.end(buffer)
  } catch (error) {
    console.error('Error generating consolidated answer sheet PDF:', error)
    const message = error?.message && typeof error.message === 'string'
      ? error.message
      : 'Failed to generate consolidated answer sheet PDF'
    res.status(500).json({
      success: false,
      error: message
    })
  }
}

/**
 * @desc    Get the current series value (from any active answer sheet)
 * @route   GET /api/answersheets/series
 * @access  Private
 */
exports.getSeries = async (req, res) => {
  try {
    const sheet = await AnswerSheet.findOne(
      { isActive: true, series: { $exists: true, $ne: '' } },
      { series: 1 }
    )

    res.status(200).json({
      success: true,
      data: { series: sheet?.series || null }
    })
  } catch (error) {
    console.error('Error getting series:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get series'
    })
  }
}

/**
 * @desc    Get daily answer-sheet allocation summary for a specific date
 * @route   GET /api/answersheets/daily-summary?date=YYYY-MM-DD
 * @access  Private
 *
 * For each active answer sheet, computes serial allocation using the existing
 * getSerialAllocationDataForAnswerSheet() helper, picks the allocation entry
 * that matches the requested date, and returns a per-class summary.
 */
exports.getDailySummary = async (req, res) => {
  try {
    const { date } = req.query
    if (!date) {
      return res.status(400).json({ success: false, error: 'date query parameter is required (YYYY-MM-DD)' })
    }

    const targetDate = new Date(date)
    if (Number.isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' })
    }

    // Normalize to midnight UTC for comparison
    const targetDay = date // keep as string for comparison

    const sheets = await AnswerSheet.find({ isActive: true }).lean()
    if (!sheets.length) {
      return res.status(200).json({
        success: true,
        data: { date: targetDay, classes: {} }
      })
    }

    // Build summary grouped by normalized class (10 / 12)
    // Each class → { entries: [{ answerSheetType, pages, colour, serialFrom, serialTo, sheetsAllocated, candidateCount, subjectCode, subjectName }], totalAllocated, totalDiscarded }
    const classSummary = {}

    for (const sheet of sheets) {
      const allocationData = await getSerialAllocationDataForAnswerSheet(sheet)
      if (!allocationData.hasSerialNumbers || !allocationData.allocations.length) continue

      // Find allocations that match the target date
      const dayAllocations = allocationData.allocations.filter(a => {
        const allocDate = new Date(a.examDate).toISOString().split('T')[0]
        return allocDate === targetDay
      })

      if (!dayAllocations.length) continue

      // Normalize class key: "10th" → "10", "12th" → "12", or keep raw
      const rawClass = sheet.class || ''
      const classKey = rawClass.replace(/th$/i, '')

      if (!classSummary[classKey]) {
        classSummary[classKey] = {
          entries: [],
          totalAllocated: 0,
          totalDiscarded: (sheet.discardedSerials || []).length,
          totalInventory: sheet.total || 0,
        }
      } else {
        classSummary[classKey].totalDiscarded += (sheet.discardedSerials || []).length
        classSummary[classKey].totalInventory += (sheet.total || 0)
      }

      for (const alloc of dayAllocations) {
        classSummary[classKey].entries.push({
          answerSheetId: sheet._id,
          answerSheetType: sheet.answerSheetType,
          pages: sheet.pages,
          colour: sheet.colour,
          serialFrom: alloc.serialFrom,
          serialTo: alloc.serialTo,
          sheetsAllocated: alloc.sheetsAllocated,
          candidateCount: alloc.candidateCount,
          subjectCode: alloc.subjectCode,
          subjectName: alloc.subjectName,
          insufficientSheets: alloc.insufficientSheets || false,
        })
        classSummary[classKey].totalAllocated += alloc.sheetsAllocated
      }
    }

    // Compute aggregate from/to per class (overall serial range used today)
    for (const classKey of Object.keys(classSummary)) {
      const summary = classSummary[classKey]
      if (summary.entries.length) {
        const serials = summary.entries
          .filter(e => e.serialFrom !== 'N/A')
          .sort((a, b) => a.serialFrom.localeCompare(b.serialFrom))
        summary.serialFrom = serials.length ? serials[0].serialFrom : '—'
        summary.serialTo = serials.length ? serials[serials.length - 1].serialTo : '—'
      } else {
        summary.serialFrom = '—'
        summary.serialTo = '—'
      }
    }

    return res.status(200).json({
      success: true,
      data: { date: targetDay, classes: classSummary }
    })
  } catch (error) {
    console.error('Error getting daily answer sheet summary:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get daily answer sheet summary'
    })
  }
}

module.exports = exports
