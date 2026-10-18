
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'

const API_URL = 'https://api.alquran.cloud/v1'

const normalizeArabic = (text = '') =>
  text
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .trim()

export default function Reading({
  surahId,
  surahName = '',
  isCompleted = false,
  onToggleCompleted,
  onBack,
}) {
  const [surah, setSurah] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [wordStates, setWordStates] = useState({})
  const [playingAyah, setPlayingAyah] = useState(null)

const [currentAyahIndex, setCurrentAyahIndex] = useState(0)
const [simpleMode, setSimpleMode] = useState(
  () => document.documentElement.dataset.a11ySimple === 'on'
)
const [largeControls, setLargeControls] = useState(true)



useEffect(() => {
  const syncAccessibility = () => {
    const root = document.documentElement

    setSimpleMode(root.dataset.a11ySimple === 'on')
    setLargeControls(root.dataset.a11ySimple === 'on')
  }

  window.addEventListener('a11y-settings-changed', syncAccessibility)

  return () => {
    window.removeEventListener('a11y-settings-changed', syncAccessibility)
  }
}, [])



  const recognitionRef = useRef(null)
  const audioRef = useRef(null)


  useEffect(() => {
    let cancelled = false

    async function loadSurah() {
      setLoading(true)
      setError('')
      setSurah(null)
      setWordStates({})
      setTranscript('')

      try {
        const response = await fetch(
          `${API_URL}/surah/${surahId}/ar.alafasy`,
        )

        if (!response.ok) {
          throw new Error('تعذر تحميل السورة')
        }

        const result = await response.json()

        if (result.code !== 200 || !result.data?.ayahs) {
          throw new Error('بيانات السورة غير متاحة')
        }

        if (!cancelled) setSurah(result.data)
      } catch {
        if (!cancelled) {
          setError('تعذر تحميل السورة. تحقق من اتصال الإنترنت ثم حاول مجدداً.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSurah()

    return () => {
      cancelled = true
    }
  }, [surahId])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      audioRef.current?.pause()
    }
  }, [])

  function stopListening() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError(
        'المتصفح لا يدعم التعرف على الصوت. جرّب متصفحاً يدعم هذه الخاصية.',
      )
      return
    }

    recognitionRef.current?.stop()

    const recognition = new SpeechRecognition()
    recognition.lang = 'ar-SA'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setListening(true)
      setError('')
    }

    recognition.onresult = (event) => {
      let spoken = ''

      for (let i = 0; i < event.results.length; i++) {
        spoken += `${event.results[i][0].transcript} `
      }

      setTranscript(spoken.trim())

      const expectedWords = (surah?.ayahs || [])
        .flatMap((ayah) =>
          normalizeArabic(ayah.text).split(/\s+/),
        )
        .filter(Boolean)

      const spokenWords = normalizeArabic(spoken)
        .split(/\s+/)
        .filter(Boolean)

      const nextStates = {}

      spokenWords.forEach((word, index) => {
        if (index >= expectedWords.length) return

        nextStates[index] =
          word === expectedWords[index] ? 'match' : 'review'
      })

      setWordStates(nextStates)
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(
          'لم نتمكن من التعرف على الصوت. تحقق من إذن الميكروفون وحاول مجدداً.',
        )
      }
      setListening(false)
    }

    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
  }

  function playAyah(ayah) {
    if (!ayah.audio) {
      setError('الصوت غير متاح لهذه الآية حالياً.')
      return
    }

    if (playingAyah === ayah.numberInSurah) {
      audioRef.current?.pause()
      setPlayingAyah(null)
      return
    }

    if (!audioRef.current) {
      audioRef.current = new Audio()
    }

    audioRef.current.pause()
    audioRef.current.src = ayah.audio
    audioRef.current.onended = () => setPlayingAyah(null)
    audioRef.current.onerror = () => {
      setPlayingAyah(null)
      setError('تعذر تشغيل الصوت. حاول مجدداً.')
    }

    audioRef.current.play()
      .then(() => setPlayingAyah(ayah.numberInSurah))
      .catch(() => setError('تعذر تشغيل الصوت حالياً.'))
  }

  function resetPractice() {
    stopListening()
    audioRef.current?.pause()
    setPlayingAyah(null)
    setTranscript('')
    setWordStates({})
    setError('')
  }

  const allWords = (surah?.ayahs || [])
    .flatMap((ayah) => normalizeArabic(ayah.text).split(/\s+/))
    .filter(Boolean)

  const matchedCount = Object.values(wordStates)
    .filter((state) => state === 'match').length

  const progress = allWords.length
    ? Math.round((matchedCount / allWords.length) * 100)
    : 0

const wordOffsets = (surah?.ayahs || []).map((_, index, ayahs) =>
  ayahs
    .slice(0, index)
    .reduce(
      (total, item) =>
        total + normalizeArabic(item.text).split(/\s+/).filter(Boolean).length,
      0
    )
)
  let wordIndex = simpleMode ? (wordOffsets[currentAyahIndex] || 0) : 0
  return (
    <main
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-[#f7f8f3] px-4 py-8 text-slate-800 sm:px-8"
    >
      <div className="mx-auto max-w-4xl">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 rounded-xl px-4 py-3 font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
        >
          <ArrowRight size={20} />
          العودة إلى السور
        </button>

        <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-3 flex items-center gap-3 text-emerald-700">
            <BookOpen size={25} />
            <span className="font-medium">رحلة التعلم</span>
          </div>

          <h1 className="text-3xl font-bold text-emerald-950 sm:text-4xl">
            {surah?.name || surahName}
          </h1>

          {surah && (
            <p className="mt-2 text-slate-500">
              {surah.numberOfAyahs} آيات
            </p>
          )}

          <p className="mt-4 leading-8 text-slate-600">
            اقرأ بهدوء، واستمع إلى التلاوة، واستخدم الميكروفون
            لتجربة المتابعة الصوتية.
          </p>
        </header>

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-white p-10">
            <LoaderCircle className="animate-spin text-emerald-700" />
            <span>جارٍ تحميل السورة...</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
          >
            {error}
          </div>
        )}

        {!loading && !surah && (
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-white"
          >
            إعادة المحاولة
          </button>
        )}

        {surah && (
          <>
            <section
              aria-label="أدوات القراءة"
              className="mb-6 rounded-2xl bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={listening ? stopListening : startListening}
                  className={`inline-flex  min-h-14 items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    listening
                      ? 'bg-rose-600 focus-visible:outline-rose-700'
                      : 'bg-emerald-700 focus-visible:outline-emerald-700'
                  }`}
                >
                  {listening ? <MicOff size={19} /> : <Mic size={19} />}
                  {listening ? 'إيقاف الميكروفون' : 'ابدأ القراءة الصوتية'}
                </button>

                <button
                  onClick={resetPractice}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
                >
                  <RotateCcw size={18} />
                  إعادة المحاولة
                </button>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-500">
                {listening
                  ? 'الميكروفون يعمل. تابع القراءة بوضوح.'
                  : 'يمكنك الاستماع إلى كل آية أو تجربة المتابعة الصوتية.'}
              </p>

              <div className="mt-5">
                <div className="mb-2 flex justify-between text-sm">
                  <span>المتابعة التقريبية</span>
                  <span>{progress}%</span>
                </div>

                <div
                  className="h-3 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="نسبة الكلمات المتطابقة تقريبياً"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-2 text-emerald-700">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  تطابق محتمل
                </span>
                <span className="flex items-center gap-2 text-amber-700">
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  يحتاج إلى مراجعة
                </span>
                <span className="flex items-center gap-2 text-slate-500">
                  <span className="h-3 w-3 rounded-full bg-slate-300" />
                  لم تتم متابعته
                </span>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-8">
                
{simpleMode && (
  <div className="mb-6 rounded-2xl bg-emerald-50 p-5">
    <p className="mb-4 text-center text-lg font-bold text-emerald-950">
      الآية {currentAyahIndex + 1} من {surah.ayahs.length}
    </p>

    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        disabled={currentAyahIndex === 0}
        onClick={() => setCurrentAyahIndex((i) => i - 1)}
        className={`min-h-14 rounded-xl bg-white px-5 font-bold text-emerald-900 shadow-sm disabled:opacity-40 ${
          largeControls ? 'text-lg' : 'text-sm'
        }`}
      >
        الآية السابقة
      </button>

      <button
        type="button"
        disabled={currentAyahIndex >= surah.ayahs.length - 1}
        onClick={() => setCurrentAyahIndex((i) => i + 1)}
        className={`min-h-14 rounded-xl bg-emerald-700 px-5 font-bold text-white disabled:opacity-40 ${
          largeControls ? 'text-lg' : 'text-sm'
        }`}
      >
        الآية التالية
      </button>
    </div>
  </div>
)}

              <h2 className="mb-6 text-xl font-bold text-emerald-950">
                آيات السورة
              </h2>

              <div className="space-y-6">
{(simpleMode
  ? [surah.ayahs[currentAyahIndex]].filter(Boolean)
  : surah.ayahs
).map((ayah) => (                  <article
                    key={ayah.numberInSurah}
                    className="rounded-2xl border border-slate-100 p-4 sm:p-6"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                        الآية {ayah.numberInSurah}
                      </span>

                      <button
                        onClick={() => playAyah(ayah)}
                        aria-label={
                          playingAyah === ayah.numberInSurah
                            ? 'إيقاف التلاوة'
                            : 'استماع إلى الآية'
                        }
                        className="rounded-xl p-3 text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                      >
                        {playingAyah === ayah.numberInSurah
                          ? <Pause size={21} />
                          : <Play size={21} />}
                      </button>
                    </div>

                    <p className="text-right text-2xl leading-[2.4] sm:text-3xl">
                     {ayah.text
  .split(/\s+/)
  .filter(Boolean)
  .map((word, localIndex) => {
                          const index = wordIndex++
                          const state = wordStates[index]

                          return (
                            <span
                              key={`${ayah.numberInSurah}-${localIndex}`}
                              className={`mx-1 inline rounded-lg px-1 ${
                                state === 'match'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : state === 'review'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'text-slate-800'
                              }`}
                            >
                              {word}{' '}
                            </span>
                          )
                        })}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-1 shrink-0 text-amber-600" />
                <p className="text-sm leading-7 text-slate-600">
                  المتابعة الصوتية تقريبية؛ قد تتأثر باللهجة والنطق
                  وجودة الميكروفون. اللون البرتقالي لا يعني بالضرورة
                  وجود خطأ في التلاوة. لا تُستخدم هذه الألوان للحكم
                  على التجويد أو صحة النطق.
                </p>
              </div>

              <button
  type="button"
  onClick={onToggleCompleted}
  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
>
  <CheckCircle2 size={19} />
  {isCompleted
    ? 'إلغاء إتمام السورة'
    : 'أنهيت القراءة'}
</button>
            </section>

            <p className="mt-6 text-center text-xs leading-6 text-slate-500">
              النص والتلاوة الصوتية: Al Quran Cloud API.
              {' '}
              <a
                href="https://alquran.cloud/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                المصدر
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
