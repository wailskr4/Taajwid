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
  SpellCheck,
} from 'lucide-react'

const API_URL = 'https://api.alquran.cloud/v1'
const FALLBACK_API_URL = 'https://api.quran.com/api/v4' // fallback si 503
const BISMILLAH = ['بسم', 'الله', 'الرحمن', 'الرحيم']

const VERSES_PER_PAGE = 12 // chaque page contient 12 versets (sourah < 12 = 1 page)
const LOOKAHEAD = 3 // how many words ahead a spoken word may match
const RESYNC = 12 // wider search used after several unmatched words in a row
const MAX_ALTERNATIVES = 3 // speech-engine alternatives evaluated per result

const DIALECTS = [
  { code: 'ar-SA', label: 'العربية (السعودية)' },
  { code: 'ar-EG', label: 'العربية (مصر)' },
  { code: 'ar-DZ', label: 'العربية (الجزائر)' },
  { code: 'ar-MA', label: 'العربية (المغرب)' },
]

/* ------------------------------------------------------------------ */
/* Arabic normalisation                                                */
/* ------------------------------------------------------------------ */

// dagger = 'drop'  → هٰذا becomes هذا  (how most speech engines write it)
// dagger = 'alif'  → هٰذا becomes هاذا (how the Uthmani text sounds)
// Both forms are kept per word and the best score wins.
const normalizeArabic = (text = '', dagger = 'drop') =>
  text
    .normalize('NFC')
    .replace(/\u0670/g, dagger === 'alif' ? 'ا' : '')
    .replace(/[\u064B-\u065F\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ی/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/* ------------------------------------------------------------------ */
/* Phonetic-aware similarity                                           */
/* ------------------------------------------------------------------ */

// Letters speech engines often swap: a substitution inside a group is cheap
const CONFUSABLE = [
  ['ث', 'س', 'ص'],
  ['ذ', 'ز', 'ظ', 'ض'],
  ['ت', 'ط'],
  ['ك', 'ق'],
  ['ح', 'ه'],
  ['ع', 'ء', 'ا'],
]
const GROUP_OF = {}
CONFUSABLE.forEach((group, i) => group.forEach((c) => (GROUP_OF[c] = i)))

// Weak letters are often dropped or added by the recogniser
const WEAK = new Set(['ا', 'و', 'ي', 'ء'])

const subCost = (x, y) =>
  x === y ? 0 : GROUP_OF[x] !== undefined && GROUP_OF[x] === GROUP_OF[y] ? 0.4 : 1
const gapCost = (c) => (WEAK.has(c) ? 0.6 : 1)

function similarity(a, b) {
  if (a === b) return 1
  if (!a.length || !b.length) return 0

  let prev = [0]
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + gapCost(b[j - 1])

  for (let i = 1; i <= a.length; i++) {
    const cur = [prev[0] + gapCost(a[i - 1])]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + gapCost(a[i - 1]),
        cur[j - 1] + gapCost(b[j - 1]),
        prev[j - 1] + subCost(a[i - 1], b[j - 1]),
      )
    }
    prev = cur
  }
  return Math.max(0, 1 - prev[b.length] / Math.max(a.length, b.length))
}

// Short words must match almost exactly, long words get more tolerance
const needed = (len) => (len <= 2 ? 1 : len === 3 ? 0.8 : len === 4 ? 0.74 : 0.68)

const wordScore = (word, token) =>
  Math.max(similarity(word, token.norm), similarity(word, token.alt))

/* ------------------------------------------------------------------ */
/* Alignment                                                           */
/* ------------------------------------------------------------------ */

// Best match for spoken[i] starting at `pointer`. Handles:
//  - a skipped word (up to `look` words ahead)
//  - two spoken words that are one expected word  (merged)
//  - one spoken word that is two expected words   (joined)
function findMatch(spoken, i, tokens, pointer, limit, look, bump = 0) {
  let best = null
  const consider = (cand) => {
    if (!best || cand.score > best.score) best = cand
  }

  for (let k = 0; k <= look && pointer + k < limit; k++) {
    const token = tokens[pointer + k]
    const need = needed(token.norm.length) + bump
    const penalty = k * 0.02

    const single = wordScore(spoken[i], token)
    if (single >= need) consider({ skip: k, used: 1, span: 1, score: single - penalty })

    if (i + 1 < spoken.length) {
      const merged = wordScore(spoken[i] + spoken[i + 1], token)
      if (merged >= need + 0.08) {
        consider({ skip: k, used: 2, span: 1, score: merged - penalty - 0.02 })
      }
    }

    if (pointer + k + 1 < limit) {
      const next = tokens[pointer + k + 1]
      const joined = { norm: token.norm + next.norm, alt: token.alt + next.alt }
      const score = wordScore(spoken[i], joined)
      if (score >= needed(joined.norm.length) + 0.08 + bump) {
        consider({ skip: k, used: 1, span: 2, score: score - penalty - 0.02 })
      }
    }
  }
  return best
}

// Moves forward through the expected words, never backwards, and never past
// `limit` (the end of the current page).
// `final` = the engine is sure about these words: skipped words are flagged
// for review and near-misses are recorded as "heard differently".
function align(spoken, tokens, start, limit, progress, final) {
  const states = { ...progress.states }
  const heard = { ...progress.heard }
  let pointer = start
  let misses = progress.misses
  let gain = 0
  let i = 0

  while (i < spoken.length && pointer < limit) {
    let cand = findMatch(spoken, i, tokens, pointer, limit, LOOKAHEAD)
    if (!cand && misses >= 2) {
      cand = findMatch(spoken, i, tokens, pointer, limit, RESYNC, 0.1)
    }

    if (cand) {
      if (final) {
        for (let k = 0; k < cand.skip; k++) states[pointer + k] = 'review'
      }
      for (let s = 0; s < cand.span; s++) {
        states[pointer + cand.skip + s] = 'match'
        delete heard[pointer + cand.skip + s]
      }
      gain += cand.span
      pointer += cand.skip + cand.span
      i += cand.used
      misses = 0
      continue
    }

    // Near miss: the word sounds close to the expected one AND the next spoken
    // word continues correctly, so the reader most likely mispronounced it.
    if (
      final &&
      tokens[pointer].norm.length >= 3 &&
      i + 1 < spoken.length &&
      similarity(spoken[i], tokens[pointer].norm) >= 0.5 &&
      findMatch(spoken, i + 1, tokens, pointer + 1, limit, LOOKAHEAD)
    ) {
      states[pointer] = 'review'
      heard[pointer] = spoken[i]
      pointer += 1
      i += 1
      continue
    }

    misses += 1
    i += 1
  }

  return { pointer, states, heard, misses, gain }
}

// Some browsers (Android Chrome) resend earlier words at the start of each
// new result. Drop that repeated prefix.
function stripRepeated(words, last) {
  if (last.length >= 2 && words.length >= last.length && last.every((w, i) => words[i] === w)) {
    return words.slice(last.length)
  }
  return words
}

/* ------------------------------------------------------------------ */
/* Text + pages                                                        */
/* ------------------------------------------------------------------ */

// One source of truth for display AND matching, so indexes can never drift apart.
// Chaque page contient VERSES_PER_PAGE versets (12 par défaut).
// Une sourah avec 10 versets = 1 seule page ; à chaque 12 versets, une nouvelle page est créée.
function buildText(surahId, ayahs) {
  const list = ayahs.map((ayah) => {
    const tokens = []
    ayah.text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((raw) => {
        const norm = normalizeArabic(raw)
        if (norm) tokens.push({ text: raw, norm, alt: normalizeArabic(raw, 'alif') })
        else if (tokens.length) tokens[tokens.length - 1].text += ` ${raw}`
      })
    return { number: ayah.numberInSurah, audio: ayah.audio, tokens }
  })

  // This API edition prepends the bismillah to the first ayah of most surahs
  let bismillah = ''
  const first = list[0]
  if (surahId !== 1 && first && BISMILLAH.every((w, i) => first.tokens[i]?.norm === w)) {
    bismillah = first.tokens.slice(0, 4).map((t) => t.text).join(' ')
    first.tokens = first.tokens.slice(4)
  }

  // Grouper les versets par pages de VERSES_PER_PAGE (12 versets)
  const pages = []
  let offset = 0
  const totalPages = Math.ceil(list.length / VERSES_PER_PAGE)

  for (let p = 0; p < totalPages; p++) {
    const startAyah = p * VERSES_PER_PAGE
    const endAyah = Math.min(startAyah + VERSES_PER_PAGE, list.length)
    const pageAyahs = list.slice(startAyah, endAyah)
    const tokens = pageAyahs.flatMap((a) => a.tokens)
    const firstAyah = pageAyahs[0]
    const lastAyah = pageAyahs[pageAyahs.length - 1]

    pages.push({
      key: `${firstAyah.number}-${p}`,
      ayahNumber: firstAyah.number,
      lastAyahNumber: lastAyah.number,
      part: p + 1,
      parts: totalPages,
      audio: firstAyah.audio,
      tokens,
      start: offset,
      end: offset + tokens.length,
    })
    offset += tokens.length
  }

  return { pages, bismillah, tokens: pages.flatMap((page) => page.tokens) }
}

const emptyProgress = () => ({ pointer: 0, states: {}, heard: {}, misses: 0 })

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

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
  const [wordHeard, setWordHeard] = useState({})
  const [pointer, setPointer] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [playingAyah, setPlayingAyah] = useState(null)
  const [lang, setLang] = useState('ar-SA')
  const [simpleMode, setSimpleMode] = useState(
    () => document.documentElement.dataset.a11ySimple === 'on',
  )

  const recognitionRef = useRef(null)
  const wantListeningRef = useRef(false)
  const progressRef = useRef(emptyProgress())
  const lastFinalRef = useRef([])
  const audioRef = useRef(null)

  const built = useMemo(
    () => (surah ? buildText(surahId, surah.ayahs) : null),
    [surah, surahId],
  )
  const page = built?.pages[pageIndex] ?? null

  // Refs so the speech callback always sees the latest text and page
  const builtRef = useRef(null)
  const pageRef = useRef(null)
  builtRef.current = built
  pageRef.current = page

  useEffect(() => {
    const sync = () =>
      setSimpleMode(document.documentElement.dataset.a11ySimple === 'on')
    window.addEventListener('a11y-settings-changed', sync)
    return () => window.removeEventListener('a11y-settings-changed', sync)
  }, [])

  useEffect(() => {
    let cancelled = false

    // Fallback : essayer l'API principale puis l'API de secours en cas d'erreur 503
    async function fetchWithFallback(urls) {
      let lastError = null
      for (const { url, parser } of urls) {
        try {
          const response = await fetch(url)
          if (!response.ok) {
            lastError = new Error(`HTTP ${response.status}`)
            continue // essayer la source suivante
          }
          const data = await response.json()
          const parsed = parser(data)
          if (parsed) return parsed
          lastError = new Error('bad data')
        } catch (err) {
          lastError = err
        }
      }
      throw lastError || new Error('all sources failed')
    }

    // Parser pour l'API principale (alquran.cloud)
    function parseAlQuranCloud(data) {
      if (data.code !== 200 || !data.data?.ayahs) return null
      return {
        name: data.data.name,
        numberOfAyahs: data.data.numberOfAyahs,
        ayahs: data.data.ayahs.map((ayah) => ({
          numberInSurah: ayah.numberInSurah,
          text: ayah.text,
          audio: ayah.audio,
        })),
      }
    }

    // Parser pour l'API de fallback (quran.com v4)
    function parseQuranCom(data) {
      if (!data.verses?.length) return null
      return {
        name: data.verses[0]?.text_uthmani ? '' : '', // le nom sera affiché via surahName prop
        numberOfAyahs: data.verses.length,
        ayahs: data.verses.map((verse) => ({
          numberInSurah: verse.verse_number || verse.verse_key?.split(':')[1],
          text: verse.text_uthmani || verse.text_imlaei || verse.text_madani || '',
          audio: verse.audio?.url ? `https://verses.quran.com/${verse.audio.url}` : null,
        })),
      }
    }

    async function loadSurah() {
      setLoading(true)
      setError('')
      setSurah(null)
      setTranscript('')
      setPageIndex(0)
      commit(emptyProgress())
      lastFinalRef.current = []

      try {
        const sources = [
          {
            url: `${API_URL}/surah/${surahId}/ar.alafasy`,
            parser: parseAlQuranCloud,
          },
          {
            url: `${FALLBACK_API_URL}/verses/by_chapter/${surahId}?language=ar&words=false&translations=false&audio=1&text_uthmani=true`,
            parser: parseQuranCom,
          },
        ]

        const surahData = await fetchWithFallback(sources)
        if (!cancelled) setSurah(surahData)
      } catch {
        if (!cancelled) {
          setError('تعذر تحميل السورة من جميع المصادر. تحقق من اتصال الإنترنت ثم حاول مجدداً.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSurah()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahId])

  useEffect(() => {
    return () => {
      wantListeningRef.current = false
      recognitionRef.current?.stop()
      audioRef.current?.pause()
    }
  }, [])

  // Keeps the ref (used by the speech callback) and the React state in sync
  function commit(next) {
    progressRef.current = next
    setWordStates(next.states)
    setWordHeard(next.heard)
    setPointer(next.pointer)
  }

  function stopListening() {
    wantListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }

  function handleResult(event) {
    const tokens = builtRef.current?.tokens
    const current = pageRef.current
    if (!tokens || !current) return

    let progress = progressRef.current
    let shown = progress
    let heardText = ''

    // Only final results move the saved position. Interim results are shown
    // as tentative matches and recomputed from the saved position each time.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      let best = null

      // Try every alternative the engine offers and keep the one that
      // follows the text the furthest
      const count = Math.min(result.length, MAX_ALTERNATIVES)
      for (let a = 0; a < count; a++) {
        const text = result[a].transcript
        const all = normalizeArabic(text).split(' ').filter(Boolean)
        const words = stripRepeated(all, lastFinalRef.current)
        const out = align(words, tokens, progress.pointer, current.end, progress, result.isFinal)
        if (!best || out.gain > best.out.gain) best = { out, text, all }
      }
      if (!best) continue

      heardText = best.text
      shown = best.out
      if (result.isFinal) {
        progress = best.out
        lastFinalRef.current = best.all
      }
    }

    setTranscript(heardText.trim())
    setWordStates(shown.states)
    setWordHeard(shown.heard)
    if (progress !== progressRef.current) commit(progress)
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
    lastFinalRef.current = []

    const recognition = new SpeechRecognition()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = MAX_ALTERNATIVES

    recognition.onstart = () => {
      setListening(true)
      setError('')
    }
    recognition.onresult = handleResult
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      wantListeningRef.current = false
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('الميكروفون غير مسموح به. فعّل الإذن من إعدادات المتصفح ثم حاول مجدداً.')
      } else if (event.error === 'audio-capture') {
        setError('لم يتم العثور على ميكروفون. تحقق من الجهاز ثم حاول مجدداً.')
      } else if (event.error === 'network') {
        setError('التعرف على الصوت يحتاج إلى اتصال بالإنترنت.')
      } else {
        setError('لم نتمكن من التعرف على الصوت. حاول مجدداً.')
      }
    }
    // Browsers end continuous recognition after a pause: restart it
    recognition.onend = () => {
      if (wantListeningRef.current && recognitionRef.current === recognition) {
        try {
          lastFinalRef.current = []
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

  // Clears one page's results and puts the reading position at its first word
  function resetPage(target) {
    const { states, heard } = progressRef.current
    const nextStates = { ...states }
    const nextHeard = { ...heard }
    for (let n = target.start; n < target.end; n++) {
      delete nextStates[n]
      delete nextHeard[n]
    }
    lastFinalRef.current = []
    setTranscript('')
    commit({ pointer: target.start, states: nextStates, heard: nextHeard, misses: 0 })
  }

  function goToPage(index) {
    const target = built?.pages[index]
    if (!target) return
    audioRef.current?.pause()
    setPlayingAyah(null)
    setPageIndex(index)
    resetPage(target)
  }

  // For when the last word was never recognised: closes the page and flags
  // every word that was not followed
  function finishPage() {
    if (!page) return
    const { states, heard } = progressRef.current
    const nextStates = { ...states }
    for (let n = page.start; n < page.end; n++) {
      if (!nextStates[n]) nextStates[n] = 'review'
    }
    commit({ pointer: page.end, states: nextStates, heard: { ...heard }, misses: 0 })
  }

  function playAyah(target) {
    if (!target.audio) {
      setError('الصوت غير متاح لهذه الآية حالياً.')
      return
    }

    const id = target.ayahNumber
    if (playingAyah === id) {
      audioRef.current?.pause()
      setPlayingAyah(null)
      return
    }

    if (!audioRef.current) audioRef.current = new Audio()

    audioRef.current.pause()
    audioRef.current.src = target.audio
    audioRef.current.onended = () => setPlayingAyah(null)
    audioRef.current.onerror = () => {
      setPlayingAyah(null)
      setError('تعذر تشغيل الصوت. حاول مجدداً.')
    }

    audioRef.current
      .play()
      .then(() => setPlayingAyah(id))
      .catch(() => setError('تعذر تشغيل الصوت حالياً.'))
  }

  function resetPractice() {
    stopListening()
    audioRef.current?.pause()
    setPlayingAyah(null)
    setError('')
    if (page) resetPage(page)
  }

  const totalWords = built?.tokens.length ?? 0
  const matchedCount = Object.values(wordStates).filter((s) => s === 'match').length
  const progress = totalWords ? Math.round((matchedCount / totalWords) * 100) : 0

  // Spell check of the current page
  const report = useMemo(() => {
    if (!page) return null
    let matched = 0
    let pending = 0
    const review = []
    page.tokens.forEach((token, i) => {
      const state = wordStates[page.start + i]
      if (state === 'match') matched += 1
      else if (state === 'review') {
        review.push({ text: token.text, heard: wordHeard[page.start + i] })
      } else pending += 1
    })
    const total = page.tokens.length
    return {
      total,
      matched,
      pending,
      review,
      percent: total ? Math.round((matched / total) * 100) : 0,
      complete: pointer >= page.end,
    }
  }, [page, wordStates, wordHeard, pointer])

  const showReport = report && report.matched + report.review.length > 0
  const lastPage = built ? pageIndex >= built.pages.length - 1 : true
  const bigButton = simpleMode ? 'min-h-14 text-lg font-bold' : 'min-h-12 font-semibold'

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

          {surah && (
            <p className="mt-2 text-slate-500">
              {surah.name ? `${surah.name} — ` : ''}
              {surah.numberOfAyahs} آيات
            </p>
          )}

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

        {built && page && (
          <>
            <section
              aria-label="أدوات القراءة"
              className="mb-6 rounded-2xl bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
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
                  إعادة هذه الصفحة
                </button>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span>اللهجة</span>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    disabled={listening}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-50"
                  >
                    {DIALECTS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                  <span>المتابعة التقريبية للسورة</span>
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
              <div className="mb-6 rounded-2xl bg-emerald-50 p-5">
                <p className="mb-4 text-center text-lg font-bold text-emerald-950">
                  الصفحة {pageIndex + 1} من {built.pages.length}
                </p>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={pageIndex === 0}
                    onClick={() => goToPage(pageIndex - 1)}
                    className={`${bigButton} rounded-xl bg-white px-5 text-emerald-900 shadow-sm disabled:opacity-40`}
                  >
                    الصفحة السابقة
                  </button>

                  <button
                    type="button"
                    disabled={lastPage}
                    onClick={() => goToPage(pageIndex + 1)}
                    className={`${bigButton} rounded-xl px-5 text-white disabled:opacity-40 ${
                      report?.complete ? 'bg-emerald-800 ring-4 ring-emerald-300' : 'bg-emerald-700'
                    }`}
                  >
                    الصفحة التالية
                  </button>
                </div>
              </div>

              {built.bismillah && pageIndex === 0 && (
                <p className="mb-6 text-center text-2xl leading-[2.2] text-emerald-900 sm:text-3xl">
                  {built.bismillah}
                </p>
              )}

              <article className="rounded-2xl border border-slate-100 p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                    {page.lastAyahNumber && page.lastAyahNumber !== page.ayahNumber
                      ? `الآيات ${page.ayahNumber} - ${page.lastAyahNumber}`
                      : `الآية ${page.ayahNumber}`}
                    {` — الصفحة ${page.part} من ${page.parts}`}
                  </span>

                  <button
                    type="button"
                    onClick={() => playAyah(page)}
                    aria-label={
                      playingAyah === page.ayahNumber ? 'إيقاف التلاوة' : 'استماع إلى الآية'
                    }
                    className="rounded-xl p-3 text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                  >
                    {playingAyah === page.ayahNumber ? <Pause size={21} /> : <Play size={21} />}
                  </button>
                </div>

                <p className="text-right text-2xl leading-[2.4] sm:text-3xl">
                  {page.tokens.map((token, i) => {
                    const state = wordStates[page.start + i]
                    return (
                      <span
                        key={`${page.key}-${i}`}
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

              {showReport && (
                <div
                  className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"
                  aria-live="polite"
                >
                  <div className="mb-3 flex items-center gap-2 font-bold text-emerald-950">
                    <SpellCheck size={20} className="text-emerald-700" />
                    {report.complete ? 'نتيجة فحص الصفحة' : 'فحص مبدئي للصفحة'}
                  </div>

                  <p className="text-sm leading-7 text-slate-700">
                    تطابقت {report.matched} من {report.total} كلمة ({report.percent}%)
                    {report.pending > 0 && ` — لم تتم متابعة ${report.pending} كلمة بعد`}
                    {report.complete && report.review.length === 0 && ' — قراءة ممتازة'}
                  </p>

                  {report.review.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {report.review.map((item, i) => (
                        <li
                          key={`${item.text}-${i}`}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-2 text-sm"
                        >
                          <span className="text-lg text-amber-900">{item.text}</span>
                          <span className="text-slate-500">
                            {item.heard ? `سُمعت: ${item.heard}` : 'لم تُسمع بوضوح'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!report.complete && (
                    <button
                      type="button"
                      onClick={finishPage}
                      className="mt-4 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
                    >
                      أنهيت الصفحة
                    </button>
                  )}
                </div>
              )}
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