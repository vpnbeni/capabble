/**
 * Timetable Generator Service
 *
 * Implements a randomised greedy algorithm with multi-pass conflict resolution
 * to produce a clash-free school timetable from a TimetableState configuration.
 *
 * Algorithm overview:
 *  1. Parse the state into working data structures.
 *  2. For each (day, period) slot, attempt to assign a subject+teacher to every
 *     class, prioritising subjects with the highest remaining demand and
 *     avoiding teacher double-bookings.
 *  3. Run up to MAX_ATTEMPTS with different random orderings and keep the best
 *     result (most filled slots, fewest conflicts).
 *  4. Apply consecutive-period constraints (lab doubles) in a dedicated pass.
 *  5. Apply parallel-pair and common-period constraints.
 *  6. Repair: place lessons the greedy pass left out by swapping lessons along
 *     teacher/class chains, never moving rule-placed cells.
 *  7. Return the filled grid plus a detailed conflict report.
 */

'use strict';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_ATTEMPTS = 8;
const MAX_SAME_SUBJECT_PER_DAY = 2;
const MAX_CONSECUTIVE_TEACHER_PERIODS = 3; // free period required after this many consecutive
const MAX_CONCURRENT_SPORTS_CLASSES = 2;   // max sections in sports at same day+slot
const SPORTS_PATTERNS = ['sport', 'game', 'p.t.', 'physical', 'p.e.', 'pt'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Build a lookup: `${classId}::${subjectName.toLowerCase()}` → teacherName
 * A subject in a class can have at most one teacher (the first allocation wins).
 */
const buildTeacherLookup = (teacherSubjectAllocations) => {
  const lookup = {};
  (teacherSubjectAllocations || []).forEach((alloc) => {
    const teacherName = (alloc.teacherName || '').trim();
    if (!teacherName) return;
    (alloc.assignments || []).forEach((assignment) => {
      const classId = (assignment.classId || '').trim();
      (assignment.subjects || []).forEach((subj) => {
        const subjLower = subj.trim().toLowerCase();
        if (!subjLower || !classId) return;
        const key = `${classId}::${subjLower}`;
        if (!lookup[key]) lookup[key] = teacherName;
      });
    });
  });
  return lookup;
};

/**
 * Build the initial demand map from periodAllocation.
 * Returns a deep copy so we can reset per attempt.
 */
const buildDemandMap = (periodAllocation, classes) => {
  const demand = {};
  (classes || []).forEach((cls) => {
    const classAlloc = (periodAllocation || {})[cls.id] || {};
    demand[cls.id] = {};
    Object.entries(classAlloc).forEach(([subj, count]) => {
      const parsed = Number.parseInt(String(count), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        demand[cls.id][subj] = parsed;
      }
    });
  });
  return demand;
};

const deepCopyDemand = (demand) => {
  const copy = {};
  Object.entries(demand).forEach(([classId, subjMap]) => {
    copy[classId] = { ...subjMap };
  });
  return copy;
};

/**
 * Build a set of consecutive-subject names from subjects config.
 */
const buildConsecutiveSet = (subjects) => {
  const set = new Set();
  (subjects || []).forEach((s) => {
    if (s.requiresConsecutivePeriods && s.name) {
      set.add(s.name.trim().toLowerCase());
    }
  });
  return set;
};

/**
 * Get consecutivePeriodCount for a subject name (default 2).
 */
const buildConsecutiveCountMap = (subjects) => {
  const map = {};
  (subjects || []).forEach((s) => {
    if (s.requiresConsecutivePeriods && s.name) {
      map[s.name.trim().toLowerCase()] = s.consecutivePeriodCount || 2;
    }
  });
  return map;
};

/**
 * Build common-period lookup:
 * className → subjectName → [ classId, ... ] (all sections sharing this period)
 *
 * A common period means: same subject, same teacher, multiple sections simultaneously.
 */
const buildCommonPeriodMap = (commonPeriods, classes) => {
  const result = {};

  (commonPeriods || []).forEach((cp) => {
    const className = (cp.className || '').trim().toLowerCase();
    const subjectName = (cp.subject || '').trim().toLowerCase();
    const sections = cp.sections || [];
    if (!className || !subjectName || sections.length < 2) return;

    if (!result[className]) result[className] = {};

    // Find classIds for each section of this className
    const classIds = classes
      .filter(
        (cls) =>
          cls.className.trim().toLowerCase() === className &&
          sections.includes(cls.section)
      )
      .map((cls) => cls.id);

    result[className][subjectName] = classIds;
  });

  return result;
};

/**
 * Build parallel-pair lookup:
 * className → [ [subjectA, subjectB] ]
 *
 * Parallel pair: subjectA and subjectB must occupy the same (day, period) slot
 * for the class (across sections). The generator schedules them at the same
 * slot so teachers can be independently assigned without conflicts.
 */
const buildParallelPairMap = (parallelSubjectPairs) => {
  const map = {};
  (parallelSubjectPairs || []).forEach((pair) => {
    const className = (pair.className || '').trim().toLowerCase();
    if (!className || !pair.subjectA || !pair.subjectB) return;
    if (!map[className]) map[className] = [];
    map[className].push([
      pair.subjectA.trim().toLowerCase(),
      pair.subjectB.trim().toLowerCase(),
    ]);
  });
  return map;
};

/**
 * Returns true if the subject name matches a sports/PE pattern.
 */
const isSportsSubject = (subjectName) => {
  if (!subjectName) return false;
  const lower = subjectName.trim().toLowerCase();
  return SPORTS_PATTERNS.some((p) => lower.includes(p));
};

/**
 * Build a set of subject names (lowercase) that are sports-type.
 * Uses name-pattern detection against SPORTS_PATTERNS.
 */
const buildSportsSubjectNames = (subjects) => {
  const set = new Set();
  (subjects || []).forEach((s) => {
    if (s.name && isSportsSubject(s.name)) {
      set.add(s.name.trim().toLowerCase());
    }
  });
  return set;
};

/**
 * Count how many consecutive periods the teacher is already booked IMMEDIATELY
 * BEFORE periodIdx on the given day.
 */
const countConsecutiveBack = (teacherName, day, periodIdx, periodIdList, occupied) => {
  if (!teacherName) return 0;
  let count = 0;
  for (let k = periodIdx - 1; k >= 0; k--) {
    const pid = periodIdList[k];
    const key = `${day}::${pid}`;
    if (occupied.has(teacherName) && occupied.get(teacherName).has(key)) {
      count++;
    } else {
      break;
    }
  }
  return count;
};

/**
 * Count how many times a subject appears in a class's schedule for a given day.
 */
const countSubjectOnDay = (grid, classId, day, subjectName) => {
  const daySlots = (grid[classId] || {})[day] || {};
  return Object.values(daySlots).filter(
    (cell) => cell && cell.subject && cell.subject.toLowerCase() === subjectName.toLowerCase()
  ).length;
};

/**
 * Create an empty grid for all classes and all slots.
 */
const initGrid = (classes, days, periodIds) => {
  const grid = {};
  classes.forEach((cls) => {
    grid[cls.id] = {};
    days.forEach((day) => {
      grid[cls.id][day] = {};
      periodIds.forEach((pid) => {
        grid[cls.id][day][pid] = { subject: '', teacher: '' };
      });
    });
  });
  return grid;
};

/**
 * Count filled (non-empty) slots across the whole grid.
 */
const countFilled = (grid) => {
  let count = 0;
  Object.values(grid).forEach((classDays) => {
    Object.values(classDays).forEach((daySlots) => {
      Object.values(daySlots).forEach((cell) => {
        if (cell && cell.subject) count++;
      });
    });
  });
  return count;
};

// ---------------------------------------------------------------------------
// Core single-attempt generation
// ---------------------------------------------------------------------------

/**
 * One full generation pass with the given random slot ordering.
 * Returns { grid, demand } after the pass.
 */
const runOneAttempt = (
  classes,
  periodIds,
  demand,
  teacherLookup,
  consecutiveSet,
  consecutiveCountMap,
  commonPeriodMap,
  parallelPairMap,
  sportsSubjectNames
) => {
  // Deep copy demand so each attempt starts fresh
  const localDemand = deepCopyDemand(demand);

  // Teacher occupancy: teacherName → Set<"day::periodId">
  const occupied = new Map();

  // Sports slot occupancy: "day::periodId" → count of classes with sports in that slot
  const sportsOccupancy = new Map();

  const isTeacherOccupied = (teacherName, day, periodId) => {
    if (!teacherName) return false;
    const key = `${day}::${periodId}`;
    return occupied.has(teacherName) && occupied.get(teacherName).has(key);
  };

  const markTeacherOccupied = (teacherName, day, periodId) => {
    if (!teacherName) return;
    const key = `${day}::${periodId}`;
    if (!occupied.has(teacherName)) occupied.set(teacherName, new Set());
    occupied.get(teacherName).add(key);
  };

  const grid = initGrid(classes, DAYS, periodIds);

  // Cells placed by a rule (class teacher's first period, doubles, parallel and
  // common periods) that the repair phase must never move: `classId::day::periodId`
  const locked = new Set();
  const lock = (classId, day, periodId) => locked.add(`${classId}::${day}::${periodId}`);

  /**
   * Try to assign a specific (subject, teacher) to a (class, day, period) cell.
   * Also handles consecutive-period assignment for lab subjects.
   * Returns true if assignment was made.
   */
  const tryAssign = (classId, day, periodId, subjectName, teacherName, periodIdList) => {
    const isConsecutive = consecutiveSet.has(subjectName.toLowerCase());
    const consecutiveCount = isConsecutive
      ? (consecutiveCountMap[subjectName.toLowerCase()] || 2)
      : 1;

    if (isConsecutive) {
      // Ensure enough consecutive period slots are available
      const periodIdx = periodIdList.indexOf(periodId);
      if (periodIdx === -1 || periodIdx + consecutiveCount > periodIdList.length) return false;

      // Check all consecutive slots are free for this class
      for (let k = 0; k < consecutiveCount; k++) {
        const pid = periodIdList[periodIdx + k];
        if (grid[classId][day][pid].subject) return false;
        if (isTeacherOccupied(teacherName, day, pid)) return false;
      }

      // Assign all consecutive slots
      const remainingDemand = (localDemand[classId] || {})[subjectName] || 0;
      if (remainingDemand < consecutiveCount) return false;

      for (let k = 0; k < consecutiveCount; k++) {
        const pid = periodIdList[periodIdx + k];
        grid[classId][day][pid] = { subject: subjectName, teacher: teacherName };
        markTeacherOccupied(teacherName, day, pid);
        lock(classId, day, pid);
      }
      localDemand[classId][subjectName] -= consecutiveCount;
      if (localDemand[classId][subjectName] <= 0) {
        delete localDemand[classId][subjectName];
      }
      return true;
    }

    // Regular single-period assignment
    if (grid[classId][day][periodId].subject) return false;
    if (isTeacherOccupied(teacherName, day, periodId)) return false;
    if (countSubjectOnDay(grid, classId, day, subjectName) >= MAX_SAME_SUBJECT_PER_DAY) return false;

    const remaining = (localDemand[classId] || {})[subjectName] || 0;
    if (remaining <= 0) return false;

    // Guard: teacher consecutive period cap — force a free period after MAX_CONSECUTIVE
    if (teacherName) {
      const periodIdx = periodIdList.indexOf(periodId);
      if (periodIdx > 0) {
        const consecutive = countConsecutiveBack(teacherName, day, periodIdx, periodIdList, occupied);
        if (consecutive >= MAX_CONSECUTIVE_TEACHER_PERIODS) return false;
      }
    }

    // Guard: sports cap — no more than MAX_CONCURRENT_SPORTS_CLASSES in same slot
    const isSports = sportsSubjectNames && sportsSubjectNames.has(subjectName.trim().toLowerCase());
    if (isSports) {
      const slotKey = `${day}::${periodId}`;
      if ((sportsOccupancy.get(slotKey) || 0) >= MAX_CONCURRENT_SPORTS_CLASSES) return false;
    }

    grid[classId][day][periodId] = { subject: subjectName, teacher: teacherName };
    markTeacherOccupied(teacherName, day, periodId);
    localDemand[classId][subjectName]--;
    if (localDemand[classId][subjectName] <= 0) {
      delete localDemand[classId][subjectName];
    }

    // Update sports occupancy after successful assignment
    if (isSports) {
      const slotKey = `${day}::${periodId}`;
      sportsOccupancy.set(slotKey, (sportsOccupancy.get(slotKey) || 0) + 1);
    }

    return true;
  };

  /**
   * Get sorted candidate subjects for a class — most remaining demand first,
   * with slight randomisation to break ties differently each attempt.
   */
  const getCandidates = (classId) => {
    return Object.entries(localDemand[classId] || {})
      .filter(([, rem]) => rem > 0)
      .sort(([, a], [, b]) => b - a + (Math.random() * 0.4 - 0.2));
  };

  // Build all (day, periodId) slots and shuffle for variety
  const allSlotPairs = shuffle(
    DAYS.flatMap((day) => periodIds.map((pid) => [day, pid]))
  );

  // Also shuffle the class order
  const shuffledClasses = shuffle(classes);

  // Build reverse teacher lookup: classId → [{ teacher, subject }]
  // Used for Phase 0a (incharge detection)
  const classTeacherSubjects = {};
  Object.entries(teacherLookup).forEach(([key, teacherName]) => {
    const [classId, subjLower] = key.split('::');
    if (!classId || !subjLower) return;
    if (!classTeacherSubjects[classId]) classTeacherSubjects[classId] = [];
    classTeacherSubjects[classId].push({ teacher: teacherName, subjLower });
  });

  // ---------------------------------------------------------------------------
  // Phase 0a: Assign class incharge's subject to first period (slot "0") every day
  // ---------------------------------------------------------------------------
  shuffledClasses.forEach((cls) => {
    if (!cls.incharge) return;
    const inchargeName = cls.incharge.trim();
    if (!inchargeName) return;

    // Find all subjects taught by the incharge in this class
    const inchargeSubjects = (classTeacherSubjects[cls.id] || []).filter(
      (entry) => entry.teacher.trim().toLowerCase() === inchargeName.toLowerCase()
    );

    if (!inchargeSubjects.length) return;

    // Pick subject with highest remaining demand
    const inchargeEntry = inchargeSubjects
      .map(({ subjLower }) => {
        const canonicalName = Object.keys(localDemand[cls.id] || {}).find(
          (s) => s.toLowerCase() === subjLower
        );
        return { canonicalName, demand: canonicalName ? (localDemand[cls.id][canonicalName] || 0) : 0 };
      })
      .filter(({ demand }) => demand > 0)
      .sort((a, b) => b.demand - a.demand)[0];

    if (!inchargeEntry || !inchargeEntry.canonicalName) return;

    const { canonicalName: subjectName } = inchargeEntry;
    const firstPeriodId = periodIds[0];
    if (!firstPeriodId) return;

    // A lab subject opens the day as a double instead of a single period.
    if (consecutiveSet.has(subjectName.toLowerCase())) {
      DAYS.forEach((day) => {
        tryAssign(cls.id, day, firstPeriodId, subjectName, inchargeName, periodIds);
      });
      return;
    }

    DAYS.forEach((day) => {
      if ((localDemand[cls.id][subjectName] || 0) <= 0) return;
      if (grid[cls.id][day][firstPeriodId].subject) return;
      if (isTeacherOccupied(inchargeName, day, firstPeriodId)) return;

      grid[cls.id][day][firstPeriodId] = { subject: subjectName, teacher: inchargeName };
      markTeacherOccupied(inchargeName, day, firstPeriodId);
      lock(cls.id, day, firstPeriodId);
      localDemand[cls.id][subjectName]--;
      if (localDemand[cls.id][subjectName] <= 0) delete localDemand[cls.id][subjectName];
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 0a-ii: Lab doubles first, while the grid is still open — one block a
  //              day where possible, a second block on a day only if needed.
  // ---------------------------------------------------------------------------
  shuffledClasses.forEach((cls) => {
    Object.keys(localDemand[cls.id] || {})
      .filter((subjectName) => consecutiveSet.has(subjectName.toLowerCase()))
      .forEach((subjectName) => {
        const teacher = teacherLookup[`${cls.id}::${subjectName.toLowerCase()}`] || '';
        const blockSize = consecutiveCountMap[subjectName.toLowerCase()] || 2;
        [false, true].forEach((allowSecondBlock) => {
          shuffle(DAYS).forEach((day) => {
            if ((localDemand[cls.id][subjectName] || 0) < blockSize) return;
            if (!allowSecondBlock && countSubjectOnDay(grid, cls.id, day, subjectName) > 0) return;
            shuffle(periodIds).some((periodId) => tryAssign(cls.id, day, periodId, subjectName, teacher, periodIds));
          });
        });
      });
  });

  // ---------------------------------------------------------------------------
  // Phase 1: Assign parallel pairs — combined cells ("SubjectA/SubjectB").
  //          Runs before the column pass so both subjects still have periods left.
  // ---------------------------------------------------------------------------
  shuffledClasses.forEach((cls) => {
    const classNameKey = cls.className.trim().toLowerCase();
    const pairs = parallelPairMap[classNameKey] || [];

    pairs.forEach(([subjectALower, subjectBLower]) => {
      // Find canonical names from remaining demand keys
      const classSubjects = Object.keys(localDemand[cls.id] || {});
      const subjectA = classSubjects.find((s) => s.toLowerCase() === subjectALower);
      const subjectB = classSubjects.find((s) => s.toLowerCase() === subjectBLower);

      // If either subject has no remaining demand (already filled by Phase 0b), skip
      if (!subjectA && !subjectB) return;

      // Allow partial pair: one subject may already be fully scheduled
      const effectiveA = subjectA || subjectALower;
      const effectiveB = subjectB || subjectBLower;

      const teacherA = teacherLookup[`${cls.id}::${subjectALower}`] || '';
      const teacherB = teacherLookup[`${cls.id}::${subjectBLower}`] || '';

      // Fill all parallel demand: loop until min(demandA, demandB) slots assigned
      for (const [day, periodId] of allSlotPairs) {
        const demA = (localDemand[cls.id] || {})[effectiveA] || 0;
        const demB = (localDemand[cls.id] || {})[effectiveB] || 0;
        if (demA <= 0 || demB <= 0) break;

        if (grid[cls.id][day][periodId].subject) continue;
        if (teacherA && isTeacherOccupied(teacherA, day, periodId)) continue;
        if (teacherB && isTeacherOccupied(teacherB, day, periodId)) continue;

        // Assign combined cell: "SubjectA/SubjectB", "TeacherA/TeacherB"
        const combinedSubject = `${effectiveA}/${effectiveB}`;
        const combinedTeacher = [teacherA, teacherB].filter(Boolean).join('/');
        grid[cls.id][day][periodId] = { subject: combinedSubject, teacher: combinedTeacher };
        lock(cls.id, day, periodId);

        if (teacherA) markTeacherOccupied(teacherA, day, periodId);
        if (teacherB) markTeacherOccupied(teacherB, day, periodId);

        if (localDemand[cls.id][effectiveA] > 0) {
          localDemand[cls.id][effectiveA]--;
          if (localDemand[cls.id][effectiveA] <= 0) delete localDemand[cls.id][effectiveA];
        }
        if (localDemand[cls.id][effectiveB] > 0) {
          localDemand[cls.id][effectiveB]--;
          if (localDemand[cls.id][effectiveB] <= 0) delete localDemand[cls.id][effectiveB];
        }
        // No break — continue to fill all remaining parallel demand
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2: Assign common periods (same teacher, multiple sections same slot),
  //          also before the column pass for the same reason.
  // ---------------------------------------------------------------------------
  Object.entries(commonPeriodMap).forEach(([classNameKey, subjectMap]) => {
    Object.entries(subjectMap).forEach(([subjectNameKey, classIds]) => {
      if (!classIds || classIds.length < 2) return;

      // Find canonical names
      const firstClassId = classIds[0];
      const classSubjects = Object.keys(localDemand[firstClassId] || {});
      const subjectName = classSubjects.find((s) => s.toLowerCase() === subjectNameKey);
      if (!subjectName) return;

      const teacherName = teacherLookup[`${firstClassId}::${subjectNameKey}`] || '';

      for (const [day, periodId] of allSlotPairs) {
        const allHaveRemainingDemand = classIds.every(
          (cid) => (localDemand[cid] || {})[subjectName] > 0
        );
        if (!allHaveRemainingDemand) break;

        const allSlotsEmpty = classIds.every(
          (cid) => !(grid[cid]?.[day]?.[periodId]?.subject)
        );
        if (!allSlotsEmpty) continue;
        if (isTeacherOccupied(teacherName, day, periodId)) continue;

        // Check all classes satisfy soft constraint
        const allOkDay = classIds.every(
          (cid) => countSubjectOnDay(grid, cid, day, subjectName) < MAX_SAME_SUBJECT_PER_DAY
        );
        if (!allOkDay) continue;

        // Assign to all sections simultaneously
        classIds.forEach((cid) => {
          grid[cid][day][periodId] = { subject: subjectName, teacher: teacherName };
          lock(cid, day, periodId);
          if (localDemand[cid][subjectName] > 0) {
            localDemand[cid][subjectName]--;
            if (localDemand[cid][subjectName] <= 0) delete localDemand[cid][subjectName];
          }
        });
        markTeacherOccupied(teacherName, day, periodId);
        break;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 0b: Per-class column affinity — keep each subject in one period column
  //           within a class. Only use a second column if demand > DAYS.length.
  // ---------------------------------------------------------------------------
  const shuffledPeriodIds = shuffle(periodIds.slice());

  shuffledClasses.forEach((cls) => {
    // Sort subjects by remaining demand (highest first) to claim columns greedily
    const subjectsByDemand = Object.entries(localDemand[cls.id] || {})
      .filter(([, dem]) => dem > 0)
      .sort(([, a], [, b]) => b - a);

    subjectsByDemand.forEach(([subjectName, subjectDemand]) => {
      if ((localDemand[cls.id][subjectName] || 0) <= 0) return; // already fulfilled by 0a
      if (consecutiveSet.has(subjectName.toLowerCase())) return; // doubles are placed as blocks
      const teacher = teacherLookup[`${cls.id}::${subjectName.toLowerCase()}`] || '';

      let remainingDem = localDemand[cls.id][subjectName] || 0;

      for (const periodId of shuffledPeriodIds) {
        if (remainingDem <= 0) break;

        const daysToFill = Math.min(remainingDem, DAYS.length);

        // Find which days have this slot empty and teacher free
        const validDays = DAYS.filter(
          (day) =>
            !grid[cls.id][day][periodId].subject &&
            !isTeacherOccupied(teacher, day, periodId)
        );

        if (validDays.length < daysToFill) continue; // not enough days for a full column

        // Assign to first daysToFill valid days
        validDays.slice(0, daysToFill).forEach((day) => {
          // Also check sports cap before assigning
          const isSports = sportsSubjectNames && sportsSubjectNames.has(subjectName.trim().toLowerCase());
          if (isSports) {
            const slotKey = `${day}::${periodId}`;
            if ((sportsOccupancy.get(slotKey) || 0) >= MAX_CONCURRENT_SPORTS_CLASSES) return;
          }

          grid[cls.id][day][periodId] = { subject: subjectName, teacher };
          markTeacherOccupied(teacher, day, periodId);
          localDemand[cls.id][subjectName]--;
          if (localDemand[cls.id][subjectName] <= 0) delete localDemand[cls.id][subjectName];
          remainingDem--;

          if (isSports) {
            const slotKey = `${day}::${periodId}`;
            sportsOccupancy.set(slotKey, (sportsOccupancy.get(slotKey) || 0) + 1);
          }
        });

        if (remainingDem <= 0) break; // fully satisfied in this column
        // If still remaining demand (> 6 periods), loop will pick another column
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 3: Main greedy fill — process every (day, period) slot
  // ---------------------------------------------------------------------------
  allSlotPairs.forEach(([day, periodId]) => {
    shuffledClasses.forEach((cls) => {
      if (grid[cls.id][day][periodId].subject) return; // already filled

      const candidates = getCandidates(cls.id);
      for (const [subjectName] of candidates) {
        const teacherName = teacherLookup[`${cls.id}::${subjectName.toLowerCase()}`] || '';
        const success = tryAssign(cls.id, day, periodId, subjectName, teacherName, periodIds);
        if (success) break;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 4: Second pass — fill remaining empty slots using subjects with
  //          remaining demand (relaxing MAX_SAME_SUBJECT_PER_DAY for stragglers)
  // ---------------------------------------------------------------------------
  DAYS.forEach((day) => {
    periodIds.forEach((periodId) => {
      shuffledClasses.forEach((cls) => {
        if (grid[cls.id][day][periodId].subject) return;

        // Lab subjects stay out: a single here would split a double.
        const candidates = Object.entries(localDemand[cls.id] || {})
          .filter(([subjectName, rem]) => rem > 0 && !consecutiveSet.has(subjectName.toLowerCase()))
          .sort(([, a], [, b]) => b - a);

        for (const [subjectName] of candidates) {
          const teacherName = teacherLookup[`${cls.id}::${subjectName.toLowerCase()}`] || '';
          if (isTeacherOccupied(teacherName, day, periodId)) continue;
          if (grid[cls.id][day][periodId].subject) break;

          // Sports cap still applies in phase 4
          const isSp = sportsSubjectNames && sportsSubjectNames.has(subjectName.trim().toLowerCase());
          if (isSp) {
            const sk = `${day}::${periodId}`;
            if ((sportsOccupancy.get(sk) || 0) >= MAX_CONCURRENT_SPORTS_CLASSES) continue;
          }

          grid[cls.id][day][periodId] = { subject: subjectName, teacher: teacherName };
          markTeacherOccupied(teacherName, day, periodId);
          localDemand[cls.id][subjectName]--;
          if (localDemand[cls.id][subjectName] <= 0) {
            delete localDemand[cls.id][subjectName];
          }
          if (isSp) {
            const sk = `${day}::${periodId}`;
            sportsOccupancy.set(sk, (sportsOccupancy.get(sk) || 0) + 1);
          }
          break;
        }
      });
    });
  });

  return { grid, remainingDemand: localDemand, locked };
};

// ---------------------------------------------------------------------------
// Repair phase: place what the greedy pass left out by swapping lessons
// ---------------------------------------------------------------------------
//
// The greedy pass stops when a class's last free periods fall exactly when its
// teacher is busy elsewhere. For a missing lesson (class C, teacher T) take a
// period A where C is free and a period B where T is free, then swap the A and B
// lessons of every class along the chain "T teaches C1 at A, C1's B teacher
// teaches C3 at A, ...". After the swap T is free at A and the lesson goes there.
// The chain never reaches C (classes are only entered through period-A lessons
// and C has none), so when no teacher has more periods than there are slots a
// clash-free placement always exists. Rule-placed cells are never moved, and
// moves that break a soft rule are only used after every rule-keeping move is
// exhausted, the same order the greedy pass relaxes them in.

const MAX_REPAIR_ROUNDS = 50;
const MAX_POLISH_ROUNDS = 6;
// Time budget for the whole generation; later attempts and polishing stop once it's spent.
const GENERATION_BUDGET_MS = 6000;
const SAME_DAY_WEIGHT = 3;

/** Teachers in a cell; parallel-pair cells hold two ("A/B"). */
const cellTeachers = (cell) => (cell && cell.teacher
  ? cell.teacher.split('/').map((name) => name.trim()).filter(Boolean)
  : []);

const repairGrid = ({
  grid,
  remainingDemand,
  locked,
  classes,
  periodIds,
  teacherLookup,
  consecutiveSet,
  consecutiveCountMap,
  sportsSubjectNames,
  deadline = Infinity,
}) => {
  const slots = DAYS.flatMap((day) => periodIds.map((periodId) => ({ day, periodId, key: `${day}::${periodId}` })));
  const isLocked = (classId, slot) => locked.has(`${classId}::${slot.key}`);
  const isSports = (subject) => Boolean(subject) && sportsSubjectNames.has(subject.trim().toLowerCase());

  // teacher → slotKey → Set<classId>
  const busy = new Map();
  const occupy = (teacher, slotKey, classId, on) => {
    if (!busy.has(teacher)) busy.set(teacher, new Map());
    const bySlot = busy.get(teacher);
    if (!bySlot.has(slotKey)) bySlot.set(slotKey, new Set());
    if (on) bySlot.get(slotKey).add(classId);
    else bySlot.get(slotKey).delete(classId);
  };
  const classesOf = (teacher, slotKey) => [...(busy.get(teacher)?.get(slotKey) || [])];
  const isFree = (teacher, slotKey) => !teacher || classesOf(teacher, slotKey).length === 0;

  const getCell = (classId, slot) => grid[classId][slot.day][slot.periodId];
  const setCell = (classId, slot, cell) => {
    cellTeachers(getCell(classId, slot)).forEach((teacher) => occupy(teacher, slot.key, classId, false));
    grid[classId][slot.day][slot.periodId] = cell;
    cellTeachers(cell).forEach((teacher) => occupy(teacher, slot.key, classId, true));
  };

  classes.forEach((cls) => slots.forEach((slot) => {
    cellTeachers(getCell(cls.id, slot)).forEach((teacher) => occupy(teacher, slot.key, cls.id, true));
  }));

  // Soft-rule cost of the parts of the grid a move touches.
  const classDayCost = (classId, day) => {
    const counts = {};
    periodIds.forEach((periodId) => {
      const subject = grid[classId][day][periodId].subject;
      if (subject) counts[subject.toLowerCase()] = (counts[subject.toLowerCase()] || 0) + 1;
    });
    return Object.values(counts).reduce((sum, n) => sum + Math.max(0, n - MAX_SAME_SUBJECT_PER_DAY), 0);
  };
  const teacherDayCost = (teacher, day) => {
    let cost = 0;
    let run = 0;
    periodIds.forEach((periodId) => {
      run = isFree(teacher, `${day}::${periodId}`) ? 0 : run + 1;
      if (run > MAX_CONSECUTIVE_TEACHER_PERIODS) cost += 1;
    });
    return cost;
  };
  const sportsOverflow = (slot) => {
    const count = classes.filter((cls) => isSports(getCell(cls.id, slot).subject)).length;
    return Math.max(0, count - MAX_CONCURRENT_SPORTS_CLASSES);
  };
  const scopeCost = (classIds, teachers, touchedSlots) => {
    const days = [...new Set(touchedSlots.map((slot) => slot.day))];
    let soft = 0;
    classIds.forEach((classId) => days.forEach((day) => { soft += classDayCost(classId, day); }));
    teachers.forEach((teacher) => days.forEach((day) => { soft += teacherDayCost(teacher, day); }));
    const sports = touchedSlots.reduce((sum, slot) => sum + sportsOverflow(slot), 0);
    return { soft, sports };
  };

  /**
   * Classes whose A and B lessons must swap so `teacher` becomes free at A,
   * or null when the chain runs into a locked or shared cell.
   */
  const buildChain = (teacher, slotA, slotB) => {
    const chain = [];
    const inChain = new Set();
    let current = teacher;
    for (let guard = 0; guard <= classes.length; guard += 1) {
      const atA = classesOf(current, slotA.key);
      if (atA.length === 0) return chain;
      if (atA.length > 1) return null; // a common period: several classes at once
      const classId = atA[0];
      if (inChain.has(classId)) return chain; // same teacher at A and B in this class
      if (isLocked(classId, slotA) || isLocked(classId, slotB)) return null;
      const cellA = getCell(classId, slotA);
      const cellB = getCell(classId, slotB);
      if (cellTeachers(cellA).length > 1 || cellTeachers(cellB).length > 1) return null;
      chain.push(classId);
      inChain.add(classId);
      const [next] = cellTeachers(cellB);
      if (!next) return chain;
      current = next;
    }
    return null;
  };

  const swapAll = (chain, slotA, slotB) => {
    const cells = chain.map((classId) => [getCell(classId, slotA), getCell(classId, slotB)]);
    chain.forEach((classId, i) => {
      setCell(classId, slotA, { subject: '', teacher: '' });
      setCell(classId, slotB, { subject: '', teacher: '' });
      setCell(classId, slotA, cells[i][1]);
      setCell(classId, slotB, cells[i][0]);
    });
  };

  /** Try one way of placing the lesson; returns its cost, leaving the grid unchanged. */
  const evaluate = (classId, subject, teacher, slotA, slotB, chain) => {
    const touched = slotB ? [slotA, slotB] : [slotA];
    const classIds = [classId, ...chain];
    const teachers = new Set(teacher ? [teacher] : []);
    chain.forEach((cid) => touched.forEach((slot) => cellTeachers(getCell(cid, slot)).forEach((t) => teachers.add(t))));
    const before = scopeCost(classIds, teachers, touched);
    if (chain.length) swapAll(chain, slotA, slotB);
    setCell(classId, slotA, { subject, teacher });
    const after = scopeCost(classIds, teachers, touched);
    setCell(classId, slotA, { subject: '', teacher: '' });
    if (chain.length) swapAll(chain, slotA, slotB);
    return { soft: after.soft - before.soft, sports: after.sports - before.sports };
  };

  const placeOne = (classId, subject, relaxed) => {
    const teacher = teacherLookup[`${classId}::${subject.toLowerCase()}`] || '';
    const freeSlots = slots.filter((slot) => !getCell(classId, slot).subject);
    let best = null;
    const consider = (slotA, slotB, chain) => {
      const cost = evaluate(classId, subject, teacher, slotA, slotB, chain);
      if (cost.sports > 0) return;
      if (!relaxed && cost.soft > 0) return;
      const rank = [cost.soft, chain.length];
      if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && rank[1] < best.rank[1])) {
        best = { slotA, slotB, chain, rank };
      }
    };
    freeSlots.forEach((slotA) => {
      if (isFree(teacher, slotA.key)) {
        consider(slotA, null, []);
        return;
      }
      slots.forEach((slotB) => {
        if (slotB.key === slotA.key || !isFree(teacher, slotB.key)) return;
        const chain = buildChain(teacher, slotA, slotB);
        if (chain) consider(slotA, slotB, chain);
      });
    });
    if (!best) return false;
    if (best.chain.length) swapAll(best.chain, best.slotA, best.slotB);
    setCell(classId, best.slotA, { subject, teacher });
    remainingDemand[classId][subject] -= 1;
    if (remainingDemand[classId][subject] <= 0) delete remainingDemand[classId][subject];
    return true;
  };

  // Rule-keeping moves first; then allow soft-rule breaks for whatever is left.
  [false, true].forEach((relaxed) => {
    for (let round = 0; round < MAX_REPAIR_ROUNDS; round += 1) {
      if (Date.now() > deadline) break;
      const missing = shuffle(Object.entries(remainingDemand)
        .flatMap(([classId, subjectMap]) => Object.entries(subjectMap)
        // A lab subject is only repaired as a leftover single (an odd period count).
        .filter(([subject, count]) => count > 0
          && (!consecutiveSet.has(subject.toLowerCase()) || count < (consecutiveCountMap[subject.toLowerCase()] || 2)))
        .map(([subject]) => [classId, subject])));
      if (!missing.length) return;
      const placed = missing.filter(([classId, subject]) => placeOne(classId, subject, relaxed)).length;
      if (!placed) break;
    }
  });

  // Polish: swap two movable periods of one class whenever that lowers the
  // soft-rule cost. A subject three times in a day weighs more than a long
  // teacher run, since every student in the class feels it.
  const weighted = (classIds, teachers, touchedSlots) => {
    const days = [...new Set(touchedSlots.map((slot) => slot.day))];
    let cost = 0;
    classIds.forEach((classId) => days.forEach((day) => { cost += SAME_DAY_WEIGHT * classDayCost(classId, day); }));
    teachers.forEach((teacher) => days.forEach((day) => { cost += teacherDayCost(teacher, day); }));
    return { cost, sports: touchedSlots.reduce((sum, slot) => sum + sportsOverflow(slot), 0) };
  };
  /**
   * Classes that must swap their slot1/slot2 lessons together so no teacher is
   * double-booked when `classId` swaps its own (a Kempe chain), or null when the
   * chain reaches a locked or shared cell.
   */
  const swapGroup = (classId, slot1, slot2) => {
    const group = new Set([classId]);
    const queue = [classId];
    while (queue.length) {
      const current = queue.shift();
      if (isLocked(current, slot1) || isLocked(current, slot2)) return null;
      const teachers1 = cellTeachers(getCell(current, slot1));
      const teachers2 = cellTeachers(getCell(current, slot2));
      if (teachers1.length > 1 || teachers2.length > 1) return null;
      // A teacher moving into a period must leave whichever other class holds them there.
      const pulled = [
        ...teachers1.flatMap((t) => classesOf(t, slot2.key)),
        ...teachers2.flatMap((t) => classesOf(t, slot1.key)),
      ];
      for (const other of pulled) {
        if (!group.has(other)) {
          if (group.size >= classes.length) return null;
          group.add(other);
          queue.push(other);
        }
      }
    }
    return [...group];
  };
  // Only lessons sitting in a rule break are worth moving.
  const isHot = (classId, slot) => {
    const cell = getCell(classId, slot);
    if (!cell.subject) return false;
    if (classDayCost(classId, slot.day) > 0) return true;
    return cellTeachers(cell).some((teacher) => teacherDayCost(teacher, slot.day) > 0);
  };
  for (let round = 0; round < MAX_POLISH_ROUNDS; round += 1) {
    if (Date.now() > deadline) break;
    let improved = false;
    classes.forEach((cls) => {
      const movable = slots.filter((slot) => !isLocked(cls.id, slot));
      const hot = movable.filter((slot) => isHot(cls.id, slot));
      for (const slot1 of hot) {
        for (const slot2 of movable) {
          if (slot2.key === slot1.key) continue;
          const cell1 = getCell(cls.id, slot1);
          const cell2 = getCell(cls.id, slot2);
          if (!cell1.subject) break; // moved away by an earlier swap
          if (cell1.subject === cell2.subject && cell1.teacher === cell2.teacher) continue;
          const group = swapGroup(cls.id, slot1, slot2);
          if (!group) continue;
          const teachers = [...new Set(group.flatMap((cid) => [
            ...cellTeachers(getCell(cid, slot1)), ...cellTeachers(getCell(cid, slot2)),
          ]))];
          const before = weighted(group, teachers, [slot1, slot2]);
          swapAll(group, slot1, slot2);
          const after = weighted(group, teachers, [slot1, slot2]);
          if (after.cost < before.cost && after.sports <= before.sports) {
            improved = true;
          } else {
            swapAll(group, slot1, slot2);
          }
        }
      }
    });
    if (!improved) break;
  }
};

/** Weighted soft-rule breaks in a grid, used to choose between equally full attempts. */
const countSoftBreaks = (grid, classes, periodIds) => {
  let breaks = 0;
  const teacherDays = new Map();
  classes.forEach((cls) => DAYS.forEach((day) => {
    const counts = {};
    periodIds.forEach((periodId, index) => {
      const cell = grid[cls.id][day][periodId];
      if (cell.subject) counts[cell.subject.toLowerCase()] = (counts[cell.subject.toLowerCase()] || 0) + 1;
      cellTeachers(cell).forEach((teacher) => {
        const key = `${teacher}::${day}`;
        if (!teacherDays.has(key)) teacherDays.set(key, new Set());
        teacherDays.get(key).add(index);
      });
    });
    const repeats = Object.values(counts).reduce((sum, n) => sum + Math.max(0, n - MAX_SAME_SUBJECT_PER_DAY), 0);
    breaks += SAME_DAY_WEIGHT * repeats;
  }));
  teacherDays.forEach((indexes) => {
    let run = 0;
    periodIds.forEach((_, index) => {
      run = indexes.has(index) ? run + 1 : 0;
      if (run > MAX_CONSECUTIVE_TEACHER_PERIODS) breaks += 1;
    });
  });
  return breaks;
};

// ---------------------------------------------------------------------------
// Build conflict report from remaining demand
// ---------------------------------------------------------------------------

const buildConflictReport = (remainingDemand, originalDemand, classes, sportsLimit = null, overload = null) => {
  const report = [];
  const classMap = {};
  (classes || []).forEach((cls) => {
    classMap[cls.id] = `${cls.className} ${cls.section}`.trim();
  });

  Object.entries(remainingDemand).forEach(([classId, subjMap]) => {
    Object.entries(subjMap).forEach(([subjectName, remaining]) => {
      if (remaining <= 0) return;
      const expected = (originalDemand[classId] || {})[subjectName] || 0;
      const actual = expected - remaining;
      report.push({
        classId,
        className: classMap[classId] || classId,
        subjectName,
        type: 'underallocated',
        expected,
        actual,
        message: [
          `${subjectName} needs ${remaining} more period(s) per week for ${classMap[classId] || classId}`,
          overload && overload.byClassSubject[`${classId}::${subjectName.toLowerCase()}`],
          sportsLimit && sportsLimit.subjects.has(subjectName.trim().toLowerCase())
            ? `At most ${MAX_CONCURRENT_SPORTS_CLASSES} classes can have sports in the same period, which allows `
              + `${sportsLimit.capacity} sports periods a week; your classes need ${sportsLimit.demand}`
            : '',
        ].filter(Boolean).join('. '),
      });
    });
  });

  return report;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a timetable from the provided TimetableState configuration.
 *
 * The output grid uses 0-based integer indices as period keys to match
 * the existing TimetableState.timetableGrid format used by ClassWise/TeacherWise.
 *
 * @param {object} state - The TimetableState document (plain JS object).
 * @returns {{ grid, conflictReport, stats }}
 */
const generate = (state) => {
  const startTime = Date.now();

  const {
    classes = [],
    subjects = [],
    teacherSubjectAllocations = [],
    periodAllocation = {},
    parallelSubjectPairs = [],
    commonPeriods = [],
    bellTimings = {},
  } = state;

  // Ordered teachable period rows (exclude breaks); index = period slot (0-based)
  const periodRows = (bellTimings.rows || []).filter((r) => r.type === 'period');
  // Use string slot indices ("0", "1", ...) as keys — consistent with JSON serialisation
  const periodIds = periodRows.map((_, idx) => String(idx));

  if (!periodRows.length) {
    return {
      grid: {},
      conflictReport: [
        {
          classId: '',
          className: 'Configuration',
          subjectName: '',
          type: 'unfilled',
          expected: 0,
          actual: 0,
          message: 'No period rows found in bell timings. Please configure Bell Timings first.',
        },
      ],
      stats: { totalSlots: 0, filledSlots: 0, conflictCount: 1, durationMs: 0 },
    };
  }

  if (!classes.length) {
    return {
      grid: {},
      conflictReport: [
        {
          classId: '',
          className: 'Configuration',
          subjectName: '',
          type: 'unfilled',
          expected: 0,
          actual: 0,
          message: 'No classes found. Please add classes in the Classes page first.',
        },
      ],
      stats: { totalSlots: 0, filledSlots: 0, conflictCount: 1, durationMs: 0 },
    };
  }

  const teacherLookup = buildTeacherLookup(teacherSubjectAllocations);
  const originalDemand = buildDemandMap(periodAllocation, classes);
  const consecutiveSet = buildConsecutiveSet(subjects);
  const consecutiveCountMap = buildConsecutiveCountMap(subjects);
  const commonPeriodMap = buildCommonPeriodMap(commonPeriods, classes);
  const parallelPairMap = buildParallelPairMap(parallelSubjectPairs);
  const sportsSubjectNames = buildSportsSubjectNames(subjects);

  const totalSlots = classes.length * DAYS.length * periodIds.length;

  let bestGrid = null;
  let bestFilled = -1;
  let bestSoftBreaks = Infinity;
  let bestRemainingDemand = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { grid, remainingDemand, locked } = runOneAttempt(
      classes,
      periodIds,
      originalDemand,
      teacherLookup,
      consecutiveSet,
      consecutiveCountMap,
      commonPeriodMap,
      parallelPairMap,
      sportsSubjectNames
    );

    repairGrid({
      grid,
      remainingDemand,
      locked,
      classes,
      periodIds,
      teacherLookup,
      consecutiveSet,
      consecutiveCountMap,
      sportsSubjectNames,
      deadline: startTime + GENERATION_BUDGET_MS,
    });

    const filled = countFilled(grid);
    const softBreaks = countSoftBreaks(grid, classes, periodIds);
    if (filled > bestFilled || (filled === bestFilled && softBreaks < bestSoftBreaks)) {
      bestFilled = filled;
      bestSoftBreaks = softBreaks;
      bestGrid = grid;
      bestRemainingDemand = remainingDemand;
    }

    // Nothing left to place and no rule bent: no need to try more
    const unmet = Object.values(remainingDemand).some((subjectMap) => Object.values(subjectMap).some((n) => n > 0));
    if (!unmet && softBreaks === 0) break;
    // Keep big schools responsive: stop trying once the time budget is spent.
    if (Date.now() - startTime > GENERATION_BUDGET_MS) break;
  }

  // Explain sports shortfalls that come from the "few classes at sports at once" rule.
  const sportsDemand = Object.values(originalDemand).reduce((sum, subjectMap) => sum + Object.entries(subjectMap)
    .filter(([subject]) => sportsSubjectNames.has(subject.trim().toLowerCase()))
    .reduce((acc, [, count]) => acc + count, 0), 0);
  const sportsCapacity = MAX_CONCURRENT_SPORTS_CLASSES * DAYS.length * periodIds.length;
  // Teachers given more periods than the week holds can never be fully placed.
  const weekSlots = DAYS.length * periodIds.length;
  const teacherLoad = {};
  Object.entries(originalDemand).forEach(([classId, subjectMap]) => {
    Object.entries(subjectMap).forEach(([subject, count]) => {
      const teacher = teacherLookup[`${classId}::${subject.toLowerCase()}`];
      if (teacher) teacherLoad[teacher] = (teacherLoad[teacher] || 0) + count;
    });
  });
  const byClassSubject = {};
  Object.entries(teacherLookup).forEach(([key, teacher]) => {
    if ((teacherLoad[teacher] || 0) > weekSlots) {
      byClassSubject[key] = `${teacher} has ${teacherLoad[teacher]} periods a week, but the week has only ${weekSlots}`;
    }
  });
  const conflictReport = buildConflictReport(
    bestRemainingDemand,
    originalDemand,
    classes,
    sportsDemand > sportsCapacity
      ? { subjects: sportsSubjectNames, capacity: sportsCapacity, demand: sportsDemand }
      : null,
    { byClassSubject }
  );

  return {
    grid: bestGrid,
    conflictReport,
    stats: {
      totalSlots,
      filledSlots: bestFilled,
      conflictCount: conflictReport.length,
      durationMs: Date.now() - startTime,
    },
  };
};

module.exports = { generate };
