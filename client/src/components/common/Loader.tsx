import React from 'react'

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
  /** Fill the viewport and centre the loader (page-level loading). */
  fullScreen?: boolean
  className?: string
}

const sizes = { sm: 16, md: 32, lg: 48, xl: 64 }

/** The Capabble mark pulsing between full and 30% opacity (styles: `.cb-logo-loader`). */
const Loader: React.FC<LoaderProps> = ({ size = 'md', text, fullScreen = false, className = '' }) => {
  const px = sizes[size]
  const mark = (
    <span
      className={`cb-logo-loader ${className}`}
      style={{ width: px, height: px }}
      role="status"
      aria-label={text || 'Loading'}
    />
  )

  if (!text && !fullScreen) return mark

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        fullScreen ? 'min-h-screen bg-gray-50 dark:bg-gray-900' : ''
      }`}
    >
      {mark}
      {text && <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{text}</p>}
    </div>
  )
}

export default Loader
