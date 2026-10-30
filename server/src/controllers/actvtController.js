const { makeRecordCrud } = require('../utils/recordCrud');
const pdfGenerator = require('../utils/pdfGenerator');
const { uploadToCloudinary, deleteFromCloudinary, extractPublicId } = require('../config/cloudinary');
const {
  DEFAULT_HOUSE_COUNCIL_POSTS,
  DEFAULT_SCHOOL_COUNCIL_POSTS,
} = require('../constants/councilMetadata');

const tours = makeRecordCrud('ActivityTour', ['title', 'destination', 'startDate', 'endDate', 'classes', 'description', 'students', 'feedback']);
const sportsFacilities = makeRecordCrud('ActivitySportsFacility', [
  'name', 'facilityType', 'location', 'capacity', 'color', 'description',
]);
const sports = makeRecordCrud('ActivitySportsMeet', [
  'eventId', 'title', 'year', 'venue', 'facilityId', 'facilityName', 'startDate', 'endDate', 'events', 'results',
]);
const functions = makeRecordCrud('ActivityFunction', ['title', 'functionType', 'date', 'venue', 'incharge', 'plan', 'outcome']);
const events = makeRecordCrud('ActivityEvent', [
  'title', 'date', 'monthKey', 'activityType', 'scopeType', 'houseId', 'houseName', 'clubId', 'clubName',
  'venue', 'incharge', 'description', 'status', 'criteriaId', 'criteriaTitle',
]);
const criteria = makeRecordCrud('ActivityCriteria', [
  'title', 'activityType', 'maxMarks', 'criteria', 'notes',
]);
const points = makeRecordCrud('ActivityPoints', [
  'title', 'date', 'eventId', 'houseId', 'houseName', 'houseColor', 'points', 'category', 'notes',
]);
const certificates = makeRecordCrud('ActivityCertificate', [
  'title', 'eventId', 'eventTitle', 'eventDate', 'houseId', 'houseName', 'studentId',
  'participantName', 'className', 'section', 'role', 'issuedOn', 'status',
]);

const MAX_CERTIFICATES_PER_PDF = 200;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const certificateDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : String(value || '');
};

/** Certificates as a PDF, one landscape A4 page each, in the order asked (the phone app prints these). */
certificates.pdf = async (req, res) => {
  try {
    const CertificateModel = req.models?.ActivityCertificate;
    if (!CertificateModel) {
      return res.status(500).json({ success: false, message: 'ActivityCertificate is not available.' });
    }
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(String))] : [];
    if (!ids.length) return res.status(400).json({ success: false, message: 'Choose at least one certificate.' });
    if (ids.length > MAX_CERTIFICATES_PER_PDF) {
      const message = `Print at most ${MAX_CERTIFICATES_PER_PDF} certificates at a time.`;
      return res.status(400).json({ success: false, message });
    }
    if (ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))) {
      return res.status(400).json({ success: false, message: 'A certificate id is not valid.' });
    }

    const rows = await CertificateModel.find({ _id: { $in: ids }, isActive: { $ne: false } }).lean();
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    const found = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!found.length) return res.status(404).json({ success: false, message: 'Those certificates were not found.' });

    const profile = req.models.SchoolProfile ? await req.models.SchoolProfile.findOne({}).lean() : null;
    const pdf = await pdfGenerator.generatePDF('actvt-certificate', {
      school: { name: profile?.schoolName || 'School', logoUrl: profile?.logoUrl || '' },
      certificates: found.map((row) => ({
        title: row.title || 'Certificate',
        participantName: row.participantName || '',
        classLabel: [row.className, row.section].filter(Boolean).join('-'),
        role: row.role || 'Participant',
        eventTitle: row.eventTitle || '',
        houseName: row.houseName || '',
        issuedOn: certificateDay(row.issuedOn)
      }))
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="certificates.pdf"');
    return res.status(200).send(pdf);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'The certificates could not be made.' });
  }
};

const ranking = {
  summary: async (req, res) => {
    try {
      const PointsModel = req.models?.ActivityPoints;
      const HouseModel = req.models?.ActivityHouse;
      if (!PointsModel) {
        return res.status(500).json({ success: false, message: 'ActivityPoints is not available.' });
      }

      const [pointRows, houses] = await Promise.all([
        PointsModel.find({ isActive: { $ne: false } }).sort({ date: -1, createdAt: -1 }).lean(),
        HouseModel
          ? HouseModel.find({ isActive: { $ne: false } }).select('name color logo').sort({ name: 1 }).lean()
          : Promise.resolve([]),
      ]);

      const byHouse = new Map();
      houses.forEach((house) => {
        byHouse.set(String(house._id), {
          houseId: String(house._id),
          houseName: house.name || 'Untitled house',
          houseColor: house.color || '',
          logo: house.logo || '',
          totalPoints: 0,
          entries: 0,
        });
      });

      pointRows.forEach((row) => {
        const houseId = String(row.houseId || '').trim() || `name:${String(row.houseName || '').trim().toLowerCase()}`;
        if (!byHouse.has(houseId)) {
          byHouse.set(houseId, {
            houseId,
            houseName: row.houseName || 'Unknown house',
            houseColor: row.houseColor || '',
            logo: '',
            totalPoints: 0,
            entries: 0,
          });
        }
        const bucket = byHouse.get(houseId);
        bucket.totalPoints += Number(row.points) || 0;
        bucket.entries += 1;
        if (!bucket.houseColor && row.houseColor) bucket.houseColor = row.houseColor;
        if (!bucket.houseName && row.houseName) bucket.houseName = row.houseName;
      });

      const standings = Array.from(byHouse.values())
        .sort((a, b) => b.totalPoints - a.totalPoints || a.houseName.localeCompare(b.houseName))
        .map((item, index) => ({ ...item, rank: index + 1 }));

      return res.json({
        success: true,
        data: {
          standings,
          recent: pointRows.slice(0, 40),
          totalEntries: pointRows.length,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load house ranking.', error: error.message });
    }
  },
};

const CLUB_FIELDS = [
  'name',
  'logo',
  'logoPublicId',
  'tagline',
  'motto',
  'color',
  'incharge',
  'meetingDay',
  'description',
  'members',
  'activities',
];

const HOUSE_FIELDS = ['name', 'logo', 'logoPublicId', 'flag', 'flagPublicId', 'tagline', 'motto', 'color', 'teachers', 'councilMembers'];

const pickClubPayload = (body = {}) => {
  const payload = {};
  CLUB_FIELDS.forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  payload.isActive = body.isActive !== false;
  ['name', 'tagline', 'motto', 'color', 'incharge', 'meetingDay', 'description', 'members', 'activities'].forEach((field) => {
    if (typeof payload[field] === 'string') payload[field] = payload[field].trim();
  });
  return payload;
};

const pickHousePayload = (body = {}) => {
  const payload = {};
  HOUSE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  payload.isActive = body.isActive !== false;
  if (typeof payload.name === 'string') payload.name = payload.name.trim();
  if (typeof payload.tagline === 'string') payload.tagline = payload.tagline.trim();
  if (typeof payload.motto === 'string') payload.motto = payload.motto.trim();
  if (typeof payload.color === 'string') payload.color = payload.color.trim();

  if (typeof payload.teachers === 'string') {
    try { payload.teachers = JSON.parse(payload.teachers); } catch (_error) { payload.teachers = []; }
  }
  if (typeof payload.councilMembers === 'string') {
    try { payload.councilMembers = JSON.parse(payload.councilMembers); } catch (_error) { payload.councilMembers = []; }
  }
  if (Array.isArray(payload.teachers)) {
    payload.teachers = payload.teachers
      .map((item) => ({
        name: String(item?.name || '').trim(),
        role: String(item?.role || 'House Teacher').trim() || 'House Teacher',
        phone: String(item?.phone || '').trim(),
        email: String(item?.email || '').trim(),
        teacherId: item?.teacherId || null,
      }))
      .filter((item) => item.name);
  }
  if (Array.isArray(payload.councilMembers)) {
    payload.councilMembers = payload.councilMembers
      .map((item) => ({
        name: String(item?.name || '').trim(),
        role: String(item?.role || 'Member').trim() || 'Member',
        className: String(item?.className || '').trim(),
        section: String(item?.section || '').trim(),
        phone: String(item?.phone || '').trim(),
        studentId: item?.studentId || null,
      }))
      .filter((item) => item.name);
  }

  return payload;
};

const uploadActvtImageIfPresent = async (req, fieldName, folder, existingPublicId = '') => {
  const file = req.files?.[fieldName];
  if (!file) return null;

  const fileInput = file.tempFilePath || file.data;
  const uploadResult = await uploadToCloudinary(fileInput, folder);

  if (existingPublicId) {
    try {
      await deleteFromCloudinary(existingPublicId);
    } catch (_error) {
      // Best-effort cleanup of previous image.
    }
  }

  return {
    url: uploadResult.url,
    publicId: uploadResult.publicId,
  };
};

const parseMemberLines = (members = '') =>
  String(members || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const clubs = {
  list: async (req, res) => {
    try {
      const Model = req.models?.ActivityClub;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityClub is not available.' });
      const records = await Model.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
      return res.json({ success: true, data: records });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load clubs.', error: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const Model = req.models?.ActivityClub;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityClub is not available.' });

      const payload = pickClubPayload(req.body);
      if (!payload.name) {
        return res.status(400).json({ success: false, message: 'Club name is required.' });
      }

      const logoUpload = await uploadActvtImageIfPresent(req, 'logo', 'actvt/clubs/logos');
      if (logoUpload) {
        payload.logo = logoUpload.url;
        payload.logoPublicId = logoUpload.publicId;
      }

      const record = await Model.create(payload);
      return res.status(201).json({ success: true, data: record, message: 'Club saved.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to save club.', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const Model = req.models?.ActivityClub;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityClub is not available.' });

      const existing = await Model.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Club not found.' });

      const payload = pickClubPayload(req.body);
      if (payload.name !== undefined && !payload.name) {
        return res.status(400).json({ success: false, message: 'Club name is required.' });
      }

      const logoUpload = await uploadActvtImageIfPresent(
        req,
        'logo',
        'actvt/clubs/logos',
        existing.logoPublicId || extractPublicId(existing.logo) || ''
      );
      if (logoUpload) {
        payload.logo = logoUpload.url;
        payload.logoPublicId = logoUpload.publicId;
      } else if (String(req.body?.clearLogo || '').toLowerCase() === 'true') {
        const publicId = existing.logoPublicId || extractPublicId(existing.logo);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId);
          } catch (_error) {
            // Best-effort logo cleanup.
          }
        }
        payload.logo = '';
        payload.logoPublicId = '';
      }

      const record = await Model.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
      return res.json({ success: true, data: record, message: 'Club updated.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to update club.', error: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const Model = req.models?.ActivityClub;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityClub is not available.' });

      const existing = await Model.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Club not found.' });

      const publicId = existing.logoPublicId || extractPublicId(existing.logo);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId);
        } catch (_error) {
          // Best-effort logo cleanup.
        }
      }

      await Model.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
      return res.json({ success: true, message: 'Club removed.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to remove club.', error: error.message });
    }
  },

  details: async (req, res) => {
    try {
      const Model = req.models?.ActivityClub;
      const StudentModel = req.models?.Student;
      const CertificateModel = req.models?.ActivityCertificate;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityClub is not available.' });

      const club = await Model.findOne({
        _id: req.params.id,
        isActive: { $ne: false },
      }).lean();

      if (!club) {
        return res.status(404).json({ success: false, message: 'Club not found.' });
      }

      const memberLines = parseMemberLines(club.members);
      let students = [];

      if (StudentModel && memberLines.length > 0) {
        const memberNameKeys = [...new Set(memberLines.map((line) => normalizeName(line)).filter(Boolean))];
        const studentFilter = { isActive: { $ne: false } };
        if (req.academicSession) studentFilter.academicSession = req.academicSession;

        const studentRows = await StudentModel.find(studentFilter)
          .select('rollNumber classRollNo name class section gender phone fatherName motherName')
          .sort({ class: 1, section: 1, name: 1, classRollNo: 1 })
          .lean();

        students = studentRows.filter((student) => memberNameKeys.includes(normalizeName(student.name)));

        if (CertificateModel && students.length > 0) {
          const participationByStudentId = new Map();
          const studentById = new Map(students.map((student) => [String(student._id), student]));
          const studentsByName = new Map();

          students.forEach((student) => {
            const key = normalizeName(student.name);
            if (!key) return;
            if (!studentsByName.has(key)) studentsByName.set(key, []);
            studentsByName.get(key).push(student);
          });

          const certificates = await CertificateModel.find({ isActive: { $ne: false } })
            .select('studentId participantName className section')
            .lean();

          const resolveStudentIds = (cert) => {
            const byId = cert.studentId ? studentById.get(String(cert.studentId)) : null;
            if (byId) return [String(byId._id)];

            const nameKey = normalizeName(cert.participantName);
            const matches = studentsByName.get(nameKey) || [];
            const narrowedMatches = matches.filter((student) => {
              const classOk = !cert.className || !student.class
                || String(cert.className).trim().toLowerCase() === String(student.class).trim().toLowerCase();
              const sectionOk = !cert.section || !student.section
                || String(cert.section).trim().toLowerCase() === String(student.section).trim().toLowerCase();
              return classOk && sectionOk;
            });
            if (narrowedMatches.length !== 1) return [];
            return [String(narrowedMatches[0]._id)];
          };

          certificates.forEach((cert) => {
            resolveStudentIds(cert).forEach((studentId) => {
              participationByStudentId.set(studentId, (participationByStudentId.get(studentId) || 0) + 1);
            });
          });

          students = students.map((student) => ({
            ...student,
            participationCount: participationByStudentId.get(String(student._id)) || 0,
          }));
        }
      }

      return res.json({
        success: true,
        data: {
          club,
          memberLines,
          students,
          stats: {
            membersCount: memberLines.length,
            hasIncharge: Boolean(String(club.incharge || '').trim()),
            hasMeetingDay: Boolean(String(club.meetingDay || '').trim()),
          },
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load club details.', error: error.message });
    }
  },
};

const emptyGenderSplit = () => ({ boys: 0, girls: 0 });

const bumpGenderSplit = (bucket, gender) => {
  const value = String(gender || '').trim();
  if (value === 'Boy') bucket.boys += 1;
  else if (value === 'Girl') bucket.girls += 1;
};

const isMedalRole = (role = '') => {
  const text = String(role || '').toLowerCase();
  return /(winner|gold|silver|bronze|1st|2nd|3rd|first|second|third|champion|medal|top)/i.test(text);
};

const houses = {
  list: async (req, res) => {
    try {
      const Model = req.models?.ActivityHouse;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityHouse is not available.' });
      const records = await Model.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
      return res.json({ success: true, data: records });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load houses.', error: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const Model = req.models?.ActivityHouse;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityHouse is not available.' });

      const payload = pickHousePayload(req.body);
      if (!payload.name) {
        return res.status(400).json({ success: false, message: 'House name is required.' });
      }

      const logoUpload = await uploadActvtImageIfPresent(req, 'logo', 'actvt/houses/logos');
      if (logoUpload) {
        payload.logo = logoUpload.url;
        payload.logoPublicId = logoUpload.publicId;
      }

      const flagUpload = await uploadActvtImageIfPresent(req, 'flag', 'actvt/houses/flags');
      if (flagUpload) {
        payload.flag = flagUpload.url;
        payload.flagPublicId = flagUpload.publicId;
      }

      const record = await Model.create(payload);
      try {
        await ensureHouseCouncilForHouse(req, record);
      } catch (_error) {
        // House is saved even if council seeding fails; backfill runs on council list.
      }
      return res.status(201).json({ success: true, data: record, message: 'House saved.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to save house.', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const Model = req.models?.ActivityHouse;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityHouse is not available.' });

      const existing = await Model.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'House not found.' });

      const payload = pickHousePayload(req.body);
      if (payload.name !== undefined && !payload.name) {
        return res.status(400).json({ success: false, message: 'House name is required.' });
      }

      const logoUpload = await uploadActvtImageIfPresent(
        req,
        'logo',
        'actvt/houses/logos',
        existing.logoPublicId || extractPublicId(existing.logo) || ''
      );
      if (logoUpload) {
        payload.logo = logoUpload.url;
        payload.logoPublicId = logoUpload.publicId;
      } else if (String(req.body?.clearLogo || '').toLowerCase() === 'true') {
        const publicId = existing.logoPublicId || extractPublicId(existing.logo);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId);
          } catch (_error) {
            // Best-effort logo cleanup.
          }
        }
        payload.logo = '';
        payload.logoPublicId = '';
      }

      const flagUpload = await uploadActvtImageIfPresent(
        req,
        'flag',
        'actvt/houses/flags',
        existing.flagPublicId || extractPublicId(existing.flag) || ''
      );
      if (flagUpload) {
        payload.flag = flagUpload.url;
        payload.flagPublicId = flagUpload.publicId;
      }

      const record = await Model.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
      try {
        await ensureHouseCouncilForHouse(req, record);
      } catch (_error) {
        // Keep house update successful even if council sync fails.
      }
      return res.json({ success: true, data: record, message: 'House updated.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to update house.', error: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const Model = req.models?.ActivityHouse;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityHouse is not available.' });

      const existing = await Model.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'House not found.' });

      const publicId = existing.logoPublicId || extractPublicId(existing.logo);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId);
        } catch (_error) {
          // Best-effort logo cleanup.
        }
      }

      const flagPublicId = existing.flagPublicId || extractPublicId(existing.flag);
      if (flagPublicId) {
        try {
          await deleteFromCloudinary(flagPublicId);
        } catch (_error) {
          // Best-effort flag cleanup.
        }
      }

      await Model.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
      try {
        await deactivateHouseCouncilForHouse(req, req.params.id);
      } catch (_error) {
        // House removal still succeeds if council cleanup fails.
      }
      return res.json({ success: true, message: 'House removed.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to remove house.', error: error.message });
    }
  },

  stats: async (req, res) => {
    try {
      const HouseModel = req.models?.ActivityHouse;
      const StudentModel = req.models?.Student;
      if (!HouseModel) {
        return res.status(500).json({ success: false, message: 'ActivityHouse is not available.' });
      }

      const houses = await HouseModel.find({ isActive: { $ne: false } })
        .select('_id name color logo')
        .sort({ name: 1 })
        .lean();

      const houseIdSet = new Set(houses.map((house) => String(house._id)));
      const byHouseMap = new Map(houses.map((house) => [String(house._id), {
        houseId: String(house._id),
        houseName: house.name,
        color: house.color || '',
        logo: house.logo || '',
        count: 0,
      }]));

      let totalStudents = 0;
      let assignedStudents = 0;
      let unassignedStudents = 0;
      const matrixMap = new Map();

      const sortClassSection = (left, right) => {
        const leftNum = Number.parseInt(String(left.className).match(/\d+/)?.[0] || '9999', 10);
        const rightNum = Number.parseInt(String(right.className).match(/\d+/)?.[0] || '9999', 10);
        if (leftNum !== rightNum) return leftNum - rightNum;
        const classCompare = String(left.className).localeCompare(String(right.className), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (classCompare !== 0) return classCompare;
        return String(left.section).localeCompare(String(right.section), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      };

      if (StudentModel) {
        const studentFilter = { isActive: { $ne: false } };
        if (req.academicSession) studentFilter.academicSession = req.academicSession;

        const students = await StudentModel.find(studentFilter)
          .select('class section house houseId gender')
          .lean();

        totalStudents = students.length;

        students.forEach((student) => {
          const className = String(student.class || '').trim() || 'Unspecified';
          const section = String(student.section || '').trim() || '-';
          const rowKey = `${className}::${section}`;
          if (!matrixMap.has(rowKey)) {
            matrixMap.set(rowKey, {
              className,
              section,
              houses: {},
              unassigned: emptyGenderSplit(),
              total: 0,
            });
          }
          const row = matrixMap.get(rowKey);
          row.total += 1;

          const houseId = student.houseId ? String(student.houseId) : '';
          const matchedHouseId = houseId && houseIdSet.has(houseId)
            ? houseId
            : (() => {
                const houseName = String(student.house || '').trim().toLowerCase();
                if (!houseName) return '';
                const matched = houses.find((house) => String(house.name || '').trim().toLowerCase() === houseName);
                return matched ? String(matched._id) : '';
              })();

          if (matchedHouseId && byHouseMap.has(matchedHouseId)) {
            assignedStudents += 1;
            byHouseMap.get(matchedHouseId).count += 1;
            if (!row.houses[matchedHouseId]) row.houses[matchedHouseId] = emptyGenderSplit();
            bumpGenderSplit(row.houses[matchedHouseId], student.gender);
          } else {
            unassignedStudents += 1;
            bumpGenderSplit(row.unassigned, student.gender);
          }
        });
      }

      return res.json({
        success: true,
        data: {
          totalStudents,
          assignedStudents,
          unassignedStudents,
          byHouse: Array.from(byHouseMap.values()),
          matrix: Array.from(matrixMap.values()).sort(sortClassSection),
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load house stats.', error: error.message });
    }
  },

  details: async (req, res) => {
    try {
      const HouseModel = req.models?.ActivityHouse;
      const StudentModel = req.models?.Student;
      if (!HouseModel) {
        return res.status(500).json({ success: false, message: 'ActivityHouse is not available.' });
      }

      const house = await HouseModel.findOne({
        _id: req.params.id,
        isActive: { $ne: false },
      }).lean();

      if (!house) {
        return res.status(404).json({ success: false, message: 'House not found.' });
      }

      let students = [];
      const CertificateModel = req.models?.ActivityCertificate;

      if (StudentModel) {
        const studentFilter = {
          isActive: { $ne: false },
          $or: [
            { houseId: house._id },
            ...(house.name
              ? [{ house: new RegExp(`^${String(house.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }]
              : []),
          ],
        };
        if (req.academicSession) studentFilter.academicSession = req.academicSession;

        students = await StudentModel.find(studentFilter)
          .select('rollNumber classRollNo name class section gender phone house houseId fatherName motherName')
          .sort({ class: 1, section: 1, name: 1, classRollNo: 1 })
          .lean();
      }

      const participationByStudentId = new Map();
      const medalsByStudentId = new Map();
      const highlightByStudentId = new Map();
      if (CertificateModel && students.length > 0) {
        const certFilter = {
          isActive: { $ne: false },
          $or: [
            { houseId: String(house._id) },
            ...(house.name
              ? [{ houseName: new RegExp(`^${escapeRegex(house.name)}$`, 'i') }]
              : []),
          ],
        };
        const certificates = await CertificateModel.find(certFilter)
          .select('studentId participantName className section role title eventTitle issuedOn')
          .sort({ issuedOn: -1, createdAt: -1 })
          .lean();

        const studentById = new Map(students.map((student) => [String(student._id), student]));
        const studentsByName = new Map();
        students.forEach((student) => {
          const key = normalizeName(student.name);
          if (!key) return;
          if (!studentsByName.has(key)) studentsByName.set(key, []);
          studentsByName.get(key).push(student);
        });

        const resolveStudentIds = (cert) => {
          const byId = cert.studentId ? studentById.get(String(cert.studentId)) : null;
          if (byId) return [String(byId._id)];

          const nameKey = normalizeName(cert.participantName);
          const matches = studentsByName.get(nameKey) || [];
          const narrowedMatches = matches
            .filter((student) => {
              const classOk = !cert.className || !student.class
                || String(cert.className).trim().toLowerCase() === String(student.class).trim().toLowerCase();
              const sectionOk = !cert.section || !student.section
                || String(cert.section).trim().toLowerCase() === String(student.section).trim().toLowerCase();
              return classOk && sectionOk;
            });
          if (narrowedMatches.length !== 1) return [];
          return [String(narrowedMatches[0]._id)];
        };

        certificates.forEach((cert) => {
          const ids = resolveStudentIds(cert);
          const isMedal = isMedalRole(cert.role);
          ids.forEach((id) => {
            participationByStudentId.set(id, (participationByStudentId.get(id) || 0) + 1);
            if (isMedal) {
              medalsByStudentId.set(id, (medalsByStudentId.get(id) || 0) + 1);
              if (!highlightByStudentId.has(id)) {
                highlightByStudentId.set(id, {
                  role: cert.role || 'Winner',
                  title: cert.title || '',
                  eventTitle: cert.eventTitle || '',
                  issuedOn: cert.issuedOn || '',
                });
              }
            }
          });
        });
      }

      students = students.map((student) => ({
        ...student,
        participationCount: participationByStudentId.get(String(student._id)) || 0,
        medalCount: medalsByStudentId.get(String(student._id)) || 0,
      }));

      const wallOfFame = [...students]
        .filter((student) => (student.medalCount || 0) > 0 || (student.participationCount || 0) > 0)
        .sort((left, right) => {
          if ((right.medalCount || 0) !== (left.medalCount || 0)) {
            return (right.medalCount || 0) - (left.medalCount || 0);
          }
          if ((right.participationCount || 0) !== (left.participationCount || 0)) {
            return (right.participationCount || 0) - (left.participationCount || 0);
          }
          return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
        })
        .slice(0, 8)
        .map((student) => ({
          _id: student._id,
          name: student.name,
          class: student.class || '',
          section: student.section || '',
          participationCount: student.participationCount || 0,
          medalCount: student.medalCount || 0,
          highlight: highlightByStudentId.get(String(student._id)) || null,
        }));

      const byClassSectionMap = new Map();
      const genderCounts = { Boy: 0, Girl: 0, Other: 0, Unspecified: 0 };

      students.forEach((student) => {
        const className = String(student.class || '').trim() || 'Unspecified';
        const section = String(student.section || '').trim() || '-';
        const key = `${className}::${section}`;
        byClassSectionMap.set(key, (byClassSectionMap.get(key) || 0) + 1);

        const gender = String(student.gender || 'Unspecified');
        if (genderCounts[gender] !== undefined) genderCounts[gender] += 1;
        else genderCounts.Unspecified += 1;
      });

      const byClassSection = Array.from(byClassSectionMap.entries())
        .map(([key, count]) => {
          const [className, section] = key.split('::');
          return { className, section, count };
        })
        .sort((left, right) => {
          const leftNum = Number.parseInt(String(left.className).match(/\d+/)?.[0] || '9999', 10);
          const rightNum = Number.parseInt(String(right.className).match(/\d+/)?.[0] || '9999', 10);
          if (leftNum !== rightNum) return leftNum - rightNum;
          return String(left.section).localeCompare(String(right.section), undefined, { sensitivity: 'base' });
        });

      return res.json({
        success: true,
        data: {
          house,
          students,
          wallOfFame,
          stats: {
            totalStudents: students.length,
            teachersCount: Array.isArray(house.teachers) ? house.teachers.length : 0,
            councilCount: Array.isArray(house.councilMembers) ? house.councilMembers.length : 0,
            genderCounts,
            byClassSection,
          },
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load house details.', error: error.message });
    }
  },
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeName = (value = '') => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const studentProfiles = {
  profile: async (req, res) => {
    try {
      const StudentModel = req.models?.Student;
      const HouseModel = req.models?.ActivityHouse;
      const CertificateModel = req.models?.ActivityCertificate;
      const EventModel = req.models?.ActivityEvent;
      const PointsModel = req.models?.ActivityPoints;

      if (!StudentModel) {
        return res.status(500).json({ success: false, message: 'Student model is not available.' });
      }

      const studentFilter = { _id: req.params.id, isActive: { $ne: false } };
      if (req.academicSession) studentFilter.academicSession = req.academicSession;

      const student = await StudentModel.findOne(studentFilter)
        .select('rollNumber classRollNo name class section gender phone fatherName motherName house houseId profileImage')
        .lean();

      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      let house = null;
      if (HouseModel) {
        if (student.houseId) {
          house = await HouseModel.findOne({ _id: student.houseId, isActive: { $ne: false } })
            .select('_id name color logo tagline motto')
            .lean();
        }
        if (!house && student.house) {
          house = await HouseModel.findOne({
            isActive: { $ne: false },
            name: new RegExp(`^${escapeRegex(student.house)}$`, 'i'),
          })
            .select('_id name color logo tagline motto')
            .lean();
        }
      }

      const studentName = normalizeName(student.name);
      let certificates = [];
      if (CertificateModel && studentName) {
        const certFilter = { isActive: { $ne: false } };
        const orClauses = [
          { studentId: String(student._id) },
          { participantName: new RegExp(`^${escapeRegex(student.name.trim())}$`, 'i') },
        ];
        certFilter.$or = orClauses;
        certificates = await CertificateModel.find(certFilter).sort({ issuedOn: -1, createdAt: -1 }).lean();

        // Prefer exact class/section matches when available, but keep name matches.
        certificates = certificates.filter((item) => {
          if (String(item.studentId || '') === String(student._id)) return true;
          const classOk = !item.className || !student.class
            || String(item.className).trim().toLowerCase() === String(student.class).trim().toLowerCase();
          const sectionOk = !item.section || !student.section
            || String(item.section).trim().toLowerCase() === String(student.section).trim().toLowerCase();
          return classOk && sectionOk;
        });
      }

      const eventIds = [...new Set(certificates.map((item) => String(item.eventId || '')).filter(Boolean))]
        .filter((value) => /^[a-f\d]{24}$/i.test(value));
      let activities = [];
      if (EventModel) {
        if (eventIds.length > 0) {
          activities = await EventModel.find({
            isActive: { $ne: false },
            _id: { $in: eventIds },
          }).sort({ date: -1 }).lean();
        }

        // Include completed house activities as context when student belongs to that house.
        if (house?._id) {
          const houseActivities = await EventModel.find({
            isActive: { $ne: false },
            status: { $in: ['completed', 'planned'] },
            $or: [
              { houseId: String(house._id) },
              { houseName: new RegExp(`^${escapeRegex(house.name || '')}$`, 'i') },
            ],
          })
            .sort({ date: -1 })
            .limit(40)
            .lean();

          const existing = new Set(activities.map((item) => String(item._id)));
          houseActivities.forEach((item) => {
            if (!existing.has(String(item._id))) activities.push(item);
          });
        }
      }

      // Enrich activities with whether this student has a certificate for them.
      const certEventSet = new Set(eventIds);
      const activityRows = activities
        .map((item) => ({
          ...item,
          participated: certEventSet.has(String(item._id)),
          certificateCount: certificates.filter((cert) => String(cert.eventId || '') === String(item._id)).length,
        }))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      const medals = certificates.filter((item) => isMedalRole(item.role));
      const types = new Set(
        certificates
          .map((item) => String(item.eventTitle || item.title || 'General').trim())
          .filter(Boolean)
      );
      const roles = new Set(certificates.map((item) => String(item.role || 'Participant').trim()).filter(Boolean));

      const participationCount = certificates.length;
      const medalCount = medals.length;
      const completedHouseEvents = activityRows.filter((item) => item.status === 'completed').length;
      const participatedEvents = activityRows.filter((item) => item.participated).length;

      // 0–100 score blends volume, medals, and breadth.
      const activityScore = Math.min(
        100,
        Math.round(
          participationCount * 12
          + medalCount * 18
          + participatedEvents * 8
          + Math.min(types.size, 6) * 5
        )
      );

      // Diversity: unique activity labels vs participation volume.
      const diversityScore = participationCount === 0
        ? 0
        : Math.min(100, Math.round((types.size / Math.max(participationCount, 1)) * 100 + Math.min(types.size, 8) * 6));

      // Activeness: share of house events touched + certificate volume.
      const activenessScore = Math.min(
        100,
        Math.round(
          (completedHouseEvents > 0 ? (participatedEvents / completedHouseEvents) * 70 : 0)
          + Math.min(participationCount, 8) * 4
        )
      );

      let housePointsContribution = 0;
      if (PointsModel && house?._id) {
        const pointRows = await PointsModel.find({
          isActive: { $ne: false },
          houseId: String(house._id),
        }).lean();
        // Approximate student contribution via matching certificate event titles / notes is weak;
        // expose house total for context instead of inventing attribution.
        housePointsContribution = pointRows.reduce((sum, row) => sum + (Number(row.points) || 0), 0);
      }

      return res.json({
        success: true,
        data: {
          student,
          house,
          certificates,
          medals,
          activities: activityRows,
          metrics: {
            activityScore,
            diversityScore,
            activenessScore,
            participationCount,
            medalCount,
            uniqueActivities: types.size,
            uniqueRoles: roles.size,
            housePointsTotal: housePointsContribution,
          },
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load student activity profile.',
        error: error.message,
      });
    }
  },
};

const seedCouncilPosts = async (PostModel, council, titles = []) => {
  if (!PostModel || !council || !titles.length) return;
  await PostModel.insertMany(
    titles.map((title) => ({
      councilId: String(council._id),
      councilName: council.name || '',
      councilType: council.councilType || 'school',
      houseId: council.houseId || '',
      houseName: council.houseName || '',
      title: String(title).trim(),
      seats: 1,
      registrationStatus: 'closed',
    })).filter((row) => row.title)
  );
};

const ensureSchoolCouncil = async (req) => {
  const CouncilModel = req.models?.ActivityCouncil;
  if (!CouncilModel) return null;

  const existing = await CouncilModel.findOne({
    isActive: { $ne: false },
    councilType: 'school',
  }).sort({ createdAt: 1 });

  if (existing) return existing;

  return CouncilModel.create({
    name: 'School Council',
    councilType: 'school',
    houseId: '',
    houseName: '',
    status: 'active',
  });
};

const getSharedHouseCouncilPostTitles = async (req) => {
  const CouncilModel = req.models?.ActivityCouncil;
  const PostModel = req.models?.ActivityCouncilPost;
  if (!CouncilModel || !PostModel) return [];

  const houseCouncils = await CouncilModel.find({
    isActive: { $ne: false },
    councilType: 'house',
  }).select('_id').lean();

  if (!houseCouncils.length) return [];

  const councilIds = houseCouncils.map((row) => String(row._id));
  const posts = await PostModel.find({
    isActive: { $ne: false },
    councilId: { $in: councilIds },
  }).select('title').lean();

  const seen = new Set();
  const titles = [];
  posts.forEach((post) => {
    const title = String(post.title || '').trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) return;
    seen.add(key);
    titles.push(title);
  });
  return titles;
};

const ensureHouseCouncilForHouse = async (req, house) => {
  const CouncilModel = req.models?.ActivityCouncil;
  const PostModel = req.models?.ActivityCouncilPost;
  if (!CouncilModel || !house?._id) return null;

  const houseId = String(house._id);
  const houseName = String(house.name || '').trim();
  const existing = await CouncilModel.findOne({
    isActive: { $ne: false },
    councilType: 'house',
    houseId,
  });

  if (existing) {
    const updates = {};
    if (houseName && existing.houseName !== houseName) {
      updates.houseName = houseName;
      const previousName = String(existing.name || '');
      if (!previousName || previousName === `${existing.houseName || 'House'} Council`) {
        updates.name = `${houseName} Council`;
      }
    }
    if (Object.keys(updates).length > 0) {
      Object.assign(existing, updates);
      await existing.save();
      if (PostModel) {
        await PostModel.updateMany(
          { councilId: String(existing._id), isActive: { $ne: false } },
          {
            houseName: existing.houseName || houseName,
            ...(updates.name ? { councilName: updates.name } : {}),
          }
        );
      }
    }

    // Keep shared house posts in sync when a house council already exists.
    if (PostModel) {
      const sharedTitles = await getSharedHouseCouncilPostTitles(req);
      const currentPosts = await PostModel.find({
        isActive: { $ne: false },
        councilId: String(existing._id),
      }).select('title').lean();
      const currentKeys = new Set(currentPosts.map((row) => String(row.title || '').trim().toLowerCase()).filter(Boolean));
      const missing = sharedTitles.filter((title) => !currentKeys.has(title.toLowerCase()));
      if (missing.length) await seedCouncilPosts(PostModel, existing, missing);
    }

    return existing;
  }

  const council = await CouncilModel.create({
    name: `${houseName || 'House'} Council`,
    councilType: 'house',
    houseId,
    houseName,
    status: 'active',
  });

  const sharedTitles = await getSharedHouseCouncilPostTitles(req);
  await seedCouncilPosts(PostModel, council, sharedTitles);
  return council;
};

const ensureHouseCouncilsForAllHouses = async (req) => {
  const HouseModel = req.models?.ActivityHouse;
  const CouncilModel = req.models?.ActivityCouncil;
  if (!HouseModel || !CouncilModel) return;

  const houses = await HouseModel.find({ isActive: { $ne: false } }).select('_id name').lean();
  for (const house of houses) {
    await ensureHouseCouncilForHouse(req, house);
  }
};

const deactivateHouseCouncilForHouse = async (req, houseId) => {
  const CouncilModel = req.models?.ActivityCouncil;
  const PostModel = req.models?.ActivityCouncilPost;
  const RegistrationModel = req.models?.ActivityCouncilRegistration;
  if (!CouncilModel || !houseId) return;

  const councils = await CouncilModel.find({
    councilType: 'house',
    houseId: String(houseId),
    isActive: { $ne: false },
  });

  for (const council of councils) {
    await CouncilModel.findByIdAndUpdate(council._id, { isActive: false });
    if (PostModel) {
      await PostModel.updateMany({ councilId: String(council._id) }, { isActive: false });
    }
    if (RegistrationModel) {
      await RegistrationModel.updateMany({ councilId: String(council._id) }, { isActive: false });
    }
  }
};

const normalizePreferredGender = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (['boy', 'male', 'm'].includes(lowered)) return 'Boy';
  if (['girl', 'female', 'f'].includes(lowered)) return 'Girl';
  if (['other'].includes(lowered)) return 'Other';
  if (['unspecified', 'any', 'all', 'na', 'n/a'].includes(lowered)) return '';
  if (['Boy', 'Girl', 'Other', 'Unspecified'].includes(raw)) {
    return raw === 'Unspecified' ? '' : raw;
  }
  return raw;
};

const normalizePreferredClasses = (value) => {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  const seen = new Set();
  const classes = [];
  list.forEach((item) => {
    const name = String(item || '').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    classes.push(name);
  });
  return classes;
};

const studentMatchesPostEligibility = (post, { gender = '', className = '' } = {}) => {
  const preferredGender = normalizePreferredGender(post?.preferredGender);
  const preferredClasses = normalizePreferredClasses(post?.preferredClasses);
  const studentGender = normalizePreferredGender(gender);
  const studentClass = String(className || '').trim();

  if (preferredGender && studentGender && preferredGender !== studentGender) {
    return { ok: false, message: `Only ${preferredGender} students can register for "${post.title}".` };
  }
  if (preferredGender && !studentGender) {
    return { ok: false, message: `Student gender is required for "${post.title}".` };
  }
  if (preferredClasses.length) {
    const allowed = new Set(preferredClasses.map((item) => item.toLowerCase()));
    if (!studentClass || !allowed.has(studentClass.toLowerCase())) {
      return {
        ok: false,
        message: `Only students from class ${preferredClasses.join(', ')} can register for "${post.title}".`,
      };
    }
  }
  return { ok: true };
};

const createPostOnCouncil = async (
  PostModel,
  council,
  { title, description = '', seats = 1, preferredGender = '', preferredClasses = [] } = {}
) => {
  const trimmed = String(title || '').trim();
  if (!PostModel || !council || !trimmed) return null;

  const existing = await PostModel.findOne({
    isActive: { $ne: false },
    councilId: String(council._id),
    title: trimmed,
  });
  if (existing) return existing;

  return PostModel.create({
    councilId: String(council._id),
    councilName: council.name || '',
    councilType: council.councilType || 'school',
    houseId: council.houseId || '',
    houseName: council.houseName || '',
    title: trimmed,
    description: String(description || '').trim(),
    seats: Math.max(1, Number(seats) || 1),
    registrationStatus: 'closed',
    preferredGender: normalizePreferredGender(preferredGender),
    preferredClasses: normalizePreferredClasses(preferredClasses),
  });
};

const syncHouseCouncilMembers = async (req, council) => {
  if (!council || council.councilType !== 'house' || !council.houseId) return;
  const HouseModel = req.models?.ActivityHouse;
  const PostModel = req.models?.ActivityCouncilPost;
  const RegistrationModel = req.models?.ActivityCouncilRegistration;
  if (!HouseModel || !PostModel || !RegistrationModel) return;

  const posts = await PostModel.find({
    isActive: { $ne: false },
    councilId: String(council._id),
  }).lean();
  const postTitleById = new Map(posts.map((post) => [String(post._id), post.title || 'Member']));

  const accepted = await RegistrationModel.find({
    isActive: { $ne: false },
    councilId: String(council._id),
    status: 'accepted',
  }).lean();

  const councilMembers = accepted.map((row) => ({
    name: row.studentName,
    role: postTitleById.get(String(row.postId)) || row.postTitle || 'Member',
    className: row.className || '',
    section: row.section || '',
    phone: row.phone || '',
    studentId: row.studentId || null,
  }));

  await HouseModel.findByIdAndUpdate(council.houseId, { councilMembers }, { new: true });
};

const councils = {
  list: async (req, res) => {
    try {
      const Model = req.models?.ActivityCouncil;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityCouncil is not available.' });
      try {
        await ensureSchoolCouncil(req);
        await ensureHouseCouncilsForAllHouses(req);
      } catch (_error) {
        // Listing still works if backfill fails.
      }
      const records = await Model.find({ isActive: { $ne: false } }).sort({ councilType: 1, name: 1 }).lean();
      return res.json({ success: true, data: records });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load councils.', error: error.message });
    }
  },

  board: async (req, res) => {
    try {
      const CouncilModel = req.models?.ActivityCouncil;
      const PostModel = req.models?.ActivityCouncilPost;
      const RegistrationModel = req.models?.ActivityCouncilRegistration;
      const HouseModel = req.models?.ActivityHouse;
      if (!CouncilModel) {
        return res.status(500).json({ success: false, message: 'ActivityCouncil is not available.' });
      }

      try {
        await ensureSchoolCouncil(req);
        await ensureHouseCouncilsForAllHouses(req);
      } catch (_error) {
        // Continue with whatever councils exist.
      }

      const [councilsList, houses] = await Promise.all([
        CouncilModel.find({ isActive: { $ne: false } }).sort({ councilType: 1, name: 1 }).lean(),
        HouseModel
          ? HouseModel.find({ isActive: { $ne: false } }).select('_id name color').sort({ name: 1 }).lean()
          : Promise.resolve([]),
      ]);

      const schoolCouncil = councilsList.find((row) => row.councilType !== 'house') || null;
      const houseCouncils = councilsList.filter((row) => row.councilType === 'house');
      const councilIds = councilsList.map((row) => String(row._id));

      const [posts, registrations] = await Promise.all([
        PostModel && councilIds.length
          ? PostModel.find({ isActive: { $ne: false }, councilId: { $in: councilIds } }).sort({ title: 1 }).lean()
          : Promise.resolve([]),
        RegistrationModel && councilIds.length
          ? RegistrationModel.find({ isActive: { $ne: false }, councilId: { $in: councilIds } }).sort({ createdAt: -1 }).lean()
          : Promise.resolve([]),
      ]);

      const attachCounts = (post) => {
        const related = registrations.filter((row) => String(row.postId) === String(post._id));
        return {
          ...post,
          registrationCount: related.length,
          pendingCount: related.filter((row) => row.status === 'pending').length,
          acceptedCount: related.filter((row) => row.status === 'accepted').length,
        };
      };

      const schoolPosts = schoolCouncil
        ? posts.filter((post) => String(post.councilId) === String(schoolCouncil._id)).map(attachCounts)
        : [];

      const houseCouncilsWithPosts = houseCouncils.map((council) => ({
        ...council,
        posts: posts.filter((post) => String(post.councilId) === String(council._id)).map(attachCounts),
      }));

      // Shared house post titles (union), for the house section header list.
      const sharedHousePostTitles = [];
      const seen = new Set();
      houseCouncilsWithPosts.forEach((council) => {
        (council.posts || []).forEach((post) => {
          const title = String(post.title || '').trim();
          const key = title.toLowerCase();
          if (!title || seen.has(key)) return;
          seen.add(key);
          sharedHousePostTitles.push(title);
        });
      });

      return res.json({
        success: true,
        data: {
          houses,
          schoolCouncil,
          schoolPosts,
          houseCouncils: houseCouncilsWithPosts,
          sharedHousePostTitles,
          registrations,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load council board.', error: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const Model = req.models?.ActivityCouncil;
      const PostModel = req.models?.ActivityCouncilPost;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityCouncil is not available.' });

      const councilType = String(req.body?.councilType || 'school').trim() === 'house' ? 'house' : 'school';
      const houseId = String(req.body?.houseId || '').trim();
      const houseName = String(req.body?.houseName || '').trim();
      if (councilType === 'house' && !houseId) {
        return res.status(400).json({ success: false, message: 'House is required for a house council.' });
      }

      // One active house council per house — return existing instead of duplicating.
      if (councilType === 'house') {
        const existing = await Model.findOne({
          isActive: { $ne: false },
          councilType: 'house',
          houseId,
        });
        if (existing) {
          return res.status(200).json({
            success: true,
            data: existing,
            message: 'House council already exists for this house.',
          });
        }
      }

      const name = String(req.body?.name || '').trim()
        || (councilType === 'house' ? `${houseName || 'House'} Council` : 'School Council');

      const council = await Model.create({
        name,
        councilType,
        houseId: councilType === 'house' ? houseId : '',
        houseName: councilType === 'house' ? houseName : '',
        academicYear: String(req.body?.academicYear || '').trim(),
        description: String(req.body?.description || '').trim(),
        status: String(req.body?.status || 'active').trim() || 'active',
      });

      const seedPosts = Array.isArray(req.body?.seedPosts) ? req.body.seedPosts : [];
      // School / house councils are created empty by default; only seed when explicitly requested.
      if (seedPosts.length > 0) {
        await seedCouncilPosts(PostModel, council, seedPosts);
      }

      return res.status(201).json({ success: true, data: council, message: 'Council created.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to create council.', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const Model = req.models?.ActivityCouncil;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityCouncil is not available.' });
      const payload = {
        name: req.body?.name,
        academicYear: req.body?.academicYear,
        description: req.body?.description,
        status: req.body?.status,
      };
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) delete payload[key];
      });
      const council = await Model.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
      if (!council) return res.status(404).json({ success: false, message: 'Council not found.' });
      return res.json({ success: true, data: council, message: 'Council updated.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to update council.', error: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const Model = req.models?.ActivityCouncil;
      const PostModel = req.models?.ActivityCouncilPost;
      const RegistrationModel = req.models?.ActivityCouncilRegistration;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityCouncil is not available.' });

      const council = await Model.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
      if (!council) return res.status(404).json({ success: false, message: 'Council not found.' });

      if (PostModel) {
        await PostModel.updateMany({ councilId: String(council._id) }, { isActive: false });
      }
      if (RegistrationModel) {
        await RegistrationModel.updateMany({ councilId: String(council._id) }, { isActive: false });
      }
      if (council.councilType === 'house') {
        await syncHouseCouncilMembers(req, council);
      }

      return res.json({ success: true, message: 'Council removed.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to remove council.', error: error.message });
    }
  },

  details: async (req, res) => {
    try {
      const Model = req.models?.ActivityCouncil;
      const PostModel = req.models?.ActivityCouncilPost;
      const RegistrationModel = req.models?.ActivityCouncilRegistration;
      if (!Model) return res.status(500).json({ success: false, message: 'ActivityCouncil is not available.' });

      const council = await Model.findOne({ _id: req.params.id, isActive: { $ne: false } }).lean();
      if (!council) return res.status(404).json({ success: false, message: 'Council not found.' });

      const posts = PostModel
        ? await PostModel.find({ isActive: { $ne: false }, councilId: String(council._id) }).sort({ title: 1 }).lean()
        : [];
      const registrations = RegistrationModel
        ? await RegistrationModel.find({ isActive: { $ne: false }, councilId: String(council._id) })
          .sort({ createdAt: -1 })
          .lean()
        : [];

      const postsWithCounts = posts.map((post) => {
        const related = registrations.filter((row) => String(row.postId) === String(post._id));
        return {
          ...post,
          registrationCount: related.length,
          pendingCount: related.filter((row) => row.status === 'pending').length,
          acceptedCount: related.filter((row) => row.status === 'accepted').length,
        };
      });

      return res.json({
        success: true,
        data: {
          council,
          posts: postsWithCounts,
          registrations,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to load council details.', error: error.message });
    }
  },
};

const councilPosts = {
  create: async (req, res) => {
    try {
      const CouncilModel = req.models?.ActivityCouncil;
      const PostModel = req.models?.ActivityCouncilPost;
      if (!CouncilModel || !PostModel) {
        return res.status(500).json({ success: false, message: 'Council models are not available.' });
      }

      const title = String(req.body?.title || '').trim();
      if (!title) {
        return res.status(400).json({ success: false, message: 'Post title is required.' });
      }

      const seats = Math.max(1, Number(req.body?.seats) || 1);
      const description = String(req.body?.description || '').trim();
      const preferredGender = normalizePreferredGender(req.body?.preferredGender);
      const preferredClasses = normalizePreferredClasses(req.body?.preferredClasses);
      const applyToAllHouseCouncils = ['true', '1', 'yes'].includes(
        String(req.body?.applyToAllHouseCouncils ?? req.body?.applyToAllHouses ?? '').trim().toLowerCase()
      ) || req.body?.applyToAllHouseCouncils === true || req.body?.applyToAllHouses === true;

      if (applyToAllHouseCouncils) {
        try {
          await ensureHouseCouncilsForAllHouses(req);
        } catch (_error) {
          // Continue with existing house councils.
        }

        const houseCouncils = await CouncilModel.find({
          isActive: { $ne: false },
          councilType: 'house',
        }).lean();

        if (!houseCouncils.length) {
          return res.status(400).json({
            success: false,
            message: 'Add a house first to add posts to the house council.',
          });
        }

        const created = [];
        for (const council of houseCouncils) {
          const post = await createPostOnCouncil(PostModel, council, { title, description, seats, preferredGender, preferredClasses });
          if (post) created.push(post);
        }

        return res.status(201).json({
          success: true,
          data: created,
          message: `Post added to ${created.length} house council${created.length === 1 ? '' : 's'}.`,
        });
      }

      const council = await CouncilModel.findOne({ _id: req.body?.councilId, isActive: { $ne: false } }).lean();
      if (!council) return res.status(404).json({ success: false, message: 'Council not found.' });

      const post = await createPostOnCouncil(PostModel, council, { title, description, seats, preferredGender, preferredClasses });
      return res.status(201).json({ success: true, data: post, message: 'Post created.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to create post.', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const PostModel = req.models?.ActivityCouncilPost;
      if (!PostModel) return res.status(500).json({ success: false, message: 'ActivityCouncilPost is not available.' });

      const payload = {};
      if (req.body?.title !== undefined) payload.title = String(req.body.title).trim();
      if (req.body?.description !== undefined) payload.description = String(req.body.description).trim();
      if (req.body?.seats !== undefined) payload.seats = Math.max(1, Number(req.body.seats) || 1);
      if (req.body?.preferredGender !== undefined) {
        payload.preferredGender = normalizePreferredGender(req.body.preferredGender);
      }
      if (req.body?.preferredClasses !== undefined) {
        payload.preferredClasses = normalizePreferredClasses(req.body.preferredClasses);
      }
      if (req.body?.registrationStatus !== undefined) {
        const status = String(req.body.registrationStatus).trim();
        if (!['closed', 'open', 'accepting'].includes(status)) {
          return res.status(400).json({ success: false, message: 'Invalid registration status.' });
        }
        payload.registrationStatus = status;
      }

      const applyToAllHouseCouncils = req.body?.applyToAllHouseCouncils === true
        || req.body?.applyToAllHouses === true;

      const post = await PostModel.findById(req.params.id);
      if (!post || post.isActive === false) return res.status(404).json({ success: false, message: 'Post not found.' });

      if (applyToAllHouseCouncils && post.councilType === 'house' && payload.title) {
        const CouncilModel = req.models?.ActivityCouncil;
        const houseCouncils = CouncilModel
          ? await CouncilModel.find({ isActive: { $ne: false }, councilType: 'house' }).select('_id').lean()
          : [];
        const councilIds = houseCouncils.map((row) => String(row._id));
        await PostModel.updateMany(
          {
            isActive: { $ne: false },
            councilId: { $in: councilIds },
            title: post.title,
          },
          payload
        );
        const refreshed = await PostModel.findById(post._id);
        return res.json({ success: true, data: refreshed, message: 'Post updated across house councils.' });
      }

      Object.assign(post, payload);
      await post.save();
      return res.json({ success: true, data: post, message: 'Post updated.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to update post.', error: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const PostModel = req.models?.ActivityCouncilPost;
      const RegistrationModel = req.models?.ActivityCouncilRegistration;
      const CouncilModel = req.models?.ActivityCouncil;
      if (!PostModel) return res.status(500).json({ success: false, message: 'ActivityCouncilPost is not available.' });

      const post = await PostModel.findById(req.params.id);
      if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

      const applyToAllHouseCouncils = String(req.query?.applyToAllHouseCouncils || req.query?.applyToAllHouses || '')
        .trim()
        .toLowerCase() === 'true'
        || req.body?.applyToAllHouseCouncils === true
        || req.body?.applyToAllHouses === true;

      const postsToRemove = [];
      if (applyToAllHouseCouncils && post.councilType === 'house') {
        const houseCouncils = CouncilModel
          ? await CouncilModel.find({ isActive: { $ne: false }, councilType: 'house' }).select('_id').lean()
          : [];
        const councilIds = houseCouncils.map((row) => String(row._id));
        const matches = await PostModel.find({
          isActive: { $ne: false },
          councilId: { $in: councilIds },
          title: post.title,
        });
        postsToRemove.push(...matches);
      } else {
        postsToRemove.push(post);
      }

      for (const row of postsToRemove) {
        await PostModel.findByIdAndUpdate(row._id, { isActive: false });
        if (RegistrationModel) {
          await RegistrationModel.updateMany({ postId: String(row._id) }, { isActive: false });
        }
        if (CouncilModel) {
          const council = await CouncilModel.findById(row.councilId).lean();
          if (council) await syncHouseCouncilMembers(req, council);
        }
      }

      return res.json({
        success: true,
        message: applyToAllHouseCouncils
          ? 'Post removed from all house councils.'
          : 'Post removed.',
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to remove post.', error: error.message });
    }
  },
};

const councilRegistrations = {
  create: async (req, res) => {
    try {
      const PostModel = req.models?.ActivityCouncilPost;
      const RegistrationModel = req.models?.ActivityCouncilRegistration;
      if (!PostModel || !RegistrationModel) {
        return res.status(500).json({ success: false, message: 'Council registration models are not available.' });
      }

      const post = await PostModel.findOne({ _id: req.body?.postId, isActive: { $ne: false } }).lean();
      if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
      if (post.registrationStatus === 'closed') {
        return res.status(400).json({ success: false, message: 'Registrations are closed for this post.' });
      }

      const studentName = String(req.body?.studentName || '').trim();
      if (!studentName) return res.status(400).json({ success: false, message: 'Student name is required.' });

      const studentId = String(req.body?.studentId || '').trim();
      let className = String(req.body?.className || '').trim();
      let section = String(req.body?.section || '').trim();
      let gender = normalizePreferredGender(req.body?.gender);
      let rollNumber = String(req.body?.rollNumber || '').trim();
      let phone = String(req.body?.phone || '').trim();
      let houseId = String(req.body?.houseId || post.houseId || '').trim();
      let houseName = String(req.body?.houseName || post.houseName || '').trim();

      if (studentId) {
        const existing = await RegistrationModel.findOne({
          isActive: { $ne: false },
          postId: String(post._id),
          studentId,
        }).lean();
        if (existing) {
          return res.status(400).json({ success: false, message: 'This student is already registered for the post.' });
        }

        const StudentModel = req.models?.Student;
        if (StudentModel) {
          const student = await StudentModel.findById(studentId)
            .select('name rollNumber class section gender phone house houseId')
            .lean();
          if (student) {
            if (!studentName) {
              // keep provided name
            }
            rollNumber = rollNumber || String(student.rollNumber || '').trim();
            className = className || String(student.class || '').trim();
            section = section || String(student.section || '').trim();
            gender = gender || normalizePreferredGender(student.gender);
            phone = phone || String(student.phone || '').trim();
            houseId = houseId || String(student.houseId || '').trim();
            houseName = houseName || String(student.house || '').trim();
          }
        }
      }

      const eligibility = studentMatchesPostEligibility(post, { gender, className });
      if (!eligibility.ok) {
        return res.status(400).json({ success: false, message: eligibility.message });
      }

      const registration = await RegistrationModel.create({
        councilId: String(post.councilId),
        postId: String(post._id),
        postTitle: post.title,
        studentId,
        studentName,
        rollNumber,
        className,
        section,
        gender,
        houseId,
        houseName,
        phone,
        status: 'pending',
        notes: String(req.body?.notes || '').trim(),
      });

      return res.status(201).json({ success: true, data: registration, message: 'Registration submitted.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to register student.', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const RegistrationModel = req.models?.ActivityCouncilRegistration;
      const PostModel = req.models?.ActivityCouncilPost;
      const CouncilModel = req.models?.ActivityCouncil;
      if (!RegistrationModel) {
        return res.status(500).json({ success: false, message: 'ActivityCouncilRegistration is not available.' });
      }

      const status = String(req.body?.status || '').trim();
      if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid registration status.' });
      }

      const registration = await RegistrationModel.findById(req.params.id);
      if (!registration || registration.isActive === false) {
        return res.status(404).json({ success: false, message: 'Registration not found.' });
      }

      if (status === 'accepted' && PostModel) {
        const post = await PostModel.findById(registration.postId).lean();
        if (post) {
          const acceptedCount = await RegistrationModel.countDocuments({
            isActive: { $ne: false },
            postId: String(post._id),
            status: 'accepted',
            _id: { $ne: registration._id },
          });
          if (acceptedCount >= (Number(post.seats) || 1)) {
            return res.status(400).json({
              success: false,
              message: `All seats for "${post.title}" are already filled.`,
            });
          }
        }
      }

      registration.status = status;
      if (req.body?.notes !== undefined) registration.notes = String(req.body.notes || '').trim();
      await registration.save();

      if (CouncilModel) {
        const council = await CouncilModel.findById(registration.councilId).lean();
        if (council) await syncHouseCouncilMembers(req, council);
      }

      return res.json({ success: true, data: registration, message: 'Registration updated.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to update registration.', error: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const RegistrationModel = req.models?.ActivityCouncilRegistration;
      const CouncilModel = req.models?.ActivityCouncil;
      if (!RegistrationModel) {
        return res.status(500).json({ success: false, message: 'ActivityCouncilRegistration is not available.' });
      }

      const registration = await RegistrationModel.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      );
      if (!registration) return res.status(404).json({ success: false, message: 'Registration not found.' });

      if (CouncilModel) {
        const council = await CouncilModel.findById(registration.councilId).lean();
        if (council) await syncHouseCouncilMembers(req, council);
      }

      return res.json({ success: true, message: 'Registration removed.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to remove registration.', error: error.message });
    }
  },
};

module.exports = {
  clubs,
  houses,
  tours,
  sportsFacilities,
  sports,
  functions,
  events,
  criteria,
  points,
  certificates,
  ranking,
  studentProfiles,
  councils,
  councilPosts,
  councilRegistrations,
};
