import { Moon, Sun } from './icons'
import type { Theme } from '../theme'

/** Icon button that switches between the light and dark design themes. */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="icon-button"
      onClick={onToggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  )
}
