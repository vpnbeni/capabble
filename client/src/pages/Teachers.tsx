import React, { useState, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { AppDispatch, RootState } from "../redux/store";
import {
  showAddTeacherModal,
  showEditTeacherModal,
  clearError,
  Teacher,
} from "../redux/slices/teacherSlice";
import AddTeacherModal from "../components/teachers/AddTeacherModal";
import EditTeacherModal from "../components/teachers/EditTeacherModal";
import ExportModal, { ExportFilters } from "../components/common/ExportModal";
import { Dropdown } from "../components/common/Dropdown";
import { useTeachers, teacherKeys } from "../hooks/useTeachers";
import toast from "react-hot-toast";
import { useCentreDetails } from "../hooks/useCentreDetails";
import teacherService from "../services/teacherService";



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
const UI_ONLY_HIDDEN_KEY = "sems:exam-functionaries:hidden-teacher-ids";
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
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const [joiningDateFrom] = useState("");
  const [joiningDateTo] = useState("");
  const [yearsOfExperience] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [isTemplateDownloading, setIsTemplateDownloading] = useState(false);
  const [isTemplateUploading, setIsTemplateUploading] = useState(false);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [dutyTypeOverrides, setDutyTypeOverrides] = useState<Record<string, string>>({});
  const [hiddenDeletedTeacherIds, setHiddenDeletedTeacherIds] = useState<Record<string, true>>(
    () => loadHiddenTeacherIdsFromStorage()
  );
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Record<string, true>>({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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
        const msg = err instanceof Error ? err.message : "Failed to load functionaries.";
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
              const label = `${t.schoolCode ? `${t.schoolCode} - ` : ''}${t.schoolName || 'Unknown School'}`;
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
  }, [availableTeachers, debouncedSearchTerm, filterSchoolCode, filterSubject, filterDutyType, recordFilter]);
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
  const tableColumnCount = 10 - (hideDutyType ? 1 : 0) - (hideSchoolCode ? 1 : 0) - (hideSchoolName ? 1 : 0);
  const entityLabelPlural = entityLabelPluralOverride
    || (/personnel$/i.test(entityLabelSingular)
      ? entityLabelSingular
      : entityLabelSingular.endsWith("y")
        ? `${entityLabelSingular.slice(0, -1)}ies`
        : `${entityLabelSingular}s`);
  const entityLabelSingularTitle = `${entityLabelSingular.charAt(0).toUpperCase()}${entityLabelSingular.slice(1)}`;
  const entityLabelPluralTitle = `${entityLabelPlural.charAt(0).toUpperCase()}${entityLabelPlural.slice(1)}`;
  const srNoOffset = hidePagination ? 0 : (currentPage - 1) * LIMIT;

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
  const handleBulkDelete = async () => {
    if (selectedCount === 0 || isBulkDeleting) return;
    const confirmed = window.confirm(
      `Delete ${selectedCount} selected ${selectedCount === 1 ? entityLabelSingular : entityLabelPlural}? This cannot be undone.`
    );
    if (!confirmed) return;
    setIsBulkDeleting(true);
    try {
      let deletedIds: string[] = [];
      let failedCount = 0;
      if (onDeleteSelected) {
        const result = await onDeleteSelected(selectedTeacherList);
        deletedIds = Array.isArray(result) ? result : [...selectedTeacherList];
        failedCount = selectedTeacherList.length - deletedIds.length;
      } else if (uiOnlyDelete) {
        // UI-only delete: hide selected rows locally without mutating backend data.
        deletedIds = [...selectedTeacherList];
      } else {
        const results = await Promise.allSettled(
          selectedTeacherList.map((teacherId) => teacherService.deleteById(teacherId, includeAllRecords))
        );
        results.forEach((result, index) => {
          if (result.status === "fulfilled") deletedIds.push(selectedTeacherList[index]);
          else failedCount += 1;
        });
      }
      if (deletedIds.length > 0) {
        const selectedTeachers = displayTeachers.filter((teacher) => selectedTeacherList.includes(getTeacherId(teacher)));
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
        toast.success(
          `${deletedIds.length} ${deletedIds.length === 1 ? entityLabelSingular : entityLabelPlural} deleted successfully`
        );
        invalidateTeachers();
      }
      if (failedCount > 0) {
        toast.error(`Failed to delete ${failedCount} selected ${failedCount === 1 ? entityLabelSingular : entityLabelPlural}`);
      }
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleExport = () => {
    setShowExportModal(true);
  };

  const handleFetchPreview = async (filters: ExportFilters) => {
    try {
      return await teacherService.getExportPreview(filters);
    } catch (error) {
      console.error("Failed to fetch preview:", error);
      return { total: 0, filtered: 0 };
    }
  };

  const handleExportData = async (filters: ExportFilters, exportAll: boolean) => {
    try {
      const blob = await teacherService.exportTeachersCsv(filters, exportAll);

      // Create download link
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `teachers_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export data. Please try again.");
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
      alert("Failed to download template.");
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
      const errorPreview = (result?.errors || [])
        .slice(0, 5)
        .map((item: { row: number; message: string }) => `Row ${item.row}: ${item.message}`)
        .join("\n");
      const warningCount = result?.warnings?.length ?? 0;
      alert(
        `Import completed.\nCreated: ${result?.created ?? 0}\nUpdated: ${result?.updated ?? 0}\nSkipped: ${result?.skipped ?? 0}\nErrors: ${result?.errors?.length ?? 0}\nWarnings: ${warningCount}${errorPreview ? `\n\nFirst errors:\n${errorPreview}` : ""}`
      );
      invalidateTeachers();
    } catch (error: any) {
      console.error("Template upload failed:", error);
      const message =
        error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || "Failed to upload CSV/XLSX template file.";
      alert(message);
    } finally {
      setIsTemplateUploading(false);
    }
  };

  return (
    <div
      className={
        hidePagination
          ? 'flex h-[calc(100dvh-4.75rem)] min-h-0 flex-col p-4'
          : 'mx-auto max-w-7xl p-6'
      }
    >
      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg">
          <p className="text-error-700 dark:text-error-300">{error}</p>
        </div>
      )}

      {/* Stat cards (display only, like Datesheets – not clickable, small number animation) */}
      {!hideStats && <div className="mb-6 overflow-x-auto">
        <div className="flex flex-nowrap gap-6 min-w-max">
        <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm min-w-[240px]">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg flex-shrink-0 bg-blue-50 text-blue-500 dark:bg-blue-900/20 dark:text-blue-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total {entityLabelPluralTitle}</p>
              <span key={visibleTotalTeachers} className="text-xl font-bold text-gray-900 dark:text-white inline-block animate-number-in">{visibleTotalTeachers}</span>
            </div>
          </div>
        </div>
        <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm min-w-[240px]">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg flex-shrink-0 bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20 dark:text-emerald-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Self School</p>
              <span key={activeCount} className="text-xl font-bold text-gray-900 dark:text-white inline-block animate-number-in">{activeCount}</span>
              <span className="text-xs text-gray-400 font-medium ml-1">on this page</span>
            </div>
          </div>
        </div>
        <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm min-w-[240px]">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg flex-shrink-0 bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Outside School</p>
              <span key={inactiveCount} className="text-xl font-bold text-gray-900 dark:text-white inline-block animate-number-in">{inactiveCount}</span>
              <span className="text-xs text-gray-400 font-medium ml-1">on this page</span>
            </div>
          </div>
        </div>
        </div>
      </div>}

      {/* Teachers Table */}
      <div className={`card overflow-hidden ${hidePagination ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
        {/* Toolbar: search + actions (inside table card) */}
        <div className="flex-shrink-0 border-b border-gray-200 p-3 dark:border-gray-700">
          <div className="flex flex-col items-start justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex-1 w-full max-w-md">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-5 w-5 text-secondary-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder={`Search ${entityLabelPlural}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10 w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <input
                type="file"
                accept=".csv,.xlsx"
                id="teacher-template-upload-input"
                title="Upload teacher template file"
                aria-label="Upload teacher template file"
                onChange={uploadTemplateFile}
                className="hidden"
              />
              {/* Export button hidden for now */}
              {false && (
                <button
                  onClick={handleExport}
                  className="btn btn-outline"
                  disabled={loading}
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export
                </button>
              )}
              {!disableApiMutations && (
                <button
                  onClick={downloadImportTemplate}
                  className="btn btn-outline"
                  disabled={loading || isTemplateDownloading || isTemplateUploading}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v10m0 0l-4-4m4 4l4-4M5 19h14" />
                  </svg>
                  {isTemplateDownloading ? "Downloading..." : "Template"}
                </button>
              )}
              {!disableApiMutations && (
                <button
                  onClick={() => document.getElementById("teacher-template-upload-input")?.click()}
                  className="btn btn-outline"
                  disabled={loading || isTemplateDownloading || isTemplateUploading}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15V5m0 0l4 4m-4-4L8 9m-3 10h14" />
                  </svg>
                  {isTemplateUploading ? "Uploading..." : "Upload"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowFilterPanel((prev) => !prev)}
                className="btn btn-outline"
                disabled={loading}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {(!disableApiMutations || showAddButton) && (
                <button
                  onClick={handleAddTeacher}
                  className="btn btn-primary"
                  disabled={loading}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Add {entityLabelSingularTitle}
                </button>
              )}
              <button
                onClick={handleBulkDelete}
                className="btn btn-error"
                disabled={loading || isBulkDeleting || selectedCount === 0}
                title={selectedCount > 0 ? `Delete ${selectedCount} selected ${entityLabelPlural}` : `Select ${entityLabelPlural} first`}
              >
                {isBulkDeleting ? "Deleting..." : `Delete Selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
              </button>
            </div>
          </div>
          {showFilterPanel && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 mb-1">School</p>
                  <Dropdown
                    options={[{ value: '', label: 'All Schools' }, ...schoolFilterOptions]}
                    value={filterSchoolCode}
                    onChange={(value) => setFilterSchoolCode(String(Array.isArray(value) ? value[0] : value ?? ''))}
                    size="sm"
                    clearable={false}
                    searchable
                    placeholder="School"
                    className="w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 mb-1">{dutyTypeColumnLabel}</p>
                  <Dropdown
                    options={[{ value: '', label: `All ${dutyTypeColumnLabel}s` }, ...dutyTypeFilterOptions]}
                    value={filterDutyType}
                    onChange={(value) => setFilterDutyType(String(Array.isArray(value) ? value[0] : value ?? ''))}
                    size="sm"
                    clearable={false}
                    searchable
                    placeholder={dutyTypeColumnLabel}
                    className="w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 mb-1">Subject</p>
                  <Dropdown
                    options={[{ value: '', label: 'All Subjects' }, ...subjectFilterOptions]}
                    value={filterSubject}
                    onChange={(value) => setFilterSubject(String(Array.isArray(value) ? value[0] : value ?? ''))}
                    size="sm"
                    clearable={false}
                    searchable
                    placeholder="Subject"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className={`overflow-x-auto overflow-y-auto ${
            hidePagination ? 'min-h-0 flex-1' : 'max-h-[calc(100vh-16rem)]'
          }`}
        >
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  <input
                    type="checkbox"
                    title="Select all functionaries on this page"
                    aria-label="Select all functionaries on this page"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Sr No
                </th>
                {[
                  { label: "Teacher Name", field: "name" },
                  { label: "OASIS ID", field: "oasisId" },
                  ...(!hideDutyType ? [{ label: dutyTypeColumnLabel, field: "dutyType" }] : []),
                  { label: "Designation", field: "designation" },
                  { label: "Subject Code", field: "subjectCode" },
                  { label: "Subject Name", field: "subjects" },
                  ...(!hideSchoolCode ? [{ label: "School Code", field: "schoolCode" }] : []),
                  ...(!hideSchoolName ? [{ label: "School Name", field: "schoolName" }] : []),
                ].map(({ label, field }) => (
                  <th
                    key={field}
                    className="group cursor-pointer select-none px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                    onClick={() => {
                      if (sortField === field) {
                        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
                      } else {
                        setSortField(field);
                        setSortDirection("asc");
                      }
                      if (!hidePagination) setCurrentPage(1);
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <span className={`inline-flex flex-col text-[8px] leading-none ${sortField === field ? "text-primary-600 dark:text-primary-400" : "text-gray-400 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"}`}>
                        <span className={sortField === field && sortDirection === "asc" ? "text-primary-600 dark:text-primary-400" : ""}>▲</span>
                        <span className={sortField === field && sortDirection === "desc" ? "text-primary-600 dark:text-primary-400" : ""}>▼</span>
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={tableColumnCount} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <svg
                        className="animate-spin h-10 w-10 text-primary-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Loading teachers...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                displayTeachers.map((teacher: Teacher, index: number) => (
                  <tr
                    key={teacher.id || teacher._id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${disableRowEdit ? "cursor-default" : "cursor-pointer"}`}
                    onClick={() => {
                      if (!disableRowEdit) {
                        handleEditTeacher(teacher)
                      }
                    }}
                  >
                    <td
                      className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        title={`Select ${teacher.name}`}
                        aria-label={`Select ${teacher.name}`}
                        checked={Boolean(selectedTeacherIds[getTeacherId(teacher)])}
                        onChange={(e) => toggleTeacherSelection(getTeacherId(teacher), e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                      {srNoOffset + index + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <div className="flex items-center">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary-400 to-primary-600">
                          <span className="text-xs font-bold text-white">
                            {teacher.avatar}
                          </span>
                        </div>
                        <div className="ml-2.5">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {String(teacher.name || "").toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                      {(() => {
                        const currentDuty =
                          dutyTypeOverrides[teacher._id || teacher.id!] ?? teacher.dutyType ?? "";
                        const duty = String(currentDuty).trim().toLowerCase();
                        const isClassIv = duty === "class iv";
                        const isOthers = duty === "others";
                        return isClassIv || isOthers ? "N/A" : teacher.oasisId || "—";
                      })()}
                    </td>
                    {!hideDutyType && (
                      <td
                        className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
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
                            return (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300 border border-primary-200 dark:border-primary-700">
                                {currentDuty}
                              </span>
                            );
                          }
                          return (
                            <select
                              title={`${dutyTypeColumnLabel} for ${teacher.name}`}
                              aria-label={`${dutyTypeColumnLabel} for ${teacher.name}`}
                              value={normalizedCurrentDuty}
                              onChange={async (e) => {
                                const teacherId = teacher._id || teacher.id!;
                                const newDutyType = e.target.value;
                                if (!newDutyType) return;
                                setDutyTypeOverrides((prev) => ({ ...prev, [teacherId]: newDutyType }));
                                try {
                                  await teacherService.update(teacherId, { dutyType: newDutyType } as any);
                                  queryClient.invalidateQueries({ queryKey: teacherKeys.all });
                                  const successLabel = dutyTypeErrorLabel || dutyTypeColumnLabel;
                                  toast.success(`${successLabel} updated for ${teacher.name}`);
                                } catch (err: any) {
                                  setDutyTypeOverrides((prev) => { const next = { ...prev }; delete next[teacherId]; return next; });
                                  const fallbackLabel = (dutyTypeErrorLabel || dutyTypeColumnLabel).toLowerCase();
                                  const serverMessage = String(err?.response?.data?.message || '').trim();
                                  toast.error(serverMessage || `Failed to update ${fallbackLabel}`);
                                }
                              }}
                              className="block min-w-[180px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white py-1.5 px-2 focus:ring-primary-500 focus:border-primary-500"
                            >
                              <option value="">{`Select ${dutyTypeColumnLabel}`}</option>
                              {optionsWithCurrent.map((duty: string) => (
                                <option key={duty} value={duty}>{duty}</option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                      {teacher.designation || "N/A"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                      {getPrimarySubjectCode(teacher)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                      {getPrimarySubjectName(teacher)}
                    </td>
                    {!hideSchoolCode && (
                      <td className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                        {teacher.schoolCode || "N/A"}
                      </td>
                    )}
                    {!hideSchoolName && (
                      <td className="whitespace-nowrap px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                        {teacher.schoolName || 'N/A'}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State for when no teachers match filters */}
      {!loading && displayTeachers.length === 0 && (
        <div className="card">
          <div className="card-content text-center py-12">
            <div className="w-24 h-24 bg-secondary-100 dark:bg-secondary-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-12 h-12 text-secondary-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-2">
              No {entityLabelPlural} found
            </h3>
            <p className="text-secondary-600 dark:text-secondary-400 mb-6">
              {searchTerm || filterSchoolCode || filterSubject || filterDutyType
                ? `No ${entityLabelPlural} match your search criteria. Try adjusting your filters.`
                : `Get started by adding your first ${entityLabelSingular} to the system.`}
            </p>
            {!disableApiMutations && (
              <button
                onClick={handleAddTeacher}
                className="btn btn-primary"
                disabled={loading}
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Add {entityLabelSingularTitle}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pagination */}
      {!hidePagination && !loading && pagination.totalPages > 1 && (
        <div className="bg-white dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-gray-700 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                disabled={currentPage === pagination.totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing{' '}
                  <span className="font-medium">
                    {(currentPage - 1) * 50 + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * 50, pagination.totalItems)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">{pagination.totalItems}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${page === currentPage
                        ? 'z-10 bg-blue-50 dark:bg-blue-900 border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                    disabled={currentPage === pagination.totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddTeacherModal
        onSuccess={handleAddTeacherModalSuccess}
        entityLabelSingular={entityLabelSingular}
      />
      <EditTeacherModal
        onSuccess={(updated?: Teacher) => {
          invalidateTeachers()
          if (updated && onTeacherUpdated) onTeacherUpdated(updated)
        }}
      />
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Teachers"
        onExport={handleExportData}
        onFetchPreview={handleFetchPreview}
        filterConfig={[
          {
            label: "Search",
            key: "search",
            type: "text",
            placeholder: "Search by name, email, or employee ID",
          },
          {
            label: "School Code",
            key: "schoolCode",
            type: "text",
            placeholder: "Filter by school code",
          },
          {
            label: "Subject",
            key: "subject",
            type: "text",
            placeholder: "Filter by subject code/name",
          },
          {
            label: "Designation",
            key: "designation",
            type: "text",
            placeholder: "Filter by designation",
          },
          {
            label: "Status",
            key: "status",
            type: "select",
            options: [
              { label: "All Status", value: "all" },
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ],
          },
          {
            label: "Joining Date From",
            key: "joiningDateFrom",
            type: "date",
          },
          {
            label: "Joining Date To",
            key: "joiningDateTo",
            type: "date",
          },
          {
            label: "Min Years of Experience",
            key: "minExperience",
            type: "number",
            placeholder: "e.g., 5",
          },
        ]}
      />
    </div>
  );
};

export default Teachers;
