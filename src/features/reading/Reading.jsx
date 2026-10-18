import { useEffect, useMemo, useRef, useState } from 'react'
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
const BISMILLAH = ['بسم', 'الله', 'الرحمن', 'الرحيم']
const LOOKAHEAD = 3 // how many words ahead a spoken word may match
const SIMILARITY = 0.72 // tolerance for speech-engine spelling differences

const normalizeArabic = (text = '') =>
  text
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .trim()

function similarity(a, b) {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length)
}

// Moves forward through the expected words, never backwards.
// Extra, repeated or unrecognised spoken words are simply ignored.
function align(spoken, expected, start, states, markReview) {
  const next = { ...states }
  let pointer = start

  for (const word of spoken) {
    let found = -1
    for (let k = 0; k <= LOOKAHEAD && pointer + k < expected.length; k++) {
      if (similarity(word, expected[pointer + k]) >= SIMILARITY) {
        found = k
        break
      }
    }
    if (found === -1) continue

    if (markReview) {
      for (let k = 0; k < found; k++) next[pointer + k] = 'review'
    }
    next[pointer + found] = 'match'
    pointer += found + 1
  }

  return { pointer, states: next }
}

// One source of truth for display AND matching, so indexes can never drift apart
function buildText(surahId, ayahs) {
  const list = ayahs.map((ayah) => {
    const tokens = []
    ayah.text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((raw) => {
        const norm = normalizeArabic(raw)
        if (norm) tokens.push({ text: raw, norm })
        else if (tokens.length) tokens[tokens.length - 1].text += ` ${raw}`
      })
    return { number: ayah.numberInSurah, audio: ayah.audio, tokens, offset: 0 }
  })

  // This API edition prepends the bismillah to the first ayah of most surahs
  let bismillah = ''
  const first = list[0]
  if (surahId !== 1 && first && BISMILLAH.every((w, i) => first.tokens[i]?.norm === w)) {
    bismillah = first.tokens.slice(0, 4).map((t) => t.text).join(' ')
    first.tokens = first.tokens.slice(4)
  }

  let offset = 0
  list.forEach((ayah) => {
    ayah.offset = offset
    offset += ayah.tokens.length
  })

  return {
    ayahs: list,
    bismillah,
    expected: list.flatMap((a) => a.tokens.map((t) => t.norm)),
  }
}

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
    () => document.documentElement.dataset.a11ySimple === 'on',
  )

  const recognitionRef = useRef(null)
  const wantListeningRef = useRef(false)
  const progressRef = useRef({ pointer: 0, states: {} })
  const audioRef = useRef(null)

  const built = useMemo(
    () => (surah ? buildText(surahId, surah.ayahs) : null),
    [surah, surahId],
  )
  const builtRef = useRef(null)
  builtRef.current = built

  useEffect(() => {
    const sync = () =>
      setSimpleMode(document.documentElement.dataset.a11ySimple === 'on')
    window.addEventListener('a11y-settings-changed', sync)
    return () => window.removeEventListener('a11y-settings-changed', sync)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSurah() {
      setLoading(true)
      setError('')
      setSurah(null)
      setWordStates({})
      setTranscript('')
      setCurrentAyahIndex(0)
      progressRef.current = { pointer: 0, states: {} }

      try {
        const response = await fetch(`${API_URL}/surah/${surahId}/ar.alafasy`)
        if (!response.ok) throw new Error('load failed')

        const result = await response.json()
        if (result.code !== 200 || !result.data?.ayahs) {
          throw new Error('bad data')
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
      wantListeningRef.current = false
      recognitionRef.current?.stop()
      audioRef.current?.pause()
    }
  }, [])

  function stopListening() {
    wantListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }

  function handleResult(event) {
    const expected = builtRef.current?.expected
    if (!expected) return

    let { pointer, states } = progressRef.current
    let shown = states
    let heard = ''

    // Only final results move the saved position. Interim results are shown
    // as tentative matches and recomputed from the saved position each time.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      heard = result[0].transcript
      const words = normalizeArabic(heard).split(/\s+/).filter(Boolean)
      const out = align(words, expected, pointer, states, result.isFinal)
      shown = out.states

      if (result.isFinal) {
        pointer = out.pointer
        states = out.states
        progressRef.current = { pointer, states }
      }
    }

    setTranscript(heard.trim())
    setWordStates(shown)
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('المتصفح لا يدعم التعرف على الصوت. جرّب متصفحاً يدعم هذه الخاصية.')
      return
    }

    recognitionRef.current?.stop()
    wantListeningRef.current = true

    const recognition = new SpeechRecognition()
    recognition.lang = 'ar-SA'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setListening(true)
      setError('')
    }
    recognition.onresult = handleResult
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      wantListeningRef.current = false
      setError('لم نتمكن من التعرف على الصوت. تحقق من إذن الميكروفون وحاول مجدداً.')
      setListening(false)
    }
    // Browsers end continuous recognition after a pause: restart it
    recognition.onend = () => {
      if (wantListeningRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start()
          return
        } catch {
          // fall through
        }
      }
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function startOfCurrentView(index = currentAyahIndex) {
    return simpleMode ? built?.ayahs[index]?.offset ?? 0 : 0
  }

  function goToAyah(index) {
    setCurrentAyahIndex(index)
    // Reading a new ayah: expect its first word next
    progressRef.current = {
      ...progressRef.current,
      pointer: built?.ayahs[index]?.offset ?? 0,
    }
  }

  function playAyah(ayah) {
    if (!ayah.audio) {
      setError('الصوت غير متاح لهذه الآية حالياً.')
      return
    }

    if (playingAyah === ayah.number) {
      audioRef.current?.pause()
      setPlayingAyah(null)
      return
    }

    if (!audioRef.current) audioRef.current = new Audio()

    audioRef.current.pause()
    audioRef.current.src = ayah.audio
    audioRef.current.onended = () => setPlayingAyah(null)
    audioRef.current.onerror = () => {
      setPlayingAyah(null)
      setError('تعذر تشغيل الصوت. حاول مجدداً.')
    }

    audioRef.current
      .play()
      .then(() => setPlayingAyah(ayah.number))
      .catch(() => setError('تعذر تشغيل الصوت حالياً.'))
  }

  function resetPractice() {
    stopListening()
    audioRef.current?.pause()
    setPlayingAyah(null)
    setTranscript('')
    setWordStates({})
    setError('')
    progressRef.current = { pointer: startOfCurrentView(), states: {} }
  }

  const totalWords = built?.expected.length ?? 0
  const matchedCount = Object.values(wordStates).filter((s) => s === 'match').length
  const progress = totalWords ? Math.round((matchedCount / totalWords) * 100) : 0

  const visibleAyahs = built
    ? simpleMode
      ? [built.ayahs[currentAyahIndex]].filter(Boolean)
      : built.ayahs
    : []

  return (
    <main
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-[#f7f8f3] px-4 py-8 text-slate-800 sm:px-8"
    >
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
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

          {surah && <p className="mt-2 text-slate-500">{surah.numberOfAyahs} آيات</p>}

          <p className="mt-4 leading-8 text-slate-600">
            اقرأ بهدوء، واستمع إلى التلاوة، واستخدم الميكروفون لتجربة المتابعة الصوتية.
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
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-white"
          >
            إعادة المحاولة
          </button>
        )}

        {built && (
          <>
            <section
              aria-label="أدوات القراءة"
              className="mb-6 rounded-2xl bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  className={`inline-flex min-h-14 items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    listening
                      ? 'bg-rose-600 focus-visible:outline-rose-700'
                      : 'bg-emerald-700 focus-visible:outline-emerald-700'
                  }`}
                >
                  {listening ? <MicOff size={19} /> : <Mic size={19} />}
                  {listening ? 'إيقاف الميكروفون' : 'ابدأ القراءة الصوتية'}
                </button>

                <button
                  type="button"
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

              {listening && (
                <p className="mt-2 min-h-6 text-sm text-slate-400">
                  {transcript ? `أسمع: ${transcript}` : 'في انتظار صوتك…'}
                </p>
              )}

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
                  aria-label="نسبة الكلمات المتطابقة تقريباً"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all motion-reduce:transition-none"
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
                    الآية {currentAyahIndex + 1} من {built.ayahs.length}
                  </p>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={currentAyahIndex === 0}
                      onClick={() => goToAyah(currentAyahIndex - 1)}
                      className="min-h-14 rounded-xl bg-white px-5 text-lg font-bold text-emerald-900 shadow-sm disabled:opacity-40"
                    >
                      الآية السابقة
                    </button>

                    <button
                      type="button"
                      disabled={currentAyahIndex >= built.ayahs.length - 1}
                      onClick={() => goToAyah(currentAyahIndex + 1)}
                      className="min-h-14 rounded-xl bg-emerald-700 px-5 text-lg font-bold text-white disabled:opacity-40"
                    >
                      الآية التالية
                    </button>
                  </div>
                </div>
              )}

              <h2 className="mb-6 text-xl font-bold text-emerald-950">آيات السورة</h2>

              {built.bismillah && (!simpleMode || currentAyahIndex === 0) && (
                <p className="mb-6 text-center text-2xl leading-[2.2] text-emerald-900 sm:text-3xl">
                  {built.bismillah}
                </p>
              )}

              <div className="space-y-6">
                {visibleAyahs.map((ayah) => (
                  <article
                    key={ayah.number}
                    className="rounded-2xl border border-slate-100 p-4 sm:p-6"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                        الآية {ayah.number}
                      </span>

                      <button
                        type="button"
                        onClick={() => playAyah(ayah)}
                        aria-label={
                          playingAyah === ayah.number ? 'إيقاف التلاوة' : 'استماع إلى الآية'
                        }
                        className="rounded-xl p-3 text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                      >
                        {playingAyah === ayah.number ? <Pause size={21} /> : <Play size={21} />}
                      </button>
                    </div>

                    <p className="text-right text-2xl leading-[2.4] sm:text-3xl">
                      {ayah.tokens.map((token, i) => {
                        const state = wordStates[ayah.offset + i]
                        return (
                          <span
                            key={`${ayah.number}-${i}`}
                            className={`mx-1 inline rounded-lg px-1 ${
                              state === 'match'
                                ? 'bg-emerald-100 text-emerald-800'
                                : state === 'review'
                                  ? 'bg-amber-100 text-amber-900 underline decoration-dotted decoration-amber-600 underline-offset-8'
                                  : 'text-slate-800'
                            }`}
                          >
                            {token.text}{' '}
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
                  المتابعة الصوتية تقريبية؛ قد تتأثر باللهجة والنطق وجودة الميكروفون.
                  اللون البرتقالي لا يعني بالضرورة وجود خطأ في التلاوة. لا تُستخدم هذه
                  الألوان للحكم على التجويد أو صحة النطق.
                </p>
              </div>

              <button
                type="button"
                onClick={onToggleCompleted}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <CheckCircle2 size={19} />
                {isCompleted ? 'إلغاء إتمام السورة' : 'أنهيت القراءة'}
              </button>
            </section>

            <p className="mt-6 text-center text-xs leading-6 text-slate-500">
              النص والتلاوة الصوتية: Al Quran Cloud API.{' '}
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