import { useEffect, useMemo, useState } from 'react'
import { surahs } from './data/surahs'
import Navbar from './components/Navbar'
import Reading from './features/reading/Reading'
import AccessibilitySettings from './features/accessibility/AccessibilitySettings'

const STORAGE_KEY = 'quran-learning-progress'
const LAST_KEY = 'quran-learning-last-surah'

const FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'todo', label: 'لم أبدأ بعد' },
  { id: 'done', label: 'مكتملة' },
]

// Arabic plural rules for "verse"
function versesLabel(n) {
  if (n === 1) return 'آية واحدة'
  if (n === 2) return 'آيتان'
  if (n >= 3 && n <= 10) return `${n} آيات`
  return `${n} آية`
}

// Remove diacritics and unify letter forms so search is forgiving
function normalize(text = '') {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
}

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return value ?? fallback
  } catch {
    return fallback
  }
}

const numberedSurahs = surahs.map((surah, index) => ({
  ...surah,
  number: index + 1,
}))

export default function App() {
  const [completed, setCompleted] = useState(() => {
    const saved = readJSON(STORAGE_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [lastSurahId, setLastSurahId] = useState(() => readJSON(LAST_KEY, null))
  const [selectedSurah, setSelectedSurah] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed))
    } catch {
      // Storage may be full or blocked; progress still works for this session
    }
  }, [completed])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [selectedSurah])

  function toggleCompleted(id) {
    setCompleted((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    )
  }

  function openSurah(surah) {
    setSelectedSurah(surah)
    setLastSurahId(surah.id)
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(surah.id))
    } catch {
      // ignore
    }
  }

  const total = surahs.length
  const percent = total ? Math.round((completed.length / total) * 100) : 0
  const lastSurah = numberedSurahs.find((s) => s.id === lastSurahId)
  const nextSurah = numberedSurahs.find((s) => !completed.includes(s.id))

  const visibleSurahs = useMemo(() => {
    const q = normalize(query)
    return numberedSurahs.filter((surah) => {
      const isDone = completed.includes(surah.id)
      if (filter === 'done' && !isDone) return false
      if (filter === 'todo' && isDone) return false
      if (!q) return true
      return (
        normalize(surah.name).includes(q) || String(surah.number) === q
      )
    })
  }, [query, filter, completed])

  if (selectedSurah) {
    return (
      <div dir="rtl" lang="ar" className="min-h-screen bg-[#f7f8f3] text-slate-800">
        <Reading
          surahId={selectedSurah.id}
          surahName={selectedSurah.name}
          isCompleted={completed.includes(selectedSurah.id)}
          onToggleCompleted={() => toggleCompleted(selectedSurah.id)}
          onBack={() => setSelectedSurah(null)}
        />
      </div>
    )
  }

  const resumeTarget = lastSurah ?? nextSurah ?? numberedSurahs[0]
  const hasStarted = Boolean(lastSurah) || completed.length > 0

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-[#f7f8f3] text-slate-800">
      <a
        href="#surahs"
        className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-bold focus:text-emerald-900"
      >
        تخطَّ إلى قائمة السور
      </a>

      <Navbar />

      <main id="home" className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
        <section className="overflow-hidden rounded-3xl bg-emerald-900 p-7 text-white sm:p-12">
          <p className="mb-4 text-sm font-medium text-emerald-200">
            مرحباً بك في رحلتك التعليمية
          </p>

          <h1 className="max-w-2xl text-3xl font-bold leading-relaxed sm:text-5xl">
            تعلّم قراءة القرآن الكريم
            <span className="mt-2 block text-emerald-200">
              بكل سهولة وطمأنينة
            </span>
          </h1>

          <p className="mt-5 max-w-xl leading-8 text-emerald-100">
            استمع إلى التلاوة، وتدرّب على القراءة، وتابع تقدّمك خطوة بخطوة.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {resumeTarget && (
              <button
                type="button"
                onClick={() => openSurah(resumeTarget)}
                className="inline-flex rounded-xl bg-white px-6 py-3 font-bold text-emerald-900 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                {hasStarted
                  ? `تابع من سورة ${resumeTarget.name}`
                  : `ابدأ بسورة ${resumeTarget.name}`}
              </button>
            )}
            <a
              href="#surahs"
              className="inline-flex rounded-xl border border-emerald-300/50 px-6 py-3 font-semibold text-emerald-50 transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              تصفّح السور
            </a>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-100 bg-white p-6">
            <p className="text-sm text-slate-500">السور التي أتممتها</p>
            <p className="mt-3 text-3xl font-bold text-emerald-800">
              {completed.length}
              <span className="mr-2 text-base font-normal text-slate-500">
                من {total} ({percent}٪)
              </span>
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="نسبة إتمام السور"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={completed.length}
              aria-valuetext={`${completed.length} من ${total} سورة`}
            >
              <div
                className="h-full rounded-full bg-emerald-600 transition-all motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-6">
            <p className="text-sm text-slate-500">هدفنا</p>
            <h2 className="mt-3 text-xl font-bold text-emerald-900">
              التعلّم بطريقة مريحة
            </h2>
            <p className="mt-2 leading-7 text-slate-600">
              واجهة بسيطة، وخط واضح، وأدوات تساعد كل متعلّم.
            </p>
          </div>
        </section>

        <section id="surahs" className="mt-12 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">اختر السورة</h2>
            <p className="mt-2 text-slate-500">
              ابدأ بالسور القصيرة وتعلّم حسب وتيرتك.
            </p>
          </div>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
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
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                      active
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
                    }`}
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
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-lg font-bold text-slate-800">
                لا توجد سور مطابقة
              </p>
              <p className="mt-2 text-slate-500">
                جرّب اسماً آخر، أو اعرض كل السور.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
                className="mt-5 rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                عرض كل السور
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleSurahs.map((surah) => {
                const isCompleted = completed.includes(surah.id)

                return (
                  <article
                    key={surah.id}
                    className={`rounded-2xl border bg-white p-5 transition motion-reduce:transition-none hover:border-emerald-300 hover:shadow-lg ${
                      isCompleted ? 'border-emerald-200' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 font-bold text-emerald-800"
                        aria-hidden="true"
                      >
                        {surah.number}
                      </div>

                      {isCompleted && (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                          مكتملة
                        </span>
                      )}
                    </div>

                    <h3 className="mt-5 text-2xl font-bold text-emerald-950">
                      سورة {surah.name}
                    </h3>

                    <p className="mt-2 text-sm text-slate-500">
                      {versesLabel(surah.verses)}
                    </p>

                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openSurah(surah)}
                        className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                      >
                        {isCompleted ? 'مراجعة السورة' : 'ابدأ التعلّم'}
                      </button>

                      <button
                        type="button"
                        aria-pressed={isCompleted}
                        aria-label={
                          isCompleted
                            ? `إلغاء إتمام سورة ${surah.name}`
                            : `تحديد سورة ${surah.name} كمكتملة`
                        }
                        title={isCompleted ? 'إلغاء الإتمام' : 'تحديد كمكتملة'}
                        onClick={() => toggleCompleted(surah.id)}
                        className={`flex size-12 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                          isCompleted
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                            : 'border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-700'
                        }`}
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
              })}
            </div>
          )}
        </section>
      </main>

      <AccessibilitySettings />

      <footer className="border-t border-emerald-100 bg-white px-5 py-6 text-center text-sm text-slate-500">
        نور القرآن — التعلّم للجميع
      </footer>
    </div>
  )
}