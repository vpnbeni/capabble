const fs = require('fs')
const pdf = require('pdf-parse')
const { fromPath: pdfToPic } = require('pdf2pic')
const Tesseract = require('tesseract.js')
const os = require('os')
const asyncHandler = require('../middleware/asyncHandler')
const { generateResponse, HTTP_STATUS } = require('../utils/constants')
const CBSEDatesheetParser = require('../utils/cbseDatesheetParser')
const CBSEDatesheet = require('../models/CBSEDatesheet')
const { getDayNameForDate } = require('../utils/calendarSeeder')
const { getDayName, addDayNameToEntry } = require('../utils/dateHelper')
const { calculateRoomsGroupedByDate } = require('../utils/roomCalculator')
const { ensureTenantActiveDatesheet } = require('../services/cbseDatesheetRolloutService')

const ACTIVE_CANDIDATE_FILTER = {
  $or: [{ status: 'active' }, { status: { $exists: false } }],
}

const normalizeSubjectCode = (code) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\((?:E|H)\)$/i, '')

const normalizeSubjectClass = (classValue) => {
  const normalized = String(classValue || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

  if (!normalized) return ''
  if (normalized === '10' || normalized === '10th') return '10th'
  if (normalized === '12' || normalized === '12th') return '12th'
  return normalized
}

const buildSubjectKey = (code, classValue) =>
  `${normalizeSubjectCode(code)}-${normalizeSubjectClass(classValue)}`

// Helper: map month names to numbers
const MONTHS = {
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
  JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
}

// Parse a line like: "10:30 AM - 01:30 PM 041 MATHEMATICS STANDARD"
function parseTimeAndSubject(line) {
  const timeRegex = /(\d{1,2}:\d{2})\s*(AM|PM)\s*[\-–]\s*(\d{1,2}:\d{2})\s*(AM|PM)\s+(\d{2,4})\s+([A-Z0-9 &/\-]+)$/i
  const m = line.match(timeRegex)
  if (!m) return null
  return {
    startTime: `${m[1].toUpperCase()} ${m[2].toUpperCase()}`.trim(),
    endTime: `${m[3].toUpperCase()} ${m[4].toUpperCase()}`.trim(),
    subjectCode: m[5],
    subjectName: m[6].trim(),
  }
}

// Parse a header line like: "TUESDAY 17TH FEBRUARY, 2026"
function parseDateHeader(line) {
  const headerRegex = /(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2})(?:ST|ND|RD|TH|TM|™)?\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)[,\s]+(\d{4})/i
  const m = line.match(headerRegex)
  if (!m) return null
  const day = parseInt(m[2], 10)
  const month = MONTHS[m[3].toUpperCase()]
  const year = parseInt(m[4], 10)
  return { dateISO: new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10), dayName: m[1].toUpperCase() }
}

// GET /api/datesheets/cbse-full
exports.getCBSEFullDatesheet = asyncHandler(async (req, res) => {
  try {
    console.log('📄 Fetching active CBSE datesheet...')
    
    const { datesheet: cbseDatesheet, seeded } = await ensureTenantActiveDatesheet(CBSEDatesheet)
    if (seeded) {
      console.log('Seeded tenant CBSE datesheet from active master datesheet')
    }

    if (!cbseDatesheet) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'No CBSE datesheet found. Please import a CBSE datesheet first.',
        data: { entries: [], count: 0 }
      })
    }
    
    console.log(`✅ Found CBSE datesheet with ${cbseDatesheet.totalEntries} entries`)
    
    // Get sorting parameters
    const sortField = req.query.sortField || null
    const sortOrder = req.query.sortOrder || 'asc'
    
    // Apply sorting if requested
    let sortedEntries = [...cbseDatesheet.entries]
    if (sortField) {
      sortedEntries.sort((a, b) => {
        let comparison = 0
        
        if (sortField === 'date') {
          comparison = new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
        } else if (sortField === 'class') {
          comparison = a.subject.class.localeCompare(b.subject.class)
        } else if (sortField === 'subjectName') {
          comparison = a.subject.name.toLowerCase().localeCompare(b.subject.name.toLowerCase())
        } else if (sortField === 'subjectCode') {
          comparison = a.subject.code.localeCompare(b.subject.code)
        } else if (sortField === 'duration') {
          comparison = a.subject.duration - b.subject.duration
        }
        
        return sortOrder === 'asc' ? comparison : -comparison
      })
    }
    
    // Apply pagination after sorting
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit
    
    const paginatedEntries = sortedEntries.slice(skip, skip + limit)
    const totalPages = Math.ceil(cbseDatesheet.totalEntries / limit)
    
    // Calculate unique dates from all entries (not just paginated)
    const uniqueDates = new Set(cbseDatesheet.entries.map(e => e.examDate.toISOString().slice(0, 10))).size
    
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: paginatedEntries,
      meta: {
        currentPage: page,
        totalPages,
        totalCount: cbseDatesheet.totalEntries,
        limit,
        uniqueDates  // Add unique dates to meta
      },
      datesheet: {
        id: cbseDatesheet._id,
        title: cbseDatesheet.title,
        academicYear: cbseDatesheet.academicYear,
        dateRange: cbseDatesheet.dateRange,
        statistics: cbseDatesheet.statistics,
        importDate: cbseDatesheet.importDate
      }
    })
    
  } catch (error) {
    console.error('❌ Error fetching CBSE datesheet:', error)
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch CBSE datesheet',
      error: error.message
    })
  }
})

// POST /api/datesheets/import-pdf
exports.importFromPdf = asyncHandler(async (req, res) => {
  console.log('=== Datesheet PDF Import Started ===')
  
  if (!req.files || !req.files.file) {
    console.log('❌ No file uploaded')
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'PDF file is required' })
  }

  const file = req.files.file
  console.log('📄 File received:', {
    name: file.name,
    size: file.size,
    mimetype: file.mimetype,
    tempPath: file.tempFilePath
  })
  
  // Validate file type
  if (!file.mimetype || !file.mimetype.includes('pdf')) {
    console.log('❌ Invalid file type:', file.mimetype)
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      success: false, 
      message: 'Invalid file type. Please upload a PDF file.' 
    })
  }

  // Check if temp file exists
  if (!fs.existsSync(file.tempFilePath)) {
    console.error('❌ Temp file does not exist:', file.tempFilePath)
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      success: false, 
      message: 'Uploaded file not found. Please try again.' 
    })
  }

  let buffer
  try {
    buffer = fs.readFileSync(file.tempFilePath)
    console.log('✅ File read successfully, size:', buffer.length, 'bytes')
  } catch (err) {
    console.error('❌ Error reading PDF file:', err)
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      success: false, 
      message: 'Failed to read PDF file' 
    })
  }

  let text
  try {
    console.log('🔍 Parsing PDF...')
    const data = await pdf(buffer)
    text = data.text
    console.log('✅ PDF parsed successfully')
    console.log('📊 Pages:', data.numpages)
    console.log('📊 Text length:', text.length)
    console.log('📊 Has text:', text.trim().length > 0)
    if (text.length > 0) {
      console.log('📝 First 500 characters:', text.substring(0, 500))
    }
  } catch (err) {
    console.error('❌ Error parsing PDF:', err.message)
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      success: false, 
      message: 'Failed to parse PDF. Ensure the PDF is not corrupted or password-protected.' 
    })
  }

  // If no or too little text, try OCR fallback (for scanned/image PDFs)
  let ocrAttempted = false
  if (!text || text.trim().length < 20) {
    console.log('PDF has little or no text. Attempting OCR...')
    ocrAttempted = true
    try {
      const convert = pdfToPic(file.tempFilePath, {
        density: 200,
        format: 'png',
        width: 1600,
        height: 2260,
        saveFilename: `ds_${Date.now()}`,
        savePath: os.tmpdir(),
      })

      // Convert first 5-10 pages max to keep time in check
      const ocrPages = []
      for (let page = 1; page <= 10; page++) {
        try {
          console.log(`Processing page ${page} with OCR...`)
          const result = await convert(page, { responseType: 'image' })
          if (!result || !result.path) {
            console.log(`No more pages to process (stopped at page ${page})`)
            break
          }
          const { data: ocr } = await Tesseract.recognize(result.path, 'eng', { logger: () => {} })
          if (ocr && ocr.text) {
            ocrPages.push(ocr.text)
            console.log(`Page ${page} OCR completed, text length: ${ocr.text.length}`)
          }
        } catch (e) {
          console.error(`OCR failed for page ${page}:`, e.message)
          break
        }
      }
      text = ocrPages.join('\n')
      console.log(`OCR completed. Total text length: ${text.length}`)
      
      if (!text || text.trim().length < 20) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'PDF appears to be a scanned image but OCR produced no readable text. Please ensure the scan is clear and high quality, or use a text-based PDF.',
          debug: {
            ocrAttempted: true,
            ocrPagesProcessed: ocrPages.length,
            textLength: text.length
          }
        })
      }
    } catch (e) {
      console.error('OCR error:', e.message)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'PDF has no selectable text and OCR is unavailable. Please use a text-based PDF or install OCR prerequisites (Ghostscript & GraphicsMagick).',
        debug: {
          ocrAttempted: true,
          ocrError: e.message
        }
      })
    }
  }

  // Try CBSE format parser first
  console.log('🔍 Attempting CBSE format parsing...')
  try {
    const cbseParser = new CBSEDatesheetParser()
    const cbseResult = await cbseParser.parsePDF(buffer)
    
    if (cbseResult.success && cbseResult.data.count > 0) {
      console.log('✅ CBSE format detected and parsed successfully!')
      console.log(`📊 Found ${cbseResult.data.count} entries`)
      
      // Get day names for all dates
      console.log('📅 Fetching day names from calendar...')
      const entriesWithDays = await Promise.all(
        cbseResult.data.entries.map(async (entry) => {
          try {
            const dayName = await getDayNameForDate(entry.examDate)
            return {
              ...entry,
              dayName: dayName || 'Unknown'
            }
          } catch (error) {
            console.warn(`Failed to get day name for ${entry.examDate}:`, error.message)
            return {
              ...entry,
              dayName: 'Unknown'
            }
          }
        })
      )
      
      // Determine academic year from dates
      const dates = cbseResult.data.entries.map(e => new Date(e.examDate))
      const minDate = new Date(Math.min(...dates))
      const maxDate = new Date(Math.max(...dates))
      const academicYear = `${minDate.getFullYear()}-${maxDate.getFullYear()}`
      
      // Save to database
      console.log('💾 Saving CBSE datesheet to database...')
      
      // Deactivate any existing active datesheets
      await CBSEDatesheet.updateMany({ isActive: true }, { isActive: false })
      
      const cbseDatesheet = new CBSEDatesheet({
        title: 'CBSE Full Datesheet',
        academicYear,
        totalEntries: entriesWithDays.length,
        dateRange: {
          startDate: minDate,
          endDate: maxDate
        },
        statistics: cbseParser.getStatistics(cbseResult.data.entries),
        entries: entriesWithDays,
        isActive: true,
        createdBy: req.user?.id || null
      })
      
      await cbseDatesheet.save()
      console.log('✅ CBSE datesheet saved to database')
      
      // Convert CBSE format to response format
      const cbseEntries = entriesWithDays.map(entry => ({
        date: entry.examDate,
        day: entry.dayName,
        startTime: entry.timeSlot.start,
        endTime: entry.timeSlot.end,
        subjectCode: entry.subject.code,
        subjectName: entry.subject.name,
        class: entry.subject.class,
        duration: entry.subject.duration,
        answerSheet: entry.answerSheet
      }))
      
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `Successfully imported ${cbseEntries.length} exam entries from CBSE datesheet`,
        data: {
          count: cbseEntries.length,
          entries: cbseEntries,
          format: 'CBSE Full Datesheet',
          stats: cbseParser.getStatistics(cbseResult.data.entries),
          datesheetId: cbseDatesheet._id
        }
      })
    } else {
      console.log('⚠️  CBSE format parsing failed or found no entries, trying standard format...')
    }
  } catch (cbseError) {
    console.log('⚠️  CBSE parser error:', cbseError.message, '- trying standard format...')
  }

  // Fallback to standard datesheet parsing
  console.log('🔍 Attempting standard datesheet format parsing...')
  
  // Normalize and parse
  const normalize = (s) => {
    let out = s
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[|]/g, ' ')
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .toUpperCase()
    // Fix spaced AM/PM from OCR (A M -> AM)
    out = out.replace(/A\s*M/g, 'AM').replace(/P\s*M/g, 'PM')
    // Fix spaced time like 10 : 30 -> 10:30
    out = out.replace(/(\d{1,2})\s*:\s*(\d{2})/g, '$1:$2')
    // Fix 10.30 -> 10:30
    out = out.replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
    // Collapse excess whitespace
    out = out.replace(/\s+/g, ' ').trim()
    return out
  }

  const rawLines = text.split(/\r?\n/) || []
  const lines = rawLines.map(normalize).filter(Boolean)
  const entries = []
  let currentDate = null
  let currentDayName = null
  let currentStartTime = null
  let currentEndTime = null
  let currentCode = null

  const timeOnlyRegex = /(\d{1,2}:\d{2})\s*(AM|PM)\s*[\-–]\s*(\d{1,2}:\d{2})\s*(AM|PM)/
  const codeNameRegex = /^([0-9]{2,4})\s+([A-Z0-9 .,&/\-]+)$/
  const codeOnlyRegex = /^([0-9]{2,4})$/
  const nameOnlyRegex = /^([A-Z][A-Z0-9 .,&/\-]{3,})$/

  for (const line of lines) {
    const header = parseDateHeader(line)
    if (header) {
      currentDate = header.dateISO
      currentDayName = header.dayName
      currentStartTime = null
      currentEndTime = null
      continue
    }

    // Case 1: whole row contains time + code + name
    const both = parseTimeAndSubject(line)
    if (both && currentDate) {
      entries.push({
        date: currentDate,
        day: currentDayName,
        startTime: both.startTime,
        endTime: both.endTime,
        subjectCode: both.subjectCode,
        subjectName: both.subjectName,
      })
      continue
    }

    // Case 2: this line only has time; remember it
    const t = line.match(timeOnlyRegex)
    if (t) {
      currentStartTime = `${t[1]} ${t[2]}`
      currentEndTime = `${t[3]} ${t[4]}`
      continue
    }

    // Case 3: this line contains code + subject, use last seen time
    const cn = line.match(codeNameRegex)
    if (cn && currentDate && currentStartTime && currentEndTime) {
      entries.push({
        date: currentDate,
        day: currentDayName,
        startTime: currentStartTime,
        endTime: currentEndTime,
        subjectCode: cn[1],
        subjectName: cn[2].trim(),
      })
      continue
    }

    // Code-only line (e.g., 041)
    const co = line.match(codeOnlyRegex)
    if (co) {
      currentCode = co[1]
      continue
    }
    // Name-only line, if we have time and code
    const no = line.match(nameOnlyRegex)
    if (no && currentCode && currentDate && currentStartTime && currentEndTime) {
      entries.push({
        date: currentDate,
        day: currentDayName,
        startTime: currentStartTime,
        endTime: currentEndTime,
        subjectCode: currentCode,
        subjectName: no[1].trim(),
      })
      currentCode = null
      continue
    }
  }

  if (entries.length === 0) {
    const normalizedLines = rawLines.map(normalize).filter(Boolean)
    const sample = normalizedLines.slice(0, 20)
    console.log('No entries found. Sample lines:', sample)
    console.log('Total lines processed:', lines.length)
    
    let errorMessage = 'Could not detect any datesheet rows. '
    if (text.trim().length === 0) {
      errorMessage += 'The PDF appears to be empty or contains only images. '
    } else if (ocrAttempted) {
      errorMessage += 'OCR was used but the text format does not match the expected datesheet format. '
    } else {
      errorMessage += 'The PDF text format does not match the expected datesheet format. '
    }
    errorMessage += 'See the troubleshooting guide for help.'
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: errorMessage,
      sample,
      debug: {
        totalLines: lines.length,
        textLength: text.length,
        hasText: text.trim().length > 0,
        ocrAttempted
      }
    })
  }

  console.log(`Successfully parsed ${entries.length} datesheet entries`)
  return res.status(HTTP_STATUS.OK).json({ 
    success: true, 
    message: 'Datesheet parsed successfully', 
    data: { entries, count: entries.length } 
  })
})



// GET /api/datesheets - Get all datesheets
exports.getAllDatesheets = asyncHandler(async (req, res) => {
  const DateSheet = require('../models/DateSheet')
  const { class: className, examType, status, academicYear, examId } = req.query

  const query = { isActive: true }
  
  if (className) query.class = className
  if (examType) query.examType = examType
  if (status) query.status = status
  if (academicYear) query.academicYear = academicYear
  if (examId) query.examId = examId

  const datesheets = await DateSheet.find(query)
    .populate('createdBy', 'name email')
    .populate('publishedBy', 'name email')
    .populate('examId', 'name code')
    .sort({ createdAt: -1 })

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Datesheets retrieved successfully',
    data: { datesheets, count: datesheets.length }
  })
})

// GET /api/datesheets/:id - Get datesheet by ID
exports.getDatesheetById = asyncHandler(async (req, res) => {
  const DateSheet = require('../models/DateSheet')
  const { id } = req.params

  const datesheet = await DateSheet.findOne({ _id: id, isActive: true })
    .populate('createdBy', 'name email')
    .populate('publishedBy', 'name email')
    .populate('subjects.subject')

  if (!datesheet) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Datesheet not found'
    })
  }

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Datesheet retrieved successfully',
    data: { datesheet }
  })
})

// POST /api/datesheets - Create new datesheet
exports.createDatesheet = asyncHandler(async (req, res) => {
  const DateSheet = require('../models/DateSheet')
  const {
    title,
    examType,
    class: className,
    academicYear,
    startDate,
    endDate,
    generalInstructions,
    examId,
    section,
  } = req.body

  // Validate required fields
  if (!title || !examType || !className || !academicYear || !startDate || !endDate) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Missing required fields'
    })
  }

  if (examType === 'internal' && !examId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'examId is required for internal exam datesheets.',
    })
  }

  const normalizedSection = String(section || '').trim()

  if (examId) {
    const duplicateQuery = {
      examId,
      class: className,
      academicYear,
      examType,
      isActive: true,
      section: normalizedSection,
    }
    const existing = await DateSheet.findOne(duplicateQuery).select('_id title').lean()
    if (existing) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: normalizedSection
          ? `A datesheet already exists for this exam, class, and section (${existing.title}).`
          : `A datesheet already exists for this exam and class (${existing.title}).`,
      })
    }
  }

  // Validate date range
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'End date must be after or equal to start date'
    })
  }

  // Create datesheet
  const datesheet = await DateSheet.create({
    title,
    examType,
    class: className,
    academicYear,
    startDate,
    endDate,
    generalInstructions: generalInstructions || [],
    examId: examId || null,
    section: normalizedSection,
    createdBy: req.user._id,
    subjects: []
  })

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Datesheet created successfully',
    data: { datesheet }
  })
})

// PUT /api/datesheets/:id - Update datesheet
exports.updateDatesheet = asyncHandler(async (req, res) => {
  const DateSheet = require('../models/DateSheet')
  const { id } = req.params
  const { title, examType, class: className, academicYear, startDate, endDate, generalInstructions, subjects, examId, section } = req.body

  const datesheet = await DateSheet.findOne({ _id: id, isActive: true })

  if (!datesheet) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Datesheet not found'
    })
  }

  // Don't allow editing published datesheets
  if (datesheet.status === 'published') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Cannot edit published datesheet'
    })
  }

  // Update fields
  if (title) datesheet.title = title
  if (examType) datesheet.examType = examType
  if (className) datesheet.class = className
  if (academicYear) datesheet.academicYear = academicYear
  if (startDate) datesheet.startDate = startDate
  if (endDate) datesheet.endDate = endDate
  if (generalInstructions) datesheet.generalInstructions = generalInstructions
  if (examId !== undefined) datesheet.examId = examId || null
  if (section !== undefined) datesheet.section = String(section || '').trim()

  // Replace subjects if provided
  if (Array.isArray(subjects)) {
    // Normalize and add day names automatically
    datesheet.subjects = subjects.map((s) => ({
      subject: s.subject,
      examDate: s.examDate,
      dayName: getDayName(s.examDate), // Automatically calculate day name
      timeSlot: { start: s.timeSlot?.start || s.start, end: s.timeSlot?.end || s.end },
      duration: s.duration || 180,
      instructions: s.instructions || '',
      isOptional: !!s.isOptional,
    }))
  }

  datesheet.lastModifiedBy = req.user._id
  await datesheet.save()

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Datesheet updated successfully',
    data: { datesheet }
  })
})

// DELETE /api/datesheets/:id - Delete datesheet (soft delete)
exports.deleteDatesheet = asyncHandler(async (req, res) => {
  const DateSheet = require('../models/DateSheet')
  const { id } = req.params

  const datesheet = await DateSheet.findOne({ _id: id, isActive: true })

  if (!datesheet) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Datesheet not found'
    })
  }

  // Soft delete
  datesheet.isActive = false
  await datesheet.save()

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Datesheet deleted successfully'
  })
})

// POST /api/datesheets/:id/publish - Publish datesheet
exports.publishDatesheet = asyncHandler(async (req, res) => {
  const DateSheet = require('../models/DateSheet')
  const { id } = req.params

  const datesheet = await DateSheet.findOne({ _id: id, isActive: true })

  if (!datesheet) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Datesheet not found'
    })
  }

  if (datesheet.status === 'published') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Datesheet is already published'
    })
  }

  // Validate that datesheet has subjects
  if (!datesheet.subjects || datesheet.subjects.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Cannot publish datesheet without subjects'
    })
  }

  datesheet.status = 'published'
  datesheet.publishedDate = new Date()
  datesheet.publishedBy = req.user._id
  await datesheet.save()

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Datesheet published successfully',
    data: { datesheet }
  })
})

// GET /api/datesheets/centre-datesheet - Generate centre-specific datesheet based on candidate subject choices
exports.getCentreDatesheet = asyncHandler(async (req, res) => {
  try {
    console.log('📄 Generating centre-specific datesheet...')
    
    // Get CBSE datesheet
    const { datesheet: cbseDatesheet } = await ensureTenantActiveDatesheet(CBSEDatesheet)
    if (!cbseDatesheet) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'No CBSE datesheet found. Please import a CBSE datesheet first.',
        data: { entries: [], count: 0 }
      })
    }
    
    // Get all candidates to find their subject choices
    const Candidate = require('../models/Candidate')
    console.log('🔍 Fetching candidates...')
    
    const candidates = await Candidate.find(ACTIVE_CANDIDATE_FILTER)
      .populate('subjects', 'code name class')
      .lean()
    
    console.log(`📊 Found ${candidates.length} candidates`)
    
    if (!candidates || candidates.length === 0) {
      console.log('❌ No candidates found')
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'No candidates found.',
        data: { entries: [], count: 0 }
      })
    }
    
    // Check if any candidates have subjects
    const candidatesWithSubjects = candidates.filter(c => c.subjects && c.subjects.length > 0)
    console.log(`📊 Candidates with subjects: ${candidatesWithSubjects.length}/${candidates.length}`)
    
    if (candidatesWithSubjects.length === 0) {
      console.log('❌ No candidates have subjects linked')
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'No candidates have subjects linked. Please ensure candidates have selected their subjects.',
        data: { entries: [], count: 0 }
      })
    }
    
    // Extract unique subject codes from all candidates
    // Using Set to automatically handle different subject combinations
    const candidateSubjectCodes = new Set()
    const subjectFrequency = new Map() // Track how many candidates have each subject (by code + class)
    const candidatesByClass = new Map() // Track unique candidates per class
    
    candidates.forEach(candidate => {
      // Track unique candidates by class
      if (candidate.class) {
        const normalizedClass = normalizeSubjectClass(candidate.class)
        const classSet = candidatesByClass.get(normalizedClass) || new Set()
        classSet.add(candidate._id.toString())
        candidatesByClass.set(normalizedClass, classSet)
      }
      
      if (candidate.subjects && candidate.subjects.length > 0) {
        candidate.subjects.forEach(subject => {
          // subject is now the populated Subject document
          if (subject && subject.code && subject.class) {
            const normalizedCode = normalizeSubjectCode(subject.code)
            const key = buildSubjectKey(subject.code, subject.class)

            if (!normalizedCode || key.endsWith('-')) return

            candidateSubjectCodes.add(normalizedCode)
            
            // Track frequency by subject code + class combination
            const count = subjectFrequency.get(key) || 0
            subjectFrequency.set(key, count + 1)
          }
        })
      }
    })
    
    // Log candidate counts by class
    console.log(`📊 Candidates by class:`)
    candidatesByClass.forEach((candidateSet, classLevel) => {
      console.log(`   ${classLevel}: ${candidateSet.size} candidates`)
    })
    
    console.log(`📊 Found ${candidateSubjectCodes.size} unique subject codes from ${candidates.length} candidates`)
    
    if (candidateSubjectCodes.size === 0) {
      console.log('❌ No subject codes extracted from candidates')
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Could not extract subject codes from candidates. Subjects may not be properly linked.',
        data: { entries: [], count: 0 }
      })
    }
    
    console.log(`📋 Subject distribution (showing subjects chosen by candidates):`)
    
    // Show top 10 most common subjects
    const sortedSubjects = Array.from(subjectFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    sortedSubjects.forEach(([key, count]) => {
      console.log(`   ${key}: ${count} candidates (${Math.round(count/candidates.length*100)}%)`)
    })
    
    // Filter CBSE datesheet entries to only include subjects that candidates have chosen
    // and add candidate count for each entry
    const entriesWithCounts = cbseDatesheet.entries
      .map(entry => {
        const key = buildSubjectKey(entry.subject.code, entry.subject.class)
        const candidateCount = subjectFrequency.get(key) || 0

        return {
          ...entry.toObject(),
          candidateCount
        }
      })
      .filter(entry => entry.candidateCount > 0)

    // Calculate rooms using per-day grouping with remainder merging
    const centreEntries = calculateRoomsGroupedByDate(entriesWithCounts)
    
    console.log(`📋 Filtered to ${centreEntries.length} centre-specific entries`)
    
    if (centreEntries.length === 0) {
      console.log('❌ No matching subjects found between candidates and CBSE datesheet')
      console.log(`   Candidate subject codes: ${Array.from(candidateSubjectCodes).slice(0, 10).join(', ')}`)
      console.log(`   CBSE subject codes: ${cbseDatesheet.entries.slice(0, 10).map(e => normalizeSubjectCode(e.subject.code)).join(', ')}`)
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: `No matching subjects found. Candidates have ${candidateSubjectCodes.size} subjects but none match the CBSE datesheet.`,
        data: { entries: [], count: 0 },
        debug: {
          candidateSubjectCodes: Array.from(candidateSubjectCodes).slice(0, 20),
          cbseSubjectCodes: cbseDatesheet.entries.slice(0, 20).map(e => normalizeSubjectCode(e.subject.code))
        }
      })
    }
    
    // Apply sorting if requested
    const sortField = req.query.sortField || null
    const sortOrder = req.query.sortOrder || 'asc'
    
    let sortedEntries = [...centreEntries]
    if (sortField) {
      sortedEntries.sort((a, b) => {
        let comparison = 0
        
        if (sortField === 'date') {
          comparison = new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
        } else if (sortField === 'class') {
          comparison = a.subject.class.localeCompare(b.subject.class)
        } else if (sortField === 'subjectName') {
          comparison = a.subject.name.toLowerCase().localeCompare(b.subject.name.toLowerCase())
        } else if (sortField === 'subjectCode') {
          comparison = a.subject.code.localeCompare(b.subject.code)
        } else if (sortField === 'duration') {
          comparison = a.subject.duration - b.subject.duration
        }
        
        return sortOrder === 'asc' ? comparison : -comparison
      })
    } else {
      // Default sort by date
      sortedEntries.sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime())
    }
    
    // Apply pagination
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit
    
    const paginatedEntries = sortedEntries.slice(skip, skip + limit)
    const totalPages = Math.ceil(sortedEntries.length / limit)
    
    // Generate statistics
    const class10thEntries = sortedEntries.filter(e => e.subject.class === '10th')
    const class12thEntries = sortedEntries.filter(e => e.subject.class === '12th')
    const candidates10th = candidates.filter(c => normalizeSubjectClass(c.class) === '10th')
    const candidates12th = candidates.filter(c => normalizeSubjectClass(c.class) === '12th')
    
    const stats = {
      total: sortedEntries.length,
      class10th: class10thEntries.length,
      class10thDays: [...new Set(class10thEntries.map(e => e.examDate.toISOString().slice(0, 10)))].length,
      class10thCandidates: candidates10th.length,
      class12th: class12thEntries.length,
      class12thDays: [...new Set(class12thEntries.map(e => e.examDate.toISOString().slice(0, 10)))].length,
      class12thCandidates: candidates12th.length,
      uniqueDates: [...new Set(sortedEntries.map(e => e.examDate.toISOString().slice(0, 10)))].length,
      candidateCount: candidates.length
    }
    
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: paginatedEntries,
      meta: {
        currentPage: page,
        totalPages,
        totalCount: sortedEntries.length,
        limit
      },
      stats,
      message: `Generated centre datesheet with ${sortedEntries.length} unique subjects from ${candidateSubjectCodes.size} different subject codes chosen by ${candidates.length} candidates`
    })
    
  } catch (error) {
    console.error('❌ Error generating centre datesheet:', error)
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate centre datesheet',
      error: error.message
    })
  }
})

// GET /api/datesheets/stats - Get datesheet stats for top cards (no list data)
exports.getDatesheetStats = asyncHandler(async (req, res) => {
  const Subject = require('../models/Subject')
  const Candidate = require('../models/Candidate')

  const stats = {
    fullDatesheet: 0,
    fullDatesheetDays: 0,
    centre: 0,
    centreDays: 0,
    centreCandidates: 0,
    centre10th: 0,
    centre10thDays: 0,
    centre10thCandidates: 0,
    centre12th: 0,
    centre12thDays: 0,
    centre12thCandidates: 0
  }

  try {
    const { datesheet: cbseDatesheet } = await ensureTenantActiveDatesheet(CBSEDatesheet)
    if (cbseDatesheet) {
      stats.fullDatesheet = cbseDatesheet.totalEntries || 0
      stats.fullDatesheetDays = new Set(
        cbseDatesheet.entries.map(e => e.examDate.toISOString().slice(0, 10))
      ).size
    } else {
      const subjectCount = await Subject.countDocuments()
      stats.fullDatesheet = subjectCount
    }
  } catch (e) {
    // leave fullDatesheet stats at 0
  }

  try {
    const { datesheet: cbseDatesheet } = await ensureTenantActiveDatesheet(CBSEDatesheet)
    if (!cbseDatesheet) return res.status(HTTP_STATUS.OK).json({ success: true, data: stats })

    const candidates = await Candidate.find(ACTIVE_CANDIDATE_FILTER)
      .populate('subjects', 'code name class')
      .lean()
    if (!candidates || candidates.length === 0) return res.status(HTTP_STATUS.OK).json({ success: true, data: stats })

    const subjectFrequency = new Map()
    candidates.forEach(candidate => {
      if (candidate.subjects && candidate.subjects.length > 0) {
        candidate.subjects.forEach(subject => {
          if (subject && subject.code && subject.class) {
            const key = buildSubjectKey(subject.code, subject.class)
            subjectFrequency.set(key, (subjectFrequency.get(key) || 0) + 1)
          }
        })
      }
    })

    const centreEntries = cbseDatesheet.entries
      .map(entry => ({
        ...entry.toObject(),
        candidateCount: subjectFrequency.get(buildSubjectKey(entry.subject.code, entry.subject.class)) || 0
      }))
      .filter(entry => entry.candidateCount > 0)

    if (centreEntries.length === 0) return res.status(HTTP_STATUS.OK).json({ success: true, data: stats })

    const class10thEntries = centreEntries.filter(e => e.subject.class === '10th')
    const class12thEntries = centreEntries.filter(e => e.subject.class === '12th')
    const candidates10th = candidates.filter(c => normalizeSubjectClass(c.class) === '10th')
    const candidates12th = candidates.filter(c => normalizeSubjectClass(c.class) === '12th')

    stats.centre = centreEntries.length
    stats.centreDays = [...new Set(centreEntries.map(e => e.examDate.toISOString().slice(0, 10)))].length
    stats.centreCandidates = candidates.length
    stats.centre10th = class10thEntries.length
    stats.centre10thDays = [...new Set(class10thEntries.map(e => e.examDate.toISOString().slice(0, 10)))].length
    stats.centre10thCandidates = candidates10th.length
    stats.centre12th = class12thEntries.length
    stats.centre12thDays = [...new Set(class12thEntries.map(e => e.examDate.toISOString().slice(0, 10)))].length
    stats.centre12thCandidates = candidates12th.length
  } catch (e) {
    // leave centre stats at 0
  }

  return res.status(HTTP_STATUS.OK).json({ success: true, data: stats })
})
