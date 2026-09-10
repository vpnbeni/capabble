const Candidate = require('../models/Candidate');
const Room = require('../models/Room');
const CBSEDatesheet = require('../models/CBSEDatesheet');
const SeatingPlanAllocation = require('../models/SeatingPlanAllocation');
const { compareRoomNo } = require('./roomSort');
const { calculateRoomsForDay } = require('./roomCalculator');

/**
 * Exam allocation rules (simplified):
 * Rule 1: No candidate shall be allotted the same room across all exams.
 *         Enforced here via buildCandidateRoomHistoryBeforeEntry + resolveAutoStartRoomIndexWithoutRepeats.
 */

const ACTIVE_CANDIDATE_FILTER = {
  $or: [{ status: 'active' }, { status: { $exists: false } }],
};

class SeatingPlanBuilder {
  constructor() {
    this.schoolName = 'INTERNATIONAL BHARTI SCHOOL, ROHTAK';
    this.schoolAddress = 'Gohana Road, Rohtak';
    this.centreNo = '827403';
    // Caches for optimization (cleared per buildSeatingData call)
    this._candidatesCache = new Map();
    this._normalizedDateCache = new Map();
  }

  /**
   * Clear caches - should be called at the start of each buildSeatingData call
   */
  _clearCaches() {
    this._candidatesCache.clear();
    this._normalizedDateCache.clear();
  }

  resolveCentreIdentity(centreDetails = null) {
    const centreName = String(centreDetails?.centreName || '').trim();
    const centreNo = String(centreDetails?.centreNo || '').trim();
    const hasCentreNameFromDetails = centreName.length > 0;

    return {
      schoolName: centreName || this.schoolName,
      schoolAddress: hasCentreNameFromDetails ? '' : this.schoolAddress,
      centreNo: centreNo || this.centreNo,
    };
  }

  normalizeDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  getManualRoomOrder(room, dateKey) {
    const mapValue = room?.allocationOrderByDate;
    if (!mapValue || !dateKey) return null;

    let orderValue;
    if (mapValue instanceof Map) {
      orderValue = mapValue.get(dateKey);
    } else if (typeof mapValue === 'object') {
      orderValue = mapValue[dateKey];
    }

    const order = Number(orderValue);
    if (!Number.isFinite(order) || order <= 0) return null;
    return order;
  }

  async buildSeatingData(entryId, options = {}) {
    try {
      // Clear caches at the start of each buildSeatingData call
      this._clearCaches();
      const centreIdentity = this.resolveCentreIdentity(options.centreDetails);

      const { Form66 } = require('../models/Form66');
      const AnswerSheet = require('../models/AnswerSheet');

      // Get CBSE datesheet and find the specific entry
      const cbseDatesheet = await CBSEDatesheet.getActive();
      if (!cbseDatesheet) {
        throw new Error('No active CBSE datesheet found');
      }

      // Find the specific entry
      const entry = cbseDatesheet.entries.id(entryId);
      if (!entry) {
        throw new Error('Datesheet entry not found');
      }

      // Get all rooms sorted numerically by room number
      const allRooms = await Room.find({ isActive: true }).lean();
      allRooms.sort(compareRoomNo);

      const allocationMode = options.roomAllocationMode === 'manual' ? 'manual' : 'auto';
      const seatingPlanMode = options.seatingPlanMode === 'same_across_days'
        ? 'same_across_days'
        : 'different_per_day';
      const examDateKey = this.normalizeDateKey(entry.examDate);

      const rooms = allocationMode === 'manual'
        ? allRooms
          .map((room) => ({
            ...room,
            __manualOrder: this.getManualRoomOrder(room, examDateKey),
          }))
          .filter((room) => room.__manualOrder !== null)
          .sort((a, b) => {
            if (a.__manualOrder !== b.__manualOrder) {
              return a.__manualOrder - b.__manualOrder;
            }
            return compareRoomNo(a, b);
          })
          .map(({ __manualOrder, ...room }) => room)
        : allRooms;

      if (rooms.length === 0) {
        if (allocationMode === 'manual') {
          throw new Error('No rooms are allocated for this exam date in Manual mode. Please allocate rooms in Exam Room/Hall first, or switch allocation mode to Auto.');
        }
        throw new Error('No rooms available for allocation');
      }

      // Get candidates for this exam
      const candidates = await this.getCandidatesForExam(entry);

      // Fetch answer sheet allocations for this exam
      const answerSheetAllocations = await this.getAnswerSheetAllocations(entry, cbseDatesheet);

      // Filter entries to only those that have candidates at this centre
      // This ensures rotation is calculated based on actual exams being conducted
      const entriesWithCandidates = await this.filterEntriesWithCandidates(cbseDatesheet.entries);

      console.log(`\n=== SEATING PLAN BUILD ===`);
      console.log(`Total datesheet entries: ${cbseDatesheet.entries.length}`);
      console.log(`Entries with candidates at this centre: ${entriesWithCandidates.length}`);

      // Detect shared room scenario: re-run room calculator for same-date entries
      // to determine if this entry shares a room with another (roomsNeeded=0 means shared).
      const sameDateEntries = entriesWithCandidates.filter(e =>
        this.normalizeDate(e.examDate) === examDateKey
      );
      const sameDateWithCounts = await Promise.all(
        sameDateEntries.map(async (e) => {
          const cands = await this.getCandidatesForExam(e);
          return { ...e.toObject ? e.toObject() : e, candidateCount: cands.length, _id: e._id };
        })
      );
      const enrichedSameDate = calculateRoomsForDay(sameDateWithCounts.filter(e => e.candidateCount > 0));
      const currentEnriched = enrichedSameDate.find(e => e._id.toString() === entry._id.toString());
      const isSharedRoom = Boolean(currentEnriched && currentEnriched.roomsNeeded === 0);

      if (isSharedRoom) {
        // This entry shares a room with a "host" entry. Find which room and seat offset to use.
        const sharedPos = currentEnriched.sharedRoomPosition; // 1-indexed cumulative room position for the day

        // Re-derive host entry: iterate sorted entries (largest candidateCount first),
        // accumulate roomsNeeded, and stop when cumulative equals sharedPos.
        const sortedForHost = [...enrichedSameDate].sort((a, b) => b.candidateCount - a.candidateCount);
        let cumulative = 0;
        let hostEntry = null;
        for (const e of sortedForHost) {
          if (e.roomsNeeded > 0) {
            cumulative += e.roomsNeeded;
            if (cumulative === sharedPos) { hostEntry = e; break; }
          }
        }

        if (!hostEntry) {
          throw new Error('Could not resolve shared room host entry for this exam.');
        }

        // The seat offset is how many seats the host already occupies in the shared room.
        // The host's candidates fill (roomsNeeded * 24) seats across exclusive rooms plus
        // (candidateCount % 24) seats in the shared room. If candidateCount % 24 === 0 the
        // host exactly fills its rooms, meaning it would not share — so sharedRoomPosition
        // would not be set. We rely on the roomCalculator guarantee that remainder > 0.
        const seatOffset = hostEntry.candidateCount % 24;

        // sharedRoomIdx is 0-indexed position of the shared room in the day's allocated sequence.
        const sharedRoomIdx = sharedPos - 1;

        let sharedRoom;
        if (allocationMode === 'manual') {
          // rooms is already filtered + ordered by allocationOrderByDate for this date.
          if (rooms.length === 0) {
            throw new Error('No rooms are allocated for this exam date in Manual mode. Please allocate rooms in Exam Room/Hall first, or switch allocation mode to Auto.');
          }
          if (sharedRoomIdx >= rooms.length) {
            throw new Error(`Shared room position ${sharedPos} exceeds the number of allocated rooms (${rooms.length}) for this date. Please allocate more rooms.`);
          }
          sharedRoom = rooms[sharedRoomIdx];
        } else {
          // Auto mode: find the same room the host uses, accounting for day rotation.
          const dayRotation = this.getAutoStartRoomIndexForDateByClassChange(
            sortedForHost[0],
            entriesWithCandidates,
            allRooms.length
          );
          const roomIdx = (dayRotation + sharedRoomIdx) % allRooms.length;
          sharedRoom = allRooms[roomIdx];
        }

        console.log(`Exam ${entry.subject.code} (${entry.subject.class}): SHARED ROOM - Room ${sharedRoom?.roomNo || 'N/A'}, Seat offset: ${seatOffset}`);

        // Build the room allocation directly using the shared-entry row builder,
        // which fills col3 → col2 → col1-tail so there are no vacant rows in the PDF.
        const sharedRows = this.buildRowsSharedEntry(candidates, seatOffset, 0, answerSheetAllocations);
        const roomAllocations = [{
          roomIndex: 0,
          roomNo: this.formatRoomNoDisplay(sharedRoom.roomNo),
          roomName: sharedRoom.roomName || '',
          floor: sharedRoom.floor || 'First Floor',
          candidates,
          rows: sharedRows,
          registered: candidates.length,
          seatOffset,
        }];

        await this.persistRoomAllocationSnapshot(entry, roomAllocations);

        return {
          datesheet: {
            _id: entry._id,
            date: entry.examDate,
            dayName: entry.dayName,
            subjectCode: entry.subject.code,
            subjectName: entry.subject.name,
            class: entry.subject.class,
            timeSlot: entry.timeSlot
          },
          rooms: roomAllocations,
          totalCandidates: candidates.length,
          answerSheetAllocations,
          centreIdentity,
        };
      }

      // Validate centre capacity for auto mode using the peak room requirement across exam days.
      if (allocationMode === 'auto') {
        const maxRoomsRequired = await this.getMaxRoomsRequiredAcrossExamDays(entriesWithCandidates);
        if (maxRoomsRequired > rooms.length) {
          throw new Error(
            `Maximum number of rooms required at the centre is ${maxRoomsRequired}. Add more rooms to switch to Auto mode.`
          );
        }
      }

      if (seatingPlanMode === 'same_across_days') {
        const rollNumbers = candidates
          .map((candidate) => String(candidate?.rollNo || '').trim())
          .filter(Boolean);
        const fixedRoomByRoll = await this.buildEarliestFixedRoomMap(rollNumbers);
        const roomAllocations = this.allocateCandidatesToFixedRooms(
          candidates,
          rooms,
          fixedRoomByRoll,
          answerSheetAllocations
        );

        const allocatedCount = roomAllocations.reduce((sum, room) => sum + Number(room.registered || 0), 0);
        if (allocatedCount < candidates.length) {
          throw new Error('Insufficient rooms for this exam date. Please allocate more rooms in Exam Room/Hall.');
        }

        await this.persistRoomAllocationSnapshot(entry, roomAllocations);

        return {
          datesheet: {
            _id: entry._id,
            date: entry.examDate,
            dayName: entry.dayName,
            subjectCode: entry.subject.code,
            subjectName: entry.subject.name,
            class: entry.subject.class,
            timeSlot: entry.timeSlot,
          },
          rooms: roomAllocations,
          totalCandidates: candidates.length,
          answerSheetAllocations,
          centreIdentity,
        };
      }

      let startRoomIndex = 0;
      let startSeatOffset = 0;
      let allowWrap = true;

      if (allocationMode === 'manual') {
        const manualStart = await this.calculateStartingPositionClassBased(
          entry,
          entriesWithCandidates, // Use filtered entries instead of all entries
          null, // scheduleMap no longer used
          rooms,
          candidates.length,
          { manualMode: true }
        );
        startRoomIndex = manualStart.startRoomIndex;
        startSeatOffset = manualStart.startSeatOffset;
        allowWrap = manualStart.allowWrap ?? false;
      } else {
        const preferredStartIndex = this.getAutoStartRoomIndexForDateByClassChange(
          entry,
          entriesWithCandidates,
          rooms.length
        );
        const roomHistoryByRollNo = await this.buildCandidateRoomHistoryBeforeEntry(
          entry,
          entriesWithCandidates,
          rooms
        );
        startRoomIndex = this.resolveAutoStartRoomIndexWithoutRepeats(
          candidates,
          rooms,
          preferredStartIndex,
          roomHistoryByRollNo
        );
        startSeatOffset = 0;
        allowWrap = true;
      }

      console.log(`Exam ${entry.subject.code} (${entry.subject.class}): Starting from Room ${rooms[startRoomIndex]?.roomNo || 'N/A'}, Seat offset: ${startSeatOffset}`);

      // Build room allocations with the calculated starting position
      const roomAllocations = this.allocateCandidatesToRoomsWithOffset(
        candidates,
        rooms,
        startRoomIndex,
        startSeatOffset,
        answerSheetAllocations,
        allowWrap ?? true
      );

      const allocatedCount = roomAllocations.reduce((sum, room) => sum + Number(room.registered || 0), 0);
      if (allocatedCount < candidates.length) {
        throw new Error('Insufficient rooms for this exam date. Please allocate more rooms in Exam Room/Hall or switch to Auto mode.');
      }

      // Persist generated rollNo -> room mapping for both modes.
      // This keeps cross-day continuity when users switch between manual/auto.
      await this.persistRoomAllocationSnapshot(entry, roomAllocations);

      return {
        datesheet: {
          _id: entry._id,
          date: entry.examDate,
          dayName: entry.dayName,
          subjectCode: entry.subject.code,
          subjectName: entry.subject.name,
          class: entry.subject.class,
          timeSlot: entry.timeSlot
        },
        rooms: roomAllocations,
        totalCandidates: candidates.length,
        answerSheetAllocations,
        centreIdentity,
      };
    } catch (error) {
      console.error('Seating Plan Builder Error:', error);
      throw error;
    }
  }

  /**
   * Filter datesheet entries to only include those that have candidates at this centre
   * This ensures room rotation is calculated based on actual exams being conducted
   * Optimized to fetch candidates in parallel using Promise.all
   */
  async filterEntriesWithCandidates(allEntries) {
    // Fetch all candidates in parallel for better performance
    const candidateResults = await Promise.all(
      allEntries.map(entry => this.getCandidatesForExam(entry))
    );

    // Filter entries that have candidates
    return allEntries.filter((_, index) => candidateResults[index].length > 0);
  }

  /**
   * Get answer sheet allocations for a specific exam
   * Fetches all answer sheets for the exam's class and determines serial number allocation
   */
  async getAnswerSheetAllocations(entry, cbseDatesheet) {
    try {
      const AnswerSheet = require('../models/AnswerSheet');
      const Candidate = require('../models/Candidate');

      // Normalize class for querying
      const normalizedClass = entry.subject.class.includes('th') ? entry.subject.class : `${entry.subject.class}th`;
      const classNumber = normalizedClass.replace(/th$/i, '');

      // Determine expected answer sheet type from entry
      let expectedAnswerSheetType = null;
      let expectedPages = null;
      if (entry.answerSheet === '32_pages') {
        expectedAnswerSheetType = 'Main';
        expectedPages = 32;
      } else if (entry.answerSheet === '20_pages') {
        expectedAnswerSheetType = 'Main';
        expectedPages = 20;
      } else if (entry.answerSheet === '40_graph') {
        expectedAnswerSheetType = 'Graph';
      } else if (entry.answerSheet === 'drawing_sheets') {
        expectedAnswerSheetType = 'Drawing Sheets';
      }

      if (!expectedAnswerSheetType) {
        console.log(`No answer sheet allocation found for ${entry.subject.code}`);
        return null;
      }

      // Find matching answer sheets
      const answerSheetFilter = {
        answerSheetType: expectedAnswerSheetType,
        class: classNumber,
        isActive: true
      };
      if (expectedPages !== null) {
        answerSheetFilter.pages = expectedPages;
      }

      const answerSheets = await AnswerSheet.find({
        ...answerSheetFilter
      }).sort({ sortOrder: 1 });

      if (answerSheets.length === 0) {
        console.log(`No answer sheets found for type ${expectedAnswerSheetType}, class ${classNumber}`);
        return null;
      }

      // Get all candidates to calculate frequencies
      const candidates = await Candidate.find(ACTIVE_CANDIDATE_FILTER)
        .populate('subjects', 'code name class')
        .lean();

      // Calculate candidate count per subject
      const subjectFrequency = new Map();
      candidates.forEach(candidate => {
        if (candidate.subjects && candidate.subjects.length > 0) {
          candidate.subjects.forEach(subject => {
            if (subject && subject.code && subject.class) {
              const key = `${subject.code}-${subject.class}`;
              const count = subjectFrequency.get(key) || 0;
              subjectFrequency.set(key, count + 1);
            }
          });
        }
      });

      // Find related exams that use the same answer sheet type
      const relatedExams = cbseDatesheet.entries
        .filter(e => {
          if (e.subject.class !== normalizedClass) return false;
          if (e.answerSheet !== entry.answerSheet) return false;
          return true;
        })
        .map(e => {
          const key = `${e.subject.code}-${e.subject.class}`;
          const normalizedKey = `${e.subject.code}-${e.subject.class.replace(/th$/i, '')}`;
          const candidateCount = subjectFrequency.get(key) || subjectFrequency.get(normalizedKey) || 0;
          return {
            _id: e._id,
            examDate: e.examDate,
            subjectCode: e.subject.code,
            subjectName: e.subject.name,
            candidateCount
          };
        })
        .filter(e => e.candidateCount > 0)
        .sort((a, b) => {
          const dateDiff = new Date(a.examDate).getTime() - new Date(b.examDate).getTime();
          if (dateDiff !== 0) return dateDiff;
          return b.candidateCount - a.candidateCount;
        });

      // For each answer sheet, calculate allocation for this specific exam
      const allocations = [];

      for (const answerSheet of answerSheets) {
        if (!answerSheet.serialFrom || !answerSheet.serialTo) {
          continue;
        }

        const fromNum = parseInt(answerSheet.serialFrom.replace(/\D/g, ''));
        const toNum = parseInt(answerSheet.serialTo.replace(/\D/g, ''));
        const prefix = answerSheet.serialFrom.replace(/\d+$/, '');
        const padLength = answerSheet.serialFrom.replace(/\D/g, '').length;

        // Create set of discarded serials
        const discardedSet = new Set(
          (answerSheet.discardedSerials || []).map(d => parseInt(d.serial.replace(/\D/g, '')))
        );

        // Helper to format serial
        const formatSerial = (num) => prefix + num.toString().padStart(padLength, '0');

        // Helper to get next available serial (skipping discarded)
        const getNextAvailable = (start) => {
          let current = start;
          while (discardedSet.has(current) && current <= toNum) {
            current++;
          }
          return current <= toNum ? current : null;
        };

        let currentSerial = getNextAvailable(fromNum);

        // Allocate serials to each exam
        for (const exam of relatedExams) {
          if (exam._id.toString() === entry._id.toString()) {
            // This is our target exam
            if (currentSerial === null) {
              console.log(`Insufficient sheets for ${entry.subject.code}`);
              break;
            }

            const serialStart = currentSerial;
            let sheetsAssigned = 0;
            let serialEnd = currentSerial;

            // Assign serials one by one, skipping discarded ones
            while (sheetsAssigned < exam.candidateCount && currentSerial !== null && currentSerial <= toNum) {
              if (!discardedSet.has(currentSerial)) {
                serialEnd = currentSerial;
                sheetsAssigned++;
              }
              currentSerial++;
              while (discardedSet.has(currentSerial) && currentSerial <= toNum) {
                currentSerial++;
              }
            }

            if (currentSerial > toNum) {
              currentSerial = null;
            }

            allocations.push({
              answerSheetType: answerSheet.answerSheetType,
              pages: answerSheet.pages,
              colour: answerSheet.colour,
              serialFrom: formatSerial(serialStart),
              serialTo: formatSerial(serialEnd),
              prefix,
              padLength,
              startNum: serialStart,
              endNum: serialEnd,
              sheetsAllocated: sheetsAssigned,
              totalCandidates: exam.candidateCount
            });

            break; // Found allocation for this exam
          } else {
            // Skip past this exam's allocation
            let sheetsAssigned = 0;
            while (sheetsAssigned < exam.candidateCount && currentSerial !== null && currentSerial <= toNum) {
              if (!discardedSet.has(currentSerial)) {
                sheetsAssigned++;
              }
              currentSerial++;
              while (discardedSet.has(currentSerial) && currentSerial <= toNum) {
                currentSerial++;
              }
            }
            if (currentSerial > toNum) {
              currentSerial = null;
            }
          }
        }
      }

      console.log(`Found ${allocations.length} answer sheet allocation(s) for ${entry.subject.code}`);
      return allocations.length > 0 ? allocations : null;
    } catch (error) {
      console.error('Error fetching answer sheet allocations:', error);
      return null;
    }
  }

  async getCandidatesForExam(entry) {
    // Create cache key from entry's unique identifiers
    const cacheKey = `${entry._id.toString()}`;

    // Return cached result if available
    if (this._candidatesCache.has(cacheKey)) {
      return this._candidatesCache.get(cacheKey);
    }

    const { Form66 } = require('../models/Form66');

    // Get Form 66 records for this exam date and subject
    const form66Records = await Form66.find({
      examDate: entry.examDate,
      subjectCode: entry.subject.code,
      isActive: true
    }).sort({ rollNo: 1 });

    console.log(`Found ${form66Records.length} Form 66 records for ${entry.subject.code} on ${entry.examDate}`);

    // If Form 66 records exist, use them (priority)
    if (form66Records.length > 0) {
      this._candidatesCache.set(cacheKey, form66Records);
      return form66Records;
    }

    // Fall back to Candidate model
    console.log('No Form 66 records found, falling back to Candidate model');

    const classValue = entry.subject.class;
    const normalizedClass = classValue && classValue.endsWith('th') ? classValue : `${classValue}th`;

    let candidates = await Candidate.find({
      class: normalizedClass,
      'subjectCodes.code': entry.subject.code,
      status: 'active'
    }).sort({ rollNumber: 1 });

    // Map rollNumber to rollNo for consistency
    candidates = candidates.map(c => ({
      ...c.toObject(),
      rollNo: c.rollNumber
    }));

    console.log(`Found ${candidates.length} candidates from Candidate model`);

    // Cache the result before returning
    this._candidatesCache.set(cacheKey, candidates);
    return candidates;
  }

  /**
   * Normalize date to YYYY-MM-DD string for consistent comparison
   * Memoized to avoid repeated date parsing for the same input
   */
  normalizeDate(date) {
    // Create a string key for caching
    const dateKey = String(date);

    if (this._normalizedDateCache.has(dateKey)) {
      return this._normalizedDateCache.get(dateKey);
    }

    const d = new Date(date);
    const normalized = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    this._normalizedDateCache.set(dateKey, normalized);
    return normalized;
  }

  getEntrySortKey(entry) {
    const dateNorm = this.normalizeDate(entry.examDate);
    const classValue = parseInt(String(entry?.subject?.class || '').replace(/th$/i, ''), 10) || 0;
    const subjectCode = String(entry?.subject?.code || '');
    return `${dateNorm}::${String(classValue).padStart(2, '0')}::${subjectCode}`;
  }

  getEntriesSortedChronologically(allEntries) {
    return [...allEntries].sort((a, b) => {
      const dateA = this.normalizeDate(a.examDate);
      const dateB = this.normalizeDate(b.examDate);
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const classA = parseInt(String(a?.subject?.class || '').replace(/th$/i, ''), 10) || 0;
      const classB = parseInt(String(b?.subject?.class || '').replace(/th$/i, ''), 10) || 0;
      if (classA !== classB) return classA - classB;

      return String(a?.subject?.code || '').localeCompare(String(b?.subject?.code || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }

  getAutoStartRoomIndexForDateByClassChange(currentEntry, allEntries, totalRooms) {
    if (!totalRooms || totalRooms <= 0) return 0;

    const sorted = this.getEntriesSortedChronologically(allEntries);
    const dateKeys = [...new Set(sorted.map((entry) => this.normalizeDate(entry.examDate)))];
    const firstClassByDate = {};

    dateKeys.forEach((dateKey) => {
      const firstEntryForDate = sorted.find((entry) => this.normalizeDate(entry.examDate) === dateKey);
      firstClassByDate[dateKey] = String(firstEntryForDate?.subject?.class || '');
    });

    const currentDate = this.normalizeDate(currentEntry.examDate);
    const dayIndex = dateKeys.indexOf(currentDate);
    if (dayIndex <= 0) return 0;

    const previousDate = dateKeys[dayIndex - 1];
    const currentClass = firstClassByDate[currentDate];
    const previousClass = firstClassByDate[previousDate];

    // Rule: if class changes on next day, start from first room; else start from second room.
    const startIndex = currentClass !== previousClass ? 0 : 1;
    return Math.min(startIndex, totalRooms - 1);
  }

  async buildEarliestFixedRoomMap(rollNumbers = []) {
    const history = new Map();
    if (!rollNumbers.length) return history;

    const rows = await SeatingPlanAllocation.find({
      rollNo: { $in: rollNumbers },
    })
      .sort({ examDate: 1, createdAt: 1 })
      .select('rollNo roomNo examDate')
      .lean();

    rows.forEach((row) => {
      const rollNo = String(row?.rollNo || '').trim();
      const roomNo = String(row?.roomNo || '').trim();
      if (!rollNo || !roomNo || history.has(rollNo)) return;
      history.set(rollNo, roomNo);
    });

    return history;
  }

  allocateCandidatesToFixedRooms(candidates, rooms, fixedRoomByRoll, answerSheetAllocations = null) {
    const roomLookup = new Map();
    rooms.forEach((room, index) => {
      const displayNo = this.formatRoomNoDisplay(room.roomNo);
      roomLookup.set(displayNo, { room, index });
      roomLookup.set(String(room.roomNo || '').trim(), { room, index });
    });

    const buckets = new Map();
    const unassigned = [];

    candidates.forEach((candidate) => {
      const rollNo = String(candidate?.rollNo || '').trim();
      const fixedRoomNo = fixedRoomByRoll.get(rollNo);
      const roomKey = fixedRoomNo && roomLookup.has(fixedRoomNo) ? fixedRoomNo : null;
      if (roomKey) {
        if (!buckets.has(roomKey)) buckets.set(roomKey, []);
        buckets.get(roomKey).push(candidate);
        return;
      }
      unassigned.push(candidate);
    });

    if (unassigned.length > 0) {
      const freshAllocations = this.allocateCandidatesToRoomsWithOffset(
        unassigned,
        rooms,
        0,
        0,
        answerSheetAllocations,
        true
      );
      freshAllocations.forEach((allocation) => {
        const roomKey = String(allocation.roomNo || '').trim();
        if (!buckets.has(roomKey)) buckets.set(roomKey, []);
        buckets.get(roomKey).push(...(allocation.candidates || []));
        (allocation.candidates || []).forEach((candidate) => {
          const rollNo = String(candidate?.rollNo || '').trim();
          if (rollNo) fixedRoomByRoll.set(rollNo, roomKey);
        });
      });
    }

    const allocations = [];
    rooms.forEach((room, roomIdx) => {
      const displayNo = this.formatRoomNoDisplay(room.roomNo);
      const roomCandidates = buckets.get(displayNo)
        || buckets.get(String(room.roomNo || '').trim())
        || [];
      if (!roomCandidates.length) return;

      const rows = this.buildRowsWithOffset(roomCandidates, 0, 0, answerSheetAllocations);
      allocations.push({
        roomIndex: roomIdx,
        roomNo: displayNo,
        roomName: room.roomName || '',
        floor: room.floor || 'First Floor',
        candidates: roomCandidates,
        rows,
        registered: roomCandidates.length,
        seatOffset: 0,
      });
    });

    return allocations;
  }

  getAllocationMapByRollNo(roomAllocations) {
    const map = new Map();
    roomAllocations.forEach((allocation) => {
      const roomNo = String(allocation.roomNo || '').trim();
      (allocation.candidates || []).forEach((candidate) => {
        const rollNo = String(candidate?.rollNo || '').trim();
        if (!rollNo) return;
        map.set(rollNo, roomNo);
      });
    });
    return map;
  }

  /**
   * Build per-rollNo set of room numbers this candidate was already allotted on previous exam dates.
   * Used to enforce Rule 1: No candidate shall be allotted the same room across all exams.
   */
  async buildCandidateRoomHistoryBeforeEntry(currentEntry, allEntries, rooms) {
    const history = new Map();
    const currentCandidates = await this.getCandidatesForExam(currentEntry);
    const candidateRollNos = currentCandidates
      .map((candidate) => String(candidate?.rollNo || '').trim())
      .filter(Boolean);
    if (candidateRollNos.length === 0) return history;

    // Rule: only verify against already generated seating plans from previous days.
    const currentDateKey = this.normalizeDate(currentEntry.examDate);
    const persistedRows = await SeatingPlanAllocation.find({
      rollNo: { $in: candidateRollNos },
      examDate: { $lt: currentDateKey },
    })
      .select('rollNo roomNo')
      .lean();

    persistedRows.forEach((row) => {
      const rollNo = String(row?.rollNo || '').trim();
      const roomNo = String(row?.roomNo || '').trim();
      if (!rollNo || !roomNo) return;
      if (!history.has(rollNo)) history.set(rollNo, new Set());
      history.get(rollNo).add(roomNo);
    });

    return history;
  }

  async persistRoomAllocationSnapshot(entry, roomAllocations) {
    const examDate = this.normalizeDateKey(entry.examDate);
    const subjectCode = String(entry?.subject?.code || '').trim();
    const className = String(entry?.subject?.class || '').trim();
    const entrySortKey = this.getEntrySortKey(entry);

    if (!examDate || !subjectCode || !className || !entry?._id) {
      return;
    }

    const docs = [];
    (roomAllocations || []).forEach((allocation) => {
      const roomNo = String(allocation?.roomNo || '').trim();
      if (!roomNo) return;

      (allocation.candidates || []).forEach((candidate) => {
        const rollNo = String(candidate?.rollNo || '').trim();
        if (!rollNo) return;

        docs.push({
          datesheetEntryId: entry._id,
          examDate,
          subjectCode,
          className,
          entrySortKey,
          rollNo,
          roomNo,
        });
      });
    });

    await SeatingPlanAllocation.deleteMany({ datesheetEntryId: entry._id });
    if (docs.length === 0) return;
    await SeatingPlanAllocation.insertMany(docs, { ordered: false });

    // Rebuild supervisionHistory for teachers assigned to this exam date,
    // since roll-number-to-room mappings may have changed.
    try {
      const { rebuildSupervisionHistoryForDate } = require('../controllers/dutiesController');
      await rebuildSupervisionHistoryForDate(examDate);
    } catch (_err) {
      // Non-critical: supervision history rebuild failure should not block seating plan generation
    }
  }

  /** Count how many candidates would repeat a room they had on a previous exam (Rule 1). */
  countRoomRepeatConflicts(candidates, rooms, startRoomIndex, historyByRollNo) {
    const allocations = this.allocateCandidatesToRoomsWithOffset(
      candidates,
      rooms,
      startRoomIndex,
      0,
      null,
      true
    );
    const mapped = this.getAllocationMapByRollNo(allocations);
    let conflicts = 0;

    mapped.forEach((roomNo, rollNo) => {
      if (historyByRollNo.get(rollNo)?.has(roomNo)) {
        conflicts += 1;
      }
    });

    return conflicts;
  }

  /** Choose start room index so that no candidate gets the same room as on a previous exam (Rule 1). */
  resolveAutoStartRoomIndexWithoutRepeats(candidates, rooms, preferredStartIndex, historyByRollNo) {
    const totalRooms = rooms.length;
    if (!totalRooms) return 0;

    const candidateStarts = [preferredStartIndex];
    for (let idx = 0; idx < totalRooms; idx += 1) {
      if (!candidateStarts.includes(idx)) candidateStarts.push(idx);
    }

    let bestStart = candidateStarts[0];
    let bestConflicts = Number.POSITIVE_INFINITY;

    for (const startIndex of candidateStarts) {
      const conflicts = this.countRoomRepeatConflicts(candidates, rooms, startIndex, historyByRollNo);
      if (conflicts < bestConflicts) {
        bestConflicts = conflicts;
        bestStart = startIndex;
      }
      if (conflicts === 0) return startIndex;
    }

    throw new Error(
      `CBSE room-repeat rule could not be satisfied for all candidates with current room setup (minimum repeats: ${bestConflicts}). Add more rooms and try again.`
    );
  }

  async getMaxRoomsRequiredAcrossExamDays(entriesWithCandidates) {
    const roomsRequiredByDate = new Map();

    // Group entries by date
    const byDate = new Map();
    for (const entry of entriesWithCandidates) {
      const dateKey = this.normalizeDate(entry.examDate);
      if (!dateKey) continue;
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(entry);
    }

    // For each date, fetch candidate counts and run the room calculator to correctly
    // account for shared rooms (roomsNeeded=0 entries don't consume additional rooms).
    for (const [dateKey, dateEntries] of byDate) {
      const withCounts = await Promise.all(
        dateEntries.map(async (e) => {
          const cands = await this.getCandidatesForExam(e);
          return { ...e.toObject ? e.toObject() : e, candidateCount: cands.length, _id: e._id };
        })
      );
      const filtered = withCounts.filter(e => e.candidateCount > 0);
      if (filtered.length === 0) continue;
      const enriched = calculateRoomsForDay(filtered);
      const totalRoomsForDate = enriched.reduce((sum, e) => sum + (e.roomsNeeded || 0), 0);
      roomsRequiredByDate.set(dateKey, totalRoomsForDate);
    }

    let maxRequired = 0;
    roomsRequiredByDate.forEach((count) => {
      if (count > maxRequired) maxRequired = count;
    });
    return maxRequired;
  }

  /**
   * Get class-based day rotation offset
   * Rotation is tracked separately for 10th and 12th class
   * Uses datesheet entries directly (candidates are fetched on-demand)
   */
  async getClassBasedDayRotation(currentEntry, allEntries, totalRooms) {
    const currentClass = currentEntry.subject.class;
    const currentDateNorm = this.normalizeDate(currentEntry.examDate);

    // Filter entries for the same class
    const classEntries = allEntries.filter(e => e.subject.class === currentClass);

    // Get unique dates for this class, sorted chronologically
    const uniqueClassDates = [...new Set(
      classEntries.map(e => this.normalizeDate(e.examDate))
    )].sort();

    // Find the day index for current date within this class
    const dayIndex = uniqueClassDates.indexOf(currentDateNorm);

    // Room rotation offset (wraps around)
    const rotationOffset = dayIndex >= 0 ? dayIndex % totalRooms : 0;

    console.log(`\n=== CLASS-BASED ROTATION DEBUG ===`);
    console.log(`Current exam: ${currentEntry.subject.code} - ${currentEntry.subject.name}`);
    console.log(`Current class: ${currentClass}`);
    console.log(`Current date: ${currentDateNorm}`);
    console.log(`Total ${currentClass} entries in datesheet: ${classEntries.length}`);
    console.log(`Unique ${currentClass} exam dates (${uniqueClassDates.length}): ${uniqueClassDates.join(', ')}`);
    console.log(`Day index for ${currentDateNorm}: ${dayIndex} (Day ${dayIndex + 1})`);
    console.log(`Room rotation offset: ${rotationOffset}`);
    console.log(`Total rooms: ${totalRooms}`);
    console.log(`=================================\n`);

    return rotationOffset;
  }

  /**
   * Calculate starting position with:
   * 1. Continuous room allocation across ALL exams on the same day (regardless of class)
   * 2. Class-based rotation on consecutive exam days (10th and 12th have separate rotation sequences)
   * 
   * Logic:
   * - First exam of the day: Uses that exam's class-based rotation offset as starting room
   * - Subsequent exams on same day: Continue from where previous exam ended (regardless of class)
   *   - If ALL candidates fit in remaining seats of last room → continue in that room
   *   - Otherwise → start from the next room
   */
  async calculateStartingPositionClassBased(currentEntry, allEntries, _scheduleMap, rooms, currentCandidateCount, options = {}) {
    const candidatesPerRoom = 24;
    const totalRooms = rooms.length;
    const currentClass = currentEntry.subject.class;
    const currentDateNorm = this.normalizeDate(currentEntry.examDate);
    const manualMode = Boolean(options?.manualMode);

    // In manual mode, always start day progression from first allocated room.
    // In auto mode, keep class-based day rotation.
    const dayRotationOffset = manualMode
      ? 0
      : await this.getClassBasedDayRotation(currentEntry, allEntries, totalRooms);

    // Find ALL exams on the same day (regardless of class) for continuous room allocation
    const allSameDayExams = allEntries.filter(e => {
      const entryDateNorm = this.normalizeDate(e.examDate);
      return entryDateNorm === currentDateNorm;
    });

    // Sort same-day exams by candidate count (higher first), then class, then subject code.
    // This ensures the class with more students consumes room order first.
    const sameDayWithCounts = await Promise.all(
      allSameDayExams.map(async exam => {
        const count = (await this.getCandidatesForExam(exam)).length;
        return { exam, count };
      })
    );
    sameDayWithCounts.sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count; // higher candidate count first
      const classA = parseInt(String(a.exam.subject.class).replace(/th$/i, ''), 10) || 0;
      const classB = parseInt(String(b.exam.subject.class).replace(/th$/i, ''), 10) || 0;
      if (classA !== classB) return classA - classB;
      return String(a.exam.subject.code || '').localeCompare(String(b.exam.subject.code || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
    const orderedSameDayExams = sameDayWithCounts.map(item => item.exam);

    // Find position of current exam among ALL exams today
    const currentExamIndex = orderedSameDayExams.findIndex(e =>
      e._id.toString() === currentEntry._id.toString()
    );

    console.log(`Exam ${currentEntry.subject.code} (${currentClass}) is exam #${currentExamIndex + 1} of ${orderedSameDayExams.length} total exams today`);
    console.log(`All same-day exams (in order): ${orderedSameDayExams.map(e => `${e.subject.code}(${e.subject.class})`).join(', ')}`);

    // If this is the FIRST exam of the day (regardless of class), use this exam's class-based rotation
    if (currentExamIndex <= 0) {
      console.log(`First exam of the day (${currentClass}) - starting from Room ${rooms[dayRotationOffset]?.roomNo} (rotation offset: ${dayRotationOffset})`);
      return { startRoomIndex: dayRotationOffset, startSeatOffset: 0, allowWrap: !manualMode };
    }

    // For subsequent exams: simulate room progression exam-by-exam for robust same-day continuity.
    // Get the first exam of the day to determine base rotation offset.
    const firstExamOfDay = orderedSameDayExams[0];
    const firstExamClass = firstExamOfDay.subject.class;
    const baseRotationOffset = manualMode
      ? 0
      : await this.getClassBasedDayRotation(firstExamOfDay, allEntries, totalRooms);

    console.log(`Base rotation offset from first exam (${firstExamClass}): ${baseRotationOffset}`);

    // Fetch candidates for all previous exams in parallel (cache avoids duplicate DB calls).
    const previousExams = orderedSameDayExams.slice(0, currentExamIndex);
    const previousExamCandidates = await Promise.all(
      previousExams.map(async exam => {
        const candidates = await this.getCandidatesForExam(exam);
        console.log(`  Previous exam ${exam.subject.code} (${exam.subject.class}): ${candidates.length} candidates`);
        return candidates;
      })
    );

    let simulatedStartRoomIndex = baseRotationOffset;
    let simulatedStartSeatOffset = 0;

    for (let i = 0; i < previousExams.length; i += 1) {
      const prevCandidates = previousExamCandidates[i];
      if (!prevCandidates || prevCandidates.length === 0) continue;

      const prevAllocations = this.allocateCandidatesToRoomsWithOffset(
        prevCandidates,
        rooms,
        simulatedStartRoomIndex,
        simulatedStartSeatOffset
      );

      const lastAllocation = prevAllocations[prevAllocations.length - 1];
      if (!lastAllocation) continue;

      const lastRoomIndex = Number(lastAllocation.roomIndex || 0);
      const seatsUsedInLastRoom = prevAllocations.length === 1
        ? Number(lastAllocation.seatOffset || 0) + Number(lastAllocation.registered || 0)
        : Number(lastAllocation.registered || 0);
      const remainingSeatsInLastRoom = candidatesPerRoom - seatsUsedInLastRoom;

      const nextExamCandidateCount = i === previousExams.length - 1
        ? currentCandidateCount
        : previousExamCandidates[i + 1].length;

      if (seatsUsedInLastRoom > 0 && nextExamCandidateCount <= remainingSeatsInLastRoom) {
        simulatedStartRoomIndex = lastRoomIndex;
        simulatedStartSeatOffset = seatsUsedInLastRoom;
      } else {
        simulatedStartRoomIndex = lastRoomIndex + 1;
        simulatedStartSeatOffset = 0;
      }
    }

    if (simulatedStartRoomIndex >= totalRooms) {
      throw new Error('No next room available for same-day class progression. Please allocate additional rooms for this date.');
    }

    console.log(
      `Simulated same-day start for ${currentEntry.subject.code}: Room ${rooms[simulatedStartRoomIndex]?.roomNo}, seat offset ${simulatedStartSeatOffset}`
    );
    return {
      startRoomIndex: simulatedStartRoomIndex,
      startSeatOffset: simulatedStartSeatOffset,
      allowWrap: false,
    };
  }

  allocateCandidatesToRoomsWithOffset(candidates, rooms, startRoomIndex, startSeatOffset, answerSheetAllocations = null, allowWrap = true) {
    const allocations = [];
    const candidatesPerRoom = 24;
    const totalRooms = rooms.length;
    let candidateIndex = 0;
    let isFirstRoom = true;
    let roomsProcessed = 0;

    // Loop through rooms with optional wrap-around support.
    while (candidateIndex < candidates.length) {
      if (allowWrap && roomsProcessed >= totalRooms) break;
      const roomIdx = allowWrap
        ? (startRoomIndex + roomsProcessed) % totalRooms
        : (startRoomIndex + roomsProcessed);
      if (!allowWrap && roomIdx >= totalRooms) break;

      const room = rooms[roomIdx];
      let seatsAvailable = candidatesPerRoom;
      let seatOffset = 0;

      // For the first room, account for the offset (seats already used)
      if (isFirstRoom && startSeatOffset > 0) {
        seatsAvailable = candidatesPerRoom - startSeatOffset;
        seatOffset = startSeatOffset;
        isFirstRoom = false;
      } else {
        isFirstRoom = false;
      }

      const roomCandidates = candidates.slice(
        candidateIndex,
        candidateIndex + seatsAvailable
      );

      if (roomCandidates.length === 0) break;

      // Build rows with offset consideration and answer sheet allocations
      const rows = this.buildRowsWithOffset(roomCandidates, seatOffset, candidateIndex, answerSheetAllocations);

      allocations.push({
        roomIndex: roomIdx,
        roomNo: this.formatRoomNoDisplay(room.roomNo),
        roomName: room.roomName || '',
        floor: room.floor || 'First Floor',
        candidates: roomCandidates,
        rows: rows,
        registered: roomCandidates.length,
        seatOffset: seatOffset // Include offset info for reference
      });

      candidateIndex += roomCandidates.length;
      roomsProcessed++;
    }

    return allocations;
  }

  buildRowsWithOffset(candidates, seatOffset = 0, globalCandidateStartIndex = 0, answerSheetAllocations = null) {
    // For CBSE Copy format, we still show 8 rows x 3 columns
    // But the candidates are placed starting from the offset position
    const rows = [];
    const totalSeats = 24;

    // Create a full seat array with empty slots
    const seats = new Array(totalSeats).fill(null);

    // Place candidates starting from the offset
    for (let i = 0; i < candidates.length; i++) {
      seats[seatOffset + i] = candidates[i];
    }

    // Build rows from the seats array
    for (let i = 0; i < 8; i++) {
      const row = {
        col1: '\u00a0',
        col2: '\u00a0',
        col3: '\u00a0',
        row1RollNo: '',
        row2RollNo: '',
        row3RollNo: '',
        row1QpCode: '',
        row2QpCode: '',
        row3QpCode: '',
        row1SheetNo: '',
        row2SheetNo: '',
        row3SheetNo: ''
      };

      // Column 1 (seats 0-7)
      const seat1 = seats[i];
      const seat1GlobalIndex = i >= seatOffset && i < seatOffset + candidates.length
        ? globalCandidateStartIndex + (i - seatOffset)
        : -1;
      if (seat1) {
        row.col1 = seat1.rollNo;
        row.row1RollNo = seat1.rollNo;
        row.row1QpCode = this.getQPCodeBySequenceIndex(i - seatOffset);
        row.row1SheetNo = this.getSheetNo(seat1, seat1GlobalIndex, answerSheetAllocations);
      }

      // Column 2 (seats 8-15)
      const seat2 = seats[i + 8];
      const seat2GlobalIndex = (i + 8) >= seatOffset && (i + 8) < seatOffset + candidates.length
        ? globalCandidateStartIndex + ((i + 8) - seatOffset)
        : -1;
      if (seat2) {
        row.col2 = seat2.rollNo;
        row.row2RollNo = seat2.rollNo;
        row.row2QpCode = this.getQPCodeBySequenceIndex((i + 8) - seatOffset);
        row.row2SheetNo = this.getSheetNo(seat2, seat2GlobalIndex, answerSheetAllocations);
      }

      // Column 3 (seats 16-23)
      const seat3 = seats[i + 16];
      const seat3GlobalIndex = (i + 16) >= seatOffset && (i + 16) < seatOffset + candidates.length
        ? globalCandidateStartIndex + ((i + 16) - seatOffset)
        : -1;
      if (seat3) {
        row.col3 = seat3.rollNo;
        row.row3RollNo = seat3.rollNo;
        row.row3QpCode = this.getQPCodeBySequenceIndex((i + 16) - seatOffset);
        row.row3SheetNo = this.getSheetNo(seat3, seat3GlobalIndex, answerSheetAllocations);
      }

      rows.push(row);
    }

    return rows;
  }

  /**
   * Build PDF rows for a shared-room entry.
   * Available seats are seatOffset..23 (the host occupies 0..seatOffset-1).
   * Candidates fill col3 → col2 → col1 tail, all top-down.
   * Any empty seat in col1 appears immediately after the host block (not at the bottom),
   * because col1 is filled from the bottom of the available range upward so that
   * candidates sit sequentially without reversing their numbering.
   *
   * col1 = seats 0–7  |  col2 = seats 8–15  |  col3 = seats 16–23
   */
  buildRowsSharedEntry(candidates, seatOffset = 0, globalCandidateStartIndex = 0, answerSheetAllocations = null) {
    const totalSeats = 24;
    const seats = new Array(totalSeats).fill(null);

    // How many col3 / col2 seats are free (all of each column when seatOffset < 8/16)
    const col3Free = Math.max(0, 24 - Math.max(16, seatOffset)); // seats 16..23 free
    const col2Free = Math.max(0, 16 - Math.max(8,  seatOffset)); // seats 8..15 free
    const col1Free = Math.max(0,  8 - Math.max(0,  seatOffset)); // seats 0..7 free

    // How many candidates spill into each column (fill col3 first, then col2, then col1)
    const inCol3 = Math.min(candidates.length, col3Free);
    const inCol2 = Math.min(candidates.length - inCol3, col2Free);
    const inCol1 = candidates.length - inCol3 - inCol2;

    // col1 candidates sit at the BOTTOM of the available col1 range so any empty gap
    // appears right after the host block (top of col1 tail), candidates are sequential.
    const col1Start = 8 - inCol1; // first seat used in col1 (≥ seatOffset always)

    const availableSeats = [];
    for (let s = 16; s <= 23; s++) if (s >= seatOffset) availableSeats.push(s); // col3 top-down
    for (let s = 8;  s <= 15; s++) if (s >= seatOffset) availableSeats.push(s); // col2 top-down
    for (let s = col1Start; s <= 7; s++) availableSeats.push(s);                 // col1 top-down from gap end

    // Place candidates into the available seats
    for (let i = 0; i < candidates.length && i < availableSeats.length; i++) {
      seats[availableSeats[i]] = candidates[i];
    }

    // Map seat position → global candidate index (for answer sheet serial lookup)
    const seatToGlobalIndex = new Map();
    for (let i = 0; i < candidates.length && i < availableSeats.length; i++) {
      seatToGlobalIndex.set(availableSeats[i], globalCandidateStartIndex + i);
    }

    const rows = [];
    for (let i = 0; i < 8; i++) {
      const row = {
        col1: '\u00a0',
        col2: '\u00a0',
        col3: '\u00a0',
        row1RollNo: '',
        row2RollNo: '',
        row3RollNo: '',
        row1QpCode: '',
        row2QpCode: '',
        row3QpCode: '',
        row1SheetNo: '',
        row2SheetNo: '',
        row3SheetNo: ''
      };

      const seat1 = seats[i];
      if (seat1) {
        row.col1 = seat1.rollNo;
        row.row1RollNo = seat1.rollNo;
        row.row1QpCode = this.getQPCodeBySequenceIndex(availableSeats.indexOf(i));
        row.row1SheetNo = this.getSheetNo(seat1, seatToGlobalIndex.get(i) ?? -1, answerSheetAllocations);
      }

      const seat2 = seats[i + 8];
      if (seat2) {
        row.col2 = seat2.rollNo;
        row.row2RollNo = seat2.rollNo;
        row.row2QpCode = this.getQPCodeBySequenceIndex(availableSeats.indexOf(i + 8));
        row.row2SheetNo = this.getSheetNo(seat2, seatToGlobalIndex.get(i + 8) ?? -1, answerSheetAllocations);
      }

      const seat3 = seats[i + 16];
      if (seat3) {
        row.col3 = seat3.rollNo;
        row.row3RollNo = seat3.rollNo;
        row.row3QpCode = this.getQPCodeBySequenceIndex(availableSeats.indexOf(i + 16));
        row.row3SheetNo = this.getSheetNo(seat3, seatToGlobalIndex.get(i + 16) ?? -1, answerSheetAllocations);
      }

      rows.push(row);
    }

    return rows;
  }

  allocateCandidatesToRooms(candidates, rooms, answerSheetAllocations = null) {
    const allocations = [];
    const candidatesPerRoom = 24;
    let candidateIndex = 0;

    for (const room of rooms) {
      if (candidateIndex >= candidates.length) break;

      const roomCandidates = candidates.slice(
        candidateIndex,
        candidateIndex + candidatesPerRoom
      );

      if (roomCandidates.length === 0) break;

      const rows = this.buildRows(roomCandidates, candidateIndex, answerSheetAllocations);

      allocations.push({
        roomNo: this.formatRoomNoDisplay(room.roomNo),
        roomName: room.roomName || '',
        floor: room.floor || 'First Floor',
        candidates: roomCandidates,
        rows: rows,
        registered: roomCandidates.length
      });

      candidateIndex += candidatesPerRoom;
    }

    return allocations;
  }

  buildRows(candidates, globalCandidateStartIndex = 0, answerSheetAllocations = null) {
    const rows = [];
    const candidatesPerRow = 3;

    for (let i = 0; i < 8; i++) {
      const row = {
        col1: '',
        col2: '',
        col3: '',
        row1RollNo: '',
        row2RollNo: '',
        row3RollNo: '',
        row1QpCode: '',
        row2QpCode: '',
        row3QpCode: '',
        row1SheetNo: '',
        row2SheetNo: '',
        row3SheetNo: ''
      };

      // Column 1
      const idx1 = i;
      if (candidates[idx1]) {
        row.col1 = candidates[idx1].rollNo;
        row.row1RollNo = candidates[idx1].rollNo;
        row.row1QpCode = this.getQPCodeBySequenceIndex(idx1);
        row.row1SheetNo = this.getSheetNo(candidates[idx1], globalCandidateStartIndex + idx1, answerSheetAllocations);
      }

      // Column 2
      const idx2 = i + 8;
      if (candidates[idx2]) {
        row.col2 = candidates[idx2].rollNo;
        row.row2RollNo = candidates[idx2].rollNo;
        row.row2QpCode = this.getQPCodeBySequenceIndex(idx2);
        row.row2SheetNo = this.getSheetNo(candidates[idx2], globalCandidateStartIndex + idx2, answerSheetAllocations);
      }

      // Column 3
      const idx3 = i + 16;
      if (candidates[idx3]) {
        row.col3 = candidates[idx3].rollNo;
        row.row3RollNo = candidates[idx3].rollNo;
        row.row3QpCode = this.getQPCodeBySequenceIndex(idx3);
        row.row3SheetNo = this.getSheetNo(candidates[idx3], globalCandidateStartIndex + idx3, answerSheetAllocations);
      }

      rows.push(row);
    }

    return rows;
  }

  getQPCodeBySequenceIndex(sequenceIndex) {
    const qpCodes = ['1', '2', '3'];
    const normalizedIndex = Number.isInteger(sequenceIndex) && sequenceIndex >= 0
      ? sequenceIndex
      : 0;
    return qpCodes[normalizedIndex % qpCodes.length];
  }

  getSheetNo(candidate, globalIndex, answerSheetAllocations = null) {
    // If no allocations or invalid index, return empty
    if (!answerSheetAllocations || globalIndex < 0) {
      return '';
    }

    // Find the appropriate answer sheet allocation for this candidate
    // Candidates are allocated sequentially across all answer sheet types
    let cumulativeCandidates = 0;

    for (const allocation of answerSheetAllocations) {
      const allocationEnd = cumulativeCandidates + allocation.sheetsAllocated;

      if (globalIndex < allocationEnd) {
        // This candidate falls within this allocation
        const positionInAllocation = globalIndex - cumulativeCandidates;
        const serialNumber = allocation.startNum + positionInAllocation;

        // Format the serial number with prefix and padding
        const formattedSerial = allocation.prefix + serialNumber.toString().padStart(allocation.padLength, '0');
        return formattedSerial;
      }

      cumulativeCandidates = allocationEnd;
    }

    // If we get here, the candidate is beyond allocated sheets
    console.warn(`No sheet allocation found for candidate at index ${globalIndex}`);
    return '';
  }

  formatDate(date, includeDay = true) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    if (includeDay) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[d.getDay()];
      return `${day}.${month}.${year} (${dayName})`;
    }

    return `${day}.${month}.${year}`;
  }

  getExamName(classValue) {
    // Class 10 = Secondary School Main Examinations
    // Class 12 = Senior School Certificate Examinations
    const normalizedClass = String(classValue).replace(/th$/i, '');
    if (normalizedClass === '10') {
      return 'Secondary School Main Examinations';
    }
    return 'Senior School Certificate Examinations';
  }

  getExamYear(date) {
    const d = new Date(date);
    return d.getFullYear().toString();
  }

  /**
   * Convert class number to Roman numeral format
   * 10 -> X, 12 -> XII
   */
  getClassRoman(classValue) {
    const normalizedClass = String(classValue).replace(/th$/i, '');
    if (normalizedClass === '10') {
      return 'X';
    } else if (normalizedClass === '12') {
      return 'XII';
    }
    return classValue;
  }

  formatRoomNoDisplay(roomNo) {
    const value = String(roomNo ?? '').trim();
    if (!value) return value;

    // Keep non-numeric room identifiers unchanged (e.g. A1, Lab-2).
    if (!/^\d+$/.test(value)) return value;

    return value.padStart(2, '0');
  }

  /**
   * Get answer sheet serial number for a candidate in a specific exam entry.
   * Uses the same logic as the room folder slip (rows with row1SheetNo, row2SheetNo, row3SheetNo).
   * @param {string} entryId - CBSEDatesheet entry _id
   * @param {string} rollNo - Candidate roll number (uppercase)
   * @param {object} [options] - Optional { centreDetails, roomAllocationMode } for consistent allocation
   * @returns {Promise<{ serialNumber: string } | null>} Serial number or null if not found
   */
  async getSerialForCandidateInEntry(entryId, rollNo, options = {}) {
    if (!entryId || !rollNo) return null;
    const normalizedRoll = String(rollNo).trim().toUpperCase();
    if (!normalizedRoll) return null;

    try {
      const seatingData = await this.buildSeatingData(entryId, options);
      const { rooms } = seatingData || {};
      if (!Array.isArray(rooms)) return null;

      for (const room of rooms) {
        const rows = room.rows || [];
        for (const row of rows) {
          if (String(row.row1RollNo || '').trim().toUpperCase() === normalizedRoll && row.row1SheetNo) {
            return { serialNumber: row.row1SheetNo };
          }
          if (String(row.row2RollNo || '').trim().toUpperCase() === normalizedRoll && row.row2SheetNo) {
            return { serialNumber: row.row2SheetNo };
          }
          if (String(row.row3RollNo || '').trim().toUpperCase() === normalizedRoll && row.row3SheetNo) {
            return { serialNumber: row.row3SheetNo };
          }
        }
      }
      return null;
    } catch (err) {
      console.warn('getSerialForCandidateInEntry:', err.message);
      return null;
    }
  }

  buildMainGateData(seatingData) {
    const { datesheet, rooms, centreIdentity } = seatingData;
    const identity = centreIdentity || this.resolveCentreIdentity();

    return {
      schoolName: identity.schoolName,
      centreNo: identity.centreNo,
      examDate: this.formatDate(datesheet.date, true),
      subjectName: datesheet.subjectName,
      className: this.getClassRoman(datesheet.class),
      subjectCode: datesheet.subjectCode,
      rooms: rooms.map(room => ({
        roomNo: room.roomNo,
        roomName: room.roomName,
        floor: room.floor,
        rows: room.rows
      }))
    };
  }

  buildRoomFolderSlipData(seatingData) {
    const { datesheet, rooms, centreIdentity } = seatingData;
    const identity = centreIdentity || this.resolveCentreIdentity();
    const slips = [];
    const examName = this.getExamName(datesheet.class);
    const examYear = this.getExamYear(datesheet.date);

    for (let i = 0; i < rooms.length; i += 2) {
      const slip1 = rooms[i];
      const slip2 = rooms[i + 1];

      if (slip1) {
        slips.push({
          schoolName: identity.schoolName,
          schoolAddress: identity.schoolAddress,
          centreNo: identity.centreNo,
          className: this.getClassRoman(datesheet.class),
          examName: examName,
          examYear: examYear,
          subjectCode: datesheet.subjectCode,
          subjectName: datesheet.subjectName,
          examDate: this.formatDate(datesheet.date, true),
          roomNo: slip1.roomNo,
          roomName: slip1.roomName,
          rows: slip1.rows,
          registered: slip1.registered
        });
      }

      if (slip2) {
        slips.push({
          schoolName: identity.schoolName,
          schoolAddress: identity.schoolAddress,
          centreNo: identity.centreNo,
          className: this.getClassRoman(datesheet.class),
          examName: examName,
          examYear: examYear,
          subjectCode: datesheet.subjectCode,
          subjectName: datesheet.subjectName,
          examDate: this.formatDate(datesheet.date, true),
          roomNo: slip2.roomNo,
          roomName: slip2.roomName,
          rows: slip2.rows,
          registered: slip2.registered
        });
      }
    }

    return { slips };
  }

  buildRoomDoorSlipData(seatingData) {
    const { datesheet, rooms, centreIdentity } = seatingData;
    const identity = centreIdentity || this.resolveCentreIdentity();
    const slips = [];
    const examName = this.getExamName(datesheet.class);
    const examYear = this.getExamYear(datesheet.date);

    for (let i = 0; i < rooms.length; i += 2) {
      const slip1 = rooms[i];
      const slip2 = rooms[i + 1];

      if (slip1) {
        slips.push({
          schoolName: identity.schoolName,
          schoolAddress: identity.schoolAddress,
          centreNo: identity.centreNo,
          className: this.getClassRoman(datesheet.class),
          examName: examName,
          examYear: examYear,
          subjectCode: datesheet.subjectCode,
          subjectName: datesheet.subjectName,
          examDate: this.formatDate(datesheet.date, true),
          roomNo: slip1.roomNo,
          roomName: slip1.roomName,
          rows: slip1.rows
        });
      }

      if (slip2) {
        slips.push({
          schoolName: identity.schoolName,
          schoolAddress: identity.schoolAddress,
          centreNo: identity.centreNo,
          className: this.getClassRoman(datesheet.class),
          examName: examName,
          examYear: examYear,
          subjectCode: datesheet.subjectCode,
          subjectName: datesheet.subjectName,
          examDate: this.formatDate(datesheet.date, true),
          roomNo: slip2.roomNo,
          roomName: slip2.roomName,
          rows: slip2.rows
        });
      }
    }

    return { slips };
  }

  buildCBSECopyData(seatingData) {
    const { datesheet, rooms, centreIdentity } = seatingData;
    const identity = centreIdentity || this.resolveCentreIdentity();
    const examName = this.getExamName(datesheet.class);
    const examYear = this.getExamYear(datesheet.date);

    return {
      rooms: rooms.map((room, index) => ({
        schoolName: identity.schoolName,
        schoolAddress: identity.schoolAddress,
        centreNo: identity.centreNo,
        examName: examName,
        examYear: `${examYear}`,
        subjectCode: datesheet.subjectCode,
        subjectName: datesheet.subjectName.toUpperCase(),
        examDate: this.formatDate(datesheet.date, false),
        roomNo: room.roomNo,
        rows: room.rows,
        registered: room.registered,
        registeredDisplay: String(room.registered ?? 0).padStart(2, '0'),
        last: index === rooms.length - 1
      }))
    };
  }
}

module.exports = new SeatingPlanBuilder();
