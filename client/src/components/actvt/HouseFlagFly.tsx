import React, { useMemo } from 'react'
import { cx } from '@/components/ui'
import '@/styles/houseFlagFly.css'
import '@/components/actvt/houses.css'

type HouseFlagFlyProps = {
  src: string
  alt?: string
  className?: string
  /** Visual height of the cloth in px (width follows 3:2). */
  height?: number
  /** Full mast height in px. Defaults to cloth height + padding. */
  poleHeight?: number
  /** Play a short hoist-up intro once mounted. */
  hoist?: boolean
  /** Softer motion for tight layouts. */
  compact?: boolean
}

const SLICE_COUNT = 12
/** Extra width per slice so seams overlap and hide sub-pixel gaps. */
const SLICE_OVERLAP_PX = 2

/**
 * House flag with pole + fabric wave (flying in wind).
 * Cloth is split into vertical slices with staggered sway for a fabric feel.
 * Motion lives in styles/houseFlagFly.css; the mast is re-skinned with design tokens in
 * houses.css (`.ah-flag`) so it follows light and dark mode.
 */
export const HouseFlagFly: React.FC<HouseFlagFlyProps> = ({
  src,
  alt = 'House flag',
  className = '',
  height = 96,
  poleHeight,
  hoist = true,
  compact = false,
}) => {
  const width = Math.round(height * 1.5)
  const mastHeight = Math.max(poleHeight ?? height + 28, height + 28)
  const sliceWidth = width / SLICE_COUNT

  const slices = useMemo(
    () =>
      Array.from({ length: SLICE_COUNT }, (_, index) => ({
        index,
        left: index * sliceWidth,
        width: sliceWidth + SLICE_OVERLAP_PX,
        backgroundPosition: `-${index * sliceWidth}px 0`,
        delay: `${index * 0.06}s`,
        zIndex: index,
      })),
    [sliceWidth]
  )

  return (
    <div
      className={cx(
        'house-flag-fly',
        'ah-flag',
        hoist && 'house-flag-fly--hoist',
        compact && 'house-flag-fly--compact',
        className
      )}
      style={
        {
          '--flag-h': `${height}px`,
          '--flag-w': `${width}px`,
          '--pole-h': `${mastHeight}px`,
        } as React.CSSProperties
      }
      role="img"
      aria-label={alt}
    >
      <div className="house-flag-fly__mast" aria-hidden>
        <span className="house-flag-fly__finial" />
        <span className="house-flag-fly__pole" />
        <span className="house-flag-fly__base" />
      </div>

      <div className="house-flag-fly__rig">
        <div className="house-flag-fly__cloth">
          {slices.map((slice) => (
            <span
              key={slice.index}
              className="house-flag-fly__slice"
              style={{
                left: slice.left,
                width: slice.width,
                zIndex: slice.zIndex,
                backgroundImage: `url(${src})`,
                backgroundPosition: slice.backgroundPosition,
                backgroundSize: `${width}px 100%`,
                animationDelay: slice.delay,
              }}
            />
          ))}
          <img src={src} alt="" className="house-flag-fly__sr-only" />
        </div>
        <span className="house-flag-fly__shadow" aria-hidden />
      </div>
    </div>
  )
}

export default HouseFlagFly
