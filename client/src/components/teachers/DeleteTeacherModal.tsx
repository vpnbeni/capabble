import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '../../redux/store'
import { deleteTeacher, hideDeleteTeacherModal } from '../../redux/slices/teacherSlice'
import Modal from '../common/Modal'
import Loader from '../common/Loader'
import toast from 'react-hot-toast'

interface DeleteTeacherModalProps {
  onSuccess?: (deletedTeacherId: string) => void
}

const DeleteTeacherModal: React.FC<DeleteTeacherModalProps> = ({ onSuccess }) => {
  const dispatch = useDispatch<AppDispatch>()
  const { showDeleteModal, loading, selectedTeacher } = useSelector((state: RootState) => state.teachers)

  const handleClose = () => {
    dispatch(hideDeleteTeacherModal())
  }

  const handleDelete = async () => {
    if (!selectedTeacher || !teacherId) return

    try {
      await dispatch(deleteTeacher(teacherId)).unwrap()
      onSuccess?.(teacherId)
      toast.success('Functionary deleted successfully')
      handleClose()
    } catch (error: any) {
      const message = error?.message || error || 'Failed to delete functionary'
      toast.error(String(message))
      console.error('Failed to delete teacher:', error)
    }
  }

  const teacherId = selectedTeacher?.id ?? selectedTeacher?._id
  if (!selectedTeacher || !teacherId) return null

  return (
    <Modal
      isOpen={showDeleteModal}
      onClose={handleClose}
      title="Delete Teacher"
      size="md"
    >
      <div className="space-y-6">
        {/* Warning Icon */}
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 bg-error-100 dark:bg-error-900/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-error-600 dark:text-error-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            Are you sure you want to delete this teacher?
          </h3>
          <div className="bg-secondary-50 dark:bg-secondary-800 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center shadow-medium">
                <span className="text-sm font-bold text-white">
                  {selectedTeacher.avatar}
                </span>
              </div>
              <div className="text-left">
                <p className="font-medium text-secondary-900 dark:text-white">
                  {selectedTeacher.name}
                </p>
                <p className="text-sm text-secondary-500 dark:text-secondary-400">
                  {selectedTeacher.employeeId} • {selectedTeacher.department}
                </p>
              </div>
            </div>
          </div>
          <p className="text-secondary-600 dark:text-secondary-300">
            This action cannot be undone. All data associated with this teacher will be permanently removed from the system.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-outline"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="btn btn-error"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader size="sm" className="mr-2" />
                Deleting...
              </>
            ) : (
              'Delete Teacher'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default DeleteTeacherModal
