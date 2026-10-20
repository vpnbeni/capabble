import React, { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../redux/store";
import {
  createStudent,
  updateStudent,
  hideAddStudentModal,
  hideEditStudentModal,
  fetchStudents,
} from "../../redux/slices/studentSlice";
import Modal from "../common/Modal";
import Loader from "../common/Loader";
import api from "../../services/api";
import { resolveApiBaseUrl } from "../../utils/tenantRuntime";

interface StudentModalProps {
  mode: "add" | "edit";
}

const StudentModal: React.FC<StudentModalProps> = ({ mode }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { modals, loading, currentStudent } = useSelector(
    (state: RootState) => state.students
  );

  const isOpen = mode === "add" ? modals.add : modals.edit;
  const modalTitle = mode === "add" ? "Add New Student" : "Edit Student";

  const [formData, setFormData] = useState({
    name: "",
    fatherName: "",
    motherName: "",
    class: "",
    section: "",
    address: {
      street: "",
      city: "",
      state: "",
      pincode: "",
    },
    phone: "",
    guardianPhone: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE_URL = resolveApiBaseUrl();
  const SERVER_URL = API_BASE_URL.replace('/api', '');

  const getProfileImageUrl = (profileImage?: string) => {
    if (!profileImage) return null;
    if (profileImage.startsWith('http')) return profileImage;
    return `${SERVER_URL}${profileImage}`;
  };

  const classes = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  const sections = ["A", "B", "C", "D", "E"];

  // Populate form when currentStudent changes (for edit mode)
  useEffect(() => {
    if (mode === "edit" && currentStudent) {
      setFormData({
        name: currentStudent.name || "",
        fatherName: currentStudent.fatherName || "",
        motherName: currentStudent.motherName || "",
        class: currentStudent.class || "",
        section: currentStudent.section || "",
        address: {
          street: currentStudent.address?.street || "",
          city: currentStudent.address?.city || "",
          state: currentStudent.address?.state || "",
          pincode: currentStudent.address?.pincode || "",
        },
        phone: currentStudent.phone || "",
        guardianPhone: currentStudent.guardianPhone || "",
      });
      setProfileImagePreview(currentStudent.profileImage ? getProfileImageUrl(currentStudent.profileImage) : null);
    }
  }, [mode, currentStudent]);

  const resetForm = () => {
    setFormData({
      name: "",
      fatherName: "",
      motherName: "",
      class: "",
      section: "",
      address: {
        street: "",
        city: "",
        state: "",
        pincode: "",
      },
      phone: "",
      guardianPhone: "",
    });
    setErrors({});
    setProfileImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (mode === "add") {
      dispatch(hideAddStudentModal());
    } else {
      dispatch(hideEditStudentModal());
    }
    resetForm();
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name.startsWith("address.")) {
      const field = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [field]: value,
        },
      }));
      if (errors[`address${field.charAt(0).toUpperCase()}${field.slice(1)}`]) {
        setErrors((prev) => ({
          ...prev,
          [`address${field.charAt(0).toUpperCase()}${field.slice(1)}`]: "",
        }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Student name is required";
    if (!formData.fatherName.trim()) newErrors.fatherName = "Father's name is required";
    if (!formData.motherName.trim()) newErrors.motherName = "Mother's name is required";
    if (!formData.class) newErrors.class = "Class is required";
    if (!formData.section) newErrors.section = "Section is required";
    if (!formData.address.street.trim()) newErrors.addressStreet = "Street address is required";
    if (!formData.address.city.trim()) newErrors.addressCity = "City is required";
    if (!formData.address.state.trim()) newErrors.addressState = "State is required";
    if (!formData.address.pincode.trim() || !/^\d{6}$/.test(formData.address.pincode))
      newErrors.addressPincode = "Valid 6-digit pincode is required";
    if (!formData.phone.trim() || !/^\d{10}$/.test(formData.phone))
      newErrors.phone = "Valid 10-digit contact number is required";
    if (!formData.guardianPhone.trim() || !/^\d{10}$/.test(formData.guardianPhone))
      newErrors.guardianPhone = "Valid 10-digit emergency contact number is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProfileImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentStudent) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);

      // Create FormData
      const formData = new FormData();
      formData.append('profileImage', file);

      // Upload image
      const response = await api.post(`/students/${currentStudent._id}/profile-image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Get the updated student from response
      const updatedStudent = response.data.data;

      // Update preview with the new profile image URL (add timestamp to prevent caching)
      const imageUrl = getProfileImageUrl(updatedStudent.profileImage);
      const imageUrlWithTimestamp = imageUrl ? `${imageUrl}?t=${Date.now()}` : null;
      setProfileImagePreview(imageUrlWithTimestamp);

      // Refresh students list in the background (this updates the main list)
      dispatch(fetchStudents({}));
    } catch (error: any) {
      console.error('Failed to upload profile image:', error);
      alert(error.response?.data?.message || 'Failed to upload profile image');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      const studentData = {
        ...formData,
        isActive: true,
      };

      if (mode === "add") {
        await dispatch(createStudent(studentData as any)).unwrap();
        await dispatch(fetchStudents({}));
      } else if (currentStudent?._id) {
        await dispatch(
          updateStudent({
            id: currentStudent._id,
            data: studentData as any,
          })
        ).unwrap();
        await dispatch(fetchStudents({}));
      }

      handleClose();
    } catch (error) {
      console.error(`Failed to ${mode} student:`, error);
    }
  };

  const fieldIdPrefix = mode === "add" ? "" : "edit-";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle} size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Picture Section - Only in Edit Mode */}
        {mode === "edit" && currentStudent && (
          <div className="flex justify-center mb-6">
            <div className="relative group">
              {profileImagePreview ? (
                <div className="relative">
                  <img
                    src={profileImagePreview}
                    alt={currentStudent.name}
                    className="w-24 h-24 rounded-xl object-cover shadow-medium"
                    onError={(e) => {
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
                      {currentStudent.name
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
                    {currentStudent.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                </div>
              )}

              {/* Change Photo Button */}
              <button
                type="button"
                onClick={handleProfileImageClick}
                disabled={uploading}
                className="absolute inset-0 w-24 h-24 rounded-xl bg-black bg-opacity-0 hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100"
                title="Change profile picture"
              >
                {uploading ? (
                  <Loader size="md" />
                ) : (
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </button>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Student Name */}
          <div>
            <label
              htmlFor={`${fieldIdPrefix}name`}
              className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
            >
              Student Name <span className="text-error-500">*</span>
            </label>
            <input
              type="text"
              id={`${fieldIdPrefix}name`}
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`input w-full ${errors.name ? "input-error" : ""}`}
              placeholder="Enter student's full name"
            />
            {errors.name && (
              <p className="text-error-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          {/* Father's Name */}
          <div>
            <label
              htmlFor={`${fieldIdPrefix}fatherName`}
              className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
            >
              Father's Name <span className="text-error-500">*</span>
            </label>
            <input
              type="text"
              id={`${fieldIdPrefix}fatherName`}
              name="fatherName"
              value={formData.fatherName}
              onChange={handleInputChange}
              className={`input w-full ${errors.fatherName ? "input-error" : ""}`}
              placeholder="Enter father's name"
            />
            {errors.fatherName && (
              <p className="text-error-500 text-xs mt-1">{errors.fatherName}</p>
            )}
          </div>

          {/* Mother's Name */}
          <div>
            <label
              htmlFor={`${fieldIdPrefix}motherName`}
              className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
            >
              Mother's Name <span className="text-error-500">*</span>
            </label>
            <input
              type="text"
              id={`${fieldIdPrefix}motherName`}
              name="motherName"
              value={formData.motherName}
              onChange={handleInputChange}
              className={`input w-full ${errors.motherName ? "input-error" : ""}`}
              placeholder="Enter mother's name"
            />
            {errors.motherName && (
              <p className="text-error-500 text-xs mt-1">{errors.motherName}</p>
            )}
          </div>

          {/* Class */}
          <div>
            <label
              htmlFor={`${fieldIdPrefix}class`}
              className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
            >
              Class <span className="text-error-500">*</span>
            </label>
            <select
              id={`${fieldIdPrefix}class`}
              name="class"
              value={formData.class}
              onChange={handleInputChange}
              className={`input w-full ${errors.class ? "input-error" : ""}`}
            >
              <option value="">Select Class</option>
              {classes.map((cls) => (
                <option key={cls} value={cls}>
                  Class {cls}
                </option>
              ))}
            </select>
            {errors.class && (
              <p className="text-error-500 text-xs mt-1">{errors.class}</p>
            )}
          </div>

          {/* Section */}
          <div>
            <label
              htmlFor={`${fieldIdPrefix}section`}
              className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
            >
              Section <span className="text-error-500">*</span>
            </label>
            <select
              id={`${fieldIdPrefix}section`}
              name="section"
              value={formData.section}
              onChange={handleInputChange}
              className={`input w-full ${errors.section ? "input-error" : ""}`}
            >
              <option value="">Select Section</option>
              {sections.map((sec) => (
                <option key={sec} value={sec}>
                  Section {sec}
                </option>
              ))}
            </select>
            {errors.section && (
              <p className="text-error-500 text-xs mt-1">{errors.section}</p>
            )}
          </div>

          {/* Contact No */}
          <div>
            <label
              htmlFor={`${fieldIdPrefix}phone`}
              className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
            >
              Contact No <span className="text-error-500">*</span>
            </label>
            <input
              type="tel"
              id={`${fieldIdPrefix}phone`}
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className={`input w-full ${errors.phone ? "input-error" : ""}`}
              placeholder="Enter 10-digit contact number"
            />
            {errors.phone && (
              <p className="text-error-500 text-xs mt-1">{errors.phone}</p>
            )}
          </div>

          {/* Emergency Contact No */}
          <div>
            <label
              htmlFor={`${fieldIdPrefix}guardianPhone`}
              className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
            >
              Emergency Contact No <span className="text-error-500">*</span>
            </label>
            <input
              type="tel"
              id={`${fieldIdPrefix}guardianPhone`}
              name="guardianPhone"
              value={formData.guardianPhone}
              onChange={handleInputChange}
              className={`input w-full ${errors.guardianPhone ? "input-error" : ""}`}
              placeholder="Enter 10-digit emergency contact"
            />
            {errors.guardianPhone && (
              <p className="text-error-500 text-xs mt-1">{errors.guardianPhone}</p>
            )}
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
            Address <span className="text-error-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <input
                type="text"
                id={`${fieldIdPrefix}street`}
                name="address.street"
                value={formData.address.street}
                onChange={handleInputChange}
                className={`input w-full ${errors.addressStreet ? "input-error" : ""}`}
                placeholder="Street Address"
              />
              {errors.addressStreet && (
                <p className="text-error-500 text-xs mt-1">{errors.addressStreet}</p>
              )}
            </div>
            <div>
              <input
                type="text"
                id={`${fieldIdPrefix}city`}
                name="address.city"
                value={formData.address.city}
                onChange={handleInputChange}
                className={`input w-full ${errors.addressCity ? "input-error" : ""}`}
                placeholder="City"
              />
              {errors.addressCity && (
                <p className="text-error-500 text-xs mt-1">{errors.addressCity}</p>
              )}
            </div>
            <div>
              <input
                type="text"
                id={`${fieldIdPrefix}state`}
                name="address.state"
                value={formData.address.state}
                onChange={handleInputChange}
                className={`input w-full ${errors.addressState ? "input-error" : ""}`}
                placeholder="State"
              />
              {errors.addressState && (
                <p className="text-error-500 text-xs mt-1">{errors.addressState}</p>
              )}
            </div>
            <div>
              <input
                type="text"
                id={`${fieldIdPrefix}pincode`}
                name="address.pincode"
                value={formData.address.pincode}
                onChange={handleInputChange}
                className={`input w-full ${errors.addressPincode ? "input-error" : ""}`}
                placeholder="Pincode"
              />
              {errors.addressPincode && (
                <p className="text-error-500 text-xs mt-1">{errors.addressPincode}</p>
              )}
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-outline"
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <>
                <Loader size="sm" className="mr-2" />
                {mode === "add" ? "Creating..." : "Updating..."}
              </>
            ) : (
              mode === "add" ? "Add Student" : "Update Student"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default StudentModal;
