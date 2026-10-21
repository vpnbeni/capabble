import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../redux/store";
import { fetchStudents, Student } from "../redux/slices/studentSlice";
import { resolveApiBaseUrl } from "../utils/tenantRuntime";
import Loader from "../components/common/Loader";

const StudentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { students, loading } = useSelector((state: RootState) => state.students);
  
  const API_BASE_URL = resolveApiBaseUrl();
  const SERVER_URL = API_BASE_URL.replace('/api', '');
  
  const getProfileImageUrl = (profileImage?: string) => {
    if (!profileImage) return null;
    if (profileImage.startsWith('http')) return profileImage;
    return `${SERVER_URL}${profileImage}`;
  };

  useEffect(() => {
    if (!students || students.length === 0) {
      dispatch(fetchStudents({}));
    }
  }, [dispatch, students]);

  const student = students?.find((s: Student) => s._id === id);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-center items-center p-8">
          <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-primary-600">
            <Loader size="sm" className="-ml-1 mr-3" />
            Loading student details...
          </div>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
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
              Student not found
            </h3>
            <p className="text-secondary-600 dark:text-secondary-400 mb-6">
              The student you're looking for doesn't exist or has been removed.
            </p>
            <button onClick={() => navigate("/students")} className="btn btn-primary">
              Back to Students
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/students")}
          className="btn btn-ghost mb-4"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Students
        </button>
        <h1 className="text-4xl font-bold text-secondary-900 dark:text-white">
          Student Details
        </h1>
      </div>

      {/* Student Profile Card */}
      <div className="card mb-6">
        <div className="card-content">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {student.profileImage ? (
              <div className="relative">
                <img
                  src={getProfileImageUrl(student.profileImage) || ''}
                  alt={student.name}
                  className="w-24 h-24 rounded-xl object-cover shadow-medium"
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div 
                  className="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-medium"
                  style={{ display: 'none' }}
                >
                  <span className="text-3xl font-bold text-white">
                    {student.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-medium">
                <span className="text-3xl font-bold text-white">
                  {student.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
                  {student.name}
                </h2>
                <span
                  className={`badge ${student.isActive ? "badge-success" : "badge-secondary"}`}
                >
                  {student.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-secondary-600 dark:text-secondary-400 mb-1">
                Class {student.class} - Section {student.section}
              </p>
              <p className="text-sm text-secondary-500 dark:text-secondary-400">
                Admission No.: {student.rollNumber}
                {typeof student.classRollNo === 'number'
                  ? ` · Roll No: ${student.classRollNo}`
                  : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information */}
        <div className="card">
          <div className="card-content">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Contact Information
            </h3>
            <div className="space-y-4">
              {student.email && (
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-secondary-400 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                    />
                  </svg>
                  <div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">Email</p>
                    <p className="text-secondary-900 dark:text-white">{student.email}</p>
                  </div>
                </div>
              )}
              {student.phone && (
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-secondary-400 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  <div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">Phone</p>
                    <p className="text-secondary-900 dark:text-white">{student.phone}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-secondary-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">Guardian Phone</p>
                  <p className="text-secondary-900 dark:text-white">{student.guardianPhone}</p>
                </div>
              </div>
              {student.address && (
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-secondary-400 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">Address</p>
                    <p className="text-secondary-900 dark:text-white">
                      {student.address.street && `${student.address.street}, `}
                      {student.address.city && `${student.address.city}, `}
                      {student.address.state && `${student.address.state} `}
                      {student.address.pincode}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Academic Information */}
        <div className="card">
          <div className="card-content">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Academic Information
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-secondary-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">Class</p>
                  <p className="text-secondary-900 dark:text-white">Class {student.class}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-secondary-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">Section</p>
                  <p className="text-secondary-900 dark:text-white">Section {student.section}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-secondary-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                  />
                </svg>
                <div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">Admission No.</p>
                  <p className="text-secondary-900 dark:text-white">{student.rollNumber || '-'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-secondary-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                  />
                </svg>
                <div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">Roll No</p>
                  <p className="text-secondary-900 dark:text-white">
                    {typeof student.classRollNo === 'number' ? student.classRollNo : '—'}
                  </p>
                </div>
              </div>
              {student.admissionDate && (
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-secondary-400 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">Admission Date</p>
                    <p className="text-secondary-900 dark:text-white">
                      {formatDate(student.admissionDate)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Subjects */}
        {student.subjects && student.subjects.length > 0 && (
          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
                Subjects
              </h3>
              <div className="flex flex-wrap gap-2">
                {student.subjects.map((subject: any, index: number) => (
                  <span key={index} className="badge badge-secondary">
                    {typeof subject === "string" ? subject : subject.name || subject.code || "Unknown"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Parent Information */}
        <div className="card">
          <div className="card-content">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Parent Information
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-secondary-400 mt-0.5"
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
                <div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">Father's Name</p>
                  <p className="text-secondary-900 dark:text-white">{student.fatherName}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-secondary-400 mt-0.5"
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
                <div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">Mother's Name</p>
                  <p className="text-secondary-900 dark:text-white">{student.motherName}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div className="card lg:col-span-2">
          <div className="card-content">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {student.dateOfBirth && (
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-secondary-400 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">Date of Birth</p>
                    <p className="text-secondary-900 dark:text-white">
                      {formatDate(student.dateOfBirth)}
                    </p>
                  </div>
                </div>
              )}
              {student.category && (
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-secondary-400 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  <div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">Category</p>
                    <p className="text-secondary-900 dark:text-white">{student.category}</p>
                  </div>
                </div>
              )}
              {student.aadharNumber && (
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-secondary-400 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                    />
                  </svg>
                  <div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">Aadhar Number</p>
                    <p className="text-secondary-900 dark:text-white">{student.aadharNumber}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDetail;
