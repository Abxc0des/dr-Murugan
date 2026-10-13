import { useEffect, useRef } from 'react'

// Minimal accessible confirmation dialog: focus moves to the confirm button once
// when opened, Escape cancels, the backdrop cancels, and the dialog is inert
// while a destructive action is in flight.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  busyLabel = 'Working…',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)
  const onCancelRef = useRef(onCancel)
  const busyRef = useRef(busy)

  onCancelRef.current = onCancel
  busyRef.current = busy

  // Focus the confirm action once when the dialog opens, and restore focus after.
  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null
    confirmRef.current?.focus()
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open])

  // Register the Escape handler once while open; read live values through refs so
  // this effect does not re-run (and re-steal focus) on every render.
  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !busyRef.current) onCancelRef.current?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        {description ? <p>{description}</p> : null}
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} className="button button-danger" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
