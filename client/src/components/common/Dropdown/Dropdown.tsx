import React, { useRef, useEffect, useState } from 'react'
import { ChevronDown, X, Search, Check } from 'lucide-react'
import Loader from '../Loader'
import { createPortal } from 'react-dom'
import { useDropdown } from './useDropdown'
import { VirtualList } from './VirtualList'
import type { DropdownProps } from './DropdownTypes'

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  defaultValue,
  onChange,
  multiple = false,
  searchable = false,
  onSearch,
  filterFn,
  onLoadMore,
  hasMore = false,
  size = 'md',
  placeholder = 'Select...',
  label,
  error,
  required = false,
  disabled = false,
  loading = false,
  clearable = true,
  maxHeight = 300,
  position = 'auto',
  portal = false,
  virtualized = false,
  renderOption,
  emptyMessage = 'No options found',
  className = '',
  dropdownClassName = '',
  id,
  name,
}) => {
  const {
    isOpen,
    searchQuery,
    filteredOptions,
    highlightedIndex,
    selectedValues,
    setIsOpen,
    setSearchQuery,
    setHighlightedIndex,
    handleSelect,
    handleClear,
    handleRemove,
    handleKeyDown,
    inputRef,
    listRef,
  } = useDropdown({
    options,
    value,
    defaultValue,
    multiple,
    searchable,
    filterFn,
    onChange,
    onSearch,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const [dropdownDirection, setDropdownDirection] = useState<'down' | 'up'>('down')
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Get selected option labels
  const getSelectedLabels = () => {
    return options
      .filter(opt => selectedValues.includes(opt.value))
      .map(opt => opt.label)
  }

  // Calculate dropdown direction (up/down) and position for portal
  // Direction is always calculated when open so both portal and non-portal dropdowns can open upward when space is limited below.
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    let direction: 'down' | 'up' = 'down'
    if (position === 'top') {
      direction = 'up'
    } else if (position === 'bottom') {
      direction = 'down'
    } else {
      // Auto: open upward if not enough space below and more space above
      direction = spaceBelow < maxHeight && spaceAbove > spaceBelow ? 'up' : 'down'
    }

    setDropdownDirection(direction)
    if (portal) {
      setDropdownPosition({
        top: direction === 'down' ? rect.bottom + 4 : rect.top - 4,
        left: rect.left,
        width: rect.width,
      })
    }
  }, [isOpen, portal, position, maxHeight])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, setIsOpen])

  // Handle async loading more
  useEffect(() => {
    if (!isOpen || !onLoadMore || !hasMore || !loadMoreRef.current) return

    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          setIsLoadingMore(true)
          try {
            await onLoadMore()
          } finally {
            setIsLoadingMore(false)
          }
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [isOpen, onLoadMore, hasMore, isLoadingMore])

  // Size classes
  const sizeClasses = {
    sm: 'text-sm py-1.5 px-2',
    md: 'text-sm py-2 px-3',
    lg: 'text-base py-2.5 px-4',
  }

  const iconSizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  // Display value
  const displayValue = () => {
    if (selectedValues.length === 0) {
      return <span className="text-secondary-400 dark:text-secondary-500">{placeholder}</span>
    }

    if (multiple) {
      return (
        <div className="flex flex-wrap gap-1">
          {getSelectedLabels().map((label, index) => (
            <span
              key={selectedValues[index]}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded text-xs font-medium"
            >
              {label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(selectedValues[index])
                }}
                className="hover:text-primary-900 dark:hover:text-primary-100 transition-colors"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )
    }

    return <span className="text-gray-900 dark:text-white">{getSelectedLabels()[0]}</span>
  }

  // Render option list (non-virtualized)
  const renderOptionList = () => {
    if (filteredOptions.length === 0) {
      return (
        <div className="px-3 py-8 text-center text-sm text-secondary-500 dark:text-secondary-400">
          {emptyMessage}
        </div>
      )
    }

    return (
      <div ref={listRef} style={{ maxHeight: `${maxHeight}px` }} className="overflow-auto">
        {filteredOptions.map((option, index) => {
          const selected = selectedValues.includes(option.value)
          const highlighted = index === highlightedIndex

          return (
            <div
              key={option.value}
              className={`
                px-3 py-2 cursor-pointer transition-colors
                ${highlighted 
                  ? 'bg-primary-50 dark:bg-primary-900/20' 
                  : 'hover:bg-secondary-50 dark:hover:bg-secondary-700'
                }
                ${selected 
                  ? 'bg-primary-100 dark:bg-primary-900/30' 
                  : ''
                }
                ${option.disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : ''
                }
              `}
              onClick={() => !option.disabled && handleSelect(option)}
              onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
            >
              <div className="flex items-center justify-between gap-2">
                {renderOption ? (
                  renderOption(option)
                ) : (
                  <span className={`
                    text-sm
                    ${selected 
                      ? 'font-medium text-primary-700 dark:text-primary-400' 
                      : 'text-gray-900 dark:text-white'
                    }
                    ${option.disabled 
                      ? 'text-secondary-400 dark:text-secondary-500' 
                      : ''
                    }
                  `}>
                    {option.label}
                  </span>
                )}
                
                {multiple && selected && (
                  <Check className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
                )}
              </div>
            </div>
          )
        })}
        
        {/* Load more sentinel */}
        {onLoadMore && hasMore && (
          <div ref={loadMoreRef} className="px-3 py-2 text-center">
            {isLoadingMore && (
              <Loader size="sm" className="block mx-auto" />
            )}
          </div>
        )}
      </div>
    )
  }

  // Dropdown content
  const dropdownContent = (
    <div
      ref={dropdownRef}
      className={`
        ${portal ? 'fixed' : 'absolute'}
        ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}
        left-0 right-0
        bg-white dark:bg-secondary-800
        border border-secondary-300 dark:border-secondary-600
        rounded-lg shadow-lg
        overflow-hidden
        ${dropdownClassName}
      `}
      style={{
        zIndex: 9999,
        ...(portal && dropdownPosition ? {
          top: dropdownDirection === 'down' ? dropdownPosition.top : 'auto',
          bottom: dropdownDirection === 'up' ? `calc(100vh - ${dropdownPosition.top}px)` : 'auto',
          left: dropdownPosition.left,
          width: dropdownPosition.width,
        } : {})
      }}
    >
      {/* Search input */}
      {searchable && (
        <div className="p-2 border-b border-secondary-200 dark:border-secondary-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-secondary-900 border border-secondary-300 dark:border-secondary-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-400 dark:focus:border-primary-400 text-gray-900 dark:text-white placeholder-secondary-400"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Options list */}
      {loading ? (
        <div className="px-3 py-8 text-center">
          <Loader size="md" className="block mx-auto" />
          <p className="mt-2 text-sm text-secondary-500 dark:text-secondary-400">Loading...</p>
        </div>
      ) : virtualized && filteredOptions.length > 0 ? (
        <VirtualList
          options={filteredOptions}
          selectedValues={selectedValues}
          highlightedIndex={highlightedIndex}
          onSelect={handleSelect}
          onHighlight={setHighlightedIndex}
          maxHeight={maxHeight}
          renderOption={renderOption}
          multiple={multiple}
        />
      ) : (
        renderOptionList()
      )}
    </div>
  )

  return (
    <div className={`relative ${className}`}>
      {/* Label */}
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2"
        >
          {label}
          {required && <span className="text-error-500 ml-1">*</span>}
        </label>
      )}

      {/* Dropdown trigger */}
      <div
        ref={containerRef}
        className={`
          relative w-full box-border
          bg-white dark:bg-secondary-800
          border rounded-lg
          ${error
            ? 'border-error-500 ring-1 ring-inset ring-error-500'
            : isOpen
              ? 'border-primary-500 dark:border-primary-400 ring-1 ring-inset ring-primary-500 dark:ring-primary-400'
              : 'border-secondary-300 dark:border-secondary-600'
          }
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer hover:border-primary-500 dark:hover:border-primary-400'
          }
          focus:outline-none
          transition-colors
          ${sizeClasses[size]}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${id}-listbox`}
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-disabled={disabled}
        id={id}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {displayValue()}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Clear button */}
            {clearable && !multiple && selectedValues.length > 0 && !disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClear()
                }}
                className="p-0.5 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded transition-colors"
                aria-label="Clear selection"
              >
                <X className={iconSizeClasses[size]} />
              </button>
            )}

            {/* Loading spinner */}
            {loading && (
              <span className={`cb-logo-loader ${iconSizeClasses[size]}`} role="status" aria-label="Loading" />
            )}

            {/* Dropdown icon */}
            <ChevronDown
              className={`
                ${iconSizeClasses[size]} 
                text-secondary-400 
                transition-transform 
                ${isOpen ? 'rotate-180' : ''}
              `}
            />
          </div>
        </div>

        {/* Hidden input for form submission */}
        {name && (
          <input
            type="hidden"
            name={name}
            value={multiple ? selectedValues.join(',') : selectedValues[0] || ''}
          />
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-error-500 text-xs mt-1">{error}</p>
      )}

      {/* Dropdown panel */}
      {isOpen && !disabled && (
        portal ? createPortal(dropdownContent, document.body) : dropdownContent
      )}
    </div>
  )
}
