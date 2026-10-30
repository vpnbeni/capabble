/** Design-system switch; `mixed` shows a module with some pages on. */
export function Switch({ checked, mixed = false, label, disabled, onChange }: {
  checked: boolean
  mixed?: boolean
  label: string
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      className={`cb-switch__track${checked ? ' is-on' : ''}${mixed ? ' is-mixed' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onChange(mixed ? true : !checked)
      }}
    >
      <span className="cb-switch__thumb" />
    </button>
  )
}
