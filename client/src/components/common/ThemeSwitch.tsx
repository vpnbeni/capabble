import React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { SegmentedControl } from '@/components/ui'
import { useTheme, type ThemePreference } from '@/utils/theme'

const OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/** Appearance row for account menus: System (default), Light or Dark. Must sit inside .cb-app. */
const ThemeSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const { preference, setPreference } = useTheme()
  return (
    <div className={className}>
      <div className="mb-1.5 text-xs font-medium text-[color:var(--ink-muted)]">Appearance</div>
      <SegmentedControl
        label="Appearance"
        options={OPTIONS}
        value={preference}
        onChange={(value) => setPreference(value as ThemePreference)}
        fullWidth
      />
    </div>
  )
}

export default ThemeSwitch
