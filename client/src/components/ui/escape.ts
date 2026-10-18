import { useEffect, useRef } from 'react'

// Open overlays, oldest first. Escape closes only the topmost one, so a Dialog
// opened over a Sheet doesn't close the Sheet too.
const escapeStack: Array<{ current: (() => void) | undefined }> = []

export const useEscape = (open: boolean, onClose?: () => void) => {
  const handlerRef = useRef(onClose)
  handlerRef.current = onClose
  useEffect(() => {
    if (!open) return
    const entry = handlerRef
    escapeStack.push(entry)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || escapeStack[escapeStack.length - 1] !== entry) return
      entry.current?.()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const index = escapeStack.lastIndexOf(entry)
      if (index >= 0) escapeStack.splice(index, 1)
    }
  }, [open])
}
