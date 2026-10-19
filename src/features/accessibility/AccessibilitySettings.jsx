import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  FONT_SIZE_STORAGE_KEY,
  applyFontSize,
  getStoredFontSize,
  safeSet,
} from './accessibility'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export default function AccessibilitySettings({ currentTheme, onThemeChange, themes }) {
  const [isOpen, setIsOpen] = useState(false)
  const [fontSize, setFontSize] = useState(getStoredFontSize)

  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const triggerRef = useRef(null)

  /* ---- Font size: apply + persist ---- */
  useEffect(() => {
    applyFontSize(fontSize)
    safeSet(FONT_SIZE_STORAGE_KEY, fontSize)
  }, [fontSize])

  /* ---- Dialog behaviour: Escape, focus trap, scroll lock, focus return ---- */
  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        return
      }
      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE)
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus()
    }
  }, [isOpen])

  const resetAll = () => {
    onThemeChange('soft')
    setFontSize(DEFAULT_FONT_SIZE)
  }

  const outline = { outlineColor: 'var(--color-primary)' }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="إعدادات الوصول"
        className="fixed bottom-6 left-6 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-lg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4"
        style={{ backgroundColor: 'var(--color-primary)', outlineColor: 'var(--color-primary)' }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          // mousedown (not click) so a drag that ends on the backdrop doesn't close the dialog
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false)
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-title"
            dir="rtl"
            lang="ar"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 id="a11y-title" className="text-xl font-bold">
                إعدادات الوصول
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="إغلاق"
                className="flex size-11 items-center justify-center rounded-full transition hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={outline}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Theme */}
            <section className="mb-6" aria-labelledby="a11y-theme">
              <h3 id="a11y-theme" className="mb-3 font-semibold">
                نمط الألوان
              </h3>
              <div className="space-y-2">
                {Object.entries(themes).map(([key, option]) => {
                  const selected = currentTheme === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onThemeChange(key)}
                      className="w-full rounded-xl border-2 p-4 text-right transition focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        ...outline,
                        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                        backgroundColor: selected ? 'var(--color-secondary)' : 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex shrink-0" aria-hidden="true">
                          <span
                            className="size-8 rounded-full border"
                            style={{ backgroundColor: option.primary, borderColor: 'var(--color-border)' }}
                          />
                          <span
                            className="-mr-3 size-8 rounded-full border"
                            style={{ backgroundColor: option.accent, borderColor: 'var(--color-border)' }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{option.name}</p>
                          {option.description && (
                            <p className="text-xs opacity-70">{option.description}</p>
                          )}
                        </div>
                        {selected && (
                          <span style={{ color: 'var(--color-primary)' }}>
                            <CheckIcon />
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Font size */}
            <section className="mb-6" aria-labelledby="a11y-font">
              <h3 id="a11y-font" className="mb-3 font-semibold">
                حجم الخط
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(FONT_SIZES).map(([id, size]) => {
                  const selected = fontSize === id
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setFontSize(id)}
                      className="rounded-lg border-2 px-2 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        ...outline,
                        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                        backgroundColor: selected ? 'var(--color-secondary)' : 'transparent',
                      }}
                    >
                      {size.label}
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Hearing note */}
            <div
              className="mb-6 rounded-xl p-4 text-sm"
              style={{ backgroundColor: 'var(--color-highlight)', color: 'var(--color-text)' }}
            >
              <p className="mb-1 font-bold">لضعاف السمع</p>
              <p>
                يتم تمييز الكلمات المتطابقة بألوان واضحة ورموز بصرية بدلاً من الاعتماد على الصوت فقط.
              </p>
            </div>

            <button
              type="button"
              onClick={resetAll}
              className="w-full rounded-xl border-2 px-4 py-3 font-semibold transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ ...outline, borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
            >
              إعادة الضبط الافتراضي
            </button>
          </div>
        </div>
      )}
    </>
  )
}