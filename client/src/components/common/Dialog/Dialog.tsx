import React, { useMemo, useId } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import Loader from '../Loader'
import { DialogProvider } from './DialogContext'
import { DialogHeader } from './DialogHeader'
import { DialogBody } from './DialogBody'
import { DialogFooter } from './DialogFooter'
import { useFocusTrap, useBodyScrollLock, useAsyncClose, useDraggable } from './useDialog'
import { useDialogStack } from './useDialogStack'
import { backdropVariants, getDialogVariants, getBackdropBlurClass, getBackdropOpacity } from './animations'
import type { DialogProps } from './DialogTypes'

const Dialog = ({
  // Core
  isOpen,
  onClose,

  // Content
  title,
  description,
  children,
  icon,

  // Style
  variant = 'default',
  size = 'md',
  position = 'center',
  animation = 'scale',
  rounded = 'rounded',

  // Behavior
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  closeButtonPosition = 'inside',
  preventBodyScroll = true,
  portal = true,

  // Advanced
  draggable = false,
  maxHeight,
  minHeight,
  onBeforeClose,
  initialFocus,
  stackOrder,

  // Backdrop
  backdropBlur = 'sm',
  backdropOpacity,

  // Footer Actions
  actions,

  // Loading
  loading = false,

  // Custom styling
  className = '',
  contentClassName = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  overlayClassName = '',

  // IDs
  id: customId
}: DialogProps) => {
  const generatedId = useId()
  const dialogId = customId || generatedId
  const titleId = `${dialogId}-title`
  const descriptionId = `${dialogId}-description`
  const contentId = `${dialogId}-content`

  // Hooks
  const { handleClose, isClosing: _isClosing } = useAsyncClose(onClose, onBeforeClose)
  const dialogRef = useFocusTrap({ isOpen, onClose: handleClose, closeOnEscape, initialFocus })
  const { zIndex, isTopmost } = useDialogStack(isOpen, handleClose, closeOnEscape, dialogId)
  const { position: dragPosition, isDragging, handleMouseDown } = useDraggable(draggable, isOpen)

  useBodyScrollLock(isOpen && preventBodyScroll)

  // Context value for compound components
  const contextValue = useMemo(
    () => ({
      isOpen,
      onClose: handleClose,
      variant,
      size,
      titleId,
      descriptionId,
      contentId
    }),
    [isOpen, handleClose, variant, size, titleId, descriptionId, contentId]
  )

  // Size classes
  const sizeClasses = {
    xs: 'max-w-xs',
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw]'
  }

  // Position classes
  const positionClasses = {
    center: 'items-center justify-center',
    top: 'items-start justify-center pt-20',
    bottom: 'items-end justify-center pb-20',
    left: 'items-stretch justify-start',
    right: 'items-stretch justify-end'
  }

  // Rounded classes
  const roundedClasses = {
    rounded: 'rounded-lg',
    square: 'rounded-none',
    pill: 'rounded-3xl'
  }

  // Variant border colors
  const variantBorderClasses = {
    default: '',
    success: 'border-l-4 border-l-success-500',
    warning: 'border-l-4 border-l-warning-500',
    error: 'border-l-4 border-l-error-500',
    info: 'border-l-4 border-l-primary-500'
  }

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      handleClose()
    }
  }

  // Check if children contains compound components
  const hasCompoundComponents = React.Children.toArray(children).some(
    child => React.isValidElement(child) &&
      (child.type === DialogHeader || child.type === DialogBody || child.type === DialogFooter)
  )

  // Render action buttons
  const renderActions = () => {
    if (!actions || actions.length === 0) return null

    return (
      <DialogFooter className={footerClassName}>
        {actions.map((action, index) => (
          <button
            key={index}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled || action.loading}
            className={`btn ${action.variant === 'primary' ? 'btn-primary' :
              action.variant === 'secondary' ? 'btn-secondary' :
                action.variant === 'success' ? 'btn-success' :
                  action.variant === 'warning' ? 'btn-warning' :
                    action.variant === 'error' ? 'btn-error' :
                      action.variant === 'outline' ? 'btn-outline' :
                        action.variant === 'ghost' ? 'btn-ghost' :
                          'btn-primary'
              }`}
          >
            {action.loading && <Loader size="sm" className="mr-2" />}
            {action.icon && !action.loading && <span className="mr-2">{action.icon}</span>}
            {action.label}
          </button>
        ))}
      </DialogFooter>
    )
  }

  // Dialog content
  const dialogContent = (
    <motion.div
      ref={dialogRef}
      variants={getDialogVariants(animation)}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`
        relative w-full
        ${(position === 'left' || position === 'right' || size === 'full') ? 'h-full' : 'max-h-[90vh]'}
        ${position === 'left' || position === 'right' ? sizeClasses[size].replace('max-w', 'w') : sizeClasses[size]}
        ${position === 'left' || position === 'right' ? '' : 'm-4'}
        ${className}
      `}
      style={{
        transform: draggable ? `translate(${dragPosition.x}px, ${dragPosition.y}px)` : undefined,
        cursor: isDragging ? 'grabbing' : undefined,
        zIndex: stackOrder || undefined
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`
          card shadow-hard overflow-hidden
          ${roundedClasses[rounded]}
          ${variantBorderClasses[variant]}
          ${(position === 'left' || position === 'right' || size === 'full' || maxHeight) ? 'h-full flex flex-col' : ''}
          ${contentClassName}
        `}
        style={{
          maxHeight: maxHeight || undefined,
          minHeight: minHeight || undefined
        }}
      >
        {/* Close button outside */}
        {showCloseButton && closeButtonPosition === 'outside' && (
          <button
            type="button"
            onClick={handleClose}
            className="absolute -top-10 right-0 p-2 text-white hover:text-gray-200 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-6 h-6" />
          </button>
        )}

        {/* Draggable handle */}
        {draggable && (
          <div
            onMouseDown={handleMouseDown}
            className="cursor-move bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600 flex items-center justify-center"
          >
            <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>
        )}

        <div className={`
          ${(position === 'left' || position === 'right' || size === 'full' || maxHeight) ? 'flex-1 min-h-0' : ''}
          ${!hasCompoundComponents ? 'overflow-y-auto' : ''}
          ${(hasCompoundComponents && (size === 'full' || maxHeight)) ? 'flex flex-col' : ''}
        `}>
          {hasCompoundComponents ? (
            // Render compound components directly
            children
          ) : (
            // Render with default structure
            <>
              {(title || icon) && (
                <DialogHeader
                  icon={icon}
                  showClose={showCloseButton && closeButtonPosition === 'inside'}
                  className={headerClassName}
                  variant={variant}
                >
                  {title}
                </DialogHeader>
              )}

              {description && (
                <div className="px-6 pt-4">
                  <p id={descriptionId} className="text-sm text-gray-600 dark:text-gray-400">
                    {description}
                  </p>
                </div>
              )}

              <DialogBody className={bodyClassName}>
                {children}
              </DialogBody>

              {renderActions()}
            </>
          )}
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/75 dark:bg-gray-900/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center">
              <Loader size="md" className="block mx-auto" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )

  // Full dialog with backdrop
  const dialogWithBackdrop = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={`fixed inset-0 flex ${positionClasses[position]} p-0 ${overlayClassName}`}
          style={{
            zIndex,
            backgroundColor: `rgba(0, 0, 0, ${getBackdropOpacity(backdropOpacity)})`
          }}
          onClick={handleBackdropClick}
          aria-hidden={!isTopmost}
        >
          {/* Backdrop with blur */}
          <div
            className={`absolute inset-0 ${getBackdropBlurClass(backdropBlur)}`}
            aria-hidden="true"
          />

          {/* Dialog content */}
          <DialogProvider value={contextValue}>
            {dialogContent}
          </DialogProvider>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // Render with or without portal
  if (!isOpen) return null

  return portal ? createPortal(dialogWithBackdrop, document.body) : dialogWithBackdrop
}

// Attach compound components as static properties
Dialog.Header = DialogHeader
Dialog.Body = DialogBody
Dialog.Footer = DialogFooter

export default Dialog
