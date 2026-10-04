import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  // Portal to <body>: rendered inline, the modal is trapped in the page's stacking
  // context and the sticky header (z-40) paints over the backdrop as a white strip.
  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex min-h-full items-start justify-center overflow-y-auto p-4">
        <div className={`relative w-full max-h-[calc(100vh-2rem)] overflow-hidden ${sizeClasses[size]} animate-fade-in-up`}>
          <div className="card shadow-elegant h-full max-h-[calc(100vh-2rem)] flex flex-col">
            {/* Header */}
            <div className="card-header flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
              <h2 className="card-title text-xl">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close modal"
                title="Close modal"
                className="p-1 absolute right-4 top-4 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="card-content flex-1 min-h-0 overflow-y-auto">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default Modal
