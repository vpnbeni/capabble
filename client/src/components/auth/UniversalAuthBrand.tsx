import React from 'react'
import capabbleMark from '../../assets/capabble-mark.svg'

interface UniversalAuthBrandProps {
  compact?: boolean
  subtitle?: string
}

const UniversalAuthBrand: React.FC<UniversalAuthBrandProps> = ({
  compact = false,
  subtitle = 'Unified module access',
}) => {
  return (
    <div className={`inline-flex items-center gap-3 ${compact ? '' : 'rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm'}`}>
      <img
        src={capabbleMark}
        alt="Capabble"
        className="h-11 w-11 shrink-0 object-contain drop-shadow-sm"
      />
      <div>
        <p className="text-lg font-bold tracking-tight text-slate-900">Capabble</p>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{subtitle}</p>
      </div>
    </div>
  )
}

export default UniversalAuthBrand
