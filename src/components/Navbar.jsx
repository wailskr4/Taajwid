
import { useState } from 'react'

const navLinks = [
  { label: 'الرئيسية', href: '#home' },
  { label: 'السور', href: '#surahs' },
  { label: 'تقدمي', href: '#progress' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 border-b border-emerald-100 bg-white/95 backdrop-blur-md"
    >
      <nav
        aria-label="القائمة الرئيسية"
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4"
      >
        {/* Logo */}
        <a
          href="#home"
          onClick={() => setMenuOpen(false)}
          className="flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          aria-label="نور القرآن - الصفحة الرئيسية"
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-800 text-2xl font-bold text-white shadow-sm">
            ق
          </span>

          <span>
            <span className="block text-lg font-extrabold tracking-tight text-emerald-950">
              نور القرآن
            </span>
            <span className="block text-xs text-slate-500">
              التعلّم للجميع
            </span>
          </span>
        </a>

        {/* Navigation desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-700"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Accessibility shortcut */}
        <a
          href="#accessibility"
          className="hidden items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 lg:inline-flex"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="size-5"
          >
            <circle cx="12" cy="4.5" r="2.2" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 9h16M12 9v11m0-7-5 6m5-6 5 6"
            />
          </svg>
          إعدادات الوصول
        </a>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          className="flex size-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 md:hidden"
        >
          {menuOpen ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                d="m6 6 12 12M18 6 6 18"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                d="M4 7h16M4 12h16M4 17h16"
              />
            </svg>
          )}
        </button>
      </nav>

      {/* Navigation mobile */}
      {menuOpen && (
        <div
          id="mobile-navigation"
          className="border-t border-emerald-100 bg-white px-5 py-4 md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-4 py-3 font-semibold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-700"
              >
                {link.label}
              </a>
            ))}

            <a
              href="#accessibility"
              onClick={() => setMenuOpen(false)}
              className="rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              إعدادات الوصول
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
