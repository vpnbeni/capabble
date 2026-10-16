import React, { useState, useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Pencil,
  SearchX,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { AppDispatch, RootState } from "../redux/store";
import {
  showAddTeacherModal,
  showEditTeacherModal,
  clearError,
  Teacher,
} from "../redux/slices/teacherSlice";
import StaffForm from "../components/staaf/StaffForm";
import { useTeachers, teacherKeys } from "../hooks/useTeachers";
import toast from "react-hot-toast";
import { useCentreDetails } from "../hooks/useCentreDetails";
import teacherService from "../services/teacherService";
import {
  Avatar,
  Badge,
  Banner,
  BulkBar,
  Button,
  Card,
  CardToolbar,
  DataTable,
  Dialog,
  EmptyState,
  Entity,
  FilterBar,
  Menu,
  Page,
  Select,
  StatCard,
  orDash,
  type DataTableColumn,
  type MenuItem,
} from "@/components/ui";
import "../components/exmcl/centre-teachers.css";

const DUTY_TYPE_OPTIONS = [
  'Centre Superintendent',
  'Deputy Centre Superintendent',
  'Observer',
  'Invigilator',
  'ASI (CCTV)',
  'ASI (Frisking Male)',
  'ASI (Frisking Female)',
  'Clerk',
  'Class IV',
];

const getDutyOptionsForDesignation = (
  designation: string | undefined,
  baseOptions: string[],
  enforceDesignationDutyRules: boolean
): string[] => {
  if (!enforceDesignationDutyRules) return baseOptions;
  const d = (designation || '').trim().toLowerCase();
  if (d === 'principal') return ['Centre Superintendent', 'Observer'];
  if (d === 'vice principal') return ['Centre Superintendent', 'Deputy Centre Superintendent'];
  return baseOptions;
};

const LIMIT = 50;
const getTeacherId = (teacher: Teacher) => teacher._id || teacher.id || "";
const UI_ONLY_HIDDEN_KEY = "capabble:exam-functionaries:hidden-teacher-ids";
const getTeacherHideKeys = (teacher: Partial<Teacher>) => {
  const keys: string[] = [];
  const id = String(teacher._id || '').trim();
  const altId = String(teacher.id || '').trim();
  const name = String(teacher.name || '').trim().toLowerCase();
  const oasisId = String(teacher.oasisId || '').trim().toLowerCase();
  const schoolCode = String(teacher.schoolCode || '').trim().toLowerCase();

  if (id) keys.push(`id:${id}`);
  if (altId) keys.push(`id:${altId}`);
  if (name || oasisId || schoolCode) keys.push(`fp:${name}|${oasisId}|${schoolCode}`);
  return keys;
};

const loadHiddenTeacherIdsFromStorage = (): Record<string, true> => {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(UI_ONLY_HIDDEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return {};
    const next: Record<string, true> = {};
    parsed.forEach((id) => {
      if (typeof id === "string" && id.trim()) next[id] = true;
    });
    return next;
  } catch {
    return {};
  }
};

const formatCount = (n: number) => Number(n || 0).toLocaleString("en-IN");
/** "Duty Type" → "Duty type": column labels come from callers in title case. */
const toSentenceCase = (text: string) => {
  const value = String(text || "").trim();
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/\b([A-Z])([a-z])/g, (_m, a: string, b: string) => `${a.toLowerCase()}${b}`);
};

type PageMessage = { tone: "success" | "danger" | "warning"; title?: string; text: string; details?: string[] };

type TeachersProps = {
  hideStats?: boolean;
  hideDutyType?: boolean;
  hideSchoolCode?: boolean;
  hideSchoolName?: boolean;
  sourceTeachers?: Teacher[];
  onAddTeacherCreated?: (teacher: Teacher) => void;
  onTeacherUpdated?: (teacher: Teacher) => void;
  showAddButton?: boolean;
  onDeleteSelected?: (ids: string[]) => Promise<string[] | void> | (string[] | void);
  disableApiMutations?: boolean;
  disableRowEdit?: boolean;
  entityLabelSingular?: string;
  hidePagination?: boolean;
  maxVisibleTeachers?: number;
  includeDutyTypeAssignedRecords?: boolean;
  includeAllRecords?: boolean;
  uiOnlyDelete?: boolean;
  dutyTypeColumnLabel?: string;
  dutyTypeOptions?: string[];
  enforceDesignationDutyRules?: boolean;
  alwaysEditableDutyType?: boolean;
  dutyTypeErrorLabel?: string;
  recordFilter?: (teacher: Teacher) => boolean;
  entityLabelPlural?: string;
};

type SortField = "name" | "dutyType" | "designation" | "subjectCode" | "subjects" | "schoolCode" | "schoolName";

const Teachers: React.FC<TeachersProps> = ({
  hideStats = false,
  hideDutyType = false,
  hideSchoolCode = false,
  hideSchoolName = false,
  sourceTeachers,
  onAddTeacherCreated,
  onTeacherUpdated,
  showAddButton = false,
  onDeleteSelected,
  disableApiMutations = false,
  disableRowEdit = false,
  entityLabelSingular = "functionary",
  hidePagination = true,
  maxVisibleTeachers,
  includeDutyTypeAssignedRecords = false,
  includeAllRecords = false,
  uiOnlyDelete = false,
  dutyTypeColumnLabel = "Duty Type",
  dutyTypeOptions = DUTY_TYPE_OPTIONS,
  enforceDesignationDutyRules = true,
  alwaysEditableDutyType = false,
  dutyTypeErrorLabel,
  recordFilter,
  entityLabelPlural: entityLabelPluralOverride,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterSchoolCode, setFilterSchoolCode] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterDutyType, setFilterDutyType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [joiningDateFrom] = useState("");
  const [joiningDateTo] = useState("");
  const [yearsOfExperience] = useState("");
  const [isTemplateDownloading, setIsTemplateDownloading] = useState(false);
  const [isTemplateUploading, setIsTemplateUploading] = useState(false);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // Until someone clicks a column header the list keeps its default order
  // (Principal, Vice Principal, then by name).
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [dutyTypeOverrides, setDutyTypeOverrides] = useState<Record<string, string>>({});
  const [hiddenDeletedTeacherIds, setHiddenDeletedTeacherIds] = useState<Record<string, true>>(
    () => loadHiddenTeacherIdsFromStorage()
  );
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Record<string, true>>({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [pageMessage, setPageMessage] = useState<PageMessage | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!uiOnlyDelete) return;
    const ids = Object.keys(hiddenDeletedTeacherIds).filter((id) => hiddenDeletedTeacherIds[id]);
    window.localStorage.setItem(UI_ONLY_HIDDEN_KEY, JSON.stringify(ids));
  }, [uiOnlyDelete, hiddenDeletedTeacherIds]);

  const [debouncedJoiningDateFrom, setDebouncedJoiningDateFrom] = useState("");
  const [debouncedJoiningDateTo, setDebouncedJoiningDateTo] = useState("");
  const [debouncedYearsOfExperience, setDebouncedYearsOfExperience] = useState("");
  const { data: centreDetails } = useCentreDetails();
  const storeError = useSelector((state: RootState) => state.teachers.error);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      if (!hidePagination) setCurrentPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [searchTerm, hidePagination]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedJoiningDateFrom(joiningDateFrom);
      if (!hidePagination) setCurrentPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [joiningDateFrom, hidePagination]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedJoiningDateTo(joiningDateTo);
      if (!hidePagination) setCurrentPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [joiningDateTo, hidePagination]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedYearsOfExperience(yearsOfExperience);
      if (!hidePagination) setCurrentPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [yearsOfExperience, hidePagination]);

  useEffect(() => {
    if (!pageMessage) return;
    const timeoutId = window.setTimeout(() => setPageMessage(null), pageMessage.tone === "success" ? 6000 : 12000);
    return () => window.clearTimeout(timeoutId);
  }, [pageMessage]);

  const queryLimit = typeof maxVisibleTeachers === 'number' ? maxVisibleTeachers : LIMIT
  const queryPage = hidePagination ? 1 : currentPage

  const queryParams = useMemo(
    () => ({
      page: queryPage,
      limit: queryLimit,
      search: debouncedSearchTerm || undefined,
      schoolCode: filterSchoolCode || undefined,
      subject: filterSubject || undefined,
      // Visibility behavior:
      // - includeAllRecords: no active/duty filtering
      // - includeDutyTypeAssignedRecords: active OR dutyType-assigned
      // - default: active only
      isActive: includeAllRecords
        ? undefined
        : (includeDutyTypeAssignedRecords ? undefined : true),
      includeDutyTypeAssigned: includeAllRecords ? undefined : (includeDutyTypeAssignedRecords || undefined),
      includeAllRecords: includeAllRecords || undefined,

      joiningDateFrom: debouncedJoiningDateFrom || undefined,
      joiningDateTo: debouncedJoiningDateTo || undefined,
      minExperience: debouncedYearsOfExperience ? parseInt(debouncedYearsOfExperience, 10) : undefined,
      sort: `${sortDirection === "desc" ? "-" : ""}${sortField}`,
    }),
    [
      queryPage,
      queryLimit,
      debouncedSearchTerm,
      filterSchoolCode,
      filterSubject,
      includeDutyTypeAssignedRecords,
      includeAllRecords,

      debouncedJoiningDateFrom,
      debouncedJoiningDateTo,
      debouncedYearsOfExperience,
      sortField,
      sortDirection,
    ]
  );

  const isLocalSource = Array.isArray(sourceTeachers);

  // When pagination UI is hidden (Exam Functionaries page) and no explicit max is provided,
  // we fetch *all* pages and show a single vertically scrollable table.
  const shouldFetchAll = !isLocalSource && hidePagination && typeof maxVisibleTeachers !== "number";

  const [allTeachers, setAllTeachers] = useState<Teacher[] | null>(null);
  const [allPagination, setAllPagination] = useState<{
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
  }>({ currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: LIMIT });
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);

  const { data, isLoading: queryLoading, error: queryError } = useTeachers(queryParams, {
    enabled: !isLocalSource && !shouldFetchAll,
  });

  useEffect(() => {
    if (!shouldFetchAll) return;

    let cancelled = false;
    const run = async () => {
      setAllLoading(true);
      setAllError(null);
      try {
        const pageSize = LIMIT;
        const first = await teacherService.getAll({ ...queryParams, page: 1, limit: pageSize });

        const merged: Teacher[] = [...(first.items ?? [])];
        const totalPages = Math.max(1, first.totalPages ?? 1);

        for (let p = 2; p <= totalPages; p++) {
          const page = await teacherService.getAll({ ...queryParams, page: p, limit: pageSize });
          merged.push(...(page.items ?? []));
        }

        if (cancelled) return;
        setAllTeachers(merged);
        setAllPagination({
          currentPage: first.currentPage ?? 1,
          totalPages,
          totalItems: first.totalItems ?? merged.length,
          itemsPerPage: first.itemsPerPage ?? pageSize,
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "The list didn’t load. Refresh the page to try again.";
        setAllError(msg);
        setAllTeachers([]);
        setAllPagination({ currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: LIMIT });
      } finally {
        if (cancelled) return;
        setAllLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [shouldFetchAll, queryParams]);

  const teachers = isLocalSource ? sourceTeachers : shouldFetchAll ? allTeachers : data?.items ?? null;
  const apiPagination = shouldFetchAll
    ? allPagination
    : data
      ? {
        currentPage: data.currentPage,
        totalPages: data.totalPages,
        totalItems: data.totalItems,
        itemsPerPage: data.itemsPerPage,
      }
      : { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: LIMIT };

  const loading = isLocalSource ? false : shouldFetchAll ? allLoading : queryLoading;
  const error = isLocalSource ? null : shouldFetchAll ? allError : storeError || queryError?.message || null;

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => dispatch(clearError()), 5000);
      return () => clearTimeout(t);
    }
  }, [error, dispatch]);

  const transformTeacher = (teacher: Teacher): Teacher => ({
    ...teacher,
    id: teacher._id || teacher.id,
    status: teacher.isActive ? "active" : "inactive",
    avatar: teacher.profileImage
      ? teacher.name.charAt(0).toUpperCase()
      : teacher.name.charAt(0).toUpperCase(),
    subjects: teacher.subjects || [],
  });

  const getPrimarySubjectName = (teacher: Teacher): string => {
    const firstSubject = Array.isArray(teacher.subjects) ? teacher.subjects[0] : null;
    if (firstSubject && typeof firstSubject === "object" && "name" in firstSubject) {
      return String((firstSubject as { name?: string }).name || "N/A");
    }
    return "N/A";
  };

  const getPrimarySubjectCode = (teacher: Teacher): string => {
    if (teacher.subjectCode) return teacher.subjectCode;
    const firstSubject = Array.isArray(teacher.subjects) ? teacher.subjects[0] : null;
    if (firstSubject && typeof firstSubject === "object" && "code" in firstSubject) {
      return String((firstSubject as { code?: string }).code || "N/A");
    }
    return "N/A";
  };

  const availableTeachers = useMemo(() => {
    if (!teachers) return [];

    return teachers
      .map(transformTeacher)
      // In includeAllRecords mode, show both active and inactive rows.
      // Otherwise keep old behavior (hide soft-deleted rows).
      .filter((teacher) => (includeAllRecords ? true : teacher.isActive !== false))
      // Optimistic/UI-only hide: match by ids and stable fingerprint across refreshes.
      .filter((teacher) => {
        const keys = getTeacherHideKeys(teacher);
        return !keys.some((key) => hiddenDeletedTeacherIds[key]);
      });
  }, [teachers, hiddenDeletedTeacherIds, includeAllRecords]);

  const schoolFilterOptions = useMemo(
    () =>
      Array.from(
        new Map(
          availableTeachers
            .filter((t) => String(t.schoolCode || t.schoolName || '').trim())
            .map((t) => {
              const value = String(t.schoolCode || '').trim();
              const label = `${t.schoolCode ? `${t.schoolCode} · ` : ''}${t.schoolName || 'School name not set'}`;
              return [value || String(t.schoolName || '').trim(), { value: value || String(t.schoolName || '').trim(), label }];
            })
        ).values()
      ),
    [availableTeachers]
  );

  const dutyTypeFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          availableTeachers
            .map((t) => String(t.dutyType || '').trim())
            .filter(Boolean)
        )
      ).map((dutyType) => ({ value: dutyType, label: dutyType })),
    [availableTeachers]
  );

  const subjectFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          availableTeachers
            .flatMap((t) => {
              const items: string[] = [];
              const subjectCode = String(getPrimarySubjectCode(t) || '').trim();
              const subjectName = String(getPrimarySubjectName(t) || '').trim();
              if (subjectCode && subjectCode !== 'N/A') items.push(subjectCode);
              if (subjectName && subjectName !== 'N/A') items.push(subjectName);
              return items;
            })
            .filter(Boolean)
        )
      ).map((subject) => ({ value: subject, label: subject })),
    [availableTeachers]
  );

  const activeFilterCount = [filterSchoolCode, filterDutyType, filterSubject].filter(Boolean).length;

  const filteredTeachers = useMemo(() => {
    const transformed = availableTeachers;

    const needle = (debouncedSearchTerm || '').trim().toLowerCase();
    const schoolFilter = filterSchoolCode.trim().toLowerCase();
    const subjectFilter = filterSubject.trim().toLowerCase();
    const dutyTypeFilter = filterDutyType.trim().toLowerCase();

    let filtered = transformed;

    if (recordFilter) {
      filtered = filtered.filter(recordFilter);
    }

    if (needle) {
      filtered = filtered.filter((teacher) => {
        const name = String(teacher.name || '').toLowerCase();
        const oasisId = String(teacher.oasisId || '').toLowerCase();
        const employeeId = String(teacher.employeeId || '').toLowerCase();
        const mobile = String(teacher.mobileNo || teacher.phone || '').toLowerCase();
        const schoolName = String(teacher.schoolName || '').toLowerCase();
        const schoolCode = String(teacher.schoolCode || '').toLowerCase();
        const subjectCode = getPrimarySubjectCode(teacher).toLowerCase();
        const subjectName = getPrimarySubjectName(teacher).toLowerCase();

        return (
          name.includes(needle) ||
          oasisId.includes(needle) ||
          employeeId.includes(needle) ||
          mobile.includes(needle) ||
          schoolName.includes(needle) ||
          schoolCode.includes(needle) ||
          subjectCode.includes(needle) ||
          subjectName.includes(needle)
        );
      });
    }

    if (schoolFilter) {
      filtered = filtered.filter((teacher) =>
        String(teacher.schoolCode || '').toLowerCase().includes(schoolFilter)
      );
    }

    if (subjectFilter) {
      filtered = filtered.filter((teacher) => {
        const subjectCode = getPrimarySubjectCode(teacher).toLowerCase();
        const subjectName = getPrimarySubjectName(teacher).toLowerCase();
        return subjectCode.includes(subjectFilter) || subjectName.includes(subjectFilter);
      });
    }

    if (dutyTypeFilter) {
      filtered = filtered.filter((teacher) =>
        String(teacher.dutyType || '').toLowerCase().includes(dutyTypeFilter)
      );
    }

    if (hasUserSorted) {
      const valueFor = (teacher: Teacher): string => {
        switch (sortField as SortField) {
          case "dutyType":
            return String(dutyTypeOverrides[getTeacherId(teacher)] ?? teacher.dutyType ?? "");
          case "subjectCode":
            return getPrimarySubjectCode(teacher);
          case "subjects":
            return getPrimarySubjectName(teacher);
          case "designation":
          case "schoolCode":
          case "schoolName":
          case "name":
            return String(teacher[sortField as "name"] || "");
          default:
            return String(teacher.name || "");
        }
      };
      const dir = sortDirection === "desc" ? -1 : 1;
      return [...filtered].sort(
        (a, b) => dir * valueFor(a).localeCompare(valueFor(b), undefined, { numeric: true, sensitivity: "base" })
      );
    }

    // Default sort: Principal first, then Vice Principal, then rest by name
    const designationPriority = (d: string | undefined): number => {
      const v = (d || '').trim().toUpperCase();
      if (v === 'PRINCIPAL') return 0;
      if (v === 'VICE PRINCIPAL') return 1;
      return 2;
    };

    return [...filtered].sort((a, b) => {
      const pa = designationPriority(a.designation);
      const pb = designationPriority(b.designation);
      if (pa !== pb) return pa - pb;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [availableTeachers, debouncedSearchTerm, filterSchoolCode, filterSubject, filterDutyType, recordFilter, hasUserSorted, sortField, sortDirection, dutyTypeOverrides]);
  const pagination = isLocalSource
    ? {
      currentPage: hidePagination ? 1 : currentPage,
      totalPages: hidePagination ? 1 : Math.max(1, Math.ceil(filteredTeachers.length / LIMIT)),
      totalItems: filteredTeachers.length,
      itemsPerPage: queryLimit,
    }
    : apiPagination;
  const displayTeachers = useMemo(() => {
    const max = typeof maxVisibleTeachers === 'number' ? maxVisibleTeachers : null

    if (!isLocalSource) {
      const limited = max ? filteredTeachers.slice(0, max) : filteredTeachers
      return limited
    }

    if (hidePagination) {
      const limited = max ? filteredTeachers.slice(0, max) : filteredTeachers
      return limited
    }

    const start = (currentPage - 1) * LIMIT
    const paged = filteredTeachers.slice(start, start + LIMIT)
    const limited = max ? paged.slice(0, max) : paged
    return limited
  }, [filteredTeachers, isLocalSource, currentPage, hidePagination, maxVisibleTeachers]);
  useEffect(() => {
    if (!isLocalSource || hidePagination) return;
    const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / LIMIT));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [isLocalSource, filteredTeachers.length, currentPage, hidePagination]);
  const rowIndexById = useMemo(
    () => new Map(displayTeachers.map((teacher, index) => [getTeacherId(teacher), index] as const)),
    [displayTeachers]
  );
  const visibleTeacherIds = useMemo(
    () => displayTeachers.map((teacher) => getTeacherId(teacher)).filter(Boolean),
    [displayTeachers]
  );
  const selectedTeacherList = useMemo(
    () => visibleTeacherIds.filter((id) => selectedTeacherIds[id]),
    [visibleTeacherIds, selectedTeacherIds]
  );
  const selectedCount = selectedTeacherList.length;
  const allVisibleSelected = visibleTeacherIds.length > 0 && selectedCount === visibleTeacherIds.length;

  const visibleTotalTeachers = filteredTeachers.length;
  const normalizeValue = (value: string | undefined) => String(value || "").trim().toLowerCase();
  const isSelfSchoolTeacher = (teacher: Teacher) => {
    const teacherSchoolCode = normalizeValue(teacher.schoolCode);
    const teacherSchoolName = normalizeValue(teacher.schoolName);
    const centreSchoolCode = normalizeValue(centreDetails?.centreSchoolCode);
    const centreName = normalizeValue(centreDetails?.centreName);

    if (centreSchoolCode) {
      return teacherSchoolCode === centreSchoolCode;
    }

    if (centreName) {
      return teacherSchoolName === centreName;
    }

    return false;
  };

  const activeCount = filteredTeachers.filter((t) => isSelfSchoolTeacher(t)).length;
  const inactiveCount = Math.max(0, filteredTeachers.length - activeCount);
  const entityLabelPlural = entityLabelPluralOverride
    || (/personnel$/i.test(entityLabelSingular)
      ? entityLabelSingular
      : entityLabelSingular.endsWith("y")
        ? `${entityLabelSingular.slice(0, -1)}ies`
        : `${entityLabelSingular}s`);
  const entityLabelPluralTitle = `${entityLabelPlural.charAt(0).toUpperCase()}${entityLabelPlural.slice(1)}`;
  const nounFor = (count: number) => (count === 1 ? entityLabelSingular : entityLabelPlural);
  const dutyLabel = toSentenceCase(dutyTypeColumnLabel);
  const dutyLabelLower = dutyLabel.toLowerCase();
  const srNoOffset = hidePagination ? 0 : (currentPage - 1) * LIMIT;
  const missingDutyCount = filteredTeachers.filter(
    (t) => !String(dutyTypeOverrides[getTeacherId(t)] ?? t.dutyType ?? "").trim()
  ).length;

  const invalidateTeachers = () => {
    if (isLocalSource) return;
    queryClient.invalidateQueries({ queryKey: teacherKeys.all });
  };

  const handleAddTeacherModalSuccess = (created?: Teacher) => {
    invalidateTeachers();
    if (created && onAddTeacherCreated) {
      onAddTeacherCreated(created);
    }
  };

  // Event handlers
  const handleAddTeacher = () => {
    if (disableApiMutations && !showAddButton) return;
    dispatch(showAddTeacherModal());
  };

  const handleEditTeacher = (teacher: Teacher) => {
    if (disableRowEdit) return;
    dispatch(showEditTeacherModal(teacher));
  };
  const toggleTeacherSelection = (teacherId: string, checked: boolean) => {
    if (!teacherId) return;
    setSelectedTeacherIds((prev) => {
      const next = { ...prev };
      if (checked) next[teacherId] = true;
      else delete next[teacherId];
      return next;
    });
  };
  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedTeacherIds((prev) => {
      const next = { ...prev };
      visibleTeacherIds.forEach((teacherId) => {
        if (checked) next[teacherId] = true;
        else delete next[teacherId];
      });
      return next;
    });
  };
  const clearSelection = () => setSelectedTeacherIds({});

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setHasUserSorted(true);
    if (!hidePagination) setCurrentPage(1);
  };

  /** Runs after the confirming Dialog. `targetIds` is the selection, or one row from its menu. */
  const handleBulkDelete = async (targetIds: string[]) => {
    if (targetIds.length === 0 || isBulkDeleting) return;
    setIsBulkDeleting(true);
    try {
      let deletedIds: string[] = [];
      let failedCount = 0;
      if (onDeleteSelected) {
        const result = await onDeleteSelected(targetIds);
        deletedIds = Array.isArray(result) ? result : [...targetIds];
        failedCount = targetIds.length - deletedIds.length;
      } else if (uiOnlyDelete) {
        // UI-only delete: hide selected rows locally without mutating backend data.
        deletedIds = [...targetIds];
      } else {
        const results = await Promise.allSettled(
          targetIds.map((teacherId) => teacherService.deleteById(teacherId, includeAllRecords))
        );
        results.forEach((result, index) => {
          if (result.status === "fulfilled") deletedIds.push(targetIds[index]);
          else failedCount += 1;
        });
      }
      if (deletedIds.length > 0) {
        const selectedTeachers = displayTeachers.filter((teacher) => targetIds.includes(getTeacherId(teacher)));
        setHiddenDeletedTeacherIds((prev) => {
          const next = { ...prev };
          deletedIds.forEach((teacherId) => {
            if (teacherId) next[`id:${teacherId}`] = true;
          });
          selectedTeachers.forEach((teacher) => {
            getTeacherHideKeys(teacher).forEach((key) => {
              next[key] = true;
            });
          });
          return next;
        });
        setSelectedTeacherIds((prev) => {
          const next = { ...prev };
          deletedIds.forEach((teacherId) => {
            delete next[teacherId];
          });
          return next;
        });
        toast.success(`${deletedIds.length} ${nounFor(deletedIds.length)} deleted`);
        invalidateTeachers();
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} ${nounFor(failedCount)} couldn’t be deleted. Try again.`);
      }
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const downloadImportTemplate = async () => {
    try {
      setIsTemplateDownloading(true);
      const blob = await teacherService.downloadImportTemplate("csv");

      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `exam_functionaries_template_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Template download failed:", error);
      setPageMessage({ tone: "danger", text: "The template didn’t download. Try again." });
    } finally {
      setIsTemplateDownloading(false);
    }
  };

  const uploadTemplateFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    try {
      setIsTemplateUploading(true);
      const response = await teacherService.uploadImportTemplate(selectedFile);

      const result = response?.data;
      const errorPreview: string[] = (result?.errors || [])
        .slice(0, 5)
        .map((item: { row: number; message: string }) => `Row ${item.row}: ${item.message}`);
      const errorCount = result?.errors?.length ?? 0;
      const warningCount = result?.warnings?.length ?? 0;
      setPageMessage({
        tone: errorCount > 0 ? "warning" : "success",
        title: "Import finished",
        text: `${result?.created ?? 0} added, ${result?.updated ?? 0} updated, ${result?.skipped ?? 0} skipped, ${errorCount} with errors, ${warningCount} with warnings.`,
        details: errorPreview.length ? errorPreview : undefined,
      });
      invalidateTeachers();
    } catch (error: any) {
      console.error("Template upload failed:", error);
      const message =
        error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || "The file didn’t import. Check it is the filled CSV or XLSX template and try again.";
      setPageMessage({ tone: "danger", text: message });
    } finally {
      setIsTemplateUploading(false);
    }
  };

  const saveDutyType = async (teacher: Teacher, newDutyType: string) => {
    const teacherId = teacher._id || teacher.id!;
    if (!newDutyType) return;
    setDutyTypeOverrides((prev) => ({ ...prev, [teacherId]: newDutyType }));
    try {
      await teacherService.update(teacherId, { dutyType: newDutyType } as any);
      queryClient.invalidateQueries({ queryKey: teacherKeys.all });
      const successLabel = toSentenceCase(dutyTypeErrorLabel || dutyTypeColumnLabel);
      toast.success(`${successLabel} changed for ${teacher.name}`);
    } catch (err: any) {
      setDutyTypeOverrides((prev) => { const next = { ...prev }; delete next[teacherId]; return next; });
      const fallbackLabel = (dutyTypeErrorLabel || dutyTypeColumnLabel).toLowerCase();
      const serverMessage = String(err?.response?.data?.message || '').trim();
      toast.error(serverMessage || `The ${fallbackLabel} didn’t change. Try again.`);
    }
  };

  const renderDutyType = (teacher: Teacher) => {
    const currentDuty = dutyTypeOverrides[teacher._id || teacher.id!] ?? teacher.dutyType ?? '';
    const optionList = getDutyOptionsForDesignation(
      teacher.designation,
      dutyTypeOptions,
      enforceDesignationDutyRules
    );
    const normalizedCurrentDuty = String(currentDuty || '').trim();
    const optionsWithCurrent = normalizedCurrentDuty && !optionList.includes(normalizedCurrentDuty)
      ? [normalizedCurrentDuty, ...optionList]
      : optionList;

    if (currentDuty && !alwaysEditableDutyType) {
      return <Badge tone="neutral" dot={false}>{currentDuty}</Badge>;
    }
    return (
      <Select
        size="sm"
        className="cx-teachers-duty"
        aria-label={`${dutyLabel} for ${teacher.name}`}
        value={normalizedCurrentDuty}
        onChange={(e) => {
          void saveDutyType(teacher, e.target.value);
        }}
        placeholder={`Choose ${dutyLabelLower}`}
        options={optionsWithCurrent}
      />
    );
  };

  const hasFilters = Boolean(searchTerm.trim() || activeFilterCount > 0);
  const clearFilters = () => {
    setSearchTerm("");
    setFilterSchoolCode("");
    setFilterSubject("");
    setFilterDutyType("");
  };

  const canAdd = !disableApiMutations || showAddButton;
  const deleteCount = deleteTargetIds?.length ?? 0;
  const deleteDescription = onDeleteSelected
    ? `They are removed from this list.`
    : uiOnlyDelete
      ? `They are hidden from this list on this device. Their records stay on file.`
      : `Their records are deleted. This can’t be undone.`;

  const columns: DataTableColumn<Teacher>[] = [
    {
      key: "srNo",
      header: "No.",
      numeric: true,
      width: 56,
      mobile: "hidden",
      render: (teacher) => srNoOffset + (rowIndexById.get(getTeacherId(teacher)) ?? 0) + 1,
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      mobile: "title",
      render: (teacher) => {
        const currentDuty = String(dutyTypeOverrides[teacher._id || teacher.id!] ?? teacher.dutyType ?? "").trim().toLowerCase();
        const oasisNotNeeded = currentDuty === "class iv" || currentDuty === "others";
        const oasisLine = oasisNotNeeded
          ? "OASIS ID not needed"
          : teacher.oasisId
            ? `OASIS ID ${teacher.oasisId}`
            : null;
        return (
          <span className="cx-teachers-name">
            <Avatar name={teacher.name || entityLabelSingular} src={teacher.profileImage || null} size="md" />
            <Entity
              primary={orDash(teacher.name)}
              secondary={oasisLine ? <span className="is-num">{oasisLine}</span> : undefined}
            />
          </span>
        );
      },
    },
    ...(!hideDutyType
      ? [{
        key: "dutyType",
        header: dutyLabel,
        headerLabel: dutyLabel,
        sortable: true,
        interactive: true,
        render: renderDutyType,
      } as DataTableColumn<Teacher>]
      : []),
    {
      key: "designation",
      header: "Designation",
      sortable: true,
      mobile: "subtitle",
      render: (teacher) =>
        String(teacher.designation || "").trim()
          ? <Badge tone="neutral" dot={false}>{teacher.designation}</Badge>
          : <span className="cb-subtle">—</span>,
    },
    {
      key: "subjectCode",
      header: "Subject code",
      sortable: true,
      render: (teacher) => {
        const code = getPrimarySubjectCode(teacher);
        return code === "N/A" ? "—" : orDash(code);
      },
    },
    {
      key: "subjects",
      header: "Subject",
      sortable: true,
      render: (teacher) => {
        const name = getPrimarySubjectName(teacher);
        return name === "N/A" ? "—" : orDash(name);
      },
    },
    ...(!hideSchoolCode
      ? [{
        key: "schoolCode",
        header: "School code",
        sortable: true,
        mobile: "hidden",
        render: (teacher: Teacher) => (teacher.schoolCode === "N/A" ? "—" : orDash(teacher.schoolCode)),
      } as DataTableColumn<Teacher>]
      : []),
    ...(!hideSchoolName
      ? [{
        key: "schoolName",
        header: "School",
        sortable: true,
        mobile: "hidden",
        render: (teacher: Teacher) => {
          const value = teacher.schoolName === "N/A" ? "" : String(teacher.schoolName || "");
          return value ? <span className="cx-teachers-school" title={value}>{value}</span> : "—";
        },
      } as DataTableColumn<Teacher>]
      : []),
    ...(includeAllRecords
      ? [{
        key: "status",
        header: "Status",
        mobile: "aside",
        render: (teacher: Teacher) =>
          teacher.isActive === false ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="success">Active</Badge>,
      } as DataTableColumn<Teacher>]
      : []),
    {
      key: "actions",
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: "Actions",
      interactive: true,
      mobile: "hidden",
      width: 48,
      render: (teacher) => {
        const items: MenuItem[] = [];
        if (!disableRowEdit) {
          items.push({ label: "Edit details", icon: Pencil, onSelect: () => handleEditTeacher(teacher) });
          items.push({ divider: true });
        }
        items.push({
          label: `Delete ${entityLabelSingular}`,
          icon: Trash2,
          tone: "danger",
          disabled: isBulkDeleting,
          onSelect: () => setDeleteTargetIds([getTeacherId(teacher)].filter(Boolean)),
        });
        return <Menu label={`Actions for ${teacher.name}`} items={items} />;
      },
    },
  ];

  const showSchoolFilter = schoolFilterOptions.length > 0 || Boolean(filterSchoolCode);
  const showDutyFilter = dutyTypeFilterOptions.length > 0 || Boolean(filterDutyType);
  const showSubjectFilter = subjectFilterOptions.length > 0 || Boolean(filterSubject);
  const hiddenByLimit = displayTeachers.length < filteredTeachers.length && hidePagination;

  return (
    <Page width="full">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {pageMessage ? (
        <Banner tone={pageMessage.tone} title={pageMessage.title} onDismiss={() => setPageMessage(null)}>
          {pageMessage.text}
          {pageMessage.details ? (
            <ul className="cx-teachers-banner-list">
              {pageMessage.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </Banner>
      ) : null}

      {!hideStats ? (
        <section className="cb-stats" aria-label={`${entityLabelPluralTitle} totals`}>
          <StatCard
            label={entityLabelPluralTitle}
            value={formatCount(visibleTotalTeachers)}
            icon={Users}
            hint={hasFilters ? "Matching the filters" : "In this list"}
          />
          <StatCard
            label="From this school"
            value={formatCount(activeCount)}
            icon={Building2}
            hint={centreDetails?.centreName ? orDash(centreDetails.centreName) : "The centre’s own school"}
          />
          <StatCard
            label="From other schools"
            value={formatCount(inactiveCount)}
            hint="Outside the centre’s school"
          />
          {!hideDutyType ? (
            <StatCard
              label={`${dutyLabel} not set`}
              value={formatCount(missingDutyCount)}
              icon={Tag}
              hint={missingDutyCount > 0 ? `Choose one in the ${dutyLabelLower} column` : "Everyone has one"}
            />
          ) : null}
        </section>
      ) : null}

      <Card flush title={entityLabelPluralTitle}>
        <CardToolbar className="cx-teachers-toolbar">
          <FilterBar
            search={{
              placeholder: `Search name, ID, phone, subject or school`,
              value: searchTerm,
              onChange: setSearchTerm,
              label: `Search ${entityLabelPlural}`,
            }}
            filters={
              showSchoolFilter || showDutyFilter || showSubjectFilter || hasFilters ? (
                <>
                  {showSchoolFilter ? (
                    <Select
                      aria-label="School"
                      size="sm"
                      value={filterSchoolCode}
                      onChange={(e) => setFilterSchoolCode(e.target.value)}
                      placeholder="All schools"
                      options={schoolFilterOptions}
                     
                    />
                  ) : null}
                  {showDutyFilter ? (
                    <Select
                      aria-label={dutyLabel}
                      size="sm"
                      value={filterDutyType}
                      onChange={(e) => setFilterDutyType(e.target.value)}
                      placeholder={`Any ${dutyLabelLower}`}
                      options={dutyTypeFilterOptions}
                     
                    />
                  ) : null}
                  {showSubjectFilter ? (
                    <Select
                      aria-label="Subject"
                      size="sm"
                      value={filterSubject}
                      onChange={(e) => setFilterSubject(e.target.value)}
                      placeholder="All subjects"
                      options={subjectFilterOptions}
                     
                    />
                  ) : null}
                  {hasFilters ? (
                    <Button variant="tertiary" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null}
                </>
              ) : undefined
            }
            actions={
              !disableApiMutations || canAdd ? (
                <>
                  {!disableApiMutations ? (
                    <>
                      <input
                        ref={templateInputRef}
                        type="file"
                        accept=".csv,.xlsx"
                        aria-label={`Upload filled ${entityLabelSingular} template`}
                        onChange={uploadTemplateFile}
                        hidden
                      />
                      <Menu
                        align="end"
                        items={[
                          {
                            label: isTemplateDownloading ? "Downloading template…" : "Download template",
                            icon: Download,
                            disabled: loading || isTemplateDownloading || isTemplateUploading,
                            onSelect: downloadImportTemplate,
                          },
                          {
                            label: isTemplateUploading ? "Importing…" : "Import filled template",
                            icon: Upload,
                            hint: ".csv or .xlsx",
                            disabled: loading || isTemplateDownloading || isTemplateUploading,
                            onSelect: () => templateInputRef.current?.click(),
                          },
                        ]}
                        trigger={(props) => (
                          <Button
                            size="sm"
                            icon={FileSpreadsheet}
                            iconRight={ChevronDown}
                            loading={isTemplateUploading || isTemplateDownloading}
                            {...props}
                          >
                            Import
                          </Button>
                        )}
                      />
                    </>
                  ) : null}
                  {canAdd ? (
                    <Button variant="primary" size="sm" icon={UserPlus} onClick={handleAddTeacher} disabled={loading}>
                      Add {entityLabelSingular}
                    </Button>
                  ) : null}
                </>
              ) : undefined
            }
          />
          <BulkBar
            count={selectedCount}
            noun={entityLabelSingular}
            nounPlural={entityLabelPlural}
            onClear={clearSelection}
            busy={isBulkDeleting}
          >
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              loading={isBulkDeleting}
              disabled={loading}
              onClick={() => setDeleteTargetIds([...selectedTeacherList])}
            >
              {isBulkDeleting ? "Deleting" : `Delete ${selectedCount} ${nounFor(selectedCount)}`}
            </Button>
          </BulkBar>
        </CardToolbar>

        <DataTable
          caption={entityLabelPluralTitle}
          columns={columns}
          rows={loading ? [] : displayTeachers}
          getRowKey={(teacher) => String(teacher.id || teacher._id)}
          onRowClick={disableRowEdit ? undefined : handleEditTeacher}
          loading={loading}
          loadingLabel={`Loading ${entityLabelPlural}`}
          maxHeight={hideStats ? "min(820px, calc(100vh - 220px))" : "min(720px, calc(100vh - 320px))"}
          sort={hasUserSorted ? { key: sortField, direction: sortDirection } : null}
          onSort={handleSort}
          selection={{
            isSelected: (teacher) => Boolean(selectedTeacherIds[getTeacherId(teacher)]),
            onToggle: (teacher) => {
              const id = getTeacherId(teacher);
              toggleTeacherSelection(id, !selectedTeacherIds[id]);
            },
            allSelected: allVisibleSelected,
            someSelected: selectedCount > 0,
            onToggleAll: () => toggleSelectAllVisible(!allVisibleSelected),
            rowLabel: (teacher) => `Select ${teacher.name}`,
          }}
          empty={
            hasFilters ? (
              <EmptyState
                compact
                icon={SearchX}
                title={`No ${entityLabelPlural} match these filters`}
                body="Try another name or ID, or clear the filters."
                action={
                  <Button size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={Users}
                title={`No ${entityLabelPlural} yet`}
                body={
                  !disableApiMutations
                    ? `Add ${entityLabelPlural} one at a time, or download the template and import them all at once.`
                    : `${entityLabelPluralTitle} you add will be listed here.`
                }
                action={
                  !disableApiMutations ? (
                    <Button variant="primary" size="sm" icon={UserPlus} onClick={handleAddTeacher} disabled={loading}>
                      Add {entityLabelSingular}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          footer={
            !loading && displayTeachers.length > 0 ? (
              !hidePagination && pagination.totalPages > 1 ? (
                <>
                  <span className="is-num">
                    {formatCount((currentPage - 1) * 50 + 1)}–{formatCount(Math.min(currentPage * 50, pagination.totalItems))} of{" "}
                    {formatCount(pagination.totalItems)} {entityLabelPlural} · page {currentPage} of {pagination.totalPages}
                  </span>
                  <span className="cx-teachers-pager">
                    <Button
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                      disabled={currentPage === pagination.totalPages}
                    >
                      Next
                    </Button>
                  </span>
                </>
              ) : (
                <span className="is-num">
                  {hiddenByLimit
                    ? `Showing ${formatCount(displayTeachers.length)} of ${formatCount(filteredTeachers.length)} ${entityLabelPlural}`
                    : `${formatCount(displayTeachers.length)} ${nounFor(displayTeachers.length)}`}
                </span>
              )
            ) : null
          }
        />
      </Card>

      <Dialog
        open={deleteTargetIds !== null}
        onClose={() => setDeleteTargetIds(null)}
        tone="danger"
        size="sm"
        title={`Delete ${deleteCount} ${nounFor(deleteCount)}?`}
        description={deleteDescription}
        footer={
          <>
            <Button onClick={() => setDeleteTargetIds(null)}>Keep {nounFor(deleteCount)}</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                const ids = deleteTargetIds || [];
                setDeleteTargetIds(null);
                void handleBulkDelete(ids);
              }}
            >
              Delete {deleteCount} {nounFor(deleteCount)}
            </Button>
          </>
        }
      />

      {/* Add / edit forms (opened through the teachers slice) */}
      <StaffForm
        mode="add"
        onSuccess={handleAddTeacherModalSuccess}
        entityLabelSingular={entityLabelSingular}
        dutyTypeOptions={dutyTypeOptions}
        enforceDesignationDutyRules={enforceDesignationDutyRules}
        dutyTypeLabel={dutyLabel}
      />
      <StaffForm
        mode="edit"
        entityLabelSingular={entityLabelSingular}
        dutyTypeOptions={dutyTypeOptions}
        enforceDesignationDutyRules={enforceDesignationDutyRules}
        dutyTypeLabel={dutyLabel}
        onSuccess={(updated?: Teacher) => {
          invalidateTeachers()
          if (updated && onTeacherUpdated) onTeacherUpdated(updated)
        }}
      />
    </Page>
  );
};

export default Teachers;
