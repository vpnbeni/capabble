import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../redux/store";
import {
  createTeacher,
  updateTeacher,
  hideAddTeacherModal,
  hideEditTeacherModal,
} from "../../redux/slices/teacherSlice";
import { fetchSubjects } from "../../redux/slices/subjectSlice";
import api from "../../services/api";
import Modal from "../common/Modal";
import StaffSalaryCard from "../cpitl/StaffSalaryCard";

interface Subject {
  _id: string;
  name: string;
  code: string;
  class?: string;
}

interface SchoolOption {
  schoolName: string;
  schoolCode: string;
}

interface TeacherModalProps {
  mode: "add" | "edit";
  onSuccess?: (teacher?: any) => void;
  entityLabelSingular?: string;
}

const DEFAULT_SCHOOL_NAME = "International Bharti School";
const DEFAULT_HIDDEN_VALUES = {
  bankName: "N/A Bank",
  accountNumber: "000000",
  ifscCode: "ABCD0000001",
  mobileNo: "9000000000",
};

const DESIGNATION_OPTIONS = [
  "Principal",
  "Vice Principal",
  "PGT",
  "TGT",
  "PRT",
  "Others",
] as const;

const DUTY_TYPE_OPTIONS = [
  'Centre Superintendent',
  'Deputy Centre Superintendent',
  'Observer',
  'Invigilator',
  'ASI (CCTV)',
  'ASI (Frisking Male)',
  'ASI (Frisking Female)',
  'Clerk',
  'Others',
  'Class IV',
] as const;

const getDutyOptionsForDesignation = (designation: string): string[] => {
  const d = (designation || '').trim().toLowerCase();
  if (d === 'principal') return ['Centre Superintendent', 'Observer'];
  if (d === 'vice principal') return ['Centre Superintendent', 'Deputy Centre Superintendent'];
  return [...DUTY_TYPE_OPTIONS];
};
const isSubjectOptionalDuty = (dutyType: string) => {
  const normalized = String(dutyType || "").trim().toLowerCase();
  return normalized === "clerk" || normalized === "class iv";
};
const normalizeSubjectCode = (value: string | undefined) => String(value || "").trim().toUpperCase();
const normalizeClassLabel = (value: string | undefined) => String(value || "").trim();
const normalizeAccountNumber = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return DEFAULT_HIDDEN_VALUES.accountNumber;
  if (digits.length >= 6) return digits.slice(0, 40);
  return digits.padStart(6, "0");
};
const resolveDefaultSchoolOption = (options: SchoolOption[]): SchoolOption | null => {
  const match = (options || []).find((option) =>
    String(option.schoolName || "").toLowerCase().includes(DEFAULT_SCHOOL_NAME.toLowerCase())
  );
  return match || null;
};

const TeacherModal: React.FC<TeacherModalProps> = ({ mode, onSuccess, entityLabelSingular }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { showAddModal, showEditModal, loading, selectedTeacher } = useSelector(
    (state: RootState) => state.teachers
  );
  const { subjects } = useSelector((state: RootState) => state.subjects);

  const isOpen = mode === "add" ? showAddModal : showEditModal;
  const modalTitle = mode === "add"
    ? `Add new ${entityLabelSingular ?? "teacher"}`
    : `Edit ${entityLabelSingular ?? "teacher"}`;

  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    oasisId: "",
    email: "",
    designation: "",
    subjectIds: [] as string[],
    subjectCode: "",
    schoolName: "",
    schoolCode: "",
    bankName: DEFAULT_HIDDEN_VALUES.bankName,
    accountNumber: DEFAULT_HIDDEN_VALUES.accountNumber,
    ifscCode: DEFAULT_HIDDEN_VALUES.ifscCode,
    mobileNo: DEFAULT_HIDDEN_VALUES.mobileNo,
    dutyType: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const subjectById = useMemo(() => {
    const map: Record<string, Subject> = {};
    (subjects || []).forEach((subject: Subject) => {
      map[subject._id] = subject;
    });
    return map;
  }, [subjects]);
  const getSubjectCodesFromIds = (ids: string[]) => {
    const codes = Array.from(
      new Set(
        ids
          .map((id) => normalizeSubjectCode(subjectById[id]?.code))
          .filter(Boolean)
      )
    );
    return codes.join(", ");
  };
  const subjectCodeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (subjects || []).forEach((subject: Subject) => {
      const code = normalizeSubjectCode(subject.code);
      if (!code) return;
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [subjects]);
  const formatSubjectLabel = (subject?: Subject | null) => {
    if (!subject) return "";
    const code = normalizeSubjectCode(subject.code);
    const classLabel = normalizeClassLabel(subject.class);
    const shouldShowClass = Boolean(code) && (subjectCodeCounts[code] || 0) > 1 && Boolean(classLabel);
    return `${subject.name} (${subject.code || ""})${shouldShowClass ? ` - Class ${classLabel}` : ""}`.trim();
  };

  useEffect(() => {
    if (!isOpen) return;
    dispatch(fetchSubjects());
    setSchoolsLoading(true);
    api
      .get("/teachers/schools")
      .then((res) => {
        const data = res?.data?.data ?? [];
        setSchoolOptions(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error("Failed to fetch school options:", error);
        setSchoolOptions([]);
      })
      .finally(() => setSchoolsLoading(false));
  }, [dispatch, isOpen]);

  useEffect(() => {
    if (!isOpen || mode !== "add") return;
    const defaultSchool = resolveDefaultSchoolOption(schoolOptions);
    if (!defaultSchool) return;
    setFormData((prev) => {
      if (prev.schoolName) return prev;
      return {
        ...prev,
        schoolName: defaultSchool.schoolName,
        schoolCode: defaultSchool.schoolCode,
      };
    });
  }, [isOpen, mode, schoolOptions]);

  useEffect(() => {
    if (mode !== "edit" || !selectedTeacher) return;
    const firstSubject = Array.isArray(selectedTeacher.subjects) ? selectedTeacher.subjects[0] : "";
    const subjectIds = Array.isArray(selectedTeacher.subjects)
      ? selectedTeacher.subjects
        .map((subject) => (typeof subject === "string" ? subject : subject?._id || ""))
        .filter(Boolean)
      : [];
    const selectedSubjectCodes = Array.isArray(selectedTeacher.subjects)
      ? Array.from(
        new Set(
          selectedTeacher.subjects
            .map((subject) => (typeof subject === "object" ? normalizeSubjectCode(subject?.code) : ""))
            .filter(Boolean)
        )
      )
      : [];
    const subjectCode = selectedSubjectCodes.length > 0
      ? selectedSubjectCodes.join(", ")
      : selectedTeacher.subjectCode || "";

    setFormData({
      name: selectedTeacher.name || "",
      oasisId: (selectedTeacher as any).oasisId || "",
      email: (selectedTeacher as any).email || "",
      designation: selectedTeacher.designation || "",
      subjectIds,
      subjectCode,
      schoolName: selectedTeacher.schoolName || "",
      schoolCode: selectedTeacher.schoolCode || "",
      bankName: selectedTeacher.bankName || "",
      accountNumber: selectedTeacher.accountNumber || "",
      ifscCode: selectedTeacher.ifscCode || "",
      mobileNo: selectedTeacher.mobileNo || selectedTeacher.phone || "",
      dutyType: selectedTeacher.dutyType || "",
    });
    if (typeof firstSubject === "object" && firstSubject?.name) {
      setSubjectSearch(formatSubjectLabel(firstSubject as Subject));
    } else {
      setSubjectSearch("");
    }
  }, [mode, selectedTeacher, subjectCodeCounts]);

  const schoolButtonItems = useMemo(() => {
    if (!formData.schoolName || schoolOptions.some((s) => s.schoolName === formData.schoolName)) {
      return schoolOptions;
    }
    return [{ schoolName: formData.schoolName, schoolCode: formData.schoolCode }, ...schoolOptions];
  }, [formData.schoolCode, formData.schoolName, schoolOptions]);

  const filteredSubjects = useMemo(() => {
    const term = subjectSearch.trim().toLowerCase();
    if (!term) return subjects;
    return subjects.filter((subject: Subject) => {
      const name = String(subject.name || "").toLowerCase();
      const code = String(subject.code || "").toLowerCase();
      const classLabel = String(subject.class || "").toLowerCase();
      const combinedLabel = `${name} (${code}) ${classLabel}`;
      return name.includes(term) || code.includes(term) || classLabel.includes(term) || combinedLabel.includes(term);
    });
  }, [subjectSearch, subjects]);

  const designationOptions = useMemo(() => {
    if (!formData.designation || DESIGNATION_OPTIONS.includes(formData.designation as typeof DESIGNATION_OPTIONS[number])) {
      return DESIGNATION_OPTIONS;
    }
    return [formData.designation, ...DESIGNATION_OPTIONS];
  }, [formData.designation]);

  const allowedDutyOptions = useMemo(() => {
    return getDutyOptionsForDesignation(formData.designation);
  }, [formData.designation]);
  const isClassIvFunctionary = useMemo(
    () => String(formData.dutyType || "").trim().toLowerCase() === "class iv",
    [formData.dutyType]
  );
  const isDesignationOthers = useMemo(
    () => String(formData.dutyType || "").trim().toLowerCase() === "others",
    [formData.dutyType]
  );
  const subjectsDisabled = useMemo(
    () => isSubjectOptionalDuty(formData.dutyType),
    [formData.dutyType]
  );

  // Auto-clear dutyType if it becomes invalid for the current designation
  useEffect(() => {
    if (formData.dutyType && !allowedDutyOptions.includes(formData.dutyType)) {
      setFormData((prev) => ({ ...prev, dutyType: '' }));
    }
  }, [allowedDutyOptions, formData.dutyType]);

  useEffect(() => {
    if (!isClassIvFunctionary) return;
    setFormData((prev) => {
      return {
        ...prev,
        designation: "Class IV",
        subjectIds: [],
        subjectCode: "N/A",
      };
    });
    setSubjectSearch("");
  }, [isClassIvFunctionary]);

  useEffect(() => {
    if (isClassIvFunctionary) return;
    setFormData((prev) => {
      if (prev.subjectCode !== "N/A") return prev;
      return {
        ...prev,
        subjectCode: getSubjectCodesFromIds(prev.subjectIds),
      };
    });
  }, [isClassIvFunctionary, getSubjectCodesFromIds]);

  const resetForm = () => {
    setFormData({
      name: "",
      oasisId: "",
      email: "",
      designation: "",
      subjectIds: [],
      subjectCode: "",
      schoolName: "",
      schoolCode: "",
      bankName: DEFAULT_HIDDEN_VALUES.bankName,
      accountNumber: DEFAULT_HIDDEN_VALUES.accountNumber,
      ifscCode: DEFAULT_HIDDEN_VALUES.ifscCode,
      mobileNo: DEFAULT_HIDDEN_VALUES.mobileNo,
      dutyType: "",
    });
    setErrors({});
  };

  const handleClose = () => {
    if (mode === "add") dispatch(hideAddTeacherModal());
    else dispatch(hideEditTeacherModal());
    resetForm();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numericOnlyFields = new Set(["oasisId", "accountNumber", "mobileNo"]);
    const nextValue = numericOnlyFields.has(name) ? value.replace(/\D/g, "") : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubjectChange = (subjectId: string) => {
    setFormData((prev) => {
      const alreadySelected = prev.subjectIds.includes(subjectId);
      const nextSubjectIds = alreadySelected
        ? prev.subjectIds.filter((id) => id !== subjectId)
        : [...prev.subjectIds, subjectId];
      return {
        ...prev,
        subjectIds: nextSubjectIds,
        subjectCode: getSubjectCodesFromIds(nextSubjectIds),
      };
    });
    if (errors.subjectIds) setErrors((prev) => ({ ...prev, subjectIds: "" }));
  };

  const handleSchoolSelect = (school: SchoolOption) => {
    setFormData((prev) => ({
      ...prev,
      schoolName: school.schoolName,
      schoolCode: school.schoolCode,
    }));
    if (errors.schoolName || errors.schoolCode) {
      setErrors((prev) => ({ ...prev, schoolName: "", schoolCode: "" }));
    }
  };

  const validateForm = () => {
    // Allow creating/updating without required-field checks.
    // Any validation should come from the backend/API.
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const resolvedOasisId = (isClassIvFunctionary || isDesignationOthers)
      ? ""
      : formData.oasisId.trim();

    const payload = {
      name: formData.name.trim(),
      oasisId: resolvedOasisId,
      ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
      designation: isClassIvFunctionary ? "Class IV" : formData.designation.trim(),
      subjects: (isClassIvFunctionary || isDesignationOthers) ? [] : formData.subjectIds,
      subjectCode: (isClassIvFunctionary || isDesignationOthers) ? "N/A" : formData.subjectCode,
      schoolName: formData.schoolName.trim(),
      schoolCode: formData.schoolCode.trim(),
      bankName: formData.bankName.trim() || DEFAULT_HIDDEN_VALUES.bankName,
      accountNumber: normalizeAccountNumber(formData.accountNumber.trim()),
      ifscCode: (formData.ifscCode.trim() || DEFAULT_HIDDEN_VALUES.ifscCode).toUpperCase(),
      mobileNo: formData.mobileNo.trim() || DEFAULT_HIDDEN_VALUES.mobileNo,
      isActive: selectedTeacher?.isActive ?? true,
      dutyType: formData.dutyType,
    };

    try {
      if (mode === "add") {
        const createdTeacher = await dispatch(createTeacher(payload as any)).unwrap();
        onSuccess?.(createdTeacher);
      } else if (selectedTeacher?._id) {
        const updatedTeacher = await dispatch(
          updateTeacher({
            ...payload,
            _id: selectedTeacher._id,
            id: selectedTeacher.id || selectedTeacher._id,
          } as any)
        ).unwrap();
        onSuccess?.(updatedTeacher);
      }
      handleClose();
    } catch (error) {
      console.error(`Failed to ${mode} teacher:`, error);
    }
  };

  const fieldIdPrefix = mode === "add" ? "" : "edit-";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle} size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor={`${fieldIdPrefix}dutyType`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Functionary Type
            </label>
            <select
              id={`${fieldIdPrefix}dutyType`}
              name="dutyType"
              value={formData.dutyType}
              onChange={handleInputChange}
              className="input w-full"
            >
              <option value="">Select Functionary Type</option>
              {allowedDutyOptions.map((duty) => (
                <option key={duty} value={duty}>{duty}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}name`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Functionary Name
            </label>
            <input id={`${fieldIdPrefix}name`} name="name" value={formData.name} onChange={handleInputChange} className={`input w-full ${errors.name ? "input-error" : ""}`} />
            {errors.name && <p className="text-error-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}email`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Email
            </label>
            <input
              id={`${fieldIdPrefix}email`}
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Optional"
              className={`input w-full ${errors.email ? "input-error" : ""}`}
            />
            {errors.email && <p className="text-error-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}oasisId`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              OASIS ID
            </label>
            <input
              id={`${fieldIdPrefix}oasisId`}
              name="oasisId"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={(isClassIvFunctionary || isDesignationOthers) ? "N/A" : formData.oasisId}
              onChange={handleInputChange}
              disabled={isClassIvFunctionary || isDesignationOthers}
              className={`input w-full ${errors.oasisId ? "input-error" : ""} ${(isClassIvFunctionary || isDesignationOthers) ? "bg-gray-100 dark:bg-gray-800 cursor-not-allowed" : ""}`}
            />
            {errors.oasisId && <p className="text-error-500 text-xs mt-1">{errors.oasisId}</p>}
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}designation`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Designation
            </label>
            <select
              id={`${fieldIdPrefix}designation`}
              name="designation"
              value={formData.designation}
              onChange={handleInputChange}
              disabled={isClassIvFunctionary}
              className={`input w-full ${errors.designation ? "input-error" : ""}`}
            >
              <option value="">Select Designation</option>
              {designationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {errors.designation && <p className="text-error-500 text-xs mt-1">{errors.designation}</p>}
          </div>

          {!isDesignationOthers && (
            <>
            <div>
            <label htmlFor={`${fieldIdPrefix}subjectSearch`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Subjects
            </label>
            <input
              id={`${fieldIdPrefix}subjectSearch`}
              type="text"
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              placeholder="Search subject by name, code, or class"
              className="input w-full mb-2"
              disabled={subjectsDisabled}
            />
            {formData.subjectIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {formData.subjectIds.map((subjectId) => {
                  const selectedSubject = subjectById[subjectId];
                  if (!selectedSubject) return null;
                  return (
                    <button
                      key={`selected-${subjectId}`}
                      type="button"
                      onClick={() => handleSubjectChange(subjectId)}
                      disabled={subjectsDisabled}
                      className="px-2.5 py-1 rounded-full text-xs bg-primary-100 text-primary-800 border border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-700"
                      title="Click to remove"
                    >
                      {formatSubjectLabel(selectedSubject)} ×
                    </button>
                  );
                })}
              </div>
            )}
            <div className={`rounded-md border ${errors.subjectIds ? "border-error-500" : "border-gray-300 dark:border-gray-600"} p-2`}>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredSubjects.length === 0 && (
                  <p className="text-sm text-gray-500 px-2 py-1">No matching subjects found.</p>
                )}
                {filteredSubjects.map((subject: Subject) => {
                  const active = formData.subjectIds.includes(subject._id);
                  return (
                    <button
                      key={subject._id}
                      type="button"
                      onClick={() => handleSubjectChange(subject._id)}
                      disabled={subjectsDisabled}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${active
                        ? "bg-primary-600 text-white border-primary-600"
                        : "bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:border-primary-500"
                        }`}
                    >
                      <span className="font-medium">{subject.name}</span>
                      <span className={`ml-2 ${active ? "text-primary-100" : "text-gray-500 dark:text-gray-400"}`}>
                        ({subject.code})
                        {(() => {
                          const code = normalizeSubjectCode(subject.code);
                          const classLabel = normalizeClassLabel(subject.class);
                          if (!code || (subjectCodeCounts[code] || 0) <= 1 || !classLabel) return "";
                          return ` - Class ${classLabel}`;
                        })()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {errors.subjectIds && <p className="text-error-500 text-xs mt-1">{errors.subjectIds}</p>}
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}subjectCode`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Subject Code
            </label>
            <input id={`${fieldIdPrefix}subjectCode`} name="subjectCode" value={formData.subjectCode} readOnly className="input w-full bg-gray-100 dark:bg-gray-800 cursor-not-allowed" />
          </div>

          </>)}

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              School
            </label>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 min-h-[44px] max-h-40 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {schoolsLoading && <span className="text-xs text-gray-500">Loading schools...</span>}
                {!schoolsLoading && schoolButtonItems.length === 0 && <span className="text-xs text-gray-500">No schools found from candidates.</span>}
                {!schoolsLoading &&
                  schoolButtonItems.map((school) => {
                    const active = formData.schoolName === school.schoolName;
                    const schoolLabel = String(school.schoolName || "");
                    const displaySchoolLabel = schoolLabel.toLowerCase().includes(DEFAULT_SCHOOL_NAME.toLowerCase())
                      ? schoolLabel.toUpperCase()
                      : schoolLabel;
                    return (
                      <button
                        key={`${school.schoolName}-${school.schoolCode}`}
                        type="button"
                        onClick={() => handleSchoolSelect(school)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${active ? "bg-primary-600 text-white border-primary-600" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-primary-500"}`}
                      >
                        {displaySchoolLabel}
                      </button>
                    );
                  })}
              </div>
            </div>
            {errors.schoolName && <p className="text-error-500 text-xs mt-1">{errors.schoolName}</p>}
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}schoolCode`} className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              School Code
            </label>
            <input id={`${fieldIdPrefix}schoolCode`} name="schoolCode" value={formData.schoolCode} readOnly className={`input w-full bg-gray-100 dark:bg-gray-800 cursor-not-allowed ${errors.schoolCode ? "input-error" : ""}`} />
            {errors.schoolCode && <p className="text-error-500 text-xs mt-1">{errors.schoolCode}</p>}
          </div>

        </div>

        {mode === "edit" && selectedTeacher?._id ? <StaffSalaryCard teacherId={selectedTeacher._id} /> : null}

        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={handleClose} className="btn btn-outline" disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading
              ? mode === "add"
                ? "Creating..."
                : "Updating..."
              : mode === "add"
                ? `Create ${entityLabelSingular ?? "teacher"}`
                : `Update ${entityLabelSingular ?? "teacher"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TeacherModal;
