import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { surahs } from './data/surahs'
import Navbar from './components/Navbar'
import Reading from './features/reading/Reading'
import AccessibilitySettings from './features/accessibility/AccessibilitySettings'
import SocialShare from './features/social/SocialShare'
import { ThemeProvider, useTheme } from './context/ThemeContext'

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = 'quran-learning-progress'
const LAST_KEY = 'quran-learning-last-surah'
const VERSE_PROGRESS_KEY = 'quran-verse-progress'
const BOOKMARKS_KEY = 'quran-bookmarks'
const STREAK_KEY = 'quran-streak'

const EMPTY_ARRAY = []
const EMPTY_OBJECT = {}
const INITIAL_STREAK = { count: 0, lastDate: null }

const FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'todo', label: 'لم أبدأ بعد' },
  { id: 'progress', label: 'قيد التعلّم' },
  { id: 'done', label: 'مكتملة' },
  { id: 'bookmarked', label: 'المحفوظات' },
]

// Accessibility-oriented palettes.
// `surface` replaces hard-coded white so cards follow the active theme,
// `border` gives high-contrast mode a border that is actually visible.
const THEMES = {
  calm: {
    // Reduced stimulation (autism-friendly)
    name: 'هادئ',
    primary: '#2D5A3D',
    secondary: '#E8F5E9',
    accent: '#81C784',
    background: '#FAFAF7',
    surface: '#FFFFFF',
    border: '#81C784',
    text: '#1B1B1B',
    highlight: '#C8E6C9',
    warning: '#F9A825',
    success: '#2E7D32',
    error: '#C62828',
  },
  highContrast: {
    // Low vision
    name: 'تباين عالٍ',
    primary: '#000000',
    secondary: '#FFFFFF',
    accent: '#FFD700',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    border: '#000000',
    text: '#000000',
    highlight: '#FFFF00',
    warning: '#FF6600',
    success: '#006600',
    error: '#CC0000',
  },
  soft: {
    // Default, gentle
    name: 'ناعم',
    primary: '#047857',
    secondary: '#ECFDF5',
    accent: '#10B981',
    background: '#F7F8F3',
    surface: '#FFFFFF',
    border: '#A7D8C4',
    text: '#1E293B',
    highlight: '#D1FAE5',
    warning: '#D97706',
    success: '#047857',
    error: '#DC2626',
  },
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function versesLabel(n) {
  if (n === 1) return 'آية واحدة'
  if (n === 2) return 'آيتان'
  if (n >= 3 && n <= 10) return `${n} آيات`
  return `${n} آية`
}

// Makes Arabic search forgiving: removes diacritics and tatweel, unifies
// letter variants, converts Arabic-Indic digits, and drops a leading "سورة".
function normalize(text = '') {
  return text
    .replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
    .replace(/^سوره\s+/, '')
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) ?? fallback
  } catch (error) {
    console.error(`Could not read "${key}":`, error)
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Could not save "${key}":`, error)
  }
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Calendar-based (not 24h-based) so daylight-saving changes can't break streaks.
function getYesterdayKey() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return getLocalDateKey(d)
}

const isArray = Array.isArray
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isValidStreak = (v) =>
  isPlainObject(v) && Number.isFinite(v.count) && (v.lastDate === null || typeof v.lastDate === 'string')

/**
 * useState that is loaded from, validated against, and saved to localStorage.
 * Replaces five near-identical read/write blocks.
 */
function usePersistentState(key, fallback, validate = () => true) {
  const [value, setValue] = useState(() => {
    const saved = readJSON(key, fallback)
    return validate(saved) ? saved : fallback
  })

  useEffect(() => {
    writeJSON(key, value)
  }, [key, value])

  return [value, setValue]
}

const numberedSurahs = surahs.map((surah, index) => ({
  ...surah,
  number: index + 1,
}))

/* -------------------------------------------------------------------------- */
/*  Small presentational components                                           */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, suffix, hint, children }) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{ backgroundColor: 'var(--color-secondary)', borderColor: 'var(--color-border)' }}
    >
      <p className="text-sm opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>
        {value}
        {suffix && <span className="mr-2 text-base font-normal opacity-70">{suffix}</span>}
      </p>
      {children}
      {hint && <p className="mt-2 text-sm opacity-70">{hint}</p>}
    </div>
  )
}

const SurahCard = memo(function SurahCard({
  surah,
  isCompleted,
  progress,
  bookmarkCount,
  onOpen,
  onToggle,
}) {
  return (
    <article
      className="rounded-2xl border p-5 transition hover:shadow-lg motion-reduce:transition-none"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: isCompleted ? 'var(--color-success)' : 'var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex size-11 items-center justify-center rounded-xl font-bold"
          style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-primary)' }}
          aria-hidden="true"
        >
          {surah.number}
        </div>

        <div className="flex gap-2">
          {bookmarkCount > 0 && (
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: 'var(--color-highlight)', color: 'var(--color-primary)' }}
            >
              {bookmarkCount} محفوظة
            </span>
          )}
          {isCompleted && (
            <span
              className="rounded-full px-3 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: 'var(--color-success)' }}
            >
              مكتملة
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-5 text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
        سورة {surah.name}
      </h3>

      <p className="mt-2 text-sm opacity-70">{versesLabel(surah.verses)}</p>

      {progress > 0 && !isCompleted && (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--color-secondary)' }}
            role="progressbar"
            aria-label={`تقدّم سورة ${surah.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full transition-all motion-reduce:transition-none"
              style={{ width: `${progress}%`, backgroundColor: 'var(--color-accent)' }}
            />
          </div>
          <p className="mt-1 text-xs opacity-70">{progress}٪ مكتمل</p>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => onOpen(surah)}
          className="flex-1 rounded-xl px-4 py-3 font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: 'var(--color-primary)', outlineColor: 'var(--color-primary)' }}
        >
          {isCompleted ? 'مراجعة السورة' : progress > 0 ? 'تابع التعلّم' : 'ابدأ التعلّم'}
        </button>

        <button
          type="button"
          aria-pressed={isCompleted}
          aria-label={
            isCompleted
              ? `إلغاء إتمام سورة ${surah.name}`
              : `تحديد سورة ${surah.name} كمكتملة`
          }
          onClick={() => onToggle(surah.id)}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: isCompleted ? 'var(--color-success)' : 'var(--color-border)',
            backgroundColor: isCompleted ? 'var(--color-secondary)' : 'var(--color-surface)',
            color: isCompleted ? 'var(--color-success)' : 'var(--color-primary)',
            outlineColor: 'var(--color-primary)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>
      </div>
    </article>
  )
})

/* -------------------------------------------------------------------------- */
/*  Main content                                                              */
/* -------------------------------------------------------------------------- */

function AppContent() {
  const { theme, themeName, setTheme } = useTheme()

  const [completed, setCompleted] = usePersistentState(STORAGE_KEY, EMPTY_ARRAY, isArray)
  const [lastSurahId, setLastSurahId] = usePersistentState(LAST_KEY, null)
  // { [surahId]: { [verseNumber]: 'match' | 'review' | 'pending' } }
  const [verseProgress, setVerseProgress] = usePersistentState(
    VERSE_PROGRESS_KEY,
    EMPTY_OBJECT,
    isPlainObject
  )
  // [{ surahId, surahName, verseNumber, timestamp }]
  const [bookmarks, setBookmarks] = usePersistentState(BOOKMARKS_KEY, EMPTY_ARRAY, isArray)
  const [streak, setStreak] = usePersistentState(STREAK_KEY, INITIAL_STREAK, isValidStreak)

  const [selectedSurah, setSelectedSurah] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  /* ---- Streak: pure updater (safe under StrictMode); persistence is in the hook ---- */
  useEffect(() => {
    const today = getLocalDateKey()
    const yesterday = getYesterdayKey()

    setStreak((previous) => {
      if (previous.lastDate === today) return previous
      return {
        count: previous.lastDate === yesterday ? previous.count + 1 : 1,
        lastDate: today,
      }
    })
  }, [setStreak])

  /* ---- Theme -> CSS variables ---- */
  useEffect(() => {
    const root = document.documentElement
    const known = Boolean(THEMES[themeName])
    const active = known ? THEMES[themeName] : THEMES.soft

    const variables = {
      '--color-primary': active.primary,
      '--color-secondary': active.secondary,
      '--color-accent': active.accent,
      '--color-bg': active.background,
      '--color-surface': active.surface,
      '--color-border': active.border,
      '--color-text': active.text,
      '--color-highlight': active.highlight,
      '--color-warning': active.warning,
      '--color-success': active.success,
      '--color-error': active.error,
    }

    Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value))
    root.dataset.theme = known ? themeName : 'soft'
  }, [themeName])

  /* ---- Scroll to top whenever the view changes ---- */
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [selectedSurah])

  /* ---- Browser back button closes the reading view instead of leaving the app ---- */
  useEffect(() => {
    const onPopState = (event) => {
      const id = event.state?.surahId
      setSelectedSurah(id ? numberedSurahs.find((s) => s.id === id) ?? null : null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /* ---- Actions ---- */
  const openSurah = useCallback(
    (surah) => {
      window.history.pushState({ surahId: surah.id }, '')
      setSelectedSurah(surah)
      setLastSurahId(surah.id)
    },
    [setLastSurahId]
  )

  const closeSurah = useCallback(() => {
    if (window.history.state?.surahId) {
      window.history.back()
    } else {
      setSelectedSurah(null)
    }
  }, [])

  const toggleCompleted = useCallback(
    (id) => {
      setCompleted((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      )
    },
    [setCompleted]
  )

  const updateVerseProgress = useCallback(
    (surahId, verseNumber, status) => {
      setVerseProgress((prev) => ({
        ...prev,
        [surahId]: { ...prev[surahId], [verseNumber]: status },
      }))
    },
    [setVerseProgress]
  )

  const addBookmark = useCallback(
    (surahId, surahName, verseNumber) => {
      setBookmarks((prev) => {
        const exists = prev.some((b) => b.surahId === surahId && b.verseNumber === verseNumber)
        if (exists) return prev
        return [...prev, { surahId, surahName, verseNumber, timestamp: Date.now() }]
      })
    },
    [setBookmarks]
  )

  const removeBookmark = useCallback(
    (surahId, verseNumber) => {
      setBookmarks((prev) =>
        prev.filter((b) => !(b.surahId === surahId && b.verseNumber === verseNumber))
      )
    },
    [setBookmarks]
  )

  /* ---- Derived data (computed once per change, not once per card) ---- */
  const completedSet = useMemo(() => new Set(completed), [completed])

  const bookmarkCounts = useMemo(() => {
    const counts = {}
    bookmarks.forEach((b) => {
      counts[b.surahId] = (counts[b.surahId] ?? 0) + 1
    })
    return counts
  }, [bookmarks])

  const progressBySurah = useMemo(() => {
    const result = {}
    numberedSurahs.forEach((surah) => {
      const progress = verseProgress[surah.id]
      if (!progress || !surah.verses) {
        result[surah.id] = 0
        return
      }
      const matched = Object.values(progress).filter((v) => v === 'match').length
      result[surah.id] = Math.min(100, Math.round((matched / surah.verses) * 100))
    })
    return result
  }, [verseProgress])

  const visibleSurahs = useMemo(() => {
    const q = normalize(query)

    return numberedSurahs.filter((surah) => {
      const isDone = completedSet.has(surah.id)
      const hasProgress = progressBySurah[surah.id] > 0

      if (filter === 'done' && !isDone) return false
      if (filter === 'todo' && (isDone || hasProgress)) return false
      if (filter === 'progress' && (isDone || !hasProgress)) return false
      if (filter === 'bookmarked' && !bookmarkCounts[surah.id]) return false
      if (!q) return true

      return normalize(surah.name).includes(q) || String(surah.number) === q
    })
  }, [query, filter, completedSet, bookmarkCounts, progressBySurah])

  const total = surahs.length
  const percent = total ? Math.round((completed.length / total) * 100) : 0
  const lastSurah = numberedSurahs.find((s) => s.id === lastSurahId)
  const nextSurah = numberedSurahs.find((s) => !completedSet.has(s.id))
  const resumeTarget = lastSurah ?? nextSurah ?? numberedSurahs[0]
  const hasStarted = Boolean(lastSurah) || completed.length > 0

  /* ---------------------------------------------------------------------- */
  /*  Render                                                                */
  /* ---------------------------------------------------------------------- */

  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen transition-colors duration-300 motion-reduce:transition-none"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {selectedSurah ? (
        <Reading
          surahId={selectedSurah.id}
          surahName={selectedSurah.name}
          isCompleted={completedSet.has(selectedSurah.id)}
          onToggleCompleted={() => toggleCompleted(selectedSurah.id)}
          onBack={closeSurah}
          verseProgress={verseProgress[selectedSurah.id] || EMPTY_OBJECT}
          onUpdateVerseProgress={(verse, status) =>
            updateVerseProgress(selectedSurah.id, verse, status)
          }
          bookmarks={bookmarks.filter((b) => b.surahId === selectedSurah.id)}
          onAddBookmark={(verse) => addBookmark(selectedSurah.id, selectedSurah.name, verse)}
          onRemoveBookmark={(verse) => removeBookmark(selectedSurah.id, verse)}
          theme={theme}
        />
      ) : (
        <>
          <a
            href="#surahs"
            className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:font-bold"
            style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-surface)' }}
          >
            تخطَّ إلى قائمة السور
          </a>

          <Navbar streak={streak.count} />

          <main id="home" className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
            {/* Hero */}
            <section
              className="overflow-hidden rounded-3xl p-7 text-white sm:p-12"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <p className="mb-4 text-sm font-medium opacity-90">مرحباً بك في رحلتك التعليمية</p>

              <h1 className="max-w-2xl text-3xl font-bold leading-relaxed sm:text-5xl">
                تعلّم قراءة القرآن الكريم
                <span className="mt-2 block opacity-90">بكل سهولة وطمأنينة</span>
              </h1>

              <p className="mt-5 max-w-xl leading-8 opacity-90">
                استمع إلى التلاوة، وتدرّب على القراءة، وتابع تقدّمك خطوة بخطوة.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {resumeTarget && (
                  <button
                    type="button"
                    onClick={() => openSurah(resumeTarget)}
                    className="inline-flex rounded-xl px-6 py-3 font-bold transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                    style={{ color: 'var(--color-primary)', backgroundColor: '#FFFFFF' }}
                  >
                    {hasStarted
                      ? `تابع من سورة ${resumeTarget.name}`
                      : `ابدأ بسورة ${resumeTarget.name}`}
                  </button>
                )}
                <a
                  href="#surahs"
                  className="inline-flex rounded-xl border border-white/60 px-6 py-3 font-semibold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  تصفّح السور
                </a>
              </div>
            </section>

            {/* Stats */}
            <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="إحصائياتك">
              <StatCard
                label="السور التي أتممتها"
                value={completed.length}
                suffix={`من ${total} (${percent}٪)`}
              >
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                  role="progressbar"
                  aria-label="نسبة إتمام السور"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={completed.length}
                  aria-valuetext={`${completed.length} من ${total} سورة`}
                >
                  <div
                    className="h-full rounded-full transition-all motion-reduce:transition-none"
                    style={{ width: `${percent}%`, backgroundColor: 'var(--color-success)' }}
                  />
                </div>
              </StatCard>

              <StatCard
                label="أيام التعلم المتتالية"
                value={streak.count}
                suffix="يوم"
                hint={
                  streak.count > 1
                    ? 'استمر! أنت تتقدم بشكل رائع'
                    : 'عُد غداً لتواصل سلسلتك'
                }
              />

              <StatCard
                label="الآيات المحفوظة"
                value={bookmarks.length}
                hint="اضغط على الآية لحفظها للمراجعة"
              />
            </section>

            {/* Surah list */}
            <section id="surahs" tabIndex={-1} className="mt-12 scroll-mt-6 outline-none">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">اختر السورة</h2>
                <p className="mt-2 opacity-70">ابدأ بالسور القصيرة وتعلّم حسب وتيرتك.</p>
              </div>

              <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="w-full sm:max-w-xs">
                  <label htmlFor="surah-search" className="sr-only">
                    ابحث عن سورة
                  </label>
                  <input
                    id="surah-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث باسم السورة أو رقمها"
                    autoComplete="off"
                    className="w-full rounded-xl border px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      borderColor: 'var(--color-border)',
                      outlineColor: 'var(--color-primary)',
                    }}
                  />
                </div>

                <div role="group" aria-label="تصفية السور" className="flex flex-wrap gap-2">
                  {FILTERS.map((item) => {
                    const active = filter === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFilter(item.id)}
                        className="rounded-full border px-4 py-2 text-sm font-medium transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          backgroundColor: active ? 'var(--color-primary)' : 'var(--color-surface)',
                          borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                          color: active ? '#FFFFFF' : 'var(--color-text)',
                          outlineColor: 'var(--color-primary)',
                        }}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="sr-only" role="status" aria-live="polite">
                {visibleSurahs.length} سورة معروضة
              </p>

              {visibleSurahs.length === 0 ? (
                <div
                  className="rounded-2xl border border-dashed p-10 text-center"
                  style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <p className="text-lg font-bold">لا توجد سور مطابقة</p>
                  <p className="mt-2 opacity-70">جرّب اسماً آخر، أو اعرض كل السور.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                      setFilter('all')
                    }}
                    className="mt-5 rounded-xl px-5 py-2.5 font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ backgroundColor: 'var(--color-primary)', outlineColor: 'var(--color-primary)' }}
                  >
                    عرض كل السور
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleSurahs.map((surah) => (
                    <SurahCard
                      key={surah.id}
                      surah={surah}
                      isCompleted={completedSet.has(surah.id)}
                      progress={progressBySurah[surah.id] ?? 0}
                      bookmarkCount={bookmarkCounts[surah.id] ?? 0}
                      onOpen={openSurah}
                      onToggle={toggleCompleted}
                    />
                  ))}
                </div>
              )}
            </section>

            <SocialShare
              completed={completed.length}
              total={total}
              streak={streak.count}
              theme={theme}
            />
          </main>

          <footer
            className="border-t px-5 py-6 text-center text-sm opacity-70"
            style={{ borderColor: 'var(--color-border)' }}
          >
            نور القرآن — التعلّم للجميع
          </footer>
        </>
      )}

      {/* Rendered once for both views */}
      <AccessibilitySettings currentTheme={themeName} onThemeChange={setTheme} themes={THEMES} />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}