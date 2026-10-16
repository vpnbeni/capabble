const fs = require('fs').promises;
const { AttendanceRecord, AttendanceUpload } = require('../models/AttendanceRecord');
const Candidate = require('../models/Candidate');
const { cloudinary, uploadDocumentToCloudinary, uploadToCloudinary } = require('../config/cloudinary');
const { parseAttendanceSheetPdf } = require('../utils/attendanceSheetParser');
const pdfGenerator = require('../utils/pdfGenerator');
const seatingPlanBuilder = require('../utils/seatingPlanBuilder');

const ACTIVE_CANDIDATE_FILTER = {
  $or: [{ status: 'active' }, { status: { $exists: false } }],
};

const normalizeSubjectCode = (code) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\((?:E|H)\)$/i, '');

const normalizeExamDateKey = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue || '');
  return date.toISOString().split('T')[0];
};

const formatReportDate = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue || '');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const getSessionLabel = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Secondary School Certificate Examination';
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const startYear = month <= 3 ? year - 1 : year;
  const endYear = startYear + 1;
  return `Secondary School Certificate Examination ${endYear}`;
};

const getSeatPlanOptionsForAttendanceReport = async (req) => {
  const SeatingPlanTemplateSetting = req.models?.SeatingPlanTemplateSetting || require('../models/SeatingPlanTemplateSetting');
  const CentreDetail = req.models?.CentreDetail || require('../models/CentreDetail');

  let roomAllocationMode = 'auto';
  if (SeatingPlanTemplateSetting) {
    const settingsDoc = await SeatingPlanTemplateSetting.findOne({}).sort({ updatedAt: -1 });
    if (String(settingsDoc?.roomAllocationMode || '').toLowerCase() === 'manual') {
      roomAllocationMode = 'manual';
    }
  }

  const centreDetails = CentreDetail
    ? await CentreDetail.findOne({}).sort({ updatedAt: -1 }).lean()
    : null;

  return { roomAllocationMode, centreDetails };
};

const buildAttendanceAbsenteeReportData = async (req, classValue) => {
  const AttendanceRecordModel = req.models?.AttendanceRecord || AttendanceRecord;
  const CandidateModel = req.models?.Candidate || Candidate;
  const CBSEDatesheet = req.models?.CBSEDatesheet || require('../models/CBSEDatesheet');
  const SeatingPlanAllocation = req.models?.SeatingPlanAllocation || require('../models/SeatingPlanAllocation');
  const CentreDetail = req.models?.CentreDetail || require('../models/CentreDetail');
  let FolderMapping = null;

  try {
    FolderMapping = req.models?.FolderMapping || require('../models/FolderMapping');
  } catch (_) {
    FolderMapping = null;
  }

  const candidateClass = classValue === 'X' ? '10th' : '12th';
  const cbseDatesheet = await CBSEDatesheet.getActive();

  if (!cbseDatesheet) {
    throw new Error('No active CBSE datesheet found');
  }

  const candidates = await CandidateModel.find({
    ...ACTIVE_CANDIDATE_FILTER,
    class: candidateClass,
  })
    .select('_id rollNumber name class subjectCodes')
    .lean();

  const relevantEntries = cbseDatesheet.entries
    .filter((entry) => String(entry?.subject?.class || '') === candidateClass)
    .map((entry) => ({
      _id: String(entry._id),
      examDate: entry.examDate,
      examDateKey: normalizeExamDateKey(entry.examDate),
      dayName: String(entry.dayName || ''),
      subjectCode: normalizeSubjectCode(entry.subject?.code),
      subjectName: String(entry.subject?.name || ''),
    }));

  const seatingOptions = await getSeatPlanOptionsForAttendanceReport(req);
  const serialLookupByEntry = new Map();

  const absenceRecords = await AttendanceRecordModel.find({
    isAbsent: true,
    class: classValue,
  })
    .select('_id candidateId examDate subjectCode class roomNo sheetNumber')
    .lean();

  const absentByCandidate = new Map();
  const absenceRecordByKey = new Map();
  absenceRecords.forEach((record) => {
    const candidateId = String(record.candidateId || '');
    const normalizedDateKey = normalizeExamDateKey(record.examDate);
    const normalizedSubjectCode = normalizeSubjectCode(record.subjectCode);
    const key = `${normalizedDateKey}|${normalizedSubjectCode}`;
    if (!absentByCandidate.has(candidateId)) {
      absentByCandidate.set(candidateId, new Set());
    }
    absentByCandidate.get(candidateId).add(key);
    absenceRecordByKey.set(`${candidateId}|${key}`, record);
  });

  const absentRollNos = candidates
    .filter((candidate) => absentByCandidate.has(String(candidate._id)))
    .map((candidate) => String(candidate.rollNumber || '').trim())
    .filter(Boolean);

  const seatingAllocations = absentRollNos.length
    ? await SeatingPlanAllocation.find({
        className: candidateClass,
        rollNo: { $in: absentRollNos },
      })
        .select('rollNo examDate subjectCode roomNo')
        .lean()
    : [];

  const roomByExamRoll = new Map();
  seatingAllocations.forEach((allocation) => {
    const key = `${String(allocation.rollNo || '').trim()}|${normalizeExamDateKey(allocation.examDate)}|${normalizeSubjectCode(allocation.subjectCode)}`;
    roomByExamRoll.set(key, String(allocation.roomNo || '').trim() || '-');
  });

  const sheetByExamRoll = new Map();
  if (FolderMapping && absentRollNos.length) {
    try {
      const folderMappings = await FolderMapping.find({
        isActive: true,
        'students.rollNumber': { $in: absentRollNos },
      })
        .select('examDate students.rollNumber students.answerSheetNumber subject room')
        .populate('subject', 'code')
        .populate('room', 'roomNo')
        .lean();

      folderMappings.forEach((mapping) => {
        const examDateKey = normalizeExamDateKey(mapping.examDate);
        const subjectCode = normalizeSubjectCode(mapping?.subject?.code);
        (mapping.students || []).forEach((student) => {
          const rollNo = String(student?.rollNumber || '').trim();
          if (!rollNo) return;
          const key = `${rollNo}|${examDateKey}|${subjectCode}`;
          const answerSheetNumber = String(student?.answerSheetNumber || '').trim();
          if (answerSheetNumber && !sheetByExamRoll.has(key)) {
            sheetByExamRoll.set(key, answerSheetNumber);
          }
          if (mapping?.room?.roomNo && !roomByExamRoll.has(key)) {
            roomByExamRoll.set(key, String(mapping.room.roomNo).trim());
          }
        });
      });
    } catch (error) {
      console.warn('Failed to fetch folder mappings for absentee report:', error.message);
    }
  }

  const classified = {
    full: [],
    casual: [],
  };
  const cacheUpdateOps = [];

  for (const candidate of candidates) {
    const candidateId = String(candidate._id);
    const subjectCodes = Array.isArray(candidate.subjectCodes)
      ? candidate.subjectCodes
          .map((item) => normalizeSubjectCode(typeof item === 'string' ? item : item?.code))
          .filter(Boolean)
      : [];

    const scheduledEntries = relevantEntries
      .filter((entry) => subjectCodes.includes(entry.subjectCode))
      .sort((left, right) => {
        const dateDiff = new Date(left.examDate).getTime() - new Date(right.examDate).getTime();
        if (dateDiff !== 0) return dateDiff;
        return left.subjectCode.localeCompare(right.subjectCode);
      });

    if (!scheduledEntries.length) continue;

    const absentSet = absentByCandidate.get(candidateId) || new Set();
    const absentEntries = scheduledEntries
      .filter((entry) => absentSet.has(`${entry.examDateKey}|${entry.subjectCode}`))
      .map(async (entry, index) => {
        const detailKey = `${String(candidate.rollNumber || '').trim()}|${entry.examDateKey}|${entry.subjectCode}`;
        const attendanceRecordKey = `${candidateId}|${entry.examDateKey}|${entry.subjectCode}`;
        const cachedRecord = absenceRecordByKey.get(attendanceRecordKey);
        const entryId = String(entry._id || '');
        let roomNo = String(cachedRecord?.roomNo || '').trim() || roomByExamRoll.get(detailKey) || '-';
        let serialNumber = String(cachedRecord?.sheetNumber || '').trim() || sheetByExamRoll.get(detailKey) || '-';

        if (serialNumber === '-' && entryId) {
          const cacheKey = `${entryId}|${String(candidate.rollNumber || '').trim()}`;
          if (!serialLookupByEntry.has(cacheKey)) {
            serialLookupByEntry.set(
              cacheKey,
              seatingPlanBuilder
                .getSerialForCandidateInEntry(entryId, String(candidate.rollNumber || '').trim(), seatingOptions)
                .catch(() => null)
            );
          }
          const serialData = await serialLookupByEntry.get(cacheKey);
          if (serialData?.serialNumber) {
            serialNumber = String(serialData.serialNumber).trim();
          }
        }

        if (
          cachedRecord?._id
          && ((roomNo && roomNo !== '-' && roomNo !== String(cachedRecord.roomNo || '').trim())
            || (serialNumber && serialNumber !== '-' && serialNumber !== String(cachedRecord.sheetNumber || '').trim()))
        ) {
          cacheUpdateOps.push({
            updateOne: {
              filter: { _id: cachedRecord._id },
              update: {
                $set: {
                  ...(roomNo && roomNo !== '-' ? { roomNo } : {}),
                  ...(serialNumber && serialNumber !== '-' ? { sheetNumber: serialNumber } : {}),
                },
              },
            },
          });
        }

        return {
          srNo: index + 1,
          dateLabel: formatReportDate(entry.examDate),
          dayName: entry.dayName || '-',
          subjectName: entry.subjectName || '-',
          subjectCode: entry.subjectCode || '-',
          roomNo,
          sheetNumber: serialNumber || '-',
        };
      });

    const resolvedAbsentEntries = await Promise.all(absentEntries);

    if (!resolvedAbsentEntries.length) continue;

    const bucket = resolvedAbsentEntries.length === scheduledEntries.length ? 'full' : 'casual';
    classified[bucket].push({
      rollNumber: String(candidate.rollNumber || '').trim(),
      entries: resolvedAbsentEntries,
    });
  }

  classified.full.sort((left, right) => left.rollNumber.localeCompare(right.rollNumber, undefined, { numeric: true }));
  classified.casual.sort((left, right) => left.rollNumber.localeCompare(right.rollNumber, undefined, { numeric: true }));

  if (cacheUpdateOps.length > 0) {
    await AttendanceRecordModel.bulkWrite(cacheUpdateOps, { ordered: false });
  }

  const centreDetails = await CentreDetail.findOne({}).sort({ updatedAt: -1 }).lean();
  const schoolName = (centreDetails?.centreName && String(centreDetails.centreName).trim())
    || seatingPlanBuilder.schoolName
    || 'EXAMINATION CENTRE';
  const centreNo = (centreDetails?.centreNo && String(centreDetails.centreNo).trim())
    || seatingPlanBuilder.centreNo
    || '';
  const examYear = seatingPlanBuilder.getExamYear(relevantEntries[0]?.examDate || new Date());
  const examName = seatingPlanBuilder.getExamName(classValue === 'X' ? '10' : '12');

  return {
    schoolName,
    centreNo,
    examName,
    examYear,
    classLabel: classValue,
    pages: [
      {
        schoolName,
        centreNo,
        examName,
        examYear,
        classLabel: classValue,
        title: 'List Of Full Absentee',
        candidates: classified.full,
      },
      {
        schoolName,
        centreNo,
        examName,
        examYear,
        classLabel: classValue,
        title: 'List Of Casual Absentee',
        candidates: classified.casual,
      },
    ],
  };
};

/**
 * Save absentees (bulk upsert).
 * Body: { absentees: [{ candidateId, examDate, subjectCode, class, isAbsent }] }
 *
 * Records with isAbsent=true are upserted; records with isAbsent=false are removed
 * so the collection only stores actual absences.
 */
exports.saveAbsentees = async (req, res) => {
  try {
    const { absentees } = req.body;

    if (!Array.isArray(absentees)) {
      return res.status(400).json({ message: 'absentees must be an array' });
    }

    const AttendanceRecordModel = req.models?.AttendanceRecord || AttendanceRecord;

    const toUpsert = absentees.filter((a) => a.isAbsent);
    const toRemove = absentees.filter((a) => !a.isAbsent);

    // Bulk upsert absent records
    const bulkOps = toUpsert.map((a) => ({
      updateOne: {
        filter: {
          candidateId: a.candidateId,
          examDate: a.examDate,
          subjectCode: a.subjectCode,
        },
        update: {
          $set: {
            candidateId: a.candidateId,
            examDate: a.examDate,
            subjectCode: a.subjectCode,
            class: a.class,
            isAbsent: true,
          },
        },
        upsert: true,
      },
    }));

    // Remove records that are no longer absent
    const removeOps = toRemove.map((a) => ({
      deleteOne: {
        filter: {
          candidateId: a.candidateId,
          examDate: a.examDate,
          subjectCode: a.subjectCode,
        },
      },
    }));

    const allOps = [...bulkOps, ...removeOps];

    let result = { modifiedCount: 0, upsertedCount: 0, deletedCount: 0 };
    if (allOps.length > 0) {
      result = await AttendanceRecordModel.bulkWrite(allOps, { ordered: false });
    }

    res.json({
      success: true,
      message: 'Attendance saved successfully',
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0,
      removed: result.deletedCount || 0,
    });
  } catch (error) {
    console.error('Save Absentees Error:', error);
    res.status(500).json({
      message: 'Failed to save attendance',
      error: error.message,
    });
  }
};

/**
 * Get absentees, optionally filtered by class.
 * Query params: ?class=X or ?class=XII
 * Returns all attendance records (isAbsent=true) for the current academic session.
 */
exports.getAbsentees = async (req, res) => {
  try {
    const AttendanceRecordModel = req.models?.AttendanceRecord || AttendanceRecord;

    const filter = { isAbsent: true };
    if (req.query.class) {
      filter.class = req.query.class;
    }

    const records = await AttendanceRecordModel.find(filter).lean();

    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    console.error('Get Absentees Error:', error);
    res.status(500).json({
      message: 'Failed to fetch absentees',
      error: error.message,
    });
  }
};

/**
 * Upload candidate photo buffer to Cloudinary as an image.
 * Uses upload_stream since we have a Buffer, not a file path.
 */
const uploadPhotoBufferToCloudinary = async (buffer, rollNumber) => {
  const folder = 'capabble/candidate-photos';
  const publicId = `${rollNumber}_${Date.now()}`;

  const options = {
    folder,
    public_id: publicId,
    resource_type: 'image',
    transformation: [
      { width: 300, height: 300, crop: 'limit' },
      { quality: 'auto' },
    ],
  };

  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    }).end(buffer);
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};

/**
 * Upload attendance sheet document (image or PDF) for a class.
 * If it's a PDF, also extract candidate photos and update Candidate records.
 * Expects: file in req.files.file, class in req.body.class ('X' or 'XII')
 */
exports.uploadAttendanceSheet = async (req, res) => {
  let tempFilePath = null;

  try {
    const AttendanceUploadModel = req.models?.AttendanceUpload || AttendanceUpload;
    const CandidateModel = req.models?.Candidate || Candidate;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const classValue = req.body.class;
    if (!classValue || !['X', 'XII'].includes(classValue)) {
      return res.status(400).json({ message: `class must be "X" or "XII", got: "${classValue}"` });
    }

    const { file } = req.files;
    tempFilePath = file.tempFilePath;

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.mimetype === 'application/pdf';

    // Try uploading the file itself to Cloudinary (best-effort for large files)
    let fileUrl = null;
    let filePublicId = null;
    try {
      const folder = 'capabble/attendance-sheets';
      const uploadResult = await uploadDocumentToCloudinary(tempFilePath, folder);
      fileUrl = uploadResult.url;
      filePublicId = uploadResult.publicId;
    } catch (cloudErr) {
      console.warn(`[Attendance Upload] Cloudinary raw upload skipped (${cloudErr.message}). Proceeding with photo extraction.`);
    }

    // Save upload record (fileUrl/publicId will be null if Cloudinary upload was skipped)
    const uploadRecord = await AttendanceUploadModel.create({
      class: classValue,
      fileUrl: fileUrl || null,
      publicId: filePublicId || null,
      originalFileName: file.name,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    // If it's a PDF, extract candidate photos
    let photoResults = { extracted: 0, updated: 0, errors: [] };

    if (isPdf) {
      console.log('[Attendance Upload] PDF detected — extracting candidate photos...');
      const pdfBuffer = await fs.readFile(tempFilePath);
      const parseResult = await parseAttendanceSheetPdf(pdfBuffer);

      if (parseResult.success && parseResult.data.length > 0) {
        console.log(`[Attendance Upload] Extracted ${parseResult.data.length} candidate photos, uploading to Cloudinary...`);

        let updatedCount = 0;

        // Process photos in batches of 5 to avoid overwhelming Cloudinary
        const batchSize = 5;
        for (let i = 0; i < parseResult.data.length; i += batchSize) {
          const batch = parseResult.data.slice(i, i + batchSize);

          const batchPromises = batch.map(async ({ rollNumber, imageBuffer }) => {
            try {
              // Upload photo to Cloudinary
              const photoUpload = await uploadPhotoBufferToCloudinary(imageBuffer, rollNumber);

              // Update the matching Candidate record
              const result = await CandidateModel.findOneAndUpdate(
                { rollNumber: rollNumber.toUpperCase() },
                {
                  $set: {
                    photoUrl: photoUpload.url,
                    photoPublicId: photoUpload.publicId,
                  },
                },
                { new: true }
              );

              if (result) {
                updatedCount++;
                return { rollNumber, status: 'updated' };
              }
              return { rollNumber, status: 'not_found' };
            } catch (err) {
              console.warn(`[Attendance Upload] Failed to process photo for roll ${rollNumber}:`, err.message);
              return { rollNumber, status: 'error', error: err.message };
            }
          });

          await Promise.all(batchPromises);
        }

        photoResults = {
          extracted: parseResult.data.length,
          updated: updatedCount,
          errors: parseResult.errors,
        };

        console.log(`[Attendance Upload] Photo extraction complete: ${parseResult.data.length} extracted, ${updatedCount} candidates updated`);
      } else {
        photoResults.errors = parseResult.errors;
        console.warn('[Attendance Upload] No photos extracted from PDF:', parseResult.errors.slice(0, 3));
      }
    }

    // Clean up temp file
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }

    const parts = [`Attendance sheet processed for Class ${classValue}.`];
    if (!fileUrl) parts.push('PDF too large for cloud storage — stored locally.');
    if (isPdf) parts.push(`${photoResults.extracted} photos extracted, ${photoResults.updated} candidates updated.`);

    res.json({
      success: true,
      message: parts.join(' '),
      data: uploadRecord,
      photoResults: isPdf ? photoResults : undefined,
    });
  } catch (error) {
    console.error('[Attendance Upload] Error:', error.message);
    console.error('[Attendance Upload] Stack:', error.stack);

    // Clean up temp file on error
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }

    res.status(500).json({
      message: 'Failed to upload attendance sheet',
      error: error.message,
    });
  }
};

/**
 * Get uploaded attendance sheets, optionally filtered by class.
 * Query params: ?class=X or ?class=XII
 */
exports.getAttendanceSheets = async (req, res) => {
  try {
    const AttendanceUploadModel = req.models?.AttendanceUpload || AttendanceUpload;

    const filter = {};
    if (req.query.class) {
      filter.class = req.query.class;
    }

    const uploads = await AttendanceUploadModel.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: uploads,
    });
  } catch (error) {
    console.error('Get Attendance Sheets Error:', error);
    res.status(500).json({
      message: 'Failed to fetch attendance sheets',
      error: error.message,
    });
  }
};

exports.downloadAbsenteeReport = async (req, res) => {
  try {
    const classValue = String(req.query.class || '').trim().toUpperCase();

    if (!['X', 'XII'].includes(classValue)) {
      return res.status(400).json({
        success: false,
        error: 'class must be X or XII',
      });
    }

    const templateData = await buildAttendanceAbsenteeReportData(req, classValue);
    const pdfBuffer = await pdfGenerator.generateAttendanceAbsenteeList(templateData);
    const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    const filename = `attendance-absentee-list-${classValue.toLowerCase()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (error) {
    console.error('Download Absentee Report Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate absentee report',
    });
  }
};
