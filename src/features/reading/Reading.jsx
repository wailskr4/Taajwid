
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
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
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function getWords(text = '') {
  return normalizeArabic(text).split(/\s+/).filter(Boolean)
}

// Aligner les mots reconnus avec le texte attendu.
// Les mots sautés ne décalent pas automatiquement toute la suite.
function alignWords(expectedWords, spokenText) {
  const spokenWords = getWords(spokenText)
  const matches = {}
  let cursor = 0

  for (const spokenWord of spokenWords) {
    const limit = Math.min(cursor + 5, expectedWords.length)
    let foundIndex = -1

    for (let i = cursor; i < limit; i++) {
      if (spokenWord === expectedWords[i]) {
        foundIndex = i
        break
      }
    }

    if (foundIndex !== -1) {
      matches[foundIndex] = 'match'
      cursor = foundIndex + 1
    }
  }

  return matches
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
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0)
  const [simpleMode, setSimpleMode] = useState(
    () => document.documentElement.dataset.a11ySimple === 'on',
  )
  const [playingAyah, setPlayingAyah] = useState(null)

  const recognitionRef = useRef(null)
  const audioRef = useRef(null)
  const transcriptRef = useRef('')
  const surahRef = useRef(null)

  const ayahs = surah?.ayahs ?? []

  const expectedWords = useMemo(
    () => ayahs.flatMap((ayah) => getWords(ayah.text)),
    [ayahs],
  )

  const wordOffsets = useMemo(() => {
    let offset = 0

    return ayahs.map((ayah) => {
      const currentOffset = offset
      offset += getWords(ayah.text).length
      return currentOffset
    })
  }, [ayahs])

  const matchedCount = Object.values(wordStates).filter(
    (state) => state === 'match',
  ).length

  const progress = expectedWords.length
    ? Math.min(
        100,
        Math.round((matchedCount / expectedWords.length) * 100),
      )
    : 0

  // Charger le texte arabe et les fichiers audio de la sourate.
  useEffect(() => {
    let cancelled = false

    async function loadSurah() {
      setLoading(true)
      setError('')
      setSurah(null)
      setWordStates({})
      setTranscript('')
      transcriptRef.current = ''
      setCurrentAyahIndex(0)

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

        if (!cancelled) {
          setSurah(result.data)
          surahRef.current = result.data
        }
      } catch {
        if (!cancelled) {
          setError(
            'تعذر تحميل السورة. تحقق من اتصال الإنترنت ثم حاول مجدداً.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    recognitionRef.current?.stop()
    audioRef.current?.pause()
    recognitionRef.current = null
    audioRef.current = null

    setListening(false)
    setPlayingAyah(null)

    loadSurah()

    return () => {
      cancelled = true
    }
  }, [surahId])

  // Synchroniser les préférences d'accessibilité.
  useEffect(() => {
    function syncAccessibility() {
      setSimpleMode(
        document.documentElement.dataset.a11ySimple === 'on',
      )
    }

    window.addEventListener(
      'a11y-settings-changed',
      syncAccessibility,
    )

    return () => {
      window.removeEventListener(
        'a11y-settings-changed',
        syncAccessibility,
      )
    }
  }, [])

  // Nettoyage du microphone et du lecteur audio.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  function stopListening() {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    setListening(false)

    if (recognition) {
      recognition.stop()
    }
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
    recognition.maxAlternatives = 3

    // Les résultats intermédiaires ne changent ni les couleurs
    // ni la progression.
    recognition.onresult = (event) => {
      const finalParts = []

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]

        if (result.isFinal && result[0]?.transcript) {
          finalParts.push(result[0].transcript)
        }
      }

      const finalText = finalParts.join(' ').trim()

      transcriptRef.current = finalText
      setTranscript(finalText)

      const currentSurah = surahRef.current

      if (!currentSurah || !finalText) {
        setWordStates({})
        return
      }

      const words = currentSurah.ayahs.flatMap((ayah) =>
        getWords(ayah.text),
      )

      const nextStates = alignWords(words, finalText)

      setWordStates(nextStates)
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(
          event.error === 'not-allowed'
            ? 'يرجى السماح باستخدام الميكروفون من إعدادات المتصفح.'
            : 'تعذر التعرف على الصوت. حاول مجدداً.',
        )
      }

      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }

    try {
      setError('')
      recognitionRef.current = recognition
      recognition.start()
    } catch {
      recognitionRef.current = null
      setListening(false)
      setError('تعذر تشغيل الميكروفون. حاول مجدداً.')
    }
  }

  function toggleListening() {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }

  function playAyah(ayah) {
    if (!ayah?.audio) {
      setError('الصوت غير متاح لهذه الآية حالياً.')
      return
    }

    if (
      playingAyah === ayah.numberInSurah &&
      audioRef.current
    ) {
      audioRef.current.pause()
      setPlayingAyah(null)
      return
    }

    if (!audioRef.current) {
      audioRef.current = new Audio()
    }

    const audio = audioRef.current

    audio.pause()
    audio.src = ayah.audio
    audio.onended = () => setPlayingAyah(null)
    audio.onerror = () => {
      setPlayingAyah(null)
      setError('تعذر تشغيل الصوت. حاول مجدداً.')
    }

    setError('')

    audio.play()
      .then(() => setPlayingAyah(ayah.numberInSurah))
      .catch(() => {
        setPlayingAyah(null)
        setError('تعذر تشغيل الصوت. تحقق من اتصال الإنترنت.')
      })
  }

  function resetPractice() {
    stopListening()

    audioRef.current?.pause()
    setPlayingAyah(null)

    transcriptRef.current = ''
    setTranscript('')
    setWordStates({})
    setError('')
  }

  function navigateAyah(direction) {
    setCurrentAyahIndex((previous) =>
      Math.max(
        0,
        Math.min(ayahs.length - 1, previous + direction),
      ),
    )
  }

  const displayedAyahs = simpleMode
    ? [ayahs[currentAyahIndex]].filter(Boolean)
    : ayahs

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
          className="mb-6 inline-flex min-h-12 items-center gap-2 rounded-xl px-4 py-3 font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
        >
          <ArrowRight size={22} />
          العودة إلى السور
        </button>

        <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 font-medium text-emerald-700">
            رحلة التعلم
          </p>

          <h1 className="text-3xl font-bold leading-relaxed text-emerald-950 sm:text-4xl">
            {surah?.name || surahName}
          </h1>

          {surah && (
            <p className="mt-2 text-slate-500">
              {surah.numberOfAyahs} آيات
            </p>
          )}

          <p className="mt-4 leading-8 text-slate-600">
            استمع إلى التلاوة، واقرأ حسب وتيرتك، وتابع تقدمك.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 leading-7 text-amber-950"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-white p-10">
            <LoaderCircle
              size={24}
              className="animate-spin text-emerald-700 motion-reduce:animate-none"
            />
            <span>جارٍ تحميل السورة...</span>
          </div>
        )}

        {!loading && !surah && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white"
          >
            إعادة المحاولة
          </button>
        )}

        {surah && (
          <>
            <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={toggleListening}
                  aria-pressed={listening}
                  className={`inline-flex min-h-14 items-center gap-3 rounded-xl px-5 py-3 text-lg font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                    listening ? 'bg-rose-600' : 'bg-emerald-700'
                  }`}
                >
                  {listening ? (
                    <MicOff size={22} />
                  ) : (
                    <Mic size={22} />
                  )}
                  {listening
                    ? 'إيقاف الميكروفون'
                    : 'ابدأ القراءة الصوتية'}
                </button>

                <button
                  type="button"
                  onClick={resetPractice}
                  className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                >
                  <RotateCcw size={20} />
                  إعادة المحاولة
                </button>
              </div>

              <p
                role="status"
                aria-live="polite"
                className="mt-4 leading-7 text-slate-600"
              >
                {listening
                  ? 'الميكروفون يعمل. ستتغير الألوان بعد تثبيت نتيجة التعرف على الصوت.'
                  : 'يمكنك الاستماع إلى الآيات أو بدء المتابعة الصوتية.'}
              </p>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-800">
                    الكلمات المتطابقة تقريبياً
                  </span>
                  <span className="font-bold tabular-nums text-emerald-800">
                    {progress}٪
                  </span>
                </div>

                <div
                  className="h-3 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label="نسبة الكلمات المتطابقة تقريبياً"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 motion-reduce:transition-none"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <p className="mt-2 text-sm text-slate-500">
                  {matchedCount} من {expectedWords.length} كلمة
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-2 text-emerald-800">
                  <span className="size-3 rounded-full bg-emerald-500" />
                  تطابق محتمل
                </span>

                <span className="flex items-center gap-2 text-slate-600">
                  <span className="size-3 rounded-full bg-slate-300" />
                  لم يتم التحقق
                </span>
              </div>
            </section>

            {simpleMode && (
              <section
                aria-label="التنقل بين الآيات"
                className="mb-6 rounded-2xl bg-emerald-50 p-5"
              >
                <p className="mb-4 text-center text-lg font-bold text-emerald-950">
                  الآية {currentAyahIndex + 1} من {ayahs.length}
                </p>

                <div className="flex flex-wrap justify-between gap-3">
                  <button
                    type="button"
                    disabled={currentAyahIndex === 0}
                    onClick={() => navigateAyah(-1)}
                    className="min-h-14 rounded-xl bg-white px-5 text-lg font-bold text-emerald-900 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-700"
                  >
                    الآية السابقة
                  </button>

                  <button
                    type="button"
                    disabled={currentAyahIndex >= ayahs.length - 1}
                    onClick={() => navigateAyah(1)}
                    className="min-h-14 rounded-xl bg-emerald-700 px-5 text-lg font-bold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-700"
                  >
                    الآية التالية
                  </button>
                </div>
              </section>
            )}

            <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-8">
              <h2 className="mb-6 text-xl font-bold text-emerald-950">
                آيات السورة
              </h2>

              <div className="space-y-6">
                {displayedAyahs.map((ayah) => {
                  const ayahIndex = ayah.numberInSurah - 1
                  let wordIndex = wordOffsets[ayahIndex] ?? 0

                  return (
                    <article
                      key={ayah.numberInSurah}
                      className="rounded-2xl border border-slate-200 p-4 sm:p-6"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                          الآية {ayah.numberInSurah}
                        </span>

                        <button
                          type="button"
                          onClick={() => playAyah(ayah)}
                          aria-label={
                            playingAyah === ayah.numberInSurah
                              ? 'إيقاف التلاوة'
                              : 'استماع إلى الآية'
                          }
                          className="flex size-12 items-center justify-center rounded-xl text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                        >
                          {playingAyah === ayah.numberInSurah ? (
                            <Pause size={24} />
                          ) : (
                            <Play size={24} />
                          )}
                        </button>
                      </div>

                      <p className="text-right text-2xl leading-[2.5] sm:text-3xl">
                        {ayah.text.split(/\s+/).map((word, localIndex) => {
                          const index = wordIndex++
                          const state = wordStates[index]

                          return (
                            <span
                              key={`${ayah.numberInSurah}-${localIndex}`}
                              className={`mx-1 inline rounded-lg px-1 ${
                                state === 'match'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'text-slate-800'
                              }`}
                            >
                              {word}{' '}
                            </span>
                          )
                        })}
                      </p>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <CircleHelp
                  size={22}
                  className="mt-1 shrink-0 text-amber-600"
                />

                <p className="leading-7 text-slate-600">
                  التعرف على الصوت تقريبي وقد يخطئ في بعض الكلمات.
                  اللون الأخضر يشير إلى تطابق محتمل فقط، ولا يؤكد صحة
                  النطق أو أحكام التجويد.
                </p>
              </div>

              <button
                type="button"
                onClick={onToggleCompleted}
                className="mt-5 inline-flex min-h-14 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-lg font-bold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <CheckCircle2 size={21} />
                {isCompleted
                  ? 'إلغاء إتمام السورة'
                  : 'أنهيت القراءة'}
              </button>
            </section>

            {transcript && (
              <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <summary className="cursor-pointer font-semibold text-slate-800">
                  عرض النص الذي تعرّف عليه المتصفح
                </summary>
                <p className="mt-3 leading-8 text-slate-600">
                  {transcript}
                </p>
              </details>
            )}

            <p className="mt-6 text-center text-xs leading-6 text-slate-500">
              النص والتلاوة الصوتية عبر Al Quran Cloud API.
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
